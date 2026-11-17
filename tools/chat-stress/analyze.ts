/** The chat stress test's checks: what each scripted turn did wrong, and a table of the run. */

import { ECHO_WINDOW, echoes, inActions } from '../../server/src/echoes';

export type Expect = 'light' | 'note' | 'scene' | 'recap' | 'no-room-change';

export interface TurnRecord {
  contact: string;
  turn: number;
  mode: 'rp' | 'ooc';
  you: string;
  expect?: Expect;
  /** The reply's status (ok, failed, lost); null when none came. */
  status: string | null;
  /** How waiting ended: her reply, no reply in time, or the turn refused. */
  end: 'end' | 'timeout' | 'rejected';
  text: string;
  calls: { name: string; args: string; out: string }[];
  ms: number;
}

export const FLAG_KINDS = [
  'failed-turn',
  'empty',
  'actions-only',
  'repeat',
  'echo',
  'tool-talk',
  'failed-call',
  'missed-light',
  'missed-note',
  'missed-scene',
  'missed-recap',
  'ooc-room-change',
] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];
export interface Flag {
  kind: FlagKind;
  detail: string;
}

const ROOM_CHANGES = new Set(['go_to', 'set_light', 'set_ambient', 'set_atmosphere', 'apply_mood', 'pass_time']);
const LIGHTS = new Set(['set_light', 'apply_mood', 'set_ambient']);
/** Tools named in the story: presets, "sets the expression / the scene / the mood", "note's updated", logging. */
const TOOL_TALK = /\b(?:presets?|set_[a-z]+|tool calls?|logging|logs? (?:it|this)|sets? (?:the|my|her|his) (?:expression|scene|mood)|note'?s updated)\b/i;
/** A light given a level in her *actions* ("drops the monitors to 20%"): the controls, not the room (light groups). */
const LIGHT_LEVEL = /\b(?:lights?|lamps?|monitors?|screens?|bulbs?|lanterns?|inside|outside|neon|heater)\b[^*.]{0,30}?\b\d{1,3} ?%/i;

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const triples = (s: string) => {
  const w = words(s);
  return w.slice(2).map((_, i) => `${w[i]} ${w[i + 1]} ${w[i + 2]}`);
};
/** How much of the shorter text's word triples the other has (0–1). */
function overlap(a: string, b: string): number {
  const [small, big] = triples(a).length <= triples(b).length ? [a, b] : [b, a];
  const t = triples(small);
  if (t.length < 6) return 0;
  const other = new Set(triples(big));
  return t.filter((x) => other.has(x)).length / t.length;
}

const textOf = (args: string): string => {
  try {
    const a = JSON.parse(args) as { text?: unknown };
    return typeof a.text === 'string' ? a.text : '';
  } catch {
    return '';
  }
};

/** Her earlier in-character replies to `t`'s contact in this run, oldest first: what the echo check reads. */
export function earlierOf(records: readonly TurnRecord[], t: TurnRecord): string[] {
  return records.filter((r) => r.contact === t.contact && r.mode === 'rp' && r.turn < t.turn && r.text !== '').map((r) => r.text);
}

/**
 * `earlier`: her replies before this one (earlierOf). An echo is her *actions* carrying phrases from her last few
 * replies — two of them, or one of four words or more (the paper lantern in eight replies running, 2026-10-23).
 */
export function flagsOf(t: TurnRecord, earlier: readonly string[] = []): Flag[] {
  const flags: Flag[] = [];
  const add = (kind: FlagKind, detail = '') => flags.push({ kind, detail });
  if (t.end !== 'end' || t.status !== 'ok') add('failed-turn', `${t.end} / ${t.status ?? 'no reply'}`);
  const said = t.text.replace(/\*[^*]*\*/g, '').trim();
  if (t.text.trim() === '') add('empty');
  else if (said === '') add('actions-only');

  const paras = t.text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 40);
  const sentences = t.text.match(/[^.!?\n]+[.!?]+/g)?.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 20) ?? [];
  const twice = sentences.find((s, i) => sentences.indexOf(s) !== i);
  const pair = paras.flatMap((a, i) => paras.slice(i + 1).map((b) => [a, b] as const)).find(([a, b]) => overlap(a, b) >= 0.6);
  if (pair) add('repeat', pair[1].slice(0, 90));
  else if (twice) add('repeat', twice.slice(0, 90));

  if (t.mode === 'rp' && earlier.length > 0) {
    const carried = echoes([...earlier.slice(-(ECHO_WINDOW - 1)), t.text], [t.you]).filter((p) => inActions(t.text, p));
    if (carried.length >= 2 || carried.some((p) => p.split(' ').length >= 4)) add('echo', carried.map((p) => `"${p}"`).join(', '));
  }

  const talk = t.mode === 'rp' ? (t.text.match(TOOL_TALK) ?? (t.text.match(/\*[^*]+\*/g) ?? []).join(' ').match(LIGHT_LEVEL)) : null;
  if (talk) add('tool-talk', talk[0]);

  for (const c of t.calls) if (c.out.startsWith('error')) add('failed-call', `${c.name}: ${c.out.slice(0, 120)}`);

  const names = new Set(t.calls.map((c) => c.name));
  // The Residual's writes, under its name or its old one (a run traced before the rename still compares).
  const kept = (what: string) => names.has(`residual:${what}`) || names.has(`scribe:${what}`);
  if (t.expect === 'light' && ![...names].some((n) => LIGHTS.has(n)) && !kept('light')) add('missed-light');
  // A note call without text (an id and `about` only) leaves the note as it was.
  // The Residual's writes count as hers (scribe spec): `residual:note` / `residual:dossier` lines in the trace.
  if (t.expect === 'note' && !t.calls.some((c) => (c.name === 'note' && textOf(c.args).trim() !== '') || c.name === 'update_dossier') && !kept('note') && !kept('dossier')) add('missed-note');
  if (t.expect === 'scene' && !names.has('go_to')) add('missed-scene');
  if (t.expect === 'recap' && !names.has('set_recap') && !kept('recap')) add('missed-recap');
  if (t.mode === 'ooc' && [...names].some((n) => ROOM_CHANGES.has(n))) add('ooc-room-change', [...names].join(', '));
  return flags;
}

/** The run as a markdown table: turns, then each flag kind, per contact and in total. */
export function summary(records: TurnRecord[]): string {
  const contacts = [...new Set(records.map((r) => r.contact))];
  const count = (c: string | null, kind: FlagKind | null) =>
    records.filter((r) => c === null || r.contact === c).reduce((n, r) => n + (kind === null ? 1 : flagsOf(r, earlierOf(records, r)).filter((f) => f.kind === kind).length), 0);
  const row = (label: string, kind: FlagKind | null) => `| ${label} | ${contacts.map((c) => count(c, kind)).join(' | ')} | ${count(null, kind)} |`;
  return [`| | ${contacts.join(' | ')} | total |`, `| --- |${contacts.map(() => ' --- |').join('')} --- |`, row('turns', null), ...FLAG_KINDS.map((k) => row(k, k))].join('\n');
}

/** Words too plain to be a habit ("she", "looks" stays: a look is a habit). */
const PLAIN = new Set(
  (
    'the and but that this with from into onto over under about then than just like what when where while have been were they them their there ' +
    "your yours mine his hers her him she he it's its it you're i'm i've i'd i'll don't doesn't didn't can't won't isn't wasn't one two " +
    'some more back down still only even once again away around through toward towards before after something nothing anything'
  ).split(' '),
);

/** Words in a reply's *actions*, lower case, possessives and plural s off; proper names (capitalised mid-sentence) left out. */
function actionWords(text: string): Set<string> {
  const out = new Set<string>();
  const names = new Set<string>();
  for (const run of (text.match(/\*[^*]+\*/g) ?? []).map((a) => a.slice(1, -1))) {
    for (const m of run.matchAll(/(?<=[a-z,;] )([A-Z][a-z]+)/g)) names.add(m[1]!.toLowerCase());
    for (const w of run.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) ?? []) {
      const x = w.replace(/'s$/, '');
      const p = x.length > 4 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x;
      if (p.length >= 4 && !PLAIN.has(p)) out.add(p);
    }
  }
  for (const n of names) out.delete(n);
  return out;
}

/** Share of a contact's replies a word must be in (their *actions*) to count as sticky. */
export const STICKY_SHARE = 0.4;

/**
 * Each contact's sticky words: in the *actions* of two or more and `STICKY_SHARE` or more of their in-character replies, never in
 * the player's lines to them (what they bring up is the scene). The props she cycles (Rue's monitors and rain, 2026-11-12).
 */
export function stickyWords(records: readonly TurnRecord[]): Map<string, { word: string; n: number; of: number }[]> {
  const out = new Map<string, { word: string; n: number; of: number }[]>();
  for (const c of [...new Set(records.map((r) => r.contact))]) {
    const mine = records.filter((r) => r.contact === c && r.mode === 'rp' && r.text.trim() !== '');
    const theirs = new Set(mine.flatMap((r) => r.you.toLowerCase().match(/[a-z]+/g) ?? []).flatMap((w) => [w, w.replace(/s$/, '')]));
    const count = new Map<string, number>();
    for (const r of mine) for (const w of actionWords(r.text)) count.set(w, (count.get(w) ?? 0) + 1);
    const sticky = [...count.entries()]
      .filter(([w, n]) => n >= 2 && n / mine.length >= STICKY_SHARE && !theirs.has(w))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word, n]) => ({ word, n, of: mine.length }));
    out.set(c, sticky);
  }
  return out;
}

/** The report's sticky-words section: one line per contact. */
export function stickySection(records: readonly TurnRecord[]): string {
  const lines = [...stickyWords(records).entries()].map(([c, ws]) => `- ${c} (${ws.length}): ${ws.length ? ws.map((w) => `${w.word} ${w.n}/${w.of}`).join(', ') : 'none'}`);
  return ['## Sticky words', '', `In the actions of ${Math.round(STICKY_SHARE * 100)}% or more of her in-character replies, never in the player's lines.`, '', ...lines].join('\n');
}
