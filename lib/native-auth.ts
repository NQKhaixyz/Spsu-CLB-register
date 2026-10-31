import { env } from "cloudflare:workers";
import { applyAction, type Identity } from "./actions";
import { mutate, readState } from "./store";
import { syncWeeks, today, uid, type Club, type Member } from "./club";
import {
  AuthError,
  hashPassword,
  normalizeLogin,
  randomToken,
  tokenHash,
  validatePassword,
  verifyPassword,
} from "./password";

type Account = {
  id: string;
  login: string;
  user_id: string;
  display_name: string;
  email: string;
  password_hash: string;
};
const db = () => {
  if (!env.DB) throw new AuthError("Chưa kết nối được cơ sở dữ liệu.", 503);
  return env.DB;
};
const cookieName = (request: Request) =>
  new URL(request.url).protocol === "https:"
    ? "__Host-nhip_session"
    : "nhip_session_dev";
export function sessionCookie(
  request: Request,
  value: string,
  maxAge = 604800,
) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function cookieToken(request: Request) {
  return (
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName(request) + "="))
      ?.split("=")[1] ?? ""
  );
}
export async function getNativeUser(
  request: Request,
): Promise<(Identity & { accountId: string; login: string }) | null> {
  const token = cookieToken(request);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const account = await db()
    .prepare(
      "SELECT a.id,a.login,a.user_id,a.display_name,a.email FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(await tokenHash(token), Date.now())
    .first<Omit<Account, "password_hash">>();
  if (!account) return null;
  const { club } = await readState("", false);
  const member = club.members.find((m) => m.userId === account.user_id);
  if (!member?.active) {
    await db()
      .prepare("DELETE FROM auth_sessions WHERE account_id=?")
      .bind(account.id)
      .run();
    return null;
  }
  return {
    userId: account.user_id,
    displayName: account.display_name,
    email: account.email,
    accountId: account.id,
    login: account.login,
  };
}
async function issueSession(accountId: string) {
  const token = randomToken();
  await db().batch([
    db()
      .prepare("DELETE FROM auth_sessions WHERE expires_at<=?")
      .bind(Date.now()),
    db()
      .prepare(
        "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)",
      )
      .bind(await tokenHash(token), accountId, Date.now() + 604800000),
  ]);
  return token;
}
async function attempt(
  request: Request,
  category: string,
  limit: number,
  seconds = 900,
) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = await tokenHash(`${category}:${ip}`),
    now = Date.now(),
    reset = now + seconds * 1000;
  await db()
    .prepare(
      "INSERT INTO auth_attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END",
    )
    .bind(key, reset, now, now, reset)
    .run();
  const row = await db()
    .prepare("SELECT count FROM auth_attempts WHERE key=?")
    .bind(key)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit)
    throw new AuthError(
      "Bạn thử quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.",
      429,
    );
}
async function bootstrapAccounts() {
  const existing = await db()
    .prepare(
      "SELECT login FROM auth_accounts WHERE login IN ('admin','member')",
    )
    .all<{ login: string }>();
  const needed = ["admin", "member"].filter(
    (login) => !existing.results.some((a) => a.login === login),
  );
  if (!needed.length) return;
  if (!env.INITIAL_ADMIN_PASSWORD || !env.INITIAL_MEMBER_PASSWORD)
    throw new AuthError(
      "Tài khoản ban đầu chưa được cấu hình. Liên hệ BCS.",
      503,
    );
  const { club } = await mutate(
    "native-club-owner",
    (c) => {
      for (const role of ["admin", "member"] as const) {
        const userId = role === "admin" ? c.ownerId : "native:test-member";
        if (!c.members.some((m) => m.userId === userId)) {
          const prefix = role === "admin" ? "ADMIN" : "TEST";
          let n = 1;
          while (
            c.members.some(
              (m) =>
                m.studentId.toUpperCase() ===
                prefix + String(n).padStart(3, "0"),
            )
          )
            n++;
          c.members.push({
            id: uid(),
            userId,
            name: role === "admin" ? "Ban cán sự" : "Thành viên thử nghiệm",
            studentId: prefix + String(n).padStart(3, "0"),
            role,
            active: true,
            joined: today(),
            availability: [],
            extraDuties: false,
          });
        }
      }
      syncWeeks(c);
    },
    true,
  );
  for (const login of needed) {
    const userId = login === "admin" ? club.ownerId : "native:test-member";
    const m = club.members.find((m) => m.userId === userId)!;
    const hash = await hashPassword(
      validatePassword(
        login === "admin"
          ? env.INITIAL_ADMIN_PASSWORD
          : env.INITIAL_MEMBER_PASSWORD,
      ),
    );
    await db()
      .prepare(
        "INSERT OR IGNORE INTO auth_accounts(id,login,user_id,display_name,email,password_hash) VALUES (?,?,?,?,?,?)",
      )
      .bind(uid(), login, userId, m.name, m.email ?? "", hash)
      .run();
  }
}
export async function login(request: Request, data: Record<string, unknown>) {
  await attempt(request, "login", 30);
  await bootstrapAccounts();
  const name = normalizeLogin(data.login);
  const password = validatePassword(data.password);
  await attempt(request, `login:${name}`, 12);
  let account = await db()
    .prepare("SELECT * FROM auth_accounts WHERE login=?")
    .bind(name)
    .first<Account>();
  if (!account) {
    // An existing account can also sign in using the associated MSSV.
    const { club } = await readState("", false);
    const m = club.members.find((m) => m.studentId.toLowerCase() === name);
    if (m?.userId)
      account = await db()
        .prepare("SELECT * FROM auth_accounts WHERE user_id=?")
        .bind(m.userId)
        .first<Account>();
  }
  const valid = await verifyPassword(
    password,
    account?.password_hash ??
      "100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000",
  );
  if (!account || !valid)
    throw new AuthError("Tên đăng nhập hoặc mật khẩu chưa đúng.", 401);
  const { club } = await readState("", false);
  const m = club.members.find((m) => m.userId === account.user_id);
  if (!m?.active)
    throw new AuthError("Tài khoản đã tạm dừng. Liên hệ BCS để mở lại.", 403);
  return issueSession(account.id);
}
export async function register(
  request: Request,
  data: Record<string, unknown>,
) {
  await attempt(request, "register", 10, 3600);
  await bootstrapAccounts();
  const name = String(data.name ?? "")
      .trim()
      .slice(0, 100),
    studentId = normalizeLogin(data.studentId),
    password = validatePassword(data.password);
  if (name.length < 2 || ["admin", "member"].includes(studentId))
    throw new AuthError("Nhập họ tên và MSSV hợp lệ.");
  const accountId = uid(),
    userId = `native:${uid()}`,
    hash = await hashPassword(password);
  for (let tries = 0; tries < 5; tries++) {
    const { club, revision } = await readState("", false);
    if (club.members.some((m) => m.studentId.toLowerCase() === studentId))
      throw new AuthError(
        "MSSV đã có trong danh sách. Nhờ BCS cấp mật khẩu hoặc dùng tài khoản đã có.",
        409,
      );
    applyAction(club, { userId, displayName: name, email: "" }, "profile", {
      name,
      studentId,
    });
    try {
      const result = await db().batch([
        db()
          .prepare(
            "INSERT INTO auth_accounts(id,login,user_id,display_name,email,password_hash) SELECT ?,?,?,?,'',? WHERE EXISTS(SELECT 1 FROM club_state WHERE id='main' AND revision=?)",
          )
          .bind(accountId, studentId, userId, name, hash, revision),
        db()
          .prepare(
            "UPDATE club_state SET payload=?,revision=revision+1 WHERE id='main' AND revision=? AND EXISTS(SELECT 1 FROM auth_accounts WHERE id=?)",
          )
          .bind(JSON.stringify(club), revision, accountId),
      ]);
      if (result[1].meta.changes) return issueSession(accountId);
    } catch {
      throw new AuthError("MSSV hoặc tài khoản đã được sử dụng.", 409);
    }
  }
  throw new AuthError("Có người đang cập nhật. Vui lòng thử lại.", 409);
}
export async function logout(request: Request) {
  const token = cookieToken(request);
  if (token)
    await db()
      .prepare("DELETE FROM auth_sessions WHERE token_hash=?")
      .bind(await tokenHash(token))
      .run();
}
export async function setAccountPassword(
  request: Request,
  data: Record<string, unknown>,
) {
  const user = await getNativeUser(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập.", 401);
  const password = validatePassword(data.password),
    hash = await hashPassword(password);
  const { club } = await readState("", false),
    me = club.members.find((m) => m.userId === user.userId);
  if (!me?.active || me.role !== "admin")
    throw new AuthError("Chỉ BCS được cấp mật khẩu.", 403);
  const target = club.members.find((m) => m.id === data.memberId);
  if (!target) throw new AuthError("Không tìm thấy thành viên.", 404);
  const existing = target.userId
    ? await db()
        .prepare("SELECT * FROM auth_accounts WHERE user_id=?")
        .bind(target.userId)
        .first<Account>()
    : null;
  const loginName = existing?.login ?? normalizeLogin(target.studentId);
  const userId = target.userId ?? `native:${uid()}`;
  if (existing) {
    await db().batch([
      db()
        .prepare("UPDATE auth_accounts SET password_hash=? WHERE id=?")
        .bind(hash, existing.id),
      db()
        .prepare("DELETE FROM auth_sessions WHERE account_id=?")
        .bind(existing.id),
    ]);
  } else {
    const accountId = uid();
    const result = await mutate(user.userId, (c) => {
      const m = c.members.find((m) => m.id === target.id)!;
      m.userId = userId;
      c.logs.unshift({
        at: new Date().toISOString(),
        actor: me.name,
        text: `Cấp tài khoản cho ${m.name}`,
      });
    });
    try {
      await db()
        .prepare(
          "INSERT INTO auth_accounts(id,login,user_id,display_name,email,password_hash) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          accountId,
          loginName,
          userId,
          target.name,
          target.email ?? "",
          hash,
        )
        .run();
    } catch {
      throw new AuthError(
        "Tên đăng nhập đã tồn tại. Liên hệ chủ quản trị.",
        409,
      );
    }
  }
  return { login: loginName };
}
export async function changeOwnPassword(
  request: Request,
  data: Record<string, unknown>,
) {
  const user = await getNativeUser(request);
  if (!user) throw new AuthError("Vui lòng đăng nhập.", 401);
  await attempt(request, "password-change", 12);
  const account = await db()
    .prepare("SELECT * FROM auth_accounts WHERE id=?")
    .bind(user.accountId)
    .first<Account>();
  if (
    !account ||
    !(await verifyPassword(
      String(data.currentPassword ?? ""),
      account.password_hash,
    ))
  )
    throw new AuthError("Mật khẩu hiện tại chưa đúng.", 401);
  const hash = await hashPassword(validatePassword(data.password));
  await db().batch([
    db()
      .prepare("UPDATE auth_accounts SET password_hash=? WHERE id=?")
      .bind(hash, account.id),
    db()
      .prepare("DELETE FROM auth_sessions WHERE account_id=?")
      .bind(account.id),
  ]);
  return issueSession(account.id);
}
