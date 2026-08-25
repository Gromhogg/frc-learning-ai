import "./lib/env.ts"; // Load .env before anything else
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import authRouter from "./routes/auth.ts";
import chatRouter from "./routes/chat.ts";
import conversationsRouter from "./routes/conversations.ts";
import promptRouter from "./routes/prompt.ts";
import uploadsRouter from "./routes/uploads.ts";
import { FRONTEND_URL, SERVER_PORT } from "./lib/config.ts";

const app = new Hono();

// Allow the Vite dev server to call us.
app.use(
  "*",
  cors({
    origin: FRONTEND_URL,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Photos students upload, served straight off disk.
app.use("/uploads/*", serveStatic({ root: "./data" }));

app.route("/auth", authRouter);
app.route("/api/chat", chatRouter);
app.route("/api/conversations", conversationsRouter);
app.route("/api/prompt", promptRouter);
app.route("/api/uploads", uploadsRouter);

serve({ fetch: app.fetch, port: SERVER_PORT }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

export type AppType = typeof app;
