import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UPDATE_EXIT as SHARED_EXIT } from '../shared/update';
import { RESULT_FILE, UPDATE_EXIT, applyUpdate, npmCommand, runIn, type Run } from './play';

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

let root: string;
let pub: string;
let work: string;
let clone: string;
let dataDir: string;

/** Commits `files` in the publisher's checkout and pushes them to the stand-in public repo. */
function publish(files: Record<string, string>, msg: string): string {
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(work, f), text);
  sh(work, 'add', '.');
  sh(work, 'commit', '-qm', msg);
  sh(work, 'push', '-q', pub, 'main');
  return sh(work, 'rev-parse', 'HEAD');
}

/** The clone's real git, with npm faked: `npm` records its args and answers `npmStatus`. */
function runner(npmStatus = 0) {
  const npm: string[][] = [];
  const real = runIn(clone);
  const run: Run = (cmd, args, opts) => {
    if (cmd === 'npm-fake') {
      npm.push(args);
      return { status: npmStatus, out: '' };
    }
    return real(cmd, args, opts);
  };
  return { run, npm };
}
const result = () => JSON.parse(fs.readFileSync(path.join(dataDir, RESULT_FILE), 'utf8')) as Record<string, unknown>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-test-'));
  pub = path.join(root, 'pub.git');
  work = path.join(root, 'work');
  clone = path.join(root, 'clone');
  dataDir = path.join(clone, 'data');
  sh(root, 'init', '-q', '--bare', '-b', 'main', pub);
  fs.mkdirSync(work);
  sh(work, 'init', '-q', '-b', 'main');
  publish({ 'a.txt': 'one\n', 'package-lock.json': '{}\n' }, 'one');
  sh(root, 'clone', '-q', pub, clone);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('applyUpdate', () => {
  it('fast-forwards to public main and notes it, without npm ci when the lockfile stayed', () => {
    const from = sh(clone, 'rev-parse', 'HEAD');
    const to = publish({ 'a.txt': 'two\n' }, 'two');
    const { run, npm } = runner();
    const r = applyUpdate({ run, dataDir, log: () => {}, now: () => 42, npm: ['npm-fake', []] });
    expect(r).toEqual({ ok: true, restart: true, from, to });
    expect(sh(clone, 'rev-parse', 'HEAD')).toBe(to);
    expect(npm).toEqual([]);
    expect(result()).toEqual({ ok: true, from, to, at: 42 });
  });

  it('runs npm ci when the lockfile changed', () => {
    publish({ 'package-lock.json': '{"v":2}\n' }, 'deps');
    const { run, npm } = runner();
    expect(applyUpdate({ run, dataDir, log: () => {}, npm: ['npm-fake', ['/npm-cli.js']] }).ok).toBe(true);
    expect(npm).toEqual([['/npm-cli.js', 'ci']]);
  });

  it('leaves the game down when npm ci fails, rather than start it on broken packages', () => {
    publish({ 'package-lock.json': '{"v":3}\n' }, 'deps');
    const { run } = runner(1);
    const r = applyUpdate({ run, dataDir, log: () => {}, npm: ['npm-fake', []] });
    expect(r).toMatchObject({ ok: false, restart: false });
    expect(result()).toMatchObject({ ok: false, error: 'npm ci failed: run npm ci, then npm run play' });
  });

  it('keeps the player’s edits: git refuses, the old code starts again', () => {
    const from = sh(clone, 'rev-parse', 'HEAD');
    publish({ 'a.txt': 'theirs\n' }, 'two');
    fs.writeFileSync(path.join(clone, 'a.txt'), 'mine\n');
    const { run } = runner();
    const r = applyUpdate({ run, dataDir, log: () => {}, npm: ['npm-fake', []] });
    expect(r).toMatchObject({ ok: false, restart: true, from, to: from });
    expect(r.error).toMatch(/^git refused the update/);
    expect(fs.readFileSync(path.join(clone, 'a.txt'), 'utf8')).toBe('mine\n');
  });

  it('notes a failed fetch and starts the old code again', () => {
    sh(clone, 'remote', 'set-url', 'origin', path.join(root, 'gone.git'));
    const { run } = runner();
    const r = applyUpdate({ run, dataDir, log: () => {}, npm: ['npm-fake', []] });
    expect(r).toMatchObject({ ok: false, restart: true });
    expect(r.error).toMatch(/^couldn't reach GitHub/);
  });
});

describe('the launcher', () => {
  it('exits with the same code the server does for UPDATE', () => {
    expect(UPDATE_EXIT).toBe(SHARED_EXIT);
  });
  it('runs npm through its own entry when npm started it, else plain npm', () => {
    expect(npmCommand({ npm_execpath: '/usr/lib/node_modules/npm/bin/npm-cli.js' })).toEqual([process.execPath, ['/usr/lib/node_modules/npm/bin/npm-cli.js']]);
    expect(npmCommand({})).toEqual(['npm', []]);
  });
});
