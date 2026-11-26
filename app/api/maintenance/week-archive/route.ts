import { env } from "cloudflare:workers";
import { OCTOBER_WEEK_CLEANUP } from "../../../../lib/authorized-week-cleanup";
import { reportMembers, scoreFor } from "../../../../lib/club";
import { tokenHash } from "../../../../lib/password";
import { readState } from "../../../../lib/store";

export const dynamic = "force-dynamic";
// Only this operation's verifier is in source. The token is kept out of the Site.
const verifier = "8283fe825ef286778b39cb113a398e2e430fe7db01cc54c6d833b2d7d65b91fe";
const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function inspect() {
  const { id, week, start, end, plan } = OCTOBER_WEEK_CLEANUP;
  const { club } = await readState("", false);
  const blocked = club.deletedWeeks?.includes(week) ?? false;
  const weeklyBoardHasWeek = club.weeks.some(row => row.id === week);
  const monthlyReports = [start.slice(0, 7), end.slice(0, 7)].map(month => ({
    month,
    countedMembers: reportMembers(club, month).filter(member => {
      const score = scoreFor(club, member.id, month, week);
      return score.completed || score.dutyMissed || score.meetingMissed || score.attended ||
        score.passed || score.lateCount || score.points || Object.values(score.activityCounts).some(Boolean);
    }).length,
  }));
  const { counts: remaining } = plan(club);
  const archive = await env.DB!.prepare(
    "SELECT json_extract(payload, '$.counts') AS counts FROM club_week_trash WHERE id=?",
  ).bind(id).first<{ counts: string }>();
  return {
    start,
    end,
    weeklyBoardHasWeek,
    monthlyReports,
    remaining,
    removed: archive?.counts ? JSON.parse(archive.counts) : null,
    verified: !!archive && blocked && !weeklyBoardHasWeek &&
      monthlyReports.every(report => report.countedMembers === 0) &&
      Object.values(remaining).every(count => count === 0),
  };
}

export async function POST(request: Request) {
  const token = request.headers.get("X-Nhip-Week-Archive");
  if (!token || !/^[a-f0-9]{64}$/.test(token) || await tokenHash(token) !== verifier)
    return json({ error: "Không có quyền thực hiện thao tác này." }, 403);

  const data = await request.json().catch(() => null) as { action?: string } | null;
  if (data?.action !== "inspect")
    return json({ error: "Yêu cầu kiểm tra tuần không hợp lệ." }, 400);

  try {
    return json(await inspect());
  } catch (error) {
    console.error("maintenance:week-archive", error);
    return json({ error: "Chưa kiểm tra được dữ liệu của tuần." }, 500);
  }
}
