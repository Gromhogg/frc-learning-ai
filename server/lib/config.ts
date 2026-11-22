// Which AI model each agent uses when no admin has picked one on the
// Settings page. All three start on the free model (Gemma 4, run by
// Cloudflare Workers AI). Admins can switch any of them to a Claude or GPT
// model once they add that company's key. The full list is in ai/models.ts.
//
// TUTOR_MODEL answers students. EDITOR_MODEL powers the prompt editor admins
// chat with and the reviewer that reads recent chats. LEARN_MODEL quietly
// pulls team facts out of finished chats and writes starter suggestions.
export const FREE_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const TUTOR_MODEL = FREE_MODEL;
export const EDITOR_MODEL = FREE_MODEL;
export const LEARN_MODEL = FREE_MODEL;

// The free model's daily budget, in Cloudflare "neurons". Cloudflare gives
// 10,000 a day for free (it starts over at midnight UTC) and the mic button's
// voice-to-text uses some too. One chat answer is about 12. Chats stop at
// FREE_DAILY_NEURONS; background jobs stop earlier, so they never use up
// what students need.
export const FREE_DAILY_NEURONS = 9_000;
export const FREE_BACKGROUND_NEURONS = 6_000;

// The app's public address, with no "/" at the end. Set in wrangler.jsonc
// (the workers.dev address once it's live). Used for Google sign-in.
export const APP_URL = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");

// Reference docs the AI can open mid-answer. Admins manage these from the
// prompt page; they're kept in the R2 bucket (see docs.ts).
export const MAX_DOC_BYTES = 100 * 1024; // docs are prompt-fed text; 100 KB is already a lot of it

// How many docs the AI may open while answering a single message.
export const MAX_DOC_READS_PER_TURN = 3;

// Cap on how many APPROVED facts the prompt carries. Without a cap the list
// grows forever and eventually crowds out the admin's actual prompt.
// Approving past the cap is refused — an admin removes one first; curated
// facts are never auto-deleted.
export const MAX_TEAM_FACTS = 60;

// ─── Fact learning (background extraction) ─────────────────────────────────
//
// Extraction runs per conversation batch, not per message: a sweep runs
// every 5 minutes (the timed job in wrangler.jsonc), and a conversation gets
// one extraction call once it has been quiet for LEARN_IDLE_MINUTES (or has
// piled up LEARN_MAX_EXCHANGES_PER_BATCH unlearned exchanges mid-build-session).
export const LEARN_IDLE_MINUTES = 10;
export const LEARN_MAX_EXCHANGES_PER_BATCH = 20;

// Circuit breakers on extraction spend. The global cap bounds the worst day;
// the per-user cap bounds one student spawning conversations all afternoon.
// Counters live in the database and start over each day (UTC) — they're a
// soft brake, not an audit.
export const LEARN_DAILY_CALL_CAP = 200;
export const LEARN_MAX_CALLS_PER_USER_DAY = 10;

// Queue hygiene: pending facts an admin never reviews expire oldest-first
// past MAX_PENDING_FACTS, one student can hold at most MAX_PENDING_PER_USER
// spots, and the rejected blocklist keeps its most recent MAX_REJECTED_KEPT.
export const MAX_PENDING_FACTS = 40;
export const MAX_PENDING_PER_USER = 10;
export const MAX_REJECTED_KEPT = 200;

// ─── Self-improvement (reviewer agent) ─────────────────────────────────────
//
// The reviewer reads recent student chats and drafts prompt changes for an
// admin to approve. It runs once a day on its own (if there are new chats)
// and whenever an admin clicks "Review recent chats".
export const REVIEW_INTERVAL_HOURS = 24;
export const REVIEW_MAX_CHATS = 20; // chats read per review
export const REVIEW_DAILY_RUN_CAP = 6; // on-demand runs per day, across all admins
// Pending drafts pile up if nobody reviews them; past this the reviewer waits.
export const MAX_PENDING_DRAFTS = 10;

// Prompt-editor agent: how many tool calls one admin message may trigger.
export const EDITOR_MAX_TOOL_CALLS = 12;
