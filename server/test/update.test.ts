import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PUBLIC_REPO, RESULT_FILE, eligible, gitIn, isPublicRemote, lastUpdate, registerUpdateRoutes, statusFrom, updateChecker } from '../src/update';

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();
const PUBLIC_URL = `https://github.com/${PUBLIC_REPO}.git`;

let root: string;
/** A bare stand-in for the public repo, and a clone of it whose origin reads as the public URL. */
let pub: string;
let clone: string;
let plain: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-test-'));
  pub = path.join(root, 'pub.git');
  const work = path.join(root, 'work');
  sh(root, 'init', '-q', '--bare', '-b', 'main', pub);
  fs.mkdirSync(work);
  sh(work, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
  sh(work, 'add', '.');
  sh(work, 'commit', '-qm', 'one');
  sh(work, 'push', '-q', pub, 'main');
  clone = path.join(root, 'clone');
  sh(root, 'clone', '-q', pub, clone);
  sh(clone, 'remote', 'set-url', 'origin', PUBLIC_URL);
  sh(clone, 'config', `url.${pub}.insteadOf`, PUBLIC_URL);
  plain = path.join(root, 'plain');
  fs.mkdirSync(plain);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const compare = (o: Record<string, unknown> = {}) => ({
  status: 'ahead',
  ahead_by: 2,
  behind_by: 0,
  commits: [{ commit: { committer: { date: '2026-11-07T10:00:00Z' } } }, { commit: { committer: { date: '2026-11-08T10:00:00Z' } } }],
  files: [{ filename: 'characters/hae/bio.md' }, { filename: 'scenes/strand/x/scene.json' }, { filename: 'server/src/app.ts' }, { filename: 'README.md' }],
  ...o,
});
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('isPublicRemote', () => {
  it('takes the public repo over https and ssh, with or without .git', () => {
    for (const u of [`https://github.com/${PUBLIC_REPO}`, PUBLIC_URL, `${PUBLIC_URL}/`, `git@github.com:${PUBLIC_REPO}.git`, `ssh://git@github.com/${PUBLIC_REPO}`]) {
      expect(isPublicRemote(u), u).toBe(true);
    }
  });
  it('refuses forks, the dev repo and look-alikes', () => {
    for (const u of [`https://github.com/${PUBLIC_REPO}-dev.git`, 'https://github.com/someone/lowlight.git', `https://gitlab.com/${PUBLIC_REPO}.git`, `https://github.com/${PUBLIC_REPO}.git.evil`]) {
      expect(isPublicRemote(u), u).toBe(false);
    }
  });
});

describe('eligible', () => {
  it('is a public clone on main', async () => {
    expect(await eligible(clone, gitIn(clone))).toBe(true);
  });
  it('is not another branch, a folder outside git, or a machine without git', async () => {
    sh(clone, 'checkout', '-q', '-b', 'mine');
    expect(await eligible(clone, gitIn(clone))).toBe(false);
    sh(clone, 'checkout', '-q', 'main');
    expect(await eligible(plain, gitIn(plain))).toBe(false);
    expect(await eligible(clone, () => Promise.reject(new Error('ENOENT')))).toBe(false);
  });
  it('is not a subfolder of the clone (the game runs from its top)', async () => {
    const sub = path.join(clone, 'sub');
    fs.mkdirSync(sub, { recursive: true });
    expect(await eligible(sub, gitIn(sub))).toBe(false);
  });
});

describe('statusFrom', () => {
  it('counts the changes by area and dates the newest', () => {
    const s = statusFrom(compare(), [], true);
    expect(s).toMatchObject({ available: true, behind: 2, canApply: true, needsPackages: false, areas: { characters: 1, rooms: 1, world: 0, code: 2 } });
    expect(s.newestAt).toBe(Date.parse('2026-11-08T10:00:00Z'));
  });
  it('has nothing when main has nothing new', () => {
    expect(statusFrom(compare({ status: 'identical', ahead_by: 0 }), [], true).available).toBe(false);
    expect(statusFrom(compare({ status: 'behind', ahead_by: 0, behind_by: 3 }), [], true).available).toBe(false);
  });
  it('needs packages when the lockfile changed, or when the list was cut', () => {
    expect(statusFrom(compare({ files: [{ filename: 'package-lock.json' }] }), [], true).needsPackages).toBe(true);
    const many = Array.from({ length: 300 }, (_, i) => ({ filename: `web/f${i}.ts` }));
    expect(statusFrom(compare({ files: many }), [], true).needsPackages).toBe(true);
  });
  it('says why it cannot apply: own commits, then edits in the way, then no launcher', () => {
    expect(statusFrom(compare({ status: 'diverged', behind_by: 1 }), ['README.md'], false)).toMatchObject({ canApply: false, reason: 'diverged' });
    expect(statusFrom(compare(), ['README.md', 'notes.txt'], false)).toMatchObject({ canApply: false, reason: 'local-edits', files: ['README.md'] });
    expect(statusFrom(compare(), ['notes.txt'], false)).toMatchObject({ canApply: false, reason: 'launcher' });
  });
});

describe('updateChecker', () => {
  it('asks GitHub to compare HEAD with main, once per HEAD per half hour', async () => {
    let now = 1_000_000;
    const fetch = answer(compare());
    const check = updateChecker({ git: gitIn(clone), launcher: true, apiBase: 'https://api.test', fetch: fetch as unknown as typeof globalThis.fetch, now: () => now });
    const head = sh(clone, 'rev-parse', 'HEAD');
    expect((await check()).behind).toBe(2);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(`https://api.test/repos/${PUBLIC_REPO}/compare/${head}...main`);
    await check();
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 31 * 60_000;
    await check();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('sees the player’s edits to files the update changes', async () => {
    fs.writeFileSync(path.join(clone, 'a.txt'), 'mine\n');
    try {
      const check = updateChecker({ git: gitIn(clone), launcher: true, apiBase: 'x', fetch: answer(compare({ files: [{ filename: 'a.txt' }] })) as unknown as typeof fetch });
      expect(await check()).toMatchObject({ canApply: false, reason: 'local-edits', files: ['a.txt'] });
    } finally {
      sh(clone, 'checkout', '--', 'a.txt');
    }
  });
  it('shows nothing when GitHub fails or doesn’t know HEAD, and waits before asking again', async () => {
    let now = 0;
    const down = vi.fn(async () => {
      throw new Error('offline');
    });
    const check = updateChecker({ git: gitIn(clone), launcher: true, apiBase: 'x', fetch: down as unknown as typeof fetch, now: () => now });
    expect((await check()).available).toBe(false);
    await check();
    expect(down).toHaveBeenCalledTimes(1);
    now += 6 * 60_000;
    await check();
    expect(down).toHaveBeenCalledTimes(2);
    const unknown = updateChecker({ git: gitIn(clone), launcher: true, apiBase: 'x', fetch: answer({ message: 'Not Found' }, 404) as unknown as typeof fetch });
    expect((await unknown()).available).toBe(false);
  });
});

describe('lastUpdate', () => {
  it('reads the launcher’s note, and nothing from a missing or broken one', () => {
    const dir = fs.mkdtempSync(path.join(root, 'data-'));
    expect(lastUpdate(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, RESULT_FILE), 'not json');
    expect(lastUpdate(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, RESULT_FILE), JSON.stringify({ ok: false, from: 'a', to: 'a', at: 5, error: 'git refused' }));
    expect(lastUpdate(dir)).toEqual({ ok: false, from: 'a', to: 'a', at: 5, error: 'git refused' });
  });
});

describe('/api/update', () => {
  const build = async (o: { launcher: boolean; exit?: () => void; deps?: boolean; dir?: string }) => {
    const app = Fastify();
    const dataDir = fs.mkdtempSync(path.join(root, 'data-'));
    registerUpdateRoutes(
      app,
      o.deps === false
        ? null
        : {
            repoDir: o.dir ?? clone,
            dataDir,
            launcher: o.launcher,
            apiBase: 'x',
            fetch: answer(compare()) as unknown as typeof fetch,
            originAllowed: (origin) => origin === undefined || origin === 'http://localhost:5173',
            exitForUpdate: o.exit,
          },
    );
    await app.ready();
    return app;
  };

  it('says not eligible without update deps or outside a public clone, and refuses the press', async () => {
    for (const app of [await build({ launcher: true, deps: false }), await build({ launcher: true, dir: plain })]) {
      expect((await app.inject({ method: 'GET', url: '/api/update' })).json()).toEqual({ eligible: false });
      expect((await app.inject({ method: 'POST', url: '/api/update' })).statusCode).toBe(409);
    }
  });

  it('answers a public clone with the status and the last result', async () => {
    const app = await build({ launcher: true });
    const body = (await app.inject({ method: 'GET', url: '/api/update' })).json();
    expect(body).toMatchObject({ eligible: true, status: { available: true, behind: 2, canApply: true }, last: null });
  });

  it('refuses a press from another site, and one without the launcher', async () => {
    const exit = vi.fn();
    const app = await build({ launcher: true, exit });
    expect((await app.inject({ method: 'POST', url: '/api/update', headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
    const dev = await build({ launcher: false });
    const res = await dev.inject({ method: 'POST', url: '/api/update' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'launcher' });
    expect(exit).not.toHaveBeenCalled();
  });

  it('answers 202 and then closes the game for the launcher', async () => {
    const exit = vi.fn();
    const app = await build({ launcher: true, exit });
    const res = await app.inject({ method: 'POST', url: '/api/update', headers: { origin: 'http://localhost:5173' } });
    expect(res.statusCode).toBe(202);
    expect(exit).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 300));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
