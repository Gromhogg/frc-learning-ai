import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftOpen, Settings2, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../auth/auth-context";
import { api, errorMessage } from "../lib/api";
import { useAgentChat, type ChatMessage } from "../hooks/use-agent-chat";
import type { Step } from "../lib/stream";
import { Sidebar, type ConversationSummary } from "../components/chat/sidebar";
import { MessageList } from "../components/chat/message-list";
import { AssistantMessage, UserMessage } from "../components/chat/message";
import { Composer } from "../components/chat/composer";
import { Button } from "../components/ui/button";
import { buttonClass } from "../components/ui/button-class";
import { Logo, Skeleton } from "../components/ui/misc";
import { Tooltip } from "../components/ui/tooltip";

interface SavedMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  images: string[];
  steps: Step[];
  rating: "up" | "down" | null;
}

const STARTERS = [
  "How do I safely set up the vertical mill?",
  "Explain how a swerve drive works",
  "What's the difference between a NEO and a Falcon?",
  "Help me debug my command-based robot code",
];

const SIDEBAR_KEY = "sidebar_open";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const activeId = params.id ? Number(params.id) : null;

  const desktop = useMediaQuery("(min-width: 900px)");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);

  const chat = useAgentChat("/api/chat");
  const { setMessages } = chat;
  // A chat we just created and are already streaming into — don't reload it.
  const justCreated = useRef<number | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setConversations(await api<ConversationSummary[]>("/api/conversations"));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load your chats."));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Load the open chat's messages.
  useEffect(() => {
    if (activeId === null) {
      setMessages([]);
      return;
    }
    if (justCreated.current === activeId) {
      justCreated.current = null;
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    api<{ messages: SavedMessage[] }>(`/api/conversations/${activeId}`)
      .then((data) => {
        if (cancelled) return;
        setMessages(
          data.messages.map(
            (m): ChatMessage => ({
              key: `s${m.id}`,
              id: m.id,
              role: m.role,
              text: m.text,
              images: m.images,
              steps: m.steps,
              rating: m.rating,
              status: "done",
            }),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("That chat couldn't be found.");
        navigate("/", { replace: true });
      })
      .finally(() => !cancelled && setThreadLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeId, navigate, setMessages]);

  function toggleSidebar(open: boolean) {
    if (!desktop) return setMobileOpen(open);
    setSidebarOpen(open);
    try {
      localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
    } catch {
      // not fatal
    }
  }

  async function send(text: string, images: string[]) {
    let id = activeId;
    if (id === null) {
      try {
        const created = await api<ConversationSummary>("/api/conversations", { method: "POST" });
        id = created.id;
        justCreated.current = id;
        setConversations((prev) => [{ ...created, title: text.slice(0, 50) || "New chat" }, ...prev]);
        navigate(`/c/${id}`);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't start a new chat."));
        return;
      }
    }
    await chat.send(text, images, { conversationId: id });
    void refreshList();
  }

  async function rate(message: ChatMessage, rating: "up" | "down" | null) {
    if (!message.id) return;
    setMessages((prev) => prev.map((m) => (m.key === message.key ? { ...m, rating } : m)));
    try {
      await api("/api/chat/feedback", {
        method: "POST",
        body: JSON.stringify({ messageId: message.id, rating }),
      });
      if (rating === "down") toast("Thanks — mentors use this to improve the AI.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(id: number) {
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const newChat = () => {
    navigate("/");
    setMobileOpen(false);
  };

  const title = conversations.find((c) => c.id === activeId)?.title;
  const empty = activeId === null && chat.messages.length === 0;
  const firstName = user?.name.split(" ")[0] ?? "";
  const lastIndex = chat.messages.length - 1;
  const textLength = chat.messages.reduce((n, m) => n + m.text.length + m.steps.length, 0);

  const sidebar = (
    <Sidebar
      conversations={conversations}
      loading={listLoading}
      activeId={activeId}
      onNew={newChat}
      onDelete={remove}
      onCollapse={() => toggleSidebar(false)}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? 272 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="shrink-0 overflow-hidden border-r border-line"
        >
          <div className="h-full w-[272px]">{sidebar}</div>
        </motion.aside>
      ) : null}

      {/* Phone sidebar */}
      <AnimatePresence>
        {!desktop && mobileOpen ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] border-r border-line shadow-float"
            >
              {sidebar}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-3">
          {!desktop || !sidebarOpen ? (
            <>
              <Tooltip label="Open sidebar" side="bottom">
                <Button variant="ghost" size="icon" aria-label="Open sidebar" onClick={() => toggleSidebar(true)}>
                  <PanelLeftOpen />
                </Button>
              </Tooltip>
              <Tooltip label="New chat" side="bottom">
                <Button variant="ghost" size="icon" aria-label="New chat" onClick={newChat}>
                  <SquarePen />
                </Button>
              </Tooltip>
            </>
          ) : null}
          <h1 className="ml-1 min-w-0 flex-1 truncate text-sm font-medium text-fg-2">{title ?? ""}</h1>
          {user?.role === "admin" ? (
            <Link to="/admin" className={buttonClass("outline", "sm")}>
              <Settings2 />
              Admin
            </Link>
          ) : null}
        </header>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh]">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-2xl"
            >
              <div className="mb-8 flex flex-col items-center text-center">
                <Logo size={40} />
                <h2 className="mt-5 text-[28px] font-semibold tracking-tight">
                  What are we building{firstName ? `, ${firstName}` : ""}?
                </h2>
                <p className="mt-2 text-muted">Ask about the shop, the robot, code, CAD — or send a photo.</p>
              </div>
              <Composer busy={chat.busy} onSend={send} onStop={chat.stop} allowPhotos autoFocus />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s, [])}
                    className="rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm text-fg-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            <MessageList watch={textLength} contentClassName="mx-auto w-full max-w-3xl px-4 pt-4 pb-8">
              {threadLoading ? (
                <div className="flex flex-col gap-6 pt-4">
                  <Skeleton className="ml-auto h-10 w-2/5 rounded-3xl" />
                  <Skeleton className="h-24 w-4/5" />
                  <Skeleton className="ml-auto h-10 w-1/3 rounded-3xl" />
                </div>
              ) : (
                <div className="flex flex-col gap-7">
                  {chat.messages.map((m, i) =>
                    m.role === "user" ? (
                      <UserMessage key={m.key} message={m} />
                    ) : (
                      <AssistantMessage
                        key={m.key}
                        message={m}
                        isLast={i === lastIndex}
                        onRetry={
                          i === lastIndex && !chat.busy && activeId !== null
                            ? () => void chat.retry({ conversationId: activeId }).then(refreshList)
                            : undefined
                        }
                        onRate={(r) => void rate(m, r)}
                      />
                    ),
                  )}
                </div>
              )}
            </MessageList>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
              <Composer busy={chat.busy} onSend={send} onStop={chat.stop} allowPhotos placeholder="Reply…" />
              <p className="mt-2 text-center text-xs text-faint">
                The AI can make mistakes. Check with a mentor before running a machine.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
