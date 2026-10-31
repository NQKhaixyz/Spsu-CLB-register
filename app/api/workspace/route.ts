import { getNativeUser } from "../../../lib/native-auth";
import { applyAction } from "../../../lib/actions";
import { mutate, ClubNotReadyError } from "../../../lib/store";
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
        shifts: s.shifts.map((t) => {
          const { cancellationSnapshot, ...safeShift } = t;
          return {
            ...safeShift,
            assignments: t.assignments.map((a) =>
              a.memberId === me?.id
                ? a
                : { memberId: a.memberId, result: "unverified" },
            ),
          };
        }),
      }));
    club.logs = [];
    club.ownerId = "";
    delete club.availabilityDataset;
    delete club.demoArchive;
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
export async function GET(request: Request) {
  try {
    const user = await getNativeUser(request);
    if (!user) return json({ error: "Vui lòng đăng nhập." }, 401);
    const allowed = false;
    const { club, revision } = await mutate(user.userId, () => null, allowed);
    return json(view(club, user, revision));
  } catch (e) {
    if (e instanceof ClubNotReadyError) return json({ error: e.message }, 409);
    console.error("workspace:get", e);
    return json({ error: "Không tải được dữ liệu. Vui lòng thử lại." }, 500);
  }
}
export async function POST(request: Request) {
  try {
    const user = await getNativeUser(request);
    if (!user) return json({ error: "Vui lòng đăng nhập." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
    if (Number(request.headers.get("content-length")) > 1_000_000)
      return json({ error: "Dữ liệu quá lớn." }, 413);
    const { action, data = {} } = (await request.json()) as {
      action: string;
      data?: Record<string, unknown>;
    };
    const allowed = false;
    const { club, revision } = await mutate(
      user.userId,
      (c) => applyAction(c, user, action, data),
      allowed,
    );
    return json(view(club, user, revision));
  } catch (e) {
    return json(
      {
        error: e instanceof Error ? e.message : "Không lưu được thay đổi.",
      },
      400,
    );
  }
}
