import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, BookOpen, Brain, History, Lightbulb, ScrollText, SlidersHorizontal, Users, Wand2 } from "lucide-react";
import { adminApi } from "./admin-api";
import type { AdminCounts } from "./admin-context";
import { cn } from "../lib/cn";
import { Logo } from "../components/ui/misc";
import { UserMenu } from "../components/user-menu";
import { AssistantWindow } from "./components/assistant-window";
import { useAssistantWindow } from "./components/assistant-window-state";

const NAV = [
  { to: "prompt", label: "Prompt", icon: ScrollText, hint: "What the AI is told" },
  { to: "suggestions", label: "Suggestions", icon: Lightbulb, count: "drafts" as const },
  { to: "facts", label: "Team facts", icon: Brain, count: "facts" as const },
  { to: "docs", label: "Docs", icon: BookOpen },
  { to: "history", label: "Versions", icon: History },
  { to: "admins", label: "Admins", icon: Users },
  { to: "settings", label: "Settings", icon: SlidersHorizontal },
];

export default function AdminLayout() {
  const [counts, setCounts] = useState<AdminCounts>({ drafts: 0, facts: 0 });
  const [appliedCount, setAppliedCount] = useState(0);
  const assistant = useAssistantWindow();

  const refreshCounts = useCallback(() => {
    Promise.all([adminApi.drafts("pending"), adminApi.facts()])
      .then(([d, f]) => setCounts({ drafts: d.drafts.length, facts: f.pending.length }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Side menu (top bar on phones) */}
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <Logo size={26} />
          <div className="min-w-0">
            <p className="text-[15px] leading-tight font-semibold tracking-tight">Admin</p>
            <p className="text-xs text-muted">972 Chat Bot</p>
          </div>
        </div>
        <Link
          to="/"
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          Back to chat
        </Link>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon, count }) => {
            const n = count ? counts[count] : 0;
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    isActive ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                  )
                }
              >
                <Icon className="size-4 text-muted" />
                <span className="flex-1">{label}</span>
                {n > 0 ? (
                  <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-semibold text-accent-fg">
                    {n}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={assistant.toggle}
            aria-pressed={assistant.open}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors md:mt-3",
              assistant.open ? "bg-accent-soft font-medium text-accent-text" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Wand2 className={cn("size-4", assistant.open ? "text-accent-text" : "text-muted")} />
            <span className="flex-1">Prompt assistant</span>
          </button>
        </nav>
        <div className="hidden border-t border-line p-2 md:block">
          <UserMenu />
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet context={{ counts, refreshCounts, appliedCount }} />
      </main>

      <AssistantWindow
        open={assistant.open}
        onClose={() => assistant.setOpen(false)}
        onApplied={() => {
          setAppliedCount((n) => n + 1);
          refreshCounts();
        }}
      />
    </div>
  );
}
