import { applyGameCommand, creditsRanking, drawWheelFactor, GAME_RULES_VERSION, GameRuleError, gamesView, parseGameCommand, xoSize } from "../../../lib/games";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const supportsCurrentRules = (query: URLSearchParams) => query.get("rules") === GAME_RULES_VERSION;

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để chơi" }, 401);
    const query = new URL(request.url).searchParams;
    if (query.get("view") === "rank")
      return json(creditsRanking(user.club, user.revision));
    return json(gamesView(user.club, user.member.id, user.revision, !supportsCurrentRules(query)));
  } catch (error) {
    console.error("games:get", error);
    return json({ error: "Chưa tải được trò chơi" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để chơi" }, 401);
    verifyOrigin(request);
    const bytes = await readBody(request, "application/json", 1_500, "Thao tác trò chơi không hợp lệ");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Thao tác trò chơi không hợp lệ" }, 400);
    }
    const command = parseGameCommand(body);
    const currentRules = supportsCurrentRules(new URL(request.url).searchParams);
    if (!currentRules && (command.kind === "create" || command.kind === "spin"))
      throw new GameRuleError("Tải bản mới của Nhịp Đội để chơi theo luật mới", 409);
    const factor = command.kind === "spin" ? drawWheelFactor() : undefined;
    const at = Date.now();
    const { club, revision, result: spin } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active))
        throw new AuthError("Vui lòng đăng nhập để chơi", 401);
      if (!currentRules && command.kind !== "spin" && current.games?.rooms.some(room => room.id === command.id && xoSize(room) !== 3))
        throw new GameRuleError("Tải bản mới của Nhịp Đội để chơi trên bàn 20 × 20", 409);
      return applyGameCommand(current, user.member.id, command, at, factor);
    });
    return json({ ...gamesView(club, user.member.id, revision, !currentRules), spin });
  } catch (error) {
    if (error instanceof GameRuleError || error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("games:post", error);
    return json({ error: "Chưa lưu được thao tác, vui lòng thử lại" }, 503);
  }
}
