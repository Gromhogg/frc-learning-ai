import { useState, useEffect, useRef } from 'react';

export interface ScenarioChoice {
  text: string;
  nextStepId: string | null;
  feedback: string;
  isOptimal: boolean;
}

export interface ScenarioStep {
  id: string;
  prompt: string;
  choices: ScenarioChoice[];
}

export interface ScenarioAnswer {
  // Sequence of choice indices the student picked at each step they reached
  choices: { stepId: string; choiceIndex: number }[];
}

export interface ScenarioWidgetProps {
  title: string;
  scenario: string;
  steps: ScenarioStep[];
  answer?: ScenarioAnswer;
  onAnswer?: (answer: ScenarioAnswer) => void;
}

interface HistoryEntry {
  stepId: string;
  prompt: string;
  choiceIndex: number;
  choiceText: string;
  feedback: string;
  isOptimal: boolean;
  optimalChoice: string;
}

function replayHistory(steps: ScenarioStep[], stepMap: Record<string, ScenarioStep>, choices: ScenarioAnswer["choices"]): { history: HistoryEntry[]; lastNextStepId: string | null } {
  const history: HistoryEntry[] = [];
  let lastNextStepId: string | null = null;
  for (const { stepId, choiceIndex } of choices) {
    const step = stepMap[stepId];
    if (!step) break;
    const choice = step.choices[choiceIndex];
    if (!choice) break;
    const optimalChoice = step.choices.find((c) => c.isOptimal)?.text ?? '(none)';
    history.push({
      stepId: step.id,
      prompt: step.prompt,
      choiceIndex,
      choiceText: choice.text,
      feedback: choice.feedback,
      isOptimal: choice.isOptimal,
      optimalChoice,
    });
    lastNextStepId = choice.nextStepId;
  }
  void steps; // unused, but kept for signature parity
  return { history, lastNextStepId };
}

export default function ScenarioWidget({ title, scenario, steps, answer, onAnswer }: ScenarioWidgetProps) {
  const stepMap = Object.fromEntries(steps.map((s) => [s.id, s]));
  const firstStep = steps[0];

  // If we have a saved answer, replay it into a finished state
  const replayed = answer ? replayHistory(steps, stepMap, answer.choices) : null;
  const initiallyFinished = replayed !== null && (replayed.lastNextStepId === null || !stepMap[replayed.lastNextStepId]);

  const [currentStepId, setCurrentStepId] = useState<string | null>(
    replayed
      ? (initiallyFinished ? null : replayed.lastNextStepId)
      : (firstStep?.id ?? null)
  );
  const [history, setHistory] = useState<HistoryEntry[]>(replayed?.history ?? []);
  const [pendingFeedback, setPendingFeedback] = useState<{ feedback: string; isOptimal: boolean; nextStepId: string | null } | null>(null);
  const [finished, setFinished] = useState(initiallyFinished);

  // Emit cumulative answer whenever history changes (skip the initial replay so we don't echo back)
  const isReplay = useRef(answer !== undefined);
  useEffect(() => {
    if (isReplay.current) {
      isReplay.current = false;
      return;
    }
    if (history.length === 0) return;
    onAnswer?.({ choices: history.map((h) => ({ stepId: h.stepId, choiceIndex: h.choiceIndex })) });
  }, [history, onAnswer]);

  const currentStep = currentStepId ? stepMap[currentStepId] : null;

  function handleChoice(choice: ScenarioChoice, step: ScenarioStep, choiceIndex: number) {
    const optimalChoice = step.choices.find((c) => c.isOptimal)?.text ?? '(none)';
    const entry: HistoryEntry = {
      stepId: step.id,
      prompt: step.prompt,
      choiceIndex,
      choiceText: choice.text,
      feedback: choice.feedback,
      isOptimal: choice.isOptimal,
      optimalChoice,
    };
    setPendingFeedback({ feedback: choice.feedback, isOptimal: choice.isOptimal, nextStepId: choice.nextStepId });
    setHistory((prev) => [...prev, entry]);
  }

  function handleContinue() {
    if (!pendingFeedback) return;
    const { nextStepId } = pendingFeedback;
    setPendingFeedback(null);
    if (nextStepId === null || !stepMap[nextStepId]) {
      setCurrentStepId(null);
      setFinished(true);
    } else {
      setCurrentStepId(nextStepId);
    }
  }

  const optimalCount = history.filter((h) => h.isOptimal).length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 max-w-lg w-full shadow-lg shadow-black/20">
      {/* Header */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-1">Scenario</p>
        <h3 className="text-sm font-semibold text-[var(--text-h)] leading-snug mb-2">{title}</h3>
        <p className="text-sm text-[var(--text)] leading-relaxed bg-[var(--code-bg)] border border-[var(--border)] rounded-xl px-4 py-3">
          {scenario}
        </p>
      </div>

      {/* History trail */}
      {history.length > 0 && (
        <div className="mb-4 max-h-40 overflow-y-auto flex flex-col gap-1.5">
          {history.map((entry, i) => (
            <div key={i} className={[
              'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
              entry.isOptimal
                ? 'bg-green-500/5 border-green-500/20 text-green-400'
                : 'bg-amber-500/5 border-amber-500/20 text-amber-400',
            ].join(' ')}>
              <span className="font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
              <div>
                <span className="font-medium">{entry.choiceText}</span>
                {!entry.isOptimal && (
                  <span className="text-[var(--text)] ml-1">— optimal: {entry.optimalChoice}</span>
                )}
              </div>
              <span className="ml-auto flex-shrink-0">{entry.isOptimal ? '✓' : '!'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending feedback */}
      {pendingFeedback && (
        <div className={[
          'mb-4 px-4 py-3 rounded-xl border text-sm leading-relaxed',
          pendingFeedback.isOptimal
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        ].join(' ')}>
          <p>{pendingFeedback.feedback}</p>
          <button
            onClick={handleContinue}
            className="mt-3 px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            {pendingFeedback.nextStepId === null ? 'See Results' : 'Continue →'}
          </button>
        </div>
      )}

      {/* Current step */}
      {!pendingFeedback && currentStep && (
        <div>
          <p className="text-sm font-medium text-[var(--text-h)] mb-3 leading-snug">{currentStep.prompt}</p>
          <div className="flex flex-col gap-2">
            {currentStep.choices.map((choice, i) => (
              <button
                key={i}
                onClick={() => handleChoice(choice, currentStep, i)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors duration-150 border-[var(--border)] bg-[var(--code-bg)] text-[var(--text-h)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{choice.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* End summary */}
      {finished && !pendingFeedback && (
        <div>
          <div className={[
            'px-4 py-3 rounded-xl border text-sm font-medium mb-4',
            optimalCount === history.length
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--text-h)]',
          ].join(' ')}>
            {optimalCount === history.length
              ? `Excellent — all ${history.length} optimal choices! ✓`
              : `${optimalCount} of ${history.length} optimal decisions.`}
          </div>

          <div className="flex flex-col gap-2">
            {history.map((entry, i) => (
              <div key={i} className={[
                'px-4 py-3 rounded-xl border text-xs',
                entry.isOptimal
                  ? 'border-green-500/20 bg-green-500/5'
                  : 'border-red-500/20 bg-red-500/5',
              ].join(' ')}>
                <p className="font-semibold text-[var(--text-h)] mb-0.5">Step {i + 1}: {entry.prompt}</p>
                <p className={entry.isOptimal ? 'text-green-400' : 'text-red-400'}>
                  Your choice: {entry.choiceText} {entry.isOptimal ? '✓' : '✗'}
                </p>
                {!entry.isOptimal && (
                  <p className="text-[var(--text)] mt-0.5">Optimal: {entry.optimalChoice}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
