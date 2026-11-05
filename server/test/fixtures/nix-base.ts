import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Nix as she was until 2026-11-02: a mindless base `nix` (bio, facts, room notes, rooms) and `nix-direct`
 * extending it with her mind and her own art. The cast's only `extends`, so tests of `extends` lay her
 * down from here: the files in fixtures/nix-base/, the art from the live characters/nix-direct.
 */
const FIXTURE = path.join(__dirname, 'nix-base');
const LIVE = path.join(__dirname, '..', '..', '..', 'characters', 'nix-direct');
const MOVED = ['bio.md', 'instructions.md', 'ooc.md'];

/** Writes `nix` and `nix-direct` (extending it) into a characters folder. */
export function writeNixBase(charactersDir: string): void {
  const direct = path.join(charactersDir, 'nix-direct');
  fs.cpSync(LIVE, direct, { recursive: true });
  for (const f of MOVED) fs.rmSync(path.join(direct, f), { force: true });
  fs.copyFileSync(path.join(FIXTURE, 'nix-direct', 'character.json'), path.join(direct, 'character.json'));

  const base = path.join(charactersDir, 'nix');
  fs.cpSync(path.join(FIXTURE, 'nix'), base, { recursive: true });
  for (const f of fs.readdirSync(LIVE).filter((f) => f.endsWith('.png')))
    fs.copyFileSync(path.join(LIVE, f), path.join(base, f.replace(/^nix-direct-/, 'nix-')));
}

let shared: string | null = null;
/** One read-only characters folder holding both, for tests that only read them. */
export function nixBaseDir(): string {
  if (!shared) {
    shared = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-base-'));
    writeNixBase(shared);
  }
  return shared;
}
