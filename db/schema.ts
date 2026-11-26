import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const clubState = sqliteTable("club_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
});
export const clubWeekTrash = sqliteTable("club_week_trash", {
  id: text("id").primaryKey(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  createdAt: text("created_at").notNull(),
  sourceRevision: integer("source_revision").notNull(),
  removedWeeks: integer("removed_weeks").notNull(),
  removedEntries: integer("removed_entries").notNull(),
  removedShifts: integer("removed_shifts").notNull(),
  removedAssignments: integer("removed_assignments").notNull(),
  payload: text("payload").notNull(),
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
export const dutyEvidence = sqliteTable("duty_evidence", {
  shiftId: text("shift_id").notNull(),
  memberId: text("member_id").notNull(),
  id: text("id").primaryKey(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
  submittedAt: integer("submitted_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note").notNull().default(""),
}, table => [
  uniqueIndex("duty_evidence_assignment").on(table.shiftId, table.memberId),
  index("duty_evidence_expiry").on(table.expiresAt),
]);

export const pendingPhotoDeletion = sqliteTable("pending_photo_deletion", {
  key: text("key").primaryKey(),
});
