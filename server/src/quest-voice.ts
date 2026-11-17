/**
 * Voiced job beats (2026-11-08): recorded narration for a quest's sections. `world/quests/voice/<quest>.json` maps a
 * section id (a beat or an outcome) to the hash of its text when it was recorded; the clip is
 * `world/quests/voice/<quest>/<section>.ogg`. A section whose text has changed since is skipped (and said so once
 * at startup), so an edit never plays a stale reading. Read once at startup, like the quest book.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { QuestEntry } from '../../shared/quests';

/** The hash a manifest stores for a section's text: what the recording read. */
export function voiceHash(text: string): string {
  return crypto.createHash('sha1').update(text.trim()).digest('hex').slice(0, 12);
}

/** A clip's address as the page asks for it. */
export const voiceUrl = (quest: string, section: string) => `/api/quests/voice/${quest}/${section}.ogg`;

export interface QuestVoice {
  /** The clips for a row's texts, in their order: each text that is a voiced section, as recorded. */
  clips(quest: string, texts: readonly string[]): string[];
}

/**
 * The section's text as a row shows it, or why it can't be voiced: a recording says one fixed text, so a section
 * whose words change in play (a beat's versions or passive lines, a recruit's name, a clock time) has none.
 */
export function sectionText(q: QuestEntry, id: string): string | { why: string } {
  const beats = q.beats.get(id);
  const outcome = q.outcomes.get(id);
  if (!outcome && !beats?.length) return { why: 'no such section' };
  if (beats && beats.length > 1) return { why: 'a beat with more than one version, which one clip cannot follow' };
  if (beats?.[0].segments.some((s) => s.when !== null)) return { why: 'conditional text, which a clip cannot follow' };
  const text = outcome ? outcome.text : beats![0].text;
  if (/\{hire\}|\{time\b/.test(text)) return { why: 'a {hire} name or {time} filled in at play, which a clip cannot say' };
  return text;
}

export function loadQuestVoice(questsDir: string, book: readonly QuestEntry[], warn: (m: string) => void): QuestVoice {
  const byQuest = new Map<string, Map<string, string>>();
  const dir = path.join(questsDir, 'voice');
  for (const q of book) {
    const file = path.join(dir, `${q.id}.json`);
    if (!fs.existsSync(file)) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch (e) {
      warn(`voice: ${q.id}.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const texts = new Map<string, string>();
    for (const [section, hash] of Object.entries(manifest)) {
      const text = sectionText(q, section);
      if (typeof text !== 'string') warn(`voice: ${q.id}/${section}: ${text.why}`);
      else if (!fs.existsSync(path.join(dir, q.id, `${section}.ogg`))) warn(`voice: ${q.id}/${section}: no clip (${q.id}/${section}.ogg)`);
      else if (hash !== voiceHash(text)) warn(`voice: ${q.id}/${section}: text changed since recording, clip skipped`);
      else texts.set(text, voiceUrl(q.id, section));
    }
    if (texts.size) byQuest.set(q.id, texts);
  }
  return {
    clips(quest, rowTexts) {
      const texts = byQuest.get(quest);
      if (!texts) return [];
      return rowTexts.flatMap((t) => (texts.has(t) ? [texts.get(t)!] : []));
    },
  };
}
