import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import { useVoiceInput } from "../hooks/use-voice-input";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { Badge, Skeleton, Spinner } from "./ui/misc";
import { Tooltip } from "./ui/tooltip";
import { VoiceMeter } from "./chat/voice-meter";

interface Interests {
  topics: { topic: string; strong: boolean }[];
  statedFocus: string | null;
  about: string | null;
}

/**
 * What the AI knows about this person's interests (it shapes their starter
 * suggestions). They can type or say what they're into, and the AI turns it
 * into topics. Also a button to clear it all.
 */
export function InterestsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<Interests | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const voice = useVoiceInput(setText);
  const listening = voice.status === "listening" || voice.status === "starting";
  const finishing = voice.status === "finishing";

  async function describe() {
    if (saving) return;
    const words = listening ? await voice.stop() : text;
    const typed = (words ?? text).trim();
    if (!typed) return;
    setSaving(true);
    try {
      const next = await api<Interests>("/api/me/interests/describe", {
        method: "POST",
        body: JSON.stringify({ text: typed }),
      });
      setData(next);
      setText("");
      toast.success("Got it. Your suggestions will update soon.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Fresh copy each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<Interests>("/api/me/interests")
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
    };
  }, [open]);

  async function clear() {
    setClearing(true);
    try {
      await api("/api/me/interests", { method: "DELETE" });
      setData({ topics: [], statedFocus: null, about: null });
      toast.success("Cleared. The AI will start fresh.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  const empty = !!data && data.topics.length === 0 && !data.statedFocus && !data.about;
  // Strong topics first, then the lighter ones.
  const topics = data ? [...data.topics.filter((t) => t.strong), ...data.topics.filter((t) => !t.strong)] : [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Your interests"
        size="sm"
        footer={
          data && !empty ? (
            <Button variant="ghost" onClick={() => setConfirmOpen(true)} disabled={clearing}>
              Clear
            </Button>
          ) : undefined
        }
      >
        {data === null && failed ? (
          <p className="text-sm text-muted">Couldn't load your interests. Try again in a bit.</p>
        ) : data === null ? (
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ) : empty ? (
          <p className="text-sm text-muted">Nothing yet. Tell the AI below, or just chat.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.about ? <p className="text-sm text-fg-2">{data.about}</p> : null}
            {data.statedFocus ? (
              <p className="text-sm text-fg-2">
                You said you focus on: <span className="font-medium text-fg">{data.statedFocus}</span>
              </p>
            ) : null}
            {topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) =>
                  t.strong ? (
                    <Badge key={t.topic} tone="accent">
                      {t.topic}
                    </Badge>
                  ) : (
                    <span
                      key={t.topic}
                      className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs whitespace-nowrap text-muted"
                    >
                      {t.topic}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor="describe-interests" className="text-sm font-medium text-fg">
            Tell the AI what you're into
          </label>
          <Textarea
            id="describe-interests"
            rows={3}
            maxLength={2000}
            className="mt-1.5"
            placeholder="For example: I'm in my second year. I mostly do programming in Java and want to learn CAD."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (listening) voice.edit(e.target.value);
            }}
            disabled={saving}
          />
          <div className="mt-2 flex items-center gap-2">
            {voice.supported ? (
              <Tooltip label={listening ? "Stop listening" : "Talk to type"}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={listening ? "Stop listening" : "Talk to type"}
                  aria-pressed={listening}
                  className={cn("rounded-full", listening ? "!bg-accent-soft !text-accent-text" : "text-muted")}
                  disabled={finishing || saving}
                  onClick={() => (listening ? void voice.stop() : voice.start(text))}
                >
                  {voice.status === "starting" || finishing ? <Spinner /> : <Mic />}
                </Button>
              </Tooltip>
            ) : null}
            {voice.status === "listening" ? <VoiceMeter analyser={voice.analyser} startedAt={voice.startedAt} /> : null}
            <div className="flex-1" />
            <Button variant="primary" onClick={() => void describe()} disabled={saving || finishing || (!text.trim() && !listening)}>
              {saving ? <Spinner /> : null}
              Save
            </Button>
          </div>
          {voice.message ? (
            <p className={cn("mt-2 text-sm", voice.message.tone === "error" ? "text-bad" : "text-muted")}>
              {voice.message.text}
            </p>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-muted">
          The AI uses this, and what it picks up from your chats, to suggest questions. Only you can see it.
        </p>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear your interests?"
        description="The AI forgets everything here, and your suggestions go away. It starts learning again from new chats."
        confirmLabel="Clear"
        danger
        onConfirm={() => void clear()}
      />
    </>
  );
}
