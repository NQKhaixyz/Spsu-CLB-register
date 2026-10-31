import type { Club } from "./club";

export function workspaceView(
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
        : { id: m.id, name: m.name, studentId: "", role: "member", active: m.active, joined: m.joined, availability: [], extraDuties: false },
    );
    club.weeks = club.weeks.map((w) => ({ ...w, entries: w.entries.filter((e) => e.memberId === me?.id) }));
    club.schedules = club.schedules.filter((s) => s.published).map((s) => ({
      ...s,
      shifts: s.shifts.map((t) => {
        const { cancellationSnapshot, ...safeShift } = t;
        return { ...safeShift, assignments: t.assignments.map((a) => a.memberId === me?.id ? a : { memberId: a.memberId, result: "unverified" }) };
      }),
    }));
    club.logs = [];
    club.ownerId = "";
    delete club.availabilityDataset;
    delete club.activeAvailabilityDataset;
    delete club.demoArchive;
  }
  return { club, me, isAdmin: !!isAdmin, setup: !me, identity: { name: user.displayName, email: user.email }, revision };
}
