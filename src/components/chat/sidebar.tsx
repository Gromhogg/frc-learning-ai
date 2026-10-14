import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, PanelLeftClose, SquarePen, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { dayGroup } from "../../lib/time";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { Logo, Skeleton } from "../ui/misc";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import { Tooltip } from "../ui/tooltip";
import { UserMenu } from "../user-menu";

export interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string | null;
}

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

export function Sidebar({
  conversations,
  loading,
  activeId,
  onNew,
  onDelete,
  onCollapse,
  onNavigate,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: number | null;
  onNew: () => void;
  onDelete: (id: number) => void;
  onCollapse: () => void;
  /** Called after picking a chat — closes the sidebar on phones. */
  onNavigate?: () => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const c of conversations) {
      const g = dayGroup(c.updatedAt);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [conversations]);

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Link to="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1">
          <Logo size={26} />
          <span className="truncate text-[15px] font-semibold tracking-tight">972 Chat Bot</span>
        </Link>
        <Tooltip label="Close sidebar" side="bottom">
          <Button variant="ghost" size="icon-sm" aria-label="Close sidebar" onClick={onCollapse}>
            <PanelLeftClose />
          </Button>
        </Tooltip>
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" className="w-full justify-start" onClick={onNew}>
          <SquarePen />
          New chat
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex flex-col gap-2 px-2 pt-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-muted">Your chats will show up here.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              <p className="px-2.5 pb-1 text-xs font-medium text-faint">{group.label}</p>
              {group.items.map((c) => (
                <div key={c.id} className="group/item relative">
                  <Link
                    to={`/c/${c.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "block truncate rounded-lg py-1.5 pr-8 pl-2.5 text-sm transition-colors",
                      c.id === activeId ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2",
                    )}
                  >
                    {c.title}
                  </Link>
                  <Menu>
                    <MenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Chat options"
                        className={cn(
                          "absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg",
                          "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                          c.id === activeId && "opacity-100",
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </MenuTrigger>
                    <MenuContent align="start" className="min-w-40">
                      <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmId(c.id)}>
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              ))}
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-line p-2">
        <UserMenu />
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title="Delete this chat?"
        description="The whole conversation will be removed. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmId !== null && onDelete(confirmId)}
      />
    </div>
  );
}
