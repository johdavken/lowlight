import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { awkwardTemp, contentFixture } from './fixture';
import { releaseListSchema, resolveRelease } from './release-list';

describe('resolveRelease', () => {
  let root: string;
  beforeEach(() => {
    root = awkwardTemp('content root');
    contentFixture(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('adds extends bases and notes them', () => {
    const r = resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player' });
    expect(r.characters).toEqual(['b', 'player', 'a']);
    expect(r.notes).toEqual(['copied a as the base of b']);
    expect(r.errors).toEqual([]);
  });

  it('fails a room outside the shipped packs', () => {
    expect(resolveRelease(root, { version: 1, packs: ['p'], characters: ['c', 'player'], defaultPlayer: 'player' }).errors).toEqual(['c: room q/x is not in a shipped pack']);
  });

  it('fails a base whose rooms are outside the shipped packs', () => {
    // b extends a; a's room p/one is fine when p ships, so ship only q to make it fail.
    expect(resolveRelease(root, { version: 1, packs: ['q'], characters: ['b', 'player'], defaultPlayer: 'player' }).errors).toEqual([
      'b: room p/two is not in a shipped pack',
      'a: room p/one is not in a shipped pack',
    ]);
  });

  it('fails a default player that is not shipped, once', () => {
    expect(resolveRelease(root, { version: 1, packs: ['p'], characters: ['a'], defaultPlayer: 'player' }).errors).toEqual(['defaultPlayer player is not a shipped character']);
  });

  it('holds back listed quests, and fails one that is not in world/quests', () => {
    const r = resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player', holdQuests: ['big', 'gone'] });
    expect(r.holdQuests).toEqual(['big']);
    expect(r.errors).toEqual(['holdQuests: unknown quest gone']);
    expect(resolveRelease(root, { version: 1, packs: ['p'], characters: ['b', 'player'], defaultPlayer: 'player' }).holdQuests).toEqual([]);
  });

  it('fails unknown packs and characters', () => {
    expect(resolveRelease(root, { version: 1, packs: ['p', 'nope'], characters: ['a', 'zed'], defaultPlayer: 'a' }).errors).toEqual(['unknown pack nope', 'unknown character zed']);
  });

  it('fails a missing extends base', () => {
    fs.writeFileSync(path.join(root, 'characters/c/character.json'), JSON.stringify({ name: 'C', extends: 'ghost' }));
    expect(resolveRelease(root, { version: 1, packs: ['p'], characters: ['c'], defaultPlayer: 'c' }).errors).toEqual(['c: extends unknown character ghost']);
  });
});

describe('the real release.json', () => {
  it('parses and resolves with no errors, shipping nix as the base of nix-direct', () => {
    const repo = path.join(__dirname, '..', '..');
    const list = releaseListSchema.parse(JSON.parse(fs.readFileSync(path.join(repo, 'release.json'), 'utf8')));
    // The list itself is edited in Studio; what must hold is that it ships the splash, a
    // playable district and the bug-report relay (Studio's BUILD tab has no field for it).
    expect(list.packs).toEqual(expect.arrayContaining(['lowlight', 'karasu']));
    expect(list.characters).toContain('nix-direct');
    // The public repo ships it null (the export blanks it); the official builds carry the relay's address.
    expect(list.bugRelay === null || /^https:\/\/[\w.-]+\.workers\.dev$/.test(list.bugRelay ?? '')).toBe(true);
    const r = resolveRelease(repo, list);
    expect(r.errors).toEqual([]);
    expect(r.characters).toContain('nix');
  });
});

describe('release.json bugRelay', () => {
  const base = { version: 1, packs: ['p'], characters: ['c'], defaultPlayer: 'c' };
  it('is optional and takes an https URL only', () => {
    expect(releaseListSchema.safeParse(base).success).toBe(true);
    expect(releaseListSchema.parse({ ...base, bugRelay: 'https://x.workers.dev' }).bugRelay).toBe('https://x.workers.dev');
    expect(releaseListSchema.safeParse({ ...base, bugRelay: 'http://x.workers.dev' }).success).toBe(false);
    // The public repo's release.json: the export blanks the relay.
    expect(releaseListSchema.parse({ ...base, bugRelay: null }).bugRelay).toBeNull();
    expect(releaseListSchema.safeParse({ ...base, bugRelay: 'not a url' }).success).toBe(false);
  });
});
