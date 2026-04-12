import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInterface from '../components/chat-interface';

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

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: 'http://localhost:3001/api/chat',
      body: {
        topicId: Number(topicId),
        userId: Number(userId),
      },
    }),
    messages: [],
    onFinish: () => {
      setSessionComplete(true);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

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
      const chatLogStr = JSON.stringify(messages);

      // Step 1: Extract the real score from the chat log via AI
      let score = 0;
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

      // Step 2: Save the assessment with the real score
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
              if (messages.length > 0 && !sessionComplete) {
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
                : 'bg-red-500/10 text-red-400 border border-red-400/30 hover:bg-red-500/20',
            ].join(' ')}
          >
            {isSaving ? 'Saving…' : 'End Session'}
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
              <span className="text-yellow-400 text-xl mt-0.5">⚠</span>
              <div>
                <p className="text-base font-semibold text-[var(--text-h)]">Exit without saving?</p>
                <p className="text-sm text-[var(--text)] mt-1 leading-relaxed">
                  Your session with the AI hasn't been saved. If you leave now, this conversation and any progress will be lost.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/')}
                className="w-full px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-400/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
              >
                Exit without saving
              </button>
              <button
                onClick={() => setShowExitWarning(false)}
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
