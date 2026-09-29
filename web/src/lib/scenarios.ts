export type ScenarioBriefing = {
  title: string;
  short: string;          // dropdown label
  what: string;           // what is in the scenario
  tests: string;          // what it tests
  watch: string;          // what to look at in the replay
  why: string;            // why the open-loop sweep does well or badly here
  tagline?: string;       // optional one-liner for cards
};

const SIM: Record<string, ScenarioBriefing> = {
  easy: {
    title: "Easy: eight rotating radars",
    short: "Easy: 8 rotating radars",
    tagline: "Period learning on clean flashes",
    what: "Eight radars on fixed frequencies, each rotating once every 1 to 8 seconds, so each points at us for a brief flash once per rotation.",
    tests: "Can the scheduler work out each radar's rotation period and phase from a couple of catches, then be on the right frequency when it comes back?",
    watch: "In the Ekalavya lane, catches line up at evenly spaced intervals on each radar's frequency soon after it is first heard. Compare how many flashes the rest of the lineup (Double-DQN, Greedy, Raster, Random) still miss.",
    why: "The fixed Raster visit is about 100 ms every 2.15 s, so it only catches a flash when the two happen to coincide. The whole lineup runs on the same truth so the gap is obvious.",
  },
  lockout: {
    title: "Lock-out: radars in step with the sweep",
    short: "Lock-out: radars synchronised with the sweep",
    tagline: "Breaks synchronisation that traps a fixed sweep",
    what: "Six radars. Four rotate at exactly or almost exactly the same rate as the fixed sweep's 2.15 s cycle, timed so their flashes fall between the sweep's visits.",
    tests: "The classic failure of fixed scan plans: a radar whose rotation is synchronised with the sweep is never, or almost never, intercepted.",
    watch: "In the Raster lane, grey ticks keep landing between the diagonal sweep lines with no dots, cycle after cycle. Ekalavya breaks the pattern; the other learned and greedy lanes show how much of that gap each closes.",
    why: "A fixed sweep repeats the same timing forever, so a radar in step with it stays hidden for the whole mission. Scanning faster does not help — compare every receiver against Oracle as the upper bound.",
  },
  popup: {
    title: "Pop-up: radars that switch on mid-mission",
    short: "Pop-up: new radars appear mid-mission",
    tagline: "New threats mid-mission",
    what: "Eight rotating radars from the start, plus four that switch on at random times between 10 and 40 seconds.",
    tests: "How quickly are new threats noticed and then followed, without losing the radars already being tracked?",
    watch: "The live leaderboard and 'radars found' curves: each pop-up adds a step. Compare how soon Ekalavya registers it versus Double-DQN, Greedy, Raster, and Random.",
    why: "The fixed Raster treats every band equally, so a new radar is found only by chance coincidence. The lineup makes that latency visible side by side.",
  },
  dense: {
    title: "Dense: forty emitters of every kind",
    short: "Dense: 40 mixed emitters",
    tagline: "Crowding: many radars, one receiver",
    what: "Forty emitters sampled from the real radar population learned from the dataset: many rotation rates and pulse patterns, some hopping frequency, several sharing a band.",
    tests: "Crowding: many radars competing for one receiver's attention at the same time.",
    watch: "In the Ekalavya lane, watch how time is shared between Searching, Tracking and Extending (decision strip). On the leaderboard, see whether Ekalavya trades breadth of discovery for more flashes than Raster or Greedy.",
    why: "With emitters everywhere the fixed Raster finds many of them, but catches few of their flashes because it cannot time its visits. The full lineup shows who wins interception vs discovery.",
  },
  mixed: {
    title: "Mixed: rotating radars and intermittent emitters",
    short: "Mixed: rotating + intermittent",
    tagline: "Two emitter kinds, two strategies",
    what: "Twenty rotating radars plus twenty emitters that switch on and off irregularly for seconds at a time, like sidelobe visibility or bursty modes.",
    tests: "Whether the scheduler can tell the two kinds apart and use the right strategy for each: timing for rotating radars, 'is it on right now?' for intermittent ones.",
    watch: "In the Ekalavya lane, rotating radars are caught at regular intervals while intermittent ones are caught in bursts. Compare interception across the lineup: timing-aware Ekalavya vs bandits and open-loop.",
    why: "Intermittent emitters are easier for a sweep to stumble on, but Raster still cannot follow any of them. Oracle shows the ceiling when every flash is known in advance.",
  },
};

const TURING: ScenarioBriefing = {
  title: "Real dataset scenario",
  short: "Real dataset",
  tagline: "External validation on Turing stare truth",
  what: "A 30-second scenario from the Alan Turing Institute's radar dataset, produced independently of this project: 35 to 100 real radar types (air defence, airborne early warning, weather, fire control…) as seen by an all-seeing receiver.",
  tests: "External validation on data we did not generate. Most of these emitters are visible in long irregular stretches rather than clean flashes, which is harder to exploit.",
  watch: "Compare the whole lineup on real pulses: Ekalavya vs Double-DQN, Greedy, Raster, and Random, with Oracle dashed. Most of these radars are intermittent rather than clean rotators, so the margins are smaller.",
  why: "Raster here is the exact sweep the dataset's own receiver used, so this run is Ekalavya and the other policies against the real open-loop baseline on identical truth.",
};

export function briefing(id: string): ScenarioBriefing {
  if (id.startsWith("turing:")) {
    const n = id.split(":")[1];
    return { ...TURING, title: `Real dataset scenario #${n}`, short: `Real dataset scenario #${n}` };
  }
  return SIM[id] ?? { title: id, short: id, what: "", tests: "", watch: "", why: "" };
}
