import type { Club } from "./club";

// Older records retain their original wording; show the current role name in
// the interface and reports without changing logins, IDs, or stored history.
const displayTextFields = new Set([
  "name", "actor", "text", "reason", "request", "decision", "note",
  "availabilityNote", "cancelReason", "importedBy", "location",
]);
function currentTerminology<T>(value: T): T {
  if (Array.isArray(value)) return value.map(currentTerminology) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === "string" && displayTextFields.has(key)
      ? item.replace(/\bBCS\b/g, "BĐH")
          .replace(/Ban cán sự/g, "Ban điều hành")
          .replace(/ban cán sự/g, "ban điều hành")
          .replace(/BAN CÁN SỰ/g, "BAN ĐIỀU HÀNH")
      : currentTerminology(item),
  ])) as T;
}

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
  return currentTerminology({ club, me, isAdmin: !!isAdmin, setup: !me, identity: { name: user.displayName, email: user.email }, revision });
}
