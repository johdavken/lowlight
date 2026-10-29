import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PARTY_ROLE, WhosHere, partySpeaker } from '../src/room/whos-here';
import type { OtherInfo } from '../../shared/types';

const hae: OtherInfo = {
  id: 'hae',
  kind: 'resident',
  name: 'Hae',
  pronoun: 'she',
  accent: '#ff8a3c',
  thumb: '/api/residents/hae/thumb',
  sprite: { url: '/api/residents/hae/sprite', crop: { top: 0, bottom: 0.5 }, expressions: { happy: '/api/residents/hae/sprite/happy' } },
  face: { x: 0.5, y: 0.1 },
  tagline: '',
  facts: [],
};
const silas: OtherInfo = {
  id: 'silas',
  kind: 'contact',
  name: 'Silas',
  pronoun: 'he',
  accent: '#6f9bff',
  thumb: '/api/agents/silas/thumb',
  sprite: { url: '/api/agents/silas/sprite', crop: { top: 0, bottom: 0.5 }, expressions: { annoyed: '/api/agents/silas/sprite/annoyed' } },
  face: { x: 0.48, y: 0.12 },
  tagline: 'Second Socket counter. Lives on the grid.',
  facts: [{ label: 'HANDLE', value: 'Gumshoe.' }],
};

let party: WhosHere | null = null;
function mount(opts: { reducedMotion?: boolean } = {}) {
  document.body.innerHTML = '<div id="w"></div>';
  const root = document.getElementById('w')!;
  party = new WhosHere(root, { reducedMotion: opts.reducedMotion ?? true });
  return root;
}
const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.wh-tile:not(.wh-leaving)')];
const ids = (root: HTMLElement) => rows(root).map((r) => r.dataset.id);
const YOU = { name: 'Hicks', accent: '#3dff7a', thumb: '/api/agents/hicks/thumb' };
const NIX = { name: 'Nix', accent: '#ff4f8b', thumb: '/api/agents/nix-direct/thumb' };

afterEach(() => {
  party?.dispose();
  party = null;
});

describe('the party window (who\'s here, 2026-10-17)', () => {
  it('is hidden with nobody in it', () => {
    const root = mount();
    expect(root.hidden).toBe(true);
  });

  it('lists you, your contact, then everyone else here, then a stranger, in that order', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([hae, silas]);
    party!.setStranger({ name: 'Arlo Venn', url: '/api/extras/sdg-07' });
    expect(root.hidden).toBe(false);
    expect(ids(root)).toEqual([PARTY_ROLE.you, PARTY_ROLE.contact, 'hae', 'silas', 'stranger:Arlo Venn']);
  });

  it('each row: their face, their name in capitals in their accent, and who they are here', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([hae, silas]);
    party!.setStranger({ name: 'Arlo Venn', url: '/api/extras/sdg-07' });
    const row = (id: string) => root.querySelector<HTMLElement>(`.wh-tile[data-id="${id}"]`)!;
    expect(row('hae').querySelector('img')!.getAttribute('src')).toBe('/api/residents/hae/thumb');
    expect(row('hae').querySelector('.wh-name')!.textContent).toBe('HAE');
    expect(row('hae').style.getPropertyValue('--wh-accent')).toBe('#ff8a3c');
    expect(rows(root).map((r) => r.querySelector('.wh-role')!.textContent)).toEqual(['YOU', 'WITH YOU', 'WORKS HERE', 'HERE', 'STRANGER']);
  });

  it('everyone is in full colour all the time: no row is dimmed', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([hae]);
    party!.speaking('hae');
    expect(root.querySelectorAll('.wh-dim')).toHaveLength(0);
  });

  it('the speaker gets a lit border and a speaker icon; one at a time; null clears it', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([hae]);
    party!.speaking('hae');
    const lit = () => rows(root).filter((r) => r.classList.contains('wh-lit')).map((r) => r.dataset.id);
    expect(lit()).toEqual(['hae']);
    expect(root.querySelector('.wh-tile[data-id="hae"] .wh-speaker')).not.toBeNull();
    party!.speaking(PARTY_ROLE.you);
    expect(lit()).toEqual([PARTY_ROLE.you]);
    expect(root.querySelectorAll('.wh-speaker')).toHaveLength(1);
    party!.speaking(null);
    expect(lit()).toEqual([]);
    expect(root.querySelectorAll('.wh-speaker')).toHaveLength(0);
  });

  it('no thumbnail: their initial instead; a face that fails to load does the same', () => {
    const root = mount();
    party!.set([{ ...silas, thumb: null }, hae]);
    expect(root.querySelector('.wh-tile[data-id="silas"] .wh-face')!.textContent).toBe('S');
    root.querySelector('.wh-tile[data-id="hae"] img')!.dispatchEvent(new Event('error'));
    expect(root.querySelector('.wh-tile[data-id="hae"] img')).toBeNull();
    expect(root.querySelector('.wh-tile[data-id="hae"] .wh-face')!.textContent).toBe('H');
  });

  it('someone who leaves fades out (at once with reduced motion); the speaker leaving takes the light with them', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([hae, silas]);
    party!.speaking('hae');
    party!.set([silas]);
    expect(ids(root)).toEqual([PARTY_ROLE.you, PARTY_ROLE.contact, 'silas']);
    expect(root.querySelectorAll('.wh-lit')).toHaveLength(0);
  });

  it("a click on someone else opens their file card; Escape or a click elsewhere closes it; you two and a stranger open none", () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([silas]);
    party!.setStranger({ name: 'Arlo Venn', url: '/api/extras/sdg-07' });
    root.querySelector<HTMLElement>('.wh-tile[data-id="silas"]')!.click();
    expect(root.querySelector('.wh-card .wh-card-name')!.textContent).toBe('SILAS');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.wh-card')).toBeNull();
    root.querySelector<HTMLElement>('.wh-tile[data-id="silas"]')!.click();
    document.body.click();
    expect(root.querySelector('.wh-card')).toBeNull();
    for (const id of [PARTY_ROLE.you, PARTY_ROLE.contact, 'stranger:Arlo Venn']) root.querySelector<HTMLElement>(`.wh-tile[data-id="${id}"]`)!.click();
    expect(root.querySelector('.wh-card')).toBeNull();
  });

  it('cardOpen says whether a file card is up (doors wait while it is)', () => {
    const root = mount();
    party!.setParty(YOU, NIX);
    party!.set([silas]);
    expect(party!.cardOpen).toBe(false);
    root.querySelector<HTMLElement>('.wh-tile[data-id="silas"]')!.click();
    expect(party!.cardOpen).toBe(true);
    document.body.click();
    expect(party!.cardOpen).toBe(false);
  });

  it('main.ts lights the speaker in the party: you, your contact, someone here or a stranger', () => {
    const main = readFileSync(path.resolve('web/src/main.ts'), 'utf8');
    expect(main).toMatch(/whosHere\.speaking\(partySpeaker\(/);
    expect(main).toMatch(/whosHere\.setParty\(/);
    expect(main).toMatch(/whosHere\.setStranger\(/);
  });
});

describe('partySpeaker', () => {
  it("maps the box's speaker to a party row", () => {
    expect(partySpeaker({ speaker: 'user' }, null)).toBe(PARTY_ROLE.you);
    expect(partySpeaker({ speaker: 'contact' }, null)).toBe(PARTY_ROLE.contact);
    expect(partySpeaker({ speaker: 'other', otherId: 'hae' }, null)).toBe('hae');
    expect(partySpeaker({ speaker: 'stranger' }, 'Arlo Venn')).toBe('stranger:Arlo Venn');
    expect(partySpeaker({ speaker: 'stranger' }, null)).toBeNull();
    expect(partySpeaker(null, 'Arlo Venn')).toBeNull();
  });
});
