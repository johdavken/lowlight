import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { QuestEntry } from '../../shared/quests';
import { loadQuestVoice, voiceHash } from '../src/quest-voice';

const beat = (id: string, text: string, segments: { when: unknown; label: string | null; text: string }[] = []) => ({ id, when: null, stranger: null, text, segments, views: [], choices: [] });
const quest = (): QuestEntry =>
  ({
    id: 'the-job',
    beats: new Map([
      ['ask', [beat('ask', '*Silas lays the card down.*')]],
      ['trail', [beat('trail', '*The serial is a cart.*', [{ when: [{}], label: null, text: 'x' }])]],
      ['wall', [beat('wall', '*Old Town, late.*'), beat('wall', '*Old Town.*')]],
    ]),
    outcomes: new Map([
      ['bead', { id: 'bead', text: '*You put it in.*', to: 'trail', wait: null, next: null }],
      ['alone', { id: 'alone', text: '*Sure, she says.*', to: 'trail', wait: null, next: null }],
      ['kept', { id: 'kept', text: '*The kid gives a name: {hire}.*', to: 'end', wait: null, next: null }],
    ]),
  }) as unknown as QuestEntry;

function dirWith(manifest: Record<string, string>, files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-voice-'));
  fs.mkdirSync(path.join(dir, 'voice', 'the-job'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'voice', 'the-job.json'), JSON.stringify(manifest));
  for (const f of files) fs.writeFileSync(path.join(dir, 'voice', 'the-job', f), '');
  return dir;
}

describe('quest voice', () => {
  it('gives the clip for a section whose text is as it was recorded', () => {
    const dir = dirWith({ ask: voiceHash('*Silas lays the card down.*'), bead: voiceHash('*You put it in.*') }, ['ask.ogg', 'bead.ogg']);
    const v = loadQuestVoice(dir, [quest()], () => {});
    expect(v.clips('the-job', ['*You put it in.*', '*Silas lays the card down.*'])).toEqual(['/api/quests/voice/the-job/bead.ogg', '/api/quests/voice/the-job/ask.ogg']);
  });

  it('skips a section edited since recording, and says so once', () => {
    const warn: string[] = [];
    const dir = dirWith({ ask: voiceHash('*Silas lays the old card down.*'), bead: voiceHash('*You put it in.*') }, ['ask.ogg', 'bead.ogg']);
    const v = loadQuestVoice(dir, [quest()], (m) => warn.push(m));
    expect(v.clips('the-job', ['*Silas lays the card down.*', '*You put it in.*'])).toEqual(['/api/quests/voice/the-job/bead.ogg']);
    expect(warn).toEqual([expect.stringContaining('the-job/ask: text changed since recording')]);
  });

  it('ignores unknown sections, missing files and beats with conditional text', () => {
    const warn: string[] = [];
    const dir = dirWith({ nope: 'x', alone: voiceHash('*Sure, she says.*'), trail: voiceHash('*The serial is a cart.*') }, ['trail.ogg']);
    const v = loadQuestVoice(dir, [quest()], (m) => warn.push(m));
    expect(v.clips('the-job', ['*Sure, she says.*', '*The serial is a cart.*'])).toEqual([]);
    expect(warn.join('\n')).toMatch(/the-job\/nope: no such section/);
    expect(warn.join('\n')).toMatch(/the-job\/alone: no clip/);
    expect(warn.join('\n')).toMatch(/the-job\/trail: conditional text/);
  });

  it('refuses sections whose words change in play: a {hire} name, a beat with versions', () => {
    const warn: string[] = [];
    const dir = dirWith({ kept: voiceHash('*The kid gives a name: {hire}.*'), wall: voiceHash('*Old Town.*') }, ['kept.ogg', 'wall.ogg']);
    const v = loadQuestVoice(dir, [quest()], (m) => warn.push(m));
    expect(v.clips('the-job', ['*The kid gives a name: {hire}.*', '*Old Town.*'])).toEqual([]);
    expect(warn.join('\n')).toMatch(/the-job\/kept: a \{hire\} name/);
    expect(warn.join('\n')).toMatch(/the-job\/wall: a beat with more than one version/);
  });

  it('has nothing for a quest without a manifest, or no voice folder at all', () => {
    const v = loadQuestVoice(path.join(os.tmpdir(), 'no-such-quests-dir'), [quest()], () => {});
    expect(v.clips('the-job', ['*Silas lays the card down.*'])).toEqual([]);
  });

  it('ships a clip for every section in each manifest under world/quests', () => {
    const dir = path.resolve(__dirname, '../../world/quests');
    const voiceDir = path.join(dir, 'voice');
    if (!fs.existsSync(voiceDir)) return;
    for (const f of fs.readdirSync(voiceDir).filter((n) => n.endsWith('.json'))) {
      const id = f.slice(0, -5);
      const manifest = JSON.parse(fs.readFileSync(path.join(voiceDir, f), 'utf8')) as Record<string, string>;
      for (const section of Object.keys(manifest)) expect(fs.existsSync(path.join(voiceDir, id, `${section}.ogg`)), `${id}/${section}.ogg`).toBe(true);
    }
  });
});
