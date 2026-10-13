import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * A scrolling column that sticks to the bottom while a reply streams in —
 * unless the reader has scrolled up to look at something.
 */
export function MessageList({
  children,
  className,
  contentClassName,
  watch,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Changes whenever the content grows (e.g. total text length). */
  watch: unknown;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [watch, pinned]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div className={contentClassName}>{children}</div>
      </div>
      {!pinned ? (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
          className="absolute bottom-3 left-1/2 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-soft hover:text-fg animate-[pop-in_150ms]"
        >
          <ArrowDown className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
