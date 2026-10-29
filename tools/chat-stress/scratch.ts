/**
 * The chat stress run's scratch copy and server: checking the port is free, knowing the server that
 * answers is ours, stopping it on every way out, and deleting the copies afterwards.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/** What a run leaves in `<out>` to delete: the exported commit (with its node_modules link) and the data copy. */
const COPIES = ['src', 'data'];

/** Deletes the copies in `<out>`; the report, transcript, turns, trace and server log stay. */
export function cleanup(out: string): void {
  // rmSync removes the node_modules symlink itself, never the repo's modules it points at.
  for (const dir of COPIES) fs.rmSync(path.join(out, dir), { recursive: true, force: true });
}

/**
 * Deletes the copies from a process of its own, which finishes even when the caller is killed: for exit
 * handlers. Under npx the runner is killed while its exit handler still runs, mid-way through a 140 MB delete.
 */
export function cleanupDetached(out: string): void {
  const dirs = COPIES.map((dir) => path.join(out, dir)).filter((dir) => fs.existsSync(dir));
  if (dirs.length === 0) return;
  spawn('rm', ['-rf', '--', ...dirs], { detached: true, stdio: 'ignore' }).unref();
}

/** Whether nothing listens on 127.0.0.1:`port` (where the scratch server binds). */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

/** The inode of the socket listening on `port` in a /proc/net/tcp listing (null: none). */
export function listenerInode(tcp: string, port: number): string | null {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  for (const line of tcp.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    // local_address is f[1], st is f[3] (0A = LISTEN), inode is f[9].
    if (f[1]?.endsWith(`:${hex}`) && f[3] === '0A') return f[9] ?? null;
  }
  return null;
}

/** The process group in a /proc/<pid>/stat line (null: unreadable). The name in parens may hold anything. */
export function pgidOf(stat: string): number | null {
  const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  // After the name: state, ppid, pgrp.
  const pgid = Number(rest[2]);
  return stat.includes(')') && Number.isInteger(pgid) ? pgid : null;
}

function read(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** The pids holding the socket listening on 127.0.0.1:`port` (Linux; empty when none or no /proc). */
export function whoListens(port: number): number[] {
  const inode = listenerInode(read('/proc/net/tcp'), port);
  if (!inode) return [];
  const socket = `socket:[${inode}]`;
  const pids: number[] = [];
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      if (fs.readdirSync(`/proc/${pid}/fd`).some((fd) => fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === socket)) pids.push(Number(pid));
    } catch {
      /* gone, or not ours to read */
    }
  }
  return pids;
}

/** Whether `pid` belongs to process group `pgid`. */
export function inGroup(pid: number, pgid: number): boolean {
  return pgidOf(read(`/proc/${pid}/stat`)) === pgid;
}

/** Whether anything is left in process group `pgid`. */
export function alive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills process group `pgid` at once: for exit handlers, which can't wait. */
export function killGroup(pgid: number): void {
  try {
    process.kill(-pgid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

/** Asks process group `pgid` to stop, and kills it if it is still there after `graceMs`. */
export async function stopGroup(pgid: number, graceMs: number): Promise<void> {
  try {
    process.kill(-pgid, 'SIGTERM');
  } catch {
    return;
  }
  for (const end = Date.now() + graceMs; Date.now() < end; ) {
    if (!alive(pgid)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  killGroup(pgid);
  for (let i = 0; i < 40 && alive(pgid); i++) await new Promise((r) => setTimeout(r, 50));
}
