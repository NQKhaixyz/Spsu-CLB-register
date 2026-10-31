import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const clubState = sqliteTable("club_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(0),
});
