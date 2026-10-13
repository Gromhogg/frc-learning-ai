import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, BookOpen, Brain, History, Lightbulb, ScrollText } from "lucide-react";
import { adminApi } from "./admin-api";
import type { AdminCounts } from "./admin-context";
import { cn } from "../lib/cn";
import { Logo } from "../components/ui/misc";
import { UserMenu } from "../components/user-menu";

const NAV = [
  { to: "prompt", label: "Prompt", icon: ScrollText, hint: "What the AI is told" },
  { to: "suggestions", label: "Suggestions", icon: Lightbulb, count: "drafts" as const },
  { to: "facts", label: "Team facts", icon: Brain, count: "facts" as const },
  { to: "docs", label: "Docs", icon: BookOpen },
  { to: "history", label: "History", icon: History },
];

export default function AdminLayout() {
  const [counts, setCounts] = useState<AdminCounts>({ drafts: 0, facts: 0 });

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
            <p className="text-xs text-muted">Robotics Mentor</p>
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
        </nav>
        <div className="hidden border-t border-line p-2 md:block">
          <UserMenu />
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet context={{ counts, refreshCounts }} />
      </main>
    </div>
  );
}
