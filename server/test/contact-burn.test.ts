import { describe, expect, it } from 'vitest';
import { parseRun, type QuestStatus } from '../../shared/quests';
import { CONTACT_BURN_REASON } from '../../shared/hand';
import type { ContactCard } from '../../shared/types';
import { at, intakeRelay, lastUser } from './fixtures/intake-relay';
import { standingControl } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';

// Contact cards spec §4: a job in another room that ends BLOWN after Cass's card played costs her trust on her next turn.
const CASS: ContactCard = { id: 'cass', name: 'Cass Okafor', accent: '#fff', portrait: null, spec: 'runner' };
const elsewhere = (o: { blown?: boolean; played?: boolean; getaway?: boolean } = {}): QuestStatus => {
  const run = parseRun(
    JSON.stringify({
      beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, day: 1, endDay: 1, take: 'full', ...(o.blown ?? true ? { blown: true } : {}), ...(o.getaway ? { getaway: true } : {}),
      setup: { approach: 'quiet', people: [], favour: false, at: 0, contacts: [CASS] },
      calls: o.played ?? true ? [{ beat: 'door', choice: 'talk', card: 'contact:cass', again: false, at: 5 }] : [],
    }),
  );
  if (!run) throw new Error('bad run');
  return { id: 'held-papers@1', contact: 'nix-direct', run };
};

describe('contact cards: the cost', () => {
  it('a blown job after her card: trust −1 on her next turn, once', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    expect(t.jobMoves().map((m) => m.reason)).toEqual([CONTACT_BURN_REASON]);
    await t.relay.send('hicks', 'still here');
    expect(t.trustNow()).toBe(-1);
  });

  it('brought and not played, clean or messy: nothing', async () => {
    for (const o of [{ played: false }, { blown: false }]) {
      const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere(o)] });
      await t.relay.send('hicks', 'hey');
      expect(t.trustNow()).toBe(0);
    }
  });

  it('rewinding her line takes the move back; the next turn applies it once', async () => {
    let job: QuestStatus[] = [];
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => job });
    await t.relay.send('hicks', 'hi');
    const before = t.db.recentMessages('hicks', 10).findLast((m) => m.role === 'agent')!;
    job = [elsewhere()];
    await t.relay.send('hicks', 'hey');
    expect(t.trustNow()).toBe(-1);
    // Rewind to her reply before it: the line that carried the move goes, and the move with it.
    await t.relay.rewind('hicks', before.id);
    expect(t.trustNow()).toBe(0);
    await t.relay.send('hicks', 'again');
    expect(t.trustNow()).toBe(-1);
  });

  it('they remember being called in, with no pronoun (final review I1); a card brought and not played is not theirs to remember', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'hey');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain('[done together: Held Papers — went bad, you lent a hand, tonight]');
    const quiet = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere({ played: false })] });
    await quiet.relay.send('hicks', 'hey');
    expect(lastUser(quiet.backend.reqs.at(-1)!)).not.toContain('done together');
  });

  it('the burn leaves her own trust move on that turn alone (final review M1, regraded)', async () => {
    const t = intakeRelay({ contact: 'cass', clock: at(23, 0), others: () => [elsewhere()] });
    await t.relay.send('hicks', 'sorry about the job');
    expect(CONTACT_BURN_REASON).not.toMatch(/\b(her|his|she|he)\b/);
    const reply = t.db.recentMessages('hicks', 10).findLast((m) => m.role === 'agent')!;
    const her = standingControl({ db: t.db, player: () => 'hicks', start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    expect(her.move({ trust: 1, warmth: 0, reason: 'a straight apology' }, reply.id)).not.toBe('already');
    expect(t.trustNow()).toBe(0);
  });
});
