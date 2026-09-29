"use client";

import { MODES, modeColor } from "@/components/explain/modes";
import type { SecondCell } from "./derive";
import s from "./eklavya.module.css";

export default function SecondStrip({ cells, cursor, onSeek }: { cells: SecondCell[]; cursor: number; onSeek: (t: number) => void }) {
  const now = Math.floor(cursor);
  return (
    <div className={s.strip}>
      <div className={s.stripKeys}>
        <span>second</span><span>mode</span><span>caught</span>
      </div>
      <div className={s.stripCells} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <button key={c.s} type="button" className={s.cell} data-on={c.s === now || undefined} data-past={c.s < now || undefined}
            onClick={() => onSeek(c.trackAt ?? c.s)}
            title={`${c.s}–${c.s + 1} s · ${c.n} decisions · search ${(100 * c.share.search).toFixed(0)}% track ${(100 * c.share.track).toFixed(0)}% extend ${(100 * c.share.extend).toFixed(0)}% · ${c.catches} caught`}>
            <span className={s.cellSec}>{c.s}</span>
            <span className={s.cellMode}>
              {MODES.map((m) => c.share[m] > 0 && (
                <i key={m} style={{ flexGrow: m === "search" ? c.share[m] : Math.max(c.share[m], 0.34), background: modeColor(m) }} />
              ))}
            </span>
            <span className={s.cellCatch}>{c.catches > 0 ? "●".repeat(Math.min(3, c.catches)) : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
