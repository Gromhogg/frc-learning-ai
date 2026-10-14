import { useCallback, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type SlackSettings } from "../admin-api";
import { errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/input";
import { Skeleton, Spinner } from "../../components/ui/misc";

const INVITE_FIRST = "Invite @972 Chat Bot to this channel first";

type Ready = Extract<SlackSettings, { configured: true }>;

/** The Slack card on the Settings page: where alerts go, and which channels the bot learns from. */
export function SlackSettingsCard() {
  const [data, setData] = useState<SlackSettings | null>(null);
  const [alertChannel, setAlertChannel] = useState("");
  const [learnChannels, setLearnChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const show = useCallback((next: SlackSettings) => {
    setData(next);
    if (next.configured) {
      setAlertChannel(next.alertChannel ?? "");
      setLearnChannels(next.learnChannels);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      show(await adminApi.slack());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the Slack settings."));
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready: Ready | null = data?.configured ? data : null;
  const changed = useMemo(() => {
    if (!ready) return false;
    const saved = new Set(ready.learnChannels);
    return (
      (ready.alertChannel ?? "") !== alertChannel ||
      saved.size !== learnChannels.length ||
      learnChannels.some((id) => !saved.has(id))
    );
  }, [ready, alertChannel, learnChannels]);

  // Channels the bot is in come first.
  const channels = useMemo(
    () => [...(ready?.channels ?? [])].sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name)),
    [ready],
  );

  async function save() {
    setSaving(true);
    try {
      show(await adminApi.saveSlack(alertChannel || null, learnChannels));
      toast.success("Slack settings saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await adminApi.testSlackAlert();
      toast.success("Test alert sent. Check the channel in Slack.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  function toggle(id: string, on: boolean) {
    setLearnChannels((list) => (on ? [...list, id] : list.filter((x) => x !== id)));
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Slack</h2>
      <p className="mt-0.5 text-sm text-muted">
        Students can chat with the bot in Slack. Admins can get alerts there, and the bot can pick up team facts from
        chosen channels.
      </p>

      {data === null ? (
        <Skeleton className="mt-3 h-24 rounded-xl" />
      ) : !data.configured ? (
        <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-fg-2">
          <p className="font-medium">Slack isn't set up yet.</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-muted">
            <li>Set up the Slack app — see the README.</li>
            <li>Add the bot token and signing secret to the server.</li>
            <li>Come back here to pick channels.</li>
          </ol>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {data.error ? (
            <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{data.error}</p>
          ) : (
            <p className="text-sm text-fg-2">
              Connected to <span className="font-medium">{data.team}</span>
              {data.botName ? (
                <>
                  {" "}
                  as <span className="font-medium">@{data.botName}</span>
                </>
              ) : null}
              .
            </p>
          )}

          <div>
            <Label htmlFor="slack-alert-channel">Alerts channel</Label>
            <select
              id="slack-alert-channel"
              value={alertChannel}
              onChange={(e) => setAlertChannel(e.target.value)}
              className={cn(
                "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg",
                "transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15",
              )}
            >
              <option value="">No alerts</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id} disabled={!ch.isMember}>
                  #{ch.name}
                  {ch.isMember ? "" : ` — ${INVITE_FIRST.toLowerCase()}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              New prompt suggestions, plus a daily check-in around 4 pm when something is waiting.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">Learn team facts from</p>
            {channels.length === 0 ? (
              <p className="text-sm text-muted">No channels found.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {channels.map((ch) => {
                  const checked = learnChannels.includes(ch.id);
                  return (
                    <li key={ch.id}>
                      <label
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 text-sm",
                          ch.isMember ? "cursor-pointer hover:bg-surface-2" : "cursor-default opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-accent"
                          checked={checked}
                          disabled={!ch.isMember && !checked}
                          onChange={(e) => toggle(ch.id, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1 truncate">#{ch.name}</span>
                        {ch.isMember ? null : <span className="shrink-0 text-xs text-faint">{INVITE_FIRST}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted">
              The bot reads these channels to suggest team facts. Names are never saved, and every fact waits for an
              admin to approve it.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={testing || changed || !data.alertChannel}
              title={changed ? "Save first" : !data.alertChannel ? "Pick an alerts channel first" : undefined}
              onClick={() => void sendTest()}
            >
              {testing ? <Spinner className="size-3.5" /> : <Send />}
              Send test alert
            </Button>
            <Button variant="primary" disabled={!changed || saving} onClick={() => void save()}>
              {saving ? <Spinner className="size-3.5" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
