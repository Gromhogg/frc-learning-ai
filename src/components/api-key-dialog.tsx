import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import { Skeleton, Spinner } from "./ui/misc";

interface KeyStatus {
  own: { hint: string; addedAt: string | null } | null;
  /** The team has a key everyone can use. */
  teamKey: boolean;
}

/**
 * Use your own Claude API key instead of the team's, or switch back.
 * The key is checked with Anthropic before it's saved, and never shown again.
 */
export function ApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<KeyStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Fresh copy each time the dialog opens; never keep a typed key around.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<KeyStatus>("/api/me/api-key")
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      setKey("");
    };
  }, [open]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!key.trim() || saving) return;
    setSaving(true);
    try {
      const result = await api<{ own: KeyStatus["own"] }>("/api/me/api-key", {
        method: "PUT",
        body: JSON.stringify({ key: key.trim() }),
      });
      setData((d) => (d ? { ...d, own: result.own } : d));
      setKey("");
      toast.success("Saved. Your chats now use your key.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    try {
      await api("/api/me/api-key", { method: "DELETE" });
      setData((d) => (d ? { ...d, own: null } : d));
      toast.success("Switched back to the team key.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="API key"
        description="Run your chats on your own Claude API key instead of the team's."
        size="sm"
        footer={
          data?.own ? (
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              Use the team key
            </Button>
          ) : undefined
        }
      >
        {data === null && failed ? (
          <p className="text-sm text-muted">Couldn't load this. Try again in a bit.</p>
        ) : data === null ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
              {data.own ? (
                <p className="text-fg-2">
                  Using <span className="font-medium text-fg">your key</span> (ends in {data.own.hint.slice(1)})
                  {data.own.addedAt ? `, added ${timeAgo(data.own.addedAt)}` : ""}.
                </p>
              ) : data.teamKey ? (
                <p className="text-fg-2">
                  Using <span className="font-medium text-fg">the team key</span>.
                </p>
              ) : (
                <p className="text-warn">The team doesn't have a key right now. Add your own to keep chatting.</p>
              )}
            </div>

            <form onSubmit={save} className="flex flex-col gap-2">
              <Label htmlFor="own-api-key">{data.own ? "Replace with a new key" : "Your key"}</Label>
              <Input
                id="own-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={!key.trim() || saving}>
                {saving ? <Spinner className="size-4" /> : null}
                {saving ? "Checking…" : "Save key"}
              </Button>
            </form>

            <p className="text-xs text-muted">
              Get a key at{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent-text underline underline-offset-2"
              >
                console.anthropic.com
              </a>
              . Your chats (here and in Slack) and your suggestions are then billed to you. The key is stored locked
              and never shown again — not even to admins.
            </p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Use the team key?"
        description="Your key is deleted from the app. Your chats go back to the team key."
        confirmLabel="Use the team key"
        onConfirm={() => void reset()}
      />
    </>
  );
}
