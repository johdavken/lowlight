/**
 * The game starting (2026-11-16): the dial-in waits for the game server before it asks for anything. Right after
 * `npm run play` starts it, or restarts it for an UPDATE, the server and Vite are cold, and the splash's and theme's
 * short timeouts fell back to the built-in logo and an empty roster: the game looked broken. Now a server that
 * answers at once shows nothing; one that doesn't puts up THE GAME IS STARTING, on the trace, until it answers.
 */
import './server-gate.css';

/** Answers within this show no screen at all. */
export const GATE_QUIET_MS = 400;
/** Between tries while it's starting. */
export const GATE_RETRY_MS = 1000;
/** One try's own limit: a cold server can be slow to answer its first call. */
const TRY_TIMEOUT_MS = 4000;

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** m:ss since the screen went up. */
const since = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/**
 * Resolves once the game server answers (`/api/agents`, which the dial-in needs first anyway). Shows the starting
 * screen in `host` when it hasn't answered within GATE_QUIET_MS, and takes it away when it does.
 */
export async function waitForGame(host: HTMLElement, o: { fetchImpl?: typeof fetch; now?: () => number } = {}): Promise<void> {
  const get = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const tryOnce = async (): Promise<boolean> => {
    try {
      return (await get('/api/agents', { signal: AbortSignal.timeout(TRY_TIMEOUT_MS) })).ok;
    } catch {
      return false;
    }
  };
  let screen: HTMLElement | null = null;
  let shownAt = 0;
  let clock: ReturnType<typeof setInterval> | null = null;
  const show = () => {
    if (screen) return;
    shownAt = now();
    screen = el('div', 'game-starting');
    screen.setAttribute('role', 'status');
    const time = el('div', 'gs-time', '0:00');
    screen.append(el('div', 'gs-word', 'LOWLIGHT'), el('div', 'gs-line', 'THE GAME IS STARTING'), time);
    host.append(screen);
    clock = setInterval(() => (time.textContent = since(now() - shownAt)), 1000);
  };
  // The first try races the quiet window: a quick answer never shows the screen.
  const quiet = setTimeout(show, GATE_QUIET_MS);
  let up = await tryOnce();
  while (!up) {
    show();
    await new Promise((r) => setTimeout(r, GATE_RETRY_MS));
    up = await tryOnce();
  }
  clearTimeout(quiet);
  if (clock) clearInterval(clock);
  (screen as HTMLElement | null)?.remove();
}
