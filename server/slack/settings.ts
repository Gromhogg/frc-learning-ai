import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings } from "../../db/schema.ts";

// Slack choices admins make on the Settings page, kept in the settings table.

export const ALERT_CHANNEL_KEY = "slack.alertChannel";
export const LEARN_CHANNELS_KEY = "slack.learnChannels";
export const LAST_DIGEST_KEY = "slack.lastDigest";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** The channel id admin alerts go to, or null if none is picked. */
export async function getAlertChannel(): Promise<string | null> {
  return (await getSetting(ALERT_CHANNEL_KEY)) || null;
}

/** Channel ids the bot learns team facts from. */
export async function getLearnChannels(): Promise<string[]> {
  const raw = await getSetting(LEARN_CHANNELS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
