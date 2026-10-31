import { synchronize } from "../../../lib/store";
import { weekId } from "../../../lib/club";
export const dynamic = "force-dynamic";
// This operation accepts no input and only advances the club's calendar.
export async function POST() {
  const changed = await synchronize();
  return Response.json(
    { ok: true, changed, currentWeek: weekId(), timezone: "Asia/Ho_Chi_Minh" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
