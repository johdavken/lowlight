import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Writes `files` (relative path → contents) under `root`. */
export function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
}

/** A temp folder whose name has a space and a non-ASCII letter, as a Windows user folder can. */
export function awkwardTemp(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name} ö-`));
}

const scene = (id: string) => JSON.stringify({ id, name: id });

/**
 * A small content tree: packs p (one, two) and q (x); characters a (rooms p/one), b (extends a,
 * rooms p/two), c (rooms q/x), player (no rooms); lore with a history folder; quests small and big (with art
 * and a history folder), leads, extras, gear and crew; art/scenes with an
 * .md and a glow-lock.
 */
export function contentFixture(root: string): void {
  writeTree(root, {
    'scenes/p/one/scene.json': scene('one'),
    'scenes/p/two/scene.json': scene('two'),
    'scenes/p/_music/Song (Remastered).ogg': 'ogg',
    'scenes/q/x/scene.json': scene('x'),
    'characters/a/character.json': JSON.stringify({ name: 'A', rooms: ['p/one'] }),
    'characters/a/a.png': 'png',
    'characters/b/character.json': JSON.stringify({ name: 'B', extends: 'a', rooms: ['p/two'] }),
    'characters/c/character.json': JSON.stringify({ name: 'C', rooms: ['q/x'] }),
    'characters/player/character.json': JSON.stringify({ name: 'Player' }),
    'map/lowlight.json': '{}',
    'map/history/old.json': '{}',
    'map/city/districts/marsh.json': '{"blackout":{"outage":0.25}}',
    'map/city/structures/ribbon.json': '{}',
    'world/lore/city.md': '# City',
    'world/lore/history/old.md': '# Old',
    'world/gigs/job.md': '# Job',
    'world/standing.json': '{}',
    'world/papers/origins.json': '[]',
    'world/papers/faces/o40-01.jpg': 'jpg',
    'world/gigs/history/old.md': '# Old',
    'world/splash/splashes.json': '{}',
    'world/splash/pic.png': 'png',
    'world/districts/karasu.webp': 'webp',
    'world/leads/lead.md': '# Lead',
    'world/quests/small.md': '# Small',
    'world/quests/big.md': '# Big',
    'world/quests/art/small.webp': 'webp',
    'world/quests/history/old.md': '# Old',
    'world/extras/face.png': 'png',
    'world/gear/decks.md': '# Decks',
    'world/crew/names.md': '# Names',
    'world/splash/history/old.png': 'png',
    'art/scenes/one.md': '# One',
    'art/scenes/one.glow-lock.json': '{}',
    'art/work/huge.kra': 'kra',
    'sounds/CREDITS.md': '# Credits',
  });
}
