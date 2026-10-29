import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../../shared/types';
import type { AgentRecord } from '../src/agents';
import { createPlayers, defaultPlayerId, whosHereBlock, withPersona, type Player } from '../src/players';

function info(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'cass',
    name: 'Cass',
    pronoun: 'she',
    description: '',
    accent: '#46e3fc',
    avatarKind: 'monogram',
    rooms: ['default/workspace'], startRoom: 'default/workspace', legacyDistrict: null, group: null,
    connected: true,
    backend: 'direct',
    modelLabel: null,
    connectionError: null,
    sprite: null,
    tagline: '',
    bio: [],
    facts: [],
    face: { x: 0.5, y: 0.08 },
    thumb: null,
    ...overrides,
  };
}

function record(overrides: Partial<AgentInfo> = {}, recOverrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    info: info(overrides),
    avatarFile: null,
    sprite: null,
    instructions: 'SECRET instructions text',
    oocInstructions: 'SECRET ooc text',
    direct: {
      provider: 'openrouter',
      baseUrl: 'https://or.test',
      keyName: 'openrouter',
      defaultModel: 'm',
      temperature: 0.9,
      maxTokens: 400,
      identity: () => 'SECRET identity text',
    },
    connectionError: null,
    ...recOverrides,
  };
}

describe('whosHereBlock', () => {
  it('exact format; facts as LABEL: value; name only when empty', () => {
    expect(whosHereBlock('Cass', 'she', { tagline: '', bio: [], facts: [] })).toBe("[who's here: Cass (she)]");
    expect(whosHereBlock('Cass', 'she', { tagline: 'Late shift.', bio: ['Para one.', 'Para two.'], facts: [{ label: 'KNOWN FOR', value: 'teasing' }] })).toBe(
      "[who's here: Cass (she) — Late shift.]\nPara one.\nPara two.\nKNOWN FOR: teasing",
    );
  });

  it('drops bio paragraphs from the end to stay <= 2000', () => {
    const bio = [`a${'x'.repeat(1900)}`, `b${'y'.repeat(1900)}`];
    const block = whosHereBlock('Cass', 'she', { tagline: 'tag', bio, facts: [] });
    expect(block.length).toBeLessThanOrEqual(2000);
    expect(block).toContain(bio[0]);
    expect(block).not.toContain(bio[1]);
  });
});

describe('defaultPlayerId', () => {
  it('the character persona.json names -> its id; none -> "you"', () => {
    expect(defaultPlayerId('hicks')).toBe('hicks');
    expect(defaultPlayerId(null)).toBe('you');
    expect(defaultPlayerId(undefined)).toBe('you');
  });
});

describe('createPlayers', () => {
  it('resolve("cass") builds name, line (description rule), whosHere and sprite from the record', () => {
    const rec = record({
      id: 'cass',
      name: 'Cass',
      description: '',
      tagline: 'Late shift, Ribbon bar.',
      bio: ['Remembers everything.'],
      facts: [{ label: 'TELL', value: 'the mug' }],
      sprite: { url: '/x', crop: { top: 0, bottom: 1 } },
    }, { sprite: { file: '/abs/cass.png', crop: { top: 0, bottom: 1 }, expressions: {}, outfits: {}, outfitByScene: {}, outfitWears: {} } });
    const players = createPlayers({ records: () => [rec] });
    const p = players.resolve('cass');
    expect(p.id).toBe('cass');
    expect(p.name).toBe('Cass');
    expect(p.line).toBe('[you: Cass (she) — Late shift, Ribbon bar. Remembers everything.]');
    expect(p.whosHere).toBe("[who's here: Cass (she) — Late shift, Ribbon bar.]\nRemembers everything.\nTELL: the mug");
    expect(p.sprite).toEqual({ file: '/abs/cass.png', crop: { top: 0, bottom: 1 } });
  });

  it('resolve never includes identity/instructions/ooc text', () => {
    const rec = record({ id: 'cass', name: 'Cass', description: 'A description.', tagline: 'tag', bio: ['bio'], facts: [{ label: 'X', value: 'Y' }] });
    const players = createPlayers({ records: () => [rec] });
    const p = players.resolve('cass');
    expect(p.line).not.toContain('SECRET');
    expect(p.whosHere).not.toContain('SECRET');
  });

  it.each([[undefined], [''], ['Bad Id'], ['ghost']])('resolve(%s) -> the default player', (asParam) => {
    const rec = record({ id: 'cass', name: 'Cass' });
    const players = createPlayers({ records: () => [rec] });
    const p = players.resolve(asParam as string | undefined);
    expect(p.id).toBe('you');
    expect(p.name).toBe('You');
    expect(p.line).toBeNull();
    expect(p.whosHere).toBeNull();
    expect(p.sprite).toBeNull();
  });

  it('a roster default player id resolves via its roster record', () => {
    const rec = record(
      { id: 'hicks', name: 'Hicks', pronoun: 'he', description: '', tagline: 'Runs the crew.', bio: ['Production work by day.'], facts: [] },
      { sprite: { file: '/abs/hicks.png', crop: { top: 0, bottom: 1 }, expressions: {}, outfits: {}, outfitByScene: {}, outfitWears: {} } },
    );
    const players = createPlayers({ records: () => [rec], characterId: 'hicks' });
    expect(players.defaultId).toBe('hicks');
    expect(players.resolve(undefined)).toEqual({
      id: 'hicks',
      pronoun: 'he',
      name: 'Hicks',
      line: '[you: Hicks (he) — Runs the crew. Production work by day.]',
      whosHere: "[who's here: Hicks (he) — Runs the crew.]\nProduction work by day.",
      sprite: { file: '/abs/hicks.png', crop: { top: 0, bottom: 1 } },
      tagline: 'Runs the crew.',
    });
  });

  it("the player's figure keeps her stage height", () => {
    const rec = record({ id: 'ember', name: 'Ember', description: '', tagline: '', bio: [], facts: [] }, { sprite: { file: '/abs/e.png', crop: { top: 0, bottom: 0.5 }, height: 0.86, expressions: {}, outfits: {}, outfitByScene: {}, outfitWears: {} } });
    expect(createPlayers({ records: () => [rec], characterId: 'ember' }).resolve(undefined).sprite).toEqual({ file: '/abs/e.png', crop: { top: 0, bottom: 0.5 }, height: 0.86 });
  });

  it("the player's figure keeps her pixel flag", () => {
    const rec = record({ id: 'ember', name: 'Ember', description: '', tagline: '', bio: [], facts: [] }, { sprite: { file: '/abs/e.png', crop: { top: 0, bottom: 0.5 }, pixel: true, expressions: {}, outfits: {}, outfitByScene: {}, outfitWears: {} } });
    expect(createPlayers({ records: () => [rec], characterId: 'ember' }).resolve(undefined).sprite).toEqual({ file: '/abs/e.png', crop: { top: 0, bottom: 0.5 }, pixel: true });
  });

  it('resolve accepts the default id even when it is not in the roster', () => {
    const players = createPlayers({ records: () => [] });
    const p = players.resolve('you');
    expect(p.id).toBe('you');
    expect(p.name).toBe('You');
  });
});

describe('withPersona', () => {
  const nix: Player = {
    id: 'nix',
    name: 'Nix',
    pronoun: 'she',
    line: '[you: Nix — courier]',
    whosHere: "[who's here: Nix — courier]\nbio",
    sprite: { file: '/x.png', crop: { top: 0, bottom: 0.5 } },
    tagline: 'Courier.',
  };

  it("drops the character's tagline: her file isn't the persona's", () => {
    expect(withPersona(nix, { name: 'Vee', background: '' }).tagline).toBeUndefined();
  });

  it("keeps id and sprite, takes name, line and who's-here from the persona", () => {
    const p = withPersona(nix, { name: 'Vee', background: 'Ex-courier.\n\nOwes Cass.' });
    expect(p.id).toBe('nix');
    expect(p.sprite).toBe(nix.sprite);
    expect(p.name).toBe('Vee');
    expect(p.line).toBe('[you: Vee (she) — Ex-courier. Owes Cass.]');
    expect(p.whosHere).toBe("[who's here: Vee (she)]\nEx-courier.\n\nOwes Cass.");
  });

  it('with no background: the name alone', () => {
    const p = withPersona(nix, { name: 'Vee', background: '' });
    expect(p.line).toBe('[you: Vee (she)]');
    expect(p.whosHere).toBe("[who's here: Vee (she)]");
  });

  it("a persona's own pronoun wins; one saved without (every save before pronouns) takes the character's", () => {
    const own = withPersona(nix, { name: 'Rin', background: '', kind: 'custom', pronoun: 'they' });
    expect(own.pronoun).toBe('they');
    expect(own.line).toBe('[you: Rin (they)]');
    expect(own.whosHere).toBe("[who's here: Rin (they)]");
    expect(withPersona(nix, { name: 'Rin', background: '' }).pronoun).toBe('she');
  });

  it('keeps the line on one bracketed line, the background capped at 400', () => {
    const p = withPersona(nix, { name: 'Vee', background: 'word ]\n '.repeat(200).trim() });
    expect(p.line!.includes('\n')).toBe(false);
    expect(p.line!.slice(1, -1).includes(']')).toBe(false);
    expect(p.line!.length).toBeLessThanOrEqual('[you: Vee (she) — ]'.length + 400);
  });
});
