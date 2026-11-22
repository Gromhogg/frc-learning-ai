import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { adminApi, type PaidProvider, type TeamKeyInfo, type TeamKeys } from "../admin-api";
import { ApiError, errorMessage } from "../../lib/api";
import { timeAgo } from "../../lib/time";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/dialog";
import { Input, Label } from "../../components/ui/input";
import { Skeleton, Spinner } from "../../components/ui/misc";

const KEY_TYPES: { provider: PaidProvider; name: string; placeholder: string; consoleUrl: string; consoleName: string }[] = [
  {
    provider: "anthropic",
    name: "Claude",
    placeholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleName: "console.anthropic.com",
  },
  {
    provider: "openai",
    name: "OpenAI",
    placeholder: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleName: "platform.openai.com",
  },
];

/**
 * The Settings card for the team's optional Claude and OpenAI keys. Each one
 * unlocks that company's models in the model lists. `onChange` runs after a
 * key is saved or removed, so the lists can update.
 */
export function TeamKeyCard({ onChange }: { onChange: () => void }) {
  const [data, setData] = useState<TeamKeys | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.teamKeys());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the API key settings."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .teamKeys()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => toast.error(errorMessage(err, "Couldn't load the API key settings.")));
    return () => {
      cancelled = true;
    };
  }, []);

  function changed(next: TeamKeys) {
    setData(next);
    onChange();
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Paid AI keys (optional)</h2>
      <p className="mt-0.5 text-sm text-muted">
        Everything runs on the free model until you add a key. A key lets you pick that company's models below, and the
        team pays for what they use.
      </p>

      {data === null ? (
        <Skeleton className="mt-3 h-40 rounded-xl" />
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {KEY_TYPES.map((type) => (
            <KeyRow key={type.provider} type={type} info={data[type.provider]} onChanged={changed} onConflict={load} />
          ))}
          <p className="text-xs text-muted">
            Keys are checked with their company before saving, stored locked, and never shown again.
            {data.ownKeyCount > 0
              ? ` ${data.ownKeyCount} ${data.ownKeyCount === 1 ? "person uses their" : "people use their"} own key.`
              : ""}
          </p>
        </div>
      )}
    </section>
  );
}

function KeyRow({
  type,
  info,
  onChanged,
  onConflict,
}: {
  type: (typeof KEY_TYPES)[number];
  info: TeamKeyInfo;
  onChanged: (next: TeamKeys) => void;
  onConflict: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputId = `team-key-${type.provider}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!key.trim() || saving) return;
    setSaving(true);
    try {
      // Send the key we showed, so we never replace someone else's change unseen.
      onChanged(await adminApi.setTeamKey(type.provider, key.trim(), info.setAt));
      setKey("");
      toast.success(`Saved. You can now pick ${type.name} models below.`);
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await onConflict();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      onChanged(await adminApi.removeTeamKey(type.provider, info.setAt));
      toast.success("Removed.");
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await onConflict();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
        <p className="min-w-0 flex-1 text-fg-2">
          <span className="font-medium text-fg">{type.name} key: </span>
          {info.source === "settings" ? (
            <>
              ends in <span className="font-medium text-fg">{info.hint?.slice(1)}</span>, set by {info.setByName}{" "}
              {timeAgo(info.setAt)}.
            </>
          ) : info.source === "setup" ? (
            <>
              from the server setup (ends in <span className="font-medium text-fg">{info.hint?.slice(1)}</span>).
            </>
          ) : (
            <span className="text-muted">none</span>
          )}
        </p>
        {info.source === "settings" ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            Remove
          </Button>
        ) : null}
      </div>

      <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={inputId}>
            {info.source === "none" ? `Add a ${type.name} key` : `Replace the ${type.name} key`}
          </Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={type.placeholder}
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
        Get one at{" "}
        <a href={type.consoleUrl} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
          {type.consoleName}
        </a>
        .
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove the ${type.name} key?`}
        description={`Anything set to a ${type.name} model goes back to the free model. People with their own key aren't affected.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => void remove()}
      />
    </div>
  );
}
