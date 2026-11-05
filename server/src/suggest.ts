/**
 * SUGGEST: when the player is stuck, her model drafts the player character's next line. It goes in
 * the chat box, never sent; the player edits it or throws it away. What's typed there is the steer.
 * The call itself is the narrator's (`completeOnce`, her model, your key).
 */
import { forms, named, type Pronoun } from '../../shared/pronoun';
import type { Stranger } from '../../shared/encounter';
import type { CompletionMessage } from './turn';
import { oneLine } from './persona';

/** How many of the scene's lines the draft sees (the encounter narrator sees 8; a reply needs the thread). */
export const SUGGEST_RECENT_LINES = 16;
/** What's kept of a steer typed in the box. */
export const SUGGEST_STEER_MAX = 600;
/** A draft past this is cut at a sentence: a line, not a page. */
export const SUGGEST_LINE_MAX = 1000;

/** SUGGEST's three angles (scene SUGGEST; the arrival screen's line on the way is one plain line). */
export const SUGGEST_ANGLES = ['PLAIN', 'PUSH', 'TURN'] as const;
export type SuggestAngle = (typeof SUGGEST_ANGLES)[number];
/** At most this many open threads reach the draft. */
export const SUGGEST_THREADS_MAX = 5;

/** The instructions, for the player character `name`: three angles, or (`angles: false`) one line. */
export const suggestSystem = (name: string, o: { angles?: boolean } = {}): string =>
  [
    `You help the user play ${name} in a roleplay in Lowlight, a dark, gritty cyberpunk city. Write only ${name}'s next line in this scene: what ${name} does and says now, in answer to what just happened. Match how the user's earlier ${name} lines are written (person, tense, *actions* in asterisks) and who ${name} is. Keep it short: one to three sentences, terse and real, no flourish.`,
    `Write ${name} as a person, not a winner: the urge can show before the reason; a hard question can get dodged or answered sideways; ${name} needn't have the clever last word, and can be wrong or not know. Don't echo or repeat back what was just said to ${name}.`,
    `If the user says what ${name} means to do, keep that choice exactly: don't soften, reverse or water it down; write how it's done. Stop where someone else would have to answer or react. Never write what anyone else says, does or feels, and never decide how they react. Use only the places and facts given.`,
    o.angles
      ? `Write three different lines, one per line, each starting with its label:\nPLAIN: the likely move for who ${name} is.\nPUSH: ${name} presses harder: a demand, a risk taken, a truth said out loud.\nTURN: ${name} takes the scene somewhere it isn't going: a sideways move, or one of the open threads picked up. Still real, never absurd.\nIf the user says what ${name} means to do, all three do it; they differ only in how. Answer with the three labelled lines alone: no name in front, no quotes around them, no notes.`
      : `Answer with the line alone: no name in front, no quotes around it, no notes.`,
  ].join(' ');

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The draft's request: the scene's facts, the earlier-tonight summary, its last lines, then the steer. */
export function suggestPrompt(o: {
  player: string;
  pronoun: Pronoun;
  room: { name: string; art: string | null; timeOfDay: string | null; weather: string | null };
  lore: string | null;
  you: string;
  her: string;
  others: { name: string; pronoun: Pronoun; voice: string }[];
  stranger: Stranger | null;
  summary: string | null;
  recent: string[];
  steer: string | null;
  /** Three angles (scene SUGGEST); off on the arrival screen. */
  angles?: boolean;
  /** Open threads the player already knows of (openThreads), for TURN. */
  threads?: string[];
  /** On the arrival screen (spec 2026-10-27 §4): where they're about to go; her name for the line. */
  travel?: { from: string | null; to: string; contact: string; comms: boolean; back?: boolean } | null;
}): CompletionMessage[] {
  const when = [o.room.timeOfDay, o.room.weather && o.room.weather !== 'none' ? o.room.weather : null].filter(Boolean).join(', ');
  const hers = forms(o.pronoun).hers;
  const facts = [
    `Where: ${o.room.name}${when ? ` (${when})` : ''}.`,
    o.room.art ? `What the room looks like: ${o.room.art}` : null,
    o.lore,
    `Who you write for:\n${o.you}`,
    `The other character:\n${o.her}`,
    ...o.others.map((x) => `Also here: ${named(x.name, x.pronoun)} — ${oneLine(x.voice)}`),
    o.stranger ? `Also here: ${o.stranger.name}, a stranger from an earlier event — ${o.stranger.voice}` : null,
    o.threads && o.threads.length > 0 ? `Open threads (TURN may pick one up; never invent how they turn out):\n${o.threads.map((t) => `- ${t}`).join('\n')}` : null,
    o.summary ? `Earlier tonight: ${oneLine(o.summary)}` : null,
    o.recent.length > 0 ? `What just happened:\n${o.recent.join('\n')}` : `Nothing has been said yet in this scene: write ${o.player}'s opening line.`,
    o.travel ? travelFact(o.player, o.pronoun, o.travel) : null,
    o.steer ? `What ${o.player} means to do next (write it as ${hers} line, in ${hers} own words): ${cut(oneLine(o.steer), SUGGEST_STEER_MAX)}` : null,
  ].filter((x): x is string => Boolean(x));
  return [
    { role: 'system', content: suggestSystem(o.player, { angles: o.angles === true }) },
    { role: 'user', content: facts.join('\n\n') },
  ];
}

/**
 * The story's open threads as the player already sees them (quest panel, plan card, LEADS, LOOSE ENDS), one line
 * each, at most SUGGEST_THREADS_MAX. Never her secrets: no cipher truths, no lead the player doesn't hold.
 */
export function openThreads(o: {
  quest: { active: { title: string } | null; waiting: { title: string; next: string } | null; elsewhere: { title: string; contactName: string; next: string | null }[] } | null;
  plan: { going: { place: string; until: string } | null; meet: { place: string; time: string } | null } | null;
  her: string;
  player: string;
  leads: { title: string; toName: string; place: string | null; followed: boolean }[];
  looseEnds: { text: string }[][];
}): string[] {
  const q = o.quest;
  return [
    // Only the title: `beat` is the beat's id (`!read`, `counted-badly`), never words the player sees.
    q?.active ? `${q.active.title}: under way` : null,
    q?.waiting ? `${q.waiting.title}: ${oneLine(q.waiting.next)}` : null,
    ...(q?.elsewhere ?? []).map((e) => `${e.title} (with ${e.contactName})${e.next ? `: ${oneLine(e.next)}` : ''}`),
    o.plan?.meet ? `${o.her} is meeting ${o.player} at ${o.plan.meet.place} at ${o.plan.meet.time}` : null,
    o.plan?.going ? `${o.her} is going to ${o.plan.going.place} until ${o.plan.going.until}` : null,
    ...o.leads
      .filter((l) => !l.followed)
      .slice(0, 2)
      .map((l) => `lead: ${l.title} → ${l.toName}${l.place ? ` at ${l.place}` : ''}`),
    ...o.looseEnds
      .map((g) => g[g.length - 1])
      .filter((c): c is { text: string } => Boolean(c))
      .slice(0, 2)
      .map((c) => `loose end: ${oneLine(c.text)}`),
  ]
    .filter((x): x is string => Boolean(x))
    .slice(0, SUGGEST_THREADS_MAX);
}

/** The move they're about to make, for a line said on the way (arrival screen spec §4). */
function travelFact(player: string, pronoun: Pronoun, t: { from: string | null; to: string; contact: string; comms: boolean; back?: boolean }): string {
  const f = forms(pronoun);
  // Off comms and back to where she is: you go to her, not with her.
  if (t.back) return `Next: ${player} heads back to ${t.contact} at ${t.to}. Write what ${player} says or does as ${f.she} set${f.s} off, and why.`;
  if (t.comms) return `Next: ${player} heads to ${t.to}, ${t.contact} on the line. Write what ${player} says or does as ${f.she} set${f.s} off, and why.`;
  const where = t.from ? `from ${t.from} to ${t.to}` : `to ${t.to}`;
  return `Next: ${player} and ${t.contact} are about to head ${where}. Write what ${player} does or says as they set off, and why they're going.`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `Name:` at a line's start, bold or not (`**Name:**`, `**Name**:`); `m` finds it on any line. */
const speakerAt = (name: string, flags = 'i') => new RegExp(`^(\\*\\*)?${esc(name)}(\\*\\*)?\\s*:\\s*(\\*\\*)?\\s*`, flags);

/**
 * The model's answer as a line for the box: no `Name:` in front, no quotes wrapped round the whole,
 * nothing from where another speaker takes over, at most SUGGEST_LINE_MAX characters (cut at a
 * sentence). Null when nothing is left.
 */
export function cleanSuggestion(raw: string, player: string, others: string[] = []): string | null {
  let s = raw.trim().replace(speakerAt(player), '');
  for (const o of others) {
    const at = s.search(speakerAt(o, 'im'));
    if (at > 0) s = s.slice(0, at);
  }
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  const wrapped = /^"([^"]*)"$/.exec(s) ?? /^“([^“”]*)”$/.exec(s);
  if (wrapped) s = wrapped[1]!.trim();
  if (s.length > SUGGEST_LINE_MAX) {
    const head = s.slice(0, SUGGEST_LINE_MAX);
    const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('.\n'));
    s = end > 0 ? head.slice(0, end + 1) : `${head.slice(0, -1)}…`;
  }
  return s === '' ? null : s;
}

/**
 * A label where a line or a word starts, in capitals as asked: bare, bold or italic, numbered or bulleted, bracketed, with
 * a parenthesis after it, then `:` or a dash. After the colon only a bold or italic close is eaten (`*` + space), never an
 * action's opening `*`.
 */
const LABEL = new RegExp(
  `(?:^|(?<=\\s))[ \\t>-]*(?:\\d+[.)]\\s*)?[*_[(]*(${SUGGEST_ANGLES.join('|')})(?:\\s*\\([^)\\n]*\\))?[*_\\])]*\\s*(?::|[-–—](?=\\s))[ \\t]*(?:\\*\\*|[*_](?=\\s))?\\s*`,
  'gm',
);
/** A closing note in brackets on its own line, after the last draft. */
const NOTE_AFTER = /\n\s*[([][^\n]*[)\]]\s*$/;

/**
 * The model's answer as drafts: each `PLAIN:` / `PUSH:` / `TURN:` piece, cleaned like one line (cleanSuggestion), in the
 * order given, empties dropped. An answer with no labels is one unlabelled draft, so an off-format answer still gives a line.
 */
export function parseSuggestions(raw: string, player: string, others: string[] = []): { angle: SuggestAngle | null; text: string }[] {
  const marks = [...raw.matchAll(LABEL)];
  if (marks.length === 0) {
    const one = cleanSuggestion(raw, player, others);
    return one ? [{ angle: null, text: one }] : [];
  }
  const out: { angle: SuggestAngle | null; text: string }[] = [];
  // Before the first label: a preamble when all three came, else most likely the unlabelled first line.
  if (marks.length < SUGGEST_ANGLES.length) {
    const head = cleanSuggestion(raw.slice(0, marks[0]!.index!), player, others);
    if (head) out.push({ angle: null, text: head });
  }
  marks.forEach((m, i) => {
    const from = m.index! + m[0].length;
    const last = i + 1 === marks.length;
    const piece = raw.slice(from, last ? raw.length : marks[i + 1]!.index!);
    const text = cleanSuggestion(last ? piece.replace(NOTE_AFTER, '') : piece, player, others);
    if (text) out.push({ angle: m[1] as SuggestAngle, text });
  });
  return out;
}
