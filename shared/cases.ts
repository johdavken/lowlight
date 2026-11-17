/**
 * Case files for the deduction board (spec 2026-11-09-deduction-board §1): a mystery's clue cards, the deductions
 * their clashes file, the near misses, the suspects and the answer. Hand-written in world/cases/<id>.md, never
 * generated; checked on load like quest files.
 */
import { splitFrontMatter } from './lore';

export type Blank = 'WHO' | 'HOW' | 'WHY';
export const BLANKS: readonly Blank[] = ['WHO', 'HOW', 'WHY'];
export const CARD_KINDS = ['body', 'street', 'said', 'grid', 'notebook', 'nix'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface CaseCard {
  id: string;
  kind: CardKind;
  /** Where it comes from, as the card prints it: CHIRON'S NOTE, HAE, K. SAYS. */
  source: string;
  line: string;
  /** How a run earns it, for case-check: free, a named roll (cards sharing it come from one roll), or the asked/dug thread. */
  from: 'free' | 'asked' | 'dug' | { roll: string };
  /** What NOT IN YOUR HAND says when you didn't get it. */
  missed?: string;
}

export interface CaseDeduction {
  id: string;
  /** The blank it can answer; `none` is a decoy: true, but no answer. */
  blank: Blank | 'none';
  text: string;
}

export interface Suspect {
  name: string;
  /** An extras id (world/extras), for the face. */
  face: string;
  role: string;
  /** The name as an outcome id's tail: `wrong-<slug>`. */
  slug: string;
}

export interface CaseFile {
  id: string;
  title: string;
  patience: number;
  suspects: Suspect[];
  cards: Map<string, CaseCard>;
  deductions: Map<string, CaseDeduction>;
  /** pairKey → the deduction it files. */
  clashes: Map<string, string>;
  /** pairKey → the reply. */
  near: Map<string, string>;
  answer: { suspect: string; right: Record<Blank, string[]> };
  /** `barks:` (The Fourteenth voice script): a bark group the board plays, in place of the clash bark, the first time one of
   *  these deductions is filed; group → deduction ids. Empty when the case names none. */
  barksOn: Record<string, string[]>;
  /** Paths case-check may leave below thin on purpose (`hard: asked`, `hard: dug crack`). */
  hard: string[];
}

export type CaseProblem = { field: string; message: string };

export const CASE_PATIENCE = 3;
const ID = /^[A-Z][A-Z0-9_-]*$/;

/** Two cards as one key, whichever order they were put down. */
export const pairKey = (a: string, b: string): string => [a, b].sort().join('|');

/** A suspect's name as an outcome id's tail: `DR. PENN` → `dr-penn`. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A file body's `# heading` sections, each its `- ` lines (accounts files read them too). */
export function sections(body: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const h = /^#\s+(.+)$/.exec(line);
    if (h) {
      cur = [];
      out.set(h[1].trim().toLowerCase(), cur);
    } else if (cur && line.startsWith('- ')) cur.push(line.slice(2).trim());
  }
  return out;
}

/**
 * One card line, `ID [kind] SOURCE: line | key: value | …`, read without judging its kind or its tails (case files
 * and accounts files allow different ones). A string is the problem.
 */
export function readCardLine(line: string): { id: string; kind: string; source: string; line: string; tail: Map<string, string> } | string {
  const m = /^([A-Z][A-Z0-9_-]*)\s+\[(\w+)\]\s+([^:]+):\s+(.+)$/.exec(line);
  if (!m) return `'${line}' isn't ID [kind] SOURCE: line | from: …`;
  const [, id, kind, source, rest] = m;
  const parts = rest.split(/\s+\|\s+/);
  const tail = new Map<string, string>();
  for (const x of parts.slice(1)) {
    const t = /^([a-z]+):\s*(.+)$/.exec(x);
    if (!t) return `${id}: can't read '${x}' (key: value)`;
    tail.set(t[1], t[2].trim());
  }
  return { id, kind, source: source.trim(), line: parts[0].trim(), tail };
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);

export function parseCaseFile(id: string, text: string, known: { extras: ReadonlySet<string> | null }): { ok: true; entry: CaseFile } | { ok: false; problems: CaseProblem[] } {
  const problems: CaseProblem[] = [];
  const p = (field: string, message: string) => problems.push({ field, message });
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [s] };
  const f = s.front;
  const title = typeof f.title === 'string' ? f.title : '';
  if (!title) p('title', 'needs a title');
  const patience = f.patience == null ? CASE_PATIENCE : Number(f.patience);
  if (!Number.isInteger(patience) || patience < 1 || patience > 9) p('patience', 'patience is a whole number from 1 to 9');

  const suspects: Suspect[] = [];
  for (const line of asList(f.suspects)) {
    const [name, face, role] = line.split('|').map((x) => x.trim());
    if (!name || !face) {
      p('suspects', `'${line}' isn't NAME | face | role`);
      continue;
    }
    if (known.extras && !known.extras.has(face)) p('suspects', `${name}: no extra '${face}'`);
    suspects.push({ name, face, role: role ?? '', slug: slugOf(name) });
  }
  if (suspects.length < 2) p('suspects', 'needs at least two suspects');

  const sec = sections(s.body);
  const cards = new Map<string, CaseCard>();
  for (const line of sec.get('cards') ?? []) {
    const r = readCardLine(line);
    if (typeof r === 'string') {
      p('cards', r);
      continue;
    }
    const { id: cid, kind, source, tail } = r;
    for (const k of tail.keys()) if (k !== 'from' && k !== 'missed') p(cid, `can't read '${k}: ${tail.get(k)}' (from: or missed:)`);
    if (!(CARD_KINDS as readonly string[]).includes(kind)) p(cid, `kind '${kind}' isn't one of ${CARD_KINDS.join(', ')}`);
    const fromRaw = tail.get('from') ?? '';
    const roll = /^roll:([a-z0-9-]+)$/.exec(fromRaw);
    const from: CaseCard['from'] | null = fromRaw === 'free' || fromRaw === 'asked' || fromRaw === 'dug' ? fromRaw : roll ? { roll: roll[1] } : null;
    if (!from) p(cid, `from: '${fromRaw}' isn't free, roll:<name>, asked or dug`);
    if (cards.has(cid)) p(cid, 'listed twice');
    cards.set(cid, { id: cid, kind: kind as CardKind, source, line: r.line, from: from ?? 'free', ...(tail.has('missed') ? { missed: tail.get('missed')! } : {}) });
  }

  const deductions = new Map<string, CaseDeduction>();
  for (const line of sec.get('deductions') ?? []) {
    const m = /^([A-Z][A-Z0-9_-]*)\s+→\s+(WHO|HOW|WHY|none):\s+(.+)$/.exec(line);
    if (!m) {
      p('deductions', `'${line}' isn't ID → WHO|HOW|WHY|none: text`);
      continue;
    }
    if (deductions.has(m[1])) p(m[1], 'listed twice');
    deductions.set(m[1], { id: m[1], blank: m[2] as Blank | 'none', text: m[3].trim() });
  }

  const clashes = new Map<string, string>();
  const near = new Map<string, string>();
  const pairOk = (a: string, b: string, where: string): string | null => {
    for (const x of [a, b]) if (!cards.has(x)) p(where, `unknown card '${x}'`);
    if (a === b) p(where, 'a card against itself');
    const k = pairKey(a, b);
    if (clashes.has(k) || near.has(k)) {
      p(where, `${a} × ${b} is listed twice`);
      return null;
    }
    return k;
  };
  for (const line of sec.get('clashes') ?? []) {
    const m = /^([A-Z0-9_-]+)\s+×\s+([A-Z0-9_-]+)\s+→\s+([A-Z0-9_-]+)$/.exec(line);
    if (!m) {
      p('clashes', `'${line}' isn't A × B → DEDUCTION`);
      continue;
    }
    if (!deductions.has(m[3])) p('clashes', `unknown deduction '${m[3]}'`);
    const k = pairOk(m[1], m[2], 'clashes');
    if (k) clashes.set(k, m[3]);
  }
  for (const line of sec.get('near misses') ?? []) {
    const m = /^([A-Z0-9_-]+)\s+×\s+([A-Z0-9_-]+):\s+(.+)$/.exec(line);
    if (!m) {
      p('near misses', `'${line}' isn't A × B: reply`);
      continue;
    }
    const k = pairOk(m[1], m[2], 'near misses');
    if (k) near.set(k, m[3].trim());
  }
  const filed = new Set(clashes.values());
  for (const d of deductions.keys()) if (!filed.has(d)) p(d, `no clash files '${d}'`);

  // barks:
  //   kat: OUT, LT
  const barksOn: Record<string, string[]> = {};
  if (f.barks != null) {
    if (typeof f.barks !== 'object' || Array.isArray(f.barks)) p('barks', 'barks is a list of group: DEDUCTION, DEDUCTION');
    else
      for (const [group, ids] of Object.entries(f.barks as Record<string, unknown>)) {
        const list = String(ids ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        if (!/^[a-z0-9]+$/.test(group)) p('barks', `'${group}' isn't a bark group's name (lower case letters and digits)`);
        for (const d of list) if (!deductions.has(d)) p('barks', `${group}: no deduction '${d}'`);
        barksOn[group] = list;
      }
  }

  // answer: K. | WHO: OUT | HOW: STAGED, STEADY | WHY: LT
  const right: Record<Blank, string[]> = { WHO: [], HOW: [], WHY: [] };
  const [suspect, ...blanks] = String(f.answer ?? '')
    .split('|')
    .map((x) => x.trim());
  if (!suspect || !suspects.some((x) => x.name === suspect)) p('answer', `answer's suspect '${suspect ?? ''}' isn't one of the suspects`);
  for (const b of blanks) {
    const m = /^(WHO|HOW|WHY):\s*(.+)$/.exec(b);
    if (!m) {
      p('answer', `can't read '${b}'`);
      continue;
    }
    for (const d of m[2].split(',').map((x) => x.trim())) {
      const ded = deductions.get(d);
      if (!ded) p('answer', `answer ${m[1]}: no deduction '${d}'`);
      else if (ded.blank !== m[1]) p('answer', `answer ${m[1]}: '${d}' fills ${ded.blank}`);
      right[m[1] as Blank].push(d);
    }
  }
  for (const b of BLANKS) if (right[b].length === 0) p('answer', `answer needs ${b}`);

  if (problems.length) return { ok: false, problems };
  return { ok: true, entry: { id, title, patience, suspects, cards, deductions, clashes, near, answer: { suspect, right }, barksOn, hard: asList(f.hard) } };
}

/** The verdict outcome for an accusation (spec §3): holds, thin, hunch, or wrong-<suspect>. */
export function verdictOf(c: CaseFile, o: { suspect: string | null; blanks: Partial<Record<Blank, string>> }): string {
  if (o.suspect !== null && o.suspect !== c.answer.suspect) return `wrong-${slugOf(o.suspect)}`;
  if (o.suspect === null) return 'hunch';
  const n = BLANKS.filter((b) => o.blanks[b] !== undefined && c.answer.right[b].includes(o.blanks[b]!)).length;
  return n === 3 ? 'holds' : n > 0 ? 'thin' : 'hunch';
}

/** Every verdict a case can reach: a board beat needs an outcome for each. */
export function verdictsOf(c: CaseFile): string[] {
  return ['holds', 'thin', 'hunch', ...c.suspects.filter((s) => s.name !== c.answer.suspect).map((s) => `wrong-${s.slug}`)];
}
