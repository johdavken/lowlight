/**
 * Voiced job beats (2026-11-08): recorded narration for a quest's sections. `world/quests/voice/<quest>.json` maps a
 * section id (a beat or an outcome) to the hash of its text when it was recorded; the clip is
 * `world/quests/voice/<quest>/<section>.ogg`. A section whose text has changed since is skipped (and said so once
 * at startup), so an edit never plays a stale reading. Read once at startup, like the quest book.
 */
import { stripImageMarkers } from '../../shared/narration-images';
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
  /** The GO IN page's clip (`setup`: the pitch and the brief), or null. */
  setup(quest: string): string | null;
}

/**
 * The section's text as a row shows it, or why it can't be voiced: a recording says one fixed text, so a section
 * whose words change in play (a beat's versions or passive lines, a recruit's or hire's name, a clock time) has none.
 */
export function sectionText(q: QuestEntry, id: string): string | { why: string } {
  // The GO IN page: the pitch and the brief, as the JOB column shows them (main.ts showSetupColumn).
  if (id === 'setup') {
    const t = [q.pitch, q.brief].filter(Boolean).join('\n\n');
    return t ? t : { why: 'no pitch or brief to read' };
  }
  // A beat's versions are voiced a version at a time: `<beat>.1`, `<beat>.2`, in file order.
  const v = /^(.+)\.(\d+)$/.exec(id);
  const beats = q.beats.get(v ? v[1] : id);
  const outcome = v ? undefined : q.outcomes.get(id);
  if (!outcome && !beats?.length) return { why: 'no such section' };
  if (beats && !v && beats.length > 1) return { why: `a beat with more than one version, which one clip cannot follow: voice each as ${id}.1 … ${id}.${beats.length}` };
  const beat = beats ? beats[v ? Number(v[2]) - 1 : 0] : undefined;
  if (beats && !beat) return { why: 'no such section' };
  if (beat?.segments.some((s) => s.when !== null)) return { why: 'conditional text, which a clip cannot follow' };
  // A recording says the text as the player reads it: without its {img} markers (narration images spec). A {who} is
  // read as a stand-in (the voice script's), and the clip plays whatever name fills it (loadQuestVoice).
  const text = stripImageMarkers(outcome ? outcome.text : beat!.text);
  if (/\{hire\}|\{time\b/.test(text)) return { why: 'a {hire} name or {time} filled in at play, which a clip cannot say' };
  return text;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function loadQuestVoice(questsDir: string, book: readonly QuestEntry[], warn: (m: string) => void): QuestVoice {
  const byQuest = new Map<string, { texts: Map<string, string>; open: { re: RegExp; url: string }[] }>();
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
    /** {who} sections: the text with the name left open, and its clip. */
    const open: { re: RegExp; url: string }[] = [];
    for (const [section, hash] of Object.entries(manifest)) {
      const text = sectionText(q, section);
      if (typeof text !== 'string') warn(`voice: ${q.id}/${section}: ${text.why}`);
      else if (!fs.existsSync(path.join(dir, q.id, `${section}.ogg`))) warn(`voice: ${q.id}/${section}: no clip (${q.id}/${section}.ogg)`);
      else if (hash !== voiceHash(text)) warn(`voice: ${q.id}/${section}: text changed since recording, clip skipped`);
      else if (text.includes('{who}')) open.push({ re: new RegExp(`^${text.split('{who}').map(escapeRe).join('.+?')}$`, 's'), url: voiceUrl(q.id, section) });
      else texts.set(text, voiceUrl(q.id, section));
    }
    if (texts.size || open.length) byQuest.set(q.id, { texts, open });
  }
  return {
    clips(quest, rowTexts) {
      const voiced = byQuest.get(quest);
      if (!voiced) return [];
      return rowTexts.flatMap((t) => {
        const url = voiced.texts.get(t) ?? voiced.open.find((o) => o.re.test(t))?.url;
        return url ? [url] : [];
      });
    },
    setup(quest) {
      const q = book.find((e) => e.id === quest);
      const text = q ? sectionText(q, 'setup') : null;
      return typeof text === 'string' ? (byQuest.get(quest)?.texts.get(text) ?? null) : null;
    },
  };
}
