import { useState } from 'react';

export interface QuizWidgetProps {
  question: string;
  options: string[];
  correctIndex: number;
  onAnswer?: (selectedIndex: number, correct: boolean) => void;
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuizWidget({ question, options, correctIndex, onAnswer }: QuizWidgetProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const answered = selected !== null;

  function handleSelect(index: number) {
    if (answered) return;
    setSelected(index);
    const correct = index === correctIndex;
    onAnswer?.(index, correct);
  }

  function getOptionStyle(index: number): string {
    const base =
      'flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors duration-150';

    if (!answered) {
      return `${base} border-[var(--border)] bg-[var(--code-bg)] text-[var(--text-h)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] cursor-pointer`;
    }

    if (index === correctIndex) {
      return `${base} border-green-500 bg-green-500/10 text-green-400 cursor-default`;
    }
    if (index === selected) {
      return `${base} border-red-500 bg-red-500/10 text-red-400 cursor-default`;
    }
    return `${base} border-[var(--border)] bg-[var(--code-bg)] text-[var(--text)] opacity-50 cursor-default`;
  }

  const isCorrect = answered && selected === correctIndex;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      {/* Question */}
      <p className="text-sm font-semibold text-[var(--text-h)] mb-4 leading-snug">{question}</p>

      {/* Options */}
      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleSelect(index)}
            disabled={answered}
            className={getOptionStyle(index)}
          >
            <span
              className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
                answered && index === correctIndex
                  ? 'border-green-500 bg-green-500/20 text-green-400'
                  : answered && index === selected
                  ? 'border-red-500 bg-red-500/20 text-red-400'
                  : 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]'
              }`}
            >
              {LABELS[index] ?? index + 1}
            </span>
            <span>{option}</span>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {answered && (
        <div
          className={`mt-4 px-4 py-2.5 rounded-xl text-sm font-medium border ${
            isCorrect
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {isCorrect
            ? 'Correct! \u2713'
            : `Not quite \u2014 the correct answer was: ${options[correctIndex]}`}
        </div>
      )}
    </div>
  );
}
