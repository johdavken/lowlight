import { CITY, fakeRooms } from './fixtures/rooms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { isConnected, loadAgents } from '../src/agents';
import { loadCharacter } from '../src/character';
import { resolveProfile } from '../src/character-profile';
import { oocInstructions, ROLEPLAY_GUIDE, ROOM_INSTRUCTIONS, roomInstructions } from '../src/instructions';
import { createPlayers } from '../src/players';
import { tempDir } from './fixtures/temp-dir';

let root: string;
let charactersDir: string;
let dataDir: string;
const warnings: string[] = [];
const rooms = fakeRooms();

function png(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(new PNG({ width: 4, height: 4 })));
}
/** The shared nix: a direct character (her link added to whatever the test writes). */
const NIX_LINK = { identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } };
function writeNix(c: Record<string, unknown>): void {
  const dir = path.join(charactersDir, 'nix');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'identity.md'), 'You are Nix.');
  fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...c, ...NIX_LINK }));
}

beforeEach(() => {
  root = tempDir('agents-');
  charactersDir = path.join(root, 'characters');
  dataDir = path.join(root, 'data');
  warnings.length = 0;
  // alpha and beta: characters with no backend.
  for (const id of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(charactersDir, id), { recursive: true });
    fs.writeFileSync(path.join(charactersDir, id, 'character.json'), '{}');
  }
  fs.mkdirSync(path.join(charactersDir, 'nix'), { recursive: true });
  writeNix(({ name: 'Nix', accent: '#ff4f8b', portrait: 'portrait.png', scenePack: 'karasu', instructions: 'instructions.md', ooc: 'ooc.md' }));
  png(path.join(charactersDir, 'nix', 'portrait.png'));
  fs.writeFileSync(path.join(charactersDir, 'nix', 'instructions.md'), 'NIX ROOM TEXT');
  fs.writeFileSync(path.join(charactersDir, 'nix', 'ooc.md'), 'NIX OOC TEXT');
});

afterEach(() => vi.restoreAllMocks());

const load = () => loadAgents({ charactersDir, dataDir, rooms, openrouterBaseUrl: 'https://or.test/api/v1', warn: (m) => warnings.push(m) });
const byId = (id: string) => load().find((a) => a.info.id === id)!;

describe('loadAgents', () => {

  it('falls back to the capitalized id, a default accent and a monogram', () => {
    expect(byId('beta').info).toMatchObject({ name: 'Beta', accent: '#7fe9ff', avatarKind: 'monogram' });
  });



  it('applies a character file: name, accent, mask portrait, pack and instructions', () => {
    const nix = byId('nix');
    expect(nix.info).toMatchObject({ name: 'Nix', accent: '#ff4f8b', avatarKind: 'mask', rooms: ['karasu/lowlight-intake', 'karasu/nix-apartment', 'karasu/noodle-stall', 'karasu/ribbon-rooftop'], startRoom: 'karasu/lowlight-intake', legacyDistrict: 'karasu' });
    expect(nix.instructions).toBe('NIX ROOM TEXT');
    expect(nix.oocInstructions).toBe('NIX OOC TEXT');
  });

  it('uses the templates when no instructions file exists', () => {
    expect(byId('alpha').instructions).toBe(roomInstructions('Alpha'));
    expect(byId('alpha').oocInstructions).toBe(oocInstructions('Alpha'));
  });


  it('ignores a character portrait path that escapes its folder, and an unknown pack', () => {
    writeNix(({ portrait: '../../x.png', scenePack: 'nowhere' }));
    const nix = byId('nix');
    expect(nix.info.avatarKind).toBe('monogram');
    expect(nix.info.startRoom).toBe('default/workspace');
    expect(warnings.some((w) => w.includes('portrait'))).toBe(true);
    expect(warnings.some((w) => w.includes('nowhere'))).toBe(true);
  });

  it("the splash's own folder holds no rooms: an old scenePack 'lowlight' gives the default rooms", () => {
    writeNix(({ scenePack: 'lowlight' }));
    const nix = byId('nix');
    expect(nix.info.startRoom).toBe('default/workspace');
    expect(warnings.some((w) => w.includes('scenePack is now rooms'))).toBe(true);
  });

  describe('her rooms', () => {
    const setChar = (c: Record<string, unknown>) => writeNix(({ name: 'Nix', ...c }));
    it('come in her order, the first where she starts', () => {
      setChar({ rooms: ['karasu/noodle-stall', 'karasu/lowlight-intake'] });
      expect(byId('nix').info).toMatchObject({ rooms: ['karasu/noodle-stall', 'karasu/lowlight-intake'], startRoom: 'karasu/noodle-stall', legacyDistrict: null });
    });
    it('a room that does not exist is skipped, with a warning', () => {
      setChar({ rooms: ['velvet/glass-orchid', 'karasu/noodle-stall'] });
      expect(byId('nix').info.rooms).toEqual(['karasu/noodle-stall']);
      expect(warnings).toContain("character 'nix': no room 'velvet/glass-orchid'; skipping it");
    });
    it('none: the default rooms', () => {
      setChar({});
      expect(byId('nix').info).toMatchObject({ rooms: ['default/workspace', 'default/rooftop'], startRoom: 'default/workspace' });
    });
    it('all of hers missing: the default rooms (Review Focus 5)', () => {
      setChar({ rooms: ['velvet/glass-orchid'] });
      expect(byId('nix').info.startRoom).toBe('default/workspace');
    });
    it('the old scenePack reads as every room there, with a warning', () => {
      setChar({ scenePack: 'karasu' });
      expect(byId('nix').info.rooms).toEqual(['karasu/lowlight-intake', 'karasu/nix-apartment', 'karasu/noodle-stall', 'karasu/ribbon-rooftop']);
      expect(warnings).toContain("character 'nix': scenePack is now rooms");
    });
    it('no default rooms in the city: she starts in its first room', () => {
      setChar({});
      const only = loadAgents({ charactersDir, dataDir, rooms: fakeRooms(['karasu/noodle-stall', 'karasu/lowlight-intake']), warn: () => {} });
      expect(only.find((a) => a.info.id === 'nix')!.info).toMatchObject({ rooms: [], startRoom: 'karasu/lowlight-intake' });
    });
  });




  it('never loads a fixed character (a resident of a place), with or without a backend', () => {
    direct('stallkeeper', { name: 'Stallkeeper', kind: 'fixed' });
    direct('cook', { ...TWIN, name: 'Cook', kind: 'fixed', identity: 'identity.md' }, { 'identity.md': 'You are Cook.' });
    direct('hicks', { name: 'Hicks' });
    const ids = loadAgents({ charactersDir, dataDir, rooms, warn: () => {} }).map((a) => a.info.id);
    expect(ids).toContain('hicks');
    expect(ids).not.toContain('stallkeeper');
    expect(ids).not.toContain('cook');
  });


  it('the committed nix-direct loads her identity from the repo, with Hermes off', () => {
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    const nix = loadAgents({ charactersDir: repoChars, dataDir, rooms, warn: () => {} }).find((a) => a.info.id === 'nix-direct');
    expect(nix?.info.connected).toBe(true);
  });

  it('the committed Hae is not in the roster', () => {
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    const ids = loadAgents({ charactersDir: repoChars, dataDir, rooms, warn: () => {} }).map((a) => a.info.id);
    expect(ids).not.toContain('hae');
  });

  describe('sprites', () => {
    const setChar = (extra: Record<string, unknown>) =>
      writeNix(({ name: 'Nix', portrait: 'portrait.png', ...extra }));

    it('a character sprite gives her a sprite ref with the default head-to-waist crop', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png' } });
      const rec = byId('nix');
      expect(rec.info.sprite).toEqual({ url: '/api/agents/nix/sprite', crop: { top: 0, bottom: 0.5 } });
      expect(rec.sprite).toEqual({ file: path.join(charactersDir, 'nix', 'sprite.png'), crop: { top: 0, bottom: 0.5 }, expressions: {}, outfits: {}, outfitByScene: {}, outfitWears: {} });
    });

    it('a sprite makes her avatar her face (the thumb), even with a mask portrait', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png' } });
      expect(byId('nix').info).toMatchObject({ avatarKind: 'face', thumb: '/api/agents/nix/thumb' });
    });

    it('passes an explicit crop through', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png', crop: { top: 0.05, bottom: 0.55 } } });
      expect(byId('nix').info.sprite!.crop).toEqual({ top: 0.05, bottom: 0.55 });
    });

    it('a missing or escaping sprite warns and gives none', () => {
      setChar({ sprite: { src: '../alpha.png' } });
      expect(byId('nix').info.sprite).toBeNull();
      expect(warnings.some((w) => w.includes('sprite'))).toBe(true);
    });

    it('a bad crop is a validation error naming the field; only the sprite is dropped, she stays', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png', crop: { top: 0.6, bottom: 0.4 } } });
      const rec = byId('nix');
      expect(rec.info.name).toBe('Nix');
      expect(rec.info.sprite).toBeNull();
      expect(warnings.some((w) => w.includes('sprite') && w.includes('sprite crop must have 0 ≤ top < bottom ≤ 1'))).toBe(true);
    });

    it('a sprite height (how tall she stands on stage, 0.5–1) reaches her sprite ref; 1 or none sends nothing', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png', height: 0.86 } });
      expect(byId('nix').info.sprite).toMatchObject({ height: 0.86 });
      expect(byId('nix').sprite).toMatchObject({ height: 0.86 });
      setChar({ sprite: { src: 'sprite.png', height: 1 } });
      expect(byId('nix').info.sprite).not.toHaveProperty('height');
    });

    it('a snapped sprite (sprite.pixel) reaches her sprite ref as pixel: true; anything else sends nothing', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png', pixel: true } });
      expect(byId('nix').info.sprite).toMatchObject({ pixel: true });
      setChar({ sprite: { src: 'sprite.png', pixel: 'yes' } });
      expect(byId('nix').info.sprite).not.toHaveProperty('pixel');
      setChar({ sprite: { src: 'sprite.png' } });
      expect(byId('nix').info.sprite).not.toHaveProperty('pixel');
    });

    it('a bad sprite height warns and stands her at full height; the sprite stays', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      setChar({ sprite: { src: 'sprite.png', height: 1.4 } });
      const rec = byId('nix');
      expect(rec.info.sprite).toEqual({ url: '/api/agents/nix/sprite', crop: { top: 0, bottom: 0.5 } });
      expect(warnings.some((w) => w.includes('sprite.height'))).toBe(true);
    });

    it('agents without a sprite have none', () => {
      expect(byId('alpha').info.sprite).toBeNull();
    });
  });

});

describe('expressions', () => {
  const setChar = (extra: Record<string, unknown>) =>
    writeNix(({ name: 'Nix', portrait: 'portrait.png', ...extra }));

  it('expressions beside a sprite appear as URLs on info and absolute files on the record', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'h.png'));
    png(path.join(charactersDir, 'nix', 'a.png'));
    setChar({ sprite: { src: 'sprite.png' }, expressions: { happy: 'h.png', annoyed: 'a.png' } });
    const rec = byId('nix');
    expect(rec.info.sprite!.expressions).toEqual({
      happy: '/api/agents/nix/sprite/happy',
      annoyed: '/api/agents/nix/sprite/annoyed',
    });
    expect(rec.sprite!.expressions.happy.endsWith('h.png')).toBe(true);
  });

  describe('the select face (selectExpression)', () => {
    const withFaces = (extra: Record<string, unknown> = {}) => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      png(path.join(charactersDir, 'nix', 'h.png'));
      png(path.join(charactersDir, 'nix', 'a.png'));
      setChar({ sprite: { src: 'sprite.png' }, expressions: { happy: 'h.png', annoyed: 'a.png' }, ...extra });
      return byId('nix').info.sprite!;
    };
    it('names one of her expressions', () => {
      expect(withFaces({ selectExpression: 'annoyed' }).selectFace).toBe('/api/agents/nix/sprite/annoyed');
    });
    it('neutral means no face over the sprite', () => {
      expect(withFaces({ selectExpression: 'neutral' }).selectFace).toBeNull();
    });
    it('unset: happy when she has it', () => {
      expect(withFaces().selectFace).toBe('/api/agents/nix/sprite/happy');
    });
    it("one she doesn't have: none, with a warning", () => {
      expect(withFaces({ selectExpression: 'smug' }).selectFace).toBeNull();
      expect(warnings.some((w) => w.includes("select face 'smug' isn't one of her expressions"))).toBe(true);
    });
    it('unset and no happy: none', () => {
      png(path.join(charactersDir, 'nix', 'sprite.png'));
      png(path.join(charactersDir, 'nix', 'a.png'));
      setChar({ sprite: { src: 'sprite.png' }, expressions: { annoyed: 'a.png' } });
      expect(byId('nix').info.sprite!.selectFace).toBeNull();
    });
  });

  it('drops bad expression names (Happy, neutral, "a b", a 25-char name) with one warning each, naming the key', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'x.png'));
    const longName = 'a'.repeat(25);
    setChar({
      sprite: { src: 'sprite.png' },
      expressions: { Happy: 'x.png', neutral: 'x.png', 'a b': 'x.png', [longName]: 'x.png' },
    });
    const rec = byId('nix');
    expect(rec.sprite!.expressions).toEqual({});
    for (const key of ['Happy', 'neutral', 'a b', longName]) {
      expect(warnings.filter((w) => w.includes(`'${key}'`)).length).toBe(1);
    }
  });

  it('drops a missing file and one that escapes the folder, with the warning text', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    setChar({ sprite: { src: 'sprite.png' }, expressions: { happy: 'missing.png', annoyed: '../outside.png' } });
    const rec = byId('nix');
    expect(rec.sprite!.expressions).toEqual({});
    expect(warnings.some((w) => w.includes("expression 'happy' file 'missing.png' is missing or outside its folder; leaving it out"))).toBe(true);
    expect(warnings.some((w) => w.includes("expression 'annoyed' file '../outside.png' is missing or outside its folder; leaving it out"))).toBe(true);
  });

  it('expressions without a sprite warn and leave sprite null', () => {
    setChar({ expressions: { happy: 'h.png' } });
    const rec = byId('nix');
    expect(rec.info.sprite).toBeNull();
    expect(warnings.some((w) => w.includes('expressions need a sprite; ignoring them'))).toBe(true);
  });

  it('no expressions key leaves info.sprite without an expressions key, and instructions unchanged', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    setChar({ sprite: { src: 'sprite.png' } });
    const rec = byId('nix');
    expect(rec.info.sprite).not.toHaveProperty('expressions');
    expect(rec.instructions).toBe(roomInstructions('Nix'));
  });

  it('her instructions say nothing of set_expression, even with expressions (faces come from her *actions*)', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'h.png'));
    setChar({ sprite: { src: 'sprite.png' }, expressions: { happy: 'h.png' } });
    const rec = byId('nix');
    expect(rec.instructions).toBe(roomInstructions('Nix'));
    expect(rec.instructions).not.toContain('set_expression');
  });
});

describe('outfits', () => {
  const setChar = (extra: Record<string, unknown>) =>
    writeNix(({ name: 'Nix', portrait: 'portrait.png', ...extra }));

  it('outfits beside a sprite appear as URLs on info and absolute files on the record', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'i.png'));
    png(path.join(charactersDir, 'nix', 'h.png'));
    setChar({ sprite: { src: 'sprite.png' }, outfits: { indoors: 'i.png', home: 'h.png' } });
    const rec = byId('nix');
    expect(rec.info.sprite!.outfits).toEqual({
      indoors: '/api/agents/nix/outfit/indoors',
      home: '/api/agents/nix/outfit/home',
    });
    expect(rec.sprite!.outfits.indoors.endsWith('i.png')).toBe(true);
  });

  it('outfitByScene keeps entries naming a resolved outfit and drops the rest with a warning', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'i.png'));
    setChar({
      sprite: { src: 'sprite.png' },
      outfits: { indoors: 'i.png' },
      outfitByScene: { 'lowlight-intake': 'indoors', 'noodle-stall': 'outdoors' },
    });
    const rec = byId('nix');
    expect(rec.info.sprite!.outfitByScene).toEqual({ 'lowlight-intake': 'indoors' });
    expect(warnings.filter((w) => w.includes("outfitByScene 'noodle-stall' names no outfit 'outdoors'; leaving it out")).length).toBe(1);
  });

  it('drops bad outfit names and missing or escaping files, one warning each; neutral is a valid outfit name', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'x.png'));
    const longName = 'a'.repeat(25);
    setChar({
      sprite: { src: 'sprite.png' },
      outfits: { Indoors: 'x.png', 'a b': 'x.png', [longName]: 'x.png', home: 'missing.png', orchid: '../outside.png', neutral: 'x.png' },
    });
    const rec = byId('nix');
    expect(Object.keys(rec.sprite!.outfits)).toEqual(['neutral']);
    for (const key of ['Indoors', 'a b', longName]) {
      expect(warnings.filter((w) => w.includes(`outfit name '${key}' is invalid; leaving it out`)).length).toBe(1);
    }
    expect(warnings.some((w) => w.includes("outfit 'home' file 'missing.png' is missing or outside its folder; leaving it out"))).toBe(true);
    expect(warnings.some((w) => w.includes("outfit 'orchid' file '../outside.png' is missing or outside its folder; leaving it out"))).toBe(true);
  });

  it('outfits or outfitByScene that is not an object warns once and is ignored', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    setChar({ sprite: { src: 'sprite.png' }, outfits: ['i.png'], outfitByScene: 'x' });
    const rec = byId('nix');
    expect(rec.sprite!.outfits).toEqual({});
    expect(rec.sprite!.outfitByScene).toEqual({});
    expect(warnings.filter((w) => w.includes('outfits must be an object of name → file; ignoring them')).length).toBe(1);
    expect(warnings.filter((w) => w.includes('outfitByScene must be an object of scene id → outfit name; ignoring it')).length).toBe(1);
  });

  it('outfits without a sprite warn and leave sprite null', () => {
    setChar({ outfits: { indoors: 'i.png' }, outfitByScene: { 'lowlight-intake': 'indoors' } });
    const rec = byId('nix');
    expect(rec.info.sprite).toBeNull();
    expect(warnings.filter((w) => w.includes('outfits need a sprite; ignoring them')).length).toBe(1);
  });

  it('outfitWears lands on the record for her resolved outfits, not on info', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'i.png'));
    setChar({ sprite: { src: 'sprite.png' }, outfits: { indoors: 'i.png' }, outfitWears: { indoors: 'grey coat', home: 'robe' } });
    const rec = byId('nix');
    expect(rec.sprite!.outfitWears).toEqual({ indoors: 'grey coat' });
    expect(rec.info.sprite).not.toHaveProperty('outfitWears');
    expect(warnings.some((w) => w.includes("'home'"))).toBe(true);
  });

  it('no outfits leaves info.sprite without outfits or outfitByScene keys', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    setChar({ sprite: { src: 'sprite.png' } });
    const rec = byId('nix');
    expect(rec.info.sprite).not.toHaveProperty('outfits');
    expect(rec.info.sprite).not.toHaveProperty('outfitByScene');
  });
});

describe('roleplay guide', () => {
  it('asks for *actions* and plain speech, and says this room overrides "no asterisks / plain text" advice', () => {
    expect(ROLEPLAY_GUIDE).toContain('*asterisks*');
    expect(ROLEPLAY_GUIDE).toContain('no quotes');
    expect(ROLEPLAY_GUIDE).toMatch(/overrides any general instruction to write plain text or avoid asterisks/);
  });

  it('says what a beat is; the length is the beat line\'s alone', () => {
    expect(ROLEPLAY_GUIDE).toContain('a beat is a short action and a line or two of speech');
    expect(ROLEPLAY_GUIDE).not.toContain('80 words');
  });

  it("never writes the user's part, and leaves them something to answer", () => {
    expect(ROLEPLAY_GUIDE).toContain("Never write the user's actions, words or feelings");
    expect(ROLEPLAY_GUIDE).toContain('something to answer');
  });

  it('closes a scene in character, no status report; no recap to save (the Residual writes it)', () => {
    expect(ROLEPLAY_GUIDE).toContain('When the user ends the scene in character, close it in character');
    expect(ROLEPLAY_GUIDE).not.toContain('recap');
  });

  it('is agent-neutral', () => {
    expect(ROLEPLAY_GUIDE).not.toContain('Nix');
  });
});

describe('instruction templates', () => {
  it('room and OOC templates use the agent name, not Nix', () => {
    expect(roomInstructions('Dixie')).toContain("Dixie's room");
    expect(roomInstructions('Dixie')).not.toContain('Nix');
    // How to write roleplay lives in one place, the roleplay guide, added to every agent's roleplay turns.
    expect(roomInstructions('Dixie')).not.toContain('asterisks');
    expect(ROOM_INSTRUCTIONS).not.toContain('asterisks');
    expect(roomInstructions('Dixie')).toContain(JOURNAL_PARAGRAPH);
    expect(oocInstructions('Dixie')).toContain('You are still Dixie');
    expect(oocInstructions('Dixie')).not.toContain('Nix');
  });
});

const JOURNAL_PARAGRAPH =
  "Your room keeps a journal of what should last — what's on the counter, what's owed, who's due back. It is kept for you: the [journal: …] line shows what matters now, the pinned notes and any that just came up. You don't write it.";

describe("Nix's committed character files", () => {
  it('carry her current room and OOC instructions verbatim', async () => {
    const { ROOM_INSTRUCTIONS, OOC_INSTRUCTIONS } = await import('../src/instructions');
    const dir = path.join(__dirname, '..', '..', 'characters', 'nix');
    // The shared room text, then her own lines (her apartment) closing on "Stay yourself." (share_contact's description says when to call it).
    const own = fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8').trim();
    const shared = ROOM_INSTRUCTIONS.replace(/ Stay yourself\.$/, '');
    expect(own.startsWith(shared)).toBe(true);
    expect(own.endsWith(' Stay yourself.')).toBe(true);
    expect(own).not.toContain('share_contact');
    expect(own).toContain('nix-apartment');
    expect(ROOM_INSTRUCTIONS).toContain(JOURNAL_PARAGRAPH);
    expect(OOC_INSTRUCTIONS).not.toContain('journal');
    expect(fs.readFileSync(path.join(dir, 'ooc.md'), 'utf8').trim()).toBe(OOC_INSTRUCTIONS);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'))).toMatchObject({ name: 'Nix', accent: '#ff4f8b', rooms: ['karasu/lowlight-intake', 'karasu/nix-apartment', 'karasu/ribbon-rooftop', 'karasu/walk-up-landing'] });
  });

  it("Nix's file: tagline, two bio paragraphs, five facts, all within limits", () => {
    const dir = path.join(__dirname, '..', '..', 'characters', 'nix');
    const c = loadCharacter(dir)!;
    const warned: string[] = [];
    const p = resolveProfile([{ dir, c }], c.description ?? '', (m) => warned.push(m));
    expect(warned).toEqual([]);
    expect(p.tagline).toBe('Night counselor, Lowlight Intake. Nine years at the Orchid. Fee clears first.');
    expect(p.bio).toHaveLength(2);
    expect(p.bio[0]).toMatch(/^Nix Neon\. Nicolette Varga on clinic paperwork/);
    expect(p.facts.map((f) => f.label)).toEqual(['KNOWN FOR', "DON'T ASK ABOUT", 'TELL', 'HOUSE RULES', 'DANGEROUS']);
  });
});

describe('the committed cast', () => {
  it('Hicks is a committed direct character with a sprite, playable and a contact', () => {
    const warned: string[] = [];
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    // His committed rooms, whatever they are now (like Cass's below).
    const hicksRooms = (JSON.parse(fs.readFileSync(path.join(repoChars, 'hicks', 'character.json'), 'utf8')) as { rooms?: string[] }).rooms ?? [];
    const all = loadAgents({ charactersDir: repoChars, dataDir, rooms: fakeRooms([...new Set([...CITY, ...hicksRooms])]), warn: (m) => warned.push(m) });
    const hicks = all.find((a) => a.info.id === 'hicks')!;
    expect(hicks.info).toMatchObject({ name: 'Hicks', backend: 'direct', connected: true, tagline: 'Netrunner. Old Town born. Crew of two.', thumb: '/api/agents/hicks/thumb' });
    expect(hicks.info.bio).toHaveLength(3);
    expect(hicks.info.facts.map((f) => f.label)).toEqual(['KNOWN FOR', "DON'T ASK ABOUT", 'TELL', 'DANGEROUS']);
    expect(hicks.direct!.identity()).toMatch(/^# Personality\n\nYou are Hicks\./);
    expect(warned.filter((m) => m.includes('hicks'))).toEqual([]);
  });

  it('Cass is a committed direct character: her own identity, sprite and file, within every limit', () => {
    const warned: string[] = [];
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    // Her committed rooms, whatever they are now (Studio adds them as her places grow).
    const cassRooms = (JSON.parse(fs.readFileSync(path.join(repoChars, 'cass', 'character.json'), 'utf8')) as { rooms: string[] }).rooms;
    const all = loadAgents({ charactersDir: repoChars, dataDir, rooms: fakeRooms([...new Set([...CITY, ...cassRooms])]), warn: (m) => warned.push(m) });
    const cass = all.find((a) => a.info.id === 'cass')!;
    expect(cass.info).toMatchObject({ name: 'Cass', backend: 'direct', connected: true, accent: '#46e3fc', thumb: '/api/agents/cass/thumb', face: { x: 0.496, y: 0.088 } });
    expect(cass.info.tagline).toBe('Late shift at the Tilt. Teasing by default. Remembers everything.');
    expect(cass.info.bio).toHaveLength(2);
    expect(cass.info.facts.map((f) => f.label)).toEqual(['KNOWN FOR', "DON'T ASK ABOUT", 'TELL', 'HOUSE RULES', 'DANGEROUS']);
    expect(cass.direct!.identity()).toMatch(/^# Personality\n\nYou are Cass Arden\./);
    expect(warned.filter((m) => m.includes('cass'))).toEqual([]);
  });

  it('playing Hicks uses his own description, not tagline + bio', () => {
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    const all = loadAgents({ charactersDir: repoChars, dataDir, rooms, warn: () => {} });
    const players = createPlayers({ records: () => all, characterId: 'hicks' });
    expect(players.resolve(undefined).line).toBe('[you: Hicks (he) — Netrunner out of Old Town; runs a two-person crew from one room on Ribbon Level 2. Sly, dry, hard to find.]');
  });
});

describe('group: where she belongs on the select screen', () => {
  it('her own group wins, else her first room\'s district, else none for the neutral rooms', () => {
    direct('g-own', { name: 'Own', rooms: ['default/workspace'], group: 'karasu', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } });
    direct('g-room', { name: 'Room', rooms: ['karasu/noodle-stall'], identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } });
    expect(byId('g-own').info.group).toBe('karasu');
    expect(byId('g-room').info.group).toBe('karasu');
    // alpha has no rooms: the neutral rooms, no group.
    expect(byId('alpha').info.group).toBeNull();
    // Naming a neutral room herself is no group either.
    direct('g-neutral', { name: 'Neutral', rooms: ['default/workspace'], identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } });
    expect(byId('g-neutral').info.group).toBeNull();
  });

  it('a group the city has no rooms for warns and falls back to her first room\'s district', () => {
    direct('g-bad', { name: 'Bad', rooms: ['karasu/noodle-stall'], group: 'atlantis', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } });
    expect(byId('g-bad').info.group).toBe('karasu');
    expect(warnings.some((w) => w.includes("g-bad") && w.includes("group: no district 'atlantis'"))).toBe(true);
  });

  it('the committed cast: the Spine for Adebayo (her desk is in Nexus), each other by home', () => {
    const repoChars = path.join(__dirname, '..', '..', 'characters');
    const scenesDir = path.join(__dirname, '..', '..', 'scenes');
    const city = fs.readdirSync(scenesDir).flatMap((d) => (fs.statSync(path.join(scenesDir, d)).isDirectory() ? fs.readdirSync(path.join(scenesDir, d)).filter((r) => !r.startsWith('_')).map((r) => `${d}/${r}`) : []));
    const all = loadAgents({ charactersDir: repoChars, dataDir, rooms: fakeRooms(city), warn: () => {} });
    const g = Object.fromEntries(all.map((a) => [a.info.id, a.info.group]));
    expect(g).toMatchObject({ adebayo: 'spine', soren: 'spine', rue: 'spine', hicks: 'karasu', cass: 'karasu', 'mother-rot': 'marsh', ines: 'drownworks' });
  });
});

function direct(id: string, character: Record<string, unknown>, files: Record<string, string> = {}): void {
  const dir = path.join(charactersDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify(character));
  if (character.identity === 'identity.md') fs.writeFileSync(path.join(dir, 'identity.md'), `You are ${String(character.name ?? id)}.`);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
}
const TWIN = { name: 'Nix', extends: 'nix', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } };

describe('direct characters', () => {

  it('a character folder with a backend block is listed as a direct agent', () => {
    direct('nix-direct', TWIN);
    const rec = byId('nix-direct');
    expect(rec.info).toMatchObject({ id: 'nix-direct', name: 'Nix', backend: 'direct', connected: true, connectionError: null, modelLabel: 'glm-5.2' });
    expect(isConnected(rec)).toBe(true);
    expect(rec.direct).toMatchObject({
      provider: 'openrouter',
      baseUrl: 'https://or.test/api/v1',
      keyName: 'openrouter',
      defaultModel: 'z-ai/glm-5.2',
      temperature: 0.9,
      maxTokens: 1500,
    });
    expect(rec.direct).not.toHaveProperty('apiKey');
  });

  it("her dice settings reach the roster: her own clamped, else the defaults (liar's dice)", () => {
    direct('nix-direct', { ...TWIN, dice: { bluff: 0.4, nerve: 2, suspicion: 'x' } });
    expect(byId('nix-direct').info.dice).toEqual({ bluff: 0.4, nerve: 1, suspicion: 0.5 });
    direct('plain', { name: 'Plain', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } });
    expect(byId('plain').info.dice).toEqual({ bluff: 0.25, nerve: 0.5, suspicion: 0.5 });
  });


  it("pronoun: her own, else the character she extends, else they", () => {
    const backend = { provider: 'openrouter', model: 'z-ai/glm-5.2' };
    direct('pa', { name: 'Pa', pronoun: 'he', identity: 'identity.md', backend });
    direct('pb', { name: 'Pb', extends: 'pa', identity: 'identity.md', backend });
    direct('pc', { name: 'Pc', identity: 'identity.md', backend });
    direct('pd', { name: 'Pd', extends: 'pc', identity: 'identity.md', backend });
    direct('pe', { name: 'Pe', extends: 'pa', pronoun: 'she', identity: 'identity.md', backend });
    expect(['pa', 'pb', 'pc', 'pd', 'pe'].map((id) => byId(id).info.pronoun)).toEqual(['he', 'he', 'they', 'they', 'she']);
  });

  it('a character with no backend (nor a Hermes profile) still carries her pronoun', () => {
    direct('plainer', { name: 'Plainer', pronoun: 'he' });
    expect(byId('plainer').info.pronoun).toBe('he');
  });


  it('extends takes accent, portrait, sprite, rooms, instructions and ooc; own fields override', () => {
    direct('nix-direct', { ...TWIN, accent: '#00ff00' });
    const rec = byId('nix-direct');
    expect(rec.info).toMatchObject({ accent: '#00ff00', startRoom: 'karasu/lowlight-intake', avatarKind: 'mask' });
    expect(rec.avatarFile).toBe(path.join(charactersDir, 'nix', 'portrait.png'));
    expect(rec.instructions).toBe('NIX ROOM TEXT');
    expect(rec.oocInstructions).toBe('NIX OOC TEXT');
  });

  it("expressions follow the sprite: an inherited sprite inherits the base's expressions; her own sprite gets only her own", () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'h.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' }, expressions: { happy: 'h.png' } }),
    );

    direct('nix-direct', TWIN); // no own sprite -> inherits nix's sprite and her expressions
    expect(byId('nix-direct').sprite!.expressions.happy).toBe(path.join(charactersDir, 'nix', 'h.png'));

    direct('nix-own', { ...TWIN, sprite: { src: 'own.png' } }, { 'own.png': 'x' }); // her own sprite, no own expressions
    expect(byId('nix-own').sprite!.expressions).toEqual({});
  });

  it('outfits follow the sprite: an inherited sprite inherits the base outfits and map; her own sprite gets only her own', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'i.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' }, outfits: { indoors: 'i.png' }, outfitByScene: { 'lowlight-intake': 'indoors' } }),
    );

    direct('nix-direct', TWIN);
    expect(byId('nix-direct').sprite!.outfits.indoors).toBe(path.join(charactersDir, 'nix', 'i.png'));
    expect(byId('nix-direct').info.sprite!.outfitByScene).toEqual({ 'lowlight-intake': 'indoors' });

    direct('nix-own', { ...TWIN, sprite: { src: 'own.png' } }, { 'own.png': 'x' });
    expect(byId('nix-own').sprite!.outfits).toEqual({});
    expect(byId('nix-own').sprite!.outfitByScene).toEqual({});
  });

  it('own outfits are ignored, with a warning, when she inherits her sprite instead of having her own', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' } }),
    );
    direct('nix-direct', { ...TWIN, outfits: { indoors: 'i.png' } }, { 'i.png': 'x' });
    expect(byId('nix-direct').sprite!.outfits).toEqual({});
    expect(warnings.filter((w) => w.includes('outfits without her own sprite are ignored')).length).toBe(1);
  });

  it('own expressions are ignored, with a warning, when she inherits her sprite instead of having her own', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' } }),
    );
    direct('nix-direct', { ...TWIN, expressions: { happy: 'h.png' } }, { 'h.png': 'x' }); // no own sprite -> inherits nix's; her own expressions are dropped
    const rec = byId('nix-direct');
    expect(rec.sprite!.expressions).toEqual({});
    expect(warnings.some((w) => w.includes("expressions without her own sprite are ignored"))).toBe(true);
  });

  it('a direct character whose own sprite fails to resolve gets no misleading "expressions need a sprite" warning just because the base she extends has expressions', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'h.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' }, expressions: { happy: 'h.png' } }),
    );
    direct('nix-direct', { ...TWIN, sprite: { src: 'missing.png' } }); // her own sprite fails; she sets no expressions herself
    const rec = byId('nix-direct');
    expect(rec.sprite).toBeNull();
    expect(warnings.some((w) => w.includes('expressions need a sprite; ignoring them'))).toBe(false);
  });

  it("extends inherits the base's outfitWears with the sprite; her own without her own sprite are ignored", () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'i.png'));
    writeNix({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' }, outfits: { indoors: 'i.png' }, outfitWears: { indoors: 'grey coat' } });
    direct('nix-direct', { ...TWIN, outfitWears: { indoors: 'mine' } });
    const rec = byId('nix-direct');
    expect(rec.sprite!.outfitWears).toEqual({ indoors: 'grey coat' });
    expect(warnings.some((w) => w.includes('outfits without her own sprite are ignored'))).toBe(true);
  });

  it('extends inherits the select face with the sprite', () => {
    png(path.join(charactersDir, 'nix', 'sprite.png'));
    png(path.join(charactersDir, 'nix', 'a.png'));
    writeNix(({ name: 'Nix', portrait: 'portrait.png', sprite: { src: 'sprite.png' }, expressions: { annoyed: 'a.png' }, selectExpression: 'annoyed' }),
    );
    direct('nix-direct', TWIN);
    expect(byId('nix-direct').info.sprite!.selectFace).toBe('/api/agents/nix-direct/sprite/annoyed');
  });

  it('extends is one level: extending a character that extends → not connected, naming extends', () => {
    direct('nix-direct', TWIN);
    direct('nix-again', { ...TWIN, extends: 'nix-direct' });
    const rec = byId('nix-again');
    expect(rec.info.connected).toBe(false);
    expect(rec.info.connectionError).toMatch(/extends/);
    expect(rec.direct).toBeNull();
  });


  it('identity file in her folder', () => {
    direct('echo', { name: 'Echo', identity: 'identity.md', backend: { provider: 'openrouter', model: 'a/b' } }, { 'identity.md': 'You are Echo.' });
    expect(byId('echo').direct!.identity()).toBe('You are Echo.');
    expect(byId('echo').info.avatarKind).toBe('monogram');
  });

  const notConnected = (id: string) => {
    const rec = byId(id);
    expect(rec.info.connected).toBe(false);
    expect(rec.direct).toBeNull();
    return rec.info.connectionError ?? '';
  };

  it('an identity of hermes:<x> warns and loads her without one', () => {
    direct('old', { name: 'Old', identity: 'hermes:nix', backend: { provider: 'openrouter', model: 'a/b' } });
    const rec = byId('old');
    expect(rec.info).toMatchObject({ id: 'old', name: 'Old', backend: 'none', connected: false });
    expect(rec.direct).toBeNull();
    expect(warnings.some((w) => w.includes("character 'old'") && w.includes('hermes:'))).toBe(true);
  });

  it('no identity → not connected, naming identity', () => {
    direct('x', { name: 'X', backend: { provider: 'openrouter', model: 'a/b' } });
    expect(notConnected('x')).toMatch(/identity/);
  });


  it('a direct character with no key loads connected (the key is linked in the game)', () => {
    direct('nix-direct', TWIN);
    const rec = byId('nix-direct');
    expect(rec.info).toMatchObject({ connected: true, connectionError: null });
    expect(rec.direct?.keyName).toBe('openrouter');
  });

  it('openai-compatible without keyName has keyName null; with one, that name', () => {
    direct('local', { ...TWIN, backend: { provider: 'openai-compatible', model: 'a/b', baseUrl: 'http://127.0.0.1:1234/v1' } });
    direct('named', { ...TWIN, backend: { provider: 'openai-compatible', model: 'a/b', baseUrl: 'http://127.0.0.1:1234/v1', keyName: 'lab' } });
    expect(byId('local').direct?.keyName).toBeNull();
    expect(byId('named').direct?.keyName).toBe('lab');
  });

  it('extends an unknown character → not connected', () => {
    direct('x', { ...TWIN, extends: 'ghost' });
    expect(notConnected('x')).toMatch(/extends.*ghost/);
  });

  it('an invalid backend block (temperature 3) → not connected, naming the field', () => {
    direct('x', { ...TWIN, backend: { provider: 'openrouter', model: 'a/b', temperature: 3 } });
    expect(notConnected('x')).toMatch(/temperature/);
  });

  it('openai-compatible needs a baseUrl', () => {
    direct('x', { ...TWIN, backend: { provider: 'openai-compatible', model: 'a/b' } });
    expect(notConnected('x')).toMatch(/baseUrl/);
  });


  it('no AgentInfo field contains the API key', () => {
    direct('nix-direct', TWIN);
    for (const rec of load()) expect(JSON.stringify(rec.info)).not.toContain('sk-or-test');
  });

  it('a direct character inherits bio and facts from the character it extends, and overrides tagline', () => {
    fs.writeFileSync(path.join(charactersDir, 'nix', 'bio.txt'), 'Nix keeps the room.');
    writeNix(({ name: 'Nix', accent: '#ff4f8b', portrait: 'portrait.png', scenePack: 'karasu', instructions: 'instructions.md', ooc: 'ooc.md', bio: 'bio.txt', facts: [{ label: 'Role', value: 'Counselor' }] }),
    );
    direct('nix-direct', { ...TWIN, tagline: 'Her own hook.' });
    const rec = byId('nix-direct').info;
    expect(rec).toMatchObject({ tagline: 'Her own hook.', bio: ['Nix keeps the room.'], facts: [{ label: 'Role', value: 'Counselor' }] });
  });

  it('a direct character that fails to load still has the fallback fields (fail path)', () => {
    direct('x', { name: 'X', backend: { provider: 'openrouter', model: 'a/b' } }); // no identity -> fail()
    const rec = byId('x').info;
    expect(rec).toMatchObject({ tagline: '', bio: [], facts: [], face: { x: 0.5, y: 0.08 }, thumb: null });
  });

  it('a direct character with bio "." (her own folder) still loads, listed, no throw', () => {
    direct('nix-direct', { ...TWIN, bio: '.' });
    expect(() => load()).not.toThrow();
    const rec = byId('nix-direct');
    expect(rec.info.id).toBe('nix-direct');
    expect(rec.info.connected).toBe(true);
  });

});

describe('mindless characters', () => {


  it('a folder that a direct character extends is not listed as mindless (no profiles dir: nix-direct only, no second Nix)', () => {
    // Only nix (a base with no backend of her own) and her direct twin.
    for (const id of ['alpha', 'beta']) fs.rmSync(path.join(charactersDir, id), { recursive: true, force: true });
    fs.writeFileSync(path.join(charactersDir, 'nix', 'character.json'), JSON.stringify({ name: 'Nix', portrait: 'portrait.png' }));
    direct('nix-direct', TWIN);
    const ids = loadAgents({ charactersDir, dataDir, rooms, warn: () => {} }).map((a) => a.info.id);
    expect(ids).toEqual(['nix-direct']);
  });

  it('a malformed character.json in a mindless folder warns "skipping character" and the rest still load', () => {
    fs.mkdirSync(path.join(charactersDir, 'hicks'), { recursive: true });
    fs.writeFileSync(path.join(charactersDir, 'hicks', 'character.json'), '{ not json');
    const ids = load().map((a) => a.info.id);
    expect(ids).not.toContain('hicks');
    expect(ids).toContain('alpha');
    expect(warnings.some((w) => w.includes("skipping character 'hicks'"))).toBe(true);
  });

  it('a folder with no character.json is skipped silently', () => {
    fs.mkdirSync(path.join(charactersDir, 'ghost'), { recursive: true });
    const ids = load().map((a) => a.info.id);
    expect(ids).not.toContain('ghost');
    expect(warnings.some((w) => w.includes('ghost'))).toBe(false);
  });

  it('a folder with an invalid id and a character.json but no backend warns and is skipped', () => {
    fs.mkdirSync(path.join(charactersDir, 'Bad Id'), { recursive: true });
    fs.writeFileSync(path.join(charactersDir, 'Bad Id', 'character.json'), JSON.stringify({ name: 'Bad' }));
    const ids = load().map((a) => a.info.id);
    expect(ids).not.toContain('Bad Id');
    expect(warnings.some((w) => w.includes("skipping character 'Bad Id': not a valid agent id (lowercase letters, digits, - and _)"))).toBe(true);
  });

  it('a mindless character can extend another folder (look inherited, one level)', () => {
    fs.mkdirSync(path.join(charactersDir, 'crew'), { recursive: true });
    fs.writeFileSync(path.join(charactersDir, 'crew', 'character.json'), JSON.stringify({ name: 'Crew', portrait: 'portrait.png', accent: '#112233' }));
    png(path.join(charactersDir, 'crew', 'portrait.png'));
    direct('hicks', { name: 'Hicks', extends: 'crew' });
    const h = byId('hicks');
    expect(h.info).toMatchObject({ backend: 'none', accent: '#112233', avatarKind: 'mask' });
    expect(h.avatarFile).toBe(path.join(charactersDir, 'crew', 'portrait.png'));
  });

  it.each([
    [
      'missing',
      () => {
        direct('hicks', { name: 'Hicks', extends: 'ghost' });
      },
      "character 'hicks': extends: no character 'ghost'",
    ],
    [
      'malformed base',
      () => {
        fs.mkdirSync(path.join(charactersDir, 'ghost'), { recursive: true });
        fs.writeFileSync(path.join(charactersDir, 'ghost', 'character.json'), '{ not json');
        direct('hicks', { name: 'Hicks', extends: 'ghost' });
      },
      "character 'hicks': extends: no character 'ghost'",
    ],
    [
      'two-level base (itself extends another)',
      () => {
        fs.mkdirSync(path.join(charactersDir, 'base2'), { recursive: true });
        fs.writeFileSync(path.join(charactersDir, 'base2', 'character.json'), JSON.stringify({ name: 'Base2' }));
        fs.mkdirSync(path.join(charactersDir, 'ghost'), { recursive: true });
        fs.writeFileSync(path.join(charactersDir, 'ghost', 'character.json'), JSON.stringify({ name: 'Ghost', extends: 'base2' }));
        direct('hicks', { name: 'Hicks', extends: 'ghost' });
      },
      "character 'hicks': extends: 'ghost' itself extends 'base2' (one level only)",
    ],
  ])("extending a folder that is %s warns and loads without the base", (_label, setup, warningSubstring) => {
    setup();
    const h = byId('hicks');
    expect(h.info.backend).toBe('none');
    expect(h.info.name).toBe('Hicks');
    expect(warnings.some((w) => w.includes(warningSubstring))).toBe(true);
  });

});
