import { describe, expect, it } from 'vitest';
import { buildDebrief } from '../src/mission-run';
import { heatLeft, heatParts } from '../src/push-run';
import { parseQuestFile, type QuestRun } from '../../shared/quests';
import { JOB } from '../../shared/quests.fixture';
import type { Deck } from '../../shared/gear';

const parsed = parseQuestFile('back-door', JOB, { roster: null, places: null });
if (!parsed.ok) throw new Error('fixture');
const Q = parsed.entry;
const FIELD: Deck = { id: 'field-deck', name: 'Sentinel field deck', quality: 3, heat: 3, traits: ['breaker'] };
const roll = (o: Record<string, unknown>) => ({ stat: 'TECH', dice: 3, faces: [6, 1, 1], keep: 'high' as const, kind: 'clean' as const, pass: true, position: 'open' as const, costs: [], ...o });
const run = (o: Partial<QuestRun> = {}, grid = true): QuestRun => ({
  beat: null,
  variant: 0,
  wait: null,
  flags: {},
  done: true,
  at: 0,
  picks: [{ beat: 'door', choice: 'talk', roll: roll(grid ? { deckHeat: 3 } : {}) }],
  ...o,
});
const leaving = (r: QuestRun, blown = false) => (heatLeft(r, blown) ? [{ at: 1, heat: heatLeft(r, blown), district: 'karasu' }] : []);
const debrief = (r: QuestRun, tier: 'clean' | 'messy' | 'blown' = 'clean', heat = { after: 7, cooled: 0, crew: 0 }) =>
  buildDebrief({ q: Q, run: { ...r, kit: [...(r.kit ?? []), ...leaving(r, tier === 'blown')] }, tier, district: 'karasu', before: 10, delta: 6, cover: null, deck: FIELD, heat }).heat;

describe('where a job\'s heat came from', () => {
  it('a clean job at ALARM 0 is all deck', () => {
    expect(debrief(run({ alarm: 0 }))).toEqual({ district: 'karasu', delta: 3, after: 7, parts: [{ label: 'SENTINEL FIELD DECK', n: 3 }] });
  });
  it('ALARM and deck side by side', () => {
    expect(debrief(run({ alarm: 1 })).parts).toEqual([{ label: 'ALARM', n: 1 }, { label: 'SENTINEL FIELD DECK', n: 3 }]);
  });
  it('a blown job under ALARM 2 says BLOWN for its 2; at ALARM 3 it says ALARM', () => {
    expect(debrief(run({ alarm: 0 }), 'blown').parts?.[0]).toEqual({ label: 'BLOWN', n: 2 });
    expect(debrief(run({ alarm: 3 }), 'blown').parts?.[0]).toEqual({ label: 'ALARM', n: 3 });
  });
  it('SCRUB only shows when it took something off', () => {
    const scrubbed = { picks: [{ beat: 'door', choice: 'talk', roll: roll({ quiet: true }) }] };
    expect(heatParts(run(scrubbed), false, 'DECK')).toEqual([]);
    expect(heatParts(run({ ...scrubbed, alarm: 1 }), false, 'DECK')).toEqual([{ label: 'ALARM', n: 1 }, { label: 'SCRUB', n: -1 }]);
  });
  it('the crew: AT THE END abilities, and traits on a messy job, which count in the total', () => {
    const r = run({ alarm: 0, setup: { approach: 'quiet', people: [], favour: false, at: 0, endHeat: -2 } });
    expect(heatParts(r, false, 'DECK')).toContainEqual({ label: 'CREW AT THE END', n: -2 });
    expect(heatParts(r, true, 'DECK')).not.toContainEqual({ label: 'CREW AT THE END', n: -2 });
    const d = debrief(run({ alarm: 0 }), 'messy', { after: 9, cooled: 0, crew: 2 });
    expect(d.delta).toBe(5);
    expect(d.parts).toEqual([{ label: 'SENTINEL FIELD DECK', n: 3 }, { label: 'MESSY CREW', n: 2 }]);
  });
  it('a messy job\'s heat −1 ability is the crew\'s, not the job\'s', () => {
    const r = run({ alarm: 1, kit: [{ at: 1, heat: -1, district: 'karasu' }] }, false);
    expect(debrief(r, 'messy', { after: 3, cooled: 1, crew: 0 }).parts).toEqual([{ label: 'ALARM', n: 1 }, { label: 'CREW AT THE END', n: -1 }]);
  });
  it('heat from anywhere else is the job\'s, so the parts always sum to the total', () => {
    const d = debrief(run({ alarm: 1, kit: [{ at: 1, heat: 2, district: 'karasu' }] }));
    expect(d.parts).toContainEqual({ label: 'THE JOB', n: 2 });
    expect(d.parts?.reduce((n, p) => n + p.n, 0)).toBe(d.delta);
  });
  it('the parts match what heatLeft lands', () => {
    for (const r of [run({ alarm: 2 }), run({ alarm: 0 }, false), run({ alarm: 4 })]) for (const blown of [false, true]) expect(heatParts(r, blown, 'DECK').reduce((n, p) => n + p.n, 0)).toBe(heatLeft(r, blown));
  });
});
