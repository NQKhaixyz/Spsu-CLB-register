import { env } from "cloudflare:workers";
import { canManageBulletin, canReadBulletin, isBulletinId } from "../../../lib/bulletin";
import {
  bulletinByteRange, bulletinDocumentLimitMb, bulletinDocumentName, bulletinDocumentType, bulletinMediaByteLimit,
  bulletinMediaKey, bulletinMediaLimit, bulletinStageMs, bulletinVideoLimitMb,
  isBulletinDocument, isBulletinMediaId, isBulletinMediaType, validBulletinDocumentPrefix, type BulletinMedia, type BulletinVideoType,
} from "../../../lib/bulletin-media";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readPhoto, privatePhotoHeaders, verifyOrigin } from "../../../lib/photo-upload";
import { mutate, readState } from "../../../lib/store";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privatePhotoHeaders });
const notFound = () => new AuthError("Tệp đính kèm không còn khả dụng", 404);

function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status);
  console.error("bulletin-media", error);
  return json({ error: "Chưa xử lý được tệp đính kèm, vui lòng thử lại" }, 500);
}

async function context(request: Request) {
  const user = await getNativeUserWithClub(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập", 401);
  if (!env.BUCKET) throw new AuthError("Kho tệp chưa được kết nối, vui lòng thử lại", 503);
  const search = new URL(request.url).searchParams;
  const postId = search.get("postId");
  if (!isBulletinId(postId)) throw notFound();
  return { user, bucket: env.BUCKET, postId, search };
}

async function serve(request: Request, head = false) {
  try {
    const { user, bucket, postId, search } = await context(request);
    const id = search.get("id");
    if (!isBulletinMediaId(id)) throw notFound();
    const post = user.club.bulletinPosts?.find(item => item.id === postId);
    if (!post || !canReadBulletin(post, user.member, Date.now())) throw notFound();
    const file = post.media?.find(item => item.id === id);
    if (!file) throw notFound();
    const key = bulletinMediaKey(file.id);
    const headers = new Headers({
      ...privatePhotoHeaders,
      "Content-Type": file.type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Accept-Ranges": "bytes",
    });
    if (isBulletinDocument(file.type)) {
      const filename = encodeURIComponent(file.name ?? "Tai-lieu").replace(/['()*]/g, character =>
        "%" + character.charCodeAt(0).toString(16).toUpperCase());
      const disposition = file.type === "application/pdf" && search.get("preview") === "1" ? "inline" : "attachment";
      headers.set("Content-Disposition", disposition + "; filename*=UTF-8''" + filename);
    }
    if (head) {
      if (!await bucket.head(key)) throw notFound();
      headers.set("Content-Length", String(file.bytes));
      return new Response(null, { headers });
    }
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? bulletinByteRange(rangeHeader, file.bytes) : null;
    if (rangeHeader && !range) {
      headers.set("Content-Range", `bytes */${file.bytes}`);
      return new Response(null, { status: 416, headers });
    }
    const object = await bucket.get(key, range ? { range } : undefined);
    if (!object) throw notFound();
    headers.set("Content-Length", String(range?.length ?? file.bytes));
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${file.bytes}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    const response = failure(error);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
}

export const GET = (request: Request) => serve(request);
export const HEAD = (request: Request) => serve(request, true);

async function uploadPrefix(request: Request) {
  // Inspect a small prefix on the cloned stream, so the original upload can
  // be streamed to R2 without buffering the complete video in the worker.
  const reader = request.clone().body!.getReader();
  const prefix = new Uint8Array(12);
  let offset = 0;
  try {
    while (offset < prefix.length) {
      const part = await reader.read();
      if (part.done) break;
      const bytes = part.value.subarray(0, prefix.length - offset);
      prefix.set(bytes, offset);
      offset += bytes.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return prefix.subarray(0, offset);
}

function validateVideo(prefix: Uint8Array, type: BulletinVideoType) {
  const valid = type === "video/webm"
    ? prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3
    : ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(new TextDecoder().decode(prefix.subarray(4, 8)));
  if (prefix.length < 12 || !valid) throw new AuthError("Tệp video không hợp lệ, hãy chọn MP4, WebM hoặc MOV", 415);
}

function documentName(request: Request, type: string) {
  let name = "";
  try {
    name = bulletinDocumentName(decodeURIComponent(request.headers.get("X-Upload-Name") ?? ""));
  } catch {
    throw new AuthError("Tên tài liệu không hợp lệ", 400);
  }
  if (!name || name.length > 255 || bulletinDocumentType(name) !== type)
    throw new AuthError("Chọn tài liệu PDF, Word, Excel hoặc PowerPoint đúng định dạng", 415);
  return name;
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { user, bucket, postId } = await context(request);
    const existing = user.club.bulletinPosts?.find(post => post.id === postId);
    if (existing && !canManageBulletin(user.club, existing, user.member)) throw new AuthError("Bạn chỉ có thể sửa bản tin của mình", 403);
    const type = request.headers.get("content-type")?.split(";")[0];
    if (!isBulletinMediaType(type) || !request.body) throw new AuthError("Chọn ảnh, video MP4, WebM, MOV hoặc tài liệu PDF, Word, Excel hay PowerPoint", 415);
    const bytes = Number(request.headers.get("x-upload-size"));
    const declared = request.headers.get("content-length");
    if (!Number.isSafeInteger(bytes) || bytes < 1 || (declared !== null && Number(declared) !== bytes))
      throw new AuthError("Kích thước tệp không hợp lệ", 400);
    const document = isBulletinDocument(type);
    if (bytes > bulletinMediaByteLimit(type)) {
      const message = type === "image/jpeg" ? "Ảnh vượt quá 2 MB"
        : document ? `Tài liệu vượt quá ${bulletinDocumentLimitMb} MB` : `Video vượt quá ${bulletinVideoLimitMb} MB`;
      throw new AuthError(message, 413);
    }
    const name = document ? documentName(request, type) : undefined;
    const photo = type === "image/jpeg" ? await readPhoto(request) : undefined;
    if (type !== "image/jpeg") {
      const prefix = await uploadPrefix(request);
      if (document) {
        if (!validBulletinDocumentPrefix(prefix, type)) throw new AuthError("Nội dung tệp không đúng định dạng tài liệu", 415);
      } else validateVideo(prefix, type);
    }
    if (photo && photo.length !== bytes) throw new AuthError("Tệp ảnh bị thiếu dữ liệu", 400);

    const file: BulletinMedia = { id: crypto.randomUUID(), type, bytes, ...(name ? { name } : {}) };
    const key = bulletinMediaKey(file.id);
    await mutate(user.userId, club => {
      const member = club.members.find(item => item.userId === user.userId && item.id === user.member.id);
      if (!member?.active) throw new AuthError("Vui lòng đăng nhập lại", 401);
      const post = club.bulletinPosts?.find(item => item.id === postId);
      if (post && !canManageBulletin(club, post, member)) throw new AuthError("Bạn chỉ có thể sửa bản tin của mình", 403);
      const staged = club.bulletinUploads ??= [];
      if (staged.filter(item => item.uploaderId === member.id).length >= bulletinMediaLimit * 4)
        throw new AuthError("Có nhiều tệp chưa dùng, hãy lưu bài hiện tại rồi thử lại", 429);
      staged.push({ ...file, postId, uploaderId: member.id, expiresAt: Date.now() + bulletinStageMs });
    });
    try {
      const options = { httpMetadata: { contentType: type } };
      if (photo) {
        if (!await bucket.put(key, photo, options)) throw new Error("Unable to store bulletin photo");
      } else {
        const stream = new FixedLengthStream(bytes);
        const controller = new AbortController();
        try {
          const [object] = await Promise.all([
            bucket.put(key, stream.readable, options),
            request.body.pipeTo(stream.writable, { signal: controller.signal }),
          ]);
          if (!object) throw new Error("Unable to store bulletin attachment");
        } catch (error) {
          controller.abort();
          throw error;
        }
      }
      const { club } = await readState(user.userId, false);
      if (!club.bulletinUploads?.some(upload => upload.id === file.id && upload.expiresAt > Date.now()))
        throw new AuthError("Tệp đã hết hạn, vui lòng chọn lại", 409);
      return json(file, 201);
    } catch (error) {
      // The unique ID hasn't been returned to a client, so it cannot have been attached.
      await mutate(user.userId, club => {
        club.bulletinUploads = club.bulletinUploads?.filter(upload => upload.id !== file.id);
      }).catch(cleanupError => console.error("bulletin-media:release", cleanupError));
      await bucket.delete(key).catch(cleanupError => console.error("bulletin-media:delete", cleanupError));
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
