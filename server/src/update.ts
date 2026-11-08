/**
 * The title screen's UPDATE (plan 2026-11-08). Only a clone of the public repo on branch main is eligible: never
 * the private dev repo, the packaged app (no git) or a test server. The check asks GitHub's compare API rather
 * than fetching, because every fetch counts as a clone on the repo's Traffic page; the launcher fetches once,
 * when the player presses UPDATE. The server's part ends at exiting with UPDATE_EXIT: tools/play.ts does the rest.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { UpdateInfo, UpdateResult, UpdateStatus } from '../../shared/update';

/** The public repo (owner/name): the one place it's spelled, for the export's leak check. */
export const PUBLIC_REPO = 'johdavken/lowlight';
const escaped = PUBLIC_REPO.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const PUBLIC_REMOTE = new RegExp(`^(https://github\\.com/|git@github\\.com:|ssh://git@github\\.com/)${escaped}(\\.git)?/?$`, 'i');
const CHECK_TTL_MS = 30 * 60_000;
/** A failed check (offline, rate-limited) waits less before the next try, but still waits. */
const FAIL_TTL_MS = 5 * 60_000;
const API_TIMEOUT_MS = 10_000;
/** GitHub lists at most this many files in a compare. */
const FILES_CAP = 300;
export const RESULT_FILE = 'update-result.json';

/** Runs git in the game folder and returns its trimmed stdout; rejects when git fails or isn't there. */
export type Git = (args: string[]) => Promise<string>;

export function gitIn(dir: string): Git {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile('git', args, { cwd: dir, timeout: 10_000, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
    });
}

export const isPublicRemote = (url: string): boolean => PUBLIC_REMOTE.test(url.trim());

const same = (a: string, b: string): boolean => {
  const real = (p: string) => {
    const r = fs.realpathSync(path.resolve(p));
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  try {
    return real(a) === real(b);
  } catch {
    return false;
  }
};

/** `dir` is the top of a clone of the public repo, on main. */
export async function eligible(dir: string, git: Git): Promise<boolean> {
  try {
    const [top, url, branch] = await Promise.all([
      git(['rev-parse', '--show-toplevel']),
      git(['config', '--get', 'remote.origin.url']),
      git(['symbolic-ref', '--short', 'HEAD']),
    ]);
    return same(top, dir) && isPublicRemote(url) && branch === 'main';
  } catch {
    return false;
  }
}

const NONE: UpdateStatus = { available: false, behind: 0, newestAt: null, areas: { characters: 0, rooms: 0, world: 0, code: 0 }, needsPackages: false, canApply: false };

interface Compare {
  status?: string;
  ahead_by?: number;
  commits?: { commit?: { committer?: { date?: string } } }[];
  files?: { filename?: string }[];
}

export function areaOf(file: string): keyof UpdateStatus['areas'] {
  const top = file.split('/')[0];
  return top === 'characters' ? 'characters' : top === 'scenes' ? 'rooms' : top === 'world' ? 'world' : 'code';
}

/** What GitHub's compare of `head`...main says, with the player's edits and launcher taken into account. */
export function statusFrom(c: Compare, edited: string[], launcher: boolean): UpdateStatus {
  const behind = c.ahead_by ?? 0;
  // HEAD...main: "ahead" means main has commits we lack; "diverged", that we have some of our own too.
  if (behind === 0 || (c.status !== 'ahead' && c.status !== 'diverged')) return NONE;
  const files = (c.files ?? []).map((f) => f.filename ?? '').filter(Boolean);
  const areas = { characters: 0, rooms: 0, world: 0, code: 0 };
  for (const f of files) areas[areaOf(f)]++;
  const dated = (c.commits ?? []).map((x) => Date.parse(x.commit?.committer?.date ?? '')).filter((n) => !Number.isNaN(n));
  const touched = new Set(files);
  const clash = edited.filter((f) => touched.has(f));
  const base = {
    available: true,
    behind,
    newestAt: dated.length > 0 ? Math.max(...dated) : null,
    areas,
    // A cut list may hide the lockfile: assume it changed.
    needsPackages: touched.has('package-lock.json') || files.length >= FILES_CAP,
  };
  if (c.status === 'diverged') return { ...base, canApply: false, reason: 'diverged' };
  if (clash.length > 0) return { ...base, canApply: false, reason: 'local-edits', files: clash };
  if (!launcher) return { ...base, canApply: false, reason: 'launcher' };
  return { ...base, canApply: true };
}

export interface CheckDeps {
  git: Git;
  /** Run by `npm run play` (LOWLIGHT_LAUNCHER=1). */
  launcher: boolean;
  /** https://api.github.com, or a stub for a live check (LOWLIGHT_UPDATE_API). */
  apiBase: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Checks GitHub at most every 30 min per HEAD (5 after a failure); a new HEAD checks again. */
export function updateChecker(deps: CheckDeps): () => Promise<UpdateStatus> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let cached: { head: string; at: number; ttl: number; status: UpdateStatus } | null = null;
  return async () => {
    let head: string;
    try {
      head = await deps.git(['rev-parse', 'HEAD']);
    } catch {
      return NONE;
    }
    if (cached && cached.head === head && now() - cached.at < cached.ttl) return cached.status;
    let status = NONE;
    let ttl = FAIL_TTL_MS;
    try {
      const res = await doFetch(`${deps.apiBase}/repos/${PUBLIC_REPO}/compare/${head}...main`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'lowlight-game' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (res.ok) {
        const edited = (await deps.git(['diff', '--name-only', 'HEAD']).catch(() => '')).split('\n').filter(Boolean);
        status = statusFrom((await res.json()) as Compare, edited, deps.launcher);
        ttl = CHECK_TTL_MS;
      } else if (res.status === 404) {
        // HEAD isn't on GitHub (a commit of the player's own): nothing we can say.
        ttl = CHECK_TTL_MS;
      }
    } catch {
      // Offline or timed out: no tile.
    }
    cached = { head, at: now(), ttl, status };
    return status;
  };
}

/** The launcher's note on its last update, or null. */
export function lastUpdate(dataDir: string): UpdateResult | null {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dataDir, RESULT_FILE), 'utf8')) as Partial<UpdateResult>;
    if (typeof r.ok !== 'boolean' || typeof r.at !== 'number') return null;
    return { ok: r.ok, from: String(r.from ?? ''), to: String(r.to ?? ''), at: r.at, ...(typeof r.error === 'string' ? { error: r.error } : {}) };
  } catch {
    return null;
  }
}

export interface UpdateDeps {
  /** The game folder (the server's cwd). */
  repoDir: string;
  dataDir: string;
  git?: Git;
  launcher: boolean;
  apiBase?: string;
  fetch?: typeof fetch;
  originAllowed(origin: string | undefined): boolean;
  /** Close the game and exit with UPDATE_EXIT; only under the launcher. */
  exitForUpdate?: () => void;
}

export function registerUpdateRoutes(app: FastifyInstance, deps: UpdateDeps | null): void {
  const git = deps ? (deps.git ?? gitIn(deps.repoDir)) : null;
  // Decided once: the remote and branch don't change while the game runs (an update keeps both).
  const isEligible = deps && git ? eligible(deps.repoDir, git) : Promise.resolve(false);
  const check = deps && git ? updateChecker({ git, launcher: deps.launcher, apiBase: deps.apiBase ?? 'https://api.github.com', fetch: deps.fetch }) : null;

  app.get('/api/update', async (): Promise<UpdateInfo> => {
    if (!deps || !check || !(await isEligible)) return { eligible: false };
    return { eligible: true, status: await check(), last: lastUpdate(deps.dataDir) };
  });

  app.post('/api/update', async (req, reply) => {
    if (!deps || !check) return reply.code(409).send({ error: 'not a public clone' });
    if (!deps.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    if (!(await isEligible)) return reply.code(409).send({ error: 'not a public clone' });
    const status = await check();
    if (!status.available) return reply.code(409).send({ error: 'nothing to update' });
    if (!status.canApply || !deps.exitForUpdate) return reply.code(409).send({ error: status.reason ?? 'launcher' });
    const exit = deps.exitForUpdate;
    // Answer first: the page waits for the game to come back.
    setTimeout(exit, 200);
    return reply.code(202).send({ ok: true });
  });
}
