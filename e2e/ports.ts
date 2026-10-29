import fs from 'node:fs';

/**
 * The e2e run's servers and ports. A game server has one active playthrough, so each Playwright
 * worker gets a server of its own (e2e/serve-all.ts starts them): slot N for worker N. This file
 * imports nothing of the app's, so playwright.config.ts can read it too.
 */

/**
 * The browsers draw WebGL on this machine's GPU when it has one (a DRM render node), else in
 * software (swiftshader). `E2E_GPU=0` or `1` forces it. Software draws every room on the CPU, and
 * several software browsers at once slow each other into timeouts, so it keeps to one worker.
 */
export const E2E_GPU = process.env.E2E_GPU ? process.env.E2E_GPU === '1' : fs.existsSync('/dev/dri/renderD128');

/**
 * Workers, and so game servers, per run: 6 on the GPU (8 was barely faster), 1 in software.
 * `E2E_WORKERS=n npm run e2e` changes it; not `--workers`, which would outrun the servers.
 */
export const E2E_WORKERS = Math.max(1, Math.floor(Number(process.env.E2E_WORKERS)) || (E2E_GPU ? 6 : 1));

/**
 * This process's slot: a spec's worker index (Playwright sets TEST_PARALLEL_INDEX before it loads
 * the config or a spec), E2E_SLOT in a serve.ts that serve-all.ts started, else 0.
 */
export const SLOT = Number(process.env.TEST_PARALLEL_INDEX ?? process.env.E2E_SLOT ?? 0);

/**
 * Moves every port of the run, Studio's too: `E2E_PORT_OFFSET=200` lets a second checkout (a
 * worktree) run its e2e while another's is going. 0 by default.
 */
const OFFSET = Math.floor(Number(process.env.E2E_PORT_OFFSET)) || 0;

/** Slot `s`'s ports sit 10 apart; slot 0 at offset 0 keeps the ports a one-server run always had. */
export const gamePort = (s = SLOT): number => OFFSET + 7799 + 10 * s;
/** The fake OpenRouter's request log (every chat this slot's server makes). */
export const STUB_OR_LOG_PORT = OFFSET + 7797 + 10 * SLOT;
/** The fake bug-report relay (e2e/bug-report.spec.ts): POST takes a report, GET lists what it took. */
export const BUG_RELAY_PORT = OFFSET + 7796 + 10 * SLOT;
/** Scene Studio's e2e server (one per run: studio.spec stays on one worker). */
export const STUDIO_PORT = OFFSET + 7711;
/** Tells a run's temp files apart from another checkout's running beside it. */
export const RUN_TAG = OFFSET ? `-${OFFSET}` : '';
