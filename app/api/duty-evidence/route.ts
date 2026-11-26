import { env } from "cloudflare:workers";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { clubState, dutyEvidence } from "../../../db/schema";
import { evidenceExpiry, evidenceSubmissionOpen, findEvidenceAssignment, type DutyEvidence, type DutyEvidenceView } from "../../../lib/duty-evidence";
import { dutyPhotoKey } from "../../../lib/duty-photo-storage";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { photoResponse, privatePhotoHeaders, readBody, readPhoto, verifyOrigin } from "../../../lib/photo-upload";
import { readState } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privatePhotoHeaders });
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const imageIdPattern = /^[0-9a-f-]{36}$/i;

async function context(request: Request) {
  const user = await getNativeUserWithClub(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập.", 401);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? "";
  const shiftId = searchParams.get("shiftId") ?? "";
  const memberId = searchParams.get("memberId") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !idPattern.test(shiftId) || !idPattern.test(memberId)) {
    throw new AuthError("Ca trực hoặc thành viên không hợp lệ.", 400);
  }
  const { club, member, revision } = user;
  const shift = findEvidenceAssignment(club, member, { month, shiftId, memberId });
  if (!shift) throw new AuthError("Bạn không có quyền xem minh chứng ca này.", 403);
  const bucket = env.BUCKET;
  if (!bucket) throw new AuthError("Kho ảnh chưa được kết nối. Vui lòng thử lại sau.", 503);

  const db = getDb();
  const now = new Date();
  const expiresAt = evidenceExpiry(shift.date);
  const expired = now.getTime() >= expiresAt;
  const evidence = await db.select({
    id: dutyEvidence.id, status: dutyEvidence.status, submittedAt: dutyEvidence.submittedAt,
    expiresAt: dutyEvidence.expiresAt, reviewedAt: dutyEvidence.reviewedAt, reviewNote: dutyEvidence.reviewNote,
  }).from(dutyEvidence).where(and(
    eq(dutyEvidence.shiftId, shift.id), eq(dutyEvidence.memberId, memberId),
  )).get() ?? null;
  const view: DutyEvidenceView = {
    evidence, expiresAt, expired,
    canUpload: member.id === memberId && evidence?.status !== "approved" && evidenceSubmissionOpen(shift, now),
    canReview: member.role === "admin" && !expired && evidence?.status === "pending",
  };
  return { member, revision, userId: user.userId, target: { month, shiftId, memberId }, shift, expiresAt, view, bucket, db, searchParams };
}

const sameSchedule = (revision: number) =>
  sql`EXISTS (SELECT 1 FROM ${clubState} WHERE id='main' AND revision=${revision})`;

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status);
  console.error("duty-evidence", error);
  return json({ error: "Chưa xử lý được minh chứng. Vui lòng thử lại." }, 500);
}

async function removePhoto(bucket: R2Bucket, key: string) {
  try {
    await bucket.delete(key);
  } catch (error) {
    // The weekly cleanup also removes unreferenced uploads.
    console.error("duty-evidence:delete", error);
  }
}

export async function GET(request: Request) {
  try {
    const { view, searchParams, bucket, shift } = await context(request);
    const photo = searchParams.get("photo");
    if (photo === null) return json(view);
    if (view.expired || view.evidence?.id !== photo) return json({ error: "Ảnh không còn khả dụng." }, 404);
    const object = await bucket.get(dutyPhotoKey(shift.date, photo));
    if (!object || Date.now() >= view.evidence.expiresAt) return json({ error: "Ảnh không còn khả dụng." }, 404);
    return photoResponse(object.body);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { view, member, userId, target, shift, expiresAt, db, bucket, searchParams } = await context(request);
    if (!view.canUpload) throw new AuthError("Ca này đã hết hạn, đã được duyệt hoặc chưa đến lúc gửi ảnh.", 409);
    const expected = searchParams.get("replace");
    if (expected !== (view.evidence?.id ?? null)) {
      throw new AuthError("Minh chứng vừa thay đổi. Mở lại để xem bản mới.", 409);
    }
    const bytes = await readPhoto(request);
    const id = crypto.randomUUID();
    const key = dutyPhotoKey(shift.date, id);
    if (Date.now() >= expiresAt) throw new AuthError("Đã sang tuần mới. Ca này đã hết hạn gửi ảnh.", 410);
    const stored = await bucket.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    if (!stored) throw new AuthError("Chưa lưu được ảnh. Vui lòng thử lại.", 503);
    const { club, revision } = await readState(userId, false);
    const currentMember = club.members.find(item => item.userId === userId);
    const currentShift = currentMember && findEvidenceAssignment(club, currentMember, target);
    const submittedAt = Date.now();
    if (!currentShift || currentShift.date !== shift.date || !evidenceSubmissionOpen(currentShift, new Date(submittedAt))) {
      await removePhoto(bucket, key);
      if (submittedAt >= expiresAt) throw new AuthError("Đã sang tuần mới. Ca này đã hết hạn gửi ảnh.", 410);
      throw new AuthError("Lịch phân công đã thay đổi. Mở lại ca trực để kiểm tra.", 409);
    }
    const evidence: DutyEvidence = {
      id, status: "pending", submittedAt, expiresAt, reviewedAt: null, reviewNote: "",
    };
    const prior = view.evidence;
    const result = prior
      ? await db.update(dutyEvidence).set({ ...evidence, reviewedBy: null }).where(and(
          eq(dutyEvidence.id, prior.id), eq(dutyEvidence.status, prior.status), gt(dutyEvidence.expiresAt, submittedAt), sameSchedule(revision),
        )).returning({ id: dutyEvidence.id }).get()
      : await db.get<{ id: string }>(sql`
          INSERT INTO duty_evidence (id,shift_id,member_id,status,submitted_at,expires_at)
          SELECT ${id},${shift.id},${target.memberId},'pending',${submittedAt},${expiresAt}
          WHERE ${sameSchedule(revision)}
          ON CONFLICT(shift_id,member_id) DO NOTHING RETURNING id
        `);
    if (!result) {
      await removePhoto(bucket, key);
      throw new AuthError("Minh chứng vừa thay đổi. Mở lại để xem bản mới.", 409);
    }
    if (prior) await removePhoto(bucket, dutyPhotoKey(shift.date, prior.id));
    return json({ ...view, evidence, canReview: member.role === "admin" } satisfies DutyEvidenceView);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    verifyOrigin(request);
    const { view, member, db, revision, expiresAt } = await context(request);
    if (member.role !== "admin") throw new AuthError("Chỉ BĐH được duyệt minh chứng.", 403);
    const bytes = await readBody(request, "application/json", 8192, "Ghi chú quá dài.");
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AuthError("Kết quả duyệt không hợp lệ.", 400);
    }
    const { id, status, note } = (input ?? {}) as { id?: unknown; status?: unknown; note?: unknown };
    if (typeof id !== "string" || !imageIdPattern.test(id) || (status !== "approved" && status !== "rejected")) {
      throw new AuthError("Kết quả duyệt không hợp lệ.", 400);
    }
    if (!view.canReview || view.evidence?.id !== id) {
      throw new AuthError("Minh chứng đã được xử lý hoặc vừa thay đổi. Mở lại để xem bản mới.", 409);
    }
    const reviewNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
    if (status === "rejected" && !reviewNote) throw new AuthError("Nhập lý do từ chối.", 400);
    const reviewedAt = Date.now();
    if (reviewedAt >= expiresAt) throw new AuthError("Ảnh đã hết hạn lưu.", 410);
    const updated = await db.update(dutyEvidence).set({ status, reviewedAt, reviewedBy: member.id, reviewNote })
      .where(and(eq(dutyEvidence.id, id), eq(dutyEvidence.status, "pending"), gt(dutyEvidence.expiresAt, reviewedAt), sameSchedule(revision)))
      .returning({ id: dutyEvidence.id }).get();
    if (!updated) throw new AuthError("Minh chứng vừa thay đổi. Mở lại để xem bản mới.", 409);
    const evidence: DutyEvidence = { ...view.evidence, status, reviewedAt, reviewNote };
    return json({ ...view, evidence, canUpload: view.canUpload && status !== "approved", canReview: false } satisfies DutyEvidenceView);
  } catch (error) {
    return errorResponse(error);
  }
}
