import { env } from "cloudflare:workers";
import { creditHistoryPage } from "../../../../lib/credit-history";
import { creditWalletBalance } from "../../../../lib/games";
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
    const cursor = before === null ? undefined : Number(before);
    if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 1))
      return json({ error: "Vị trí lịch sử không hợp lệ" }, 400);
    const page = await creditHistoryPage(env.DB!, memberId, user.revision, cursor);
    return json({ ...page, balanceCents: creditWalletBalance(user.club, memberId), recordedSince: user.club.games?.creditHistorySince });
  } catch {
    return json({ error: "Chưa tải được lịch sử credits" }, 503);
  }
}
