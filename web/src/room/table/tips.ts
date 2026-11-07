/**
 * Graft tips (spec 2026-10-30-graft-tips): one-time callouts on a player's first jobs, each pointing at the real
 * piece on the table the first time it matters. One shows at a time; GOT IT shows the next; acting on the table
 * clears what's waiting (unseen tips come back at the next moment that offers them). Seen ever, per viewer, in
 * localStorage; SYS → TIPS turns them off or shows them again. Every number in the text is read from the rules.
 */
import { DEALT, picksFor } from '../../../../shared/costs';
import { ALARM_MAX, ALARM_SHIFT, EFFECT_HEAT, POSITION_NAMES, PRESS_NERVE, PUSH_NERVE, type Position } from '../../../../shared/dice';
import { ABILITY_NERVE, APPROACH_STATS, MAX_PEOPLE, FAVOUR_HEAT, type Approach } from '../../../../shared/hand';
import { WARY_HEAT } from '../../../../shared/heat';
import { HEAT_MAX } from '../../../../shared/mission';
import { HOT_LOAD_NERVE, SLOTS } from '../../../../shared/programs';
import { el, isPhone } from './el';

export type TipId = 'approach' | 'people' | 'favour' | 'contact' | 'job' | 'roll' | 'position' | 'effect' | 'take' | 'alarm' | 'nerve' | 'call' | 'program' | 'tier' | 'heat' | 'costs' | 'resist' | 'armour' | 'getaway' | 'press' | 'debrief';
export const TIP_ORDER: readonly TipId[] = ['approach', 'people', 'favour', 'contact', 'job', 'roll', 'position', 'effect', 'take', 'alarm', 'nerve', 'call', 'program', 'tier', 'heat', 'costs', 'resist', 'armour', 'getaway', 'press', 'debrief'];
export const TIPS_KEY = 'nix-room.graft-tips';
/** How long a deal takes to settle before a callout points into it (0 with reduced motion). */
export const SETTLE_MS = 600;

const stats = (a: Approach) => APPROACH_STATS[a].map((s) => s.toUpperCase()).join(' · ');
const where = (p: Position) => {
  const n = picksFor('cost', p, DEALT);
  return `${POSITION_NAMES[p]}: a 4–5 ${n ? `makes you pick ${n} cost${n > 1 ? 's' : ''}` : 'costs nothing'}`;
};

/**
 * `below`: tried under its target first (a choice card's tips keep clear of the beat's prose above it). `stage`: the
 * target stands on the game stage, outside the table (the JOB column has its own layer there). `beside`: tried at its
 * right first (a tall column: above it is the job's title, below it the line keys).
 */
export const TIPS: Record<TipId, { title: string; text: string; target: string; below?: true; stage?: true; beside?: true }> = {
  approach: {
    title: 'HOW YOU GO IN',
    text: `Each rolls +1d on its stats: QUIET ${stats('quiet')}, SMOOTH ${stats('smooth')}, HARD ${stats('hard')}. HARD starts at ALARM 1, and TAKE 1 on a job of tier 2 or more. QUIET is never dealt TAKE −1 and picks ALARM +1 first. SMOOTH is never dealt NEXT ROLL SMALL and picks NEXT ROLL WORSE first. HARD is never dealt ALARM +1 and picks TAKE −1 first. You choose from the pitch, before you see the checks.`,
    target: '.ts-approach',
  },
  people: {
    title: 'WHO YOU BRING',
    text: `Up to ${MAX_PEOPLE}. A runner, face, ears or muscle plays on a check; a fence plays at the end (TAKE +1, unless you GET OUT). Whoever you bring shares the job's fate.`,
    target: '.ts-ready',
  },
  favour: {
    title: 'A FAVOUR',
    text: `+1d once, on any check. Needs the district to know you and its heat under ${FAVOUR_HEAT}; a job that ends BLOWN after you called it costs rep there.`,
    target: '.tb-slot[data-id="favour"]',
  },
  contact: {
    title: 'A CONTACT',
    text: 'A contact who gave you a lead will help on a job, once, in their trade. Blow the job after you play them and they trust you less.',
    target: '.tb-slot[data-id^="contact:"]',
  },
  job: {
    title: 'TWO VOICES',
    text: "The JOB column holds the job's written text: the pitch, each beat, the ending. It flashes NEW when the job moves on, and a contact on the line speaks in it in cyan. Your contact talks at the right, by their figure, a page at a time: Enter turns it. Scroll up on their line for everything said so far.",
    target: '.jc',
    stage: true,
    beside: true,
  },
  roll: {
    title: 'THE ROLL',
    text: 'Roll the dice shown and keep the highest. 6 is clean, 4–5 a pass at a cost, 1–3 a miss. Two 6s is a crit. With no dice you roll two and keep the lowest.',
    target: '.tb-card:has(.tb-odds)',
    below: true,
  },
  position: {
    title: 'WHERE YOU STAND',
    text: `${where('dark')}. ${where('open')}. ${where('wire')}. A miss costs more.`,
    target: '.tb-card:has(.tb-side-word)',
    below: true,
  },
  effect: {
    title: 'EFFECT',
    text: `How much a pass fills TAKE: SMALL, FAIR or BIG. BOLD trades a step of safety for more, SAFE the other way, and PUSH can buy a step. Heat ${EFFECT_HEAT} or more, or an outclassed deck, makes it smaller.`,
    target: '.tb-card .tb-eff',
    below: true,
  },
  take: { title: 'TAKE', text: 'Good rolls fill it. When the job ends, it sets your pay.', target: '.tb-take' },
  alarm: {
    title: 'ALARM',
    text: `Costs fill it. At ${ALARM_SHIFT} every card is one step worse; full at ${ALARM_MAX} means GET OUT.`,
    target: '.tb-alarm',
  },
  nerve: {
    title: 'NERVE',
    text: `PUSH (+1d or a step of effect) costs ${PUSH_NERVE}, an ability ${ABILITY_NERVE}, RESIST up to 2. It refills at 06:00; at 0, no new job tonight.`,
    target: '.tb-nerve',
  },
  call: {
    title: 'CALL THEM IN',
    text: 'Lift their card, then pick a choice. On their own stat they move you a step out of danger (+1d if you’re already in the dark); anywhere else +1d. The first call is free; calling them again risks them.',
    target: '.g-people .tb-slot[data-state="up"]',
  },
  heat: {
    title: 'HEAT',
    text: `The ALARM you leave with becomes HEAT in the district, and a hot deck adds its own on any job with a grid roll. It cools each morning by your tier there, and a crew errand can lay it low. At ${WARY_HEAT} some jobs there open warier and errands start to slip; at ${EFFECT_HEAT} every roll there is a step smaller and favours stop.`,
    target: '.tb-alarm',
  },
  program: {
    title: 'PROGRAMS',
    text: `Your deck has ${SLOTS[1]}, ${SLOTS[2]}, ${SLOTS[3]} or ${SLOTS[4]} slots by its quality. Load programs here, free: they stay loaded for the job. Loading one mid-job costs ${HOT_LOAD_NERVE} NERVE, and below the job's tier the lacquer notices each run: ALARM +1.`,
    target: ".g-deck .tb-slot[data-id^='slot:']",
  },
  tier: {
    title: 'TIER',
    text: 'From tier 2 the job fights back: every roll fills less TAKE, unless a recruit of the grade named here takes it, or a program runs on a deck of the quality named here.',
    target: '.ts-tierline',
  },
  costs: {
    title: 'WHAT IT COSTS',
    text: 'A costly roll deals what can go wrong. Pick the cost you can live with: the more dangerous the spot, the more you pick. How you went in decides your first pick, if that cost was dealt.',
    target: '.tb-costs',
  },
  resist: {
    title: 'RESIST',
    text: 'RESIST always works. Your EDGE dice set the price: a 6 costs nothing, a 4–5 one NERVE, lower two.',
    target: '.tb-cost-btn.resist',
  },
  armour: {
    title: 'FIREWALL',
    text: 'FIREWALL cancels one cost, then burns out. Its slot stays full.',
    target: '.tb-cost-btn.armour',
  },
  getaway: {
    title: 'GET OUT',
    text: "ALARM is full. One roll to get clear; what you've taken is paid at part.",
    target: '.tb-deal .tb-card',
  },
  press: {
    title: 'PRESS ON?',
    text: `Risk what's in hand for more, or walk with it. PRESS ON costs ${PRESS_NERVE} NERVE.`,
    target: '.tb-card[data-choice="!press"]',
  },
  debrief: {
    title: 'THE DEBRIEF',
    text: 'How it ended, what your crew got out of it, and what changed in rep and heat.',
    target: '.tb-debrief',
  },
};

export interface Tips {
  offer(ids: TipId[], root: HTMLElement): void;
  clear(): void;
  enabled(): boolean;
  setEnabled(on: boolean): void;
  reset(): void;
  /** Heard when tips are switched on or off (SKIP TIPS, SYS). */
  onChange?: (on: boolean) => void;
}

interface Stored {
  off: boolean;
  seen: TipId[];
}

/** Storage failures (a private window) read as nothing seen, so the tips show. */
function load(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(TIPS_KEY) ?? 'null') as Partial<Stored> | null;
    return { off: v?.off === true, seen: Array.isArray(v?.seen) ? v.seen.filter((x): x is TipId => TIP_ORDER.includes(x as TipId)) : [] };
  } catch {
    return { off: false, seen: [] };
  }
}
function save(s: Stored): void {
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify(s));
  } catch {
    // Kept for this page only.
  }
}

const GAP = 12;
const MARGIN = 8;

export function mountTips(host: HTMLElement, o: { reduced(): boolean }): Tips {
  const state = load();
  let queue: { id: TipId; root: HTMLElement }[] = [];
  /** A target on screen: in the page, with a size (a hidden dial is neither). */
  const find = (id: TipId, root: HTMLElement) => {
    const t = (TIPS[id].stage ? host : root).querySelector<HTMLElement>(TIPS[id].target);
    if (!t?.isConnected) return null;
    const r = t.getBoundingClientRect();
    return r.width > 0 || r.height > 0 ? t : null;
  };
  let current: { id: TipId; target: HTMLElement; box: HTMLElement } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => current && place(current.box, current.target, TIPS[current.id])) : null;

  /** Host coordinates: the stage is zoomed to fit the window, so screen pixels are divided back out. */
  const scale = () => {
    const w = host.getBoundingClientRect().width;
    return host.offsetWidth > 0 && w > 0 ? w / host.offsetWidth : 1;
  };
  const place = (box: HTMLElement, target: HTMLElement, { below = false, beside = false }: { below?: boolean; beside?: boolean } = {}) => {
    const phone = isPhone(host);
    box.classList.toggle('strip', phone);
    if (phone) {
      box.style.left = box.style.top = '';
      return;
    }
    const k = scale();
    const h = host.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const r = { left: (t.left - h.left) / k, top: (t.top - h.top) / k, right: (t.right - h.left) / k, bottom: (t.bottom - h.top) / k };
    const b = box.getBoundingClientRect();
    const bw = b.width / k || 300;
    const bh = b.height / k || 140;
    const W = h.width / k || host.clientWidth;
    const H = h.height / k || host.clientHeight;
    const clampX = (x: number) => Math.max(MARGIN, Math.min(x, W - bw - MARGIN));
    const clampY = (y: number) => Math.max(MARGIN, Math.min(y, H - bh - MARGIN));
    const cx = clampX((r.left + r.right) / 2 - bw / 2);
    const cy = clampY((r.top + r.bottom) / 2 - bh / 2);
    // Above, below, then beside: the first that fits without covering the target.
    const above: [number, number, string] = [cx, r.top - GAP - bh, 'above'];
    const under: [number, number, string] = [cx, r.bottom + GAP, 'below'];
    const right: [number, number, string] = [r.right + GAP, cy, 'right'];
    const left: [number, number, string] = [r.left - GAP - bw, cy, 'left'];
    const spots: [number, number, string][] = beside ? [right, left, above, under] : [...(below ? [under, above] : [above, under]), right, left];
    const fits = ([x, y]: [number, number, string]) => x >= MARGIN && y >= MARGIN && x + bw <= W - MARGIN && y + bh <= H - MARGIN;
    const [x, y, side] = spots.find(fits) ?? [clampX(spots[0][0]), clampY(spots[0][1]), spots[0][2]];
    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
    box.dataset.side = side;
  };

  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    current?.box.remove();
    current = null;
  };
  const show = () => {
    hide();
    // Found now, not when offered: the table re-renders its cards; a target gone by then is skipped (still unseen).
    let next: { id: TipId; target: HTMLElement } | null = null;
    while (!next && queue.length) {
      const q = queue.shift()!;
      const target = find(q.id, q.root);
      if (target) next = { id: q.id, target };
    }
    if (!next) return;
    const tip = TIPS[next.id];
    const box = el('div', 'gt-tip');
    const ok = el('button', 'gt-ok', 'GOT IT');
    const skip = el('button', 'gt-skip', 'SKIP TIPS');
    ok.type = skip.type = 'button';
    box.append(el('i', 'gt-arrow'), el('b', 'gt-title', tip.title), el('p', 'gt-text', tip.text), el('div', 'gt-row'));
    box.lastElementChild!.append(skip, ok);
    ok.addEventListener('click', () => {
      if (!state.seen.includes(next.id)) state.seen.push(next.id);
      save(state);
      show();
    });
    skip.addEventListener('click', () => setEnabled(false));
    host.append(box);
    current = { ...next, box };
    place(box, next.target, tip);
  };
  const setEnabled = (on: boolean) => {
    if (state.off === !on) return;
    state.off = !on;
    save(state);
    if (!on) {
      queue = [];
      hide();
    }
    api.onChange?.(on);
  };

  const api: Tips = {
    offer(ids, root) {
      if (state.off) return;
      const want = TIP_ORDER.filter((id) => ids.includes(id) && !state.seen.includes(id) && id !== current?.id && !queue.some((q) => q.id === id));
      for (const id of want) if (find(id, root)) queue.push({ id, root });
      queue.sort((a, b) => TIP_ORDER.indexOf(a.id) - TIP_ORDER.indexOf(b.id));
      if (current || timer || !queue.length) return;
      if (o.reduced()) show();
      else timer = setTimeout(show, SETTLE_MS);
    },
    clear() {
      queue = [];
      hide();
    },
    enabled: () => !state.off,
    setEnabled,
    reset() {
      state.seen = [];
      save(state);
    },
  };
  watch?.observe(host);
  return api;
}
