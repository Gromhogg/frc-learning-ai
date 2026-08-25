import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ConversationSidebar, { type Conversation } from "../components/conversation-sidebar";
import ChatThread from "../components/chat-thread";
import Composer, { type Attachment } from "../components/composer";
import TeacherCodeDialog from "../components/teacher-code-dialog";
import { useAuth } from "../context/auth-context";
import { api, API_BASE } from "../lib/api";

interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  images: string[];
}

/** Turn rows from the database back into messages the chat UI understands. */
function toUIMessages(stored: StoredMessage[]): UIMessage[] {
  return stored.map((m) => ({
    id: String(m.id),
    role: m.role,
    parts: [
      ...m.images.map((url) => ({
        type: "file" as const,
        url: `${API_BASE}${url}`,
        mediaType: "image/jpeg",
      })),
      ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
    ],
  }));
}

export default function Chat() {
  const { user, logout, setSession } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: activeId ? String(activeId) : "none",
    transport: new DefaultChatTransport({
      api: `${API_BASE}/api/chat`,
      headers: () => ({
        Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
      }),
      body: () => ({ conversationId: activeId }),
    }),
    messages: initialMessages,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const loadConversations = useCallback(async () => {
    try {
      return await api<Conversation[]>("/api/conversations");
    } catch {
      return [];
    }
  }, []);

  // On first load, open the most recent chat or start a fresh one.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const list = await loadConversations();
      if (cancelled) return;
      setConversations(list);

      if (list.length > 0) {
        void openConversation(list[0].id);
      } else {
        void startNewChat();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openConversation(id: number) {
    try {
      const data = await api<{ messages: StoredMessage[] }>(`/api/conversations/${id}`);
      const restored = toUIMessages(data.messages);
      setActiveId(id);
      setInitialMessages(restored);
      setMessages(restored);
      setSidebarOpen(false);
    } catch (err) {
      console.error("Could not open that chat:", err);
    }
  }

  async function startNewChat() {
    try {
      const created = await api<Conversation>("/api/conversations", { method: "POST" });
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      setInitialMessages([]);
      setMessages([]);
      setSidebarOpen(false);
    } catch (err) {
      console.error("Could not start a new chat:", err);
    }
  }

  async function deleteConversation(id: number) {
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      const remaining = conversations.filter((conversation) => conversation.id !== id);
      setConversations(remaining);

      if (id === activeId) {
        if (remaining.length > 0) await openConversation(remaining[0].id);
        else await startNewChat();
      }
    } catch (err) {
      console.error("Could not delete that chat:", err);
    }
  }

  function handleSend(text: string, attachments: Attachment[]) {
    if (!activeId) return;

    void sendMessage({
      text,
      files: attachments.map((attachment) => ({
        type: "file" as const,
        url: `${API_BASE}${attachment.url}`,
        mediaType: "image/jpeg",
      })),
    });

    // Move this chat to the top of the sidebar right away, and pick up the
    // title the server generates from the first question.
    void (async () => {
      const list = await loadConversations();
      setConversations(list);
    })();
  }

  if (!user) return null;

  return (
    <div className="flex h-screen max-h-screen bg-[var(--bg)] overflow-hidden">
      {/* Sidebar — a fixed column on desktop, a slide-over on phones */}
      <aside
        className={[
          "fixed md:static inset-y-0 left-0 z-40 w-64 flex-shrink-0",
          "border-r border-[var(--border)] bg-[var(--card-bg)]",
          "transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => void openConversation(id)}
          onNew={() => void startNewChat()}
          onDelete={(id) => void deleteConversation(id)}
        />
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card-bg)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle chat list"
              className="md:hidden p-2 -ml-2 rounded-lg text-[var(--text-h)] hover:bg-[var(--code-bg)] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-[var(--text-h)]">Robotics Chat</span>
          </div>

          <div className="flex items-center gap-2">
            {user.role === "teacher" && (
              <button
                onClick={() => navigate("/prompt")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--accent)] transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Prompt
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--code-bg)] transition-colors"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden sm:block text-sm text-[var(--text-h)]">{user.name}</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-2.5 border-b border-[var(--border)]">
                    <p className="text-sm font-semibold text-[var(--text-h)] truncate">{user.name}</p>
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--accent)] mt-0.5">
                      {user.role}
                    </p>
                  </div>

                  {user.role === "student" && (
                    <button
                      onMouseDown={() => setCodeDialogOpen(true)}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-h)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)] transition-colors"
                    >
                      Enter teacher code
                    </button>
                  )}

                  <button
                    onMouseDown={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <ChatThread
          messages={messages}
          isLoading={isLoading}
          userInitial={user.name.charAt(0).toUpperCase()}
        />

        <Composer disabled={isLoading || !activeId} onSend={handleSend} />
      </div>

      {codeDialogOpen && (
        <TeacherCodeDialog
          onClose={() => setCodeDialogOpen(false)}
          onSuccess={(token, updated) => {
            setSession(token, updated);
            setCodeDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
