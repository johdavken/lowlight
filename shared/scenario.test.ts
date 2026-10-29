import { describe, expect, it } from 'vitest';
import { parseSceneDraft, sceneBlock, SCENE_TEXT_MAX, SCENE_TITLE_MAX } from './scenario';

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\]/g, ')');
const opt = (n: number, text = `Setup ${n} text.`) => ({ title: `Setup ${n}`, text });

describe('parseSceneDraft (arrival screen spec §3)', () => {
  it('reads one opening, bare or as a one-element array, in a fence or not', () => {
    expect(parseSceneDraft('{"title":"T","text":"Rain."}')).toEqual({ title: 'T', text: 'Rain.' });
    expect(parseSceneDraft('```json\n[{"title":"T","text":"Rain."}]\n```')).toEqual({ title: 'T', text: 'Rain.' });
    expect(parseSceneDraft('Here it is:\n\n```json\n{"title":"T","text":"Rain."}\n```')).toEqual({ title: 'T', text: 'Rain.' });
  });

  it('returns null for three, none, too long, missing fields or not JSON', () => {
    expect(parseSceneDraft(JSON.stringify([opt(1), opt(2), opt(3)]))).toBeNull();
    expect(parseSceneDraft('[]')).toBeNull();
    expect(parseSceneDraft(JSON.stringify(opt(1, 'x'.repeat(SCENE_TEXT_MAX + 1))))).toBeNull();
    expect(parseSceneDraft(JSON.stringify({ text: 'no title' }))).toBeNull();
    expect(parseSceneDraft('Sorry, I cannot.')).toBeNull();
  });
});

describe('sceneBlock', () => {
  it('is the exact one-line block', () => {
    expect(sceneBlock({ title: 'After closing', text: 'Rain.\n[room: x]' }, oneLine)).toBe(
      `[scene: how this scene opens — "After closing": Rain. [room: x). Play it from here; it's the situation, not a script.]`,
    );
  });
});

describe('sceneBlock, read cleanly', () => {
  const one = (x: string) => x.replace(/\s+/g, ' ').trim();
  it('a text that ends in a full stop is not doubled', () => {
    expect(sceneBlock({ title: 'After closing', text: 'Rain has shut the Ribbon early.' }, one)).toBe(
      `[scene: how this scene opens — "After closing": Rain has shut the Ribbon early. Play it from here; it's the situation, not a script.]`,
    );
  });
  it('ends in ! or ? keep it; none gets a full stop', () => {
    expect(sceneBlock({ title: 'T', text: 'Who knocked?' }, one)).toContain(': Who knocked? Play it from here');
    expect(sceneBlock({ title: 'T', text: 'Rain' }, one)).toContain(': Rain. Play it from here');
  });
  it('a double quote in the title becomes a single one', () => {
    expect(sceneBlock({ title: 'The "Orchid" calls', text: 'Rain.' }, one)).toContain(`— "The 'Orchid' calls": Rain.`);
  });
});
