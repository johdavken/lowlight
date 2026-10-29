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
/** Tools named in the story: presets, "sets the expression / the scene", "note's updated", logging. */
const TOOL_TALK = /\b(?:presets?|set_[a-z]+|tool calls?|logging|logs? (?:it|this)|sets? (?:the|my|her|his) (?:expression|scene)|note'?s updated)\b/i;

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

  const talk = t.mode === 'rp' ? t.text.match(TOOL_TALK) : null;
  if (talk) add('tool-talk', talk[0]);

  for (const c of t.calls) if (c.out.startsWith('error')) add('failed-call', `${c.name}: ${c.out.slice(0, 120)}`);

  const names = new Set(t.calls.map((c) => c.name));
  if (t.expect === 'light' && ![...names].some((n) => LIGHTS.has(n)) && !names.has('scribe:light')) add('missed-light');
  // A note call without text (an id and `about` only) leaves the note as it was.
  // The scribe's writes count as hers (scribe spec): `scribe:note` / `scribe:dossier` lines in the trace.
  if (t.expect === 'note' && !t.calls.some((c) => (c.name === 'note' && textOf(c.args).trim() !== '') || c.name === 'update_dossier' || c.name === 'scribe:note' || c.name === 'scribe:dossier')) add('missed-note');
  if (t.expect === 'scene' && !names.has('go_to')) add('missed-scene');
  if (t.expect === 'recap' && !names.has('set_recap') && !names.has('scribe:recap')) add('missed-recap');
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
