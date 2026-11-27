import { env } from "cloudflare:workers";
import { avatarKey, avatarPhotoId, maxAvatarBytes } from "../../../lib/avatar";
import { syncWeeks } from "../../../lib/club";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { deleteQueuedPhotos, queuePhotoDeletions } from "../../../lib/photo-deletion";
import { photoResponse, privatePhotoHeaders, readPhoto, verifyOrigin } from "../../../lib/photo-upload";
import { readState } from "../../../lib/store";
import { workspaceView } from "../../../lib/workspace-view";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privatePhotoHeaders });
const changed = () => new AuthError("Ảnh đại diện vừa thay đổi, vui lòng thử lại", 409);

function photoError(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status);
  console.error("avatar", error);
  return json({ error: "Chưa xử lý được ảnh đại diện, vui lòng thử lại" }, 500);
}

async function signedIn(request: Request) {
  const user = await getNativeUserWithClub(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập", 401);
  const { DB: db, BUCKET: bucket } = env;
  if (!db || !bucket) throw new AuthError("Chưa kết nối được kho ảnh, vui lòng thử lại", 503);
  return { user, db, bucket };
}

export async function GET(request: Request) {
  try {
    const { user, bucket } = await signedIn(request);
    const id = new URL(request.url).searchParams.get("photo");
    if (!id || !avatarPhotoId.test(id) || !user.club.members.some(member => member.avatarId === id)) {
      return json({ error: "Ảnh đại diện không còn khả dụng" }, 404);
    }
    const photo = await bucket.get(avatarKey(id));
    return photo ? photoResponse(photo.body) : json({ error: "Ảnh đại diện không còn khả dụng" }, 404);
  } catch (error) {
    return photoError(error);
  }
}

async function changeAvatar(request: Request, upload: boolean) {
  try {
    verifyOrigin(request);
    const { user, db, bucket } = await signedIn(request);
    const previous = new URL(request.url).searchParams.get("replace");
    const bytes = upload
      ? await readPhoto(request, { maxBytes: maxAvatarBytes, tooLarge: "Ảnh đại diện vượt quá 256 KB" })
      : null;
    if (previous !== (user.member.avatarId ?? null)) throw changed();
    if (!upload && !previous) return json(workspaceView(user.club, user, user.revision));
    const id = bytes ? crypto.randomUUID() : null;

    let saved: Awaited<ReturnType<typeof readState>> | undefined;
    try {
      if (id && bytes) {
        const photo = await bucket.put(avatarKey(id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
        if (!photo) throw new AuthError("Chưa lưu được ảnh đại diện, vui lòng thử lại", 503);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const { club, revision } = attempt === 0 ? user : await readState(user.userId, false);
        const member = club.members.find(item => item.id === user.member.id && item.userId === user.userId);
        if (!member?.active) throw new AuthError("Vui lòng đăng nhập lại", 401);
        if ((member.avatarId ?? null) !== previous) throw changed();
        if (id) member.avatarId = id;
        else delete member.avatarId;
        syncWeeks(club);
        const payload = JSON.stringify(club);
        const update = db.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=?")
          .bind(payload, revision);
        const results = await db.batch(previous
          ? [update, queuePhotoDeletions(db, [avatarKey(previous)], revision + 1, payload)]
          : [update]);
        if (results[0].meta.changes) {
          saved = { club, revision: revision + 1 };
          break;
        }
      }
      if (!saved) throw changed();
    } catch (error) {
      if (id) {
        try {
          // A storage timeout can follow a successful commit. Check the reference
          // before removing the uniquely staged file.
          const { club } = await readState(user.userId, false);
          if (!club.members.some(member => member.avatarId === id)) {
            await db.prepare("INSERT OR IGNORE INTO pending_photo_deletion(key) VALUES (?)").bind(avatarKey(id)).run();
            await deleteQueuedPhotos(bucket, db);
          }
        } catch (cleanupError) {
          console.error("avatar:staging-cleanup", cleanupError);
        }
      }
      throw error;
    }

    if (previous) {
      await deleteQueuedPhotos(bucket, db).catch(error => console.error("avatar:queued-cleanup", error));
    }
    return json(workspaceView(saved.club, user, saved.revision));
  } catch (error) {
    return photoError(error);
  }
}

export function POST(request: Request) {
  return changeAvatar(request, true);
}

export function DELETE(request: Request) {
  return changeAvatar(request, false);
}
