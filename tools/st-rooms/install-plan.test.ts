import { describe, expect, it } from 'vitest';
import type { CastCharacter, CastJson } from './cast';
import { planInstall, type LowlightSettings } from './install-plan';

const char = (id: string, name: string, hash = { card: `c-${id}`, sprites: `s-${id}`, persona: `p-${id}` as string | null }): CastCharacter => ({
  id, name, pronoun: 'she', since: '1.0.0', card: `cards/${name}.png`, sprites: {}, persona: hash.persona ? { file: `${id}.png`, name, description: '', picture: `personas/${id}.png` } : null,
  tagline: '', facts: [], accent: null, home: null, places: [], hash,
});
const ten = ['cass', 'ember', 'hae', 'hicks', 'ines', 'mother-rot', 'nix', 'silas', 'tilly', 'vesna'];
const nameOf = (id: string) => id[0].toUpperCase() + id.slice(1);
const cast = (ids = ten, version = '1.0.0'): CastJson => ({ version, characters: ids.map((id) => char(id, nameOf(id))) });
const settings = (o: Partial<LowlightSettings> = {}): LowlightSettings => ({ answered: true, accepted: true, installed: [], hashes: {}, version: '', tools: true, ...o });
const hashesOf = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `c-${id}|s-${id}|p-${id}`]));
const none = { cards: [] as { name: string; avatar: string }[], personas: {} as Record<string, string> };
const cardsFor = (ids: string[]) => ids.map((id) => ({ name: nameOf(id), avatar: `${nameOf(id)}.png` }));

describe('planInstall', () => {
  it('fresh, accepted: everyone installs, and the lore', () => {
    const p = planInstall(cast(), settings(), none);
    expect(p.install).toEqual(ten);
    expect(p.lore).toBe(true);
    expect(p.skip).toEqual([]);
  });

  it('skips an existing name it never installed', () => {
    const p = planInstall(cast(), settings(), { cards: [{ name: 'Nix', avatar: 'Nix.png' }], personas: {} });
    expect(p.skip).toEqual([{ id: 'nix', why: 'name-taken' }]);
    expect(p.install).not.toContain('nix');
  });

  it("name taken means the card's name, whatever its file is called", () => {
    const p = planInstall(cast(), settings(), { cards: [{ name: 'Nix', avatar: 'Nix_v2.png' }, { name: 'Nyx', avatar: 'Cass.png' }], personas: {} });
    expect(p.skip).toEqual([{ id: 'nix', why: 'name-taken' }]);
    expect(p.install).toContain('cass');
  });

  it('a deleted card is not reinstalled', () => {
    const p = planInstall(cast(), settings({ installed: ['cass'], hashes: hashesOf(['cass']), version: '1.0.0' }), none);
    expect(p.install).not.toContain('cass');
    expect(p.skip.map((s) => s.id)).not.toContain('cass');
  });

  it('a deleted card gets no refresh and no card-update offer (UPDATE CARDS would bring it back)', () => {
    const h = hashesOf(['cass']);
    h.cass = 'OLD|OLD|OLD';
    const p = planInstall(cast(), settings({ installed: ['cass'], hashes: h, version: '1.0.0' }), none);
    expect(p.refresh).toEqual([]);
    expect(p.cardUpdates).toEqual([]);
  });

  it('a new id on update installs and is announced', () => {
    const nine = ten.filter((id) => id !== 'ines');
    const p = planInstall(cast(ten, '1.1.0'), settings({ installed: nine, hashes: hashesOf(nine), version: '1.0.0' }), { cards: cardsFor(nine), personas: {} });
    expect(p.install).toEqual(['ines']);
    expect(p.isNew).toEqual(['ines']);
  });

  it('a changed sprite hash refreshes the sprites', () => {
    const h = hashesOf(ten);
    h.cass = 'c-cass|OLD|p-cass';
    const p = planInstall(cast(), settings({ installed: ten, hashes: h, version: '1.0.0' }), { cards: cardsFor(ten), personas: {} });
    expect(p.refresh).toEqual([{ id: 'cass', parts: ['sprites'] }]);
    expect(p.cardUpdates).toEqual([]);
  });

  it('changed card text is offered, not applied', () => {
    const h = hashesOf(ten);
    h.nix = 'OLD|s-nix|p-nix';
    const p = planInstall(cast(), settings({ installed: ten, hashes: h, version: '1.0.0' }), { cards: cardsFor(ten), personas: {} });
    expect(p.cardUpdates).toEqual(['nix']);
    expect(p.install).toEqual([]);
  });

  it('resumes a partial install without duplicating', () => {
    const four = ten.slice(0, 4);
    const p = planInstall(cast(), settings({ installed: four, hashes: hashesOf(four), version: '' }), { cards: cardsFor(four), personas: {} });
    expect(p.install).toEqual(ten.slice(4));
  });

  it('declined installs nothing', () => {
    const p = planInstall(cast(), settings({ accepted: false }), none);
    expect(p).toEqual({ install: [], skip: [], refresh: [], cardUpdates: [], lore: false, isNew: [] });
  });

  it('lore on a new version, not on the same one', () => {
    const all = { cards: cardsFor(ten), personas: {} };
    expect(planInstall(cast(ten, '1.1.0'), settings({ installed: ten, hashes: hashesOf(ten), version: '1.0.0' }), all).lore).toBe(true);
    expect(planInstall(cast(ten, '1.0.0'), settings({ installed: ten, hashes: hashesOf(ten), version: '1.0.0' }), all).lore).toBe(false);
  });

  it('a first install announces nobody as new (the welcome already said who)', () => {
    expect(planInstall(cast(), settings(), none).isNew).toEqual([]);
  });
});
