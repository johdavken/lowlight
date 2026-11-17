import { describe, expect, it } from 'vitest';
import { parseRun, type QuestStatus } from '../../shared/quests';
import { at, intakeRelay } from './fixtures/intake-relay';

// House Glass retired Paper Trail (2026-11-08): a run of it parked in Nix's room must not list on ELSEWHERE in another room.
const parked = (id: string): QuestStatus => {
  const run = parseRun(
    JSON.stringify({ beat: null, variant: 0, wait: { to: 'return', from: 1, at: 'lowlight-intake', ready: false, by: null, else: 'venn-came', next: 'Be at the Intake.' }, picks: [], flags: {}, done: false, at: 1, day: 1 }),
  );
  if (!run) throw new Error('bad run');
  return { id: `${id}@1`, contact: 'nix-direct', run };
};

describe('a run of a job no longer in the book, in another room', () => {
  it('is not listed on ELSEWHERE', () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [parked('paper-trail')] });
    expect(t.relay.questState('hicks').elsewhere.map((e) => e.id)).not.toContain('paper-trail');
  });
});
