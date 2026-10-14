import { useEffect, useRef } from "react";
import { loudness } from "../../hooks/use-voice-input";

// Live sound bars for "talk to type", plus a "Listening 0:12" timer.
// The bars follow the real sound from the mic on every frame, and stay flat
// when nobody is talking. Heights are set right on the bars (not through
// React state) so this stays light at 60 frames a second.

/** Voice pitch range for each bar, in Hz. Lower sounds in the middle, where voices are strongest. */
const BANDS: [number, number][] = [
  [1800, 3500],
  [600, 1200],
  [150, 600],
  [1200, 1800],
  [3500, 6000],
];
/** Base size of each bar, so the middle ones are tallest. */
const SHAPE = [0.6, 0.85, 1, 0.8, 0.55];
/** Quietest and loudest sound the bars show, in decibels. */
const QUIET_DB = -50;
const LOUD_DB = -12;
/** Bar height in pixels: a small dot when quiet, up to full when loud. */
const MIN_PX = 3;
const MAX_PX = 16;

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceMeter({ analyser, startedAt }: { analyser: AnalyserNode | null; startedAt: number }) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const samples = analyser ? new Float32Array(analyser.fftSize) : null;
    const freqs = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const hzPerBin = analyser ? analyser.context.sampleRate / analyser.fftSize : 1;
    const heights = BANDS.map(() => 0);
    let shownSeconds = -1;
    let frame = 0;

    const tick = () => {
      // Timer: only touch the text when the second changes.
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      if (seconds !== shownSeconds && timeRef.current) {
        shownSeconds = seconds;
        timeRef.current.textContent = formatTime(seconds);
      }

      // Overall loudness, 0 (quiet) to 1 (loud).
      let level = 0;
      const bands = BANDS.map(() => 1);
      if (analyser && samples && freqs) {
        analyser.getFloatTimeDomainData(samples);
        const db = 20 * Math.log10(loudness(samples) + 1e-8);
        level = Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));

        // How strong each pitch range is, compared with the strongest one.
        analyser.getByteFrequencyData(freqs);
        let strongest = 1;
        BANDS.forEach(([low, high], i) => {
          const from = Math.max(1, Math.floor(low / hzPerBin));
          const to = Math.min(freqs.length - 1, Math.ceil(high / hzPerBin));
          let sum = 0;
          for (let b = from; b <= to; b++) sum += freqs[b];
          bands[i] = sum / Math.max(1, to - from + 1);
          strongest = Math.max(strongest, bands[i]);
        });
        for (let i = 0; i < bands.length; i++) bands[i] /= strongest;
      }

      barRefs.current.forEach((bar, i) => {
        if (!bar) return;
        const target = level * SHAPE[i] * (0.55 + 0.45 * bands[i]);
        // Rise fast, fall slower, so it looks smooth but still quick.
        const ease = target > heights[i] ? 0.5 : 0.1;
        heights[i] += (target - heights[i]) * ease;
        bar.style.height = `${(MIN_PX + (MAX_PX - MIN_PX) * heights[i]).toFixed(1)}px`;
      });

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser, startedAt]);

  return (
    <div className="flex items-center gap-2 pl-1 text-[13px] text-muted select-none" aria-hidden>
      <span className="flex h-4 items-center gap-[3px]">
        {BANDS.map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="w-[3px] rounded-full bg-accent"
            style={{ height: MIN_PX }}
          />
        ))}
      </span>
      <span className="font-medium text-fg-2">Listening</span>
      <span ref={timeRef} className="tabular-nums">
        0:00
      </span>
    </div>
  );
}
