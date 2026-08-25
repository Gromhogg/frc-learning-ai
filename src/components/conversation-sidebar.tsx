export interface Conversation {
  id: number;
  title: string;
  updatedAt: string | null;
}

interface Props {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}

/** Group chats into Today / Yesterday / Earlier for the sidebar. */
function groupByDay(conversations: Conversation[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const conversation of conversations) {
    const when = conversation.updatedAt ? new Date(conversation.updatedAt) : null;
    if (when && when >= startOfToday) groups[0].items.push(conversation);
    else if (when && when >= startOfYesterday) groups[1].items.push(conversation);
    else groups[2].items.push(conversation);
  }

  return groups.filter((g) => g.items.length > 0);
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  const groups = groupByDay(conversations);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="15" height="15">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New chat
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="text-xs text-[var(--text)] text-center px-3 py-6 leading-relaxed">
            No chats yet. Ask something to get started.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text)] opacity-60">
              {group.label}
            </p>
            {group.items.map((conversation) => (
              <div
                key={conversation.id}
                className={[
                  "group flex items-center gap-1 rounded-lg transition-colors duration-100",
                  conversation.id === activeId
                    ? "bg-[var(--accent-bg)]"
                    : "hover:bg-[var(--code-bg)]",
                ].join(" ")}
              >
                <button
                  onClick={() => onSelect(conversation.id)}
                  className={[
                    "flex-1 text-left px-3 py-2 text-sm truncate focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg",
                    conversation.id === activeId
                      ? "text-[var(--accent)] font-medium"
                      : "text-[var(--text-h)]",
                  ].join(" ")}
                >
                  {conversation.title}
                </button>
                <button
                  onClick={() => onDelete(conversation.id)}
                  aria-label={`Delete ${conversation.title}`}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 px-2 py-2 text-[var(--text)] hover:text-red-400 transition-all focus:outline-none focus-visible:opacity-100"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
