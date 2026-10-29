import { spawn, type ChildProcess } from 'node:child_process';
import { buildWeb } from './build-once';
import { E2E_WORKERS, gamePort } from './ports';

const children: ChildProcess[] = [];
let stopping = false;

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  // Each serve.ts removes its own temp dir on SIGTERM; wait for them before going.
  const alive = children.filter((c) => c.exitCode === null && c.signalCode === null);
  if (alive.length === 0) process.exit(code);
  let left = alive.length;
  for (const c of alive) {
    c.once('exit', () => --left === 0 && process.exit(code));
    c.kill('SIGTERM');
  }
}

/**
 * Playwright's game webServer: builds the page once (if it changed), then starts one e2e/serve.ts
 * per worker, slot 0…E2E_WORKERS-1, each with its own ports, temp world and fake OpenRouter (see
 * e2e/ports.ts). Each server has one active playthrough, so a worker needs a server of
 * its own to run beside the others. Prints `e2e servers ready` once every slot answers, which is
 * what playwright.config.ts waits for.
 */
async function main(): Promise<void> {
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  buildWeb();

  for (let slot = 0; slot < E2E_WORKERS; slot++) {
    const child = spawn(process.execPath, ['--import', 'tsx', 'e2e/serve.ts'], {
      env: { ...process.env, E2E_SLOT: String(slot), E2E_PREBUILT: '1' },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('exit', (code) => {
      if (stopping) return;
      console.error(`e2e server slot ${slot} exited (${code})`);
      stop(1);
    });
    children.push(child);
  }

  const deadline = Date.now() + 90_000;
  for (let slot = 0; slot < E2E_WORKERS; slot++) {
    for (;;) {
      if (stopping) return;
      try {
        if ((await fetch(`http://127.0.0.1:${gamePort(slot)}/api/bootstrap`)).ok) break;
      } catch {
        // not listening yet
      }
      if (Date.now() > deadline) throw new Error(`e2e server slot ${slot} never answered`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  console.log(`e2e servers ready (${E2E_WORKERS})`);
}

main().catch((err) => {
  console.error(err);
  stop(1);
});
