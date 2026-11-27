import { personKey } from "./availability";
import type { Assignment, AvailabilityDataset, Club, Member, Shift } from "./club";
import { eventPhotoId } from "./event-evidence";

export function canDeleteMember(club: Club, admin: Member, target: Member) {
  return admin.active && admin.role === "admin" && target.id !== admin.id &&
    target.userId !== club.ownerId;
}

type MemberHistory = Partial<Pick<Club,
  "members" | "weeks" | "schedules" | "events" | "activityRegistrations" | "manualActivities" | "pointDeductions"
>> & { shifts?: Shift[]; registrations?: Club["activityRegistrations"] };

function dropAssignments(shift: Shift, id: string) {
  function clean(rows: Assignment[]) {
    return rows.filter(row => row.memberId !== id).map(row => {
      if (row.originalId === id) delete row.originalId;
      return row;
    });
  }
  shift.assignments = clean(shift.assignments);
  if (shift.cancellationSnapshot) shift.cancellationSnapshot = clean(shift.cancellationSnapshot);
}

function removeFromHistory(history: MemberHistory, id: string, eventPhotos: Set<string>) {
  if (history.members) history.members = history.members.filter(member => member.id !== id);
  for (const week of history.weeks ?? []) {
    week.entries = week.entries.filter(entry => entry.memberId !== id);
    if (week.closingSnapshot) {
      week.closingSnapshot.before = week.closingSnapshot.before.filter(entry => entry.memberId !== id);
      week.closingSnapshot.after = week.closingSnapshot.after.filter(entry => entry.memberId !== id);
    }
  }
  for (const shift of history.shifts ?? []) dropAssignments(shift, id);
  for (const schedule of history.schedules ?? []) {
    for (const shift of schedule.shifts) dropAssignments(shift, id);
  }
  for (const event of history.events ?? []) {
    if (event.createdBy === id) event.createdBy = "";
  }
  for (const field of ["activityRegistrations", "registrations"] as const) {
    if (!history[field]) continue;
    history[field] = history[field].filter(row => {
      if (row.memberId === id) {
        if (row.evidence && eventPhotoId.test(row.evidence.id)) eventPhotos.add(row.evidence.id);
        return false;
      }
      if (row.reviewedBy === id) delete row.reviewedBy;
      return true;
    });
  }
  if (history.manualActivities) {
    history.manualActivities = history.manualActivities.filter(row => row.memberId !== id);
    for (const row of history.manualActivities) {
      if (row.updatedBy === id) row.updatedBy = "";
    }
  }
  if (history.pointDeductions) {
    history.pointDeductions = history.pointDeductions.filter(row => row.memberId !== id);
    for (const row of history.pointDeductions) {
      if (row.createdBy === id) row.createdBy = "";
      if (row.cancelledBy === id) delete row.cancelledBy;
    }
  }
}

type WeekArchive = MemberHistory & { active?: MemberHistory | null; demoArchive?: MemberHistory | null };

export function scrubWeekArchive(archive: WeekArchive, memberId: string, eventPhotos: Set<string>) {
  removeFromHistory(archive, memberId, eventPhotos);
  if (archive.active) removeFromHistory(archive.active, memberId, eventPhotos);
  if (archive.demoArchive) removeFromHistory(archive.demoArchive, memberId, eventPhotos);
}

function removeAvailability(dataset: AvailabilityDataset, member: Member, uniqueName: boolean) {
  const links = dataset.memberLinks ?? {};
  const names = new Set(Object.entries(links).filter(([, id]) => id === member.id).map(([name]) => name));
  const name = personKey(member.name);
  if (uniqueName && !links[name]) names.add(name);
  dataset.rows = dataset.rows.filter(row => !names.has(personKey(row.name)));
  for (const key of names) delete links[key];
  if (dataset.importedBy && names.has(personKey(dataset.importedBy))) dataset.importedBy = "";
}

function personalTokens(member: Member, uniqueName: boolean) {
  const identifiers = [member.id, member.studentId, member.email, member.loginName, member.userId]
    .filter((value): value is string => !!value && value.length > 2);
  if (uniqueName && member.name.length >= 2) identifiers.push(member.name);
  return identifiers.map(value => personKey(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export function eraseMemberData(club: Club, admin: Member, member: Member) {
  const sameName = [...club.members, ...(club.demoArchive?.members ?? [])].some(other =>
    other.id !== member.id && personKey(other.name) === personKey(member.name),
  );
  const eventPhotos = new Set<string>();
  removeFromHistory(club, member.id, eventPhotos);
  for (const post of club.bulletinPosts ?? []) {
    if (post.likedBy) post.likedBy = post.likedBy.filter(id => id !== member.id);
    if (post.comments) post.comments = post.comments.filter(comment => comment.memberId !== member.id);
  }
  if (club.demoArchive) removeFromHistory(club.demoArchive, member.id, eventPhotos);
  for (const dataset of new Set([club.availabilityDataset, club.activeAvailabilityDataset])) {
    if (dataset) removeAvailability(dataset, member, !sameName);
  }
  const tokens = personalTokens(member, !sameName);
  const identifiesMember = tokens.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(?:${tokens.join("|")})(?=$|[^\\p{L}\\p{N}])`, "u") : null;
  club.logs = club.logs.filter(log => log.actorId !== member.id &&
    !identifiesMember?.test(personKey(log.actor + " " + log.text)));
  club.logs.unshift({ at: new Date().toISOString(), actor: admin.name, actorId: admin.id, text: "Xóa vĩnh viễn một hồ sơ thành viên và dữ liệu liên quan." });
  club.logs = club.logs.slice(0, 2000);
  if (member.userId === "native:test-member") club.testAccountsDisabled = true;
  return eventPhotos;
}
