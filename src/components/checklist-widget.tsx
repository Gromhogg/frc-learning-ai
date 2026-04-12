import { useState } from 'react';

export interface ChecklistWidgetProps {
  title: string;
  items: string[];
}

export default function ChecklistWidget({ title, items }: ChecklistWidgetProps) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  function toggle(index: number) {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  const checkedCount = checked.filter(Boolean).length;
  const total = items.length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      {/* Title */}
      <h3 className="text-sm font-semibold text-[var(--text-h)] mb-1 leading-snug">{title}</h3>

      {/* Progress */}
      <p className="text-xs text-[var(--text)] mb-4">
        {checkedCount} of {total} item{total !== 1 ? 's' : ''} checked
      </p>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-[var(--border)] mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: total > 0 ? `${(checkedCount / total) * 100}%` : '0%' }}
        />
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index}>
            <label className="flex items-start gap-3 cursor-pointer group">
              <span className="mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={checked[index] ?? false}
                  onChange={() => toggle(index)}
                  className="sr-only"
                />
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors duration-150 ${
                    checked[index]
                      ? 'bg-[var(--accent)] border-[var(--accent)]'
                      : 'bg-transparent border-[var(--border)] group-hover:border-[var(--accent-border)]'
                  }`}
                >
                  {checked[index] && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  )}
                </span>
              </span>
              <span
                className={`text-sm leading-relaxed transition-colors duration-150 ${
                  checked[index]
                    ? 'line-through text-[var(--text)] opacity-60'
                    : 'text-[var(--text-h)]'
                }`}
              >
                {item}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
