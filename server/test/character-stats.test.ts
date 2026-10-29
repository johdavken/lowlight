import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAgents } from '../src/agents';
import { roomRegistry } from '../src/rooms';
import { DEFAULT_STATS } from '../../shared/stats';

const HICKS = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const BACKEND = { provider: 'openrouter', model: 'z-ai/glm-5.2' };

function world(chars: Record<string, Record<string, unknown>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chars-'));
  for (const [id, json] of Object.entries(chars)) {
    fs.mkdirSync(path.join(dir, id));
    fs.writeFileSync(path.join(dir, id, 'character.json'), JSON.stringify({ name: id, pronoun: 'he', ...json }));
    fs.writeFileSync(path.join(dir, id, 'identity.md'), 'Someone.');
  }
  return dir;
}

const load = (dir: string, warns: string[] = []) =>
  loadAgents({ charactersDir: dir, dataDir: path.join(dir, 'no-data'), rooms: roomRegistry(new Map()), decks: new Set(['stall-build']), warn: (m) => warns.push(m) });

describe('stats and a starting deck on characters', () => {
  it('a character with stats and a deck has them', () => {
    const [a] = load(world({ hicks: { backend: BACKEND, identity: 'identity.md', stats: HICKS, deck: 'stall-build' } }));
    expect(a.info.stats).toEqual(HICKS);
    expect(a.info.deck).toBe('stall-build');
  });
  it('no stats plays at 3s; no deck is null', () => {
    const [a] = load(world({ cass: { backend: BACKEND, identity: 'identity.md' } }));
    expect(a.info.stats).toEqual(DEFAULT_STATS);
    expect(a.info.deck).toBeNull();
  });
  it('bad stats warn and play at 3s; an unknown deck warns and is null; the load still works', () => {
    const warns: string[] = [];
    const [a] = load(world({ cass: { backend: BACKEND, identity: 'identity.md', stats: { ...HICKS, tech: 12 }, deck: 'golden-deck' } }), warns);
    expect(a.info.stats).toEqual(DEFAULT_STATS);
    expect(a.info.deck).toBeNull();
    expect(warns.filter((w) => w.includes('stats'))).toHaveLength(1);
    expect(warns.filter((w) => w.includes('golden-deck'))).toHaveLength(1);
  });
  it('a character that extends another takes its stats and deck unless it has its own', () => {
    const dir = world({
      nix: { stats: HICKS, deck: 'stall-build' },
      'nix-direct': { backend: BACKEND, identity: 'identity.md', extends: 'nix' },
      'nix-two': { backend: BACKEND, identity: 'identity.md', extends: 'nix', stats: { ...HICKS, cool: 9 } },
    });
    const agents = load(dir);
    expect(agents.find((a) => a.info.id === 'nix-direct')?.info).toMatchObject({ stats: HICKS, deck: 'stall-build' });
    expect(agents.find((a) => a.info.id === 'nix-two')?.info.stats?.cool).toBe(9);
  });
});
