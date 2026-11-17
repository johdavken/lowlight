/**
 * The deduction board's rules (spec 2026-11-09-deduction-board §3): pairs, filing, naming and the accusation, as pure
 * moves on the run's board state. The server applies them and saves the state on the run; the client only draws the
 * view and sends moves.
 */
import { BLANKS, pairKey, verdictOf, type Blank, type CardKind, type CaseFile } from './cases';

export interface BoardState {
  /** pairKey → what came of it. */
  tried: Record<string, 'filed' | 'bounced'>;
  /** Deduction ids, in the order filed. */
  filed: string[];
  blanks: Partial<Record<Blank, string>>;
  suspect: string | null;
  patience: number;
}

export type BoardMove =
  | { kind: 'pair'; a: string; b: string }
  | { kind: 'file'; deduction: string; blank: Blank }
  | { kind: 'unfile'; blank: Blank }
  | { kind: 'name'; suspect: string | null }
  | { kind: 'accuse' };

export interface BoardView {
  case: string;
  title: string;
  hand: { id: string; kind: CardKind; source: string; line: string; art?: string }[];
  /** Cards not in hand that say why (`missed:`), one per source and reason. */
  missing: { source: string; missed: string; n?: number }[];
  filed: { id: string; blank: Blank | 'none'; text: string }[];
  blanks: Partial<Record<Blank, string>>;
  suspects: { name: string; face: string; role: string; slug: string }[];
  suspect: string | null;
  patience: number;
  patienceMax: number;
  tried: Record<string, 'filed' | 'bounced'>;
  accuseOpen: boolean;
  /** The case's recorded barks (The Fourteenth voice script): clip urls by group, and the groups its deductions set off.
   *  Absent when the case has no clips. */
  barks?: { clips: Record<string, string[]>; on: Record<string, string[]> };
}

export const BOUNCE_LINE = 'They can both be true.';

export const freshBoard = (c: CaseFile): BoardState => ({ tried: {}, filed: [], blanks: {}, suspect: null, patience: c.patience });

/** ACCUSE opens with a suspect named and all three blanks full, or once patience is gone. */
export const accuseOpen = (s: BoardState): boolean => s.patience === 0 || (s.suspect !== null && BLANKS.every((b) => s.blanks[b] !== undefined));

export function applyBoardMove(c: CaseFile, s: BoardState, held: readonly string[], m: BoardMove): { state: BoardState; said?: string; refused?: string; verdict?: string } {
  const no = (refused: string) => ({ state: s, refused });
  switch (m.kind) {
    case 'pair': {
      if (s.patience === 0) return no("Patience is gone: accuse with what you have.");
      for (const x of [m.a, m.b]) if (!held.includes(x) || !c.cards.has(x)) return no(`${x} isn't in your hand`);
      if (m.a === m.b) return no('a card against itself');
      const k = pairKey(m.a, m.b);
      const ded = c.clashes.get(k);
      if (ded) {
        if (s.filed.includes(ded)) return { state: { ...s, tried: { ...s.tried, [k]: 'filed' } }, said: `You knew that already. ${ded} holds.` };
        return { state: { ...s, tried: { ...s.tried, [k]: 'filed' }, filed: [...s.filed, ded] }, said: c.deductions.get(ded)!.text };
      }
      const said = c.near.get(k) ?? BOUNCE_LINE;
      // A pair already tried bounces again for nothing.
      if (s.tried[k]) return { state: s, said };
      return { state: { ...s, tried: { ...s.tried, [k]: 'bounced' }, patience: Math.max(0, s.patience - 1) }, said };
    }
    case 'file': {
      const d = c.deductions.get(m.deduction);
      if (!d || !s.filed.includes(m.deduction)) return no(`${m.deduction} isn't filed`);
      if (d.blank !== 'none' && d.blank !== m.blank) return no(`${m.deduction} answers ${d.blank}`);
      const blanks: Partial<Record<Blank, string>> = {};
      for (const b of BLANKS) if (s.blanks[b] !== undefined && s.blanks[b] !== m.deduction) blanks[b] = s.blanks[b];
      blanks[m.blank] = m.deduction;
      return { state: { ...s, blanks } };
    }
    case 'unfile': {
      const blanks = { ...s.blanks };
      delete blanks[m.blank];
      return { state: { ...s, blanks } };
    }
    case 'name':
      if (m.suspect !== null && !c.suspects.some((x) => x.name === m.suspect)) return no(`no suspect '${m.suspect}'`);
      return { state: { ...s, suspect: m.suspect } };
    case 'accuse':
      if (!accuseOpen(s)) return no('Name a suspect and fill all three blanks first.');
      return { state: s, verdict: verdictOf(c, { suspect: s.suspect, blanks: s.blanks }) };
  }
}

/** A saved board against the case as it is now: deductions the case no longer has are dropped. */
export function cleanBoard(c: CaseFile, s: BoardState): BoardState {
  const filed = s.filed.filter((d) => c.deductions.has(d));
  const blanks: Partial<Record<Blank, string>> = {};
  for (const b of BLANKS) if (s.blanks[b] !== undefined && c.deductions.has(s.blanks[b]!)) blanks[b] = s.blanks[b];
  const suspect = s.suspect !== null && c.suspects.some((x) => x.name === s.suspect) ? s.suspect : null;
  return { ...s, filed, blanks, suspect };
}

export function boardView(c: CaseFile, s: BoardState, held: readonly string[], art?: (card: string) => string | undefined, clips?: Record<string, string[]>): BoardView {
  const hand = [...c.cards.values()].filter((x) => held.includes(x.id)).map((x) => ({ id: x.id, kind: x.kind, source: x.source, line: x.line, ...(art?.(x.id) ? { art: art(x.id)! } : {}) }));
  const missing: BoardView['missing'] = [];
  for (const x of c.cards.values()) {
    if (held.includes(x.id) || !x.missed) continue;
    const same = missing.find((m) => m.source === x.source && m.missed === x.missed);
    if (same) same.n = (same.n ?? 1) + 1;
    else missing.push({ source: x.source, missed: x.missed });
  }
  return {
    case: c.id,
    title: c.title,
    hand,
    missing,
    filed: s.filed.map((id) => ({ id, blank: c.deductions.get(id)!.blank, text: c.deductions.get(id)!.text })),
    blanks: s.blanks,
    suspects: c.suspects.map((x) => ({ name: x.name, face: x.face, role: x.role, slug: x.slug })),
    suspect: s.suspect,
    patience: s.patience,
    patienceMax: c.patience,
    tried: s.tried,
    accuseOpen: accuseOpen(s),
    ...(clips && Object.keys(clips).length ? { barks: { clips, on: c.barksOn } } : {}),
  };
}
