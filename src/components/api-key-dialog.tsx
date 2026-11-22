import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import { timeAgo } from "../lib/time";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/input";
import { Skeleton, Spinner } from "./ui/misc";

type PaidProvider = "anthropic" | "openai";

interface Choice {
  id: string;
  provider: PaidProvider;
  label: string;
  tier: string;
  price: string;
}

interface OwnKey {
  hint: string;
  model: string;
  addedAt: string | null;
}

interface KeyStatus {
  own: OwnKey | null;
  /** The team's AI, used when you don't have your own key. */
  team: { model: string; free: boolean; usedUp: boolean; backAt: string };
  choices: Choice[];
}

const COMPANY: Record<PaidProvider, string> = { anthropic: "Claude", openai: "OpenAI" };

/** Which company a pasted key is from, going by how it starts. */
function providerOfKey(key: string): PaidProvider | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

/**
 * Run your chats on your own Claude or OpenAI key, with a model you pick,
 * instead of the team's AI. The key is checked with its company before it's
 * saved, and never shown again.
 */
export function ApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<KeyStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState("");
  const [pickedForNewKey, setPickedForNewKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
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
      setPickedForNewKey(null);
    };
  }, [open]);

  const ownProvider = data?.own ? data.choices.find((c) => c.id === data.own?.model)?.provider ?? null : null;
  const newKeyProvider = providerOfKey(key.trim());
  const newKeyChoices = data && newKeyProvider ? data.choices.filter((c) => c.provider === newKeyProvider) : [];
  // Start a new key on the balanced model (the middle one).
  const newKeyModel =
    pickedForNewKey && newKeyChoices.some((c) => c.id === pickedForNewKey)
      ? pickedForNewKey
      : newKeyChoices[Math.floor(newKeyChoices.length / 2)]?.id;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!key.trim() || saving) return;
    setSaving(true);
    try {
      const result = await api<{ own: OwnKey }>("/api/me/api-key", {
        method: "PUT",
        body: JSON.stringify({ key: key.trim(), model: newKeyModel }),
      });
      setData((d) => (d ? { ...d, own: result.own } : d));
      setKey("");
      setPickedForNewKey(null);
      toast.success("Saved. Your chats now use your key.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function switchModel(model: string) {
    if (!data?.own || switching || data.own.model === model) return;
    setSwitching(model);
    try {
      const result = await api<{ own: OwnKey }>("/api/me/api-key/model", {
        method: "PUT",
        body: JSON.stringify({ model }),
      });
      setData((d) => (d ? { ...d, own: result.own } : d));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSwitching(null);
    }
  }

  async function reset() {
    try {
      await api("/api/me/api-key", { method: "DELETE" });
      setData((d) => (d ? { ...d, own: null } : d));
      toast.success("Switched back to the team's AI.");
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
        description="Run your chats on your own Claude or OpenAI key, with the model you pick."
        size="sm"
        footer={
          data?.own ? (
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              Use the team's AI
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
              {data.own && ownProvider ? (
                <p className="text-fg-2">
                  Using <span className="font-medium text-fg">your {COMPANY[ownProvider]} key</span> (ends in{" "}
                  {data.own.hint.slice(1)}){data.own.addedAt ? `, added ${timeAgo(data.own.addedAt)}` : ""}.
                </p>
              ) : (
                <p className="text-fg-2">
                  Using <span className="font-medium text-fg">the team's AI</span>: {data.team.model}
                  {data.team.free ? " (free)" : ""}.
                  {data.team.usedUp ? (
                    <span className="text-warn"> It's used up for today and back at {data.team.backAt}.</span>
                  ) : null}
                </p>
              )}
            </div>

            {data.own && ownProvider ? (
              <ModelPicker
                label="Your model"
                choices={data.choices.filter((c) => c.provider === ownProvider)}
                value={data.own.model}
                busy={switching}
                onPick={(id) => void switchModel(id)}
              />
            ) : null}

            <form onSubmit={save} className="flex flex-col gap-2">
              <Label htmlFor="own-api-key">{data.own ? "Replace with a new key" : "Your key"}</Label>
              <Input
                id="own-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-… or sk-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              {newKeyProvider && newKeyModel ? (
                <ModelPicker
                  label={`Model for your ${COMPANY[newKeyProvider]} key`}
                  choices={newKeyChoices}
                  value={newKeyModel}
                  busy={null}
                  onPick={setPickedForNewKey}
                />
              ) : null}
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
              </a>{" "}
              (Claude) or{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent-text underline underline-offset-2"
              >
                platform.openai.com
              </a>{" "}
              (OpenAI). You pay that company for what you use.
            </p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Use the team's AI?"
        description="Your key is deleted from the app. Your chats go back to the team's AI."
        confirmLabel="Use the team's AI"
        onConfirm={() => void reset()}
      />
    </>
  );
}

function ModelPicker({
  label,
  choices,
  value,
  busy,
  onPick,
}: {
  label: string;
  choices: Choice[];
  value: string;
  busy: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
        {choices.map((choice) => {
          const current = choice.id === value;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={current}
              disabled={busy !== null}
              onClick={() => onPick(choice.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-default",
                current ? "border-accent-line bg-accent-soft" : "border-line hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  current ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                )}
              >
                {busy === choice.id ? (
                  <Spinner className="size-3" />
                ) : current ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{choice.label}</span>
                <span className="block text-xs text-muted">
                  {choice.tier} · {choice.price}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
