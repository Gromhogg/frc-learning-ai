import "./lib/env.ts"; // Load .env before anything else
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import usersRouter from "./routes/users.ts";
import topicsRouter from "./routes/topics.ts";
import assessmentsRouter from "./routes/assessments.ts";
import chatRouter from "./routes/chat.ts";
import adminRouter from "./routes/admin.ts";

const app = new Hono();

// CORS — allow requests from the Vite dev server
app.use(
  "*",
  cors({
    origin: "http://localhost:5173",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Mount routes
app.route("/api/users", usersRouter);
app.route("/api/topics", topicsRouter);
app.route("/api/assessments", assessmentsRouter);
app.route("/api/chat", chatRouter);
app.route("/api/admin", adminRouter);

// Start server
serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

export type AppType = typeof app;
