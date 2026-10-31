import { AuthError } from "../../../lib/password";
import {
  changeOwnPassword,
  login,
  logout,
  register,
  sessionCookie,
  setAccountPassword,
} from "../../../lib/native-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new AuthError("Nguồn yêu cầu không hợp lệ.", 403);
    const raw = await request.text();
    if (raw.length > 16000) throw new AuthError("Dữ liệu quá lớn.", 413);
    const { action, data = {} } = JSON.parse(raw) as {
      action: string;
      data: Record<string, unknown>;
    };
    if (action === "logout") {
      await logout(request);
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": sessionCookie(request, "", 0),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (action === "account")
      return Response.json(
        { ok: true, ...(await setAccountPassword(request, data)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    const token =
      action === "login"
        ? await login(request, data)
        : action === "register"
          ? await register(request, data)
          : action === "password"
            ? await changeOwnPassword(request, data)
            : null;
    if (!token) throw new AuthError("Thao tác không hợp lệ.");
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionCookie(request, token),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AuthError
            ? e.message
            : "Chưa xử lý được yêu cầu. Vui lòng thử lại.",
      },
      {
        status: e instanceof AuthError ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
