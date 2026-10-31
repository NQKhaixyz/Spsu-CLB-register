import { getChatGPTUser } from "../../chatgpt-auth";
import { applyAction } from "../../../lib/actions";
import { mutate, readState, synchronize } from "../../../lib/store";
import type { Club } from "../../../lib/club";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function view(
  club: Club,
  user: { userId: string; displayName: string; email: string },
  revision: number,
) {
  const me = club.members.find((m) => m.userId === user.userId) ?? null;
  const isAdmin = me?.role === "admin" && me.active;
  if (!isAdmin) {
    club = structuredClone(club);
    club.members = club.members.map((m) =>
      m.id === me?.id
        ? m
        : {
            id: m.id,
            name: m.name,
            studentId: "",
            role: "member",
            active: m.active,
            joined: m.joined,
            availability: [],
            extraDuties: false,
          },
    );
    club.weeks = club.weeks.map((w) => ({
      ...w,
      entries: w.entries.filter((e) => e.memberId === me?.id),
    }));
    club.schedules = club.schedules
      .filter((s) => s.published)
      .map((s) => ({
        ...s,
        shifts: s.shifts.map((t) => ({
          ...t,
          assignments: t.assignments.map((a) =>
            a.memberId === me?.id
              ? a
              : { memberId: a.memberId, result: "unverified" },
          ),
        })),
      }));
    club.logs = [];
    club.ownerId = "";
  }
  return {
    club,
    me,
    isAdmin: !!isAdmin,
    setup: !me,
    identity: { name: user.displayName, email: user.email },
    revision,
  };
}
export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Vui lÃ²ng Ä‘Äƒng nháº­p." }, 401);
    const { club, revision } = await mutate(user.userId, () => null);
    return json(view(club, user, revision));
  } catch (e) {
    console.error("workspace:get", e);
    return json(
      { error: "KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u. Vui lÃ²ng thá»­ láº¡i." },
      500,
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Vui lÃ²ng Ä‘Äƒng nháº­p." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Nguá»“n yÃªu cáº§u khÃ´ng há»£p lá»‡." }, 403);
    if (Number(request.headers.get("content-length")) > 1_000_000)
      return json({ error: "Dá»¯ liá»‡u quÃ¡ lá»›n." }, 413);
    const { action, data = {} } = (await request.json()) as {
      action: string;
      data?: Record<string, unknown>;
    };
    const { club, revision } = await mutate(user.userId, (c) =>
      applyAction(c, user, action, data),
    );
    return json(view(club, user, revision));
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error ? e.message : "KhÃ´ng lÆ°u Ä‘Æ°á»£c thay Ä‘á»•i.",
      },
      400,
    );
  }
}
