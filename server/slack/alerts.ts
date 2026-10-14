import { isSlackConfigured, postMessage, SlackApiError } from "./api.ts";
import { getAlertChannel } from "./settings.ts";
import { escapeSlack } from "./format.ts";

// Messages for admins, posted in the Slack channel they picked on the
// Settings page. Alerts are a nice extra: they never throw, and do nothing
// when Slack isn't set up or no channel is picked.

/** The app's public address, without a trailing slash. */
export function appUrl(): string {
  return (process.env.APP_URL || "").replace(/\/+$/, "");
}

export type AlertResult = { ok: true } | { ok: false; reason: "not-configured" | "no-channel" | "slack-error"; error?: string };

/** Post to the alerts channel and say exactly what happened. */
export async function sendAdminAlert(text: string, blocks?: unknown[]): Promise<AlertResult> {
  try {
    if (!isSlackConfigured()) return { ok: false, reason: "not-configured" };
    const channel = await getAlertChannel();
    if (!channel) return { ok: false, reason: "no-channel" };
    await postMessage({ channel, text, blocks });
    return { ok: true };
  } catch (err) {
    console.error("[slack] admin alert failed:", err);
    return { ok: false, reason: "slack-error", error: err instanceof SlackApiError ? err.code : String(err) };
  }
}

/** Post to the alerts channel if there is one. Never throws. */
export async function postAdminAlert(text: string, blocks?: unknown[]): Promise<void> {
  await sendAdminAlert(text, blocks);
}

/** The reviewer just suggested a prompt change. */
export async function alertNewSuggestion(title: string): Promise<void> {
  const link = `${appUrl()}/admin/suggestions`;
  await postAdminAlert(`💡 New prompt suggestion: ${escapeSlack(title)} — ${link}`);
}
