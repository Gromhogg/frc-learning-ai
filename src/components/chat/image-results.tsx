import { useState } from "react";
import type { Step, StepImage } from "../../lib/stream";

/**
 * Pictures the tutor found while answering, shown under its reply. Each one
 * opens the page it came from. A picture that fails to load is just hidden.
 */
export function ImageResults({ steps }: { steps: Step[] }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const images = collectImages(steps).filter((img) => !failed.has(img.url));
  if (images.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {images.map((img) => (
        <a
          key={img.url}
          href={img.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          // The full credit shows on hover, since the line below gets cut short.
          title={`${img.title} — ${img.credit}`}
          className="group/img min-w-0 rounded-xl"
        >
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-line bg-surface-2">
            <img
              src={img.url}
              alt={img.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailed((prev) => new Set(prev).add(img.url))}
              className="size-full object-cover transition-transform duration-300 group-hover/img:scale-[1.03]"
            />
          </div>
          <p className="mt-1 truncate px-0.5 text-[11px] leading-4 text-faint">{img.credit}</p>
        </a>
      ))}
    </div>
  );
}

/** Pictures from every step of a reply, each one once. */
function collectImages(steps: Step[]): StepImage[] {
  const seen = new Set<string>();
  const out: StepImage[] = [];
  for (const step of steps) {
    for (const img of step.images ?? []) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      out.push(img);
    }
  }
  return out;
}
