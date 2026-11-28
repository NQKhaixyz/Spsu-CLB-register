import { env } from "cloudflare:workers";
import { creditDebtHistoryPage, creditHistoryPage, type CreditDebtHistoryView } from "../../../../lib/credit-history";
import { creditLoanView, creditWalletBalance } from "../../../../lib/games";
import { getNativeUserWithClub } from "../../../../lib/native-auth";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem lịch sử credits" }, 401);
    const query = new URL(request.url).searchParams;
    const memberId = query.get("memberId") ?? user.member.id;
    if (!user.club.members.some(member => member.id === memberId && member.userId))
      return json({ error: "Tài khoản này chưa có ví credits" }, 404);
    const before = query.get("before");
    const debtBefore = query.get("debtBefore");
    const cursor = before === null ? undefined : Number(before);
    const debtCursor = debtBefore === null ? undefined : Number(debtBefore);
    if ([cursor, debtCursor].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 1)))
      return json({ error: "Vị trí lịch sử không hợp lệ" }, 400);
    const recordedSince = user.club.games?.creditHistorySince;
    const [page, debtHistory] = await Promise.all([
      creditHistoryPage(env.DB!, memberId, user.revision, cursor),
      creditDebtHistoryPage(env.DB!, memberId, user.revision, recordedSince ?? 0, debtCursor),
    ]);
    const { debtCents, personalDebtCents, sharedDebtCents } = creditLoanView(user.club, memberId, user.revision);
    const debt: CreditDebtHistoryView = { debtCents, personalDebtCents, sharedDebtCents, ...debtHistory };
    return json({ ...page, balanceCents: creditWalletBalance(user.club, memberId), recordedSince, debt });
  } catch {
    return json({ error: "Chưa tải được lịch sử credits" }, 503);
  }
}
