import { env } from "cloudflare:workers";
import { eventContributionError, isPointAmount, reviewEventRegistration } from "../../../lib/activity";
import { eventEvidenceTarget, eventEvidenceView, eventPhotoId } from "../../../lib/event-evidence";
import { eventPhotoKey, eventPhotoStagingMs, removeEventPhoto } from "../../../lib/event-photo-storage";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { photoResponse, privatePhotoHeaders, readBody, readPhoto, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privatePhotoHeaders });
const changed = () => new AuthError("Minh chứng vừa thay đổi. Mở lại để xem bản mới.", 409);

async function context(request: Request) {
  const user = await getNativeUserWithClub(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập.", 401);
  const search = new URL(request.url).searchParams;
  const registrationId = search.get("registrationId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(registrationId)) throw new AuthError("Đăng ký sự kiện không hợp lệ.", 400);
  const target = eventEvidenceTarget(user.club, user.member, registrationId);
  if (!target) throw new AuthError("Bạn không có quyền xem minh chứng này.", 403);
  const bucket = env.BUCKET;
  if (!bucket) throw new AuthError("Kho ảnh chưa được kết nối. Vui lòng thử lại sau.", 503);
  return { user, registrationId, search, bucket, view: eventEvidenceView(target.row, target.event, user.member) };
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status);
  console.error("event-evidence", error);
  return json({ error: "Chưa xử lý được minh chứng. Vui lòng thử lại." }, 500);
}

export async function GET(request: Request) {
  try {
    const { view, search, bucket } = await context(request);
    const photo = search.get("photo");
    if (photo === null) return json(view);
    if (!eventPhotoId.test(photo) || view.expired || view.evidence?.id !== photo) {
      throw new AuthError("Ảnh không còn khả dụng.", 404);
    }
    const object = await bucket.get(eventPhotoKey(photo));
    if (!object || Date.now() >= view.expiresAt) throw new AuthError("Ảnh không còn khả dụng.", 404);
    return photoResponse(object.body);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { user, view, search, bucket, registrationId } = await context(request);
    if (view.expired) throw new AuthError("Đã hết hạn gửi minh chứng.", 410);
    if (!view.canUpload) throw new AuthError("Đăng ký này không nhận thêm ảnh.", 409);
    const expected = search.get("replace");
    if (expected !== (view.evidence?.id ?? null)) throw changed();
    const bytes = await readPhoto(request);
    const id = crypto.randomUUID();
    const stagedAt = Date.now();
    if (stagedAt >= view.expiresAt) throw new AuthError("Đã hết hạn gửi minh chứng.", 410);
    const object = await bucket.put(eventPhotoKey(id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
    if (!object) throw new AuthError("Chưa lưu được ảnh. Vui lòng thử lại.", 503);
    try {
      const { result } = await mutate(user.userId, club => {
        const member = club.members.find(item => item.userId === user.userId);
        const target = member && eventEvidenceTarget(club, member, registrationId);
        if (!member || !target) throw changed();
        const { row, event } = target;
        const now = Date.now();
        const current = eventEvidenceView(row, event, member, now);
        if (current.expired) throw new AuthError("Đã hết hạn gửi minh chứng.", 410);
        if (!current.canUpload || (current.evidence?.id ?? null) !== expected || now >= stagedAt + eventPhotoStagingMs) throw changed();
        row.evidence = { id, submittedAt: now };
        row.status = "pending";
        delete row.contributionPoints;
        delete row.reviewedAt;
        delete row.reviewedBy;
        delete row.decision;
        return eventEvidenceView(row, event, member, now);
      });
      if (expected) await removeEventPhoto(bucket, expected);
      return json(result);
    } catch (error) {
      // On a storage error, the write could have landed. Cleanup checks actual references.
      if (error instanceof AuthError) await removeEventPhoto(bucket, id);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    verifyOrigin(request);
    const { user, view, bucket, registrationId } = await context(request);
    if (user.member.role !== "admin") throw new AuthError("Chỉ BĐH được duyệt minh chứng.", 403);
    if (view.expired) throw new AuthError("Đã hết hạn duyệt minh chứng.", 410);
    const bytes = await readBody(request, "application/json", 8192, "Ghi chú quá dài.");
    let input: { id?: unknown; status?: unknown; note?: unknown; contributionPoints?: unknown } | null;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AuthError("Kết quả duyệt không hợp lệ.", 400);
    }
    const { id, status, note, contributionPoints } = input ?? {};
    if (typeof id !== "string" || !eventPhotoId.test(id) || (status !== "approved" && status !== "rejected")) {
      throw new AuthError("Kết quả duyệt không hợp lệ.", 400);
    }
    const reason = typeof note === "string" ? note.trim().slice(0, 500) : "";
    if (status === "rejected" && !reason) throw new AuthError("Nhập lý do từ chối.", 400);
    if (!view.canReview || view.evidence?.id !== id || !await bucket.head(eventPhotoKey(id))) throw changed();

    const { result } = await mutate(user.userId, club => {
      const member = club.members.find(item => item.userId === user.userId);
      if (!member?.active || member.role !== "admin") throw new AuthError("Chỉ BĐH được duyệt minh chứng.", 403);
      const target = eventEvidenceTarget(club, member, registrationId);
      if (!target) throw changed();
      const { row, event } = target;
      const current = eventEvidenceView(row, event, member);
      if (current.expired) throw new AuthError("Đã hết hạn duyệt minh chứng.", 410);
      if (!current.canReview || current.evidence?.id !== id) throw changed();
      if (status === "approved" && current.requiresContributionPoints && !isPointAmount(contributionPoints)) {
        throw new AuthError(eventContributionError, 400);
      }
      reviewEventRegistration(club, member, { id: row.id, confirmed: status === "approved", reason, contributionPoints }, text => {
        club.logs.unshift({ at: new Date().toISOString(), actor: member.name, actorId: member.id, text });
        club.logs = club.logs.slice(0, 2000);
      }, id);
      return eventEvidenceView(row, event, member);
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
