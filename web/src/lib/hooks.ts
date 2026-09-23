import { useEffect, useMemo, useRef, useState } from "react";
import { type Timeline, atCursor, indexAtOrBefore } from "@/lib/api";

export const SPEEDS = [1, 2, 4, 10] as const;

/** Index of the last sample <= cursor in a sorted time array (-1 before the first). */
export function useCursorIndex(sorted: number[], cursor: number) {
  return useMemo(() => indexAtOrBefore(sorted, cursor), [sorted, cursor]);
}

export function useTimelineAt(timeline: Timeline | undefined, cursor: number) {
  return useMemo(() => (timeline ? atCursor(timeline, cursor) : null), [timeline, cursor]);
}

export type Playback = {
  cursor: number; horizon: number; playing: boolean; speed: number;
  setCursor: (t: number) => void; setPlaying: (p: boolean) => void; setSpeed: (s: number) => void;
  /** Rewind to 0 and start playing. */
  restart: () => void;
  /** Ready-made props for <PlayBar {...pb.bind} />. */
  bind: {
    cursor: number; horizon: number; playing: boolean; speed: number;
    onCursorChange: (t: number) => void; onPlayingChange: (p: boolean) => void; onSpeedChange: (s: number) => void;
  };
};

/** Owns cursor/playing/speed and drives the cursor with requestAnimationFrame. */
export function usePlayback(horizon: number, initialSpeed = 4): Playback {
  const [cursor, setCursorState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const ref = useRef(0);

  const setCursor = (t: number) => {
    const v = Math.max(0, Math.min(horizon, t));
    ref.current = v;
    setCursorState(v);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(horizon, ref.current + ((now - last) / 1000) * speed);
      last = now;
      ref.current = next;
      setCursorState(next);
      if (next >= horizon) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, horizon]);

  return {
    cursor, horizon, playing, speed, setCursor, setPlaying, setSpeed,
    restart: () => { setCursor(0); setPlaying(true); },
    bind: { cursor, horizon, playing, speed, onCursorChange: setCursor, onPlayingChange: setPlaying, onSpeedChange: setSpeed },
  };
}
