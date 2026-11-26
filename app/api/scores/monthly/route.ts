import { syncWeeks } from "../../../../lib/club";
import { getNativeUserWithClub } from "../../../../lib/native-auth";
import { monthlyScoreboard } from "../../../../lib/workspace-view";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem điểm." }, 401);
    const month = new URL(request.url).searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      return json({ error: "Tháng không hợp lệ." }, 400);
    syncWeeks(user.club);
    return json({ month, rows: monthlyScoreboard(user.club, month) });
  } catch (error) {
    console.error("scores:monthly", error);
    return json({ error: "Không tải được bảng điểm tháng. Vui lòng thử lại." }, 500);
  }
}
