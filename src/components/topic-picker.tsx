interface Topic {
  id: number;
  name: string;
  slug: string;
  filePath: string;
}

interface TopicPickerProps {
  topics: Topic[];
  selectedTopicId: number | null;
  onSelect: (topic: Topic) => void;
}

// Simple emoji icons based on common FRC topic keywords
function topicIcon(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes('drive') || s.includes('swerve') || s.includes('chassis')) return '🚗';
  if (s.includes('sensor') || s.includes('vision') || s.includes('camera')) return '📷';
  if (s.includes('program') || s.includes('code') || s.includes('software')) return '💻';
  if (s.includes('electrical') || s.includes('wiring') || s.includes('power')) return '⚡';
  if (s.includes('mechanic') || s.includes('build') || s.includes('structure')) return '🔧';
  if (s.includes('pneumat') || s.includes('piston')) return '💨';
  if (s.includes('safety') || s.includes('pit')) return '🦺';
  if (s.includes('game') || s.includes('strategy') || s.includes('auto')) return '🎯';
  if (s.includes('climb') || s.includes('arm') || s.includes('lift')) return '🦾';
  return '📚';
}

export default function TopicPicker({ topics, selectedTopicId, onSelect }: TopicPickerProps) {
  if (topics.length === 0) {
    return (
      <p className="text-sm text-[var(--text)] italic py-4">
        No topics available. Make sure the server is running and the database is seeded.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {topics.map((topic) => {
        const isSelected = topic.id === selectedTopicId;
        return (
          <button
            key={topic.id}
            onClick={() => onSelect(topic)}
            className={[
              'group text-left rounded-xl border-2 px-5 py-4 transition-all duration-150 cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              isSelected
                ? 'border-[var(--accent)] bg-[var(--accent-bg)] shadow-lg shadow-indigo-900/20'
                : 'border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] hover:shadow-md',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5 flex-shrink-0" role="img" aria-hidden="true">
                {topicIcon(topic.slug)}
              </span>
              <div className="min-w-0">
                <span
                  className={[
                    'block text-sm font-semibold leading-snug',
                    isSelected ? 'text-[var(--accent-hover)]' : 'text-[var(--text-h)] group-hover:text-[var(--accent-hover)]',
                  ].join(' ')}
                >
                  {topic.name}
                </span>
                <span className="block mt-1 text-xs font-mono text-[var(--text)] opacity-60 truncate">
                  {topic.slug}
                </span>
              </div>
              {isSelected && (
                <span className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
