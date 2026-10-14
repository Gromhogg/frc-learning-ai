import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Mic, Square, X } from "lucide-react";
import { api, API_BASE, errorMessage } from "../../lib/api";
import { resizeImage } from "../../lib/resize-image";
import { useVoiceInput } from "../../hooks/use-voice-input";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Spinner } from "../ui/misc";
import { Tooltip } from "../ui/tooltip";
import { VoiceMeter } from "./voice-meter";

const MAX_PHOTOS = 4;

export function Composer({
  busy,
  onSend,
  onStop,
  placeholder = "Ask anything…",
  allowPhotos = false,
  allowVoice = true,
  autoFocus,
  className,
}: {
  busy: boolean;
  onSend: (text: string, images: string[]) => void;
  onStop?: () => void;
  placeholder?: string;
  allowPhotos?: boolean;
  /** Show the "talk to type" mic button (only in browsers that support it). */
  allowVoice?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput(setText);
  const { stop: stopVoice } = voice;
  const [sendingVoice, setSendingVoice] = useState(false);
  const busyRef = useRef(busy);

  // "starting" = waiting for the browser to allow the mic.
  const listening = voice.status === "listening" || voice.status === "starting";
  const finishing = voice.status === "finishing";
  const showMic = allowVoice && voice.supported && !busy;

  // If the AI starts answering some other way, stop listening (nothing is sent).
  useEffect(() => {
    busyRef.current = busy;
    if (busy) void stopVoice();
  }, [busy, stopVoice]);

  // Grow with the text, up to a limit, then scroll.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  async function addPhotos(files: File[]) {
    if (files.length === 0) return;
    if (images.length + files.length > MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("images", await resizeImage(file));
      const { urls } = await api<{ urls: string[] }>("/api/uploads", { method: "POST", body: form });
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload that photo."));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (busy || uploading || finishing || sendingVoice) return;
    if (listening) {
      // Stop listening first, then send one message with the final words.
      setSendingVoice(true);
      const finalText = await stopVoice();
      setSendingVoice(false);
      send(finalText ?? text);
      return;
    }
    send(text);
  }

  function send(value: string) {
    const trimmed = value.trim();
    if (busyRef.current || (!trimmed && images.length === 0)) return;
    onSend(trimmed, images);
    setText("");
    setImages([]);
    setError(null);
    voice.clearMessage();
    textRef.current?.focus();
  }

  const canSend = !uploading && (listening || text.trim().length > 0 || images.length > 0);

  return (
    <div className={className}>
      <div
        className={cn(
          "rounded-3xl border border-line bg-surface shadow-soft transition-[border-color,box-shadow]",
          "focus-within:border-line-strong focus-within:shadow-float",
        )}
        onDragOver={(e) => allowPhotos && e.preventDefault()}
        onDrop={(e) => {
          if (!allowPhotos) return;
          e.preventDefault();
          void addPhotos(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
        }}
      >
        {images.length > 0 || uploading ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {images.map((url) => (
              <div key={url} className="group relative">
                <img src={`${API_BASE}${url}`} alt="" className="size-16 rounded-xl border border-line object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                  className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-fg text-bg shadow-soft"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {uploading ? (
              <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-line text-muted">
                <Spinner />
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textRef}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          readOnly={finishing}
          placeholder={listening ? "Start talking…" : placeholder}
          onChange={(e) => {
            setText(e.target.value);
            // Typing while listening: keep what they typed, and add new words after it.
            if (listening) voice.edit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            if (!allowPhotos) return;
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length > 0) {
              e.preventDefault();
              void addPhotos(files);
            }
          }}
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[17px] leading-relaxed text-fg placeholder:text-faint focus:outline-none"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {allowPhotos ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void addPhotos(files);
                }}
              />
              <Tooltip label="Add photo">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Add photo"
                  className="rounded-full text-muted"
                  disabled={uploading || images.length >= MAX_PHOTOS}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus />
                </Button>
              </Tooltip>
            </>
          ) : null}
          {showMic ? (
            <Tooltip label={listening ? "Stop listening" : "Talk to type"}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={listening ? "Stop listening" : "Talk to type"}
                aria-pressed={listening}
                className={cn("rounded-full", listening ? "!bg-accent-soft !text-accent-text" : "text-muted")}
                disabled={finishing || sendingVoice}
                onClick={() => (listening ? void stopVoice() : voice.start(text))}
              >
                {voice.status === "starting" || finishing ? <Spinner /> : <Mic />}
              </Button>
            </Tooltip>
          ) : null}
          {voice.status === "listening" ? <VoiceMeter analyser={voice.analyser} startedAt={voice.startedAt} /> : null}
          <div className="flex-1" />
          {busy && onStop ? (
            <Tooltip label="Stop">
              <Button variant="primary" size="icon" aria-label="Stop" className="rounded-full" onClick={onStop}>
                <Square className="!size-3.5 fill-current" />
              </Button>
            </Tooltip>
          ) : (
            <Button
              variant="primary"
              size="icon"
              aria-label="Send"
              className="rounded-full"
              disabled={!canSend || busy || finishing}
              onClick={() => void submit()}
            >
              {sendingVoice ? <Spinner /> : <ArrowUp />}
            </Button>
          )}
        </div>
      </div>
      {error ? <p className="mt-2 px-2 text-sm text-bad">{error}</p> : null}
      {voice.message ? (
        <p className={cn("mt-2 px-2 text-sm", voice.message.tone === "error" ? "text-bad" : "text-muted")}>
          {voice.message.text}
        </p>
      ) : null}
      {/* Tells screen readers when listening starts, and why it stopped. */}
      <span className="sr-only" aria-live="polite">
        {voice.status === "listening" ? "Listening" : (voice.message?.text ?? "")}
      </span>
    </div>
  );
}
