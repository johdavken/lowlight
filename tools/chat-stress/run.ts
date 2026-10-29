/**
 * The chat stress test (`npm run chat-stress`): plays a scripted night with every contact on a scratch
 * server and reports what went wrong — failed calls, repeats, cut-off replies, tool talk, actions written
 * but not done. Run it after any change to what the characters are told, their tools or the turn loop.
 *
 * It exports a commit (default HEAD) with `git archive`, builds it, and serves it from a copy of `data/`
 * on its own port, so the game and Studio you have running are never touched. Every turn is a real call
 * on the linked OpenRouter key: the report says what the run cost.
 *
 *   npm run chat-stress                         all contacts, every turn (60 turns)
 *   npm run chat-stress -- --contacts cass,ember --turns 3
 *   npm run chat-stress -- --ref my-branch      a branch or commit instead of HEAD
 *   npm run chat-stress -- --keep               keep the src/ and data/ copies for debugging
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { earlierOf, flagsOf, summary, type Expect, type TurnRecord } from './analyze';
import { cleanup, cleanupDetached, inGroup, killGroup, portFree, stopGroup, whoListens } from './scratch';
import { traceLines, waitForResidual } from './trace';

interface Script {
  contacts: { id: string; player: string }[];
  turns: { text: string; mode?: 'rp' | 'ooc'; expect?: Expect }[];
}

const REPO = path.resolve(import.meta.dirname, '..', '..');
const TURN_TIMEOUT_MS = 180_000;
/** How long a finished turn waits for its Residual to finish before it's recorded (the Residual's own limit is 60 s). */
const RESIDUAL_WAIT_LIMIT_MS = 65_000;
/** The game's and Studio's ports: never these. */
const TAKEN = new Set([7700, 7710]);

function args(argv: string[]): { ref: string; contacts: string[] | null; turns: number | null; port: number; out: string; script: string; keep: boolean } {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const port = Number(get('port') ?? 7730);
  if (TAKEN.has(port)) throw new Error(`port ${port} is the game's or Studio's; pick another`);
  return {
    ref: get('ref') ?? 'HEAD',
    contacts: get('contacts')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
    turns: get('turns') ? Number(get('turns')) : null,
    port,
    out: path.resolve(get('out') ?? path.join(os.tmpdir(), `chat-stress-${stamp}`)),
    script: path.resolve(get('script') ?? path.join(import.meta.dirname, 'turns.json')),
    keep: argv.includes('--keep'),
  };
}

function run(cmd: string, argv: string[], cwd: string): void {
  const r = spawnSync(cmd, argv, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} failed: ${r.stderr?.toString().slice(-500)}`);
}

/** The commit's files in `<out>/src` (with the repo's node_modules), built; a copy of data/ in `<out>/data`. */
function prepare(o: ReturnType<typeof args>): { src: string; data: string } {
  const src = path.join(o.out, 'src');
  const data = path.join(o.out, 'data');
  fs.mkdirSync(src, { recursive: true });
  const archive = spawnSync('git', ['archive', o.ref], { cwd: REPO, maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Error(`git archive ${o.ref} failed: ${archive.stderr.toString()}`);
  const untar = spawnSync('tar', ['-x', '-C', src], { input: archive.stdout });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr.toString()}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(src, 'node_modules'));
  fs.cpSync(path.join(REPO, 'data'), data, { recursive: true });
  run('npx', ['vite', 'build'], src);
  return { src, data };
}

/** Who holds a port, for the error that says it is taken. */
function holders(port: number): string {
  const pids = whoListens(port);
  if (pids.length === 0) return 'another process';
  return pids.map((pid) => `pid ${pid} (${fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim().slice(0, 120)})`).join(', ');
}

/** Throws unless what listens on the port is the server this run spawned (its process group). */
function mine(port: number, server: ChildProcess): void {
  if (!fs.existsSync('/proc/net/tcp')) return; // no /proc: the free-port check before spawning has to do
  const pids = whoListens(port);
  if (pids.length === 0 || !pids.every((pid) => inGroup(pid, server.pid!))) {
    throw new Error(`port ${port} is answered by ${holders(port)}, not this run's server; see server.log`);
  }
}

async function waitUp(base: string, port: number, server: ChildProcess): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('the scratch server exited; see server.log');
    try {
      if ((await fetch(base)).ok) return mine(port, server);
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the scratch server did not come up in 60 s; see server.log');
}

/** The linked key's remaining credit, as the game reads it (null: unknown). */
async function credit(base: string, origin: Record<string, string>): Promise<number | null> {
  try {
    const link = (await (await fetch(`${base}/api/link`, { headers: origin })).json()) as { credit?: unknown };
    return typeof link.credit === 'number' ? link.credit : null;
  } catch {
    return null;
  }
}

/** One turn over the room's websocket, as the page sends it; her reply and the tool calls it made. */
async function turn(base: string, origin: Record<string, string>, trace: string, contact: string, t: Script['turns'][number]): Promise<Omit<TurnRecord, 'contact' | 'turn' | 'you' | 'expect'>> {
  const from = fs.existsSync(trace) ? fs.statSync(trace).size : 0;
  const started = Date.now();
  const { token } = (await (await fetch(`${base}/api/bootstrap`, { headers: origin })).json()) as { token: string };
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/${contact}?token=${encodeURIComponent(token)}`, { headers: origin });
  const mode = t.mode ?? 'rp';
  return new Promise((resolve) => {
    let sent = false;
    let streaming: string | null = null;
    let settled = false;
    const finish = (end: TurnRecord['end'], status: string | null, text: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Her last calls may land just after the reply closes; the Residual's writes come after it (scribe spec), so a
      // finished in-character turn waits for its run-end line, so its writes count for this turn and not the next.
      const residualRuns = end === 'end' && status === 'ok' && mode !== 'ooc';
      void (residualRuns ? waitForResidual(trace, from, RESIDUAL_WAIT_LIMIT_MS) : new Promise((r) => setTimeout(r, 1500))).then(() => {
        ws.close();
        resolve({ mode, end, status, text, calls: traceLines(trace, from), ms: Date.now() - started });
      });
    };
    const timer = setTimeout(() => finish('timeout', null, ''), TURN_TIMEOUT_MS);
    ws.on('open', () =>
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'user_message', text: t.text, ...(mode === 'ooc' ? { mode: 'ooc' } : {}) }));
        sent = true;
      }, 800),
    );
    ws.on('message', (d) => {
      if (!sent) return;
      const e = JSON.parse(String(d)) as { type: string; message?: { id: string; role: string; status: string; text: string } };
      if (e.type === 'turn_rejected') finish('rejected', null, '');
      if (e.type !== 'message' || !e.message || e.message.role === 'user') return;
      if (e.message.status === 'streaming') streaming = e.message.id;
      else if (streaming === null || streaming === e.message.id) finish('end', e.message.status, e.message.text);
    });
    ws.on('error', () => finish('rejected', null, ''));
  });
}

async function main(): Promise<void> {
  const o = args(process.argv.slice(2));
  const script = JSON.parse(fs.readFileSync(o.script, 'utf8')) as Script;
  const contacts = o.contacts ? script.contacts.filter((c) => o.contacts!.includes(c.id)) : script.contacts;
  if (contacts.length === 0) throw new Error(`no contacts match ${o.contacts?.join(', ')}; the script has ${script.contacts.map((c) => c.id).join(', ')}`);
  const turns = script.turns.slice(0, o.turns ?? undefined);
  console.log(`chat stress: ${o.ref} · ${contacts.length} contacts × ${turns.length} turns · ${o.out}`);

  // A server left by an earlier run would answer every turn from files that are gone.
  if (!(await portFree(o.port))) {
    throw new Error(`port ${o.port} is taken by ${holders(o.port)}. A chat stress run left behind? Stop it, or pass --port.`);
  }
  // However the run ends (done, thrown, Ctrl-C, killed): stop the server, then delete the copies it ran on.
  // The delete runs on its own: npx kills the runner while this handler still runs.
  let server: ChildProcess | null = null;
  process.on('exit', () => {
    if (server?.pid) killGroup(server.pid);
    if (!o.keep) cleanupDetached(o.out);
  });
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) process.on(signal, () => process.exit(code));

  const { src, data } = prepare(o);
  const trace = path.join(o.out, 'trace.jsonl');
  const log = fs.openSync(path.join(o.out, 'server.log'), 'w');
  server = spawn('npx', ['tsx', 'server/src/main.ts'], {
    cwd: src,
    env: { ...process.env, NODE_ENV: 'production', NIX_ROOM_PORT: String(o.port), DATA_DIR: data, NIX_TOOL_TRACE: trace },
    stdio: ['ignore', log, log],
    detached: true,
  });
  // The server and its children are one process group (detached), so they stop together.

  const base = `http://127.0.0.1:${o.port}`;
  const origin = { Origin: base };
  await waitUp(base, o.port, server);
  const before = await credit(base, origin);

  const records: TurnRecord[] = [];
  const transcript: string[] = [];
  for (const c of contacts) {
    const res = await fetch(`${base}/api/playthroughs`, {
      method: 'POST',
      headers: { ...origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: c.player, startContact: c.id, name: `STRESS ${c.id}` }),
    });
    if (!res.ok) throw new Error(`playthrough for ${c.id}: HTTP ${res.status} ${await res.text()}`);
    transcript.push(`## ${c.id} (played as ${c.player})`);
    for (const [i, t] of turns.entries()) {
      const r: TurnRecord = { contact: c.id, turn: i + 1, you: t.text, ...(t.expect ? { expect: t.expect } : {}), ...(await turn(base, origin, trace, c.id, t)) };
      records.push(r);
      const flags = flagsOf(r, earlierOf(records, r));
      process.stdout.write(`  ${c.id} T${r.turn} ${(r.ms / 1000).toFixed(0)}s ${flags.length ? flags.map((f) => f.kind).join(', ') : 'ok'}\n`);
      transcript.push(
        `### T${r.turn} [${r.mode}] ${t.text}`,
        r.text || '(no reply)',
        ...r.calls.map((k) => `- \`${k.name} ${k.args.slice(0, 160)}\` → ${k.out.slice(0, 160).replace(/\n/g, ' ')}`),
        ...flags.map((f) => `- **${f.kind}** ${f.detail}`),
      );
    }
  }
  const after = await credit(base, origin);
  await stopGroup(server.pid!, 5000);
  if (!o.keep) cleanup(o.out);

  const cost = before !== null && after !== null ? `$${(before - after).toFixed(2)} (credit $${after.toFixed(2)} left)` : 'unknown';
  const flagged = records.flatMap((r) => flagsOf(r, earlierOf(records, r)).map((f) => `- ${r.contact} T${r.turn} **${f.kind}** ${f.detail}`));
  const report = [`# Chat stress · ${o.ref} · ${new Date().toISOString().slice(0, 16)}`, '', `Cost: ${cost}`, '', summary(records), '', '## Flagged', '', ...(flagged.length ? flagged : ['none'])].join('\n');
  fs.writeFileSync(path.join(o.out, 'report.md'), `${report}\n`);
  fs.writeFileSync(path.join(o.out, 'transcript.md'), `${transcript.join('\n\n')}\n`);
  fs.writeFileSync(path.join(o.out, 'turns.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const copies = o.keep ? `the src/ and data/ copies are kept (--keep)` : `the src/ and data/ copies are deleted (--keep keeps them)`;
  console.log(`\n${report}\n\nreport.md, transcript.md and turns.jsonl are in ${o.out}; ${copies}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
