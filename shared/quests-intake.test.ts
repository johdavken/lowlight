import { describe, expect, it } from 'vitest';
import { ownedBy, parseQuestFile, postsOpen, QUEST_DRAFT_RULES } from './quests';
import { JOB, TRAIL } from './quests.fixture';

const parse = (text: string, id = 'held-papers') => parseQuestFile(id, text, { roster: null, places: null });
const withLines = (lines: string, text = JOB) => text.replace('minutes: 30\n', `minutes: 30\n${lines}\n`);
const problems = (text: string, id?: string) => {
  const r = parse(text, id);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};

describe('posts: and trust:', () => {
  it('posts and trust parse', () => {
    const r = parse(withLines('posts: 20:00-02:00\ntrust: 1 / 1'));
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.posts).toEqual([1200, 120]);
    expect(r.entry.trust).toEqual([1, 1]);
    const plain = parse(JOB);
    expect(plain.ok && [plain.entry.posts, plain.entry.trust]).toEqual([null, null]);
  });

  it('postsOpen across midnight', () => {
    const w: [number, number] = [1200, 120];
    expect(postsOpen(w, 1440 + 90)).toBe(true);
    expect(postsOpen(w, 1200)).toBe(true);
    expect(postsOpen(w, 1440 + 180)).toBe(false);
    expect(postsOpen(w, 1199)).toBe(false);
    expect(postsOpen(w, 1440 + 120)).toBe(false);
    expect(postsOpen(null, 0)).toBe(true);
  });

  it('problems: a bad window, a trust out of range, trust on a quest that is not a job', () => {
    expect(problems(withLines('posts: 25:00-02:00')).some((p) => p.startsWith('posts'))).toBe(true);
    expect(problems(withLines('trust: 4 / 1')).some((p) => p.startsWith('trust'))).toBe(true);
    const trail = TRAIL.replace('---\n\n', 'trust: 1 / 1\n---\n\n');
    expect(trail).not.toBe(TRAIL);
    expect(problems(trail, 'paper-trail').some((p) => /only on a job/.test(p))).toBe(true);
  });

  it('ownedBy: the one contact a job names', () => {
    expect(ownedBy({ with: ['nix-direct'] })).toBe('nix-direct');
    expect(ownedBy({ with: ['nix-direct', 'hicks'] })).toBeNull();
    expect(ownedBy({ with: null })).toBeNull();
  });

  it('the drafting rules know posts: and trust:', () => {
    const rules = QUEST_DRAFT_RULES.join('\n');
    expect(rules).toContain('posts: HH:MM-HH:MM');
    expect(rules).toContain('trust: W / L');
  });
});
