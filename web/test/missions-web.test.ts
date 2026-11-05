import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestCards } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import { openCharacterSheet } from '../src/room/character-sheet';
import type { KitView, QuestState } from '../../shared/types';

afterEach(() => {
  document.body.innerHTML = '';
});
const host = () => {
  const h = document.createElement('div');
  document.body.append(h);
  return h;
};
const state = (open: QuestState['open']): QuestState => ({ open, active: null, changed: null, waiting: null, elsewhere: [] });

describe('mission rows and cards', () => {
  it('the list row shows MISSION and its pay', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state([
      { id: 'a', title: 'Night Shift', pitch: 'A manifest.', timed: false, mission: { pay: 400 } },
      { id: 'b', title: 'Odd Job', pitch: null, timed: false, mission: { pay: null } },
      { id: 'c', title: 'Paper Trail', pitch: null, timed: false },
    ]));
    expect([...h.querySelectorAll('.ql-mission')].map((n) => n.textContent)).toEqual(['MISSION · 400 SOL', 'MISSION']);
  });

  it('a card with odds shows them, and NO DECK when it has none', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show({
      id: 'night-shift',
      title: 'Night Shift',
      beat: 'door',
      choices: [
        { id: 'roof', line: 'Loop the cameras from the roof.', pool: { stat: 'TECH', base: 4, dice: 4, parts: [], position: 'open', noDeck: false, deck: { match: 'holds', broke: false, hidden: true, chrome: false } } },
        { id: 'jack', line: 'Jack the door.', pool: { stat: 'TECH', base: 3, dice: 2, parts: [{ label: 'NO DECK', dice: -1 }], position: 'open', noDeck: true } },
        { id: 'wait', line: 'Wait.' },
      ],
    });
    expect([...h.querySelectorAll('.qc-card')].map((c) => c.querySelector('.qc-odds')?.textContent ?? null)).toEqual(['· TECH ●●●● · IN THE OPEN · DECK HOLDS · HIDDEN · NO DECK HEAT', '· TECH ●●● −NO DECK ○ · IN THE OPEN', null]);
  });
});

const KIT: KitView = {
  deck: { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'] },
  owned: [{ id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'] }],
  sol: 400,
  crewLatest: null,
  heat: 4,
  heatHere: 4,
  hottest: { district: 'karasu', heat: 4 },
  rep: {},
  cover: { burner: 0, 'fall-guy': 0 },
  nerveLeft: 2,
  nerveMax: 2,
  stats: { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 },
};

describe('the YOU sheet with a kit', () => {
  const open = (kit: KitView, page: 'stats' | 'street' | 'kit', onCarry?: (id: string) => void) => openCharacterSheet(document.body, { player: { name: 'Hicks', sprite: null, kit }, page, onCarry });
  const districts = () => [...document.querySelectorAll('.cs-dist:not(.cs-dist-head)')].map((r) => [r.querySelector('.cs-dist-name')!.textContent, r.querySelector('.cs-rep-n')!.textContent, r.querySelector('.cs-heat-n')!.textContent]);
  const said = () => document.querySelector('[data-section="districts"]')!.textContent;
  it('STATS: the kit fills the six numbers; skills stay NOT YET', () => {
    open(KIT, 'stats');
    const stats = document.querySelector<HTMLElement>('[data-section="stats"]')!;
    expect([...stats.querySelectorAll('.cs-v')].map((n) => n.textContent)).toEqual(['4', '6', '7', '7', '6', '4']);
    expect(stats.querySelectorAll('.cs-stat')[2].querySelectorAll('.cs-bar i.on')).toHaveLength(7);
    expect(stats.classList.contains('planned')).toBe(false);
    expect(document.querySelector('[data-section="skills"]')!.classList.contains('planned')).toBe(true);
  });
  it('REP: the district here with its tier, then the others, highest first', () => {
    open({ ...KIT, here: 'velvet', rep: { velvet: 100, karasu: 30, spine: 8, strand: 0 }, heatBy: {}, hottest: null }, 'street');
    expect(districts().map((d) => d.slice(0, 2))).toEqual([['VELVET', '100'], ['KARASU', '30'], ['SPINE', '8']]);
    expect(said()).toContain('VELVET HOLDS YOU AS A NAME.');
    expect(document.querySelector<HTMLElement>('.cs-track.cs-rep')!.style.getPropertyValue('--fill')).toBe('100%');
  });
  it('REP where you have none reads 0, NOBODY', () => {
    open({ ...KIT, here: 'marsh', rep: {}, heatBy: {}, hottest: null }, 'street');
    expect(districts()).toEqual([['MARSH', '0', '4']]);
    expect(said()).toContain('MARSH HOLDS YOU AS NOBODY.');
  });
  it('HEAT from an older server (no heatBy): the district here, and a hotter district still shows', () => {
    open({ ...KIT, here: 'karasu', rep: {}, heatHere: 2, heatBy: undefined, hottest: { district: 'velvet', heat: 7 } }, 'street');
    expect(districts()).toEqual([['KARASU', '0', '2'], ['VELVET', '0', '7']]);
  });
  it('HEAT shows in every district that has any, with no rep needed; off the map the headings go', () => {
    open({ ...KIT, heatHere: 2, here: 'karasu', rep: {}, heatBy: { karasu: 2, velvet: 7, 'the-spine': 1 }, hottest: { district: 'velvet', heat: 7 } }, 'street');
    expect(districts()).toEqual([['KARASU', '0', '2'], ['VELVET', '0', '7'], ['THE SPINE', '0', '1']]);
    document.body.innerHTML = '';
    open({ ...KIT, here: null, rep: {}, heatBy: {}, hottest: null }, 'street');
    expect(document.querySelector('.cs-dist')).toBeNull();
  });
  it('NERVE shows what is left of the night (the table spec §3)', () => {
    open({ ...KIT, nerveLeft: 3, nerveMax: 5 }, 'street');
    expect(document.querySelector('.cs-meter .cs-top')!.textContent).toBe('NERVE3 / 5');
    expect(document.querySelector<HTMLElement>('.cs-track.cs-nerve')!.style.getPropertyValue('--fill')).toBe('60%');
  });
  it('KIT shows the sol held and the cover', () => {
    open({ ...KIT, cover: { burner: 1, 'fall-guy': 0 } }, 'kit');
    expect(document.querySelector('.cs-wallet.live .cs-amt')!.textContent).toBe('400WHAT YOU HOLD');
    expect([...document.querySelectorAll('.cs-chip')].map((n) => n.textContent)).toEqual(['BURNER×1', 'FALL GUY×0']);
  });
  it('decks you own but don\'t carry have CARRY; a click asks, setKit redraws, a refusal shows', () => {
    const pocket = { id: 'pocket-deck', name: 'Pocket deck', quality: 1 as const, heat: 0, traits: ['hidden' as const] };
    const onCarry = vi.fn();
    const s = open({ ...KIT, owned: [KIT.deck!, pocket] }, 'kit', onCarry);
    const on = () => document.querySelector('.cs-deck.on')!;
    expect(on().querySelector('.cs-deck-name')!.textContent).toBe('Stall build');
    const other = document.querySelector('.cs-deck:not(.on)')!;
    expect(other.querySelector('.cs-deck-terms')!.textContent).toBe('Q1 · 1 SLOT · HEAT 0 · HIDDEN');
    other.querySelector<HTMLButtonElement>('.cs-carry')!.click();
    expect(onCarry).toHaveBeenCalledWith('pocket-deck');
    s.setKit({ ...KIT, deck: pocket, owned: [KIT.deck!, pocket] });
    expect(on().querySelector('.cs-deck-name')!.textContent).toBe('Pocket deck');
    expect(document.querySelector('.cs-deck:not(.on) .cs-deck-name')!.textContent).toBe('Stall build');
    s.refusal('not while a job is in progress');
    expect(document.querySelector('.cs-deck-why')!.textContent).toBe('not while a job is in progress');
  });
  it('no deck reads NONE', () => {
    open({ ...KIT, deck: null, owned: [] }, 'kit');
    expect(document.querySelector('[data-section="decks"] .cs-line')!.textContent).toBe('NONE');
  });
});
describe('the quest picture on the panel', () => {
  it('draws the picture above the story, muted; none without one', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.show({ id: 'q', title: 'Q', beat: 'b', choices: [{ id: 'a', line: 'A.' }, { id: 'b', line: 'B.' }], art: '/api/quests/art/q.png' }, 'Story.');
    const img = h.querySelector<HTMLImageElement>('.qc-art')!;
    expect(img.getAttribute('src')).toBe('/api/quests/art/q.png');
    expect(img.alt).toBe('');
    cards.show({ id: 'q', title: 'Q', beat: 'b', choices: [{ id: 'a', line: 'A.' }, { id: 'b', line: 'B.' }] }, 'Story.');
    expect(h.querySelector('.qc-art')).toBeNull();
  });
  it('a picture that fails to load goes away', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show({ id: 'q', title: 'Q', beat: 'b', choices: [{ id: 'a', line: 'A.' }, { id: 'b', line: 'B.' }], art: '/x.png' });
    h.querySelector('.qc-art')!.dispatchEvent(new Event('error'));
    expect(h.querySelector('.qc-art')).toBeNull();
  });
});
