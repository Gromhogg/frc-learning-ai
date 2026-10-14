import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// The app's database: Cloudflare D1 (SQLite in the cloud). Every file imports
// `db` from here. Migrations live in /drizzle and are applied with
// `npx wrangler d1 migrations apply chatbot972` (add --remote for the real one).
export const db = drizzle(env.DB, { schema });
