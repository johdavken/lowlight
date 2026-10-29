/**
 * The bug report's routes (spec 2026-10-11 bug report §4.3): the panel posts here, the server builds the
 * report and sends it to the relay; when it can't (no relay in this build, offline, refused, too many),
 * the report is zipped into the reports folder instead, so nothing the player wrote is lost. The reporter
 * is used when something is already broken, so nothing here may cost the player their description: a
 * screenshot too big is left out, and game state that can't be read becomes a note.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildReport, readLogTail, zipReport, type BugState } from './bug-report';

const RELAY_TIMEOUT_MS = 15_000;
const SCREENSHOT_MAX = 3 * 1024 * 1024;
/** The relay's cap (tools/bug-relay MAX_BODY), less some room. */
const RELAY_MAX = 4 * 1024 * 1024 - 16 * 1024;
/** Above a screenshot's cap, so a too-big one is left out rather than the whole report refused. */
const BODY_LIMIT = 16 * 1024 * 1024;

export const REASONS = {
  noRelay: 'no report address in this build',
  unreachable: "couldn't reach the report server",
  limited: 'too many reports this hour',
  refused: 'the report server refused it',
} as const;

export interface BugDeps {
  relayUrl: string | null;
  logFile: string | null;
  reportsDir: string;
  /** The game's version and test-build tag, for when `state()` fails. */
  version?: string;
  build?: string | null;
  /** Keys to scrub: the player's OpenRouter key, when set. */
  keys(): string[];
  state(includeTurns: boolean): Promise<BugState>;
  /** For the title-screen panel: the playthrough last played and whether it has turns. */
  context(): { playthroughName: string | null; hasTurns: boolean };
  originAllowed(origin: string | undefined): boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const bodySchema = z.object({
  description: z.string().max(4000).refine((s) => s.trim().length > 0),
  contact: z.string().max(200),
  includeTurns: z.boolean(),
  screenshot: z.string().nullable(),
});

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Writes `data` as bug-report-<stamp>.zip, or -2, -3… when a report this second already has the name. */
function saveZip(dir: string, data: Uint8Array): string {
  fs.mkdirSync(dir, { recursive: true });
  const base = `bug-report-${stamp(new Date())}`;
  for (let n = 1; ; n++) {
    const file = path.join(dir, n === 1 ? `${base}.zip` : `${base}-${n}.zip`);
    try {
      fs.writeFileSync(file, data, { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 100) throw err;
    }
  }
}

export function registerBugReportRoutes(app: FastifyInstance, deps: BugDeps): void {
  const doFetch = deps.fetch ?? fetch;

  /** What a report says when the game's state can't be read. */
  const fallbackState = (): BugState => ({
    version: deps.version ?? 'unknown',
    build: deps.build ?? null,
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    runtime: `Node ${process.versions.node}`,
    playthrough: null,
    room: null,
    present: [],
    models: {},
    clock: null,
    turns: [],
  });

  app.get('/api/bug-report/context', async () => deps.context());

  app.post('/api/bug-report', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
    if (!deps.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad report' });

    const input = { ...parsed.data };
    const notes: string[] = [];
    if (input.screenshot && input.screenshot.length > SCREENSHOT_MAX) {
      input.screenshot = null;
      notes.push('screenshot left out: too big');
    }
    let state: BugState;
    try {
      state = await deps.state(input.includeTurns);
    } catch (err) {
      state = fallbackState();
      notes.push(`game state unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
    const logTail = readLogTail(deps.logFile);
    let report = buildReport(input, state, logTail, deps.keys(), notes);
    if (JSON.stringify(report).length > RELAY_MAX && input.screenshot) {
      report = buildReport({ ...input, screenshot: null }, state, logTail, deps.keys(), [...notes, 'screenshot left out: report too big']);
    }

    let reason: string = REASONS.noRelay;
    if (deps.relayUrl) {
      try {
        // No redirects: a captive portal's login page answers 200 to anything.
        const res = await doFetch(deps.relayUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(report),
          redirect: 'error',
          signal: AbortSignal.timeout(deps.timeoutMs ?? RELAY_TIMEOUT_MS),
        });
        const answer = (await res.json().catch(() => null)) as { ok?: unknown } | null;
        if (res.ok && answer?.ok === true) return { sent: true };
        reason = res.status === 429 ? REASONS.limited : REASONS.refused;
      } catch {
        reason = REASONS.unreachable;
      }
    }

    try {
      const file = saveZip(deps.reportsDir, zipReport(report));
      console.warn(`[bug-report] not sent (${reason}); saved ${file}`);
      return { sent: false, reason, file };
    } catch (err) {
      console.error(`[bug-report] not sent (${reason}) and not saved:`, err);
      return { sent: false, reason, file: null };
    }
  });
}
