const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) =>
  new Uint8Array((value.match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function normalizeLogin(value: unknown) {
  const login = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login))
    throw new AuthError(
      "Tên đăng nhập/MSSV cần 3–30 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.",
    );
  return login;
}
export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    throw new AuthError("Mật khẩu cần từ 8 đến 128 ký tự.");
  return value;
}
export function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
export async function tokenHash(value: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `100000$${hex(salt)}$${hex(new Uint8Array(derived))}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "100000" ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[0-9a-f]{64}$/.test(parts[2])
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: unhex(parts[1]),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
  const expected = unhex(parts[2]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= bytes[i] ^ expected[i];
  return difference === 0;
}
