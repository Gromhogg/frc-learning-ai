import type { ReactNode } from "react";

interface Props {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Height-animated show/hide, done entirely in CSS with a grid track that
 * goes from 0fr to 1fr. A 1fr track resizes with its content instantly and
 * only *transitions* when the value flips, so content that grows while open
 * (an auto-growing textarea) is never clipped or lagged.
 *
 * `inert` keeps the hidden content out of the tab order and the
 * accessibility tree while closed.
 */
export default function Collapse({ open, id, className = "", children }: Props) {
  return (
    <div
      id={id}
      inert={!open}
      className={[
        "grid transition-[grid-template-rows] duration-200 ease-out-quart",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      ].join(" ")}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
