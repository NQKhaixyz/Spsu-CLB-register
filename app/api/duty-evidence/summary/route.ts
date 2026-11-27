import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { dutyEvidence } from "../../../../db/schema";
import { addDays, weekId } from "../../../../lib/club";
import { evidenceExpiry, findEvidenceAssignment, type DutyEvidenceSummary } from "../../../../lib/duty-evidence";
import { getNativeUserWithClub } from "../../../../lib/native-auth";
import { privatePhotoHeaders } from "../../../../lib/photo-upload";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privatePhotoHeaders });

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem minh chứng" }, 401);
    const week = new URL(request.url).searchParams.get("week") ?? "";
    const date = new Date(week + "T12:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== week || weekId(week) !== week) {
      return json({ error: "Tuần trực không hợp lệ" }, 400);
    }
    const result: DutyEvidenceSummary = { week, rows: [] };
    const expiresAt = evidenceExpiry(week);
    if (Date.now() >= expiresAt) return json(result);

    const { club, member } = user;
    const evidence = await getDb().select({
      shiftId: dutyEvidence.shiftId, memberId: dutyEvidence.memberId, status: dutyEvidence.status,
    }).from(dutyEvidence).where(and(eq(dutyEvidence.expiresAt, expiresAt),
      member.role === "admin" ? eq(dutyEvidence.status, "pending") : eq(dutyEvidence.memberId, member.id))).all();

    const months = [...new Set([week.slice(0, 7), addDays(week, 6).slice(0, 7)])];
    for (const row of evidence) {
      for (const month of months) {
        const shift = findEvidenceAssignment(club, member, { month, ...row });
        if (shift && weekId(shift.date) === week) {
          result.rows.push({ month, ...row });
          break;
        }
      }
    }
    return json(Date.now() < expiresAt ? result : { week, rows: [] });
  } catch (error) {
    console.error("duty-evidence:summary", error);
    return json({ error: "Chưa tải được trạng thái minh chứng" }, 500);
  }
}
