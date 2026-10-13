// Which Claude model each agent uses. Change these lines to switch models.
//
//   claude-opus-5-5     $4   / $20  per million tokens  (strongest)
//   claude-sonnet-5-5   $2   / $10  per million tokens
//   claude-haiku-5-5    $0.1 / $0.5 per million tokens  (cheapest)
//
// TUTOR_MODEL answers students. EDITOR_MODEL powers the prompt editor admins
// chat with and the reviewer that reads recent chats — both write prompt
// drafts, so they get the strongest model. LEARN_MODEL quietly pulls team
// facts out of finished chats — a simple task, and every fact is reviewed.
export const TUTOR_MODEL = "claude-sonnet-5-5";
export const EDITOR_MODEL = "claude-opus-5-5";
export const LEARN_MODEL = "claude-haiku-5-5";

// Where the app runs in development.
export const FRONTEND_URL = "http://localhost:5173";
export const SERVER_PORT = Number(process.env.PORT) || 3001;

// Uploaded photos live here, and are served at /uploads/<filename>.
export const UPLOAD_DIR = "data/uploads";

// Reference docs the AI can open mid-answer. Admins manage these from the
// prompt page; replaced and deleted files are moved into the trash folder
// (never destroyed), so nothing an admin wrote can be silently lost.
export const DOCS_DIR = "data/docs";
export const DOCS_TRASH_DIR = "data/docs/.trash";
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
// Extraction runs per conversation batch, not per message: a sweep wakes up
// every LEARN_SWEEP_INTERVAL_MS, and a conversation gets one extraction call
// once it has been quiet for LEARN_IDLE_MINUTES (or has piled up
// LEARN_MAX_EXCHANGES_PER_BATCH unlearned exchanges mid-build-session).
export const LEARN_SWEEP_INTERVAL_MS = 60_000;
export const LEARN_IDLE_MINUTES = 10;
export const LEARN_MAX_EXCHANGES_PER_BATCH = 20;

// Circuit breakers on extraction spend. The global cap bounds the worst day;
// the per-user cap bounds one student spawning conversations all afternoon.
// Counters live in memory and reset at midnight (or on restart) — they're a
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
export const REVIEW_MAX_CHATS = 12; // chats read per review
export const REVIEW_DAILY_RUN_CAP = 6; // on-demand runs per day, across all admins
// Pending drafts pile up if nobody reviews them; past this the reviewer waits.
export const MAX_PENDING_DRAFTS = 10;

// Prompt-editor agent: how many tool calls one admin message may trigger.
export const EDITOR_MAX_TOOL_CALLS = 12;
