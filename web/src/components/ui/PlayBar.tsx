"use client";

import type { ReactNode } from "react";
import { SPEEDS } from "@/lib/hooks";

export type PlayBarProps = {
  cursor: number;
  horizon: number;
  playing: boolean;
  speed: number;
  onCursorChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  speeds?: readonly number[];
  disabled?: boolean;
  /** Extra content on the right, e.g. a live counter. */
  children?: ReactNode;
  className?: string;
};

export default function PlayBar({
  cursor, horizon, playing, speed, onCursorChange, onPlayingChange, onSpeedChange,
  speeds = SPEEDS, disabled, children, className,
}: PlayBarProps) {
  const atEnd = cursor >= horizon;
  const toggle = () => {
    if (!playing && atEnd) onCursorChange(0);
    onPlayingChange(!playing);
  };
  return (
    <div className={["playbar", className].filter(Boolean).join(" ")}>
      <button type="button" className="btn playbar-btn" onClick={toggle} disabled={disabled}
        aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}>
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
          {playing
            ? <><rect x={2} y={1} width={3.5} height={12} rx={1} fill="currentColor" /><rect x={8.5} y={1} width={3.5} height={12} rx={1} fill="currentColor" /></>
            : <path d="M3 1.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 3 1.5z" fill="currentColor" />}
        </svg>
        <span>{playing ? "Pause" : atEnd ? "Replay" : "Play"}</span>
      </button>
      <input type="range" min={0} max={horizon} step={0.05} value={Math.min(cursor, horizon)} disabled={disabled}
        aria-label="Playback time" className="playbar-range"
        style={{ ["--progress" as string]: `${horizon ? (100 * Math.min(cursor, horizon)) / horizon : 0}%` }}
        onChange={(e) => { onPlayingChange(false); onCursorChange(Number(e.target.value)); }} />
      <span className="playbar-time mono">
        {cursor.toFixed(1)}<span className="muted"> / {horizon.toFixed(0)} s</span>
      </span>
      <div className="segmented" role="group" aria-label="Playback speed">
        {speeds.map((s) => (
          <button type="button" key={s} aria-pressed={s === speed} disabled={disabled} onClick={() => onSpeedChange(s)}>
            {s}x
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
