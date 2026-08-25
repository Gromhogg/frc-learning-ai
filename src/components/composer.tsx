import { useRef, useState } from "react";
import { resizeImage } from "../lib/resize-image";
import { api, API_BASE } from "../lib/api";

export interface Attachment {
  url: string;
  previewUrl: string;
}

interface Props {
  disabled: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
}

const MAX_PHOTOS = 4;

export default function Composer({ disabled, onSend }: Props) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again later
    if (chosen.length === 0) return;

    if (attachments.length + chosen.length > MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of chosen) {
        form.append("images", await resizeImage(file));
      }
      const { urls } = await api<{ urls: string[] }>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setAttachments((prev) => [
        ...prev,
        ...urls.map((url) => ({ url, previewUrl: `${API_BASE}${url}` })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const text = input.trim();
    if (disabled || uploading) return;
    if (!text && attachments.length === 0) return;

    onSend(text, attachments);
    setInput("");
    setAttachments([]);
    setError(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !disabled && !uploading && (input.trim() !== "" || attachments.length > 0);

  return (
    <div className="border-t border-[var(--border)] px-4 py-4 bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto">
        {error && (
          <p className="text-xs text-red-400 mb-2 px-1">{error}</p>
        )}

        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachments.map((attachment) => (
              <div key={attachment.url} className="relative">
                <img
                  src={attachment.previewUrl}
                  alt="Attached"
                  className="w-16 h-16 object-cover rounded-lg border border-[var(--border)]"
                />
                <button
                  onClick={() =>
                    setAttachments((prev) => prev.filter((a) => a.url !== attachment.url))
                  }
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-h)] flex items-center justify-center hover:border-red-400 hover:text-red-400 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="10" height="10">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-2 items-end"
        >
          {/* capture="environment" makes phones open the rear camera directly */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || attachments.length >= MAX_PHOTOS}
            aria-label="Attach a photo"
            className="px-3 py-2.5 rounded-xl border-2 border-[var(--border)] text-[var(--text)] hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {uploading ? (
              <span className="block w-[18px] h-[18px] rounded-full border-2 border-[var(--text)] border-t-transparent animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about FRC or robotics…"
            className="flex-1 resize-none rounded-xl border-2 border-[var(--border)] px-4 py-2.5 text-sm font-medium bg-[var(--code-bg)] text-[var(--text-h)] placeholder:text-[var(--text)] hover:border-[var(--accent-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
            style={{ maxHeight: "8rem", overflowY: "auto" }}
          />

          <button
            type="submit"
            disabled={!canSend}
            className={[
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              canSend
                ? "bg-[var(--accent)] text-white hover:opacity-90 active:scale-95"
                : "bg-[var(--border)] text-[var(--text)] cursor-not-allowed",
            ].join(" ")}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
