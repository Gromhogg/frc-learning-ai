import { useState, useRef } from 'react';

export interface DragOrderAnswer {
  // The order the student submitted, expressed as original indices
  // e.g. [2, 0, 1] means the student put item-originally-at-2 first, etc.
  order: number[];
}

export interface DragOrderWidgetProps {
  instruction: string;
  items: string[]; // correct order — widget shuffles on mount
  answer?: DragOrderAnswer;
  onAnswer?: (answer: DragOrderAnswer) => void;
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = arr.map((text, originalIndex) => ({ text, originalIndex }));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Re-shuffle if result accidentally matches original order
  const isOriginal = a.every((item, i) => item.originalIndex === i);
  if (isOriginal && a.length > 1) return fisherYatesShuffle(arr);
  return a;
}

interface Item {
  text: string;
  originalIndex: number;
}

export default function DragOrderWidget({ instruction, items, answer, onAnswer }: DragOrderWidgetProps) {
  const initialOrder = (): Item[] => {
    if (answer && Array.isArray(answer.order) && answer.order.length === items.length) {
      return answer.order.map((origIdx) => ({ text: items[origIdx] ?? '', originalIndex: origIdx }));
    }
    return fisherYatesShuffle(items);
  };
  const initialCorrectCount = answer
    ? answer.order.filter((origIdx, pos) => origIdx === pos).length
    : 0;

  const [order, setOrder] = useState<Item[]>(initialOrder);
  const [submitted, setSubmitted] = useState(answer !== undefined);
  const [correctCount, setCorrectCount] = useState(initialCorrectCount);

  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  function handleDragStart(i: number) {
    dragIndex.current = i;
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    dragOverIndex.current = i;
  }

  function handleDrop() {
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from === null || to === null || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    dragIndex.current = null;
    dragOverIndex.current = null;
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...order];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setOrder(next);
  }

  function moveDown(i: number) {
    if (i === order.length - 1) return;
    const next = [...order];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setOrder(next);
  }

  function handleCheck() {
    const correct = order.filter((item, pos) => item.originalIndex === pos).length;
    setCorrectCount(correct);
    setSubmitted(true);
    onAnswer?.({ order: order.map((item) => item.originalIndex) });
  }

  const allCorrect = submitted && correctCount === items.length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      <p className="text-sm font-semibold text-[var(--text-h)] mb-4 leading-snug">{instruction}</p>

      <div className="flex flex-col gap-2 mb-4">
        {order.map((item, i) => {
          const isCorrect = submitted && item.originalIndex === i;
          const isWrong = submitted && item.originalIndex !== i;

          return (
            <div
              key={item.originalIndex}
              draggable={!submitted}
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={handleDrop}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors duration-150',
                submitted
                  ? isCorrect
                    ? 'border-green-500 bg-green-500/10 text-green-400 cursor-default'
                    : 'border-red-500 bg-red-500/10 text-red-400 cursor-default'
                  : 'border-[var(--border)] bg-[var(--code-bg)] text-[var(--text-h)] cursor-grab hover:border-[var(--accent-border)]',
              ].join(' ')}
            >
              {/* Grip icon */}
              {!submitted && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="flex-shrink-0 opacity-40">
                  <circle cx="3" cy="2" r="1.2" />
                  <circle cx="9" cy="2" r="1.2" />
                  <circle cx="3" cy="6" r="1.2" />
                  <circle cx="9" cy="6" r="1.2" />
                  <circle cx="3" cy="10" r="1.2" />
                  <circle cx="9" cy="10" r="1.2" />
                </svg>
              )}

              {/* Position number */}
              <span className={[
                'w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border',
                isCorrect
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : isWrong
                  ? 'border-red-500 bg-red-500/20 text-red-400'
                  : 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]',
              ].join(' ')}>
                {i + 1}
              </span>

              <span className="flex-1">{item.text}</span>

              {/* Arrow buttons for mobile / accessibility */}
              {!submitted && (
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--text)] hover:text-[var(--accent)] disabled:opacity-20 transition-colors"
                    aria-label="Move up"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2,7 5,3 8,7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === order.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--text)] hover:text-[var(--accent)] disabled:opacity-20 transition-colors"
                    aria-label="Move down"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2,3 5,7 8,3" />
                    </svg>
                  </button>
                </div>
              )}

              {submitted && (
                <span className="flex-shrink-0 text-xs">
                  {isCorrect ? '✓' : '✗'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!submitted ? (
        <button
          onClick={handleCheck}
          className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all duration-150"
        >
          Check Order
        </button>
      ) : (
        <div className={[
          'px-4 py-2.5 rounded-xl text-sm font-medium border',
          allCorrect
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--text-h)]',
        ].join(' ')}>
          {allCorrect
            ? `Perfect order! All ${items.length} steps correct. ✓`
            : `${correctCount} of ${items.length} steps in the right position.`}
          {!allCorrect && (
            <p className="mt-1 text-xs text-[var(--text)]">
              Correct order: {items.map((t, i) => `${i + 1}. ${t}`).join(' → ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
