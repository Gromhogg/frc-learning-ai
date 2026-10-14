import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { adminApi, type TeamKeyStatus } from "../admin-api";
import { ApiError, errorMessage } from "../../lib/api";
import { timeAgo } from "../../lib/time";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/dialog";
import { Input, Label } from "../../components/ui/input";
import { Skeleton, Spinner } from "../../components/ui/misc";

/** The Settings card for the team's Claude API key (the default everyone uses). */
export function TeamKeyCard() {
  const [data, setData] = useState<TeamKeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.teamKey());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the API key settings."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!data || !key.trim() || saving) return;
    setSaving(true);
    try {
      // Send the key we showed, so we never replace someone else's change unseen.
      setData(await adminApi.setTeamKey(key.trim(), data.setAt));
      setKey("");
      toast.success("Saved. Everyone without their own key now uses this one.");
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!data) return;
    try {
      setData(await adminApi.removeTeamKey(data.setAt));
      toast.success("Removed.");
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await load();
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Team API key</h2>
      <p className="mt-0.5 text-sm text-muted">
        The Claude key everyone's chats use, unless they add their own from the menu. Background jobs (learning facts,
        reviews) always use this one.
      </p>

      {data === null ? (
        <Skeleton className="mt-3 h-28 rounded-xl" />
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            <p className="min-w-0 flex-1 text-fg-2">
              {data.source === "settings" ? (
                <>
                  Key ending in <span className="font-medium text-fg">{data.hint?.slice(1)}</span>, set by{" "}
                  {data.setByName} {timeAgo(data.setAt)}.
                </>
              ) : data.source === "setup" ? (
                <>
                  Using the key from the server setup (ends in{" "}
                  <span className="font-medium text-fg">{data.hint?.slice(1)}</span>).
                </>
              ) : (
                <span className="text-warn">No team key. Only people with their own key can chat.</span>
              )}
            </p>
            {data.source === "settings" ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
                Remove
              </Button>
            ) : null}
          </div>

          <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="team-api-key">{data.source === "none" ? "Add a key" : "Replace with a new key"}</Label>
              <Input
                id="team-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" className="h-10" disabled={!key.trim() || saving}>
              {saving ? <Spinner className="size-4" /> : null}
              {saving ? "Checking…" : "Save key"}
            </Button>
          </form>

          <p className="text-xs text-muted">
            It's checked with Anthropic before saving, stored locked, and never shown again.
            {data.ownKeyCount > 0
              ? ` ${data.ownKeyCount} ${data.ownKeyCount === 1 ? "person uses their" : "people use their"} own key.`
              : ""}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove the team key?"
        description="Chats go back to the key from the server setup, if there is one. Otherwise only people with their own key can chat."
        confirmLabel="Remove"
        danger
        onConfirm={() => void remove()}
      />
    </section>
  );
}
