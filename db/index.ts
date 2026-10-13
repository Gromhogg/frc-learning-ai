import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

mkdirSync("./data", { recursive: true });
const sqlite = new Database("./data/app.db");
// WAL lets the chat stream keep writing while admins read history.
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

/** Bring the database up to date. Safe to call on every start. */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: "./drizzle" });
}
