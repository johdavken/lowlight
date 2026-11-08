/**
 * A lifted card's preview on a choice (the hand spec §2): the dice it would roll, the position and the effect, e.g.
 * `REFLEX ●●●● · IN THE OPEN → IN THE DARK · FAIR`. Null: the card can't play there.
 */
import { better } from '../../../../shared/hand';
import { EFFECT_NAMES, effectPushRefusal, POOL_MAX, POSITION_NAMES, tradeRefusal, type Effect, type Pool, type Position, type PushMode, type Trade } from '../../../../shared/dice';
import type { ProgramKind } from '../../../../shared/programs';

export type Side = { stat?: string; dice: number; position: Position; effect?: Effect; effectRaw?: number; tier?: Pool['tier']; path?: Pool['path'] };

export function previewText(stat: string, before: Side, after: Side | undefined): string | null {
  if (!after) return null;
  const dots = after.dice > 0 ? '●'.repeat(after.dice) : '0D';
  const where = after.position === before.position ? POSITION_NAMES[after.position] : `${POSITION_NAMES[before.position]} → ${POSITION_NAMES[after.position]}`;
  const effect = !after.effect ? '' : ` · ${before.effect && before.effect !== after.effect ? `${EFFECT_NAMES[before.effect]} → ` : ''}${EFFECT_NAMES[after.effect]}`;
  return `${stat.toUpperCase()} ${dots} · ${where}${effect}`;
}

const WORSE: Record<Position, Position> = { dark: 'open', open: 'wire', wire: 'wire' };
const STEPS: readonly Effect[] = ['small', 'fair', 'big'];
const clamped = (raw: number): Effect => STEPS[Math.max(0, Math.min(2, raw))];
const rawOf = (s: Pick<Side, 'effect' | 'effectRaw'>): number => s.effectRaw ?? STEPS.indexOf(s.effect!);
/** A side a step of effect along: the server sums every step and clamps once, so a side below SMALL stays there. */
const stepped = <S extends Side>(s: S, n: number): S => ({ ...s, effectRaw: rawOf(s) + n, effect: clamped(rawOf(s) + n) });

/**
 * A card as the rail's SAFE / BOLD and PUSH would roll it (effect and NERVE spec §1), from its pool or a lifted card's
 * play: the side it would roll, or why the server would refuse it (the trade first, then PUSH for effect, as it checks).
 */
export function tradedSide(side: Side, o: { trade: Trade | null; push: PushMode | null }): { side: Side; why: string | null } {
  let s = side;
  if (o.trade) {
    const why = tradeRefusal(s, o.trade);
    if (why) return { side, why };
    s = stepped({ ...s, position: o.trade === 'safe' ? better(s.position) : WORSE[s.position] }, o.trade === 'safe' ? -1 : 1);
  }
  if (o.push === 'effect') {
    const why = effectPushRefusal(s);
    if (why) return { side, why };
    s = stepped(s, 1);
  }
  if (o.push === 'dice') {
    // The server's cap (final review M2): a sixth die can't be pushed past.
    if (s.dice >= POOL_MAX) return { side, why: `ALREADY ROLLING ${POOL_MAX} DICE` };
    s = { ...s, dice: s.dice + 1 };
  }
  return { side: s, why: null };
}

/** A program marked on a card (programs spec §2.1): its kind, the tier its preview reports, the lacquer's ALARM, and whether it's a mid-job load. */
export type Marked = { name?: string; kind: ProgramKind; tier?: Pool['tier']; alarm: 0 | 1; load: boolean; /** A foil (owned programs): runs for its die even where its step does nothing. */ foil?: true };

/** The position `poolOf` reaches from `path`: `n` programs, the lifts, the trade, NEXT ROLL WORSE, then a setup, in that order. */
function positionAt(path: NonNullable<Pool['path']>, n: number, trade: Trade | null): Position {
  let p = path.placed;
  for (let i = 0; i < n + (path.lift ? 1 : 0) + (path.press ? 1 : 0); i++) p = better(p);
  if (trade) p = trade === 'safe' ? better(p) : WORSE[p];
  const worsened = path.worse ? WORSE[p] : p;
  return path.better ? better(worsened) : worsened;
}

/**
 * The marked programs on a side, judged one after another as the server does (`programsFor`): one the side already
 * covers is dropped, so it neither lifts the tier's cut nor costs anything. `ran` is what would run. `trade` is the
 * side's own; without a `path` (an older server) the position steps from the side's.
 */
export function programsOn<S extends Pick<Side, 'position' | 'effect' | 'effectRaw' | 'tier' | 'path'>>(side: S, marked: Marked[], trade: Trade | null = null): S & { ran: Marked[] } {
  const at = (n: number) => (side.path ? positionAt(side.path, n, trade) : Array.from({ length: n }).reduce<Position>((p) => better(p), side.position));
  let s: S = { ...side, position: at(0) };
  let moved = 0;
  const ran: Marked[] = [];
  for (const m of marked) {
    const lifts = s.tier && !s.tier.lifted && m.tier?.lifted ? 1 : 0;
    const steps = (m.kind === 'effect' ? 1 : 0) + lifts;
    const after = s.effect === undefined ? undefined : clamped(rawOf(s) + steps);
    const covered = (m.kind === 'position' && (s.position === 'dark' || at(moved + 1) === s.position)) || (m.kind === 'effect' && s.effect !== undefined && (s.effect === 'big' || after === s.effect));
    if (covered) {
      // A foil still runs for its die (owned programs): its step does nothing, but as a running program it lifts the
      // tier's cut on a deck that holds, as the server's tierCut counts it.
      if (m.foil) {
        ran.push(m);
        if (lifts) s = { ...s, tier: m.tier, ...(s.effect !== undefined ? { effectRaw: rawOf(s) + 1, effect: clamped(rawOf(s) + 1) } : {}) };
      }
      continue;
    }
    ran.push(m);
    if (m.kind === 'position') s = { ...s, position: at(++moved) };
    if (s.effect !== undefined && steps) s = { ...s, effectRaw: rawOf(s) + steps, effect: after };
    if (lifts) s = { ...s, tier: m.tier };
  }
  return { ...s, ran };
}
