import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { exportCast } from './cast-export';

const repo = path.resolve(__dirname, '../..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'st-cast-'));

describe('exportCast (package)', () => {
  it("writes Cass's card, sprites, persona and lore, and cast.json with her places", async () => {
    const out = tmp();
    const { cast } = await exportCast({ repo, data: path.join(repo, 'data'), target: { package: out }, version: '1.0.0', ids: ['cass'] });
    const cass = cast.characters.find((c) => c.id === 'cass')!;
    expect(cass.places).toEqual(expect.arrayContaining(['the-tilt', 'cass-apartment']));
    expect(cass.home).toBe('the-tilt');
    expect(cass.since).toBe('1.0.0');
    expect(fs.existsSync(path.join(out, 'cast', cass.card))).toBe(true);
    expect(Object.keys(cass.sprites)).toEqual(expect.arrayContaining(['neutral', 'joy']));
    expect(cass.persona?.name).toBe('Cass');
    expect(fs.existsSync(path.join(out, 'cast', 'lore', 'Lowlight.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(out, 'cast', 'cast.json'), 'utf8')).version).toBe('1.0.0');
  }, 60_000);

  it('keeps a character\'s "since" from the cast.json already in the package', async () => {
    const out = tmp();
    await exportCast({ repo, data: path.join(repo, 'data'), target: { package: out }, version: '1.0.0', ids: ['cass'] });
    const { cast } = await exportCast({ repo, data: path.join(repo, 'data'), target: { package: out }, version: '1.1.0', ids: ['cass'] });
    expect(cast.characters[0].since).toBe('1.0.0');
    expect(cast.version).toBe('1.1.0');
  }, 60_000);

  it("the card hash leaves out the greeting (it changes whenever the player plays): same card text, same hash", async () => {
    const withData = (await exportCast({ repo, data: path.join(repo, 'data'), target: { package: tmp() }, version: '1.0.0', ids: ['cass'] })).cast.characters[0];
    const without = (await exportCast({ repo, data: tmp(), target: { package: tmp() }, version: '1.0.0', ids: ['cass'] })).cast.characters[0];
    expect(without.hash.card).toBe(withData.hash.card);
  }, 60_000);

  it("hashes follow the art: a changed sprite changes hash.sprites, not hash.card", async () => {
    // A copy of the repo's parts the export reads, so one of Cass's pixels can change.
    const fake = tmp();
    for (const p of ['characters/cass', 'server/src/instructions.ts', 'world/lore', 'scenes/karasu/the-tilt/scene.json']) fs.cpSync(path.join(repo, p), path.join(fake, p), { recursive: true });
    const a = (await exportCast({ repo: fake, data: path.join(fake, 'data'), target: { package: tmp() }, version: '1.0.0', ids: ['cass'] })).cast.characters[0];
    const spriteFile = path.join(fake, 'characters/cass', JSON.parse(fs.readFileSync(path.join(fake, 'characters/cass/character.json'), 'utf8')).sprite.src);
    const img = sharp(spriteFile);
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    data[(600 * info.width + 512) * info.channels] ^= 0xff;
    await sharp(data, { raw: info }).png().toFile(spriteFile + '.tmp');
    fs.renameSync(spriteFile + '.tmp', spriteFile);
    const b = (await exportCast({ repo: fake, data: path.join(fake, 'data'), target: { package: tmp() }, version: '1.0.0', ids: ['cass'] })).cast.characters[0];
    expect(b.hash.sprites).not.toBe(a.hash.sprites);
    expect(b.hash.card).toBe(a.hash.card);
  }, 120_000);
});
