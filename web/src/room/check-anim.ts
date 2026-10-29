/**
 * A job's check on its card (small jobs spec §6, the Check Feel audition): the card locks, a scan
 * sweeps the odds bar while the number ticks, it lands on the roll with CLEAN or NO, and each reroll
 * sparks the card and rolls again. A red check sweeps slower and lands heavier. A click or a key
 * anywhere finishes it at once; with reduced motion it lands at once.
 */
export const LOCK_MS = 180;
export const RED_LOCK_MS = 450;
export const ROLL_MS = 700;
export const RED_ROLL_MS = 1500;
const SPARK_MS = 520;
const DIES_MS = 950;
const TICK_EVERY = 50;

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function playCheck(
  card: HTMLElement,
  o: {
    chance: number;
    rolls: number[];
    pass: boolean;
    red: boolean;
    reduced: boolean;
    cue(name: 'lock' | 'tick' | 'pass' | 'fail' | 'reroll' | 'red' | 'dies'): void;
    deckDied?: boolean;
    /** Rolls already played (a fail that parked for REROLL): no lock, and only the rolls after them. */
    shown?: number;
  },
): Promise<void> {
  let fast = o.reduced;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pending = new Set<() => void>();
  const wait = (ms: number) =>
    fast
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const t = setTimeout(() => {
            timers.delete(t);
            pending.delete(r);
            r();
          }, ms);
          timers.add(t);
          pending.add(r);
        });
  const finish = () => {
    fast = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const r of [...pending]) r();
    pending.clear();
  };
  const skip = () => finish();
  document.addEventListener('click', skip, true);
  document.addEventListener('keydown', skip, true);

  // The roll's parts: the scan on the odds bar (one is made if the card has none), the ticker, the stamp.
  let bar = card.querySelector<HTMLElement>('.qc-bar');
  if (!bar) {
    bar = el('div', 'qc-bar');
    bar.style.setProperty('--odds', `${o.chance}%`);
    card.append(bar);
  }
  const scan = el('i', 'qc-scan');
  const mark = el('i', 'qc-mark');
  bar.append(scan, mark);
  const tick = el('span', 'qc-tick', '--');
  const stamp = el('span', 'qc-stamp');
  card.append(tick, stamp);

  const rollOnce = async (value: number, last: boolean) => {
    card.classList.remove('is-pass', 'is-fail');
    mark.style.opacity = '0';
    o.cue('tick');
    const dur = o.red ? RED_ROLL_MS : ROLL_MS;
    if (!fast) {
      card.classList.add('is-rolling');
      scan.style.setProperty('--to', `${value}%`);
      scan.style.animationDuration = `${dur}ms`;
      // The ticker shows noise until the roll lands.
      for (let t = 0; t < dur && !fast; t += TICK_EVERY) {
        tick.textContent = String(1 + Math.floor(Math.random() * 100)).padStart(2, '0');
        await wait(Math.min(TICK_EVERY, dur - t));
      }
      card.classList.remove('is-rolling');
    }
    tick.textContent = String(value);
    mark.style.left = `${value}%`;
    mark.style.opacity = '1';
    const pass = last ? o.pass : false;
    card.classList.add(pass ? 'is-pass' : 'is-fail');
    stamp.textContent = pass ? 'CLEAN' : 'NO';
    o.cue(o.red && last ? 'red' : pass ? 'pass' : 'fail');
  };

  return (async () => {
    try {
      const shown = o.shown ?? 0;
      if (shown === 0) {
        card.classList.add('is-locked');
        if (o.red) card.classList.add('is-red');
        o.cue('lock');
        await wait(o.red ? RED_LOCK_MS : LOCK_MS);
      }
      for (const [i, value] of o.rolls.entries()) {
        if (i < shown) continue;
        if (i > 0) {
          card.classList.add('sparking');
          o.cue('reroll');
          await wait(SPARK_MS);
          card.classList.remove('sparking');
        }
        await rollOnce(value, i === o.rolls.length - 1);
      }
      if (o.deckDied) {
        card.classList.add('shorting');
        o.cue('dies');
        await wait(DIES_MS);
      }
    } finally {
      finish();
      document.removeEventListener('click', skip, true);
      document.removeEventListener('keydown', skip, true);
    }
  })();
}
