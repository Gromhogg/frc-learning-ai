import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Everyone who can sign in. Two roles only: "student" or "admin".
// Admins are the only ones who can edit the AI's prompt, facts, and docs.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique(),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["student", "admin"] }).default("student").notNull(),
  // Set when the person proved they own the email (signup code or Google).
  emailVerifiedAt: text("email_verified_at"),
  // When they became an admin. Admin access is never removed in the app.
  adminSince: text("admin_since"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// One row per chat thread. These are what show up in the sidebar.
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  // Fact extraction watermark: the highest message id already fed to the
  // learner. Durable, so a restart never re-learns or skips a batch.
  learnedThroughMessageId: integer("learned_through_message_id").notNull().default(0),
});

// Every message ever sent, in order. `images` is a JSON array of upload
// paths like ["/uploads/abc123.jpg"] — empty for most messages. `steps` is a
// JSON array of the docs the AI opened while writing an answer, so the
// "Read vertical-mill.md" chips survive a reload.
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  text: text("text").notNull().default(""),
  images: text("images").notNull().default("[]"),
  steps: text("steps").notNull().default("[]"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Simple key/value store. Right now it holds exactly one key:
// "system_prompt" — the instructions teachers edit.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Facts the AI has learned about THIS team from real conversations —
// e.g. "the drivetrain uses REV NEO motors". Extracted facts start out
// "pending" and only reach the system prompt once a teacher approves
// them. Rejected facts are kept as a blocklist so the same wrong fact
// is never proposed again.
export const teamFacts = sqliteTable("team_facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  mentionCount: integer("mention_count").notNull().default(1),
  // Bumped on every edit, so two admins editing the same fact can't silently
  // overwrite each other (a stale edit gets a 409).
  version: integer("version").notNull().default(1),
  // Which student's conversation surfaced this fact — audit trail for the
  // review queue. Null on facts that predate the review pipeline.
  sourceUserId: integer("source_user_id").references(() => users.id),
  sourceConversationId: integer("source_conversation_id").references(() => conversations.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"),
  lastSeenAt: text("last_seen_at").default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Every version of the teacher-editable instructions, oldest to newest. The
// live prompt is simply the highest `version` — nothing is ever updated in
// place, so an edit can't quietly erase someone else's work, and a rollback
// appends a new version carrying the old text rather than deleting anything.
//
// `authorName` is denormalized on purpose: the history should still read
// correctly after an account is deleted.
export const promptVersions = sqliteTable("prompt_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: integer("version").notNull().unique(),
  text: text("text").notNull(),
  // What `text` holds: "text" is the raw prompt itself; "sections@1" is a
  // JSON document of editable sections that assembles into the prompt.
  format: text("format", { enum: ["text", "sections@1"] }).notNull().default("text"),
  authorId: integer("author_id").references(() => users.id),
  authorName: text("author_name").notNull(),
  note: text("note"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Proposed prompt changes written by an agent — either the prompt editor an
// admin chats with, or the reviewer that reads recent student chats. A draft
// never goes live by itself: an admin applies it (which saves a normal new
// prompt version) or dismisses it. `baseVersion` is the version the agent
// read, so applying a stale draft hits the same conflict check a person does.
export const promptDrafts = sqliteTable("prompt_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source", { enum: ["admin_chat", "review"] }).notNull(),
  baseVersion: integer("base_version").notNull(),
  // Full sections document (same JSON shape as prompt_versions.text).
  sections: text("sections").notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  // JSON array of conversation ids the reviewer based this on.
  evidence: text("evidence").notNull().default("[]"),
  status: text("status", { enum: ["pending", "applied", "dismissed"] })
    .notNull()
    .default("pending"),
  createdBy: integer("created_by").references(() => users.id),
  agentChatId: integer("agent_chat_id").references(() => agentChats.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"),
  appliedVersion: integer("applied_version"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// An admin's conversation with the prompt-editor agent. Kept separate from
// student conversations so nothing here ever shows up in a student's sidebar
// or gets read by the fact learner.
export const agentChats = sqliteTable("agent_chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const agentMessages = sqliteTable("agent_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").references(() => agentChats.id).notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  text: text("text").notNull().default(""),
  // JSON array of tool steps ({ tool, label, draftId? }) for the UI.
  steps: text("steps").notNull().default("[]"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// Thumbs up / down on an AI answer. The reviewer agent reads thumbs-down
// chats first when it looks for ways to improve the prompt.
export const messageFeedback = sqliteTable(
  "message_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: integer("message_id").references(() => messages.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    rating: text("rating", { enum: ["up", "down"] }).notNull(),
    comment: text("comment"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("message_feedback_message_user").on(t.messageId, t.userId)],
);

// A signup waiting for its 6-digit email code. The password is already
// hashed; the account is only created once the code checks out.
export const emailCodes = sqliteTable("email_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  codeHash: text("code_hash").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(1),
  lastSentAt: text("last_sent_at").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// What the AI has learned about one person's interests, from their own
// chats, plus their cached starter suggestions. Only used for that person.
export const userProfiles = sqliteTable("user_profiles", {
  userId: integer("user_id").primaryKey().references(() => users.id),
  // JSON: [{ topic, score, chats, lastSeen }]
  interests: text("interests").notNull().default("[]"),
  // Set only when the person firmly says what they focus on ("I only do wiring").
  statedFocus: text("stated_focus"),
  // JSON: string[] — the starter chips on their empty chat screen.
  suggestions: text("suggestions").notNull().default("[]"),
  suggestionsGeneratedAt: text("suggestions_generated_at"),
  // True when interests changed since the suggestions were made.
  suggestionsDirty: integer("suggestions_dirty", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Activity log for admin work: who did what, when. Append-only.
export const adminEvents = sqliteTable("admin_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: integer("actor_id").references(() => users.id),
  // Copied in so the log still reads right if an account is deleted.
  actorName: text("actor_name").notNull(),
  // e.g. "prompt.save", "draft.apply", "fact.approve", "doc.delete", "settings.model", "admin.grant"
  action: text("action").notNull(),
  // What it was done to, e.g. "v8", "fact #12", "vertical-mill.md"
  target: text("target"),
  summary: text("summary").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
