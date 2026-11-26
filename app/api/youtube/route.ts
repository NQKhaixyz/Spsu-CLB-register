import { env } from "cloudflare:workers";
import { getNativeUser } from "../../../lib/native-auth";
import { searchYouTube } from "../../../lib/youtube";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function GET() {
  return json({ available: Boolean(env.YOUTUBE_API_KEY?.trim()) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  }
  const key = env.YOUTUBE_API_KEY?.trim();
  if (!key) return json({ error: "Tìm kiếm YouTube chưa được bật." }, 503);
  if (Number(request.headers.get("content-length")) > 4_096) {
    return json({ error: "Từ khóa quá dài." }, 413);
  }

  try {
    if (!await getNativeUser(request)) return json({ error: "Vui lòng đăng nhập." }, 401);
    const body = await request.json().catch(() => null) as { query?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 120) {
      return json({ error: "Nhập từ khóa từ 1 đến 120 ký tự." }, 400);
    }
    const result = await searchYouTube(query, key);
    if (result.videos) return json({ videos: result.videos });
    if (result.status === 429) return json({ error: "YouTube đang giới hạn lượt tìm. Thử lại sau." }, 429);
  } catch {
    // The provider can be slow or unavailable. Return the same retryable message.
  }
  return json({ error: "Chưa tìm được video từ YouTube. Thử lại sau." }, 502);
}
