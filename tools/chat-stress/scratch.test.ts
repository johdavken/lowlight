import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { alive, cleanup, cleanupDetached, listenerInode, pgidOf, portFree, stopGroup, whoListens } from './scratch';

const servers: net.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** A listener on a free port on 127.0.0.1, as the scratch server binds. */
async function listen(): Promise<number> {
  const s = net.createServer();
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return (s.address() as net.AddressInfo).port;
}

it('deletes the copies after a run and keeps the results, without touching what node_modules links to', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-stress-'));
  const repoModules = fs.mkdtempSync(path.join(os.tmpdir(), 'modules-'));
  fs.writeFileSync(path.join(repoModules, 'keep.js'), '');
  fs.mkdirSync(path.join(out, 'src', 'server'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src', 'server', 'main.ts'), '');
  fs.symlinkSync(repoModules, path.join(out, 'src', 'node_modules'));
  fs.mkdirSync(path.join(out, 'data', 'playthroughs'), { recursive: true });
  fs.writeFileSync(path.join(out, 'data', 'playthroughs', 'room.db'), 'x');
  const results = ['report.md', 'transcript.md', 'turns.jsonl', 'trace.jsonl', 'server.log'];
  for (const f of results) fs.writeFileSync(path.join(out, f), 'x');

  cleanup(out);
  expect(fs.readdirSync(out).sort()).toEqual([...results].sort());
  expect(fs.existsSync(path.join(repoModules, 'keep.js'))).toBe(true);
  cleanup(out); // nothing left to delete: no throw
  cleanup(path.join(out, 'never-made')); // a run that died before prepare
});

it('finishes deleting the copies after the process that asked is killed (npx kills the runner mid-exit)', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-stress-'));
  for (let i = 0; i < 200; i++) fs.mkdirSync(path.join(out, 'src', `d${i}`), { recursive: true });
  fs.mkdirSync(path.join(out, 'data'));
  fs.writeFileSync(path.join(out, 'report.md'), 'x');
  const scratch = path.join(import.meta.dirname, 'scratch.ts');
  const code = `import { cleanupDetached } from ${JSON.stringify(scratch)}; cleanupDetached(${JSON.stringify(out)}); process.kill(process.pid, 'SIGKILL');`;
  spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code]);
  for (let i = 0; i < 100 && fs.readdirSync(out).length > 1; i++) await new Promise((r) => setTimeout(r, 50));
  expect(fs.readdirSync(out)).toEqual(['report.md']);
});

it('tells a free port from a busy one', async () => {
  const port = await listen();
  expect(await portFree(port)).toBe(false);
  servers.splice(0).forEach((s) => s.close());
  await new Promise((r) => setTimeout(r, 50));
  expect(await portFree(port)).toBe(true);
});

it("finds a port's listening socket in /proc/net/tcp, not its connections", () => {
  const tcp = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:1E32 0100007F:9C40 01 00000000:00000000 00:00000000 00000000  1000        0 555 1 0 100 0 0 10 0',
    '   1: 0100007F:1E32 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 20348886 1 0 100 0 0 10 0',
    '   2: 0100007F:1E14 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 777 1 0 100 0 0 10 0',
  ].join('\n');
  expect(listenerInode(tcp, 7730)).toBe('20348886');
  expect(listenerInode(tcp, 7700)).toBe('777');
  expect(listenerInode(tcp, 7710)).toBeNull();
});

it("reads the process group from /proc/<pid>/stat, though the command's name holds spaces and parens", () => {
  expect(pgidOf('4242 (npm exec (tsx) x) S 4200 4210 4210 0 -1 4194560 ...')).toBe(4210);
  expect(pgidOf('')).toBeNull();
});

it.skipIf(!fs.existsSync('/proc/net/tcp'))('names the process listening on a port', async () => {
  const port = await listen();
  expect(whoListens(port)).toEqual([process.pid]);
  servers.splice(0).forEach((s) => s.close());
  await new Promise((r) => setTimeout(r, 50));
  expect(whoListens(port)).toEqual([]);
});

it('stops a whole process group, and kills one that ignores SIGTERM', async () => {
  const polite = spawn('sh', ['-c', 'sleep 60 & wait'], { detached: true, stdio: 'ignore' });
  const stubborn = spawn('sh', ['-c', 'trap "" TERM; sleep 60 & while true; do sleep 1; done'], { detached: true, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 200));
  expect(alive(polite.pid!)).toBe(true);
  expect(alive(stubborn.pid!)).toBe(true);

  await stopGroup(polite.pid!, 2000);
  expect(alive(polite.pid!)).toBe(false);
  await stopGroup(stubborn.pid!, 300);
  expect(alive(stubborn.pid!)).toBe(false);
  await stopGroup(stubborn.pid!, 300); // already gone: no throw
});
