import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Everyone who can sign in. Two roles only: "student" or "teacher".
// Teachers are the only ones who can edit the AI's prompt.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique(),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["student", "teacher"] }).default("student").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// One row per chat thread. These are what show up in the sidebar.
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Every message ever sent, in order. `images` is a JSON array of upload
// paths like ["/uploads/abc123.jpg"] — empty for most messages.
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  text: text("text").notNull().default(""),
  images: text("images").notNull().default("[]"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Simple key/value store. Right now it holds exactly one key:
// "system_prompt" — the instructions teachers edit.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Facts the AI has learned about THIS team from real conversations —
// e.g. "the drivetrain uses REV NEO motors". These get added to the
// system prompt automatically so the AI knows what people mean when
// they say "the motor". Teachers can edit or delete them.
export const teamFacts = sqliteTable("team_facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  mentionCount: integer("mention_count").notNull().default(1),
  lastSeenAt: text("last_seen_at").default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
