import { useEffect, useRef } from 'react';
import { type UIMessage, isToolUIPart, getToolName } from 'ai';
import QuizWidget, { type QuizWidgetProps } from './quiz-widget';
import ChecklistWidget, { type ChecklistWidgetProps } from './checklist-widget';

interface ChatInterfaceProps {
  messages: UIMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e?: React.FormEvent) => void;
  isLoading: boolean;
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

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
          isUser
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--accent-bg)] border border-[var(--accent-border)] text-[var(--accent)]'
        }`}
      >
        {isUser ? 'You' : 'AI'}
      </div>

      {/* Parts */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div
                key={i}
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-[var(--accent)] text-white rounded-br-sm'
                    : 'bg-[var(--code-bg)] border border-[var(--border)] text-[var(--text-h)] rounded-bl-sm'
                }`}
              >
                {part.text}
              </div>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            // Render once input is complete — covers input-available (before execute)
            // and output-available (after execute returns)
            const args = (part.state === 'input-available' || part.state === 'output-available')
              ? (part.input as Record<string, unknown>)
              : undefined;

            if (toolName === 'showQuiz' && args) {
              return (
                <QuizWidget
                  key={i}
                  question={args.question as QuizWidgetProps['question']}
                  options={args.options as QuizWidgetProps['options']}
                  correctIndex={args.correctIndex as QuizWidgetProps['correctIndex']}
                />
              );
            }

            if (toolName === 'showChecklist' && args) {
              return (
                <ChecklistWidget
                  key={i}
                  title={args.title as ChecklistWidgetProps['title']}
                  items={args.items as ChecklistWidgetProps['items']}
                />
              );
            }

            // Fallback for unknown tools
            return (
              <div
                key={i}
                data-tool={toolName}
                className="px-4 py-3 rounded-2xl text-xs bg-[var(--code-bg)] border border-[var(--accent-border)] text-[var(--text)] rounded-bl-sm font-mono"
              >
                <span className="font-semibold text-[var(--accent)]">[Tool: {toolName}]</span>
                {args !== undefined && (
                  <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(args, null, 2)}</pre>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export default function ChatInterface({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) {
        handleSubmit();
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[var(--text)] py-8">
            Send a message to start the session.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] px-4 py-4 bg-[var(--bg)] shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isLoading && input.trim()) handleSubmit(e);
          }}
          className="flex gap-2 items-end"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            rows={1}
            placeholder="Type a message… (Shift+Enter for newline)"
            className={[
              'flex-1 resize-none rounded-xl border-2 px-4 py-2.5 text-sm font-medium',
              'bg-[var(--code-bg)] text-[var(--text-h)] placeholder:text-[var(--text)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              'transition-colors duration-150',
              isLoading ? 'opacity-50 cursor-not-allowed border-[var(--border)]' : 'border-[var(--border)] hover:border-[var(--accent-border)]',
            ].join(' ')}
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={[
              'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              isLoading || !input.trim()
                ? 'bg-[var(--border)] text-[var(--text)] cursor-not-allowed'
                : 'bg-[var(--accent)] text-white hover:opacity-90 active:scale-95',
            ].join(' ')}
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
