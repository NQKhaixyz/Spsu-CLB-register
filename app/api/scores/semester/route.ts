import { syncWeeks } from "../../../../lib/club";
import { getNativeUserWithClub } from "../../../../lib/native-auth";
import { publishedSemesterScores } from "../../../../lib/semester-scores";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem điểm" }, 401);
    if (!user.member.active) return json({ error: "Tài khoản đã ngừng hoạt động" }, 403);
    syncWeeks(user.club);
    return json({ report: publishedSemesterScores(user.club) });
  } catch (error) {
    console.error("scores:semester", error);
    return json({ error: "Không tải được bảng điểm học kỳ" }, 500);
  }
}
