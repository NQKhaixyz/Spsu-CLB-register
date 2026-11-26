import { env } from "cloudflare:workers";
import { purgeExpiredDutyPhotos } from "../../../../lib/duty-photo-storage";

export const dynamic = "force-dynamic";

export async function POST() {
  const headers = { "Cache-Control": "no-store" };
  if (!env.BUCKET || !env.DB) return Response.json({ ok: false }, { status: 503, headers });
  try {
    // The caller cannot set a date or select records. Only past weeks are purged.
    const ok = await purgeExpiredDutyPhotos(env.BUCKET, env.DB);
    return Response.json({ ok }, { status: ok ? 200 : 503, headers });
  } catch (error) {
    console.error("maintenance:duty-evidence", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
