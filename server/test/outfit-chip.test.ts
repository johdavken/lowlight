import { describe, expect, it } from 'vitest';
import { intakeRelay, OWN_TEXT, parse } from './fixtures/intake-relay';

// A job that can give an outfit says so on its file (2026-11-09, playtest call): OUTFIT · NIX · COAT, until it's earned.
const COAT = parse(OWN_TEXT.replace('pay: full\ntake: full\n→ end', 'pay: full\ntake: full\ngives: outfit nix-direct coat\n→ end'), 'held-papers');

describe('the outfit a job can give, on its file', () => {
  it('HERE shows the outfit label', () => {
    const t = intakeRelay({ book: [COAT] });
    expect(t.relay.questState('hicks').open.find((q) => q.id === 'held-papers')).toMatchObject({ outfit: 'NIX · COAT' });
  });
  it('ELSEWHERE shows it too', () => {
    const t = intakeRelay({ book: [COAT], place: 'the-tilt', contact: 'vesna' });
    expect(t.relay.questState('hicks').boards![0].jobs[0]).toMatchObject({ outfit: 'NIX · COAT' });
  });
  it('a job with no outfit has none', () => {
    const t = intakeRelay();
    expect(t.relay.questState('hicks').open.find((q) => q.id === 'held-papers')).not.toHaveProperty('outfit');
  });
  it("once earned, it's gone", () => {
    const t = intakeRelay({ book: [COAT] });
    const kit = t.relay['deps'].quests!.kit!;
    t.relay['deps'].quests!.kit = (p, at) => ({ ...kit(p, at), outfits: ['nix-direct/coat'] });
    expect(t.relay.questState('hicks').open.find((q) => q.id === 'held-papers')).not.toHaveProperty('outfit');
  });
});
