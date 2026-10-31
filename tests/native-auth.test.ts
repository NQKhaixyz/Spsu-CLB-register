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
    CREATE TABLE auth_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
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
    const c=JSON.parse(String(row.payload));c.name="BCS thay đổi đồng thời";
    sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(c));
  };
  const changed=await updateOwnProfile(request(token),{name:"Trang mới",studentId:"20269999"});
  assert.equal(changed.club.name,"BCS thay đổi đồng thời");
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

test("Provisioning retries a stale revision and preserves concurrent BCS changes", async () => {
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
    club.availabilityDataset = { filename: "real.xlsx", importedAt: "2026-10-31", importedBy: "BCS", rows: [], memberLinks: { "nguyễn mai lan": "source-linked" } };
  });
  const before = await readState("", false);
  await assert.rejects(
    () => register(request(), { name: "  NGUYỄN   MAI LAN ", studentId: "REAL001", password: "Signup!2026", role: "admin" }),
    (e: { status: number; message: string }) => e.status === 409 && e.message.includes("BCS"),
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
      filename: "source.xlsx", importedAt: "2026-10-31", importedBy: "BCS",
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

test("Cleanup stale-CAS gate preserves test sessions until retry and retains concurrent BCS edits", async () => {
  const context = await cleanupContext();
  let batches = 0;
  const sessionCount = sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get()!.n;
  beforeBatch = (queries) => {
    if (!queries[0]?.startsWith("UPDATE club_state SET payload=")) return;
    batches++;
    if (batches === 1) {
      const concurrent = structuredClone(context.before.club);
      concurrent.name = "BCS vừa sửa tên CLB";
      sqlite.prepare("UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main'").run(JSON.stringify(concurrent));
    } else {
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get()?.n, sessionCount);
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM auth_accounts WHERE user_id=?").get(context.trialUserId)?.n, 1);
      beforeBatch = undefined;
    }
  };
  const cleaned = await purgeTestData(context.admin, context.data);
  assert.equal(batches, 2);
  assert.equal(cleaned.club.name, "BCS vừa sửa tên CLB");
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
