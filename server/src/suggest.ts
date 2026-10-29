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

/** The instructions, for the player character `name`. */
export const suggestSystem = (name: string): string =>
  `You help the user play ${name} in a roleplay in Lowlight, a dark, gritty cyberpunk city. Write only ${name}'s next line in this scene: what ${name} does and says now, in answer to what just happened. Match how the user's earlier ${name} lines are written (person, tense, *actions* in asterisks) and who ${name} is. Keep it short: one to three sentences, terse and real, no flourish. Never write what anyone else says, does or feels, and never decide how they react. Use only the places and facts given. Answer with the line alone: no name in front, no quotes around it, no notes.`;

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
    o.summary ? `Earlier tonight: ${oneLine(o.summary)}` : null,
    o.recent.length > 0 ? `What just happened:\n${o.recent.join('\n')}` : `Nothing has been said yet in this scene: write ${o.player}'s opening line.`,
    o.travel ? travelFact(o.player, o.pronoun, o.travel) : null,
    o.steer ? `What ${o.player} means to do next (write it as ${hers} line, in ${hers} own words): ${cut(oneLine(o.steer), SUGGEST_STEER_MAX)}` : null,
  ].filter((x): x is string => Boolean(x));
  return [
    { role: 'system', content: suggestSystem(o.player) },
    { role: 'user', content: facts.join('\n\n') },
  ];
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
