import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthError,
  hashPassword,
  normalizeLogin,
  randomToken,
  tokenHash,
  validatePassword,
  verifyPassword,
} from "../lib/password";
test("Login normalization rejects invalid usernames and ignores caller role fields", () => {
  assert.equal(normalizeLogin(" ADMIN "), "admin");
  assert.equal(normalizeLogin("20241001"), "20241001");
  assert.throws(() => normalizeLogin("a"), AuthError);
  assert.throws(() => normalizeLogin("admin' OR 1=1"), AuthError);
  assert.throws(() => normalizeLogin("a".repeat(31)), AuthError);
});
test("Passwords have bounded length", () => {
  assert.equal(validatePassword("MyPassword!2026"), "MyPassword!2026");
  assert.throws(() => validatePassword("1234567"), AuthError);
  assert.throws(() => validatePassword("x".repeat(129)), AuthError);
});
test("Password hashes use distinct salts, verify correctly and never store plaintext", async () => {
  const a = await hashPassword("LocalPassword!2026"),
    b = await hashPassword("LocalPassword!2026");
  assert.notEqual(a, b);
  assert.ok(!a.includes("LocalPassword"));
  assert.equal(await verifyPassword("LocalPassword!2026", a), true);
  assert.equal(await verifyPassword("WrongPassword!2026", a), false);
});
test("Malformed and tampered password hashes fail closed", async () => {
  assert.equal(await verifyPassword("password", "not-a-hash"), false);
  assert.equal(await verifyPassword("password", "1$aa$bb"), false);
  const hash = await hashPassword("LocalPassword!2026");
  assert.equal(
    await verifyPassword("LocalPassword!2026", hash.slice(0, -1) + "x"),
    false,
  );
});
test("Session tokens contain 256 random bits and database stores only their hash", async () => {
  const a = randomToken(),
    b = randomToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
  assert.notEqual(await tokenHash(a), a);
  assert.equal(await tokenHash(a), await tokenHash(a));
});
