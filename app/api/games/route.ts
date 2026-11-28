import { applyGameCommand, drawWheelFactor, GameRuleError, gamesView, parseGameCommand } from "../../../lib/games";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để chơi" }, 401);
    return json(gamesView(user.club, user.member.id, user.revision));
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
    const factor = command.kind === "spin" ? drawWheelFactor() : undefined;
    const at = Date.now();
    const { club, revision, result: spin } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active))
        throw new AuthError("Vui lòng đăng nhập để chơi", 401);
      return applyGameCommand(current, user.member.id, command, at, factor);
    });
    return json({ ...gamesView(club, user.member.id, revision), spin });
  } catch (error) {
    if (error instanceof GameRuleError || error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("games:post", error);
    return json({ error: "Chưa lưu được thao tác, vui lòng thử lại" }, 503);
  }
}
