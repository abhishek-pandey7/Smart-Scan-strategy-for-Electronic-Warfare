import Link from "next/link";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { FAMILY_LABEL, LINEUP, isReference, policyBlurb, policyColor, policyFamily, policyLabel } from "@/lib/api";

const T = 20, FLASH = 0.25, BANDS = 4;
const RADARS = [
  { band: 0, period: 3.0, phase: 0.4 },
  { band: 1, period: 4.0, phase: 2.3 },
  { band: 2, period: 2.5, phase: 2.0 },
  { band: 3, period: 5.0, phase: 0.7 },
];
type Flash = { band: number; s: number };
type Look = { band: number; t0: number; t1: number; search?: boolean };

const FLASHES: Flash[] = RADARS.flatMap((r) =>
  Array.from({ length: Math.ceil((T - r.phase) / r.period) }, (_, k) => ({ band: r.band, s: r.phase + k * r.period })),
).sort((a, b) => a.s - b.s);

const RASTER: Look[] = Array.from({ length: T }, (_, k) => ({ band: k % BANDS, t0: k, t1: k + 1 }));

/** Search until each radar is heard once, then dwell on predicted flashes; one band at a time, so overlaps lose. */
const SMART: Look[] = (() => {
  const search: Look[] = [[0, 0.2], [1, 0.8], [2, 1.3], [3, 1.8], [1, 2.2], [2, 2.7], [3, 3.8], [2, 4.3], [3, 5.0], [3, 5.5]]
    .map(([band, t0]) => ({ band, t0, t1: t0 + 0.5, search: true }));
  const found = new Map<number, number>();
  for (const f of FLASHES) {
    if (found.has(f.band)) continue;
    if (search.some((l) => l.band === f.band && f.s < l.t1 && f.s + FLASH > l.t0)) found.set(f.band, f.s);
  }
  const track: Look[] = [];
  let busy = 0;
  for (const f of FLASHES) {
    const at = found.get(f.band), t0 = f.s - 0.05, t1 = f.s + 0.3;
    if (at === undefined || f.s <= at || t0 < busy || search.some((l) => t0 < l.t1 && t1 > l.t0)) continue;
    track.push({ band: f.band, t0, t1 });
    busy = t1;
  }
  return [...search, ...track];
})();

const caught = (looks: Look[]) => FLASHES.filter((f) => looks.some((l) => l.band === f.band && f.s >= l.t0 && f.s + FLASH <= l.t1 + 1e-9));

function Panel({ y, name, color, looks }: { y: number; name: string; color: string; looks: Look[] }) {
  const W = 600, L = 132, R = 12, rowH = 26, H = rowH * BANDS;
  const x = (t: number) => L + (t / T) * (W - L - R);
  const ry = (b: number) => y + b * rowH;
  const hits = caught(looks);
  const hit = new Set(hits);
  return (
    <g>
      <text x={0} y={y + 16} fontSize={17} fontWeight={500} fill="var(--text-primary)" fontFamily="var(--font-display)">{name}</text>
      <text x={0} y={y + 40} fontSize={26} fontWeight={650} fill={color} fontFamily="var(--font-num)">{hits.length}</text>
      <text x={0} y={y + 58} fontSize={12} fill="var(--text-muted)">of {FLASHES.length} flashes caught</text>
      <rect x={L} y={y} width={W - L - R} height={H} rx={6} fill="var(--surface-2)" />
      {Array.from({ length: BANDS - 1 }, (_, b) => (
        <line key={b} x1={L} x2={W - R} y1={ry(b + 1)} y2={ry(b + 1)} stroke="var(--surface-1)" strokeWidth={2} />
      ))}
      {looks.map((l, i) => (
        <rect key={i} x={x(l.t0)} y={ry(l.band) + 3} width={x(l.t1) - x(l.t0)} height={rowH - 6} rx={3}
          fill={color} opacity={l.search ? 0.16 : 0.3} />
      ))}
      {FLASHES.map((f, i) => (
        <rect key={i} x={x(f.s)} y={ry(f.band) + 7} width={Math.max(3, x(f.s + FLASH) - x(f.s))} height={rowH - 14} rx={1.5}
          fill={hit.has(f) ? color : "var(--truth)"} />
      ))}
    </g>
  );
}

function HeroArt() {
  return (
    <div className="hero-art">
      <div className="hero-art-head">
        <span className="hero-art-title">Same {T} seconds, two receivers</span>
        <Badge tone="outline">illustration</Badge>
      </div>
      <svg viewBox="0 0 600 262" role="img" aria-label="Illustration: the same radar flashes seen by a fixed sweep and by Smart Scan">
        <Panel y={0} name="Fixed sweep" color={policyColor("raster")} looks={RASTER} />
        <Panel y={128} name="Smart Scan" color={policyColor("primes")} looks={SMART} />
        <text x={132} y={254} fontSize={12} fill="var(--text-muted)">time</text>
        <text x={588} y={254} fontSize={12} fill="var(--text-muted)" textAnchor="end">
          4 radars on 4 frequency slices · shaded = where the receiver listened
        </text>
      </svg>
    </div>
  );
}

const PROBLEMS = [
  {
    title: "Radars flash briefly",
    body: "A rotating radar points at you for a few milliseconds every few seconds. Each flash is the only chance to hear it.",
    art: (
      <svg viewBox="0 0 240 72" aria-hidden>
        <line x1={0} x2={240} y1={56} y2={56} stroke="var(--axis)" strokeWidth={2} />
        {[22, 86, 150, 214].map((x) => <rect key={x} x={x} y={12} width={6} height={44} rx={2} fill="var(--accent)" />)}
      </svg>
    ),
  },
  {
    title: "The receiver hears one slice at a time",
    body: "The band is wide but the receiver tunes to a narrow slice. Every look is a bet on where the next flash will be.",
    art: (
      <svg viewBox="0 0 240 72" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={0} y={2 + i * 14} width={240} height={11} rx={3} fill={i === 2 ? "var(--accent)" : "var(--surface-3)"} />
        ))}
      </svg>
    ),
  },
  {
    title: "A fixed sweep gets locked out",
    body: "A sweep repeats on a timer. A radar whose rhythm lines up with it is always flashing somewhere else, and is never seen.",
    art: (
      <svg viewBox="0 0 240 72" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={i * 40} y={4 + (i % 3) * 22} width={38} height={20} rx={3} fill="var(--series-raster)" opacity={0.3} />
        ))}
        {[18, 138].map((x) => <rect key={x} x={x} y={52} width={5} height={16} rx={1.5} fill="var(--truth)" />)}
      </svg>
    ),
  },
];

export default function OverviewPage() {
  return (
    <div className="stack-lg">
      <section className="hero">
        <div>
          <div className="hero-chip">
            <Badge tone="saffron" size="md" dot="var(--saffron)">Electronic support · spectrum scheduling</Badge>
          </div>
          <h1 className="display">A receiver that learns <span className="accent-text">when and where</span> to listen.</h1>
          <p className="lede">
            Radars show up for milliseconds at a time, and a receiver can only tune to one slice of spectrum at once.
            Smart Scan learns each radar&apos;s rhythm from what it hears, predicts the next flash, and spends its
            listening time where it will catch the most.
          </p>
          <div className="hstack">
            <Link href="/mission" className="btn btn-lg btn-arrow">Run the mission</Link>
            <Link href="/how-it-decides" className="btn btn-lg secondary">How it decides</Link>
          </div>
          <div className="hero-facts">
            <span><strong>{LINEUP.length}</strong>receivers in the lineup</span>
            <span><strong>1</strong>shared ground truth</span>
            <span><strong>95%</strong>bootstrap intervals on every benchmark</span>
          </div>
        </div>
        <HeroArt />
      </section>

      <section>
        <SectionHeader eyebrow="The problem" title="Why scanning is hard" />
        <div className="grid-3">
          {PROBLEMS.map((p, i) => (
            <Card key={p.title} pad="lg" className="problem">
              <span className="problem-num">0{i + 1}</span>
              <div className="problem-art">{p.art}</div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="The lineup" title="Six receivers, same radars"
          lede="Every mission runs all of them against identical ground truth, so the only difference is how each one decides where to listen." />
        <div className="grid-6">
          {LINEUP.map((p) => (
            <Card key={p} className={p === "primes" ? "algo algo-hero" : isReference(p) ? "algo algo-ref" : "algo"} style={{ ["--algo" as string]: policyColor(p) }}>
              <Badge tone={p === "primes" ? "accent" : isReference(p) ? "outline" : "neutral"} dot={policyColor(p)}>
                {FAMILY_LABEL[policyFamily(p)]}
              </Badge>
              <h3>{policyLabel(p)}</h3>
              <p>{policyBlurb(p)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>See it on a real mission</h2>
          <p>Pick a scenario, run every receiver at once, and watch the flashes they catch add up.</p>
        </div>
        <Link href="/mission" className="btn btn-lg btn-arrow">Run the mission</Link>
      </section>
    </div>

