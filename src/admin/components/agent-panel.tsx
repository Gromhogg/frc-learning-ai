import { useCallback, useEffect, useState } from "react";
import { History, SquarePen, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "../../lib/api";
import { useAgentChat, type ChatMessage } from "../../hooks/use-agent-chat";
import type { Step } from "../../lib/stream";
import { timeAgo } from "../../lib/time";
import { adminApi, type Draft } from "../admin-api";
import { MessageList } from "../../components/chat/message-list";
import { AssistantMessage, UserMessage } from "../../components/chat/message";
import { Composer } from "../../components/chat/composer";
import { Button } from "../../components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../../components/ui/menu";
import { Tooltip } from "../../components/ui/tooltip";
import { DraftCard } from "./draft-card";

interface AgentChat {
  id: number;
  title: string;
  updatedAt: string | null;
}

const IDEAS = [
  "Make answers shorter for beginners",
  "Ask a follow-up question to check understanding",
  "Look at recent chats — what's going wrong?",
  "Add a rule: always mention safety glasses for the mill",
];

/**
 * Chat with the prompt assistant. It reads the prompt and student chats and
 * proposes changes as drafts, which show up here with Apply / Dismiss.
 */
export function AgentPanel({ onApplied }: { onApplied: () => void }) {
  const [chatId, setChatId] = useState<number | null>(null);
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const chat = useAgentChat(chatId ? `/api/admin/agent/${chatId}/messages` : null);
  const { setMessages } = chat;

  const loadChats = useCallback(() => {
    api<AgentChat[]>("/api/admin/agent")
      .then(setChats)
      .catch(() => {});
  }, []);
  useEffect(loadChats, [loadChats]);

  // Fetch any drafts the agent mentions that we haven't loaded yet.
  const draftIds = chat.messages.flatMap((m) => m.steps.map((s) => s.draftId).filter((id): id is number => !!id));
  const missing = draftIds.filter((id) => !drafts[id]).join(",");
  useEffect(() => {
    if (!missing) return;
    for (const id of missing.split(",").map(Number)) {
      adminApi
        .draft(id)
        .then((d) => setDrafts((prev) => ({ ...prev, [id]: d })))
        .catch(() => {});
    }
  }, [missing]);

  async function open(id: number) {
    try {
      const data = await api<{ messages: { id: number; role: "user" | "assistant"; text: string; steps: Step[] }[] }>(
        `/api/admin/agent/${id}`,
      );
      setChatId(id);
      setMessages(
        data.messages.map(
          (m): ChatMessage => ({ key: `a${m.id}`, id: m.id, role: m.role, text: m.text, steps: m.steps, status: "done" }),
        ),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function startNew() {
    setChatId(null);
    setMessages([]);
  }

  async function send(text: string) {
    if (chatId !== null) {
      await chat.send(text);
      loadChats();
      return;
    }
    try {
      // A first message needs a chat to exist. The hook's path updates on the
      // next render, so point this one send at the new chat directly.
      const created = await api<AgentChat>("/api/admin/agent", { method: "POST" });
      setChatId(created.id);
      await chat.send(text, [], {}, `/api/admin/agent/${created.id}/messages`);
      loadChats();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const lastIndex = chat.messages.length - 1;
  const textLength = chat.messages.reduce((n, m) => n + m.text.length + m.steps.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Wand2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Prompt assistant</p>
          <p className="truncate text-xs text-muted">Describe a change — it drafts it for you to apply.</p>
        </div>
        <Menu>
          <Tooltip label="Past chats">
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Past chats">
                <History />
              </Button>
            </MenuTrigger>
          </Tooltip>
          <MenuContent className="max-h-80 w-72 overflow-y-auto">
            <MenuLabel>Past chats</MenuLabel>
            {chats.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-muted">None yet.</p>
            ) : (
              chats.map((c) => (
                <MenuItem key={c.id} onSelect={() => void open(c.id)} right={<span className="text-xs text-faint">{timeAgo(c.updatedAt)}</span>}>
                  <span className="line-clamp-1">{c.title}</span>
                </MenuItem>
              ))
            )}
          </MenuContent>
        </Menu>
        <Tooltip label="New chat">
          <Button variant="ghost" size="icon-sm" aria-label="New chat" onClick={startNew} disabled={chat.busy}>
            <SquarePen />
          </Button>
        </Tooltip>
      </div>

      {chat.messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-y-auto p-4">
          <p className="mb-1 text-xs font-medium text-muted">Try asking</p>
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => void send(idea)}
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm text-fg-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg"
            >
              {idea}
            </button>
          ))}
        </div>
      ) : (
        <MessageList watch={textLength} contentClassName="flex flex-col gap-6 p-4">
          {chat.messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage key={m.key} message={m} />
            ) : (
              <AssistantMessage
                key={m.key}
                message={m}
                isLast={i === lastIndex}
                avatar={false}
                extras={
                  m.steps.some((s) => s.draftId) ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {m.steps
                        .filter((s) => s.draftId && drafts[s.draftId])
                        .map((s) => (
                          <DraftCard
                            key={s.draftId}
                            draft={drafts[s.draftId!]}
                            compact
                            defaultOpen={drafts[s.draftId!].status === "pending"}
                            onChanged={(d) => {
                              setDrafts((prev) => ({ ...prev, [d.id]: d }));
                              if (d.status === "applied") onApplied();
                            }}
                          />
                        ))}
                    </div>
                  ) : null
                }
              />
            ),
          )}
        </MessageList>
      )}

      <div className="p-3">
        <Composer
          busy={chat.busy}
          onSend={(text) => void send(text)}
          onStop={chat.stop}
          placeholder="e.g. Be more encouraging with new members"
        />
      </div>
    </div>
  );
}
