import assert from "node:assert/strict";
const origin = process.env.NHIP_TEST_ORIGIN ?? "http://127.0.0.1:5173";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "These fixtures are local-only.",
);
const request = async (path, body, cookie) => {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    headers: r.headers,
  };
};
const auth = async (action, data, cookie) =>
  request("/api/auth", { action, data }, cookie);
const api = async (action, data, cookie) =>
  request("/api/workspace", { action, data }, cookie);
const admin = await auth("login", {
  login: "admin",
  password: "LocalAdmin!2026",
});
assert.equal(admin.status, 200, JSON.stringify(admin.body));
assert.match(admin.headers.get("set-cookie"), /HttpOnly/);
assert.match(admin.headers.get("set-cookie"), /SameSite=Lax/);
const a = admin.cookie;
let v = await request("/api/workspace", null, a);
assert.equal(v.status, 200);
assert.equal(v.body.isAdmin, true);
const adminUser = v.body.me.userId;
let vMember = v.body.club.members.find(
  (m) => m.userId === "native:test-member",
);
assert.ok(vMember);
await auth(
  "account",
  { memberId: vMember.id, password: "LocalMember!2026" },
  a,
);
const wrong = await auth("login", {
  login: "admin",
  password: "WrongPassword!2026",
});
assert.equal(wrong.status, 401);
const member = await auth("login", {
  login: "member",
  password: "LocalMember!2026",
});
assert.equal(member.status, 200, JSON.stringify(member.body));
let m = member.cookie;
const mv = await request("/api/workspace", null, m);
assert.equal(mv.body.isAdmin, false);
assert.notEqual(mv.body.me.userId, adminUser);
assert.equal(mv.body.club.ownerId, "");
assert.equal(mv.body.club.logs.length, 0);
assert.ok(
  mv.body.club.members
    .filter((x) => x.id !== mv.body.me.id)
    .every((x) => !x.userId && !x.email && !x.studentId),
);
const denied = await api("settings", { name: "Denied" }, m);
assert.notEqual(denied.status, 200);
const deniedAccount = await auth(
  "account",
  { memberId: vMember.id, password: "CannotReset!2026" },
  m,
);
assert.equal(deniedAccount.status, 403);
const weekly = mv.body.club.weeks.at(-1);
if (!weekly.closed && !weekly.cancelled) {
  if (weekly.entries[0]?.status === "pending")
    await api("register", { status: "withdraw" }, m);
  assert.equal(
    (
      await api(
        "register",
        { status: "absent", reason: "Kiểm tra luồng xin vắng" },
        m,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "register",
        { status: "pending", reason: "Đã sắp xếp lại lịch, xin tham gia" },
        m,
      )
    ).status,
    200,
  );
  const av = await request("/api/workspace", null, a);
  const e = av.body.club.weeks
    .find((x) => x.id === weekly.id)
    .entries.find((x) => x.memberId === mv.body.me.id);
  assert.equal(e.status, "pending");
  assert.equal(
    (
      await api(
        "review",
        { week: weekly.id, memberId: mv.body.me.id, approved: true },
        a,
      )
    ).status,
    200,
  );
  const approved = await request("/api/workspace", null, m);
  assert.equal(
    approved.body.club.weeks.find((x) => x.id === weekly.id).entries[0].status,
    "attending",
  );
}
const studentId = "qa" + Date.now().toString(36);
const registered = await auth("register", {
  name: "Thành viên kiểm tra",
  studentId,
  password: "NewMember!2026",
  role: "admin",
});
assert.equal(registered.status, 200, JSON.stringify(registered.body));
const signupView = await request("/api/workspace", null, registered.cookie);
assert.equal(signupView.body.isAdmin, false);
assert.equal(
  (
    await auth("register", {
      name: "Trùng MSSV",
      studentId,
      password: "NewMember!2026",
    })
  ).status,
  409,
);
const importedId = "im" + Date.now().toString(36);
const imported = await api(
  "member",
  { name: "Thành viên được nhập", studentId: importedId },
  a,
);
assert.equal(imported.status, 200);
const target = imported.body.club.members.find(
  (x) => x.studentId === importedId,
);
const issued = await auth(
  "account",
  { memberId: target.id, password: "Imported!2026" },
  a,
);
assert.equal(issued.status, 200, JSON.stringify(issued.body));
assert.equal(
  (await auth("login", { login: importedId, password: "Imported!2026" }))
    .status,
  200,
);
assert.equal((await request("/api/workspace")).status, 401);
const changed = await auth(
  "password",
  { currentPassword: "LocalMember!2026", password: "LocalMember!New2026" },
  m,
);
assert.equal(changed.status, 200);
assert.equal((await request("/api/workspace", null, m)).status, 401);
m = changed.cookie;
assert.equal(
  (await auth("login", { login: "member", password: "LocalMember!New2026" }))
    .status,
  200,
);
await auth(
  "account",
  { memberId: vMember.id, password: "LocalMember!2026" },
  a,
);
await auth("logout", {}, m);
assert.equal((await request("/api/workspace", null, m)).status, 401);
assert.equal((await request("/api/workspace", null, a)).body.isAdmin, true);
await auth("logout", {}, registered.cookie);
await auth("logout", {}, a);
console.log(
  "PASS: native admin/member login, masked member data, role enforcement, cross-account approval, signup, duplicate protection, imported-account provisioning, password change, session revocation, logout. No OpenAI sign-in.",
);
