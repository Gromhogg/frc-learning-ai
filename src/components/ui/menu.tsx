import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Menu(props: Dropdown.DropdownMenuProps) {
  return <Dropdown.Root {...props} />;
}

export function MenuTrigger(props: Dropdown.DropdownMenuTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return <Dropdown.Trigger {...props} />;
}

export function MenuContent({
  children,
  align = "end",
  side = "bottom",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align={align}
        side={side}
        sideOffset={6}
        className={cn(
          "z-50 min-w-52 rounded-xl border border-line bg-surface p-1 shadow-float",
          "data-[state=open]:animate-[pop-in_140ms_var(--ease-out)]",
          className,
        )}
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  right,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  right?: ReactNode;
}) {
  return (
    <Dropdown.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        danger ? "text-bad [&_svg]:!text-bad" : "text-fg",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {right}
    </Dropdown.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <Dropdown.Label className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted">{children}</Dropdown.Label>;
}

export function MenuSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-line" />;
}
