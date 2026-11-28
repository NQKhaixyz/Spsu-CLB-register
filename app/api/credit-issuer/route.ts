import { env } from "cloudflare:workers";
import { GameRuleError, adjustGameCredits, creditRecipients, parseCreditAdjustment } from "../../../lib/games";
import { getCreditIssuer, loginCreditIssuer, logoutCreditIssuer, sessionCookie } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { readState, writeState } from "../../../lib/store";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(data, { status, headers });
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError || error instanceof GameRuleError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "Yêu cầu không hợp lệ" }, 400);
  console.error("credit-issuer", error);
  return json({ error: "Chưa xác nhận được yêu cầu, vui lòng thử lại" }, 503);
}

export async function GET(request: Request) {
  try {
    const issuer = await getCreditIssuer(request);
    if (!issuer) return json({ error: "Vui lòng đăng nhập tài khoản cấp credits" }, 401);
    const { club } = await readState("", false);
    return json({ name: issuer.name, players: creditRecipients(club) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const encoded = await readBody(request, "application/json", 1_500, "Yêu cầu không hợp lệ");
    const payload: unknown = JSON.parse(new TextDecoder().decode(encoded));
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return json({ error: "Yêu cầu không hợp lệ" }, 400);
    const { action, data } = payload as Record<string, unknown>;
    const input = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};

    if (action === "login") {
      const token = await loginCreditIssuer(request, input);
      return json({ ok: true }, 200, sessionCookie(request, token, undefined, "credit-issuer"));
    }
    if (action === "logout") {
      await logoutCreditIssuer(request);
      return json({ ok: true }, 200, sessionCookie(request, "", 0, "credit-issuer"));
    }
    const issuer = await getCreditIssuer(request);
    if (!issuer) return json({ error: "Vui lòng đăng nhập tài khoản cấp credits" }, 401);
    if (action !== "adjust") return json({ error: "Thao tác không hợp lệ" }, 400);

    const command = parseCreditAdjustment(input);
    const at = Date.now();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { club, revision } = await readState("", false);
      const { changed, result } = adjustGameCredits(club, command, issuer.id, at);
      if (!changed) return json(result);
      const userId = club.members.find(member => member.id === command.memberId)?.userId;
      if (!userId || !await env.DB!.prepare("SELECT id FROM auth_accounts WHERE user_id=?").bind(userId).first())
        return json({ error: "Người nhận chưa có tài khoản đăng nhập" }, 409);
      if (await writeState(club, revision)) return json(result);
    }
    return json({ error: "Dữ liệu vừa thay đổi, thử lại để xác nhận" }, 503);
  } catch (error) {
    return errorResponse(error);
  }
}
