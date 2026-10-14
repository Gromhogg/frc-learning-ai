import { Hono } from "hono";
import authRouter from "./routes/auth.ts";
import chatRouter from "./routes/chat.ts";
import conversationsRouter from "./routes/conversations.ts";
import uploadsRouter from "./routes/uploads.ts";
import suggestionsRouter from "./routes/suggestions.ts";
import meRouter from "./routes/me.ts";
import adminPromptRouter from "./routes/admin/prompt.ts";
import adminDraftsRouter from "./routes/admin/drafts.ts";
import adminAgentRouter from "./routes/admin/agent.ts";
import adminFactsRouter from "./routes/admin/facts.ts";
import adminDocsRouter from "./routes/admin/docs.ts";
import adminReviewRouter from "./routes/admin/review.ts";
import adminAdminsRouter from "./routes/admin/admins.ts";
import adminSettingsRouter from "./routes/admin/settings.ts";
import adminEventsRouter from "./routes/admin/events.ts";
import adminSlackRouter from "./routes/admin/slack.ts";
import slackRouter from "./routes/slack.ts";
import { ensureDocsMigrated } from "./lib/docs-migration.ts";
import { ensurePromptSectionsMigrated } from "./lib/prompt-sections-migration.ts";

// The whole server: every route the app uses. Runs on Cloudflare Workers (see
// worker.ts). The React app and the API share one address, so no CORS setup.
const app = new Hono();

// One-time data upgrades (flag-guarded, so cheap after the first time): move
// the old inline shop reference into the docs library, then split the
// instructions into editable sections. Run once per server copy, before the
// first request is handled. Never fatal — each logs and retries next time.
let upgrades: Promise<void> | null = null;
app.use("*", async (_c, next) => {
  upgrades ??= (async () => {
    await ensureDocsMigrated();
    await ensurePromptSectionsMigrated();
  })();
  await upgrades;
  await next();
});

// Everyone signed in
app.route("/auth", authRouter);
app.route("/uploads", uploadsRouter);
app.route("/slack", slackRouter);
app.route("/api/chat", chatRouter);
app.route("/api/conversations", conversationsRouter);
app.route("/api/uploads", uploadsRouter);
app.route("/api/suggestions", suggestionsRouter);
app.route("/api/me", meRouter);

// Admins only — each router checks on the server, not just in the UI.
app.route("/api/admin/prompt", adminPromptRouter);
app.route("/api/admin/drafts", adminDraftsRouter);
app.route("/api/admin/agent", adminAgentRouter);
app.route("/api/admin/facts", adminFactsRouter);
app.route("/api/admin/docs", adminDocsRouter);
app.route("/api/admin/review", adminReviewRouter);
app.route("/api/admin/admins", adminAdminsRouter);
app.route("/api/admin/settings", adminSettingsRouter);
app.route("/api/admin/events", adminEventsRouter);
app.route("/api/admin/slack", adminSlackRouter);

export default app;
