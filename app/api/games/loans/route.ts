import { applyCreditLoanCommand, creditLoanView, GameRuleError, parseCreditLoanCommand } from "../../../../lib/games";
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
    if (!user) return json({ error: "Vui lòng đăng nhập để xem khoản vay" }, 401);
    return json(creditLoanView(user.club, user.member.id, user.revision));
  } catch {
    return json({ error: "Chưa tải được khoản vay credits" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để vay hoặc trả nợ" }, 401);
    verifyOrigin(request);
    const bytes = await readBody(request, "application/json", 1_500, "Thao tác vay hoặc trả nợ không hợp lệ");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Thao tác vay hoặc trả nợ không hợp lệ" }, 400);
    }
    const command = parseCreditLoanCommand(body);
    const at = Date.now();
    const { club, revision, result: requestedCupidLoan } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active))
        throw new AuthError("Vui lòng đăng nhập để vay hoặc trả nợ", 401);
      return applyCreditLoanCommand(current, user.member.id, command, at);
    });
    return json({ ...creditLoanView(club, user.member.id, revision), requestedCupidLoan });
  } catch (error) {
    if (error instanceof GameRuleError || error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: "Chưa lưu được giao dịch credits, vui lòng thử lại" }, 503);
  }
}
