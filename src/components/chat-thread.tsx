import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { API_BASE } from "../lib/api";

interface Props {
  messages: UIMessage[];
  isLoading: boolean;
  userInitial: string;
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex-shrink-0 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
        AI
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-[var(--code-bg)] border border-[var(--border)]">
        <span className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

function MessageBubble({ message, userInitial }: { message: UIMessage; userInitial: string }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-end gap-3 mb-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--accent-bg)] border border-[var(--accent-border)] text-[var(--accent)]"
        }`}
      >
        {isUser ? userInitial : "AI"}
      </div>

      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text) return null;
            return (
              <div
                key={i}
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  isUser
                    ? "bg-[var(--accent)] text-white rounded-br-sm"
                    : "bg-[var(--code-bg)] border border-[var(--border)] text-[var(--text-h)] rounded-bl-sm"
                }`}
              >
                {part.text}
              </div>
            );
          }

          // Photos the student attached.
          if (part.type === "file") {
            const file = part as { url: string; mediaType?: string };
            if (!file.mediaType?.startsWith("image/")) return null;
            const src = file.url.startsWith("http") ? file.url : `${API_BASE}${file.url}`;
            return (
              <img
                key={i}
                src={src}
                alt="Attached photo"
                className="max-w-full max-h-72 rounded-2xl border border-[var(--border)] object-contain"
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export default function ChatThread({ messages, isLoading, userInitial }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, but don't fight the user if they've
  // scrolled up to re-read something.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-lg font-semibold text-[var(--text-h)]">Ask about FRC or robotics</p>
            <p className="text-sm text-[var(--text)] mt-2">
              Machines, wiring, CAD, strategy — or send a photo of something you're working on.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} userInitial={userInitial} />
        ))}

        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
