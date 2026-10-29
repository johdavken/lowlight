/**
 * A bug report (spec 2026-10-11 bug report §4.3): what the player wrote, the game's state, the tail of
 * server.log and, if the player allows, the scene's last turns and a screenshot. Every string that leaves
 * passes through `scrub`, so the player's OpenRouter key never goes out, even pasted into chat or a log.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import type { RelayReport } from '../../tools/bug-relay/worker';

export const LOG_TAIL_LINES = 200;
/** How much of the end of server.log is read to find its last lines: also the tail's cap, so a report fits the relay's 4 MB. */
const LOG_WINDOW = 256 * 1024;
const SUBJECT_MAX = 60;
const REMOVED = '[key removed]';
const OPENROUTER_KEY_RE = /sk-or-[A-Za-z0-9-]+/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BugInput {
  description: string;
  contact: string;
  includeTurns: boolean;
  /** A base64 PNG, or null. */
  screenshot: string | null;
}

export interface BugState {
  version: string;
  build: string | null;
  /** `${platform} ${release} ${arch}` */
  os: string;
  /** `Node x · Electron y` (Electron only when present). */
  runtime: string;
  playthrough: { id: string; name: string } | null;
  room: { sceneId: string; contactId: string } | null;
  /** Ids of who's in the room. */
  present: string[];
  /** Character id → model id. */
  models: Record<string, string>;
  /** The story clock, formatted. */
  clock: string | null;
  /** Already the last 10, oldest first. */
  turns: { speaker: string; text: string }[];
}

/** Replaces each of `keys` and anything shaped like an OpenRouter key with `[key removed]`. */
export function scrub(s: string, keys: string[]): string {
  let out = s.replace(OPENROUTER_KEY_RE, REMOVED);
  for (const k of keys) if (k) out = out.split(k).join(REMOVED);
  return out;
}

/** The last `lines` lines of `file`, read from its end only; `(no log file)` when there is none. */
export function readLogTail(file: string | null, lines = LOG_TAIL_LINES): string {
  if (!file) return '(no log file)';
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return '(no log file)';
  }
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, LOG_WINDOW);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let all = buf.toString('utf8').split('\n');
    // The window's first line is cut: drop it, unless it's all there is (one huge line), which stays cut.
    if (len < size && all.length > 1) all = all.slice(1);
    if (all.at(-1) === '') all.pop();
    return all.slice(-lines).join('\n');
  } finally {
    fs.closeSync(fd);
  }
}

function subjectLine(version: string, description: string): string {
  const first = description.trim().split('\n')[0].trim();
  const cut = first.length > SUBJECT_MAX ? `${first.slice(0, SUBJECT_MAX)}…` : first;
  return `[Lowlight ${version}] ${cut}`;
}

/** The last `limit` finished turns of a contact's database, read-only (no runtime is built for a report). [] without one. */
export function readTurns(file: string, player: string, names: { player: string; contact: string }, limit = 10): BugState['turns'] {
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db
      .prepare("SELECT role, text FROM messages WHERE player = ? AND status = 'ok' ORDER BY ts DESC, rowid DESC LIMIT ?")
      .all(player, limit) as { role: string; text: string }[];
    return rows.reverse().map((r) => ({ speaker: r.role === 'user' ? names.player : names.contact, text: r.text }));
  } finally {
    db.close();
  }
}

/** `notes`: what the server couldn't include, and why (a screenshot left out, state it couldn't read). */
export function buildReport(input: BugInput, state: BugState, logTail: string, keys: string[], notes: string[] = []): RelayReport {
  const s = (t: string) => scrub(t, keys);
  const contact = input.contact.trim();
  const models = Object.entries(state.models).map(([id, m]) => `  ${id}: ${m}`);
  const lines = [
    input.description.trim(),
    '',
    `Contact: ${contact || '(none)'}`,
    '',
    '— Game —',
    `Version: ${state.version}${state.build ? ` (${state.build})` : ''}`,
    `OS: ${state.os}`,
    `Runtime: ${state.runtime}`,
    `Playthrough: ${state.playthrough ? `${state.playthrough.name} (${state.playthrough.id})` : '(none)'}`,
    `Room: ${state.room ? `${state.room.sceneId}, with ${state.room.contactId}` : '(none)'}`,
    `Here: ${state.present.length ? state.present.join(', ') : '(nobody)'}`,
    `Story clock: ${state.clock ?? '(none)'}`,
    'Models:',
    ...(models.length ? models : ['  (none)']),
    ...notes.map((n) => `Note: ${n}`),
  ];
  if (input.includeTurns && state.turns.length) {
    lines.push('', '— Last turns —', ...state.turns.map((t) => `${t.speaker}: ${t.text}`));
  }

  const attachments: RelayReport['attachments'] = [];
  if (input.screenshot) attachments.push({ filename: 'screenshot.png', content: input.screenshot });
  attachments.push({ filename: 'server-log.txt', content: Buffer.from(s(logTail), 'utf8').toString('base64') });

  const replyTo = EMAIL_RE.test(contact) && !s(contact).includes(REMOVED) ? contact : undefined;
  return {
    subject: s(subjectLine(state.version, s(input.description))),
    text: s(lines.join('\n')),
    ...(replyTo ? { replyTo } : {}),
    attachments,
  };
}

/** report.txt (subject + text) and the attachments, decoded. */
export function zipReport(report: RelayReport): Uint8Array {
  const files: Record<string, Uint8Array> = { 'report.txt': strToU8(`${report.subject}\n\n${report.text}\n`) };
  for (const a of report.attachments) files[a.filename] = new Uint8Array(Buffer.from(a.content, 'base64'));
  return zipSync(files);
}
