import { Badge, Card, type BadgeTone } from "@/components/ui";
import type { ModelInfo } from "@/lib/api";
import s from "./explain.module.css";

type Copy = { name: string; kind: string; body: string; use: string };

const COPY: Record<string, Copy> = {
  priors: {
    name: "Learned priors",
    kind: "Fit offline from data",
    body: "Distributions of rotation period, frequency and flash width, fit from the Alan Turing Institute radar dataset. After the first catch they give each new track a short list of likely periods, so a radar is usually pinned down by its second or third catch.",
    use: "Used by Ekalavya in step 2 (update tracks) and in the search belief.",
  },
  track_predictor: {
    name: "Track predictor",
    kind: "Bayesian, updated online",
    body: "For each emitter, a bank of periodic-flash hypotheses competes with a Gilbert–Elliott on/off (two-state Markov) model. Every hit and every miss updates both, and the evidence decides which one describes that emitter. The output is the chance each candidate look catches it.",
    use: "Used by Ekalavya in steps 2 and 3. Nothing is trained ahead of time; it learns during the mission.",
  },
  threat_classifier: {
    name: "Threat classifier",
    kind: "Supervised classifier",
    body: "Predicts a low, medium or high threat level from a track's own measured pulse interval, pulse width, frequency and scan period. On radar types it has never seen it is 63 % accurate against a 48.5 % chance level: a useful prior, not an identifier.",
    use: "Only the “threat weighted” Ekalavya variant on the benchmark uses it. The default Ekalavya shown on this page does not.",
  },
  eklavya: {
    name: "Ekalavya",
    kind: "Predict-then-score scheduler",
    body: "The scheduler itself contains no neural network. It combines the models above into one score, value per second of listening, and takes the best look. Search, Track and Extend describe what that score chose. They are not separate algorithms being switched between.",
    use: "Every decision is logged with the numbers behind it, which is what this page replays.",
  },
  dqn: {
    name: "Double-DQN",
    kind: "Model-free reinforcement learning",
    body: "The comparator. It sees only a history of where it listened and what it heard, with no timing or period model, and learns which frequency to tune from reward alone: +1 per new flash caught and +2 per new emitter, the same objective Ekalavya optimises.",
    use: "A separate scheduler run in the lineup for comparison. Ekalavya never calls it.",
  },
};
const ORDER = ["priors", "track_predictor", "threat_classifier", "eklavya", "dqn"];

function status(m: ModelInfo): { label: string; tone: BadgeTone } {
  const d = m.description.toLowerCase();
  if (d.includes("not trained")) return { label: "Not trained yet", tone: "warn" };
  if (d.includes("missing")) return { label: "File missing", tone: "warn" };
  if (m.id === "dqn") return { label: "Trained", tone: "good" };
  if (d.includes("present")) return { label: "Loaded", tone: "good" };
  return { label: "Online", tone: "neutral" };
}

/** API descriptions carry file paths and internal ids, so only the name survives for unknown models. */
const fallback = (m: ModelInfo): Copy => ({ name: m.name, kind: m.kind, body: m.description.replace(/\s*\([^)]*\)/g, ""), use: "" });

export default function ModelsUsed({ models }: { models: ModelInfo[] }) {
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  const sorted = [...models].sort((a, b) => rank(a.id) - rank(b.id));
  return (
    <div className={s.models}>
      {sorted.map((m) => {
        const c = COPY[m.id] ?? fallback(m);
        const st = status(m);
        const hero = m.id === "eklavya";
        return (
          <Card key={m.id} className={s.model} accent={hero ? "var(--accent)" : m.id === "dqn" ? "var(--series-dqn)" : undefined}>
            <div className="hstack" style={{ gap: 8 }}>
              <Badge tone={hero ? "accent" : "neutral"}>{c.kind}</Badge>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <h3>{c.name}</h3>
            <p>{c.body}</p>
            {c.use && <div className={s.modelUse}>{c.use}</div>}
          </Card>
        );
      })}
    </div>
  );
}
