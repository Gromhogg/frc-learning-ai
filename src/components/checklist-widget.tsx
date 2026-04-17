import { useState } from 'react';

export interface ChecklistWidgetProps {
  title: string;
  items: string[];
}

type ItemState = 'locked' | 'prompting' | 'verified';

export default function ChecklistWidget({ title, items: rawItems }: ChecklistWidgetProps) {
  const items = rawItems.slice(0, 5);
  const [states, setStates] = useState<ItemState[]>(() => items.map(() => 'locked'));
  const [inputs, setInputs] = useState<string[]>(() => items.map(() => ''));

  function openPrompt(index: number) {
    if (states[index] === 'verified') return;
    setStates((prev) => {
      const next = [...prev];
      next[index] = 'prompting';
      return next;
    });
  }

  function cancelPrompt(index: number) {
    setStates((prev) => {
      const next = [...prev];
      next[index] = 'locked';
      return next;
    });
  }

  function submitExplanation(index: number) {
    if (inputs[index].trim().length < 8) return;
    setStates((prev) => {
      const next = [...prev];
      next[index] = 'verified';
      return next;
    });
  }

  function updateInput(index: number, value: string) {
    setInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  const verifiedCount = states.filter((s) => s === 'verified').length;
  const total = items.length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      <h3 className="text-sm font-semibold text-[var(--text-h)] mb-1 leading-snug">{title}</h3>

      <p className="text-xs text-[var(--text)] mb-4">
        {verifiedCount} of {total} step{total !== 1 ? 's' : ''} verified — explain each step to mark it complete
      </p>

      <div className="w-full h-2 rounded-full bg-[var(--border)] mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: total > 0 ? `${(verifiedCount / total) * 100}%` : '0%' }}
        />
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item, index) => {
          const state = states[index];
          return (
            <li key={index} className="flex flex-col gap-2">
              {/* Item row */}
              <button
                onClick={() => openPrompt(index)}
                disabled={state === 'verified'}
                className={`flex items-start gap-3 text-left w-full group transition-opacity ${
                  state === 'verified' ? 'cursor-default opacity-60' : 'cursor-pointer'
                }`}
              >
                {/* Icon */}
                <span className="mt-0.5 flex-shrink-0">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors duration-150 ${
                      state === 'verified'
                        ? 'bg-[var(--accent)] border-[var(--accent)]'
                        : state === 'prompting'
                        ? 'border-[var(--accent)] bg-transparent'
                        : 'border-[var(--border)] group-hover:border-[var(--accent-border)] bg-transparent'
                    }`}
                  >
                    {state === 'verified' && (
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
                    {state === 'prompting' && (
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </span>
                </span>

                {/* Step text */}
                <span
                  className={`text-sm leading-relaxed transition-colors duration-150 ${
                    state === 'verified'
                      ? 'line-through text-[var(--text)]'
                      : 'text-[var(--text-h)]'
                  }`}
                >
                  {item}
                </span>
              </button>

              {/* Inline explanation prompt */}
              {state === 'prompting' && (
                <div className="ml-8 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-xs text-[var(--text)] leading-snug">
                    In your own words, why is this step important or what does it involve?
                  </p>
                  <textarea
                    autoFocus
                    rows={2}
                    value={inputs[index]}
                    onChange={(e) => updateInput(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitExplanation(index);
                      }
                      if (e.key === 'Escape') cancelPrompt(index);
                    }}
                    placeholder="Type your explanation…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-h)] text-sm px-3 py-2 resize-none focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text)] placeholder:opacity-40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitExplanation(index)}
                      disabled={inputs[index].trim().length < 8}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => cancelPrompt(index)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent-border)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {verifiedCount === total && total > 0 && (
        <p className="mt-4 text-xs font-medium text-[var(--accent)] text-center">
          All steps verified — great work!
        </p>
      )}
    </div>
  );
}
