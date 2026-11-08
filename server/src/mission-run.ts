/**
 * Missions in the room (spec 2026-10-18 §3): the pieces of a checked pick the relay strings together.
 * Pure, so the relay gains call sites, not bodies.
 */
import { hintLine, makeTerminal, type TerminalSetup } from '../../shared/crack';
import type { Deck } from '../../shared/gear';
import { belowTier, HOT_LOAD_NERVE, programOf, type Program } from '../../shared/programs';
import { rng } from '../../shared/rng';
import { formLabel, withArticle } from '../../shared/kit-line';
import { crackTries, type CoverId, type Kit, type KitEvent, type Odds, type Tier } from '../../shared/mission';
import { jobTakeSize, POSITION_NAMES } from '../../shared/dice';
import { heatParts } from './push-run';
import { takeOf } from './take-run';
import { holds, isLegacyRoll, PUSH_ID, type DiceRoll, type Roll, type CondCtx, type CrackTag, type Effects, type QuestEntry, type QuestRun } from '../../shared/quests';
import type { Stats } from '../../shared/stats';
import type { Debrief } from '../../shared/types';
import { COSTS } from '../../shared/costs';

/** A REROLL card saved before the table (the web's replay still names it). */
export const REROLL = '!reroll';
export const TAKE = '!take';
/** STEADY, gone (roll lifecycle spec §1.3): an old client's is refused. */
export const STEADY = '!steady';
/** A costly roll's costs (roll lifecycle spec §1): pick one (the card names it), then RESIST or ARMOUR it, or TAKE IT. */
export const COST = '!cost';
export const RESIST = '!resist';
export const ARMOUR = '!armour';
/** An AFTER A ROLL ability pressed on a parked roll (crew abilities spec §2); the card names it. */
export const AFTER = '!after';
/** The cover cards on a blown job (small jobs spec §5); TAKE IT is the third. */
export const BURNER = '!burner';
export const FALL_GUY = '!fall-guy';

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
 * a stall build's 4th bracket pair, a quality-3+ deck's struck dud, a ghost deck's letter, a crew hint.
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
    strikeOne: (deck?.quality ?? 0) >= 3,
    ghost: Boolean(deck?.traits.includes('ghost')),
    hint: null,
    tries: crackTries({ tech: o.stats.tech, alarm: o.ctx.alarm ?? 0, hasDeck: deck !== null, mods }),
    skin: o.tag.corp ? 'corp' : (deck?.skin ?? 'green'),
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

const POSITION_WORDS = { dark: 'IN THE DARK', open: 'IN THE OPEN', wire: 'ON THE WIRE' } as const;

/**
 * The debrief's program lines (programs spec §2.5), in load order: each that ran, how often and how its last run went;
 * a burned FIREWALL; then the lacquer's ALARM when the deck was below the job's tier.
 */
function programLines(run: QuestRun, catalog: Program[], deck: Deck | null, tier: number | undefined): string[] {
  const rolls = run.picks.flatMap((p) => (p.roll && !isLegacyRoll(p.roll) ? [p.roll] : []));
  let lacquer = 0;
  const lines = (run.programs ?? []).flatMap((l) => {
    // A foil by its load id (owned programs): `SOLVENT FOIL · RAN 1 · …`.
    const p = programOf(catalog, l.id);
    if (!p) return [];
    const name = p.foil ? `${p.name} FOIL` : p.name;
    const below = deck !== null && belowTier(deck, p, tier);
    if (p.kind === 'firewall') {
      if (!l.burned) return [];
      if (below) lacquer += 1;
      return [`${name} · BURNED`];
    }
    const ran = rolls.filter((r) => r.programs?.includes(p.id));
    if (ran.length === 0) return [];
    if (below) lacquer += ran.length;
    const last = ran.at(-1)!;
    const how = p.kind === 'effect' ? (last.effect ?? 'fair').toUpperCase() : POSITION_WORDS[last.position];
    return [`${name} · RAN ${ran.length} · ${last.stat} ${how}`];
  });
  // What the mid-job loads cost (programs spec §1.2a): each named, then the NERVE.
  const hot = (run.programs ?? []).filter((l) => l.hot).flatMap((l) => {
    const p = programOf(catalog, l.id);
    return p ? [p.foil ? `${p.name} FOIL` : p.name] : [];
  });
  return [...lines, ...(lacquer > 0 ? [`ALARM +${lacquer} FROM THE LACQUER`] : []), ...(hot.length ? [`LOADED MID-JOB: ${hot.join(', ')} · ${hot.length * HOT_LOAD_NERVE} NERVE`] : [])];
}

/** A job's debrief (small jobs spec §6) from its finished run: every check and crack, and the totals. */
/** A roll as a debrief row: its d100s from before the table, or its dice (the table spec §4). */
function rollRow(r: Roll): Omit<Debrief['checks'][number], 'line'> {
  if (isLegacyRoll(r)) return { stat: r.stat, chance: r.chance, rolls: r.rolls };
  return { stat: r.stat, dice: r.dice, position: r.position, faces: r.faces, keep: r.keep, kind: r.kind, ...(r.steadied ? { steadied: true as const } : {}), ...(r.pushed ? { pushed: true as const } : {}) };
}

export function buildDebrief(o: { q: QuestEntry; run: QuestRun; tier: Tier; district: string; before: number; delta: number; cover: CoverId | null; trust?: Debrief['trust']; trustMoved?: Debrief['trustMoved']; programs?: Program[]; deck?: Deck | null; heat?: { after: number; cooled: number; crew: number } }): Debrief {
  const choices = [...o.q.beats.values()].flat().flatMap((b) => b.choices.map((c) => ({ beat: b.id, c })));
  const lineOf = (beat: string, id: string) => choices.find((x) => x.beat === beat && x.c.id === id)?.c.line ?? id;
  const push = o.run.push;
  // A push's picks have their own rows (pressing on spec §4).
  const pushes = push
    ? push.log.map((l): NonNullable<Debrief['pushes']>[number] => {
        const roll = o.run.picks.find((p) => p.beat === l.beat && p.choice === l.choice)?.roll;
        return { line: lineOf(l.beat, l.choice), ...(roll ? rollRow(roll) : {}), result: l.result, sol: l.sol };
      })
    : [];
  const checks = o.run.picks.flatMap((p): Debrief['checks'] => {
    if (PUSH_ID.test(p.beat)) return [];
    const line = lineOf(p.beat, p.choice);
    if (p.roll) return [{ line, ...rollRow(p.roll) }];
    if (p.crack) return [{ line, crack: { tries: p.crack.tries, state: p.crack.state } }];
    return [];
  });
  const ev = o.run.kit ?? [];
  const lastDeck = deckChange(o.run);
  const nerve = -ev.reduce((n, e) => n + (e.nerve ?? 0) + (e.edge ?? 0), 0);
  const programs = programLines(o.run, o.programs ?? [], o.deck ?? null, o.q.tier);
  // Heat: the run's own, and what the crew's traits add on a messy job (those land from the crew fold, not the run).
  const crewHeat = o.heat?.crew ?? 0;
  const heatDelta = ev.reduce((n, e) => n + (e.heat ?? 0), 0) + crewHeat;
  const heatPartsOf = [...heatParts(o.run, o.tier === 'blown', o.deck?.name.toUpperCase() ?? 'DECK', o.heat?.cooled ?? 0), ...(crewHeat ? [{ label: 'MESSY CREW', n: crewHeat }] : [])];
  // Anything else the job's events carried: a mission outcome's `heat:`, a cost taken as heat.
  const otherHeat = heatDelta - heatPartsOf.reduce((n, p) => n + p.n, 0);
  if (otherHeat) heatPartsOf.push({ label: 'THE JOB', n: otherHeat });
  return {
    tier: o.tier,
    checks,
    ...(programs.length ? { programs } : {}),
    ...(pushes.length ? { pushes } : {}),
    // The table (spec §4): TAKE as it ended, and NERVE spent.
    ...(o.run.takeFill !== undefined ? { take: { filled: takeOf(o.run, o.q), size: jobTakeSize(o.q) }, alarm: o.run.alarm ?? 0 } : {}),
    ...(nerve > 0 ? { nerve } : {}),
    ...(push && push.state !== 'offer' && push.state !== 'playing' ? { push: push.state } : {}),
    sol: ev.reduce((n, e) => n + (e.sol ?? 0), 0),
    heat: { district: o.district, delta: heatDelta, ...(o.heat ? { after: o.heat.after, parts: heatPartsOf } : {}) },
    rep: { district: o.district, before: o.before, after: Math.min(100, Math.max(0, o.before + o.delta)) },
    ...(lastDeck ? { deck: { from: o.run.startDeck ?? null, to: lastDeck.deck ?? null } } : {}),
    ...(o.cover ? { cover: o.cover } : {}),
    ...(o.trust !== undefined ? { trust: o.trust } : {}),
    ...(o.trustMoved ? { trustMoved: o.trustMoved } : {}),
  };
}

/** A contract's line for her (tier 3 contracts spec §4): the job you took from her, where it stands, what came back, how it ended. */
export function contractBlock(o: { title: string; stage: 'waiting' | 'night' | 'fallout'; left: number; found: string[]; grade: Tier | null }): string {
  const when = o.stage === 'fallout' ? `${o.grade ? `${TIER_WORDS[o.grade]} ` : ''}It isn't over yet` : o.stage === 'night' ? "It's tonight" : `The night is ${o.left > 0 ? `in ${spanText(o.left)}` : 'close'}`;
  return `[job — ${o.title}: the contract they took from you. ${when}.${o.found.length ? ` Groundwork back: ${o.found.join(', ')}.` : ''}]`;
}

/**
 * Her line while a job runs (2026-11-07): what the file says. On a job that isn't hers the player knows it and she
 * doesn't, so she can ask, and has the real answer to hold them to instead of inventing a source. `heard`: a job she
 * isn't on the hook for but knows from where she works (`known-by:`).
 */
export function boardBlock(o: { title: string; postedBy: string | null; brief: string | null; player: string; knows: 'own' | 'heard' | null }): string {
  const said = [o.postedBy ? `Posted by: ${o.postedBy}` : '', o.brief ?? ''].filter(Boolean).join(' ');
  if (o.knows === 'own') return `[board — ${o.title}: your own job, so you know this. ${said}]`;
  if (o.knows === 'heard') return `[board — ${o.title}: not your job, but you heard about it at work, so you know this. ${said} If what ${o.player} tells you doesn't fit, you can say so.]`;
  return `[board — ${o.title}: what ${o.player} knows about this job and you don't yet. ${said} All you know of it is what ${o.player} has told you. If you want to know who offered it or what's involved, ask ${o.player}. Until ${o.player} says it, don't use any of it: not who posted it, not what kind of person they are. Never name anyone else as the source. If what ${o.player} tells you doesn't fit this, doubt it without saying why.]`;
}

/** `7h`, `2h 10m`, `40m`. */
const spanText = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h > 0 ? `${h}h` : '', m > 0 || h === 0 ? `${m}m` : ''].filter(Boolean).join(' ');
};

const HOW_WORDS = { taken: 'TAKEN', resisted: 'RESISTED', armour: 'FIREWALLED', ability: 'CANCELLED' } as const;
const RESULT_WORDS = { crit: 'crit', clean: 'clean', cost: 'it costs', miss: 'no' } as const;

/** The row's result line (the table spec §1): `*TECH 3d · IN THE OPEN — 5, it costs.*`; a crit shows its sixes. */
export function rollLine(r: DiceRoll): string {
  const top = r.kind === 'crit' ? '6 6' : String(r.keep === 'high' ? Math.max(...r.faces) : Math.min(...r.faces));
  // The deck against the job's tier, when it acted (deck effects spec §3): `· DECK HELD`, `· OUTCLASSED`.
  const deck = r.deck === 'held' ? ' · DECK HELD' : r.deck === 'outclassed' ? ' · OUTCLASSED' : '';
  // SAFE / BOLD and an effect that isn't FAIR (effect and NERVE spec §3): `· BOLD · BIG`.
  const effect = `${r.trade ? ` · ${r.trade.toUpperCase()}` : ''}${r.effect && r.effect !== 'fair' ? ` · ${r.effect.toUpperCase()}` : ''}`;
  // The costs it settled (roll lifecycle spec §1.5): `· ALARM +1 TAKEN · NEXT ROLL WORSE RESISTED`.
  const costs = (r.costs ?? []).map((c) => ` · ${COSTS[c.cost].tag} ${HOW_WORDS[c.how]}`).join('');
  // A gamble's die (ability pass spec §2): `· GAMBLE 5`.
  const gamble = r.gamble ? ` · GAMBLE ${r.gamble.die}` : '';
  return `*${r.stat} ${Math.max(0, r.dice)}d · ${POSITION_NAMES[r.position]} — ${top}, ${RESULT_WORDS[r.kind]}${deck}${effect}${gamble}${costs}.*`;
}

/** A d100 roll's line, from before the table (a TAKE IT on an old save's parked REROLL). */
export const legacyRollLine = (o: { stat: string; chance: number }, pass: boolean) => `*${o.stat} ${o.chance}% — ${pass ? 'clean' : 'no'}.*`;


/** An outcome's effects as one kit event at `at`; null when it has none. `pay: full` / `half` read the run's drawn pay; heat lands in `district`. */
export function effectEvent(e: Effects, at: number, o: { pay?: number | null; district?: string | null } = {}): KitEvent | null {
  const ev: KitEvent = { at };
  const sol = (e.payKind === 'full' ? (o.pay ?? 0) : e.payKind === 'half' ? Math.floor((o.pay ?? 0) / 2) : (e.pay ?? 0)) + (e.bonus ?? 0);
  if (sol) ev.sol = sol;
  if (e.heat) {
    ev.heat = e.heat;
    if (o.district) ev.district = o.district;
  }
  if (e.deck !== undefined) ev.deck = e.deck;
  if (e.outfit) ev.outfit = `${e.outfit.who}/${e.outfit.name}`;
  return Object.keys(ev).length > 1 ? ev : null;
}


/** One line on the player for her opening: the stats above 5, the deck, the heat. */
export function playerKitLine(name: string, stats: Stats, deck: Deck | null, heat: number): string {
  const strong = (Object.entries(stats) as [string, number][]).filter(([k, v]) => k !== 'edge' && v > 5).map(([k, v]) => `${k.toUpperCase()} ${v}`);
  return `${name}: ${strong.length ? strong.join(', ') : 'nothing above average'}; ${deck ? `carries ${withArticle(deck.name)}` : 'no deck'}; heat ${heat} of 10`;
}

/** Her [mission] block as you set out: the job and who you are on it. */
/** A list in words: `Dez`, `Dez and Koji`, `Dez, Koji and Mia`. */
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''));

/** Her note's job line as it opens: the job, the player's kit, and who came with them (the hand spec §6). */
export const missionOpenBlock = (q: QuestEntry, player: string, came: string[] = []) => `[mission — ${q.title}${q.pitch ? `: ${q.pitch}` : ''} ${player}.${came.length ? ` ${andList(came)} came with them.` : ''}]`;

/** The run's last deck event, unless it leaves the deck the job started with (a lost push hands back what a push gave). */
function deckChange(run: QuestRun): KitEvent | undefined {
  const last = [...(run.kit ?? [])].reverse().find((e) => e.deck !== undefined);
  return last && run.startDeck !== undefined && last.deck === run.startDeck ? undefined : last;
}

/** A job's tier, in words for her closing line (MISSION_CLOSE: no game words, no numbers). */
const TIER_WORDS: Record<Tier, string> = { clean: 'It went well.', messy: 'It got done, but it went wrong somewhere.', blown: 'It went bad.' };
/** How a push ended (pressing on spec §4), in words. */
const PUSH_WORDS = {
  walked: 'They could have pushed their luck; they walked away instead.',
  won: 'They pushed their luck and came out ahead.',
  lost: 'They pushed their luck and lost what they had gained.',
} as const;

/** How a job's alarm stood at the end, in words; null when nobody noticed. */
const alarmWords = (alarm: number) => (alarm >= 2 ? 'The alarm went up.' : alarm === 1 ? 'Someone nearly noticed.' : null);

/**
 * Her [mission summary] at the end, in words, not numbers (MISSION_CLOSE tells her never to say them): each pick and
 * whether it worked, then whether it paid, the attention it drew and a deck gained or lost; a job's outcome, alarm and name.
 */
export function missionSummary(q: QuestEntry, run: QuestRun, decks: Deck[], debrief?: Debrief, crew?: { came: string[]; lost: string[] }): string {
  const choices = [...q.beats.values()].flat().flatMap((b) => b.choices.map((c) => ({ beat: b.id, c })));
  // A reserved card's pick isn't a line.
  const lines = run.picks.filter((p) => !p.beat.startsWith('!')).map((p) => {
    const line = choices.find((x) => x.beat === p.beat && x.c.id === p.choice)?.c.line ?? p.choice;
    const r = p.roll;
    const how = r ? (r.pass ? (isLegacyRoll(r) && r.rolls.length > 1 ? ' — it worked, not the first time' : !isLegacyRoll(r) && r.kind === 'cost' && !r.steadied && !(r.costs?.length && r.costs.every((c) => c.how !== 'taken')) ? ' — it worked, at a cost' : ' — it worked') : " — it didn't work") : '';
    return `- ${line}${how}`;
  });
  const ev = run.kit ?? [];
  const sol = ev.reduce((n, e) => n + (e.sol ?? 0), 0);
  const heat = ev.reduce((n, e) => n + (e.heat ?? 0), 0);
  const lastDeck = deckChange(run);
  const name = (id: string) => formLabel(decks.find((d) => d.id === id)?.name ?? id);
  const rep = debrief?.rep;
  const tail = [
    // The hand (spec 2026-10-29-the-hand §6): who came, and who didn't walk away clean.
    crew?.came.length ? `${andList(crew.came)} went in with them.` : null,
    ...(crew?.lost ?? []).map((n) => `${n} didn't walk away clean.`),
    sol ? 'It paid.' : 'It paid nothing.',
    heat > 0 ? (heat >= 3 ? 'It drew a lot of attention.' : 'It drew some attention.') : null,
    lastDeck ? (lastDeck.deck ? `They came away with ${withArticle(name(lastDeck.deck))}.` : 'They lost their deck.') : null,
    debrief ? TIER_WORDS[debrief.tier] : null,
    debrief?.push ? PUSH_WORDS[debrief.push] : null,
    // The table (spec §4): NERVE spent, and a getaway.
    ev.some((e) => (e.nerve ?? 0) < 0) ? 'They kept their nerve.' : null,
    run.getaway ? 'They had to get out fast.' : null,
    debrief ? alarmWords(run.alarm ?? 0) : null,
    // A trust job (Intake board spec §2): rep didn't move; her standing may have.
    debrief?.trustMoved ? `Their standing with you went ${debrief.trustMoved}.` : null,
    debrief?.retainer ? (debrief.retainer.paid ? 'Your retainer was paid.' : "Your retainer wasn't paid: they came up short.") : null,
    debrief?.cut ? `You took your cut: ${debrief.cut.amount} sol.` : null,
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

/** Test-only (e2e): `NIX_TEST_REP="cass@karasu:50"` starts that player with that rep (tier 2 jobs need Known); other players, unset or unreadable: none. */
export function repFromEnv(player: string, env: NodeJS.ProcessEnv = process.env): { district: string; delta: number }[] {
  const parts = (env.NIX_TEST_REP ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = parts.map((p) => /^([a-z0-9-]+)@([a-z0-9-]+):(\d{1,3})$/.exec(p)).filter((m): m is RegExpExecArray => m !== null);
  if (out.length !== parts.length) return [];
  return out.filter((m) => m[1] === player).map((m) => ({ district: m[2], delta: Number(m[3]) }));
}

/** Test-only (e2e): `NIX_TEST_SOL="cass:1000"` starts that player with that sol (a Trusted hire costs); other players, unset or unreadable: none. */
export function solFromEnv(player: string, env: NodeJS.ProcessEnv = process.env): number {
  const m = /^([a-z0-9-]+):(\d{1,6})$/.exec(env.NIX_TEST_SOL ?? '');
  return m && m[1] === player ? Number(m[2]) : 0;
}

/** Test-only (e2e): `NIX_TEST_TRUST="cass@nix-direct:6"` starts that player's trust with that contact there (the arrangement needs high trust); unset or unreadable: none. */
export function trustFromEnv(env: NodeJS.ProcessEnv = process.env): { player: string; contact: string; trust: number }[] {
  const parts = (env.NIX_TEST_TRUST ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const out = parts.map((p) => /^([a-z0-9-]+)@([a-z0-9-]+):(-?\d{1,2})$/.exec(p)).filter((m): m is RegExpExecArray => m !== null);
  return out.length === parts.length ? out.map((m) => ({ player: m[1], contact: m[2], trust: Number(m[3]) })) : [];
}

/**
 * Test-only (e2e): `NIX_TEST_ROLLS="2,6,66"` gives each roll in order (then the last again): the face kept, the
 * other dice 1s, `66` two sixes (see facesFor). Unset or unreadable: undefined, and checks roll at random.
 */
export function rollsFromEnv(env: NodeJS.ProcessEnv = process.env): (() => number) | undefined {
  const raw = (env.NIX_TEST_ROLLS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const list = raw.map(Number).filter((n) => (Number.isInteger(n) && n >= 1 && n <= 6) || n === 66);
  if (list.length !== raw.length) return undefined;
  if (list.length === 0) return undefined;
  let i = 0;
  return () => list[Math.min(i++, list.length - 1)];
}
