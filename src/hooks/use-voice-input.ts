import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";

// "Talk to type" for the message box. Records from the mic in the browser,
// then sends the clip to our server, where OpenAI's Whisper model (run by
// Cloudflare) turns it into text. The text goes into the box; nothing is sent
// to the chat until the person presses send. It also measures how loud the
// mic is, for the live meter and to stop after a long quiet pause.

/** Stop after this much quiet, so a pause to think never sends half a thought. */
const SILENCE_MS = 10_000;
/** Longest one recording can run. */
const MAX_MS = 3 * 60_000;
/** Mic loudness (RMS, 0–1) above this counts as someone talking. */
const SOUND_LEVEL = 0.01;
/** Give up on turning speech into text after this long. */
const TRANSCRIBE_TIMEOUT_MS = 60_000;

const BLOCKED = "Your microphone is blocked. Allow it from the icon in the address bar.";
const NO_MIC = "No microphone found.";
const NOTHING_HEARD: VoiceMessage = { tone: "note", text: "Didn't hear anything. Tap the mic and try again." };

export type VoiceStatus = "idle" | "starting" | "listening" | "finishing";
export interface VoiceMessage {
  text: string;
  tone: "note" | "error";
}

// Chrome, Edge and Firefox record WebM; Safari records MP4. Whisper reads all of them.
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickRecordingType(): string | undefined {
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
}

function isVoiceSupported() {
  return typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Loudness of a chunk of sound, 0 (silent) to 1 (max). */
export function loudness(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Put spoken words after the text that was already in the box. */
function joinText(before: string, spoken: string) {
  if (!spoken) return before;
  if (!before) return spoken;
  return /\s$/.test(before) ? before + spoken : `${before} ${spoken}`;
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return BLOCKED;
  if (name === "NotFoundError" || name === "OverconstrainedError") return NO_MIC;
  if (name === "NotReadableError") return "Your microphone is being used by another app.";
  return "Couldn't turn on the microphone.";
}

/** Send one clip to the server and get its text back. */
async function transcribe(clip: Blob): Promise<string> {
  const ext = clip.type.includes("mp4") ? "m4a" : clip.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("audio", clip, `voice.${ext}`);
  const res = await api<{ text: string }>("/api/transcribe", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });
  return res.text;
}

interface SessionEvents {
  /** The mic is on and recording. */
  onListening: (analyser: AnalyserNode | null, startedAt: number) => void;
  /** Stopped recording; turning the clip into text. */
  onFinishing: () => void;
  /** Fully stopped. `text` is the final text for the box. */
  onDone: (text: string, message: VoiceMessage | null) => void;
}

interface Session {
  /** Stop. "finish" turns what was said into text; "now" throws the recording away. */
  stop: (how: "finish" | "now", message?: VoiceMessage | null) => void;
  /** The person typed while recording: their text becomes the new starting point. */
  edit: (text: string) => void;
  /** Stop and don't report anything back (the box is going away). */
  dispose: () => void;
}

/** One recording: mic, recorder, loudness checks, timers, then the text. */
function startSession(startText: string, events: SessionEvents): Session {
  let active = true; // still meant to be recording
  let done = false; // fully stopped and cleaned up
  let quiet = false; // don't report back (the box is gone)
  let keepClip = false; // turn the recording into text when it stops
  let endMessage: VoiceMessage | null = null;
  let before = startText;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  let checkTimer = 0;

  let startedAt = 0;
  let lastSoundAt = 0;
  let measured = false; // got at least one loudness reading
  let heardSound = false;

  // Make the audio context now, while we still have the tap (Safari needs this).
  try {
    ctx = typeof AudioContext === "undefined" ? null : new AudioContext();
  } catch {
    ctx = null;
  }

  // Every 100ms: is someone talking? Too quiet for too long, or too long overall?
  function check() {
    if (!active) return;
    const now = Date.now();
    if (analyser && samples && ctx?.state === "running") {
      analyser.getFloatTimeDomainData(samples);
      measured = true;
      if (loudness(samples) > SOUND_LEVEL) {
        lastSoundAt = now;
        heardSound = true;
      }
    }
    if (now - startedAt >= MAX_MS) {
      stop("finish", { tone: "note", text: "Stopped after 3 minutes — press send when ready." });
    } else if (now - lastSoundAt >= SILENCE_MS) {
      stop("finish", heardSound ? { tone: "note", text: "Stopped after 10 quiet seconds — press send when ready." } : null);
    }
  }

  function releaseAudio() {
    window.clearInterval(checkTimer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctx = null;
    analyser = null;
  }

  function finish(text: string) {
    if (done) return;
    done = true;
    active = false;
    releaseAudio();
    if (!quiet) events.onDone(text, endMessage);
  }

  async function sendClip() {
    // No sound at all (when we could measure it): don't bother sending silence.
    if (chunks.length === 0 || (measured && !heardSound)) {
      endMessage ??= NOTHING_HEARD;
      finish(before);
      return;
    }
    const clip = new Blob(chunks, { type: recorder?.mimeType || chunks[0].type || "audio/webm" });
    try {
      const spoken = await transcribe(clip);
      if (!spoken) endMessage = NOTHING_HEARD;
      finish(joinText(before, spoken));
    } catch (err) {
      endMessage = {
        tone: "error",
        text:
          err instanceof DOMException && err.name === "TimeoutError"
            ? "Voice typing took too long. Try again, or type instead."
            : errorMessage(err, "Couldn't turn that into text. Try again, or type instead."),
      };
      finish(before);
    }
  }

  function stop(how: "finish" | "now", message: VoiceMessage | null = null) {
    if (done || !active) {
      if (how === "now" && !done) {
        keepClip = false;
        finish(before);
      }
      return;
    }
    active = false;
    endMessage = message;
    keepClip = how === "finish";
    window.clearInterval(checkTimer);
    if (recorder && recorder.state !== "inactive") {
      if (keepClip) events.onFinishing();
      recorder.stop(); // onstop does the rest
      if (!keepClip) finish(before);
    } else {
      finish(before);
    }
  }

  async function begin() {
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      stop("now", { tone: "error", text: micErrorMessage(err) });
      return;
    }
    if (!active) {
      // Stopped while the browser was asking for the mic.
      micStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = micStream;

    // Web Audio, for the meter and the quiet check.
    if (ctx) {
      try {
        const node = ctx.createAnalyser();
        node.fftSize = 1024;
        node.smoothingTimeConstant = 0.5;
        ctx.createMediaStreamSource(micStream).connect(node);
        void ctx.resume().catch(() => {});
        analyser = node;
        samples = new Float32Array(node.fftSize);
      } catch {
        analyser = null;
      }
    }

    try {
      const mimeType = pickRecordingType();
      recorder = new MediaRecorder(micStream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      stop("now", { tone: "error", text: "This browser can't record from the microphone." });
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      releaseAudio();
      if (keepClip && !done) void sendClip();
    };
    recorder.onerror = () => stop("now", { tone: "error", text: "Recording stopped. Tap the mic to try again." });
    recorder.start(1000);

    startedAt = Date.now();
    lastSoundAt = startedAt;
    events.onListening(analyser, startedAt);
    checkTimer = window.setInterval(check, 100);
  }

  // Start on the next tick, so the caller has the session before any events.
  void Promise.resolve().then(begin);

  return {
    stop,
    edit(text) {
      if (!done) before = text;
    },
    dispose() {
      quiet = true;
      stop("now");
    },
  };
}

// Only one recording at a time on the whole page.
let activeSession: Session | null = null;

/**
 * Talk to type. Call `start(boxText)` to record, `stop()` to stop (it
 * resolves with the final box text once the words are in), and
 * `edit(boxText)` when the person types while recording. `onText` gets the
 * full message box text when the words arrive.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [supported] = useState(isVoiceSupported);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [message, setMessage] = useState<VoiceMessage | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const waitersRef = useRef<((text: string) => void)[]>([]);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  const start = useCallback((boxText: string) => {
    if (!isVoiceSupported() || sessionRef.current) return;
    activeSession?.stop("finish");
    setMessage(null);
    setStatus("starting");
    const session: Session = startSession(boxText, {
      onListening: (node, at) => {
        setAnalyser(node);
        setStartedAt(at);
        setStatus("listening");
      },
      onFinishing: () => {
        setAnalyser(null);
        setStatus("finishing");
      },
      onDone: (text, msg) => {
        if (sessionRef.current === session) sessionRef.current = null;
        if (activeSession === session) activeSession = null;
        onTextRef.current(text);
        setAnalyser(null);
        setStatus("idle");
        if (msg) setMessage(msg);
        const waiters = waitersRef.current;
        waitersRef.current = [];
        waiters.forEach((resolve) => resolve(text));
      },
    });
    sessionRef.current = session;
    activeSession = session;
  }, []);

  const stop = useCallback((): Promise<string | null> => {
    const session = sessionRef.current;
    if (!session) return Promise.resolve(null);
    return new Promise((resolve) => {
      waitersRef.current.push(resolve);
      session.stop("finish");
    });
  }, []);

  const edit = useCallback((boxText: string) => sessionRef.current?.edit(boxText), []);
  const clearMessage = useCallback(() => setMessage(null), []);

  // Stop when the page is hidden or closed.
  const on = status === "starting" || status === "listening";
  useEffect(() => {
    if (!on) return;
    const stopNow = () => sessionRef.current?.stop("now");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stopNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stopNow);
    };
  }, [on]);

  // Stop when the box goes away.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (activeSession === session) activeSession = null;
      session?.dispose();
    },
    [],
  );

  return { supported, status, analyser, startedAt, message, start, stop, edit, clearMessage };
}
