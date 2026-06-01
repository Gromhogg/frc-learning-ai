import React from 'react';

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

// SVG icons based on common FRC topic keywords
function topicIcon(slug: string): React.ReactNode {
  const s = slug.toLowerCase();
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (s.includes('drive') || s.includes('swerve') || s.includes('chassis'))
    return <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/><line x1="2" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="22" y2="12"/></svg>;
  if (s.includes('sensor') || s.includes('vision') || s.includes('camera'))
    return <svg {...props}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
  if (s.includes('program') || s.includes('code') || s.includes('software'))
    return <svg {...props}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
  if (s.includes('electrical') || s.includes('wiring') || s.includes('power'))
    return <svg {...props}><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (s.includes('mechanic') || s.includes('build') || s.includes('structure'))
    return <svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
  if (s.includes('pneumat') || s.includes('piston'))
    return <svg {...props}><path d="M5 12H2"/><path d="M22 12h-3"/><rect x="9" y="8" width="6" height="8" rx="1"/><path d="M9 10H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2"/><path d="M15 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2"/></svg>;
  if (s.includes('safety') || s.includes('pit'))
    return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  if (s.includes('game') || s.includes('strategy') || s.includes('auto'))
    return <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
  if (s.includes('climb') || s.includes('arm') || s.includes('lift'))
    return <svg {...props}><polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/></svg>;
  return <svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
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
                ? 'border-[var(--accent)] bg-[var(--accent-bg)] shadow-lg shadow-orange-900/20'
                : 'border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] hover:shadow-md',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 mt-0.5 text-[var(--text-h)] opacity-70" aria-hidden="true">
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
