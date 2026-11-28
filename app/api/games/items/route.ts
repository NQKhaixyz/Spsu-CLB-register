import { env } from "cloudflare:workers";
import {
  creditItemHistoryPage, creditItemReceiptView, ensureCreditItemReceipts, readCreditItemReceipt, savedCreditItemView,
} from "../../../../lib/credit-item-receipts";
import {
  applyCreditItemCommand, creditItemsView, drawHammerPercent, GameRuleError, parseCreditItemCommand,
} from "../../../../lib/games";
import { getNativeUserWithClub } from "../../../../lib/native-auth";
import { AuthError, tokenHash } from "../../../../lib/password";
import { readBody, verifyOrigin } from "../../../../lib/photo-upload";
import { readState, writeState } from "../../../../lib/store";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const signIn = "Vui lòng đăng nhập để dùng vật phẩm";

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: signIn }, 401);
    const requested = new URL(request.url).searchParams.get("before");
    const before = requested === null ? undefined : Number(requested);
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
      return json({ error: "Vị trí lịch sử không hợp lệ" }, 400);
    const db = env.DB!;
    await ensureCreditItemReceipts(db);
    const memberId = user.member.id;
    const history = await creditItemHistoryPage(db, user.club, memberId, user.revision, before);
    return json({ ...creditItemsView(user.club, memberId, user.revision, Date.now()), history });
  } catch {
    return json({ error: "Chưa tải được vật phẩm" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: signIn }, 401);
    verifyOrigin(request);
    const bytes = await readBody(request, "application/json", 1_500, "Thao tác mua vật phẩm không hợp lệ");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Thao tác mua vật phẩm không hợp lệ" }, 400);
    }
    const command = parseCreditItemCommand(body);
    const commandHash = await tokenHash(JSON.stringify(command));
    const db = env.DB!;
    await ensureCreditItemReceipts(db);
    const memberId = user.member.id;
    const roll = command.kind === "hammer" ? drawHammerPercent() : 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = attempt === 0 ? user : await readState(user.userId, false);
      if (!state.club.members.some(member => member.id === memberId && member.userId === user.userId && member.active))
        return json({ error: signIn }, 401);
      const saved = await readCreditItemReceipt(db, command.operationId);
      if (saved) {
        if (saved.ownerId !== memberId || saved.commandHash !== commandHash)
          return json({ error: "Mã giao dịch đã được sử dụng" }, 409);
        const current = state.revision < saved.revision ? await readState(user.userId, false) : state;
        return json({ ...creditItemsView(current.club, memberId, current.revision, Date.now()),
          receipt: savedCreditItemView(current.club, saved) });
      }

      const targetMemberId = command.kind === "hammer" ? command.targetMemberId : undefined;
      const result = applyCreditItemCommand(state.club, memberId, command, Date.now(), roll);
      if (await writeState(state.club, state.revision, [], { operationId: command.operationId, memberId, targetMemberId, commandHash, result }))
        return json({ ...creditItemsView(state.club, memberId, state.revision + 1, Date.now()),
          receipt: creditItemReceiptView(state.club, command.operationId, result, targetMemberId) });
    }
    return json({ error: "Ví đang được cập nhật. Hãy thử lại cùng giao dịch" }, 503);
  } catch (error) {
    if (error instanceof GameRuleError || error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: "Chưa xác nhận được giao dịch vật phẩm" }, 503);
  }
}
