import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { QuestEntry } from '../../shared/quests';
import { loadQuestVoice, sectionText, voiceHash } from '../src/quest-voice';

const beat = (id: string, text: string, segments: { when: unknown; label: string | null; text: string }[] = []) => ({ id, when: null, stranger: null, text, segments, views: [], choices: [] });
const quest = (): QuestEntry =>
  ({
    id: 'the-job',
    pitch: 'A card on the bench.',
    brief: 'A placement house wants a girl back.',
    beats: new Map([
      ['ask', [beat('ask', '*Silas lays the card down.*')]],
      ['trail', [beat('trail', '*The serial is a cart.*', [{ when: [{}], label: null, text: 'x' }])]],
      ['wall', [beat('wall', '*Old Town, late.*'), beat('wall', '*Old Town.*')]],
    ]),
    outcomes: new Map([
      ['bead', { id: 'bead', text: '*You put it in.*', to: 'trail', wait: null, next: null }],
      ['alone', { id: 'alone', text: '*Sure, she says.*', to: 'trail', wait: null, next: null }],
      ['kept', { id: 'kept', text: '*The kid gives a name: {hire}.*', to: 'end', wait: null, next: null }],
      ['met', { id: 'met', text: '{img mirek} *Mirek is at the wok.*', to: 'trail', wait: null, next: null }],
      ['sent', { id: 'sent', text: '*{who} takes the stool beside him.*', to: 'trail', wait: null, next: null }],
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

  it("a {who} section is voiced with a stand-in: its clip plays for the text whatever name fills it", () => {
    expect(sectionText(quest(), 'sent')).toBe('*{who} takes the stool beside him.*');
    const v = loadQuestVoice(dirWith({ sent: voiceHash('*{who} takes the stool beside him.*') }, ['sent.ogg']), [quest()], () => {});
    expect(v.clips('the-job', ['*Ash takes the stool beside him.*'])).toEqual(['/api/quests/voice/the-job/sent.ogg']);
    expect(v.clips('the-job', ['*Kit Vale takes the stool beside him.*'])).toEqual(['/api/quests/voice/the-job/sent.ogg']);
    expect(v.clips('the-job', ['*Ash leaves.*'])).toEqual([]);
  });

  it('a beat with versions is voiced a version at a time: <beat>.1, <beat>.2 in file order', () => {
    expect(sectionText(quest(), 'wall.1')).toBe('*Old Town, late.*');
    expect(sectionText(quest(), 'wall.2')).toBe('*Old Town.*');
    expect(sectionText(quest(), 'wall.3')).toEqual({ why: expect.stringContaining('no such section') });
    expect(sectionText(quest(), 'wall')).toEqual({ why: expect.stringContaining('wall.1') });
    const v = loadQuestVoice(dirWith({ 'wall.2': voiceHash('*Old Town.*') }, ['wall.2.ogg']), [quest()], () => {});
    expect(v.clips('the-job', ['*Old Town.*'])).toEqual(['/api/quests/voice/the-job/wall.2.ogg']);
  });

  it("the GO IN page is the `setup` section: the pitch and the brief as the column shows them", () => {
    expect(sectionText(quest(), 'setup')).toBe('A card on the bench.\n\nA placement house wants a girl back.');
    const v = loadQuestVoice(dirWith({ setup: voiceHash('A card on the bench.\n\nA placement house wants a girl back.') }, ['setup.ogg']), [quest()], () => {});
    expect(v.setup('the-job')).toBe('/api/quests/voice/the-job/setup.ogg');
    expect(v.setup('another')).toBeNull();
  });

  it("reads a section without its {img} markers (narration images): what the recording says, and what a row's clip matches", () => {
    expect(sectionText(quest(), 'met')).toBe('*Mirek is at the wok.*');
    const v = loadQuestVoice(dirWith({ met: voiceHash('*Mirek is at the wok.*') }, ['met.ogg']), [quest()], () => {});
    expect(v.clips('the-job', ['*Mirek is at the wok.*'])).toEqual(['/api/quests/voice/the-job/met.ogg']);
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
