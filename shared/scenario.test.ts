import { describe, expect, it } from 'vitest';
import { parseSceneOptions, sceneBlock, SCENE_TEXT_MAX, SCENE_TITLE_MAX } from './scenario';

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\]/g, ')');
const opt = (n: number, text = `Setup ${n} text.`) => ({ title: `Setup ${n}`, text });

describe('parseSceneOptions (three openings for the pair)', () => {
  it('reads three, in a fence or not, each taking the kind of its place whatever it said', () => {
    const three = [{ kind: 'chance', ...opt(1) }, opt(2), { kind: 'HISTORY', ...opt(3) }];
    const out = parseSceneOptions('Here:\n```json\n' + JSON.stringify(three) + '\n```')!;
    expect(out).toEqual([
      { kind: 'history', ...opt(1) },
      { kind: 'business', ...opt(2) },
      { kind: 'chance', ...opt(3) },
    ]);
    expect(parseSceneOptions(JSON.stringify([opt(1), opt(2), opt(3)]))!.map((o) => o.kind)).toEqual(['history', 'business', 'chance']);
  });

  it('returns null for one, none, too long, a 41-character title, missing fields or not JSON', () => {
    expect(parseSceneOptions(JSON.stringify(opt(1)))).toBeNull();
    expect(parseSceneOptions(JSON.stringify([opt(1)]))).toBeNull();
    expect(parseSceneOptions('[]')).toBeNull();
    expect(parseSceneOptions(JSON.stringify([opt(1, 'x'.repeat(SCENE_TEXT_MAX + 1)), opt(2), opt(3)]))).toBeNull();
    expect(parseSceneOptions(JSON.stringify([{ title: 'x'.repeat(SCENE_TITLE_MAX + 1), text: 'a.' }, opt(2), opt(3)]))).toBeNull();
    expect(parseSceneOptions(JSON.stringify([{ text: 'no title' }, opt(2), opt(3)]))).toBeNull();
    expect(parseSceneOptions('Sorry, I cannot.')).toBeNull();
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
