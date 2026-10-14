import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings2, Sparkles, Sun } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { Avatar } from "./ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "./ui/menu";
import { InterestsDialog } from "./interests-dialog";

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Avatar button at the bottom of the sidebar: theme, admin, sign out. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const { choice, setChoice } = useTheme();
  const navigate = useNavigate();
  const [interestsOpen, setInterestsOpen] = useState(false);
  if (!user) return null;

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2 data-[state=open]:bg-surface-2"
          >
            <Avatar name={user.name} src={user.avatarUrl} size={28} />
            {!compact ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {user.role === "admin" ? "Admin" : "Student"}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-faint" />
              </>
            ) : null}
          </button>
        </MenuTrigger>
        <MenuContent align="start" side="top" className="w-60">
          <MenuLabel>Theme</MenuLabel>
          <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setChoice(value)}
                className={
                  "flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors " +
                  (choice === value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")
                }
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <MenuSeparator />
          {user.role === "admin" ? (
            <MenuItem icon={<Settings2 />} onSelect={() => navigate("/admin")}>
              Admin
            </MenuItem>
          ) : null}
          <MenuItem icon={<Sparkles />} onSelect={() => setInterestsOpen(true)}>
            Your interests
          </MenuItem>
          <MenuItem
            icon={<LogOut />}
            onSelect={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
      <InterestsDialog open={interestsOpen} onOpenChange={setInterestsOpen} />
    </>
  );
}
