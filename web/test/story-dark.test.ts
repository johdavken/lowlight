import { describe, expect, it } from 'vitest';
import { StoryDark } from '../src/ui/map/story-dark';

describe('StoryDark (blackouts phase 3 §4)', () => {
  it("the map follows the story's dark districts", () => {
    const applied: string[][] = [];
    const s = new StoryDark((ids) => applied.push(ids), () => false);
    s.set(['karasu']);
    s.set([]);
    expect(applied).toEqual([['karasu'], []]);
  });

  it("leaves the admin panel's switches alone while it's open, and brings the story back when it closes (Review Focus 5)", () => {
    const applied: string[][] = [];
    let devOpen = true;
    const s = new StoryDark((ids) => applied.push(ids), () => devOpen);
    s.set(['karasu']);
    expect(applied).toEqual([]);
    devOpen = false;
    s.devToggled(false);
    expect(applied).toEqual([['karasu']]);
    s.devToggled(true);
    expect(applied).toEqual([['karasu']]);
  });
});
