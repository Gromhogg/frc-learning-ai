import { useState } from 'react';

export interface DiagramPart {
  id: string;
  label: string;
  hint: string;
  x: number; // percentage 0–100
  y: number; // percentage 0–100
}

export interface LabeledDiagramWidgetProps {
  title: string;
  description: string;
  parts: DiagramPart[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LabeledDiagramWidget({ title, description, parts }: LabeledDiagramWidgetProps) {
  // shuffledLabels: list of label strings in shuffled order for the dropdowns
  const [shuffledLabels] = useState(() => shuffleArray(parts.map((p) => p.label)));
  // assignments: map from hotspot index → selected label (or '')
  const [assignments, setAssignments] = useState<Record<number, string>>(() =>
    Object.fromEntries(parts.map((_, i) => [i, '']))
  );
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  function handleAssign(hotspotIndex: number, label: string) {
    setAssignments((prev) => ({ ...prev, [hotspotIndex]: label }));
  }

  function handleCheck() {
    const correct = parts.filter((part, i) => assignments[i] === part.label).length;
    setScore(correct);
    setSubmitted(true);
  }

  const allFilled = parts.every((_, i) => assignments[i] !== '');
  const perfect = submitted && score === parts.length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-1">Labeled Diagram</p>
      <h3 className="text-sm font-semibold text-[var(--text-h)] mb-3 leading-snug">{title}</h3>

      {/* Diagram area */}
      <div
        className="relative w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden mb-4"
        style={{ aspectRatio: '4 / 3' }}
      >
        {/* Grid lines for visual reference */}
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="10%" height="10%" patternUnits="userSpaceOnUse"
              patternTransform="scale(1)">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--border)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Description text */}
        <p className="absolute inset-x-0 top-3 text-center text-[10px] text-[var(--text)] px-6 leading-tight z-10 pointer-events-none">
          {description}
        </p>

        {/* Hotspot circles */}
        {parts.map((part, i) => {
          const isCorrect = submitted && assignments[i] === part.label;
          const isWrong = submitted && assignments[i] !== part.label;
          return (
            <div
              key={part.id}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${part.x}%`, top: `${part.y}%` }}
            >
              <div className={[
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-md',
                submitted
                  ? isCorrect
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] animate-pulse',
              ].join(' ')}>
                {i + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Label assignment */}
      <div className="flex flex-col gap-2 mb-4">
        {parts.map((part, i) => {
          const isCorrect = submitted && assignments[i] === part.label;
          const isWrong = submitted && assignments[i] !== part.label;
          return (
            <div key={i} className="flex items-center gap-3">
              {/* Hotspot badge */}
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

              {/* Dropdown */}
              <select
                value={assignments[i]}
                onChange={(e) => handleAssign(i, e.target.value)}
                disabled={submitted}
                className={[
                  'flex-1 px-3 py-2 rounded-lg border text-sm bg-[var(--code-bg)] text-[var(--text-h)]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  'transition-colors duration-150 disabled:opacity-70',
                  isCorrect
                    ? 'border-green-500/50'
                    : isWrong
                    ? 'border-red-500/50'
                    : 'border-[var(--border)] hover:border-[var(--accent-border)]',
                ].join(' ')}
              >
                <option value="">— Select a part —</option>
                {shuffledLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>

              {/* Result icon */}
              {submitted && (
                <span className={`flex-shrink-0 text-sm ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {isCorrect ? '✓' : '✗'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Hints for wrong answers after submit */}
      {submitted && !perfect && (
        <div className="flex flex-col gap-1 mb-4">
          {parts.map((part, i) => {
            if (assignments[i] === part.label) return null;
            return (
              <p key={i} className="text-xs text-amber-400 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <span className="font-bold">#{i + 1} — {part.label}:</span> {part.hint}
              </p>
            );
          })}
        </div>
      )}

      {/* Check / Result */}
      {!submitted ? (
        <button
          onClick={handleCheck}
          disabled={!allFilled}
          className={[
            'w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150',
            allFilled
              ? 'bg-[var(--accent)] text-white hover:opacity-90 active:scale-95'
              : 'bg-[var(--border)] text-[var(--text)] cursor-not-allowed',
          ].join(' ')}
        >
          Check Answers
        </button>
      ) : (
        <div className={[
          'px-4 py-2.5 rounded-xl text-sm font-medium border',
          perfect
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--text-h)]',
        ].join(' ')}>
          {perfect
            ? `All ${parts.length} parts identified correctly! ✓`
            : `${score} of ${parts.length} parts identified correctly.`}
        </div>
      )}
    </div>
  );
}
