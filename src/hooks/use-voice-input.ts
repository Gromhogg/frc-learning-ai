import { useCallback, useEffect, useRef, useState } from "react";

// "Talk to type" for the message box. Uses the browser's own speech
// recognition (Chrome, Edge, Safari) to turn speech into text. While
// listening, nothing is sent to our server — the words only go into the box.
// It also measures how loud the mic is, for the live meter and to stop
// listening after a long quiet pause.

/** Stop after this much quiet, so a pause to think never sends half a thought. */
const SILENCE_MS = 10_000;
/** Longest one listening session can run. */
const MAX_MS = 3 * 60_000;
/** Most text the box can hold from talking. */
const MAX_CHARS = 4000;
/** Mic loudness (RMS, 0–1) above this counts as someone talking. */
const SOUND_LEVEL = 0.01;
/** How long to wait for the last words after stopping. */
const FINISH_WAIT_MS = 1500;

const BLOCKED = "Your microphone is blocked. Allow it from the icon in the address bar.";
const NO_MIC = "No microphone found.";

export type VoiceStatus = "idle" | "starting" | "listening" | "finishing";
export interface VoiceMessage {
  text: string;
  tone: "note" | "error";
}

// TypeScript doesn't know the speech recognition types in every setup, so
// here are the small parts we use.
interface SpeechAlternative {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}
interface SpeechResultEvent extends Event {
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent extends Event {
  readonly error: string;
}
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognizerClass = new () => Recognizer;

function getRecognizerClass(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True in Chrome, Edge and Safari. False in Firefox (no speech recognition). */
function isVoiceSupported() {
  return getRecognizerClass() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
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

function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
      return BLOCKED;
    case "service-not-allowed":
      return "Voice typing is turned off in this browser.";
    case "network":
      return "Voice needs an internet connection.";
    case "audio-capture":
      return NO_MIC;
    case "language-not-supported":
      return "Voice typing isn't available in this browser.";
    default:
      return "Voice typing stopped. Tap the mic to try again.";
  }
}

interface SessionEvents {
  /** New text for the message box. */
  onText: (text: string) => void;
  /** The mic is on and the words are coming in. */
  onListening: (analyser: AnalyserNode | null, startedAt: number) => void;
  /** Stopped listening; waiting a moment for the last words. */
  onFinishing: () => void;
  /** Fully stopped. `text` is the final text for the box. */
  onDone: (text: string, message: VoiceMessage | null) => void;
}

interface Session {
  /** Stop listening. "finish" waits a moment for the last words; "now" doesn't. */
  stop: (how: "finish" | "now", message?: VoiceMessage | null) => void;
  /** The person typed while listening: their text becomes the new starting point. */
  edit: (text: string) => void;
  /** Stop and don't report anything back (the box is going away). */
  dispose: () => void;
}

/** One listening session: mic, speech recognition, loudness checks, and timers. */
function startSession(Rec: RecognizerClass, startText: string, events: SessionEvents): Session {
  let active = true; // still meant to be listening
  let done = false; // fully stopped and cleaned up
  let running = false; // the speech recognizer is on right now
  let quiet = false; // don't report back (the box is gone)
  let endMessage: VoiceMessage | null = null;

  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  let checkTimer = 0;
  let restartTimer = 0;
  let finishTimer = 0;

  let startedAt = 0;
  let lastSoundAt = 0;
  let lastStartAt = 0;
  let quickEnds = 0;

  // The text is: (box text before these words) + (earlier words) + (words now).
  let before = startText;
  let earlier = ""; // words from earlier recognizer runs (the browser restarts it)
  let current = ""; // words from this recognizer run
  let skip = 0; // results of this run already kept in `before` (after the person typed)
  let resultCount = 0;

  const fullText = () => joinText(before, `${earlier} ${current}`.replace(/\s+/g, " ").trim());

  // Make the audio context now, while we still have the tap (Safari needs this).
  try {
    ctx = typeof AudioContext === "undefined" ? null : new AudioContext();
  } catch {
    ctx = null;
  }

  const rec = new Rec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event) => {
    if (done) return;
    let words = "";
    for (let i = skip; i < event.results.length; i++) words += ` ${event.results[i][0]?.transcript ?? ""}`;
    current = words;
    resultCount = event.results.length;
    lastSoundAt = Date.now();
    const text = fullText();
    events.onText(text);
    if (active && text.length >= MAX_CHARS) {
      stop("finish", { tone: "note", text: "Stopped at 4,000 characters — press send when ready." });
    }
  };

  rec.onerror = (event) => {
    // "no-speech" just means a quiet moment; the recognizer restarts below.
    if (event.error === "no-speech" || event.error === "aborted") return;
    stop("now", { tone: "error", text: speechErrorMessage(event.error) });
  };

  rec.onend = () => {
    running = false;
    if (done) return;
    if (!active) {
      finish();
      return;
    }
    // The browser ended it on its own while we still want to listen.
    // Keep the words so far and start a new run.
    earlier = `${earlier} ${current}`;
    current = "";
    skip = 0;
    resultCount = 0;
    // Don't get stuck restarting over and over if it keeps ending right away.
    quickEnds = Date.now() - lastStartAt < 1500 ? quickEnds + 1 : 0;
    if (quickEnds >= 5) {
      stop("now", { tone: "error", text: speechErrorMessage("") });
      return;
    }
    restartTimer = window.setTimeout(runRecognizer, quickEnds * 400);
  };

  function runRecognizer() {
    if (!active) return;
    lastStartAt = Date.now();
    try {
      rec.start();
      running = true;
    } catch {
      // Already running.
    }
  }

  // Every 100ms: is someone talking? Too quiet for too long, or too long overall?
  function check() {
    if (!active) return;
    const now = Date.now();
    if (analyser && samples && ctx?.state === "running") {
      analyser.getFloatTimeDomainData(samples);
      if (loudness(samples) > SOUND_LEVEL) lastSoundAt = now;
    }
    if (now - startedAt >= MAX_MS) {
      stop("finish", { tone: "note", text: "Stopped after 3 minutes — press send when ready." });
    } else if (now - lastSoundAt >= SILENCE_MS) {
      stop("finish", { tone: "note", text: "Stopped after 10 quiet seconds — press send when ready." });
    }
  }

  function releaseAudio() {
    window.clearInterval(checkTimer);
    window.clearTimeout(restartTimer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctx = null;
    analyser = null;
  }

  function finish() {
    if (done) return;
    done = true;
    active = false;
    releaseAudio();
    window.clearTimeout(finishTimer);
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    if (running) rec.abort();
    running = false;
    if (!quiet) events.onDone(fullText(), endMessage);
  }

  function stop(how: "finish" | "now", message: VoiceMessage | null = null) {
    if (done) return;
    if (!active) {
      if (how === "now") finish();
      return;
    }
    active = false;
    endMessage = message;
    releaseAudio();
    if (how === "finish" && running) {
      events.onFinishing();
      try {
        rec.stop();
      } catch {
        finish();
        return;
      }
      finishTimer = window.setTimeout(finish, FINISH_WAIT_MS);
    } else {
      finish();
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

    startedAt = Date.now();
    lastSoundAt = startedAt;
    events.onListening(analyser, startedAt);
    checkTimer = window.setInterval(check, 100);
    runRecognizer();
  }

  // Start on the next tick, so the caller has the session before any events.
  void Promise.resolve().then(begin);

  return {
    stop,
    edit(text) {
      if (done) return;
      before = text;
      earlier = "";
      current = "";
      skip = resultCount;
    },
    dispose() {
      quiet = true;
      stop("now");
    },
  };
}

// Only one listening session at a time on the whole page.
let activeSession: Session | null = null;

/**
 * Talk to type. `onText` gets the full message box text as words come in.
 * Call `start(boxText)` to listen, `stop()` to stop (it resolves with the
 * final text once the last words are in), and `edit(boxText)` when the person
 * types while listening.
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
    const Rec = getRecognizerClass();
    if (!Rec || sessionRef.current) return;
    activeSession?.stop("finish");
    setMessage(null);
    setStatus("starting");
    const session: Session = startSession(Rec, boxText, {
      onText: (text) => onTextRef.current(text),
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
