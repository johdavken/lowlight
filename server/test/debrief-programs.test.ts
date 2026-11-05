import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildDebrief, missionSummary } from '../src/mission-run';
import { parseQuestFile, type QuestRun } from '../../shared/quests';
import { JOB } from '../../shared/quests.fixture';
import { parsePrograms } from '../../shared/programs';
import type { Deck } from '../../shared/gear';

const PROGRAMS = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8')).programs;
const parsed = parseQuestFile('back-door', JOB.replace('[check cool 50]', '[check tech 40]').replace('[check reflex 50]', '[check tech 50]'), { roster: null, places: null });
if (!parsed.ok) throw new Error('fixture');
const Q = parsed.entry;
const POCKET: Deck = { id: 'pocket-deck', name: 'Pocket deck', quality: 1, heat: 0, traits: [] };
const roll = (o: Record<string, unknown>) => ({ stat: 'TECH', dice: 3, faces: [6, 1, 1], keep: 'high' as const, kind: 'clean' as const, pass: true, position: 'open' as const, ...o });
const RUN: QuestRun = {
  beat: null,
  variant: 0,
  wait: null,
  flags: {},
  done: true,
  at: 0,
  picks: [
    { beat: 'door', choice: 'talk', roll: roll({ position: 'open', programs: ['solvent', 'leech'], effect: 'big' }) },
    { beat: 'desk', choice: 'grab', roll: roll({ position: 'dark', programs: ['solvent'] }) },
  ],
  programs: [{ id: 'solvent', at: 1 }, { id: 'leech', at: 1 }, { id: 'firewall', at: 2, burned: true }],
  setup: { approach: 'quiet', people: [], favour: false, at: 0, deck: { id: 'pocket-deck', quality: 1, slots: 1 } },
};
const base = { q: Q, tier: 'clean' as const, district: 'karasu', before: 30, delta: 5, cover: null };

describe('the clocks at the end', () => {
  it('ALARM goes with TAKE; a run before the table has neither', () => {
    expect(buildDebrief({ ...base, run: { ...RUN, takeFill: 2, alarm: 3 } }).alarm).toBe(3);
    expect(buildDebrief({ ...base, run: { ...RUN, takeFill: 2 } }).alarm).toBe(0);
    expect(buildDebrief({ ...base, run: { ...RUN, takeFill: undefined } }).alarm).toBeUndefined();
  });
});

describe('the debrief: programs (programs spec §2.5)', () => {
  it('the debrief lists programs that ran', () => {
    // Tier 2 job, a quality-1 deck: three runs and the FIREWALL below the tier.
    const d = buildDebrief({ ...base, run: RUN, programs: PROGRAMS, deck: POCKET });
    expect(d.programs).toEqual(['SOLVENT · RAN 2 · TECH IN THE DARK', 'LEECH · RAN 1 · TECH BIG', 'FIREWALL · BURNED', 'ALARM +4 FROM THE LACQUER']);
  });

  it('no lacquer line at or above the tier, and none when nothing ran', () => {
    const meridian: Deck = { ...POCKET, id: 'meridian', quality: 3 };
    expect(buildDebrief({ ...base, run: RUN, programs: PROGRAMS, deck: meridian }).programs).toEqual(['SOLVENT · RAN 2 · TECH IN THE DARK', 'LEECH · RAN 1 · TECH BIG', 'FIREWALL · BURNED']);
    expect(buildDebrief({ ...base, run: { ...RUN, programs: [], picks: [] }, programs: PROGRAMS, deck: meridian }).programs).toBeUndefined();
  });

  it('names the mid-job loads and their NERVE (programs spec §1.2a)', () => {
    const meridian: Deck = { ...POCKET, id: 'meridian', quality: 3 };
    const hot: QuestRun = { ...RUN, programs: [{ id: 'solvent', at: 1, hot: true }, { id: 'leech', at: 1 }, { id: 'firewall', at: 2, burned: true, hot: true }] };
    expect(buildDebrief({ ...base, run: hot, programs: PROGRAMS, deck: meridian }).programs).toEqual(['SOLVENT · RAN 2 · TECH IN THE DARK', 'LEECH · RAN 1 · TECH BIG', 'FIREWALL · BURNED', 'LOADED MID-JOB: SOLVENT, FIREWALL · 2 NERVE']);
  });

  it('missionSummary is unchanged by programs', () => {
    const d = buildDebrief({ ...base, run: RUN, programs: PROGRAMS, deck: POCKET });
    const { programs: _p, ...plain } = d;
    expect(missionSummary(Q, RUN, [POCKET], d)).toBe(missionSummary(Q, { ...RUN, programs: undefined }, [POCKET], plain));
  });
});
