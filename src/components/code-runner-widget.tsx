import { useState } from 'react';

export interface CodeRunnerAnswer {
  code: string;
}

export interface CodeRunnerWidgetProps {
  prompt: string;
  language: string;
  starterCode: string;
  expectedPatterns: string[];
  solutionCode: string;
  answer?: CodeRunnerAnswer;
  onAnswer?: (answer: CodeRunnerAnswer) => void;
}

export default function CodeRunnerWidget({
  prompt,
  language,
  starterCode,
  expectedPatterns,
  solutionCode,
  answer,
  onAnswer,
}: CodeRunnerWidgetProps) {
  const [code, setCode] = useState(answer?.code ?? starterCode);
  const initialMatches = answer
    ? expectedPatterns.filter((p) => answer.code.toLowerCase().includes(p.toLowerCase())).length
    : 0;
  const [submitted, setSubmitted] = useState(answer !== undefined);
  const [matchedCount, setMatchedCount] = useState(initialMatches);
  const [showSolution, setShowSolution] = useState(false);

  function handleSubmit() {
    const lower = code.toLowerCase();
    const matched = expectedPatterns.filter((p) => lower.includes(p.toLowerCase())).length;
    setMatchedCount(matched);
    setSubmitted(true);
    onAnswer?.({ code });
  }

  const total = expectedPatterns.length;
  const score = total > 0 ? Math.round((matchedCount / total) * 100) : 0;
  const perfect = submitted && matchedCount === total;

  const languageLabel: Record<string, string> = {
    gcode: 'G-Code',
    pseudocode: 'Pseudocode',
    procedure: 'Procedure',
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-h)] leading-snug flex-1 pr-4">{prompt}</p>
        <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)]">
          {languageLabel[language] ?? language}
        </span>
      </div>

      {/* Code editor */}
      <div className="relative mb-4">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-[var(--bg)] border-r border-[var(--border)] rounded-l-xl flex flex-col pt-3 pointer-events-none select-none">
          {(submitted ? code : code).split('\n').map((_, i) => (
            <span key={i} className="text-center text-[10px] text-[var(--text)] opacity-40 leading-5 font-mono">
              {i + 1}
            </span>
          ))}
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={submitted}
          rows={Math.max(4, code.split('\n').length + 1)}
          spellCheck={false}
          className={[
            'w-full pl-12 pr-4 py-3 rounded-xl border font-mono text-xs leading-5 resize-none',
            'bg-[var(--bg)] text-[var(--text-h)] placeholder:text-[var(--text)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
            'transition-colors duration-150',
            submitted
              ? 'opacity-70 cursor-default border-[var(--border)]'
              : 'border-[var(--accent-border)] hover:border-[var(--accent)]',
          ].join(' ')}
          style={{ maxHeight: '16rem', overflowY: 'auto' }}
        />
      </div>

      {/* Submit button */}
      {!submitted ? (
        <button
          onClick={handleSubmit}
          className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all duration-150"
        >
          Submit
        </button>
      ) : (
        <div className="space-y-3">
          {/* Score */}
          <div className={[
            'px-4 py-2.5 rounded-xl text-sm font-medium border',
            perfect
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : score >= 50
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400',
          ].join(' ')}>
            {perfect
              ? `All ${total} key elements included! ✓`
              : `${matchedCount} of ${total} key elements included (${score}%).`}
          </div>

          {/* Pattern breakdown */}
          {expectedPatterns.length > 0 && (
            <div className="flex flex-col gap-1">
              {expectedPatterns.map((pattern, i) => {
                const found = code.toLowerCase().includes(pattern.toLowerCase());
                return (
                  <div key={i} className={[
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border',
                    found
                      ? 'border-green-500/20 bg-green-500/5 text-green-400'
                      : 'border-red-500/20 bg-red-500/5 text-red-400',
                  ].join(' ')}>
                    <span>{found ? '✓' : '✗'}</span>
                    <span className="font-mono">{pattern}</span>
                    {!found && <span className="text-[var(--text)] ml-auto">missing</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Show solution toggle */}
          <button
            onClick={() => setShowSolution((v) => !v)}
            className="w-full px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text)] hover:text-[var(--text-h)] hover:border-[var(--accent-border)] transition-colors"
          >
            {showSolution ? 'Hide Solution' : 'Show Solution'}
          </button>

          {showSolution && (
            <pre className="w-full px-4 py-3 rounded-xl border-l-4 border-green-500 bg-[var(--bg)] text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap leading-5">
              {solutionCode}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
