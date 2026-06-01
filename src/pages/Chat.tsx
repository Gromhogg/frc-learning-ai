import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useBlocker } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import ChatInterface, { type WidgetAnswer } from '../components/chat-interface';
import type { QuizAnswer } from '../components/quiz-widget';

export default function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userId = searchParams.get('userId');
  const topicId = searchParams.get('topicId');
  const topicName = searchParams.get('topicName') ?? 'Unknown Topic';
  const userName = searchParams.get('userName') ?? 'Unknown User';

  // Redirect if missing required params
  useEffect(() => {
    if (!userId || !topicId) {
      navigate('/');
    }
  }, [userId, topicId, navigate]);

  const [sessionComplete, setSessionComplete] = useState(false);
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);

  // Widget answers by toolCallId — used for both scoring and persisting into the chat log
  const widgetAnswers = useRef<Map<string, WidgetAnswer>>(new Map());

  function handleWidgetAnswer(toolCallId: string, answer: WidgetAnswer) {
    widgetAnswers.current.set(toolCallId, answer);
  }

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:3001/api/chat',
      body: {
        topicId: Number(topicId),
        userId: Number(userId),
      },
    }),
    messages: [],
    onFinish: ({ message }) => {
      const text = message.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
      if (/Score:\s*\d+\s*\/\s*100/i.test(text)) {
        setSessionComplete(true);
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const shouldWarn = messages.length > 0 && !sessionComplete && !isSaving;

  // Block browser back button / swipe navigation
  const blocker = useBlocker(shouldWarn);

  // Show the warning modal when the browser blocker fires
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowExitWarning(true);
    }
  }, [blocker.state]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  function handleSubmit(_e?: React.FormEvent) {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void sendMessage({ text });
  }

  async function handleEndSession() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Enrich messages with captured widget answers so the chat log preserves what the student selected
      const enrichedMessages = messages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (!isToolUIPart(part)) return part;
          const answer = widgetAnswers.current.get(part.toolCallId);
          if (answer === undefined) return part;
          const existingOutput = (part.state === 'output-available' && part.output && typeof part.output === 'object')
            ? (part.output as Record<string, unknown>)
            : {};
          return { ...part, output: { ...existingOutput, answer } };
        }),
      }));
      const chatLogStr = JSON.stringify(enrichedMessages);
      const questionsAnswered = messages.filter((m) => m.role === 'user').length;

      // Fetch session thresholds from settings
      let minQuestions = 3;
      let minCorrectAnswers = 0;
      try {
        const settingsRes = await fetch('http://localhost:3001/api/admin/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json() as Record<string, string>;
          const mq = parseInt(settingsData.minQuestions ?? '3', 10);
          if (!isNaN(mq)) minQuestions = mq;
          const mc = parseInt(settingsData.minCorrectAnswers ?? '0', 10);
          if (!isNaN(mc)) minCorrectAnswers = mc;
        }
      } catch {
        // fall back to defaults
      }

      if (questionsAnswered < minQuestions) return;

      // Count quiz answers for objective scoring
      let correct = 0;
      let total = 0;
      for (const answer of widgetAnswers.current.values()) {
        if (typeof (answer as QuizAnswer).selectedIndex === 'number' && typeof (answer as QuizAnswer).correct === 'boolean') {
          total += 1;
          if ((answer as QuizAnswer).correct) correct += 1;
        }
      }

      let score: number;

      if (total > 0) {
        // Objective scoring: correct quiz answers / total quiz questions
        score = Math.round((correct / total) * 100);

        // Gate on minimum correct answers using real data
        if (minCorrectAnswers > 0 && correct < minCorrectAnswers) return;
      } else {
        // No quiz widgets used — fall back to AI extraction
        score = 0;
        try {
          const scoreRes = await fetch('http://localhost:3001/api/assessments/extract-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatLog: chatLogStr }),
          });
          if (scoreRes.ok) {
            const { score: extracted } = await scoreRes.json() as { score: number };
            score = typeof extracted === 'number' ? extracted : 0;
          }
        } catch (err) {
          console.warn('Score extraction failed, defaulting to 0:', err);
        }

        // Don't save zero-score sessions from AI fallback (likely a failed extraction)
        if (score === 0) return;

        if (minCorrectAnswers > 0) {
          const estimatedCorrect = (score * questionsAnswered) / 100;
          if (estimatedCorrect < minCorrectAnswers) return;
        }
      }

      const saveRes = await fetch('http://localhost:3001/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(userId),
          topicId: Number(topicId),
          score,
          chatLog: chatLogStr,
        }),
      });

      if (!saveRes.ok) {
        console.error('Failed to save assessment, status:', saveRes.status);
      }
    } catch (err) {
      console.error('Failed to save assessment:', err);
    } finally {
      navigate('/results');
    }
  }

  if (!userId || !topicId) return null;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--card-bg)] flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (shouldWarn) {
                setShowExitWarning(true);
              } else {
                navigate('/');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            ← Back
          </button>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--text-h)] leading-tight">{topicName}</span>
            <span className="text-xs text-[var(--text)] leading-tight">with {userName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionComplete && (
            <span className="text-xs font-semibold text-green-500 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30">
              Session complete
            </span>
          )}
          <button
            onClick={() => void handleEndSession()}
            disabled={isSaving}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              isSaving
                ? 'bg-[var(--border)] text-[var(--text)] cursor-not-allowed'
                : 'bg-[var(--accent)] text-white border border-[var(--accent)] hover:opacity-90',
            ].join(' ')}
          >
            {isSaving ? 'Saving…' : 'Save & End Session'}
          </button>
        </div>
      </header>

      {/* Chat interface */}
      <ChatInterface
        messages={messages}
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        onWidgetAnswer={handleWidgetAnswer}
      />

      {/* Exit without saving — confirmation modal */}
      {showExitWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setShowExitWarning(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <svg className="text-yellow-400 flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <p className="text-base font-semibold text-[var(--text-h)]">Exit without saving?</p>
                <p className="text-sm text-[var(--text)] mt-1 leading-relaxed">
                  Your session hasn't been saved. If you leave now, this conversation and your quiz progress will be lost.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowExitWarning(false);
                  if (blocker.state === 'blocked') {
                    blocker.proceed();
                  } else {
                    navigate('/');
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-400/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
              >
                Exit without saving
              </button>
              <button
                onClick={() => {
                  setShowExitWarning(false);
                  if (blocker.state === 'blocked') blocker.reset();
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-h)] text-sm font-semibold hover:bg-[var(--bg)] transition-colors"
              >
                Stay in session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
