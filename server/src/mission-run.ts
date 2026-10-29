/**
 * Missions in the room (spec 2026-10-18 §3): the pieces of a checked pick the relay strings together.
 * Pure, so the relay gains call sites, not bodies.
 */
import { hintLine, makeTerminal, type TerminalSetup } from '../../shared/crack';
import type { Deck } from '../../shared/gear';
import { rng } from '../../shared/gig/generate';
import { formLabel, withArticle } from '../../shared/kit-line';
import { crackTries, type CoverId, type Kit, type KitEvent, type Odds, type Tier } from '../../shared/mission';
import { holds, type CondCtx, type CrackTag, type Effects, type QuestEntry, type QuestRun } from '../../shared/quests';
import type { Stats } from '../../shared/stats';
import type { Debrief } from '../../shared/types';
import type { GigKind, GigResult } from '../../shared/gig/brief';

export const REROLL = '!reroll';
export const TAKE = '!take';
/** The cover cards on a blown job (small jobs spec §5); TAKE IT is the third. */
export const BURNER = '!burner';
export const FALL_GUY = '!fall-guy';
/** A big job's reserved cards (big jobs spec §3): move to the read early; make the read. */
export const READ_NOW = '!read-now';
export const READ = '!read';
/** Where a big job's run stands while its read is up. */
export const READ_BEAT = '!read';

/** A job's run id in the book (plan ruling 2): `back-door@3` → `back-door`. Quests' ids pass through. */
export const bookId = (id: string) => id.replace(/@-?\d+$/, '');
/** A job's run id on story day `day`. */
export const jobRunId = (q: Pick<QuestEntry, 'id'>, day: number) => `${q.id}@${day}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A job's draws (small jobs spec §1): one value of each, uniform, seeded by the run's meta key and the draw's name. */
export function drawsFor(q: Pick<QuestEntry, 'draws'>, key: string): Record<string, string> {
  return Object.fromEntries(q.draws.map((d) => [d.name, d.values[Math.floor(rng(hash(`${key}|${d.name}`))() * d.values.length)]]));
}

/** A job's drawn pay: in its range, in steps of 10 (a single number is itself); null with no pay. */
export function payFor(q: Pick<QuestEntry, 'payRange'>, key: string): number | null {
  if (!q.payRange) return null;
  const [lo, hi] = q.payRange;
  const steps = Math.floor((hi - lo) / 10);
  return Math.min(hi, lo + 10 * Math.floor(rng(hash(`${key}|pay`))() * (steps + 1)));
}

/** A crack card's terminal seed: the run, the beat and the choice, so rewind and BRANCH HERE build the same one. */
export const seedFor = (key: string, beat: string, choice: string) => `${key}|${beat}|${choice}`;

const HINTERS = ['ember', 'silas', 'hicks'] as const;

/**
 * A crack card's terminal (small jobs spec §4): tries from TECH, ALARM, the deck and the tag's modifiers;
 * a stall build's 4th bracket pair, a strong deck's struck dud, a ghost deck's letter, a crew hint.
 * Null with no words of its length.
 */
export function crackSetup(o: { seed: string; tag: CrackTag; ctx: CondCtx; words: string[]; stats: Stats }): TerminalSetup | null {
  const words = [...new Set(o.words.filter((w) => w.length === o.tag.length))];
  if (words.length === 0) return null;
  const deck = o.ctx.deck ?? null;
  const mods = o.tag.mods.filter((m) => holds(m.when, o.ctx)).reduce((n, m) => n + m.delta, 0);
  const setup: TerminalSetup = {
    seed: o.seed,
    length: o.tag.length,
    words,
    extraBracket: Boolean(deck?.traits.includes('fragile')),
    strikeOne: (deck?.bonus ?? 0) >= 18,
    ghost: Boolean(deck?.traits.includes('ghost')),
    hint: null,
    tries: crackTries({ tech: o.stats.tech, alarm: o.ctx.alarm ?? 0, hasDeck: deck !== null, mods }),
    skin: o.tag.ice ? 'ice' : (deck?.skin ?? 'green'),
    deck: deck?.name ?? null,
  };
  const crew = HINTERS.find((c) => c === o.ctx.with);
  if (crew) {
    // The hint names a dud the deck hasn't struck; it doesn't move the seeded draw, so the terminal is the same.
    const t = makeTerminal(setup);
    const dud = t.dudOrder[0] ?? t.words.find((w) => w.word !== t.password)?.word;
    if (dud) setup.hint = hintLine(crew, dud, t.password);
  }
  return setup;
}

/** The row's line for a crack: `*ACCESS GRANTED.*` or `*LOCKED OUT.*`. */
export const crackLine = (granted: boolean) => (granted ? '*ACCESS GRANTED.*' : '*LOCKED OUT.*');

/** A blown job's rep loss with cover (small jobs spec §5): a burner halves it (towards zero), a fall guy makes it 0. */
export const coveredLoss = (loss: number, cover: CoverId | null) => (cover === 'fall-guy' ? 0 : cover === 'burner' ? Math.trunc(loss / 2) : loss);
/** What a fall guy takes: half the job's drawn pay. */
export const fallGuyFee = (pay: number | null | undefined) => Math.floor((pay ?? 0) / 2);

/** The cards on a blown job while cover is held: each cover held, then TAKE IT. */
export function coverCards(held: Kit['cover'], loss: number, pay: number | null | undefined): { id: string; line: string }[] {
  const n = (x: number) => `−${Math.abs(x)}`;
  return [
    ...(held.burner > 0 ? [{ id: BURNER, line: `USE BURNER (${n(coveredLoss(loss, 'burner'))} INSTEAD OF ${n(loss)})` }] : []),
    ...(held['fall-guy'] > 0 ? [{ id: FALL_GUY, line: `USE FALL GUY (0, −${fallGuyFee(pay)} SOL)` }] : []),
    { id: TAKE, line: 'TAKE IT' },
  ];
}

/** A job's debrief (small jobs spec §6) from its finished run: every check and crack, and the totals. */
export function buildDebrief(o: { q: QuestEntry; run: QuestRun; tier: Tier; district: string; before: number; delta: number; cover: CoverId | null; trust?: Debrief['trust']; trustMoved?: Debrief['trustMoved'] }): Debrief {
  const choices = [...o.q.beats.values()].flat().flatMap((b) => b.choices.map((c) => ({ beat: b.id, c })));
  const lineOf = (beat: string, id: string) => choices.find((x) => x.beat === beat && x.c.id === id)?.c.line ?? id;
  const checks = o.run.picks.flatMap((p): Debrief['checks'] => {
    const line = lineOf(p.beat, p.choice);
    if (p.roll) return [{ line, stat: p.roll.stat, chance: p.roll.chance, rolls: p.roll.rolls }];
    if (p.crack) return [{ line, crack: { tries: p.crack.tries, state: p.crack.state } }];
    return [];
  });
  const ev = o.run.kit ?? [];
  const lastDeck = [...ev].reverse().find((e) => e.deck !== undefined);
  return {
    tier: o.tier,
    checks,
    sol: ev.reduce((n, e) => n + (e.sol ?? 0), 0),
    heat: { district: o.district, delta: ev.reduce((n, e) => n + (e.heat ?? 0), 0) },
    rep: { district: o.district, before: o.before, after: Math.min(100, Math.max(0, o.before + o.delta)) },
    ...(lastDeck ? { deck: { from: o.run.startDeck ?? null, to: lastDeck.deck ?? null } } : {}),
    ...(o.cover ? { cover: o.cover } : {}),
    ...(o.trust !== undefined ? { trust: o.trust } : {}),
    ...(o.trustMoved ? { trustMoved: o.trustMoved } : {}),
    ...(o.run.big
      ? {
          big: {
            clues: o.run.big.clues.map((id) => o.q.clues.get(id)?.text ?? id),
            read: o.run.big.read?.level ?? null,
            gig: o.run.big.gig ? { kind: o.run.big.gig.kind, tier: o.run.big.gig.tier, result: o.run.big.gig.result } : null,
          },
        }
      : {}),
  };
}

/**
 * Her [job] block on every turn while a big job runs (big jobs spec §4): the job, its section, the go
 * hour and the time left, the marker's line where she stands, and the clues found (never what's unfound
 * or the read's words).
 */
export function jobBlock(o: { title: string; section: string; go: string; left: number | null; here: string | null; clues: string[] }): string {
  const left = o.left !== null && o.left > 0 ? ` (in ${spanText(o.left)})` : '';
  return `[job — ${o.title}: ${o.section}, go ${o.go}${left}.${o.here ? ` Here: ${o.here}.` : ''}${o.clues.length ? ` You hold: ${o.clues.map((c) => c.replace(/\.$/, '')).join('; ')}.` : ''}]`;
}

/** `7h`, `2h 10m`, `40m`. */
const spanText = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h > 0 ? `${h}h` : '', m > 0 || h === 0 ? `${m}m` : ''].filter(Boolean).join(' ');
};

/** A grid roll this high kills a fragile deck. */
export const FRAGILE_FROM = 96;

/** The row's result line: `*TECH 74% — clean.*` or `*TECH 74% — no.*`. */
export const rollLine = (o: { stat: string; chance: number }, pass: boolean) => `*${o.stat} ${o.chance}% — ${pass ? 'clean' : 'no'}.*`;

/** The cards while a failed check waits. */
export const rerollCards = (edgeLeft: number) => [
  { id: REROLL, line: `REROLL (EDGE ${edgeLeft} LEFT)` },
  { id: TAKE, line: 'TAKE IT' },
];

/** An outcome's effects as one kit event at `at`; null when it has none. `pay: full` / `half` read the run's drawn pay; heat lands in `district`. */
export function effectEvent(e: Effects, at: number, o: { pay?: number | null; district?: string | null } = {}): KitEvent | null {
  const ev: KitEvent = { at };
  const sol = e.payKind === 'full' ? (o.pay ?? 0) : e.payKind === 'half' ? Math.floor((o.pay ?? 0) / 2) : e.pay;
  if (sol) ev.sol = sol;
  if (e.heat) {
    ev.heat = e.heat;
    if (o.district) ev.district = o.district;
  }
  if (e.deck !== undefined) ev.deck = e.deck;
  return Object.keys(ev).length > 1 ? ev : null;
}

/** Whether a roll kills the deck it was made on. */
export const deckDies = (deck: Deck | null, grid: boolean, roll: number) => Boolean(deck && grid && deck.traits.includes('fragile') && roll >= FRAGILE_FROM);

/** One line on the player for her opening: the stats above 5, the deck, the heat. */
export function playerKitLine(name: string, stats: Stats, deck: Deck | null, heat: number): string {
  const strong = (Object.entries(stats) as [string, number][]).filter(([k, v]) => k !== 'edge' && v > 5).map(([k, v]) => `${k.toUpperCase()} ${v}`);
  return `${name}: ${strong.length ? strong.join(', ') : 'nothing above average'}; ${deck ? `carries ${withArticle(deck.name)}` : 'no deck'}; heat ${heat} of 10`;
}

/** Her [mission] block as you set out: the job and who you are on it. */
export const missionOpenBlock = (q: QuestEntry, player: string) => `[mission — ${q.title}${q.pitch ? `: ${q.pitch}` : ''} ${player}.]`;

/** A job's tier, its gig's kind, tier and result, in words for her closing line (MISSION_CLOSE: no game words, no numbers). */
const TIER_WORDS: Record<Tier, string> = { clean: 'It went well.', messy: 'It got done, but it went wrong somewhere.', blown: 'It went bad.' };
const GIG_KIND_WORDS: Record<GigKind, string> = { hack: 'The hack', slip: 'Slipping past the guards', papers: 'The papers' };
const GIG_TIER_WORDS = { easy: 'an easy one', medium: 'no easy one', hard: 'a hard one' } as const;
const GIG_RESULT_WORDS: Record<GigResult, string> = { clean: 'went smoothly', close: 'was a close call', traced: 'got them traced', caught: 'got them caught', back: 'turned them back' };
const READ_WORDS = { full: 'right', half: 'half right', wrong: 'wrong' } as const;

/** How a job's alarm stood at the end, in words; null when nobody noticed. */
const alarmWords = (alarm: number) => (alarm >= 2 ? 'The alarm went up.' : alarm === 1 ? 'Someone nearly noticed.' : null);

/**
 * Her [mission summary] at the end, in words, not numbers (MISSION_CLOSE tells her never to say them): each pick and
 * whether it worked, then whether it paid, the attention it drew and a deck gained or lost; a job's outcome, alarm and name.
 */
export function missionSummary(q: QuestEntry, run: QuestRun, decks: Deck[], debrief?: Debrief): string {
  const choices = [...q.beats.values()].flat().flatMap((b) => b.choices);
  // The read's own pick is a reserved card, not a line (big jobs: how it went is said below).
  const lines = run.picks.filter((p) => !p.beat.startsWith('!')).map((p) => {
    const line = choices.find((x) => x.id === p.choice)?.line ?? p.choice;
    const r = p.roll;
    const how = r ? (r.pass ? (r.rolls.length > 1 ? ' — it worked, not the first time' : ' — it worked') : " — it didn't work") : '';
    return `- ${line}${how}`;
  });
  const ev = run.kit ?? [];
  const sol = ev.reduce((n, e) => n + (e.sol ?? 0), 0);
  const heat = ev.reduce((n, e) => n + (e.heat ?? 0), 0);
  const lastDeck = [...ev].reverse().find((e) => e.deck !== undefined);
  const name = (id: string) => formLabel(decks.find((d) => d.id === id)?.name ?? id);
  const big = debrief?.big;
  const rep = debrief?.rep;
  const tail = [
    sol ? 'It paid.' : 'It paid nothing.',
    heat > 0 ? (heat >= 3 ? 'It drew a lot of attention.' : 'It drew some attention.') : null,
    lastDeck ? (lastDeck.deck ? `They came away with ${withArticle(name(lastDeck.deck))}.` : 'They lost their deck.') : null,
    big?.read ? `Their read was ${READ_WORDS[big.read]}.` : null,
    big?.gig ? `${GIG_KIND_WORDS[big.gig.kind]}, ${GIG_TIER_WORDS[big.gig.tier]}, ${GIG_RESULT_WORDS[big.gig.result]}.` : null,
    debrief ? TIER_WORDS[debrief.tier] : null,
    debrief ? alarmWords(run.alarm ?? 0) : null,
    // A trust job (Intake board spec §2): rep didn't move; her standing may have.
    debrief?.trustMoved ? `Their standing with you went ${debrief.trustMoved}.` : null,
    debrief?.retainer ? (debrief.retainer.paid ? 'Your retainer was paid.' : "Your retainer wasn't paid: they came up short.") : null,
    debrief && debrief.trust === undefined && rep
      ? `Their name in ${rep.district} ${rep.after > rep.before ? 'went up' : rep.after < rep.before ? 'went down' : 'held'}${debrief.cover ? ` (${debrief.cover === 'burner' ? 'a burner' : 'a fall guy'} covered it)` : ''}.`
      : null,
  ].filter(Boolean);
  return `[mission summary — ${q.title}:\n${lines.join('\n')}\n${tail.join(' ')}]`;
}

/** Her clients line (Intake board spec §3): her own jobs posted where she stands, title and pitch only. */
export function clientsBlock(items: { title: string; pitch: string | null }[]): string {
  const list = items.map((i) => (i.pitch ? `${i.title} — ${i.pitch}` : i.title)).join('; ');
  return `[your clients] Tonight someone upstairs needs help: ${list} Bring it up if it fits the moment, or don't. Never say job, board or quest.`;
}

export type { Odds };

/**
 * Test-only (e2e): `NIX_TEST_ROLLS="80,30"` makes every check roll those, in order, then the last
 * again. Unset: undefined, and checks roll at random.
 */
/** Test-only (e2e): `NIX_TEST_GIG=clean|close|fail` resolves every big job's route without its gig window (big jobs spec §3). */
export function gigsFromEnv(env: NodeJS.ProcessEnv = process.env): 'clean' | 'close' | 'fail' | undefined {
  const v = env.NIX_TEST_GIG;
  return v === 'clean' || v === 'close' || v === 'fail' ? v : undefined;
}

/** Test-only (e2e): `NIX_TEST_REP="cass@karasu:50"` starts that player with that rep (big jobs need Trusted); other players, unset or unreadable: none. */
export function repFromEnv(player: string, env: NodeJS.ProcessEnv = process.env): { district: string; delta: number }[] {
  const parts = (env.NIX_TEST_REP ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = parts.map((p) => /^([a-z0-9-]+)@([a-z0-9-]+):(\d{1,3})$/.exec(p)).filter((m): m is RegExpExecArray => m !== null);
  if (out.length !== parts.length) return [];
  return out.filter((m) => m[1] === player).map((m) => ({ district: m[2], delta: Number(m[3]) }));
}

/** Test-only (e2e): `NIX_TEST_TRUST="cass@nix-direct:6"` starts that player's trust with that contact there (the arrangement needs high trust); unset or unreadable: none. */
export function trustFromEnv(env: NodeJS.ProcessEnv = process.env): { player: string; contact: string; trust: number }[] {
  const parts = (env.NIX_TEST_TRUST ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = parts.map((p) => /^([a-z0-9-]+)@([a-z0-9-]+):(-?\d{1,2})$/.exec(p)).filter((m): m is RegExpExecArray => m !== null);
  return out.length === parts.length ? out.map((m) => ({ player: m[1], contact: m[2], trust: Number(m[3]) })) : [];
}

export function rollsFromEnv(env: NodeJS.ProcessEnv = process.env): (() => number) | undefined {
  const list = (env.NIX_TEST_ROLLS ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 100);
  if (list.length === 0) return undefined;
  let i = 0;
  return () => list[Math.min(i++, list.length - 1)];
}
