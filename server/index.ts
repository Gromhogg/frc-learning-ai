import "./lib/env.ts"; // Load .env before anything else
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { runMigrations } from "../db/index.ts";
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
import { FRONTEND_URL, SERVER_PORT } from "./lib/config.ts";
import { ensureDocsMigrated } from "./lib/docs-migration.ts";
import { ensurePromptSectionsMigrated } from "./lib/prompt-sections-migration.ts";
import { startLearnScheduler } from "./lib/learn.ts";
import { startReviewScheduler } from "./agents/reviewer.ts";

// Bring the database schema up to date before anything reads it.
runMigrations();

const app = new Hono();

// Allow the Vite dev server to call us.
app.use(
  "*",
  cors({
    origin: [FRONTEND_URL, FRONTEND_URL.replace("localhost", "127.0.0.1")],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Photos students upload, served straight off disk.
app.use("/uploads/*", serveStatic({ root: "./data" }));

// Everyone signed in
app.route("/auth", authRouter);
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

// One-time move of the old inline shop reference into the docs library,
// then the one-time split of the instructions into editable sections — in
// that order, since the docs migration may rewrite the prompt head first.
// Never fatal — each logs and retries on the next start if something breaks.
await ensureDocsMigrated();
await ensurePromptSectionsMigrated();

// Background work: fact extraction from quiet chats, and the daily review
// that drafts prompt improvements for admins to approve.
startLearnScheduler();
startReviewScheduler();

serve({ fetch: app.fetch, port: SERVER_PORT }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

export type AppType = typeof app;
