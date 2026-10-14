import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type AgentRole, type ModelSettings } from "./admin-api";
import { ApiError, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import { Badge, Skeleton, Spinner } from "../components/ui/misc";
import { PageHeader } from "./components/page-header";

const ROLES: { role: AgentRole; title: string; description: string }[] = [
  {
    role: "tutor",
    title: "Answers students",
    description: "The AI students chat with. It runs on every message, so most of the cost is here.",
  },
  {
    role: "editor",
    title: "Prompt assistant & reviewer",
    description: "Helps admins edit the prompt, and reads recent chats to suggest improvements.",
  },
  {
    role: "learn",
    title: "Learns team facts & interests",
    description: "Reads finished chats in the background to pick up team facts and what each student is into.",
  },
];

export default function SettingsPage() {
  const [data, setData] = useState<ModelSettings | null>(null);
  const [saving, setSaving] = useState<{ role: AgentRole; model: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.settings());
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the settings."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(role: AgentRole, model: string, title: string) {
    if (!data || saving || data.models[role] === model) return;
    setSaving({ role, model });
    try {
      // Send the model we showed, so we never undo someone else's change unseen.
      const result = await adminApi.setModel(role, model, data.models[role]);
      setData({ ...data, models: result.models });
      const label = data.choices.find((c) => c.id === model)?.label ?? model;
      toast.success(`${title} now uses ${label}. It applies from the next message.`);
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Settings"
        description="Pick which Claude model does each job. Cheaper models are faster and cost less; Opus is the smartest but costs the most."
      />

      {data === null ? (
        <div className="flex flex-col gap-4">
          {ROLES.map(({ role }) => (
            <Skeleton key={role} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ROLES.map(({ role, title, description }) => (
            <section key={role} className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-0.5 text-sm text-muted">{description}</p>

              <div role="radiogroup" aria-label={title} className="mt-3 flex flex-col gap-1.5">
                {data.choices.map((choice) => {
                  const current = data.models[role] === choice.id;
                  const busy = saving?.role === role && saving.model === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      disabled={saving !== null}
                      onClick={() => void choose(role, choice.id, title)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                        current ? "border-accent-line bg-accent-soft" : "border-line hover:bg-surface-2",
                        saving !== null && !busy && !current && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                          current ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                        )}
                      >
                        {busy ? <Spinner className="size-3" /> : current ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{choice.label}</span>
                          {current ? <Badge tone="accent">In use</Badge> : null}
                        </span>
                        <span className="block text-xs text-muted">
                          {choice.tier}
                          <span className="sm:hidden"> · {choice.price}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-faint sm:block">{choice.price}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
