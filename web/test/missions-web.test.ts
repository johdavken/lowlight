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
        { id: 'roof', line: 'Loop the cameras from the roof.', odds: { stat: 'TECH', chance: 74, noDeck: false, why: [] } },
        { id: 'jack', line: 'Jack the door.', odds: { stat: 'TECH', chance: 34, noDeck: true, why: [] } },
        { id: 'wait', line: 'Wait.' },
      ],
    });
    expect([...h.querySelectorAll('.qc-card')].map((c) => c.querySelector('.qc-odds')?.textContent ?? null)).toEqual(['· TECH 74%', '· TECH 34% · NO DECK', null]);
  });
});

const KIT: KitView = {
  deck: { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] },
  sol: 400,
  crewLatest: null,
  heat: 4,
  heatHere: 4,
  hottest: { district: 'karasu', heat: 4 },
  rep: {},
  cover: { burner: 0, 'fall-guy': 0 },
  edgeLeft: 2,
  edgeMax: 2,
  stats: { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 },
};

describe('the YOU sheet with a kit', () => {
  it('STATS, HEAT, SOL and DECK go live; the rest stays NOT YET', () => {
    openCharacterSheet(document.body, { player: { name: 'Hicks', sprite: null, kit: KIT } });
    const sec = (id: string) => document.querySelector<HTMLElement>(`.cs-sec[data-section="${id}"]`)!;
    expect([...sec('stats').querySelectorAll('.cs-v')].map((n) => n.textContent)).toEqual(['4', '6', '7', '7', '6', '4']);
    expect(sec('stats').querySelectorAll('.cs-stat')[2].querySelectorAll('.cs-bar i.on')).toHaveLength(7);
    for (const id of ['stats', 'condition', 'sol', 'gear']) {
      expect(sec(id).classList.contains('planned'), id).toBe(false);
      expect(sec(id).querySelector('.cs-scale')!.textContent, id).not.toBe('NOT YET');
    }
    expect(sec('skills').classList.contains('planned')).toBe(true);
    expect(sec('condition').querySelector('.cs-heat .cs-top')!.textContent).toContain('4 / 10');
    const rowPlanned = (sel: string) => document.querySelector(sel)!.classList.contains('cs-row-planned');
    expect(rowPlanned('.cs-health')).toBe(true);
    expect(rowPlanned('.cs-hum')).toBe(true);
    expect(rowPlanned('.cs-heat')).toBe(false);
    expect(sec('sol').querySelector('.cs-wallet.live .cs-amt')!.textContent).toBe('400sol');
    const slots = [...sec('gear').querySelectorAll('.cs-slot')];
    const deck = slots.find((s) => s.querySelector('.cs-k')!.textContent === 'DECK')!;
    expect(deck.textContent).toBe('DECKStall build · +15 GRID · HEAT 0 · fragile');
    const key = (s: Element) => s.querySelector('.cs-k')!.textContent;
    expect(slots.filter((s) => key(s) === 'CHROME' || key(s) === 'JACK').every((s) => s.classList.contains('cs-row-planned'))).toBe(true);
  });

  it('HEAT is the district here, with a hotter district named', () => {
    openCharacterSheet(document.body, { player: { name: 'Hicks', sprite: null, kit: { ...KIT, heatHere: 2, hottest: { district: 'velvet', heat: 7 } } } });
    expect(document.querySelector('.cs-heat .cs-top')!.textContent).toBe('HEAT2 / 10 · VELVET 7');
    document.body.innerHTML = '';
    openCharacterSheet(document.body, { player: { name: 'Hicks', sprite: null, kit: { ...KIT, heatHere: 4, hottest: { district: 'karasu', heat: 4 } } } });
    expect(document.querySelector('.cs-heat .cs-top')!.textContent).toBe('HEAT4 / 10');
  });

  it('CARRY is live with the cover held', () => {
    openCharacterSheet(document.body, { player: { name: 'Hicks', sprite: null, kit: { ...KIT, cover: { burner: 1, 'fall-guy': 0 } } } });
    const carry = [...document.querySelectorAll('.cs-slot')].find((s) => s.querySelector('.cs-k')!.textContent === 'CARRY')!;
    expect(carry.querySelector('.cs-sub')!.textContent).toBe('BURNER ×1 · FALL GUY ×0');
    expect(carry.classList.contains('cs-row-planned')).toBe(false);
  });

  it('no deck reads NONE', () => {
    openCharacterSheet(document.body, { player: { name: 'Nix', sprite: null, kit: { ...KIT, deck: null } } });
    const deck = [...document.querySelectorAll('.cs-slot')].find((s) => s.querySelector('.cs-k')!.textContent === 'DECK')!;
    expect(deck.querySelector('.cs-sub')!.textContent).toBe('NONE');
  });

  it('without a kit the sheet is as before', () => {
    openCharacterSheet(document.body, { player: { name: 'Nix', sprite: null } });
    for (const s of document.querySelectorAll('.cs-sec')) expect(s.classList.contains('planned')).toBe(true);
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
