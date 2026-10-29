import { describe, expect, it } from 'vitest';
import { COPY as copy } from '../src/landing/copy';
import { her, herCopy, setHerPronoun } from '../src/room/her-copy';

describe('copy follows the character pronoun (spec 2026-10-12 §4)', () => {
  it('select: CHOOSE HER / HIS / THEIR MIND', () => {
    expect(copy.link.titleModel('she')).toBe('CHOOSE HER MIND');
    expect(copy.link.titleModel('he')).toBe('CHOOSE HIS MIND');
    expect(copy.link.titleModel('they')).toBe('CHOOSE THEIR MIND');
    expect(copy.link.stripExtra('he')).toBe('▶ PICK HIM TO LINK A MIND');
    expect(copy.link.reset('he', 'GLM 5.2')).toBe('↺ reset to his default · GLM 5.2');
  });

  it('room: input, map, encounters, journal, dice, HUD', () => {
    const he = herCopy('he');
    const they = herCopy('they');
    expect(he.waitFor).toBe('wait for him');
    expect(they.waitToFinish).toBe('Wait for them to finish.');
    expect(he.endTitle).toBe('End the scene: his closing beat, then his recap and notes (Alt+E)');
    expect(he.encounters.keyRejected).toBe('His key was rejected: relink it at select to have events dealt.');
    expect(they.pageEmpty).toBe('Their page on this visitor: empty until they write it.');
    expect(they.pageTie('old friends')).toBe('Empty. What they know of you from before: old friends');
    expect(he.byHer).toBe('by him');
    expect(they.diceTruth(false)).toBe(' · they ask you one');
    expect(herCopy('she').diceTruth(false)).toBe(' · she asks you one');
    expect(he.diceTruth(true)).toBe(' · ask him one');
    expect(he.diceBack).toBe('[ENTER] BACK TO HIM');
    expect(they.diceLastDie).toBe('The loser opens the next round. Lose your last die and the game is theirs.');
    expect(he.changeModel('GLM 5.2')).toBe('GLM 5.2 — change his model');
  });

  it("the room page's contact: they until her portrait says otherwise", () => {
    expect(her().waitFor).toBe('wait for them');
    setHerPronoun('he');
    expect(her().waitFor).toBe('wait for him');
    setHerPronoun('they');
  });
});
