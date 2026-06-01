import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

interface AskPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AskPanel({ open, onClose }: AskPanelProps) {
  const [input, setInput] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:3001/api/ask',
    }),
    messages: [],
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Scroll to bottom only on message count change (new message added),
  // not on every streaming token delta. Use instant scroll to avoid
  // overlapping smooth-scroll animations during streaming.
  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length, open]);

  // While streaming, keep the bottom in view by pinning scroll,
  // but only if the user is already near the bottom.
  useEffect(() => {
    if (!open || !isLoading) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, open]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void sendMessage({ text });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim()) handleSubmit();
    }
  }

  return (
    <>
      {/* Backdrop — click to close (plain dim overlay, no blur to avoid FPS drop) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Drawer / fullscreen panel */}
      <div
        className={[
          'fixed z-40 bg-[var(--card-bg)] flex flex-col transition-transform duration-200 ease-out',
          fullscreen
            ? 'top-0 right-0 bottom-0 left-0 w-full'
            : 'top-0 right-0 bottom-0 w-full sm:w-96 border-l border-[var(--border)] shadow-xl',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--text-h)] leading-tight">Ask AI</span>
              <span className="text-[10px] text-[var(--text)] opacity-70 leading-tight">Reference assistant</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                title="Clear conversation"
                className="p-1.5 rounded-lg text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1.5 rounded-lg text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors"
            >
              {fullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v4a1 1 0 0 1-1 1H3" />
                  <path d="M21 8h-4a1 1 0 0 1-1-1V3" />
                  <path d="M3 16h4a1 1 0 0 1 1 1v4" />
                  <path d="M16 21v-4a1 1 0 0 1 1-1h4" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8V4a1 1 0 0 1 1-1h4" />
                  <path d="M16 3h4a1 1 0 0 1 1 1v4" />
                  <path d="M21 16v4a1 1 0 0 1-1 1h-4" />
                  <path d="M8 21H4a1 1 0 0 1-1-1v-4" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
         <div className={[
           'px-4 py-4 space-y-3 mx-auto',
           fullscreen ? 'max-w-3xl w-full' : '',
         ].join(' ')}>
          {messages.length === 0 && (
            <div className="text-center text-sm text-[var(--text)] py-8 px-2">
              <p className="mb-2 font-medium text-[var(--text-h)]">Hi — ask me anything.</p>
              <p className="text-xs opacity-70">I can answer questions using the team's full knowledge base. I won't quiz you.</p>
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const text = msg.parts
              .filter((p) => p.type === 'text')
              .map((p) => (p as { text: string }).text)
              .join('');
            if (!text) return null;
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                    isUser
                      ? 'bg-[var(--accent)] text-white rounded-br-sm'
                      : 'bg-[var(--code-bg)] border border-[var(--border)] text-[var(--text-h)] rounded-bl-sm',
                  ].join(' ')}
                >
                  {text}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-[var(--code-bg)] border border-[var(--border)]">
                <span className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text)] opacity-60 animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
         </div>
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] flex-shrink-0">
        <form
          onSubmit={handleSubmit}
          className={[
            'flex gap-2 items-end px-3 py-3 mx-auto',
            fullscreen ? 'max-w-3xl w-full' : 'w-full',
          ].join(' ')}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            rows={1}
            placeholder="Ask a question…"
            className={[
              'flex-1 resize-none rounded-xl border-2 px-3 py-2 text-sm',
              'bg-[var(--bg)] text-[var(--text-h)] placeholder:text-[var(--text)] placeholder:opacity-60',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              isLoading ? 'opacity-50 cursor-not-allowed border-[var(--border)]' : 'border-[var(--border)] hover:border-[var(--accent-border)]',
            ].join(' ')}
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={[
              'px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-150',
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
    </>
  );
}
