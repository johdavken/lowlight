import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPlaythroughs, type LiveDbs, type SaveRequest } from '../src/playthroughs';
import { FIGURE_JSON, FIGURE_PNG, copyFigure, parseFigureMeta, readFigure, type FigureMeta } from '../src/persona-figure';
import { tempDir } from './fixtures/temp-dir';

const META: FigureMeta = { face: { x: 0.5, y: 0.2 }, waist: 0.36, wears: 'a grey coat', model: 'openai/gpt-image-2', made: '2026-11-12T10:00:00.000Z', fields: { hair: 'black' } };

function writeFigure(dir: string, meta: unknown = META, png = true): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FIGURE_JSON), typeof meta === 'string' ? meta : JSON.stringify(meta));
  if (png) fs.writeFileSync(path.join(dir, FIGURE_PNG), 'png');
}

describe('parseFigureMeta', () => {
  it('takes a valid meta and trims wears', () => {
    expect(parseFigureMeta({ ...META, wears: '  a grey coat ' })).toEqual(META);
  });
  it('refuses a face outside 0..1, an empty wears, a missing field', () => {
    expect(parseFigureMeta({ ...META, face: { x: 1.2, y: 0.2 } })).toBeNull();
    expect(parseFigureMeta({ ...META, wears: '  ' })).toBeNull();
    const { waist: _w, ...rest } = META;
    expect(parseFigureMeta(rest)).toBeNull();
  });
});

describe('readFigure', () => {
  it('is null without a folder, with bad json, or without the png', () => {
    const root = tempDir('nix-fig-');
    expect(readFigure(path.join(root, 'none'))).toBeNull();
    writeFigure(path.join(root, 'bad'), '{nope');
    expect(readFigure(path.join(root, 'bad'))).toBeNull();
    writeFigure(path.join(root, 'nopng'), META, false);
    expect(readFigure(path.join(root, 'nopng'))).toBeNull();
    writeFigure(path.join(root, 'face'), { ...META, face: { x: 1.2, y: 0 } });
    expect(readFigure(path.join(root, 'face'))).toBeNull();
  });
  it('reads a valid pair', () => {
    const dir = path.join(tempDir('nix-fig-'), 'persona');
    writeFigure(dir);
    expect(readFigure(dir)).toEqual({ file: path.join(dir, FIGURE_PNG), meta: META });
  });
});

describe('copyFigure', () => {
  it('copies the two files and leaves takes behind', () => {
    const root = tempDir('nix-fig-');
    const from = path.join(root, 'a');
    writeFigure(path.join(from, 'persona'));
    fs.mkdirSync(path.join(from, 'persona', 'takes'));
    fs.writeFileSync(path.join(from, 'persona', 'takes', 't.png'), 'x');
    copyFigure(from, path.join(root, 'b'));
    expect(fs.readdirSync(path.join(root, 'b', 'persona')).sort()).toEqual([FIGURE_JSON, FIGURE_PNG]);
  });
  it('does nothing without a figure', () => {
    const root = tempDir('nix-fig-');
    copyFigure(path.join(root, 'a'), path.join(root, 'b'));
    expect(fs.existsSync(path.join(root, 'b', 'persona'))).toBe(false);
  });
});

const req: SaveRequest = {
  kind: 'manual',
  trigger: 'manual',
  name: 'a save',
  location: { contactId: 'nix', sceneId: 'karasu/noodle-stall' },
  timeOfDay: 'dusk',
  participants: ['nix'],
  lastLine: { speaker: 'Nix', text: 'Say it, then.' },
};
const dbs = (): LiveDbs => new Map([['nix', { vacuumInto: (p: string) => fs.writeFileSync(p, 'db'), fingerprint: () => [1] }]]);

describe('a branch carries the figure', () => {
  function setup() {
    const root = tempDir('nix-pt-');
    let n = 0;
    const pts = createPlaythroughs(root, () => 1, () => String(n++).padStart(4, '0'), () => {});
    const pt = pts.create({ player: 'rue', startContact: 'nix', persona: { name: 'Vee', background: '' } });
    writeFigure(pts.personaDir(pt.id));
    fs.mkdirSync(path.join(pts.personaDir(pt.id), 'takes'));
    fs.writeFileSync(path.join(pts.personaDir(pt.id), 'takes', 't.png'), 'x');
    return { pts, pt };
  }
  it('fork', () => {
    const { pts, pt } = setup();
    const save = pts.save(pt.id, req, dbs());
    if (save === 'unchanged') throw new Error('unchanged');
    const branch = pts.fork(save.id);
    expect(fs.readdirSync(pts.personaDir(branch.id)).sort()).toEqual([FIGURE_JSON, FIGURE_PNG]);
    expect(readFigure(pts.personaDir(branch.id))?.meta).toEqual(META);
  });
  it('copyLive', () => {
    const { pts, pt } = setup();
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = pt;
    const copy = pts.copyLive(pt.id, dbs(), { ...rest, name: 'copy' });
    expect(fs.readdirSync(pts.personaDir(copy.id)).sort()).toEqual([FIGURE_JSON, FIGURE_PNG]);
  });
});
