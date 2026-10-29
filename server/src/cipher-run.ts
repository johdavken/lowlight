/**
 * The cipher run (cipher spec §2.2–2.2a): a Residual call, now and then, that chooses the truths a playthrough holds
 * back. Pure: the messages it's sent and its answer checked truth by truth against the Cipher and the ones accepted
 * before it. The runner (residual-runner.ts) decides when it's due and writes what passes.
 */
import { z } from 'zod';
import { CIPHER, checkNewTruth, type CipherState, type NewTruth, type Truth } from '../../shared/cipher';
import { capAtWordBoundary } from '../../shared/persona';
import { jsonOf } from './residual';
import type { CompletionMessage } from './turn';

/** The answer: up to three truths of a sentence or two each. */
export const CIPHER_MAX_TOKENS = 1200;

export interface CipherRunInput {
  player: { id: string; name: string };
  /** Who a truth can be kept by (World.cipherCast): never the player. */
  cast: { id: string; name: string; pronoun: string; about: string; secret: string | null }[];
  /** The lore book's titles, so a truth doesn't fight it. */
  lore: string[];
  summary: string | null;
  /** The latest lines, oldest first. */
  recent: { speaker: string; text: string }[];
  state: CipherState;
  /** How many truths this run may add (openMax − open). */
  room: number;
}

const flat = (t: string) => t.replace(/\s*\n\s*/g, ' ');

/** The run's system message and its one user message. */
export function cipherRunMessages(i: CipherRunInput): CompletionMessage[] {
  const you = i.player.name;
  const later = i.state.truths.length > 0;
  const system = [
    `You keep the secrets of a story in Lowlight. Lowlight is a rain-soaked cyberpunk port city, played as a roleplay with ${you}. You never write story: you read where it stands and choose the truths it holds back from ${you} — things that are true now, that someone would rather keep hidden, and that change how earlier scenes read once they come out. You answer with one JSON object.`,
    [
      'Each truth is one of five kinds:',
      "- self: what someone hides about themselves (a medic sells her patients' scans).",
      '- between: something between two people — a debt, a hold, an old betrayal (a landlord lets a tenant steal power, and owns him for it).',
      "- place: what a place really is or hides (a laundromat's back room is a dead drop for a corp courier).",
      "- city: something moving in the city that nobody here may know (a bad batch of script working through one district's pharmacies).",
      '- yours: grown from what happened in this story — a job taken, someone met, a promise made (the client from an earlier job was a plant, testing who can be bought).',
      `These examples only show the kinds; draw yours from the people, places and story below.`,
    ].join('\n'),
    `A truth is never ${you}'s own past or motives, never against the lore, never about whether someone will love ${you}, and never city-breaking: street scale, with a cost to whoever is caught holding it.`,
    `No two truths of the same kind, open at once, and nobody keeps more than one: spread them across the people and places listed. A truth nobody here knows has "knownBy": []. Use "yours" only when the story so far gives it something to grow from${later ? '; prefer it now' : ''}.`,
    `knownBy: ids from the [cast: …] lines, never ${you}. comesOutWhen: what earns it — somewhere to go, something to do or pay. changes: what the story does once it's out. clueIdeas: two or three small things that could point at it, each of which could also mean something else.`,
    `Write at most ${i.room} truths, each one or two sentences (at most ${CIPHER.truthMax} characters). Answer exactly: {"truths":[{"kind":"…","truth":"…","knownBy":["…"],"comesOutWhen":"…","changes":"…","clueIdeas":"…"}]}`,
  ].join('\n\n');

  // Who holds what (review I3): nobody keeps two open truths, so the run must see who's taken.
  const kept = (t: Truth) => `${t.kind} · ${flat(t.truth)} · kept by ${t.knownBy.length > 0 ? t.knownBy.join(', ') : 'nobody here'} (${t.state})`;
  const holding = new Set(i.state.truths.filter((t) => t.state === 'open').flatMap((t) => t.knownBy));
  const user = [
    i.cast
      .map((c) => `[cast: ${c.id} "${c.name}" (${c.pronoun}) — ${flat(c.about) || 'no file'}${c.secret ? `; already keeps: ${flat(c.secret)}` : ''}${holding.has(c.id) ? '; keeps an open truth already' : ''}]`)
      .join('\n'),
    `[you: ${you}]`,
    i.lore.length > 0 ? `[lore: ${i.lore.join(', ')}]` : null,
    i.summary ? `Earlier: ${flat(i.summary)}` : null,
    i.recent.length > 0 ? `What happened lately:\n${i.recent.map((r) => `${r.speaker}: ${flat(r.text)}`).join('\n')}` : null,
    i.state.truths.length > 0 ? `Truths already kept:\n${i.state.truths.map(kept).join('\n')}` : 'No truths yet.',
  ]
    .filter((x): x is string => x !== null && x !== '')
    .join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const text = z.string().trim().min(1);
const TruthShape = z.object({
  kind: z.string(),
  truth: text,
  knownBy: z.array(z.string()).default([]),
  comesOutWhen: text,
  changes: text,
  // GLM sometimes lists them (hand-check 2026-10-29): a list reads as one line.
  clueIdeas: z.union([text, z.array(z.string()).transform((xs) => xs.map((x) => x.trim()).filter(Boolean).join('; '))]).pipe(text),
});

const issue = (e: z.ZodError) => e.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`).join('; ');

/** The truths that pass (spec §2.2a), each checked against the Cipher plus the ones accepted before it. */
export function parseCipherAnswer(raw: string, i: CipherRunInput): { truths: NewTruth[]; refused: string[] } {
  let v: unknown;
  try {
    ({ v } = jsonOf(raw));
  } catch {
    return { truths: [], refused: ['answer: not JSON'] };
  }
  const items = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as { truths?: unknown }).truths : undefined;
  if (!Array.isArray(items)) return { truths: [], refused: ['truths: not a list'] };
  const truths: NewTruth[] = [];
  const refused: string[] = [];
  const cast = new Set(i.cast.map((c) => c.id));
  // The accepted ones count as open for the next check.
  const state = (): CipherState => ({
    ...i.state,
    truths: [...i.state.truths, ...truths.map((t, n): Truth => ({ ...t, id: `new-${n}`, state: 'open', clues: [] }))],
  });
  items.forEach((item, n) => {
    const r = TruthShape.safeParse(item);
    if (!r.success) return void refused.push(`truths[${n}]: ${issue(r.error)}`);
    if (truths.length >= i.room) return void refused.push(`truths[${n}]: over the ${i.room} asked for`);
    const t: NewTruth = {
      kind: r.data.kind as NewTruth['kind'],
      truth: r.data.truth,
      knownBy: [...new Set(r.data.knownBy.map((k) => k.trim()))],
      comesOutWhen: capAtWordBoundary(r.data.comesOutWhen, CIPHER.whenMax),
      changes: capAtWordBoundary(r.data.changes, CIPHER.changesMax),
      clueIdeas: capAtWordBoundary(r.data.clueIdeas, CIPHER.ideasMax),
    };
    const why = checkNewTruth(state(), t, { cast, playerId: i.player.id });
    if (why) refused.push(`truths[${n}]: ${why}`);
    else truths.push(t);
  });
  return { truths, refused };
}
