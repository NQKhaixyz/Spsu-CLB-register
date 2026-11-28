import { creditExchangeView, exchangeMonthlyCredits, parseCreditExchange } from "../../../../lib/credit-exchange";
import { GameRuleError } from "../../../../lib/games";
import { getNativeUserWithClub } from "../../../../lib/native-auth";
import { AuthError } from "../../../../lib/password";
import { readBody, verifyOrigin } from "../../../../lib/photo-upload";
import { mutate } from "../../../../lib/store";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để đổi điểm" }, 401);
    if (user.member.role !== "member") return json({ error: "Đổi điểm dành cho tài khoản thành viên" }, 403);
    return json(creditExchangeView(user.club, user.member));
  } catch {
    return json({ error: "Chưa tải được điểm tháng" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để đổi điểm" }, 401);
    verifyOrigin(request);
    const body = await readBody(request, "application/json", 1_500, "Thông tin đổi điểm chưa hợp lệ");
    let input: unknown;
    try { input = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: "Thông tin đổi điểm chưa hợp lệ" }, 400); }
    const command = parseCreditExchange(input);
    const { result } = await mutate(user.userId, club => {
      const member = club.members.find(row => row.id === user.member.id && row.userId === user.userId && row.active);
      if (!member) throw new AuthError("Vui lòng đăng nhập để đổi điểm", 401);
      const receipt = exchangeMonthlyCredits(club, member, command, Date.now());
      return { ...creditExchangeView(club, member), receipt };
    });
    return json(result);
  } catch (error) {
    if (error instanceof GameRuleError || error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: "Chưa lưu được lượt đổi điểm, vui lòng thử lại" }, 503);
  }
}
