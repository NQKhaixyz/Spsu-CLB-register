import { weekId } from "../../../../lib/club";
import { AuthError, tokenHash } from "../../../../lib/password";
import { DUTY_RESET_WEEK, inspectDutyWeekReset, runDutyWeekReset } from "../../../../lib/duty-week-reset";

export const dynamic = "force-dynamic";

// Only the hash of the operation-specific token is deployed, never the token.
const verifier = "75dadc53f9f6cc88b655ae3d1640f45b6d02674493513628cdcab0a41096359f";
const json = (payload: object, status = 200) =>
  Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const token = request.headers.get("X-Nhip-Week-Reset");
  if (!token || !/^[a-f0-9]{64}$/.test(token) || await tokenHash(token) !== verifier)
    return json({ error: "Không có quyền thực hiện thao tác này." }, 403);
  if (weekId() !== DUTY_RESET_WEEK)
    return json({ error: "Thao tác dọn lịch tuần này đã hết hạn." }, 410);

  try {
    const data = await request.json() as { action?: string; revision?: number };
    if (data?.action === "inspect") return json(await inspectDutyWeekReset());
    if (data?.action === "apply" && typeof data.revision === "number" && Number.isSafeInteger(data.revision))
      return json(await runDutyWeekReset(data.revision));
    return json({ error: "Yêu cầu dọn lịch không hợp lệ." }, 400);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: "Chưa xác nhận được thao tác dọn lịch." }, 500);
  }
}
