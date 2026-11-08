/**
 * `npm run play`: the game for players of a clone (plan 2026-11-08). It runs the server and Vite like
 * `npm run dev` (without watching), and when the player presses UPDATE on the title the server exits with
 * UPDATE_EXIT: this script then fetches public main, fast-forwards, runs `npm ci` when the lockfile changed, notes
 * how it went in data/update-result.json and starts the game again; the open tab reloads itself.
 *
 * It runs on Node's own TypeScript support and imports only node: builtins, because `npm ci` replaces
 * node_modules underneath it. Children are spawned as `node <entry>`, never through a shell, so Windows
 * behaves the same.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Same as shared/update.ts's (this file can't import it); a test keeps them equal. */
export const UPDATE_EXIT = 75;
export const RESULT_FILE = 'update-result.json';

export type Run = (cmd: string, args: string[], opts?: { inherit?: boolean }) => { status: number; out: string };

export function runIn(cwd: string): Run {
  return (cmd, args, opts) => {
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: opts?.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      // npm without npm_execpath (play.ts run by hand): Windows only finds npm.cmd through a shell.
      shell: cmd === 'npm' && process.platform === 'win32',
    });
    return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
  };
}

/** npm's own entry when npm started us (no shell needed), else plain `npm`. */
export function npmCommand(env: NodeJS.ProcessEnv = process.env): [string, string[]] {
  const entry = env.npm_execpath;
  return entry && /\.(c?js|mjs)$/.test(entry) ? [process.execPath, [entry]] : ['npm', []];
}

export interface Applied {
  ok: boolean;
  /** Start the game again: false only when packages are left broken. */
  restart: boolean;
  from: string;
  to: string;
  error?: string;
}

const lastLines = (s: string, n = 3) => s.split('\n').filter(Boolean).slice(-n).join(' / ');

/** Fetch public main, fast-forward to it, `npm ci` if the lockfile changed, and write data/update-result.json. */
export function applyUpdate(o: { run: Run; dataDir: string; log(line: string): void; now?: () => number; npm?: [string, string[]] }): Applied {
  const { run, log } = o;
  const head = () => run('git', ['rev-parse', 'HEAD']).out;
  const from = head();
  const done = (a: Applied): Applied => {
    try {
      fs.mkdirSync(o.dataDir, { recursive: true });
      const note = { ok: a.ok, from: a.from, to: a.to, at: (o.now ?? Date.now)(), ...(a.error ? { error: a.error } : {}) };
      fs.writeFileSync(path.join(o.dataDir, RESULT_FILE), `${JSON.stringify(note, null, 2)}\n`);
    } catch (err) {
      log(`[update] couldn't write ${RESULT_FILE}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return a;
  };

  log('[update] fetching the public repo…');
  const fetched = run('git', ['fetch', 'origin', 'main']);
  if (fetched.status !== 0) return done({ ok: false, restart: true, from, to: from, error: `couldn't reach GitHub: ${lastLines(fetched.out)}` });

  const merged = run('git', ['merge', '--ff-only', 'origin/main']);
  if (merged.status !== 0) return done({ ok: false, restart: true, from, to: from, error: `git refused the update: ${lastLines(merged.out)}` });
  const to = head();
  log(`[update] ${from.slice(0, 8)} → ${to.slice(0, 8)}`);

  const changed = run('git', ['diff', '--name-only', from, to]).out.split('\n');
  if (changed.includes('package-lock.json')) {
    log('[update] new packages: npm ci (this takes a few minutes)…');
    const [cmd, pre] = o.npm ?? npmCommand();
    const ci = run(cmd, [...pre, 'ci'], { inherit: true });
    if (ci.status !== 0) {
      log('[update] npm ci failed. Run `npm ci`, then `npm run play`.');
      return done({ ok: false, restart: false, from, to, error: 'npm ci failed: run npm ci, then npm run play' });
    }
  }
  return done({ ok: true, restart: true, from, to });
}

const stop = (c: ChildProcess) => {
  if (c.exitCode === null && c.signalCode === null) c.kill();
};

/** The server and Vite, until the server exits; resolves with its exit code (or Vite's, if it went first). */
function runGame(repo: string, running: ChildProcess[], stopping: () => boolean): Promise<number> {
  const env = { ...process.env, LOWLIGHT_LAUNCHER: '1' };
  const node = (args: string[]) => spawn(process.execPath, args, { cwd: repo, env, stdio: 'inherit', windowsHide: true });
  // tsx as a loader, not its CLI: the CLI runs the server as its own child, which a kill on Windows
  // (TerminateProcess, no signal to relay) would leave running on the port.
  const server = node(['--import', 'tsx', 'server/src/main.ts']);
  const vite = node([path.join(repo, 'node_modules/vite/bin/vite.js')]);
  running.splice(0, running.length, server, vite);
  // Each child's exit, listened for once at spawn: a listener added after it exited would never fire.
  const exited = (c: ChildProcess) => new Promise<number>((resolve) => c.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  const serverExit = exited(server);
  const viteExit = exited(vite);
  void viteExit.then((code) => {
    if (server.exitCode === null && server.signalCode === null) {
      if (!stopping()) console.error(`[play] vite stopped (${code}); closing the game`);
      stop(server);
    }
  });
  return serverExit.then(async (code) => {
    stop(vite);
    const viteCode = await viteExit;
    if (stopping() && code !== UPDATE_EXIT) return 0;
    // Vite went first and took the server down: its code says what happened.
    return code === UPDATE_EXIT || viteCode === 0 ? code : viteCode;
  });
}

async function main(): Promise<void> {
  const repo = process.cwd();
  // The server reads .env (dotenv); DATA_DIR and the ports must agree with it here.
  try {
    process.loadEnvFile(path.join(repo, '.env'));
  } catch {
    // No .env: the defaults.
  }
  const dataDir = path.resolve(repo, process.env.DATA_DIR ?? 'data');
  let stopping = false;
  const running: ChildProcess[] = [];
  // Ctrl+C reaches the children from the terminal too; a signal sent to this process alone is passed on, so
  // the game never outlives its launcher. Either way they close, then this leaves.
  const onSignal = () => {
    stopping = true;
    for (const c of running) stop(c);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  for (;;) {
    console.log(`[play] Lowlight: open http://localhost:${process.env.VITE_PORT || 5173} once it's up. Ctrl+C stops it.`);
    const code = await runGame(repo, running, () => stopping);
    if (code !== UPDATE_EXIT || stopping) process.exit(code);
    const r = applyUpdate({ run: runIn(repo), dataDir, log: (l) => console.log(l) });
    if (!r.ok) console.error(`[update] ${r.error}`);
    if (!r.restart) process.exit(1);
  }
}

// Run as a script, not imported by a test. import.meta.main is Node 24.2+; the path check covers 24.0–24.1.
const isMain = (import.meta as { main?: boolean }).main ?? import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) void main();
