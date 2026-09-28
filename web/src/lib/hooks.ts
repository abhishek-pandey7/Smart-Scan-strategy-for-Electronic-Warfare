import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Timeline, atCursor, indexAtOrBefore } from "@/lib/api";

export const SPEEDS = [1, 2, 4, 10] as const;

/** Index of the last sample <= cursor in a sorted time array (-1 before the first). */
export function useCursorIndex(sorted: number[], cursor: number) {
  return useMemo(() => indexAtOrBefore(sorted, cursor), [sorted, cursor]);
}

export function useTimelineAt(timeline: Timeline | undefined, cursor: number) {
  return useMemo(() => (timeline ? atCursor(timeline, cursor) : null), [timeline, cursor]);
}

/** +1 plays forward (stops at the horizon), -1 plays in reverse (stops at 0). */
export type PlayDirection = 1 | -1;

export type Playback = {
  cursor: number; horizon: number; playing: boolean; speed: number; direction: PlayDirection;
  setCursor: (t: number) => void; setPlaying: (p: boolean) => void; setSpeed: (s: number) => void;
  setDirection: (d: PlayDirection) => void;
  /** Rewind to 0 and start playing forward. */
  restart: () => void;
  /** Play in direction `d`, wrapping to the opposite end if already at the stop point. */
  play: (d?: PlayDirection) => void;
  /** Ready-made props for <PlayBar {...pb.bind} />. */
  bind: {
    cursor: number; horizon: number; playing: boolean; speed: number;
    onCursorChange: (t: number) => void; onPlayingChange: (p: boolean) => void; onSpeedChange: (s: number) => void;
  };
};

/** Owns cursor/playing/speed/direction and drives the cursor with requestAnimationFrame. */
export function usePlayback(horizon: number, initialSpeed = 4): Playback {
  const [cursor, setCursorState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const [direction, setDirection] = useState<PlayDirection>(1);
  const ref = useRef(0);

  const setCursor = useCallback((t: number) => {
    const v = Math.max(0, Math.min(horizon, t));
    ref.current = v;
    setCursorState(v);
  }, [horizon]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const step = ((now - last) / 1000) * speed * direction;
      const next = Math.max(0, Math.min(horizon, ref.current + step));
      last = now;
      ref.current = next;
      setCursorState(next);
      if ((direction > 0 && next >= horizon) || (direction < 0 && next <= 0)) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, direction, horizon]);

  const restart = useCallback(() => {
    setDirection(1);
    setCursor(0);
    setPlaying(true);
  }, [setCursor]);

  const play = useCallback((d: PlayDirection = 1) => {
    if (d > 0 && ref.current >= horizon) setCursor(0);
    if (d < 0 && ref.current <= 0) setCursor(horizon);
    setDirection(d);
    setPlaying(true);
  }, [horizon, setCursor]);

  return {
    cursor, horizon, playing, speed, direction, setCursor, setPlaying, setSpeed, setDirection, restart, play,
    bind: { cursor, horizon, playing, speed, onCursorChange: setCursor, onPlayingChange: setPlaying, onSpeedChange: setSpeed },
  };
}
