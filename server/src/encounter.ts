/**
 * Encounter cards (spec 2026-10-09 encounter cards §2): the narrator that deals three events for
 * this moment in the scene — the room, the lore, both public files, who else is here and the
 * scene's last lines. The call itself is scenario cards' `completeOnce`.
 */
import { named, type Pronoun } from '../../shared/pronoun';
import { ENCOUNTER_LINE_MAX, ENCOUNTER_RECENT_LINES, encounterText, strangerAt, type Stranger } from '../../shared/encounter';
import { speakerBeats } from '../../shared/beats';
import { gigText } from '../../shared/gig/brief';
import { diceText } from '../../shared/dice/text';
import { questRowText } from '../../shared/quests';
import type { ChatMessage } from '../../shared/types';
import type { CompletionMessage } from './turn';
import { oneLine } from './persona';

/** The narrator's instructions (spec §2, exact). */
export const ENCOUNTER_SYSTEM =
  'You write events for a roleplay in Lowlight. Write three different events that could happen right now to the two people in this scene: something from outside that cuts in — a person, a call, a failure, a discovery. Each fits the place and what just happened, in the third person and present tense, with a title of at most 40 characters and two or three sentences of at most 600 characters. Never write what the user does, says or feels. An event may bring in one new person: give them a short name (at most 24 characters, not one already taken) and a few words on how they speak. Use only the places and facts given. Only an event whose text cuts this district\'s power — the grid fails, the lights die — says so with "power": "out"; every other event leaves it out. Answer only with a JSON array of three {"title","text","stranger","power"} objects, where stranger is {"name","voice"} or null and power is "out" or absent.';

const cut = (s: string) => (s.length > ENCOUNTER_LINE_MAX ? `${s.slice(0, ENCOUNTER_LINE_MAX - 1)}…` : s);

/**
 * The scene's latest lines for the narrator: the last `max` (ENCOUNTER_RECENT_LINES) since the last
 * successful END SCENE (never her closing reply to it), as `Name: text`; a
 * travel row as `[travel: <its action line>]`, an event as its `[event: …]` line. OOC, greet,
 * scene, failed and empty lines are left out; each is cut to ENCOUNTER_LINE_MAX characters. Her
 * reply's `Hae:` and stranger paragraphs are their own lines, under their names.
 */
export function recentLines(rows: ChatMessage[], names: { player: string; contact: string; others?: string[] }, max = ENCOUNTER_RECENT_LINES): string[] {
  const lastEnd = rows.findLastIndex((m) => m.role === 'user' && m.mode === 'end' && m.status !== 'failed');
  const lines: string[] = [];
  for (const [i, m] of rows.entries()) {
    if (i <= lastEnd) continue;
    // Her closing reply to that END SCENE (it carries the end mode) belongs to the scene before.
    if (m.status === 'failed' || m.status === 'lost' || m.mode === 'ooc' || m.mode === 'scene' || m.mode === 'end' || m.mode === 'text') continue;
    if (m.role === 'user' && m.mode === 'greet') continue;
    const text = m.text.trim();
    if (m.role === 'user' && m.mode === 'encounter') lines.push(cut(encounterText({ title: m.encounter?.title ?? '', text }, oneLine)));
    else if (m.role === 'user' && m.mode === 'quest') lines.push(cut(questRowText({ title: m.quest?.title ?? '', text, run: m.quest?.run }, oneLine)));
    else if (text === '') continue;
    else if (m.role === 'user' && m.mode === 'travel') lines.push(cut(`[travel: ${oneLine(text)}]`));
    // A run reads as her own [gig] line, so a DRAW after a TRACED run knows how it went.
    else if (m.role === 'user' && m.mode === 'gig') lines.push(cut(m.gig ? gigText(m.gig) : `[gig: ${oneLine(text)}]`));
    else if (m.role === 'user' && m.mode === 'dice') lines.push(cut(m.dice ? diceText(m.dice) : `[dice: ${oneLine(text)}]`));
    else if (m.role === 'user') lines.push(cut(`${names.player}: ${oneLine(text)}`));
    else {
      const stranger = strangerAt(rows, i)?.name ?? null;
      const others = (names.others ?? []).map((n) => ({ id: n, name: n }));
      for (const b of speakerBeats(text, others, names.contact, stranger)) {
        // The beat's words without its `Name:` markers.
        let body = '';
        let at = b.start;
        for (const [from, to] of b.markers) {
          body += text.slice(at, from);
          at = to;
        }
        body = oneLine((body + text.slice(at, b.end)).trim());
        if (body === '') continue;
        const who = b.who === 'other' ? b.id! : b.who === 'stranger' ? stranger! : names.contact;
        lines.push(cut(`${who}: ${body}`));
      }
    }
  }
  return lines.slice(-max);
}

/**
 * The scene as a draw finds it: its recent lines (oldest first, for the narrator; newest first, for
 * choosing lore, as `selectLore` reads them), and the stranger still here — at the line you'd write
 * next, so a scene that has ended (her closing reply in) has nobody left in it.
 */
export function sceneNow(rows: ChatMessage[], names: { player: string; contact: string; others?: string[] }, max = ENCOUNTER_RECENT_LINES): { recent: string[]; loreRecent: string[]; stranger: Stranger | null } {
  const recent = recentLines(rows, names, max);
  const next: ChatMessage = { id: '', role: 'user', text: '', toolLines: [], ts: Infinity, status: 'ok' };
  return { recent, loreRecent: [...recent].reverse(), stranger: strangerAt([...rows, next], rows.length) };
}

/** The narrator's request (spec §2): the facts in order, then the names a stranger can't take. */
export function encounterPrompt(o: {
  room: { name: string; art: string | null; timeOfDay: string | null; weather: string | null };
  lore: string | null;
  you: string;
  her: string;
  /** Everyone else here (the resident, contacts the clock puts here): a name and a few words on them. */
  others: { name: string; pronoun: Pronoun; voice: string }[];
  stranger: Stranger | null;
  recent: string[];
  reserved: string[];
  /** `The power is out across Karasu (since 22:00).` while this district is dark (blackouts phase 3 §2). */
  power?: string | null;
  /** The Cipher's open truths (cipher spec §2.7): an event may carry a small hint to one. */
  cipher?: string | null;
}): CompletionMessage[] {
  const when = [o.room.timeOfDay, o.room.weather && o.room.weather !== 'none' ? o.room.weather : null].filter(Boolean).join(', ');
  const facts = [
    `Where: ${o.room.name}${when ? ` (${when})` : ''}.`,
    o.power ?? null,
    o.room.art ? `What the room looks like: ${o.room.art}` : null,
    o.lore,
    o.cipher ?? null,
    `The user's character:\n${o.you}`,
    `The other character:\n${o.her}`,
    ...o.others.map((x) => `Also here: ${named(x.name, x.pronoun)} — ${oneLine(x.voice)}`),
    o.stranger ? `Also here: ${o.stranger.name}, a stranger from an earlier event — ${o.stranger.voice}` : null,
    o.recent.length > 0 ? `What just happened:\n${o.recent.join('\n')}` : null,
    `Names already taken: ${o.reserved.join(', ')}.`,
  ].filter((x): x is string => Boolean(x));
  return [
    { role: 'system', content: ENCOUNTER_SYSTEM },
    { role: 'user', content: facts.join('\n\n') },
  ];
}
