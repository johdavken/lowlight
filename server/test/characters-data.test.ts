import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAgents } from '../src/agents';
import { roomInstructions } from '../src/instructions';
import { loadResidents } from '../src/residents';
import { roomRegistry } from '../src/rooms';
import { loadPacks } from '../src/scenes';
import { isPronoun } from '../../shared/pronoun';

const root = path.join(__dirname, '..', '..');

describe("the shipped characters, in rooms", () => {
  it('Nix has her four Ribbon rooms (the noodle stall is public), starts at the Intake, and wears them by full room name', async () => {
    const rooms = roomRegistry(await loadPacks(path.join(root, 'scenes')));
    const warnings: string[] = [];
    const agents = loadAgents({ charactersDir: path.join(root, 'characters'), dataDir: path.join(root, 'no-data'), rooms, warn: (m) => warnings.push(m) });
    const nixDirect = agents.find((a) => a.info.id === 'nix-direct')!;
    expect(nixDirect.info).toMatchObject({
      rooms: ['karasu/lowlight-intake', 'karasu/nix-apartment', 'karasu/ribbon-rooftop', 'karasu/walk-up-landing'],
      startRoom: 'karasu/lowlight-intake',
      legacyDistrict: null,
    });
    const nix = JSON.parse(fs.readFileSync(path.join(root, 'characters', 'nix', 'character.json'), 'utf8')) as { outfitByScene: Record<string, string> };
    expect(Object.keys(nix.outfitByScene).every((k) => rooms.has(k))).toBe(true);
    expect(nix.outfitByScene['karasu/lowlight-intake']).toBe('indoors');
    expect(warnings.filter((w) => w.includes('scenePack') || w.includes('no room'))).toEqual([]);
  });

  it("no shipped contact's instructions name share_contact or the room tools: the tool descriptions carry them (set_expression keeps its one-line nudge)", async () => {
    const rooms = roomRegistry(await loadPacks(path.join(root, 'scenes')));
    const agents = loadAgents({ charactersDir: path.join(root, 'characters'), dataDir: path.join(root, 'no-data'), rooms, warn: () => {} });
    expect(agents.map((a) => a.info.id)).toEqual(expect.arrayContaining(['cass', 'hicks', 'nix-direct']));
    for (const a of agents) expect(a.instructions, a.info.id).not.toMatch(/share_contact|set_light|apply_mood/);
    expect(roomInstructions('Dixie')).not.toMatch(/share_contact|set_light|apply_mood/);
  });

  it('every shipped character sets a pronoun (else she reads as they); Mother Rot is he', () => {
    const dir = path.join(root, 'characters');
    for (const id of fs.readdirSync(dir)) {
      const file = path.join(dir, id, 'character.json');
      if (!fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { pronoun?: unknown; extends?: string };
      if (json.extends) continue;
      expect(isPronoun(json.pronoun), id).toBe(true);
    }
    const rooms = roomRegistry(new Map());
    const agents = loadAgents({ charactersDir: dir, dataDir: path.join(root, 'no-data'), rooms, warn: () => {} });
    expect(agents.find((a) => a.info.id === 'mother-rot')?.info.pronoun).toBe('he');
    expect(agents.find((a) => a.info.id === 'nix-direct')?.info.pronoun).toBe('she');
    expect(loadResidents(dir, () => {}).get('hae')?.pronoun).toBe('she');
  });

  it("Hae wears work2 at karasu/noodle-stall", () => {
    const hae = loadResidents(path.join(root, 'characters'), () => {}).get('hae')!;
    expect(hae.sprite.outfitByScene).toEqual({ 'karasu/noodle-stall': 'work2' });
  });
});

describe('outfit wears (spec 2026-10-19)', () => {
  const dirs = fs.readdirSync(path.join(root, 'characters'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it.each(dirs)('%s: every outfit has a one-line wears line of 1–200 characters, and every line names an outfit', (id) => {
    const file = path.join(root, 'characters', id, 'character.json');
    if (!fs.existsSync(file)) return;
    const c = JSON.parse(fs.readFileSync(file, 'utf8')) as { outfits?: Record<string, string>; outfitWears?: Record<string, string> };
    const outfits = Object.keys(c.outfits ?? {});
    const wears = c.outfitWears ?? {};
    expect(Object.keys(wears).sort()).toEqual([...outfits].sort());
    for (const line of Object.values(wears)) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(200);
      expect(line).not.toMatch(/[\n\];]/);
    }
  });
});

