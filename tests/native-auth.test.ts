import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  getNativeUser,
  login,
  register,
  revokeAccountsByUserIds,
  sessionCookie,
  setAccountPassword,
  updateOwnProfile,
} from "../lib/native-auth";
import { applyAction } from "../lib/actions";
import { mutate, readState } from "../lib/store";
import { purgeTestData } from "../lib/maintenance";
import { weekId, type Member } from "../lib/club";
import { tokenHash } from "../lib/password";
import { createClub, newEntry, makeSchedule, syncWeeks, type Shift } from "../lib/club";
import { planAuthorizedWeekCleanup, CLEANUP_ID, OCTOBER_WEEK_CLEANUP } from "../lib/authorized-week-cleanup";
import { runAuthorizedWeekCleanup } from "../lib/run-week-cleanup";
import { withdrawRequestedDutyWeek } from "../lib/withdraw-duty-week";
import { DUTY_RESET_ID, DUTY_RESET_WEEK, inspectDutyWeekReset, runDutyWeekReset } from "../lib/duty-week-reset";
import { workspaceView } from "../lib/workspace-view";
import { removeDutyMember } from "../lib/remove-duty-member";

let sqlite: DatabaseSync;
let beforeBatch: ((queries: string[]) => void) | undefined;
let failQuery: RegExp | undefined;
type Bound = {
  query: string;
  run: () => Promise<{ meta: { changes: number } }>;
};
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE club_state(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE auth_accounts(id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',password_hash TEXT NOT NULL);
    CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE auth_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
    CREATE TABLE club_week_trash(id TEXT PRIMARY KEY,week_start TEXT NOT NULL,week_end TEXT NOT NULL,created_at TEXT NOT NULL,source_revision INTEGER NOT NULL,removed_weeks INTEGER NOT NULL,removed_entries INTEGER NOT NULL,removed_shifts INTEGER NOT NULL,removed_assignments INTEGER NOT NULL,payload TEXT NOT NULL);`);
  const DB = {
    prepare(query: string) {
      return {
        query,
        args: [] as (string | number)[],
        bind(...args: (string | number)[]) {
          this.args = args;
          return this;
        },
        async first() {
          return sqlite.prepare(query).get(...this.args) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(query).all(...this.args) };
        },
        async run() {
          if (failQuery?.test(query)) throw new Error("Simulated insert failure");
          const result = sqlite.prepare(query).run(...this.args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements: Bound[]) {
      beforeBatch?.(statements.map((s) => s.query));
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  Object.assign(globalThis, {
    __nativeAuthTestEnv: {
      DB,
      INITIAL_ADMIN_PASSWORD: "LocalAdmin!2026",
      INITIAL_MEMBER_PASSWORD: "LocalMember!2026",
    },
  });
  beforeBatch = undefined;
  failQuery = undefined;
});
afterEach(() => sqlite.close());

test("Removing one cancelled assignment queues only its photo and rolls back if the evidence write fails", async () => {
  sqlite.exec(`CREATE TABLE duty_evidence(shift_id TEXT, member_id TEXT, id TEXT PRIMARY KEY, expires_at INTEGER);
    CREATE TABLE pending_photo_deletion(key TEXT PRIMARY KEY);`);
  const owner = { userId: "owner", email: "", displayName: "Điều hành" };
  const member = { userId: "target", email: "", displayName: "Thành viên" };
  const club = createClub(owner.userId);
  club.members = [owner, member].map((user, index): Member => ({
    id: user.userId, userId: user.userId, name: user.displayName, studentId: `SV${index}`,
    role: index === 0 ? "admin" : "member", active: true, joined: "2026-10-01", availability: [], extraDuties: false,
  }));
  const completed = [{ memberId: member.userId, result: "completed" as const }, { memberId: owner.userId, result: "completed" as const }];
  const shift: Shift = {
    id: "2026-11-16-am", period: "am", date: "2026-11-16", cancelled: true,
    assignments: completed.map(row => ({ ...row, result: "cancelled" })),
    cancellationSnapshot: completed,
  };
  const other: Shift = { id: "2026-11-16-pm", period: "pm", date: shift.date, assignments: [{ ...completed[0] }] };
  club.schedules = [{ month: "2026-11", published: true, shifts: [shift, other] }];
  sqlite.prepare("INSERT INTO club_state(id,payload,revision) VALUES ('main',?,7)").run(JSON.stringify(club));
  const expires = Date.parse("2026-11-23T00:00:00+07:00");
  const insert = sqlite.prepare("INSERT INTO duty_evidence VALUES(?,?,?,?)");
  insert.run(shift.id, member.userId, "removed-photo", expires);
  insert.run(shift.id, owner.userId, "kept-photo", expires);
  insert.run(other.id, member.userId, "other-shift-photo", expires);
  const args = { month: "2026-11", shiftId: shift.id, memberId: member.userId, confirm: member.userId };
  await assert.rejects(removeDutyMember(member, args), /Chỉ BĐH/);
  failQuery = /^DELETE FROM duty_evidence/;
  await assert.rejects(removeDutyMember(owner, args), /Simulated/);
  assert.deepEqual((await readState("", false)).club, club);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM duty_evidence").get()?.count, 3);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM pending_photo_deletion").get()?.count, 0);
  failQuery = undefined;

  const result = await removeDutyMember(owner, args);
  assert.deepEqual(result.club.schedules[0].shifts[1], other);
  const snapshot = result.club.schedules[0].shifts[0].cancellationSnapshot;
  assert.deepEqual(snapshot, [completed[1]]);
  assert.deepEqual(sqlite.prepare("SELECT id FROM duty_evidence ORDER BY id").all().map(row => row.id), ["kept-photo", "other-shift-photo"]);
  assert.equal(sqlite.prepare("SELECT key FROM pending_photo_deletion").get()?.key, "duty-evidence/2026-11-16/removed-photo.jpg");
  applyAction(result.club, owner, "restoreShift", { month: "2026-11", shiftId: shift.id });
  assert.deepEqual(result.club.schedules[0].shifts[0].assignments, [completed[1]]);
});

test("Reset clears exactly the duty week, archives it atomically and enables a new draft without restoring cancelled slots", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-10T16:30:00Z") });
  const owner = { userId: "owner", email: "", displayName: "Admin" };
  const viewer = { userId: "viewer", email: "", displayName: "Member" };
  const club = createClub(owner.userId);
  club.members = [owner, viewer, { ...viewer, userId: "third" }].map((user, i) => ({
    id: user.userId, userId: user.userId, name: user.displayName, studentId: `SV${i}`,
    role: i === 0 ? "admin" : "member", active: true, joined: "2026-01-01",
    availability: ["3-am", "3-pm", "4-am", "4-pm", "5-am", "5-pm"], extraDuties: false,
  }));
  syncWeeks(club);
  const shifts: Shift[] = ["2026-11-08", "2026-11-09", "2026-11-11", "2026-11-15", "2026-11-16"].map((date) => ({
    id: date + "-am", date, period: "am", capacity: 2,
    assignments: [{ memberId: "viewer", result: "completed" }],
  }));
  Object.assign(shifts[2], {
    draft: true,
    cancelled: true,
    cancellationSnapshot: [{ memberId: "viewer", result: "unverified" }],
    assignments: [{ memberId: "viewer", result: "cancelled" }],
  });
  club.schedules = [{ month: "2026-11", published: true, shifts }];
  sqlite.prepare("INSERT INTO club_state(id,payload,revision) VALUES ('main',?,7)").run(JSON.stringify(club));
  const plan = await inspectDutyWeekReset();
  assert.equal(plan.shifts, 3);
  assert.equal(plan.cancelled, 1);
  assert.equal(plan.upcomingSlots, 6);
  assert.equal(plan.receipt, null);
  await assert.rejects(runDutyWeekReset(plan.revision + 1), /được cập nhật/);
  failQuery = /^UPDATE club_state SET payload=/;
  await assert.rejects(runDutyWeekReset(plan.revision), /Simulated/);
  failQuery = undefined;
  assert.deepEqual((await readState("", false)).club, club);
  assert.equal((await inspectDutyWeekReset()).receipt, null);

  const result = await runDutyWeekReset(plan.revision);
  assert.equal(result.receipt?.removed_shifts, 3);
  assert.equal(result.receipt?.removed_assignments, 3);
  assert.equal(result.shifts, 0);
  assert.equal(result.ready, true);
  const saved = sqlite.prepare("SELECT payload FROM club_week_trash WHERE id=?").get(DUTY_RESET_ID);
  assert.deepEqual(JSON.parse(String(saved!.payload)).shifts, shifts.slice(1, 4));
  const reset = (await readState("", false)).club;
  assert.deepEqual(reset.weeks, club.weeks);
  assert.deepEqual(reset.schedules[0].shifts, [shifts[0], shifts[4]]);
  assert.equal(workspaceView(reset, viewer, result.revision).club.schedules[0].pendingDutyWeek, undefined);
  assert.throws(() => applyAction(reset, owner, "publish", { month: "2026-11", week: DUTY_RESET_WEEK }), /không có ca nháp/);

  const { club: planned } = await mutate(owner.userId, (c) => applyAction(c, owner, "schedule", {
    month: "2026-11", week: DUTY_RESET_WEEK, peoplePerShift: 3,
  }));
  const drafts = planned.schedules[0].shifts.filter((shift) => shift.draft);
  assert.equal(drafts.length, 6);
  assert.ok(drafts.every((shift) => !shift.cancelled && shift.capacity === 3 && shift.assignments.length === 2));
  assert.ok(drafts.every(shift => shift.assignments.every(assignment => assignment.memberId !== owner.userId)));
  assert.equal(planned.schedules[0].pendingDutyWeek, undefined);
  assert.deepEqual(workspaceView(planned, viewer, result.revision + 1).club.schedules[0].shifts.map((shift) => shift.id),
    [shifts[0].id, shifts[4].id]);
  const retried = await runDutyWeekReset(plan.revision);
  assert.equal(retried.shifts, 6);
  assert.deepEqual(retried.receipt, result.receipt);
});

test("Withdrawing one week keeps past results and other weeks, hides drafts from members, and can replan and republish once", async (t) => {
  const now = new Date("2026-11-10T15:50:00Z");
  t.mock.timers.enable({ apis: ["Date"], now });
  const club = createClub("owner");
  const owner = { userId: "owner", email: "", displayName: "Admin" };
  const viewer = { userId: "viewer", email: "", displayName: "Member" };
  club.members = [owner, viewer, { ...viewer, userId: "third" }].map((user, i) => ({
    id: user.userId, userId: user.userId, name: user.displayName, studentId: `SV${i}`,
    role: i === 0 ? "admin" : "member", active: true, joined: "2026-01-01",
    availability: ["3-am"], extraDuties: false,
  }));
  const shifts: Shift[] = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-16"].map((date, i) => ({
    id: date + "-am", date, period: "am", startTime: "08:30", capacity: 2,
    assignments: [{ memberId: "viewer", result: i === 0 || i === 2 ? "completed" : "unverified" }],
  }));
  club.schedules = [{ month: "2026-11", published: true, shifts }];
  sqlite.prepare("INSERT INTO club_state(id,payload,revision) VALUES ('main',?,7)").run(JSON.stringify(club));
  assert.equal((await withdrawRequestedDutyWeek(now)).count, 1);
  const live = (await readState("", false)).club;
  const month = live.schedules[0];
  assert.equal(month.published, true);
  assert.deepEqual(month.shifts.filter((s) => !s.draft), [shifts[0], shifts[2], shifts[3]]);
  assert.deepEqual(workspaceView(live, viewer, 8).club.schedules[0].shifts.map((s) => s.date),
    ["2026-11-10", "2026-11-12", "2026-11-16"]);
  assert.throws(() => applyAction(live, owner, "shift", { month: month.month, shiftId: shifts[1].id, position: 0, result: "completed" }), /Công bố ca/);
  assert.throws(() => applyAction(live, viewer, "schedule", { month: month.month, week: "2026-11-09", peoplePerShift: 3 }), /BĐH/);
  applyAction(live, owner, "schedule", { month: month.month, week: "2026-11-09", peoplePerShift: 3 });
  assert.equal(month.shifts[1].assignments.length, 2);
  assert.ok(month.shifts[1].assignments.every(assignment => assignment.memberId !== owner.userId));
  assert.equal(month.shifts[1].capacity, 3);
  assert.deepEqual(month.shifts.filter((s) => !s.draft), [shifts[0], shifts[2], shifts[3]]);
  applyAction(live, owner, "publish", { month: month.month, week: "2026-11-09" });
  assert.equal(workspaceView(live, viewer, 9).club.schedules[0].shifts.length, 4);
  sqlite.prepare("UPDATE club_state SET payload=?,revision=9 WHERE id='main'").run(JSON.stringify(live));
  assert.equal((await withdrawRequestedDutyWeek(now)).alreadyDone, true);
  assert.equal((await readState("", false)).club.schedules[0].shifts.some((s) => s.draft), false);
});

function cleanupFixture() {
  const club = createClub("cleanup-owner");
  club.members = [{ id: "m1", name: "Member", studentId: "SV01", active: true, role: "member", joined: "2020-01-01", availability: ["1-am"], extraDuties: false }];
  club.weeks = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map(id => ({ id, meetingDate: id === "2026-10-26" ? "2026-11-01" : id, time: "18:30", location: "C1", closed: true, cancelled: false, entries: [newEntry("m1")], closingSnapshot: { before: [newEntry("m1")], after: [newEntry("m1")] } }));
  club.schedules = [{ month: "2026-11", published: true, peoplePerShift: 3, shifts: ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-08", "2026-11-09"].map(date => ({ id: `${date}-am`, date, period: "am", capacity: 3, assignments: [{ memberId: "m1", result: "completed", late: true, note: "Keep in backup" }] })) }];
  club.demoArchive = { archivedAt: "2026-11-01", members: [], weeks: structuredClone(club.weeks), schedules: structuredClone(club.schedules) };
  sqlite.prepare("INSERT INTO club_state(id,payload,revision) VALUES ('main',?,7)").run(JSON.stringify(club));
  return club;
}

test("Week cleanup deletes only 1–8 Nov, keeps recoverable exact records and excludes deleted dates from regenerated schedules", async () => {
  const original = cleanupFixture();
  const result = await runAuthorizedWeekCleanup();
  assert.equal(result.removed_weeks, 2);
  assert.equal(result.removed_entries, 2);
  assert.equal(result.removed_shifts, 3);
  assert.equal(result.removed_assignments, 3);
  const { club, revision } = await readState("", false);
  assert.equal(revision, 8);
  assert.deepEqual(club.members, original.members);
  assert.deepEqual(club.rules, original.rules);
  assert.deepEqual(club.weeks, [original.weeks[0], original.weeks[3]]);
  assert.deepEqual(club.schedules[0].shifts, [original.schedules[0].shifts[0], original.schedules[0].shifts[4]]);
  assert.equal(club.schedules[0].published, true);
  assert.equal(club.demoArchive?.weeks.length, 2);
  const receipt = sqlite.prepare("SELECT * FROM club_week_trash WHERE id=?").get(CLEANUP_ID)!;
  const backup = JSON.parse(String(receipt.payload));
  assert.deepEqual(backup.active.weeks, original.weeks.slice(1, 3));
  assert.deepEqual(backup.active.schedules[0].shifts, original.schedules[0].shifts.slice(1, 4));
  assert.equal(backup.demoArchive.weeks.length, 2);
  const unchanged = JSON.stringify(club);
  assert.equal((await runAuthorizedWeekCleanup()).alreadyDone, true);
  assert.equal(JSON.stringify((await readState("", false)).club), unchanged);
  assert.equal((await readState("", false)).revision, 8);
  club.weeks = [club.weeks[0]];
  syncWeeks(club, "2026-11-09");
  assert.deepEqual(club.weeks.map(w => w.id), ["2026-10-19", "2026-11-09"]);
  const schedule = makeSchedule(club, "2026-11");
  assert.ok(schedule.shifts.every(t => t.date > "2026-11-08"));
  assert.ok(makeSchedule(club, "2026-10").shifts.some(t => t.date === "2026-10-26"));
});

test("Cleanup transaction failure rolls back both deletion and recovery copy", async () => {
  const original = cleanupFixture();
  failQuery = /UPDATE club_state/;
  await assert.rejects(() => runAuthorizedWeekCleanup(), /Simulated/);
  assert.deepEqual((await readState("", false)).club, original);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM club_week_trash").get()!.n, 0);
});

test("26 Oct–1 Nov cleanup archives all records assigned to the week and preserves later activities", async () => {
  const original = cleanupFixture();
  const { start, end, week, id } = OCTOBER_WEEK_CLEANUP;
  const nextWeek = "2026-11-02";
  const recordedAt = "2026-10-26T08:00:00Z";
  const firstEvent = { id: "in-scope", name: "Sự kiện trong tuần", startDate: start, endDate: end, points: 5, createdAt: recordedAt, createdBy: "m1" };
  const nextEvent = { ...firstEvent, id: "later-event", endDate: nextWeek };
  const firstRegistration = { id: "first-registration", kind: "event" as const, eventId: firstEvent.id, memberId: "m1", week, date: end, quantity: 1, note: "", status: "confirmed" as const, submittedAt: recordedAt };
  const nextRegistration = { ...firstRegistration, id: "next-registration", eventId: nextEvent.id, week: nextWeek, date: nextWeek };
  const firstPoints = { id: "first-points", kind: "committee" as const, committee: "cm" as const, memberId: "m1", week, date: start, points: 5, quantity: 1, note: "", updatedAt: recordedAt, updatedBy: "m1" };
  const nextPoints = { ...firstPoints, id: "next-points", week: nextWeek, date: nextWeek };
  const deduction = { id: "first-deduction", memberId: "m1", week, date: end, points: 1, reason: "Lý do", createdAt: recordedAt, createdBy: "m1" };
  original.events = [firstEvent, nextEvent];
  original.activityRegistrations = [firstRegistration, nextRegistration];
  original.manualActivities = [firstPoints, nextPoints];
  original.pointDeductions = [deduction];
  original.schedules[0].pendingDutyWeek = week;
  sqlite.prepare("UPDATE club_state SET payload=? WHERE id='main'").run(JSON.stringify(original));

  await runAuthorizedWeekCleanup(OCTOBER_WEEK_CLEANUP);
  const { club, revision } = await readState("", false);
  assert.equal(revision, 8);
  assert.deepEqual(club.weeks, [original.weeks[0], ...original.weeks.slice(2)]);
  assert.deepEqual(club.schedules[0].shifts, original.schedules[0].shifts.slice(2));
  assert.equal(club.schedules[0].pendingDutyWeek, undefined);
  assert.deepEqual(club.events, [nextEvent]);
  assert.deepEqual(club.activityRegistrations, [nextRegistration]);
  assert.deepEqual(club.manualActivities, [nextPoints]);
  assert.deepEqual(club.pointDeductions, []);
  assert.deepEqual(club.members, original.members);
  assert.deepEqual(club.rules, original.rules);
  assert.ok(club.deletedWeeks?.includes(week));
  assert.ok(makeSchedule(club, "2026-10").shifts.every(shift => shift.date < start));
  const row = sqlite.prepare("SELECT payload FROM club_week_trash WHERE id=?").get(id)!;
  const backup = JSON.parse(String(row.payload));
  assert.deepEqual(backup.active.weeks, [original.weeks[1]]);
  assert.deepEqual(backup.active.schedules[0].shifts, original.schedules[0].shifts.slice(0, 2));
  assert.deepEqual(backup.demoArchive.weeks, [original.demoArchive!.weeks[1]]);
  assert.deepEqual(backup.events, [firstEvent]);
  assert.deepEqual(backup.registrations, [firstRegistration]);
  assert.deepEqual(backup.manualActivities, [firstPoints]);
  assert.deepEqual(backup.deductions, [deduction]);
  assert.equal((await runAuthorizedWeekCleanup(OCTOBER_WEEK_CLEANUP)).alreadyDone, true);
  assert.equal((await readState("", false)).revision, revision);
});

test("Cleanup retries stale revisions without losing concurrent unrelated edits", async () => {
  cleanupFixture();
  beforeBatch = () => {
    beforeBatch = undefined;
    const row = sqlite.prepare("SELECT payload FROM club_state WHERE id='main'").get()!;
    const club = JSON.parse(String(row.payload));
    club.name = "Concurrent club name";
    sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(club));
  };
  const result = await runAuthorizedWeekCleanup();
  assert.equal(result.alreadyDone, false);
  assert.equal((await readState("", false)).club.name, "Concurrent club name");
  assert.equal((await readState("", false)).revision, 9);
  assert.equal(sqlite.prepare("SELECT source_revision FROM club_week_trash WHERE id=?").get(CLEANUP_ID)!.source_revision, 8);
});

test("Cleanup planning never deletes adjacent weeks or their snapshots", () => {
  const club = cleanupFixture();
  const result = planAuthorizedWeekCleanup(club);
  assert.equal(result.counts.removedWeeks, 2);
  assert.equal(club.weeks[0].closingSnapshot?.before.length, 1);
  assert.equal(club.weeks[1].closingSnapshot?.before.length, 1);
});

test("A named account for a pending Excel member preserves roster ID and assignments without inventing an MSSV", async () => {
  const {req,target,token}=await pendingAccount();
  const before=await readState("",false);
  const pending=before.club.members.find((m)=>m.id===target.id)!;
  assert.equal(pending.studentId,"");
  assert.equal(pending.needsStudentId,true);
  assert.equal(pending.loginName,"lethutrang");
  await assert.rejects(()=>setAccountPassword(req,{memberId:target.id,login:"different",password:"ShouldNotReset!2026",createOnly:true}),/đã có tài khoản/);
  assert.deepEqual(await readState("",false),before);
  const changed=await updateOwnProfile(request(token),{name:"Lê Thu Trang",studentId:"20269999",email:"trang@example.invalid",memberId:before.club.members[0].id,role:"admin",active:false,joined:"1900-01-01"});
  const me=changed.club.members.find((m)=>m.id===target.id)!;
  assert.equal(me.userId,pending.userId);
  assert.equal(me.role,"member");assert.equal(me.active,true);assert.equal(me.joined,pending.joined);
  assert.equal(me.studentId,"20269999");assert.equal(me.needsStudentId,false);
  assert.equal(changed.club.members.length,before.club.members.length);
  assert.deepEqual(changed.club.schedules,before.club.schedules);
  const account=sqlite.prepare("SELECT * FROM auth_accounts WHERE user_id=?").get(me.userId!)!;
  assert.equal(account.display_name,me.name);assert.equal(account.email,me.email);
  assert.equal(account.login,"lethutrang");
  const byMssv=await login(request(),{login:"20269999",password:"InitialMember!2026"});
  assert.equal((await getNativeUser(request(byMssv)))?.userId,pending.userId);
  assert.equal((await getNativeUser(request(token)))?.userId,pending.userId);
});

test("Self profile edits reject duplicate or reserved MSSVs and invalid email without changing other people",async()=>{
  const {token}=await pendingAccount();
  const before=await readState("",false);
  const owner=before.club.members.find((m)=>m.userId===before.club.ownerId)!;
  for(const data of [
    {name:"Lê Thu Trang",studentId:owner.studentId},
    {name:"Lê Thu Trang",studentId:"admin"},
    {name:"Lê Thu Trang",studentId:"20269999",email:"invalid"},
  ]) await assert.rejects(()=>updateOwnProfile(request(token),data));
  assert.deepEqual(await readState("",false),before);
});

test("Self profile update rolls back on account-write failure and retries concurrent club changes",async()=>{
  const {token,target}=await pendingAccount();
  const before=await readState("",false);
  failQuery=/^UPDATE auth_accounts SET display_name/;
  await assert.rejects(()=>updateOwnProfile(request(token),{name:"Trang mới",studentId:"20269999"}));
  assert.deepEqual(await readState("",false),before);
  failQuery=undefined;
  beforeBatch=(queries)=>{
    if(!queries.some((q)=>q.startsWith("UPDATE auth_accounts SET display_name")))return;
    beforeBatch=undefined;
    const row=sqlite.prepare("SELECT payload,revision FROM club_state WHERE id='main'").get()!;
    const c=JSON.parse(String(row.payload));c.name="BĐH thay đổi đồng thời";
    sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(c));
  };
  const changed=await updateOwnProfile(request(token),{name:"Trang mới",studentId:"20269999"});
  assert.equal(changed.club.name,"BĐH thay đổi đồng thời");
  assert.equal(changed.club.members.find((m)=>m.id===target.id)!.studentId,"20269999");
});
const request = (token = "") =>
  new Request("http://127.0.0.1/api/auth", {
    headers: {
      Cookie: token ? sessionCookie(new Request("http://127.0.0.1"), token).split(";")[0] : "",
      "cf-connecting-ip": "native-unit-test",
    },
  });

async function pendingAccount() {
  const { req, admin, target } = await addMember("STAGING001", "Lê Thu Trang");
  await mutate(admin.userId, (c) => {
    const member = c.members.find((m) => m.id === target.id)!;
    member.studentId = "";
    member.needsStudentId = true;
    c.schedules = [{month:"2026-11",published:true,sourceFilename:"Lịch rảnh chi tiết.xlsx",shifts:[{id:"2026-11-09-am",date:"2026-11-09",period:"am",assignments:[{memberId:member.id,result:"unverified",late:false}]}]}];
  });
  const result = await setAccountPassword(req, {memberId:target.id,login:"lethutrang",password:"InitialMember!2026",createOnly:true});
  assert.equal(result.login,"lethutrang");
  const token = await login(request(),{login:result.login,password:"InitialMember!2026"});
  return {req,admin,target,token};
}
async function adminContext() {
  const token = await login(request(), { login: "admin", password: "LocalAdmin!2026" });
  const req = request(token);
  const admin = (await getNativeUser(req))!;
  assert.ok(admin);
  return { req, admin };
}
async function addMember(studentId = "REAL001", name = "Nguyễn Mai Lan") {
  const context = await adminContext();
  await mutate(context.admin.userId, (club) =>
    applyAction(club, context.admin, "member", { studentId, name }),
  );
  const { club } = await readState("", false);
  return { ...context, target: club.members.find((m) => m.studentId === studentId)! };
}

test("Provisioning reserved/colliding login leaves profile, revision and audit log unchanged", async () => {
  const { req, admin, target } = await addMember();
  await mutate(admin.userId, (club) => {
    club.members.find((m) => m.id === target.id)!.studentId = "member";
  });
  const before = await readState("", false);
  await assert.rejects(
    () => setAccountPassword(req, { memberId: target.id, password: "Provision!2026" }),
    (e: { status: number }) => e.status === 409,
  );
  assert.deepEqual(await readState("", false), before);
  assert.equal(before.club.members.find((m) => m.id === target.id)?.userId, undefined);
});

test("Failed account insertion rolls back member link and audit log; retry provisions one usable account", async () => {
  const { req, target } = await addMember();
  const before = await readState("", false);
  failQuery = /^INSERT INTO auth_accounts/;
  await assert.rejects(
    () => setAccountPassword(req, { memberId: target.id, password: "Provision!2026" }),
    (e: { status: number }) => e.status === 409,
  );
  assert.deepEqual(await readState("", false), before);
  failQuery = undefined;
  assert.deepEqual(await setAccountPassword(req, { memberId: target.id, password: "Provision!2026" }), { login: "real001" });
  const token = await login(request(), { login: "REAL001", password: "Provision!2026" });
  const user = await getNativeUser(request(token));
  const { club } = await readState("", false);
  assert.equal(user?.userId, club.members.find((m) => m.id === target.id)?.userId);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE login='real001'").get()?.n, 1);
});

test("Provisioning retries a stale revision and preserves concurrent BĐH changes", async () => {
  const { req, target } = await addMember();
  beforeBatch = (queries) => {
    if (!queries.some((q) => q.startsWith("INSERT INTO auth_accounts"))) return;
    beforeBatch = undefined;
    const row = sqlite.prepare("SELECT payload FROM club_state WHERE id='main'").get()!;
    const club = JSON.parse(String(row.payload));
    club.name = "Tên cập nhật đồng thời";
    sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(club));
  };
  await setAccountPassword(req, { memberId: target.id, password: "Provision!2026" });
  const { club } = await readState("", false);
  assert.equal(club.name, "Tên cập nhật đồng thời");
  const linked = club.members.find((m) => m.id === target.id)!;
  assert.ok(linked.userId);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE user_id=?").get(linked.userId)?.n, 1);
  assert.equal(club.logs.filter((l) => l.text === `Cấp tài khoản cho ${target.name}`).length, 1);
});

test("Public signup cannot create a duplicate of a pending imported profile", async () => {
  const { admin } = await adminContext();
  await mutate(admin.userId, (club) => {
    club.members.push({ id: "source-linked", name: "Nguyễn Mai Lan", studentId: "", role: "member", active: true, joined: "2026-01-01", availability: [], extraDuties: false, needsStudentId: true });
    club.availabilityDataset = { filename: "real.xlsx", importedAt: "2026-10-31", importedBy: "BĐH", rows: [], memberLinks: { "nguyễn mai lan": "source-linked" } };
  });
  const before = await readState("", false);
  await assert.rejects(
    () => register(request(), { name: "  NGUYỄN   MAI LAN ", studentId: "REAL001", password: "Signup!2026", role: "admin" }),
    (e: { status: number; message: string }) => e.status === 409 && e.message.includes("BĐH"),
  );
  assert.deepEqual(await readState("", false), before);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE login='real001'").get()?.n, 0);
});

test("Disabled test account is revoked and never bootstrapped again, including when only admin password exists", async () => {
  const { admin } = await adminContext();
  const token = await login(request(), { login: "member", password: "LocalMember!2026" });
  assert.ok(await getNativeUser(request(token)));
  await mutate(admin.userId, (club) => { club.testAccountsDisabled = true; });
  assert.equal(await getNativeUser(request(token)), null);
  await assert.rejects(
    () => login(request(), { login: "member", password: "LocalMember!2026" }),
    (e: { status: number }) => e.status === 403,
  );
  await revokeAccountsByUserIds(["native:test-member", admin.userId]);
  await mutate(admin.userId, (club) => {
    club.members = club.members.filter((m) => m.userId !== "native:test-member");
  });
  const environment = (globalThis as typeof globalThis & { __nativeAuthTestEnv: { INITIAL_MEMBER_PASSWORD?: string } }).__nativeAuthTestEnv;
  delete environment.INITIAL_MEMBER_PASSWORD;
  assert.ok(await login(request(), { login: "admin", password: "LocalAdmin!2026" }));
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE login='member' OR user_id='native:test-member'").get()?.n, 0);
  const { club } = await readState("", false);
  assert.equal(club.members.some((m) => m.userId === "native:test-member"), false);
  assert.equal(await getNativeUser(request(token)), null);
});

test("Admin password reset invalidates all member sessions and members cannot provision accounts", async () => {
  const { req } = await adminContext();
  const a = await login(request(), { login: "member", password: "LocalMember!2026" });
  const b = await login(request(), { login: "member", password: "LocalMember!2026" });
  const member = (await getNativeUser(request(a)))!;
  const { club } = await readState("", false);
  const target = club.members.find((m) => m.userId === member.userId)!;
  await assert.rejects(
    () => setAccountPassword(request(a), { memberId: target.id, password: "Reset!2026" }),
    (e: { status: number }) => e.status === 403,
  );
  await setAccountPassword(req, { memberId: target.id, password: "Reset!2026" });
  assert.equal(await getNativeUser(request(a)), null);
  assert.equal(await getNativeUser(request(b)), null);
  assert.ok(await login(request(), { login: "member", password: "Reset!2026" }));
});

async function cleanupContext() {
  const { req, admin } = await adminContext();
  const memberToken = await login(request(), { login: "member", password: "LocalMember!2026" });
  const imported = (id: string, name: string, studentId: string): Member => ({
    id, name, studentId, role: "member", active: true,
    joined: "2026-01-01", availability: [], extraDuties: false,
  });
  await mutate(admin.userId, (club) => {
    club.members.push(
      imported("source-1", "Thành viên nguồn một", "REAL001"),
      imported("source-2", "Thành viên nguồn hai", "REAL002"),
      imported("confirmed-test", "Tài khoản thử đã xác nhận", "QA001"),
      imported("unselected-person", "Hồ sơ cần giữ", "KEEP001"),
      imported("demo-0", "Hồ sơ mẫu", "DEMO001"),
    );
    club.activeAvailabilityDataset = {
      filename: "source.xlsx", importedAt: "2026-10-31", importedBy: "BĐH",
      rows: [
        { sourceRow: 2, name: "Thành viên nguồn một", day: "Thứ 2", period: "Cả ngày", weeks: "11-20", note: "" },
        { sourceRow: 3, name: "Thành viên nguồn hai", day: "Thứ 3", period: "Cả ngày", weeks: "11-20", note: "" },
      ],
      memberLinks: { "thành viên nguồn một": "source-1", "thành viên nguồn hai": "source-2" },
      settings: { anchorDate: "2026-11-09", anchorWeek: 11, startDate: "2026-11-09", amStart: "08:30", amEnd: "11:30", pmStart: "14:00", pmEnd: "17:30", allowedLateMinutes: 30, ignoreSourceNotes: true },
    };
    club.availabilityDataset = structuredClone(club.activeAvailabilityDataset);
    club.schedules = [
      { month: "2026-11", published: true, sourceFilename: "source.xlsx", shifts: [
        { id: "source-nov-one", date: "2026-11-09", period: "am", assignments: [{ memberId: "source-1", originalId: "confirmed-test", result: "completed", late: true, availabilityNote: "Tan học 14:30", note: "Ghi chú đối chiếu" }] },
        { id: "source-nov-two", date: "2026-11-10", period: "pm", cancelled: true, cancelReason: "Hủy thử", cancelledAt: "2026-10-31", assignments: [{ memberId: "source-2", result: "cancelled", late: false }], cancellationSnapshot: [{ memberId: "source-2", result: "completed", late: true }] },
      ] },
      { month: "2026-12", published: true, sourceFilename: "source.xlsx", shifts: [
        { id: "source-dec", date: "2026-12-01", period: "am", assignments: [{ memberId: "source-1", originalId: "source-2", result: "completed", late: true }] },
      ] },
      { month: "2026-10", published: true, shifts: [
        { id: "test-only", date: "2026-10-30", period: "am", assignments: [{ memberId: "confirmed-test", result: "completed" }] },
      ] },
    ];
    const current = club.weeks.find((w) => w.id === weekId())!;
    if (!current.entries.some((e) => e.memberId === "source-1"))
      current.entries.push({ memberId: "source-1", status: "attending", excused: false, passed: true, absent: false, reason: "" });
    club.demoArchive = { archivedAt: "2026-10-31", members: [imported("demo-old", "Mẫu lưu kho", "OLD001")], weeks: [], schedules: [] };
  });
  await setAccountPassword(req, { memberId: "source-1", password: "Source!2026" });
  await setAccountPassword(req, { memberId: "confirmed-test", password: "Trial!2026" });
  const sourceToken = await login(request(), { login: "REAL001", password: "Source!2026" });
  const trialToken = await login(request(), { login: "QA001", password: "Trial!2026" });
  const before = await readState("", false);
  const testMember = before.club.members.find((m) => m.userId === "native:test-member")!;
  const trialUserId = before.club.members.find((m) => m.id === "confirmed-test")!.userId!;
  return {
    req, admin, memberToken, sourceToken, trialToken, before, trialUserId,
    data: { confirm: "DON DU LIEU THU", memberIds: [testMember.id, "confirmed-test"], resetMonths: ["2026-11"], expectedSourcePeople: 2, expectedSourceRows: 2 },
  };
}

test("Cleanup keeps owner, source roster, duty assignments and unselected people; revokes only test accounts and cannot bootstrap them", async () => {
  const context = await cleanupContext();
  const { club, result } = await purgeTestData(context.admin, context.data);
  assert.equal(result.removedMembers, 3);
  assert.equal(result.resetAssignments, 2);
  assert.deepEqual(result.removedUserIds.sort(), ["native:test-member", context.trialUserId].sort());
  const expectedMembers = context.before.club.members.filter((m) => !["demo-0", "confirmed-test", context.before.club.members.find((x) => x.userId === "native:test-member")!.id].includes(m.id));
  assert.deepEqual(club.members, expectedMembers);
  assert.deepEqual(club.activeAvailabilityDataset, context.before.club.activeAvailabilityDataset);
  assert.deepEqual(club.availabilityDataset, context.before.club.availabilityDataset);
  assert.equal(club.demoArchive, undefined);
  assert.equal(club.testAccountsDisabled, true);
  assert.ok(club.testDataCleanedAt);
  const originalAssignments = context.before.club.schedules[0].shifts.map((s) => s.assignments.map((a) => a.memberId));
  assert.deepEqual(club.schedules[0].shifts.map((s) => s.assignments.map((a) => a.memberId)), originalAssignments);
  assert.ok(club.schedules[0].shifts.every((s) => !s.cancelled && !s.cancellationSnapshot && s.assignments.every((a) => a.result === "unverified" && a.late === false)));
  assert.equal(club.schedules[0].shifts[0].assignments[0].originalId, undefined);
  assert.equal(club.schedules[0].shifts[0].assignments[0].availabilityNote, "Tan học 14:30");
  assert.equal(club.schedules[0].shifts[0].assignments[0].note, "Ghi chú đối chiếu");
  assert.deepEqual(club.weeks.flatMap((w) => w.entries.filter((e) => e.memberId === "source-1")), context.before.club.weeks.flatMap((w) => w.entries.filter((e) => e.memberId === "source-1")));
  assert.ok(club.weeks.every((w) => w.entries.every((e) => !["demo-0", "confirmed-test"].includes(e.memberId))));
  assert.deepEqual(club.schedules.find((s) => s.month === "2026-12"), context.before.club.schedules.find((s) => s.month === "2026-12"));
  assert.ok(!club.schedules.some((s) => s.month === "2026-10"));
  for (const userId of result.removedUserIds) {
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE user_id=?").get(userId)?.n, 0);
  }
  assert.equal(await getNativeUser(request(context.memberToken)), null);
  assert.equal(await getNativeUser(request(context.trialToken)), null);
  assert.ok(await getNativeUser(context.req));
  assert.ok(await getNativeUser(request(context.sourceToken)));
  assert.ok(await login(request(), { login: "admin", password: "LocalAdmin!2026" }));
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE login='member'").get()?.n, 0);
  const revision = (await readState("", false)).revision;
  const repeat = await purgeTestData(context.admin, context.data);
  assert.equal(repeat.result.alreadyDone, true);
  assert.equal(repeat.revision, revision);
});

test("Cleanup transaction failure rolls back state, removed sessions and accounts together", async () => {
  const context = await cleanupContext();
  const accounts = sqlite.prepare("SELECT * FROM auth_accounts ORDER BY id").all();
  const sessions = sqlite.prepare("SELECT * FROM auth_sessions ORDER BY token_hash").all();
  failQuery = /^DELETE FROM auth_accounts/;
  await assert.rejects(() => purgeTestData(context.admin, context.data), /Simulated insert failure/);
  assert.deepEqual(await readState("", false), context.before);
  assert.deepEqual(sqlite.prepare("SELECT * FROM auth_accounts ORDER BY id").all(), accounts);
  assert.deepEqual(sqlite.prepare("SELECT * FROM auth_sessions ORDER BY token_hash").all(), sessions);
});

test("Cleanup stale-CAS gate preserves test sessions until retry and retains concurrent BĐH edits", async () => {
  const context = await cleanupContext();
  let batches = 0;
  const sessionCount = sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get()!.n;
  beforeBatch = (queries) => {
    if (!queries[0]?.startsWith("UPDATE club_state SET payload=")) return;
    batches++;
    if (batches === 1) {
      const concurrent = structuredClone(context.before.club);
      concurrent.name = "BĐH vừa sửa tên CLB";
      sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(concurrent));
    } else {
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get()?.n, sessionCount);
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE user_id=?").get(context.trialUserId)?.n, 1);
      beforeBatch = undefined;
    }
  };
  const cleaned = await purgeTestData(context.admin, context.data);
  assert.equal(batches, 2);
  assert.equal(cleaned.club.name, "BĐH vừa sửa tên CLB");
  assert.equal(cleaned.revision, context.before.revision + 2);
  assert.equal(await getNativeUser(request(context.trialToken)), null);
  assert.ok(await getNativeUser(context.req));
});

test("Cleanup rejects non-owner, source/owner deletion and changed source counts without writing", async () => {
  const context = await cleanupContext();
  const member = (await getNativeUser(request(context.sourceToken)))!;
  await assert.rejects(() => purgeTestData(member, context.data), /Chỉ chủ quản trị/);
  await assert.rejects(() => purgeTestData(context.admin, { ...context.data, memberIds: ["source-1"] }), /Không thể xóa hồ sơ nguồn/);
  const ownerId = context.before.club.members.find((m) => m.userId === context.admin.userId)!.id;
  await assert.rejects(() => purgeTestData(context.admin, { ...context.data, memberIds: [ownerId] }), /Không thể xóa hồ sơ nguồn/);
  await assert.rejects(() => purgeTestData(context.admin, { ...context.data, expectedSourceRows: 3 }), /Danh sách nguồn đã thay đổi/);
  assert.deepEqual(await readState("", false), context.before);
  assert.ok(await getNativeUser(request(context.trialToken)));
  await mutate(context.admin.userId, (club) => {
    const testId = club.members.find((m) => m.userId === "native:test-member")!.id;
    club.activeAvailabilityDataset!.memberLinks!["thành viên nguồn hai"] = testId;
  });
  const sourceLinkedTest = await readState("", false);
  await assert.rejects(() => purgeTestData(context.admin, context.data), /Tài khoản thử đang liên kết với hồ sơ nguồn/);
  assert.deepEqual(await readState("", false), sourceLinkedTest);
});

test("Forty successful logins on one school Wi-Fi consume no failed-login budget", async () => {
  for (let i = 0; i < 40; i++) {
    const token = await login(request(), i % 2
      ? { login: "admin", password: "LocalAdmin!2026" }
      : { login: "member", password: "LocalMember!2026" });
    assert.ok(await getNativeUser(request(token)));
  }
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_attempts").get()?.n, 0);
});

test("Twelve wrong passwords exhaust a login budget; successful other users do not reset IP failures", async () => {
  const { req } = await adminContext();
  const globalKey = await tokenHash("login:native-unit-test");
  const loginKey = await tokenHash("login:admin:native-unit-test");
  for (let i = 0; i < 11; i++)
    await assert.rejects(
      () => login(request(), { login: "admin", password: "WrongPassword!2026" }),
      (e: { status: number }) => e.status === 401,
    );
  assert.ok(await login(request(), { login: "member", password: "LocalMember!2026" }));
  assert.equal(sqlite.prepare("SELECT count FROM auth_attempts WHERE key=?").get(globalKey)?.count, 11);
  await assert.rejects(
    () => login(request(), { login: "admin", password: "WrongPassword!2026" }),
    (e: { status: number }) => e.status === 401,
  );
  await assert.rejects(
    () => login(request(), { login: "admin", password: "LocalAdmin!2026" }),
    (e: { status: number }) => e.status === 429,
  );
  assert.equal(sqlite.prepare("SELECT count FROM auth_attempts WHERE key=?").get(globalKey)?.count, 12);
  assert.equal(sqlite.prepare("SELECT count FROM auth_attempts WHERE key=?").get(loginKey)?.count, 12);
  assert.ok(await getNativeUser(req));
});

test("Thirty distributed wrong logins block the shared IP until the failure window expires", async () => {
  await adminContext();
  for (let i = 0; i < 30; i++) {
    await assert.rejects(
      () => login(request(), { login: `unknown-${Math.floor(i / 10)}`, password: "WrongPassword!2026" }),
      (e: { status: number }) => e.status === 401,
    );
    if (i === 14)
      assert.ok(await login(request(), { login: "admin", password: "LocalAdmin!2026" }));
  }
  await assert.rejects(
    () => login(request(), { login: "member", password: "LocalMember!2026" }),
    (e: { status: number }) => e.status === 429,
  );
  const key = await tokenHash("login:native-unit-test");
  assert.equal(sqlite.prepare("SELECT count FROM auth_attempts WHERE key=?").get(key)?.count, 30);
  sqlite.prepare("UPDATE auth_attempts SET reset_at=?").run(Date.now() - 1);
  assert.ok(await login(request(), { login: "member", password: "LocalMember!2026" }));
  await assert.rejects(
    () => login(request(), { login: "unknown-0", password: "WrongPassword!2026" }),
    (e: { status: number }) => e.status === 401,
  );
  assert.equal(sqlite.prepare("SELECT count FROM auth_attempts WHERE key=?").get(key)?.count, 1);
});
