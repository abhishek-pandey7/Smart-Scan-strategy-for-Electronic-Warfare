export type ScenarioBriefing = {
  title: string;
  short: string;          // dropdown label
  what: string;           // what is in the scenario
  tests: string;          // what it tests
  watch: string;          // what to look at in the replay
  why: string;            // why the open-loop sweep does well or badly here
};

const SIM: Record<string, ScenarioBriefing> = {
  easy: {
    title: "Easy: eight rotating radars",
    short: "Easy: 8 rotating radars",
    what: "Eight radars on fixed frequencies, each rotating once every 1 to 8 seconds, so each points at us for a brief flash once per rotation.",
    tests: "Can the scheduler work out each radar's rotation period and phase from a couple of catches, then be on the right frequency when it comes back?",
    watch: "In the PRIMES chart, a row of evenly spaced dots appears for each radar soon after it is first caught. That is PRIMES predicting the next flash.",
    why: "The fixed sweep visits each frequency for about 100 ms every 2.15 s, so it only catches a flash when the two happen to coincide.",
  },
  lockout: {
    title: "Lock-out: radars in step with the sweep",
    short: "Lock-out: radars synchronised with the sweep",
    what: "Six radars. Four rotate at exactly or almost exactly the same rate as the fixed sweep's 2.15 s cycle, timed so their flashes fall between the sweep's visits.",
    tests: "The classic failure of fixed scan plans: a radar whose rotation is synchronised with the sweep is never, or almost never, intercepted.",
    watch: "In the open-loop chart, grey ticks keep landing between the diagonal sweep lines with no dots, cycle after cycle. PRIMES breaks the pattern and catches them.",
    why: "A fixed sweep repeats the same timing forever, so a radar in step with it stays hidden for the whole mission. Scanning faster does not help.",
  },
  popup: {
    title: "Pop-up: radars that switch on mid-mission",
    short: "Pop-up: new radars appear mid-mission",
    what: "Eight rotating radars from the start, plus four that switch on at random times between 10 and 40 seconds.",
    tests: "How quickly are new threats noticed and then followed, without losing the radars already being tracked?",
    watch: "The 'radars found' counter and line chart: each pop-up radar adds a step. Compare how soon each receiver registers it.",
    why: "The fixed sweep treats every band equally, so a new radar is found only by chance coincidence, just like at the start.",
  },
  dense: {
    title: "Dense: forty emitters of every kind",
    short: "Dense: 40 mixed emitters",
    what: "Forty emitters sampled from the real radar population learned from the dataset: many rotation rates and pulse patterns, some hopping frequency, several sharing a band.",
    tests: "Crowding: many radars competing for one receiver's attention at the same time.",
    watch: "How PRIMES shares its time between radars it already tracks and searching for ones it has not found yet (the decision panel shows 'Tracking' or 'Searching').",
    why: "With emitters everywhere the fixed sweep finds many of them, but catches few of their flashes because it cannot time its visits.",
  },
  mixed: {
    title: "Mixed: rotating radars and intermittent emitters",
    short: "Mixed: rotating + intermittent",
    what: "Twenty rotating radars plus twenty emitters that switch on and off irregularly for seconds at a time, like sidelobe visibility or bursty modes.",
    tests: "Whether the scheduler can tell the two kinds apart and use the right strategy for each: timing for rotating radars, 'is it on right now?' for intermittent ones.",
    watch: "In 'What PRIMES has learned', some radars show an estimated period and others show 'intermittent': PRIMES decided which model fits each one.",
    why: "Intermittent emitters are easier for a sweep to stumble on, but the fixed sweep still cannot follow any of them.",
  },
};

const TURING: ScenarioBriefing = {
  title: "Real dataset scenario",
  short: "Real dataset",
  what: "A 30-second scenario from the Alan Turing Institute's radar dataset, produced independently of this project: 35 to 100 real radar types (air defence, airborne early warning, weather, fire control…) as seen by an all-seeing receiver.",
  tests: "External validation on data we did not generate. Most of these emitters are visible in long irregular stretches rather than clean flashes, which is harder to exploit.",
  watch: "The head-to-head factor, and 'What PRIMES has learned': most radars show as intermittent, because PRIMES recognised from its own observations that they are not clean rotating flashes.",
  why: "This is the exact sweep the dataset's own receiver used, so this comparison is PRIMES against the real open-loop baseline.",
};

export function briefing(id: string): ScenarioBriefing {
  if (id.startsWith("turing:")) {
    const n = id.split(":")[1];
    return { ...TURING, title: `Real dataset scenario #${n}`, short: `Real dataset scenario #${n}` };
  }
  return SIM[id] ?? { title: id, short: id, what: "", tests: "", watch: "", why: "" };
}
