import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const clubState = sqliteTable("club_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
});
export const authAccounts = sqliteTable("auth_accounts", {
  id: text("id").primaryKey(),
  login: text("login").notNull().unique(),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
});
export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => authAccounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});
export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});
