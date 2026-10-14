import { AlertCircle, BookOpen, Check, FileDiff, Globe, Images, MessagesSquare, ScrollText, Search } from "lucide-react";
import type { Step } from "../../lib/stream";
import { cn } from "../../lib/cn";
import { Spinner } from "../ui/misc";

const ICONS: Record<string, typeof BookOpen> = {
  read_doc: BookOpen,
  find_images: Images,
  web_search: Globe,
  get_prompt: ScrollText,
  search_chats: Search,
  read_chat: MessagesSquare,
  propose_change: FileDiff,
};

/** A small pill showing something the AI did, e.g. "Reading vertical-mill.md". */
export function StepChip({ step }: { step: Step }) {
  const Icon = ICONS[step.tool] ?? Check;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        "animate-[rise-in_200ms_var(--ease-out)]",
        step.status === "error" ? "border-transparent bg-bad-soft text-bad" : "border-line bg-surface text-muted",
      )}
    >
      {step.status === "running" ? (
        <Spinner className="size-3" />
      ) : step.status === "error" ? (
        <AlertCircle className="size-3.5" />
      ) : (
        <Icon className="size-3.5" />
      )}
      <span className={cn("truncate", step.status === "running" && "text-shimmer")}>{step.label}</span>
    </span>
  );
}
