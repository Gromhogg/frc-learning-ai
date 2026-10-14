import { useState, type ReactNode } from "react";
import { AlertCircle, Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ChatMessage } from "../../hooks/use-agent-chat";
import { API_BASE } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Markdown } from "../markdown";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Logo } from "../ui/misc";
import { ImageResults } from "./image-results";
import { StepChip } from "./step-chip";

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col items-end gap-2 animate-[rise-in_220ms_var(--ease-out)]">
      {message.images && message.images.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {message.images.map((src) => (
            <a key={src} href={`${API_BASE}${src}`} target="_blank" rel="noreferrer">
              <img
                src={`${API_BASE}${src}`}
                alt="Attached photo"
                className="h-40 max-w-[16rem] rounded-2xl border border-line object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      {message.text ? (
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-[17px] leading-relaxed whitespace-pre-wrap">
          {message.text}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantMessage({
  message,
  isLast,
  onRetry,
  onRate,
  extras,
  avatar = true,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRetry?: () => void;
  onRate?: (rating: "up" | "down" | null) => void;
  /** Extra content under the reply, e.g. draft cards in the admin panel. */
  extras?: ReactNode;
  avatar?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const streaming = message.status === "streaming";
  const showActions = !streaming && (message.text || message.error);

  return (
    <div className="group flex gap-3.5 animate-[rise-in_220ms_var(--ease-out)]">
      {avatar ? (
        <div className="pt-0.5">
          <Logo size={26} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {message.steps.length > 0 ? (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {message.steps.map((step) => (
              <StepChip key={step.id} step={step} />
            ))}
          </div>
        ) : null}

        {message.thinking && !message.text ? (
          <p className="text-shimmer py-1 text-[17px]">Thinking…</p>
        ) : null}

        {message.text ? (
          <Markdown text={message.text} className={cn("text-[17px]", streaming && "caret")} />
        ) : null}

        <ImageResults steps={message.steps} />

        {extras}

        {message.error ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-transparent bg-bad-soft px-3 py-2.5 text-sm text-bad">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{message.error}</span>
            {isLast && onRetry ? (
              <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {showActions ? (
          <div
            className={cn(
              "mt-1.5 -ml-1.5 flex items-center gap-0.5 text-muted transition-opacity",
              isLast ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
            )}
          >
            {message.text ? (
              <Tooltip label={copied ? "Copied" : "Copy"}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(message.text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </Tooltip>
            ) : null}
            {onRate && message.id ? (
              <>
                <Tooltip label="Good answer">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Good answer"
                    aria-pressed={message.rating === "up"}
                    className={cn(message.rating === "up" && "text-good")}
                    onClick={() => onRate(message.rating === "up" ? null : "up")}
                  >
                    <ThumbsUp className={cn(message.rating === "up" && "fill-current")} />
                  </Button>
                </Tooltip>
                <Tooltip label="Bad answer">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Bad answer"
                    aria-pressed={message.rating === "down"}
                    className={cn(message.rating === "down" && "text-bad")}
                    onClick={() => onRate(message.rating === "down" ? null : "down")}
                  >
                    <ThumbsDown className={cn(message.rating === "down" && "fill-current")} />
                  </Button>
                </Tooltip>
              </>
            ) : null}
            {isLast && onRetry && !message.error ? (
              <Tooltip label="Try again">
                <Button variant="ghost" size="icon-sm" aria-label="Try again" onClick={onRetry}>
                  <RotateCcw />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
