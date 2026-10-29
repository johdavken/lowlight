import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelEvent } from '../../shared/types';
import type { Match } from '../src/room/identity';
import { COPY } from '../src/landing/copy';
import { ApiError, type PlaythroughApi } from '../src/net/playthroughs';
import { mountLanding, POLL_MS, type AgentsResponse, type LandingAgent, type LandingApi } from '../src/landing/landing';
import type { LinkError, LinkInfo } from '../src/net/link';

const agent = (o: Partial<LandingAgent> & { id: string; name: string }): LandingAgent => ({
  pronoun: 'she', description: `${o.name} desc`, accent: '#ff4f8b', avatarKind: 'mask', rooms: ['default/workspace'], startRoom: 'default/workspace', legacyDistrict: null, group: null, backend: 'direct', modelLabel: null, connectionError: null,
  connected: false, link: 'unknown', room: null, recaps: {}, sprite: null,
  tagline: '', bio: [], facts: [], face: { x: 0.5, y: 0.08 }, thumb: null, start: null, ...o,
});
/** The roster: ?random, nix (direct, connected), hicks (no mind). */
const crew: AgentsResponse = {
  agents: [
    agent({ id: 'hicks', name: 'Hicks', backend: 'none' }),
    agent({ id: 'nix', name: 'Nix', backend: 'direct', modelLabel: 'GLM 5.2', connected: true, link: 'ok', rooms: ['ribbon/lowlight-intake'], startRoom: 'ribbon/lowlight-intake' }),
  ],
};
/** A bigger cast: ?random, dixie, nix (connected), case (not connected), hicks (no mind). */
const cast: AgentsResponse = {
  agents: [
    ...crew.agents,
    agent({ id: 'dixie', name: 'Dixie', modelLabel: 'GLM 5.2', connected: true, link: 'ok' }),
    agent({ id: 'case', name: 'Case' }),
  ],
};
const catalog: ModelEvent = {
  type: 'model',
  model: 'z-ai/glm-5.2',
  provider: 'openrouter',
  label: 'GLM 5.2',
  choices: [
    { id: 'z-ai/glm-5.2', label: 'GLM 5.2', priceIn: 1, priceOut: 2 },
    { id: 'moonshot/kimi-k3', label: 'Kimi K3', priceIn: 1, priceOut: 2 },
  ],
};
/** The in-game link's routes, linked and answering. */
const linkApi = () => ({
  link: vi.fn(async (): Promise<LinkInfo> => ({ linked: true, last4: '3f9a', credit: 4.12, state: 'ok' })),
  putLink: vi.fn(async (): Promise<LinkInfo | { error: LinkError }> => ({ linked: true, last4: '3f9a', credit: 4.12, state: 'ok' })),
  deleteLink: vi.fn(async () => {}),
  searchModels: vi.fn(async () => ({ picks: catalog.choices!, recent: [], results: [] })),
});
const preview = () => ({ show: vi.fn(async () => {}), showSplash: vi.fn(async () => true), nonBlank: vi.fn(() => true), frameSize: vi.fn((): [number, number] => [480, 270]), glitch: vi.fn(async () => {}), dispose: vi.fn() });
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const keys = (...ks: string[]) => ks.forEach(key);
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

const handles: { dispose(): void }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  for (const h of handles.splice(0)) h.dispose();
  vi.useRealTimers();
});

interface MountOpts {
  data?: AgentsResponse;
  agents?: () => Promise<AgentsResponse>;
  api?: Partial<LandingApi>;
  splash?: boolean;
  needsSound?: boolean;
  reducedMotion?: boolean;
  match?: Match;
  beforeNav?: () => Promise<void>;
  onRestore?: () => void;
  /** Pass a splash host without opening on the splash (a return visit). */
  splashHost?: boolean;
  /** Wrap the roster fetch in a spy (returned as `agents`). */
  agentsSpy?: boolean;
  /** The title menu's playthrough api (save/load); defaults to one with no playthroughs (only NEW GAME). */
  title?: PlaythroughApi;
  /** Without a splash, stay on the title instead of picking NEW GAME. */
  atTitle?: boolean;
  /** The splash's picked art. */
  splashArt?: import('../src/landing/splash').SplashArt;
}
/** No playthroughs yet: the title offers only NEW GAME, and a dial-in's createPlaythrough succeeds. */
const noPlaythroughs = () =>
  ({
    listPlaythroughs: vi.fn(async () => ({ active: null, playthroughs: [] })),
    createPlaythrough: vi.fn(async (player: string, startContact: string) => ({ id: 'pt-1', player, startContact })),
    contacts: vi.fn(async () => []),
    persona: vi.fn(async () => null),
    setLocation: vi.fn(),
    around: vi.fn(async () => []),
    listSaves: vi.fn(async () => []),
  }) as unknown as PlaythroughApi & Record<'listPlaythroughs' | 'createPlaythrough', ReturnType<typeof vi.fn>>;
const titleOpts = () => ({ api: noPlaythroughs(), sound: vi.fn() });
const titling = () => document.querySelector('.landing')!.classList.contains('titling');
const titleItems = () => [...document.querySelectorAll<HTMLElement>('.title-menu .tile')].map((i) => i.dataset.id);

/**
 * Mounts the landing. Without a splash (or `atTitle`) it picks NEW GAME on the title, so the test
 * starts on P1; with one, the test dismisses it and picks NEW GAME itself.
 */
async function mount(o: MountOpts = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  if (o.match) localStorage.setItem('lowlight.lastMatch', JSON.stringify(o.match));
  const nav = vi.fn();
  const pv = preview();
  const agents = o.agentsSpy ? vi.fn(async () => o.data ?? crew) : null;
  const api = {
    agents: agents ?? o.agents ?? (async () => o.data ?? crew),
    packScenes: async () => ({ base: '/scenes/default/', scenes: [] }),
    models: vi.fn(async () => catalog),
    setModel: vi.fn(async () => {}),
    ...linkApi(),
    ...o.api,
  };
  const onSplashDismiss = vi.fn();
  const onIntroGlitch = vi.fn();
  const onSplashReturn = vi.fn();
  const onCue = vi.fn();
  const sound = vi.fn();
  const title = (o.title ?? noPlaythroughs()) as ReturnType<typeof noPlaythroughs>;
  const handle = mountLanding(document.getElementById('root')!, api, nav, pv, {
    splash: o.splash ? { host: document.body, reducedMotion: o.reducedMotion ?? false, needsSound: o.needsSound ?? false } : undefined,
    reducedMotion: o.reducedMotion,
    onSplashDismiss,
    onIntroGlitch,
    onCue,
    onSplashReturn,
    splashHost: o.splashHost || o.splash ? document.body : undefined,
    splashArt: o.splashArt,
    beforeNav: o.beforeNav,
    onRestore: o.onRestore,
    title: { api: title, sound },
  });
  handles.push(handle);
  await handle.ready.catch(() => {});
  await tick();
  if (!o.splash && !o.atTitle) key('Enter'); // NEW GAME
  return { nav, pv, api, handle, onSplashDismiss, onIntroGlitch, onCue, onSplashReturn, agents, sound, title };
}

const phase = () => document.querySelector<HTMLElement>('[data-phase]')?.dataset.phase;
const tileIds = () => [...document.querySelectorAll<HTMLElement>('.tile[data-id]')].map((t) => t.dataset.id);
const hot = () => [...document.querySelectorAll<HTMLElement>('.tile.hot')].map((t) => t.dataset.id);
/** The model panel's rows (model step), or the strip's confirmed model (ready). */
const modelRows = () => [...document.querySelectorAll('.model-panel .mp-row .mp-label')].map((m) => m.textContent);
const modelOn = () => document.querySelector('.model-panel .mp-row.on .mp-label')?.textContent;
const confirmedModel = () => [...document.querySelectorAll('.fighter.p2 .models .m')].map((m) => m.textContent);
const name = (side: 'p1' | 'p2') => document.querySelector(`.fighter.${side} .name`)?.textContent;
const storedMatch = () => JSON.parse(localStorage.getItem('lowlight.lastMatch') ?? 'null');

/** From p1 on ?random: hicks as the player, nix as the AI, then MODEL with its list loaded. */
async function toModel() {
  keys('ArrowRight', 'ArrowRight', 'Enter', 'Enter'); // p1 → hicks, YOU → PLAY AS HICKS
  keys('ArrowLeft', 'Enter'); // p2 → nix
  await tick();
}
/** In the model panel: Enter picks the row under the cursor (saved at once), and on to READY. */
async function pick() {
  key('Enter');
  await tick();
}

describe('character select', () => {
  it('first visit: splash, then the title, then NEW GAME glitches in p1 with tiles RANDOM + roster order', async () => {
    const { nav, pv, onSplashDismiss, onIntroGlitch } = await mount({ splash: true });
    const root = document.querySelector('.landing')!;
    expect(root.classList.contains('splashing')).toBe(true);
    expect(pv.showSplash).toHaveBeenCalledTimes(1);
    key('Enter');
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
    expect(onIntroGlitch).toHaveBeenCalledTimes(1);
    expect(pv.glitch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.splash')!.classList.contains('glitch-out')).toBe(true);
    await tick(400);
    expect(root.classList.contains('splashing')).toBe(false);
    expect(titling()).toBe(true);
    expect(document.querySelector('.title-menu')!.classList.contains('glitch-in')).toBe(true);
    expect(document.querySelectorAll('.tile.glitch-in')).toHaveLength(0);
    await tick(200);
    expect(document.querySelector('.splash')).toBeNull();
    key('Enter'); // NEW GAME
    expect(titling()).toBe(false);
    expect(document.querySelectorAll('.tile.glitch-in')).toHaveLength(3);
    expect(document.querySelector('.fighter.p1')!.classList.contains('glitch-in')).toBe(true);
    expect(phase()).toBe('p1');
    expect(pv.showSplash).toHaveBeenCalledTimes(1); // the title and p1 keep the splash's skyline
    expect(tileIds()).toEqual(['?random', 'nix', 'hicks']);
    expect(hot()).toEqual(['?random']);
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.titleP1);
    expect(document.querySelector('.select-hints')!.textContent).toBe(`${COPY.hintGrid} · ${COPY.hintBack}`);
    expect(pv.show).not.toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('Esc backs all the way out: model → p2 → p1 → the title → the splash, which a key dismisses again', async () => {
    const { pv, nav, onSplashDismiss, onSplashReturn, agents } = await mount({ splash: true, agentsSpy: true });
    key('Enter');
    await tick(600);
    key('Enter'); // NEW GAME
    await toModel();
    expect(phase()).toBe('model');
    keys('Escape', 'Escape', 'Escape'); // model → p2 → YOU → p1
    expect(phase()).toBe('p1');
    expect(document.querySelector('.splash')).toBeNull();
    key('Escape');
    expect(titling()).toBe(true);
    expect(document.querySelector('.splash')).toBeNull();
    pv.glitch.mockClear();
    key('Escape');
    const root = document.querySelector('.landing')!;
    expect(root.classList.contains('splashing')).toBe(true);
    expect(document.querySelector('.splash-prompt')!.textContent).toBe('[ ENTER TO CONTINUE ]');
    expect(document.querySelector('.splash-logo')!.classList.contains('glitch-in')).toBe(true);
    expect(pv.glitch).toHaveBeenCalledTimes(1);
    expect(onSplashReturn).toHaveBeenCalledTimes(1);
    // The splash is up: the poll stops and keys don't reach the grid.
    const calls = agents!.mock.calls.length;
    await tick(POLL_MS * 2);
    expect(agents!.mock.calls.length).toBe(calls);
    key('Escape'); // a browser key: the splash stays
    expect(document.querySelector('.splash')).not.toBeNull();
    key('ArrowRight'); // dismisses, never moves the cursor
    expect(onSplashDismiss).toHaveBeenCalledTimes(2);
    await tick(600);
    expect(document.querySelector('.splash')).toBeNull();
    expect(root.classList.contains('splashing')).toBe(false);
    expect(titling()).toBe(true);
    key('Enter'); // NEW GAME: the cursors are where they were
    expect(phase()).toBe('p1');
    expect(hot()).toEqual(['hicks']);
    await tick(POLL_MS);
    expect(agents!.mock.calls.length).toBe(calls + 1);
    expect(nav).not.toHaveBeenCalled();
  });

  it('a return visit that skipped the splash: Esc on p1 → the title, Esc there → the splash, a key → the title', async () => {
    await mount({ splashHost: true });
    expect(document.querySelector('.splash')).toBeNull();
    keys('Enter', 'Escape'); // p2 → p1
    expect(phase()).toBe('p1');
    key('Escape');
    expect(titling()).toBe(true);
    key('Escape');
    expect(document.querySelector('.splash')).not.toBeNull();
    expect(document.querySelector('.title-menu')).toBeNull();
    key('Enter');
    await tick(600);
    expect(document.querySelector('.splash')).toBeNull();
    expect(titling()).toBe(true);
    expect(titleItems()).toEqual(['new', 'report']);
  });

  it('PREVIOUSLY shows the recap for the locked player only, never before a player is locked', async () => {
    const data: AgentsResponse = {
      ...crew,
      agents: crew.agents.map((a) => (a.id === 'nix' ? { ...a, recaps: { hicks: 'We fixed the lamp.' } } : a)),
    };
    await mount({ data });
    const previously = () => [...document.querySelectorAll('.fighter.p2 .fighter-file dt')].map((d) => d.textContent);
    keys('ArrowRight', 'ArrowRight'); // p1 hovers hicks, not locked yet
    expect(previously()).not.toContain(COPY.livePreviously); // no player locked: p2 is still blank
    keys('Enter', 'Enter'); // p1 locks on hicks, plays as him
    keys('ArrowLeft'); // p2 hovers nix: the player is locked, so her file already previews PREVIOUSLY
    expect(previously()).toContain(COPY.livePreviously);
    expect(document.querySelector('.fighter.p2 .fighter-file')!.textContent).toContain('We fixed the lamp.');
  });

  it('a remembered Hermes contact (lastAgent nix) opens the select screen on the first roster character', async () => {
    localStorage.setItem('nix-room.lastAgent', 'nix');
    const data: AgentsResponse = {
      ...crew,
      agents: [
        agent({ id: 'cass', name: 'Cass', backend: 'direct', modelLabel: 'GLM 5.2', connected: true, link: 'ok' }),
        agent({ id: 'nix-direct', name: 'Nix', backend: 'direct', modelLabel: 'GLM 5.2', connected: true, link: 'ok' }),
      ],
    };
    await mount({ data, match: { player: 'nix', ai: 'nix' } });
    expect(phase()).toBe('p1');
    expect(tileIds()).toEqual(['?random', 'cass', 'nix-direct']);
    expect(hot()).toEqual(['?random']);
  });

  it('NEW GAME starts the green cursor on the remembered player (lastMatch, a fallback cache)', async () => {
    await mount({ data: cast, splash: true, match: { player: 'case', ai: 'nix' } });
    key('Enter');
    await tick(600);
    key('Enter'); // NEW GAME
    expect(phase()).toBe('p1');
    expect(hot()).toEqual(['case']);
  });

  it('p1 → p2 → model → ready by Enter for a direct AI', async () => {
    const { api } = await mount();
    expect(phase()).toBe('p1');
    keys('ArrowRight', 'ArrowRight', 'Enter');
    expect(phase()).toBe('you');
    key('Enter'); // PLAY AS HICKS
    expect(phase()).toBe('p2');
    expect(name('p1')).toBe('HICKS');
    expect(hot()).toEqual(['hicks']);
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.titleP2);
    keys('ArrowLeft', 'Enter');
    expect(phase()).toBe('model');
    await tick();
    expect(api.models).toHaveBeenCalledWith('nix');
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.link.titleModel('she'));
    expect(modelRows()).toEqual(['GLM 5.2', 'Kimi K3']);
    expect(modelOn()).toBe('GLM 5.2');
    key('ArrowDown');
    expect(modelOn()).toBe('Kimi K3');
    await pick();
    expect(api.setModel).toHaveBeenCalledExactlyOnceWith('nix', 'moonshot/kimi-k3');
    expect(phase()).toBe('ready');
    expect(document.querySelector('.model-panel')).toBeNull();
    expect(document.querySelector('.jack-in')!.textContent).toBe(COPY.jackIn);
    expect(confirmedModel()).toEqual(['Kimi K3']);
    expect(document.querySelector('.select-hints')!.textContent).toBe(COPY.hintReady);
    keys('n', 'Escape'); // ready → model → p2 (N answers the JACK IN prompt like Escape)
    expect(phase()).toBe('p2');
  });

  it('her model that fails to load still offers what she runs now; picking it changes nothing', async () => {
    const { api, nav } = await mount({ api: { models: vi.fn(async () => Promise.reject(new Error('down'))) } });
    await toModel();
    expect(modelRows()[0]).toBe('GLM 5.2');
    await pick();
    expect(phase()).toBe('ready');
    expect(api.setModel).not.toHaveBeenCalled();
    key('Enter');
    await tick();
    expect(nav).toHaveBeenCalledWith('/room/nix');
  });

  it('Enter on an offline or mindless AI shakes the strip and stays in p2', async () => {
    await mount({ data: cast });
    keys('ArrowRight', 'ArrowRight', 'Enter', 'Enter'); // nix as player
    keys('ArrowRight'); // p2 hovers case
    key('Enter'); // case: not connected
    const p2 = document.querySelector('.fighter.p2')!;
    expect(phase()).toBe('p2');
    expect(p2.classList.contains('shake')).toBe(true);
    await tick(400);
    expect(p2.classList.contains('shake')).toBe(false);
    key('ArrowRight'); // hicks
    key('Enter'); // hicks: no mind
    expect(phase()).toBe('p2');
    expect(p2.classList.contains('shake')).toBe(true);
  });

  it('ready: Enter starts a playthrough, remembers the match, then nav(/room/<ai>); the model was saved when picked', async () => {
    const { api, nav, title } = await mount();
    await toModel();
    key('ArrowDown');
    await pick();
    expect(api.setModel).toHaveBeenCalledExactlyOnceWith('nix', 'moonshot/kimi-k3');
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledExactlyOnceWith('hicks', 'nix');
    expect(api.setModel).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledExactlyOnceWith('/room/nix');
    expect(storedMatch()).toEqual({ player: 'hicks', ai: 'nix' });
    expect(localStorage.getItem('nix-room.lastAgent')).toBe('nix');
  });

  it('picking her current model saves it as is', async () => {
    const first = await mount();
    await toModel();
    await pick();
    key('Enter');
    await tick();
    expect(first.api.setModel).toHaveBeenCalledExactlyOnceWith('nix', 'z-ai/glm-5.2');
    expect(first.nav).toHaveBeenCalledWith('/room/nix');
    expect(storedMatch()).toEqual({ player: 'hicks', ai: 'nix' });
  });

  it('Enter twice while a pick saves → one setModel; Enter twice on ready → one nav', async () => {
    const setModel = vi.fn(() => new Promise<void>((r) => setTimeout(r, 300)));
    const beforeNav = vi.fn(() => new Promise<void>((r) => setTimeout(r, 500)));
    const { nav } = await mount({ api: { setModel }, beforeNav });
    await toModel();
    keys('ArrowDown', 'Enter', 'Enter');
    await tick(300);
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(phase()).toBe('ready');
    keys('Enter', 'Enter');
    await tick(0);
    keys('Enter');
    expect(beforeNav).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    await tick(500);
    keys('Enter');
    await tick(1000);
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledExactlyOnceWith('/room/nix');
  });

  it('a pick that fails to save stays on the model step with the error line; Enter tries again', async () => {
    const setModel = vi.fn(async () => Promise.reject(new Error('unknown-model')));
    const { nav, title } = await mount({ api: { setModel } });
    await toModel();
    key('ArrowDown');
    await pick();
    expect(phase()).toBe('model');
    expect(document.querySelector('.dial-error')!.textContent).toBe(COPY.dialFailed('unknown-model'));
    expect(nav).not.toHaveBeenCalled();
    expect(title.createPlaythrough).not.toHaveBeenCalled();
    await pick();
    expect(setModel).toHaveBeenCalledTimes(2);
  });

  it('Esc steps back p2 → p1 and model → p2', async () => {
    await mount();
    keys('ArrowRight', 'Enter', 'Enter');
    expect(phase()).toBe('p2');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(phase()).toBe('you');
    key('Escape');
    expect(phase()).toBe('p1');
    expect(hot()).toEqual(['nix']);
    keys('ArrowRight', 'ArrowRight', 'Enter', 'Enter', 'ArrowLeft', 'Enter'); // hicks vs nix
    await tick();
    expect(phase()).toBe('model');
    key('Escape');
    expect(phase()).toBe('p2');
    expect(document.querySelector('.model-panel')).toBeNull();
    expect(document.querySelector('.fighter.p2 .file-strip.wide')).toBeNull();
  });

  it("dispose with the splash up tears the splash down (its resize listener too)", async () => {
    const { handle } = await mount({ splash: true });
    const off = vi.spyOn(window, 'removeEventListener');
    handle.dispose();
    expect(document.querySelector('.splash')).toBeNull();
    // The splash's own (the select stage no longer listens: the game stage scales it).
    expect(off.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    off.mockRestore();
  });

  it('dispose before the roster arrives: no render, no backdrop calls', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    let resolve!: (d: AgentsResponse) => void;
    const pv = preview();
    const api = {
      agents: () => new Promise<AgentsResponse>((r) => (resolve = r)),
      packScenes: async () => ({ base: '', scenes: [] }),
      models: vi.fn(async () => catalog),
      setModel: vi.fn(async () => {}),
      ...linkApi(),
    };
    const root = document.getElementById('root')!;
    const handle = mountLanding(root, api, vi.fn(), pv, { title: titleOpts() });
    handle.dispose();
    pv.showSplash.mockClear(); // the title drew the skyline at mount
    resolve(crew);
    await handle.ready;
    await tick(1000);
    expect(document.querySelector('[data-phase]')).toBeNull();
    expect(document.querySelector('.tile')).toBeNull();
    expect(pv.showSplash).not.toHaveBeenCalled();
    expect(pv.show).not.toHaveBeenCalled();
    expect(root.classList.contains('landing')).toBe(false);
  });

  it('backdrop: p2 swaps to the resting AI after 150 ms; five quick moves → one show() with the last', async () => {
    const { pv } = await mount({ data: cast });
    keys('ArrowRight', 'Enter', 'Enter'); // dixie as player; p2 on dixie
    await tick(149);
    expect(pv.show).not.toHaveBeenCalled();
    await tick(1);
    expect(pv.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'dixie' }), { transition: 'glitch' });
    pv.show.mockClear();
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowRight']) {
      key(k);
      await tick(50);
    }
    expect(pv.show).not.toHaveBeenCalled();
    await tick(100);
    expect(pv.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'nix' }), { transition: 'glitch' });
  });

  it('p1 shows the splash skyline; RANDOM and mindless tiles do not swap the backdrop', async () => {
    const { pv } = await mount();
    expect(pv.showSplash).toHaveBeenCalledTimes(1);
    keys('ArrowRight', 'ArrowRight'); // to hicks: no mind, no swap
    await tick(300);
    expect(pv.show).not.toHaveBeenCalled();
    keys('ArrowLeft', 'Enter', 'Enter'); // nix as player; p2 on nix
    await tick(150);
    expect(pv.show).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'nix' }), { transition: 'glitch' });
    pv.show.mockClear();
    key('ArrowLeft'); // ?random
    await tick(300);
    key('ArrowLeft'); // wraps to hicks (no mind)
    await tick(300);
    expect(pv.show).not.toHaveBeenCalled();
    keys('Escape', 'Escape'); // p2 → YOU → p1
    expect(pv.showSplash).toHaveBeenCalledTimes(2);
  });

  it('unreachable and empty rosters show their messages', async () => {
    await mount({ agents: () => Promise.reject(new Error('down')) });
    expect(document.querySelector('.landing')!.textContent).toContain(COPY.unreachable);
    await mount({ data: { agents: [] } });
    expect(document.querySelector('.landing')!.textContent).toContain(COPY.empty);
    await mount({ data: crew });
    expect(tileIds()).toHaveLength(3);
  });

  it('reduced motion: no glitch classes, fade swaps', async () => {
    const { pv } = await mount({ splash: true, reducedMotion: true });
    key(' ');
    await tick(0);
    expect(document.querySelector('.splash')).toBeNull();
    expect(titling()).toBe(true);
    expect(document.querySelector('.glitch-in, .glitch-out')).toBeNull();
    key('Enter'); // NEW GAME
    expect(document.querySelector('.glitch-in, .glitch-out')).toBeNull();
    expect(pv.glitch).not.toHaveBeenCalled();
    expect(phase()).toBe('p1');
    keys('ArrowRight', 'Enter', 'Enter');
    await tick(150);
    expect(pv.show).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'nix' }), { transition: 'fade' });
  });

  it('a back/forward-cache restore (pageshow persisted) lets Enter dial again from ready', async () => {
    const onRestore = vi.fn();
    const { nav } = await mount({ beforeNav: async () => {}, onRestore });
    await toModel(); // hicks as player, nix as AI
    await pick(); // → ready
    expect(phase()).toBe('ready');
    key('Enter');
    await tick();
    expect(nav).toHaveBeenCalledTimes(1);
    key('Enter');
    await tick();
    expect(nav).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(phase()).toBe('ready');
    key('Enter');
    await tick();
    expect(nav).toHaveBeenCalledTimes(2);
  });

  it('mouse: hover moves the live cursor, click locks', async () => {
    await mount();
    const tile = (id: string) => document.querySelector<HTMLElement>(`.tile[data-id="${id}"]`)!;
    tile('nix').dispatchEvent(new MouseEvent('mouseenter'));
    expect(hot()).toEqual(['nix']);
    tile('hicks').click();
    expect(phase()).toBe('you');
    key('Enter');
    expect(phase()).toBe('p2');
    expect(name('p1')).toBe('HICKS');
  });
});

describe('YOU step', () => {
  const youPanel = () => document.querySelector('.fighter.p1 .you-panel');
  const fill = (sel: string, value: string) => {
    const f = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!;
    f.value = value;
    f.dispatchEvent(new Event('input'));
  };
  const confirm = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, cancelable: true }));
  /** Hicks as 1P, then CUSTOM "Vee" with a background, confirmed: on to p2. */
  const asVee = () => {
    keys('ArrowRight', 'ArrowRight', 'Enter'); // p1 → hicks → YOU
    keys('ArrowDown', 'ArrowDown', 'Enter'); // CUSTOM
    fill('.yp-name', 'Vee');
    fill('.yp-background', 'Ex-courier.');
    confirm();
  };

  it('locking 1P opens the YOU panel in the 1P strip', async () => {
    await mount();
    keys('ArrowRight', 'Enter'); // nix
    expect(phase()).toBe('you');
    expect(youPanel()).not.toBeNull();
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.you.title);
    expect(document.querySelector('.you-panel .yp-row.on')!.textContent).toBe('PLAY AS NIX');
    expect(document.querySelector('.select-hints')!.textContent).toBe(COPY.you.hint);
  });

  it('clicking a 1P tile also opens YOU', async () => {
    await mount();
    document.querySelector<HTMLElement>('.tile[data-id="hicks"]')!.click();
    expect(phase()).toBe('you');
    expect(youPanel()).not.toBeNull();
  });

  it('Enter on PLAY AS goes to p2 and dials with no persona', async () => {
    const { title } = await mount();
    keys('ArrowRight', 'ArrowRight', 'Enter'); // hicks
    key('Enter'); // PLAY AS HICKS
    expect(phase()).toBe('p2');
    expect(youPanel()).toBeNull();
    expect(name('p1')).toBe('HICKS');
    keys('ArrowLeft', 'Enter'); // nix
    await tick();
    await pick(); // her current model
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledExactlyOnceWith('hicks', 'nix');
  });

  it('CUSTOM "Vee" shows on the 1P strip and dials with the persona', async () => {
    const { title } = await mount();
    asVee();
    expect(phase()).toBe('p2');
    expect(name('p1')).toBe('VEE');
    expect(document.querySelector('.fighter.p1 .fighter-file .dh')!.textContent).toBe(COPY.fileHeader(COPY.you.tag));
    keys('ArrowLeft', 'Enter');
    await tick();
    await pick();
    expect(name('p1')).toBe('VEE');
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledExactlyOnceWith('hicks', 'nix', { name: 'Vee', background: 'Ex-courier.', kind: 'custom' });
  });

  it('keys typed into the form never reach the grid or the dial', async () => {
    const { title } = await mount();
    keys('ArrowRight', 'ArrowRight', 'Enter');
    keys('ArrowDown', 'ArrowDown', 'Enter'); // CUSTOM form
    expect(document.querySelector('.select-hints')!.textContent).toBe(COPY.you.hintForm);
    const before = tileIds();
    const hotBefore = hot();
    for (const k of ['h', 'H', 'ArrowRight', 'ArrowLeft', 'Enter', 'y', 'n']) key(k);
    await tick();
    expect(phase()).toBe('you');
    expect(tileIds()).toEqual(before);
    expect(hot()).toEqual(hotBefore);
    expect(document.querySelector('.you-panel .yp-form')).not.toBeNull();
    expect(title.createPlaythrough).not.toHaveBeenCalled();
  });

  it('Esc on the rows returns to p1; Esc on p2 returns to YOU with the form showing Vee', async () => {
    await mount();
    keys('ArrowRight', 'Enter');
    key('Escape');
    expect(phase()).toBe('p1');
    expect(youPanel()).toBeNull();
    asVee();
    expect(phase()).toBe('p2');
    key('Escape');
    expect(phase()).toBe('you');
    expect(document.querySelector<HTMLInputElement>('.yp-name')!.value).toBe('Vee');
    expect(document.querySelector<HTMLTextAreaElement>('.yp-background')!.value).toBe('Ex-courier.');
    // The reopened form takes the keys: its name field has focus.
    expect(document.activeElement).toBe(document.querySelector('.yp-name'));
  });

  it('CUSTOM from the rows focuses the name field', async () => {
    await mount();
    keys('ArrowRight', 'Enter', 'ArrowDown', 'ArrowDown', 'Enter');
    expect(document.activeElement).toBe(document.querySelector('.yp-name'));
  });

  it('a failed dial, then a different persona, starts a playthrough with the new one', async () => {
    const { title } = await mount();
    title.createPlaythrough.mockRejectedValueOnce(new Error('disk full'));
    asVee();
    keys('ArrowLeft', 'Enter');
    await tick();
    await pick();
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledTimes(1);
    key('Escape'); // ready → model
    await tick();
    key('Escape'); // model → p2
    key('Escape'); // p2 → YOU (the form)
    expect(phase()).toBe('you');
    fill('.yp-name', 'Vex');
    confirm();
    keys('ArrowLeft', 'Enter');
    await tick();
    await pick();
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledTimes(2);
    expect(title.createPlaythrough).toHaveBeenLastCalledWith('hicks', 'nix', { name: 'Vex', background: 'Ex-courier.', kind: 'custom' });
  });
});

describe('the roster band', () => {
  const offline = (id: string): AgentsResponse => ({
    ...cast,
    agents: cast.agents.map((a) => (a.id === id ? { ...a, connected: false } : a)),
  });

  it('select cues: a step per tile moved, a lock per fighter, VS on READY (and not on the way back)', async () => {
    const { onCue } = await mount();
    const cues = () => onCue.mock.calls.map(([c]) => c);
    expect(cues()).toEqual([]);
    keys('ArrowRight', 'ArrowRight'); // p1 → nix → hicks
    expect(cues()).toEqual(['move', 'move']);
    keys('Enter', 'Enter'); // lock hicks; YOU → PLAY AS HICKS (the panel, no cue)
    expect(cues()).toEqual(['move', 'move', 'lock']);
    keys('ArrowLeft', 'Enter'); // p2 → nix, locked: the model step
    expect(phase()).toBe('model');
    expect(cues()).toEqual(['move', 'move', 'lock', 'move', 'lock']);
    await tick(); // her model list
    await pick(); // the model chosen: READY
    expect(phase()).toBe('ready');
    expect(cues().at(-1)).toBe('vs');
    onCue.mockClear();
    keys('n', 'Escape'); // ready → model → p2: backing out is silent
    expect(cues()).toEqual([]);
  });

  it('the hints are the grid and back, on p1 and p2', async () => {
    await mount();
    const hintsText = () => document.querySelector('.select-hints')!.textContent;
    expect(hintsText()).toBe(`${COPY.hintGrid} · ${COPY.hintBack}`);
    keys('ArrowRight', 'Enter', 'Enter'); // nix as player, now in p2
    expect(phase()).toBe('p2');
    expect(hintsText()).toBe(`${COPY.hintGrid} · ${COPY.hintBack}`);
  });

  it('h is not consumed and the band stays put', async () => {
    await mount({ data: cast });
    const before = tileIds();
    const e = new KeyboardEvent('keydown', { key: 'h', cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(tileIds()).toEqual(before);
  });

  it('the poll refreshes offline states every 15 s without moving anything', async () => {
    const agents = vi.fn().mockResolvedValueOnce(cast).mockResolvedValueOnce(offline('dixie'));
    await mount({ agents });
    keys('ArrowRight', 'Enter', 'Enter'); // dixie as player; p2 follows to dixie
    const dixieTileBefore = document.querySelector('.tile[data-id="dixie"]');
    await tick(POLL_MS);
    expect(agents).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.tile[data-id="dixie"]')).toBe(dixieTileBefore);
    expect(dixieTileBefore!.classList.contains('offline')).toBe(true);
    expect(phase()).toBe('p2');
    key('Enter'); // dixie as AI: now offline, refused
    expect(document.querySelector('.fighter.p2')!.classList.contains('shake')).toBe(true);
  });

  it('a locked AI going down mid-VS stays on ready and still dials', async () => {
    const agents = vi.fn().mockResolvedValueOnce(cast).mockResolvedValueOnce(offline('dixie'));
    const { nav } = await mount({ agents });
    keys('ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter', 'Enter'); // case as player
    keys('ArrowLeft', 'ArrowLeft', 'Enter'); // dixie as AI -> model
    await tick();
    await pick(); // -> ready
    expect(phase()).toBe('ready');
    await tick(POLL_MS);
    expect(phase()).toBe('ready');
    key('Enter'); // dial anyway
    await tick();
    expect(nav).toHaveBeenCalledWith('/room/dixie');
  });

  it('the poll stops after dial-in', async () => {
    const agents = vi.fn(async () => crew);
    const { nav } = await mount({ agents });
    await toModel();
    await pick(); // ready
    key('Enter'); // dial
    await tick();
    expect(nav).toHaveBeenCalledTimes(1);
    const callsBefore = agents.mock.calls.length;
    await expect(tick(POLL_MS * 2)).resolves.not.toThrow();
    expect(agents.mock.calls.length).toBe(callsBefore);
  });

  it('the poll stops on dispose, even without a dial-in', async () => {
    const agents = vi.fn(async () => crew);
    const { handle } = await mount({ agents });
    expect(phase()).toBe('p1'); // still mid-roster, never "leaving"
    const callsBefore = agents.mock.calls.length;
    handle.dispose();
    await expect(tick(POLL_MS * 2)).resolves.not.toThrow();
    expect(agents.mock.calls.length).toBe(callsBefore);
  });
});

describe('select splash', () => {
  const landing = () => document.querySelector('.landing')!;
  const prompt = () => document.querySelector('.splash-prompt')?.textContent;

  it('needing sound: the first key starts the theme and stays on the splash; the second goes on', async () => {
    const { nav, onSplashDismiss } = await mount({ splash: true, needsSound: true });
    expect(prompt()).toBe('▶ CLICK OR PRESS ANY KEY FOR SOUND');
    key('Enter');
    await tick(600);
    expect(onSplashDismiss).not.toHaveBeenCalled();
    expect(document.querySelector('.splash')).not.toBeNull();
    expect(prompt()).toBe('[ ENTER TO CONTINUE ]');
    key('Enter');
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
    await tick(600);
    expect(document.querySelector('.splash')).toBeNull();
    expect(nav).not.toHaveBeenCalled();
    expect(titling()).toBe(true);
  });

  it('needing sound: a click also takes two steps', async () => {
    const { onSplashDismiss } = await mount({ splash: true, needsSound: true });
    const down = () => document.querySelector('.splash')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    down();
    expect(onSplashDismiss).not.toHaveBeenCalled();
    expect(prompt()).toBe('[ ENTER TO CONTINUE ]');
    down();
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
  });

  it('sound that starts on its own (autoplay allowed) arms the splash without a key', async () => {
    const { handle, onSplashDismiss } = await mount({ splash: true, needsSound: true });
    handle.soundStarted();
    expect(prompt()).toBe('[ ENTER TO CONTINUE ]');
    key(' ');
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
  });

  it('needing sound: browser keys neither start the sound step nor dismiss', async () => {
    const { onSplashDismiss } = await mount({ splash: true, needsSound: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true }));
    key('Escape');
    expect(prompt()).toBe('▶ CLICK OR PRESS ANY KEY FOR SOUND');
    expect(onSplashDismiss).not.toHaveBeenCalled();
  });

  it('once per session: dismissing marks it seen', async () => {
    await mount({ splash: true });
    key('Enter');
    expect(sessionStorage.getItem('lowlight.splashSeen')).toBe('1');
  });

  it('keys during the dismiss are swallowed', async () => {
    const { nav, onSplashDismiss } = await mount({ splash: true });
    keys('Enter', 'ArrowRight', 'Enter');
    await tick(600);
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    expect(titling()).toBe(true);
    key('Enter'); // NEW GAME
    expect(phase()).toBe('p1');
    expect(hot()).toEqual(['?random']);
    key('ArrowRight');
    expect(hot()).toEqual(['nix']);
  });

  it('the poll waits for the splash to be dismissed before starting', async () => {
    const agents = vi.fn(async () => crew);
    await mount({ splash: true, agents });
    const callsAfterMount = agents.mock.calls.length;
    await tick(POLL_MS * 2);
    expect(agents.mock.calls.length).toBe(callsAfterMount); // still splashing: no poll yet
    key('Enter'); // dismiss
    await tick(600);
    expect(landing().classList.contains('splashing')).toBe(false);
    const callsAfterDismiss = agents.mock.calls.length;
    await tick(POLL_MS);
    expect(agents.mock.calls.length).toBe(callsAfterDismiss + 1);
  });

  it('a click on the splash dismisses it too', async () => {
    const { onSplashDismiss } = await mount({ splash: true });
    document.querySelector('.splash')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onSplashDismiss).toHaveBeenCalledTimes(1);
    await tick(600);
    expect(landing().classList.contains('splashing')).toBe(false);
  });

  it('a splash scene that cannot draw falls back to the gradient', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const pv = { ...preview(), showSplash: vi.fn(async () => false) };
    const api = { agents: async () => crew, packScenes: async () => ({ base: '', scenes: [] }), models: async () => catalog, setModel: async () => {}, ...linkApi() };
    const handle = mountLanding(document.getElementById('root')!, api, vi.fn(), pv, { splash: { host: document.body, reducedMotion: false }, title: titleOpts() });
    handles.push(handle);
    await tick();
    expect(document.querySelector('.splash')!.classList.contains('no-scene')).toBe(true);
  });

  it('agents unreachable during the splash: it still dismisses and the error shows', async () => {
    await mount({ splash: true, agents: () => Promise.reject(new Error('down')) });
    key(' ');
    await tick(600);
    expect(document.querySelector('.splash')).toBeNull();
    expect(landing().classList.contains('splashing')).toBe(false);
    expect(titling()).toBe(true); // the title still works without the roster
    key('Enter'); // NEW GAME
    expect(landing().textContent).toContain(COPY.unreachable);
  });

  it('browser keys (Ctrl+R, Cmd+R, Alt+Tab, Escape, a lone Shift) leave the splash up and are not blocked', async () => {
    const { onSplashDismiss } = await mount({ splash: true });
    for (const init of [{ key: 'r', ctrlKey: true }, { key: 'r', metaKey: true }, { key: 'Tab', altKey: true }, { key: 'Escape' }, { key: 'Shift' }, { key: 'Control' }]) {
      const e = new KeyboardEvent('keydown', { ...init, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, init.key).toBe(false);
    }
    expect(onSplashDismiss).not.toHaveBeenCalled();
    expect(document.querySelector('.splash')).not.toBeNull();
  });

  it('on the select screen only arrows, Enter and Escape are consumed', async () => {
    await mount();
    for (const k of ['r', 'Tab', 'F5', ' ']) {
      const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, k).toBe(false);
    }
  });
});

describe('title menu (save/load)', () => {
  it("the title's backdrop: her room once the cursor rests on CONTINUE, the skyline on NEW GAME", async () => {
    const title = noPlaythroughs();
    const pt = { id: 'pt-1', name: 'Run', player: 'case', startContact: 'nix', updatedAt: 0, forkedFrom: null, location: { contactId: 'nix', sceneId: 'ribbon/lowlight-intake' } };
    title.listPlaythroughs.mockResolvedValue({ active: 'pt-1', playthroughs: [pt] });
    (title as unknown as { contacts: ReturnType<typeof vi.fn> }).contacts.mockResolvedValue([
      { id: 'nix', name: 'Nix', accent: '#f0f', portrait: null, status: 'start', sceneId: 'ribbon/lowlight-intake', placeName: 'Lowlight Intake', timeOfDay: 'night', lastLine: null },
    ]);
    const { pv } = await mount({ title, atTitle: true, splashHost: true });
    expect(pv.show).not.toHaveBeenCalled();
    await tick(150);
    expect(pv.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'nix' }), { transition: 'glitch' });
    pv.showSplash.mockClear();
    key('ArrowRight'); // NEW GAME
    expect(pv.showSplash).toHaveBeenCalledTimes(1);
    key('ArrowLeft'); // back to CONTINUE before the rest: no swap yet
    key('ArrowRight');
    await tick(150);
    expect(pv.show).toHaveBeenCalledTimes(1);
  });

  async function onContinueWithHerRoom() {
    const title = noPlaythroughs();
    const pt = { id: 'pt-1', name: 'Run', player: 'case', startContact: 'nix', updatedAt: 0, forkedFrom: null, location: { contactId: 'nix', sceneId: 'ribbon/lowlight-intake' } };
    title.listPlaythroughs.mockResolvedValue({ active: 'pt-1', playthroughs: [pt] });
    (title as unknown as { contacts: ReturnType<typeof vi.fn> }).contacts.mockResolvedValue([
      { id: 'nix', name: 'Nix', accent: '#f0f', portrait: null, status: 'start', sceneId: 'ribbon/lowlight-intake', placeName: 'Lowlight Intake', timeOfDay: 'night', lastLine: null },
    ]);
    const m = await mount({ title, atTitle: true, splashHost: true });
    await tick(150);
    expect(m.pv.show).toHaveBeenCalledTimes(1);
    m.pv.showSplash.mockClear();
    return m;
  }

  it("the roster poll behind the title doesn't put the skyline back over her room (review 1)", async () => {
    const { pv } = await onContinueWithHerRoom();
    await tick(POLL_MS * 2);
    expect(pv.showSplash).not.toHaveBeenCalled();
  });

  it('Esc from the title to the splash draws the skyline again (review 5)', async () => {
    const { pv } = await onContinueWithHerRoom();
    key('Escape');
    expect(document.querySelector('.splash')).not.toBeNull();
    expect(pv.showSplash).toHaveBeenCalledTimes(1);
  });

  it('keys during the intro glitch never reach the title', async () => {
    await mount({ splash: true });
    key('Enter');
    await tick(450); // the title is up, the splash still glitching out
    key('Enter');
    await tick(200);
    expect(titling()).toBe(true);
    expect(document.querySelector('.title-menu')).not.toBeNull();
  });

  it('the splash shows the splashArt option, and Esc back to the splash shows the same art', async () => {
    const art = { id: 'roof', src: '/api/splash-art/roof.webp', width: 1600, height: 900, logo: { x: 70, y: 70, width: 700 } };
    await mount({ splash: true, splashArt: art });
    expect(document.querySelector('img.splash-art')!.getAttribute('src')).toBe('/api/splash-art/roof.webp');
    key('Enter');
    await tick(1000);
    expect(titling()).toBe(true);
    key('Escape');
    expect(document.querySelector('img.splash-art')!.getAttribute('src')).toBe('/api/splash-art/roof.webp');
  });

  it("power-on plays on the splash's first showing, not after Esc back (its glitch-in does the entrance; final review 1)", async () => {
    const art = { id: 'roof', src: '/api/splash-art/roof.webp', width: 1600, height: 900, logo: { x: 70, y: 70, width: 700, src: '/l.png', aspect: 3, effects: ['power-on' as const] } };
    await mount({ splash: true, splashArt: art });
    expect(document.querySelector('.splash-logo')!.classList.contains('intro')).toBe(true);
    key('Enter');
    await tick(1000);
    key('Escape');
    const logo = document.querySelector('.splash-logo')!;
    expect(logo.classList.contains('fx-power-on')).toBe(true);
    expect(logo.classList.contains('intro')).toBe(false);
  });

  it('a return visit (splash seen) opens on the title; Esc brings the splash back', async () => {
    await mount({ splashHost: true, atTitle: true, match: { player: 'case', ai: 'nix' } });
    expect(document.querySelector('.splash')).toBeNull();
    expect(titling()).toBe(true);
    expect(titleItems()).toEqual(['new', 'report']);
    key('Escape');
    expect(document.querySelector('.splash')).not.toBeNull();
    expect(document.querySelector('.title-menu')).toBeNull();
  });

  it('dial no longer touches the model: createPlaythrough only', async () => {
    const { api, title } = await mount();
    await toModel();
    await pick();
    vi.mocked(api.setModel).mockClear();
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledTimes(1);
    expect(api.setModel).not.toHaveBeenCalled();
  });

  it('dial while a turn streams: "Wait for Nix to finish", no nav, and Y tries again', async () => {
    const title = noPlaythroughs();
    title.createPlaythrough.mockRejectedValueOnce(new ApiError(409, 'busy', 'nix'));
    const { nav } = await mount({ title });
    await toModel();
    await pick();
    key('Enter');
    await tick();
    expect(phase()).toBe('ready');
    expect(document.querySelector('.dial-error')!.textContent).toBe(COPY.dialBusy('Nix'));
    expect(nav).not.toHaveBeenCalled();
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledTimes(2);
    expect(nav).toHaveBeenCalledWith('/room/nix');
  });

  it('LOAD opens the load screen over the title; Esc there returns to the title', async () => {
    const title = noPlaythroughs();
    title.listPlaythroughs.mockResolvedValue({
      active: null,
      playthroughs: [{ id: 'pt-0', name: 'Old run', player: 'hicks', startContact: 'nix', updatedAt: 0, forkedFrom: null, location: null }],
    });
    const { nav } = await mount({ title, atTitle: true, splashHost: true });
    keys('ArrowRight', 'Enter');
    await tick();
    expect(document.querySelector('.title-menu')).toBeNull();
    expect(document.querySelector('.load-screen .fighter.p1 .pt b')!.textContent).toBe('Old run');
    expect(titling()).toBe(true);
    // The select underneath doesn't hear the screen's keys (Enter would lock P1).
    keys('Enter');
    expect(phase()).toBe('p1');
    key('Escape');
    await tick();
    expect(document.querySelector('.load-screen')).toBeNull();
    expect(titleItems()).toEqual(['new', 'load', 'report']);
    // Esc reached the load screen only: the splash stays down.
    expect(document.querySelector('.splash')).toBeNull();
    expect(nav).not.toHaveBeenCalled();
  });
});

describe('the in-game link (spec 2026-10-08)', () => {
  const unlinked: AgentsResponse = { ...crew, agents: crew.agents.map((a) => (a.id === 'nix' ? { ...a, link: 'no-link' as const } : a)) };
  const noLink = vi.fn(async (): Promise<LinkInfo> => ({ linked: false, last4: null, credit: null, state: 'no-link' }));
  const chips = () => [...document.querySelectorAll<HTMLElement>('.tile')].filter((t) => t.querySelector('.tile-chip')).map((t) => t.dataset.id);

  it('a no-link contact is lit and tagged NO LINK on the band', async () => {
    await mount({ data: unlinked, api: { link: noLink } });
    keys('ArrowRight', 'ArrowRight', 'Enter', 'Enter'); // hicks
    expect(chips()).toEqual(['nix']);
    expect(document.querySelector('.tile[data-id="nix"]')!.classList.contains('offline')).toBe(false);
    key('ArrowLeft');
    expect(document.querySelector('.fighter.p2 .extra')!.textContent).toBe(COPY.link.stripExtra('she'));
  });

  it('model phase with no key mounts the link panel in a wide p2 strip, titled LINK A MIND', async () => {
    const { api } = await mount({ data: unlinked, api: { link: noLink } });
    await toModel();
    expect(phase()).toBe('model');
    expect(document.querySelector('.fighter.p2 .file-strip.wide .link-panel')).not.toBeNull();
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.link.titleLink);
    expect(document.querySelector('.select-hints')!.textContent).toBe(COPY.link.hintLink);
    expect(api.models).not.toHaveBeenCalled();
  });

  it('after linking the model panel replaces it, titled CHOOSE HER MIND; the roster refreshes', async () => {
    const agents = vi.fn(async () => unlinked);
    const { api } = await mount({ data: unlinked, agents, api: { link: noLink } });
    await toModel();
    const input = document.querySelector<HTMLInputElement>('.lp-key')!;
    input.value = 'sk-or-v1-abc';
    const before = agents.mock.calls.length;
    key('Enter');
    await tick(800);
    expect(api.putLink).toHaveBeenCalledExactlyOnceWith('sk-or-v1-abc');
    expect(document.querySelector('.link-panel')).toBeNull();
    expect(document.querySelector('.model-panel')).not.toBeNull();
    expect(document.querySelector('.select-title')!.textContent).toBe(COPY.link.titleModel('she'));
    expect(agents.mock.calls.length).toBeGreaterThan(before);
    await pick();
    expect(phase()).toBe('ready');
  });

  it('Esc in the link panel returns to p2', async () => {
    await mount({ data: unlinked, api: { link: noLink } });
    await toModel();
    key('Escape');
    expect(phase()).toBe('p2');
    expect(document.querySelector('.link-panel')).toBeNull();
  });

  it('keys in the model phase go to the panel, not the grid', async () => {
    await mount();
    await toModel();
    const cursor = hot();
    keys('ArrowLeft', 'ArrowRight', 'h');
    expect(hot()).toEqual(cursor);
    expect(document.querySelector<HTMLInputElement>('.mp-search input')!.value).toBe('h');
  });

  it('CHANGE KEY shows the link panel; Esc there goes back to the list', async () => {
    await mount();
    await toModel();
    document.querySelector<HTMLButtonElement>('.mp-change')!.click();
    expect(document.querySelector('.link-panel')).not.toBeNull();
    key('Escape');
    await tick();
    expect(phase()).toBe('model');
    expect(document.querySelector('.model-panel')).not.toBeNull();
  });

  it('UNLINK deletes the key and shows the link panel', async () => {
    const { api } = await mount();
    await toModel();
    const unlink = document.querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    unlink.click();
    await tick();
    expect(api.deleteLink).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.link-panel')).not.toBeNull();
  });
});


describe('the in-game link: stale answers (review fixes)', () => {
  it('Esc while the link status loads: no panel appears later; re-locking opens a fresh, focused one', async () => {
    let resolve!: (i: LinkInfo) => void;
    const link = vi.fn(() => new Promise<LinkInfo>((r) => (resolve = r)));
    const data: AgentsResponse = { ...crew, agents: crew.agents.map((a) => (a.id === 'nix' ? { ...a, link: 'no-link' as const } : a)) };
    await mount({ data, api: { link } });
    await toModel();
    key('Escape');
    expect(phase()).toBe('p2');
    resolve({ linked: false, last4: null, credit: null, state: 'no-link' });
    await tick();
    expect(document.querySelector('.link-panel')).toBeNull();
    expect(document.querySelector('.model-panel')).toBeNull();
    link.mockImplementation(async () => ({ linked: false, last4: null, credit: null, state: 'no-link' }));
    key('Enter');
    await tick();
    expect(document.querySelector('.link-panel')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.lp-key'));
  });

  it('UNLINK that answers after the player backed out opens nothing', async () => {
    let done!: () => void;
    const deleteLink = vi.fn(() => new Promise<void>((r) => (done = r)));
    await mount({ api: { deleteLink } });
    await toModel();
    const unlink = document.querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    unlink.click();
    key('Escape');
    expect(phase()).toBe('p2');
    done();
    await tick();
    expect(document.querySelector('.link-panel')).toBeNull();
    expect(phase()).toBe('p2');
  });

  it("a failed unlink says so, not \"couldn't set the model\"", async () => {
    await mount({ api: { deleteLink: vi.fn(async () => Promise.reject(new Error('origin'))) } });
    await toModel();
    const unlink = document.querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    unlink.click();
    await tick();
    expect(document.querySelector('.dial-error')!.textContent).toBe(COPY.link.unlinkFailed('origin'));
  });

  it('dispose destroys an open panel', async () => {
    const { handle } = await mount();
    await toModel();
    expect(document.querySelector('.model-panel')).not.toBeNull();
    handle.dispose();
    expect(document.querySelector('.model-panel')).toBeNull();
  });
});


describe('the in-game link: her own link decides (final review)', () => {
  it('a contact whose own link is fine opens her model list even with no OpenRouter key linked', async () => {
    const link = vi.fn(async (): Promise<LinkInfo> => ({ linked: false, last4: null, credit: null, state: 'no-link' }));
    await mount({ api: { link } }); // nix: link 'ok' in the roster (a local endpoint, say)
    await toModel();
    expect(document.querySelector('.link-panel')).toBeNull();
    expect(document.querySelector('.model-panel')).not.toBeNull();
  });
});

describe('no SET THE SCENE on READY (arrival screen spec §3)', () => {
  async function toReady() {
    await toModel();
    await pick();
  }

  it('READY has no scene card, and S does nothing', async () => {
    await mount();
    await toReady();
    expect(document.querySelector('.scene-slot')).toBeNull();
    expect(document.querySelector('.select-hints')!.textContent).toBe(COPY.hintReady);
    key('s');
    await tick();
    expect(phase()).toBe('ready');
    expect(document.querySelector('.scene-panel')).toBeNull();
  });

  it('DIAL IN sends no scene', async () => {
    const { title } = await mount();
    await toReady();
    key('Enter');
    await tick();
    expect(title.createPlaythrough).toHaveBeenCalledExactlyOnceWith('hicks', 'nix');
  });
});

describe('select by district (spec 2026-10-25)', () => {
  const grouped: AgentsResponse = {
    agents: [
      agent({ id: 'hicks', name: 'Hicks', connected: true, link: 'ok', group: 'karasu' }),
      agent({ id: 'nix', name: 'Nix', connected: true, link: 'ok', group: 'karasu' }),
      agent({ id: 'rue', name: 'Rue', connected: true, link: 'ok', group: 'spine' }),
      agent({ id: 'ines', name: 'Ines', connected: true, link: 'ok', group: 'drownworks' }),
    ],
  };
  const districts = vi.fn(async () => [{ id: 'karasu', name: 'Karasu' }, { id: 'spine', name: 'The Spine' }, { id: 'drownworks', name: 'Drownworks' }]);

  it('tiles in district order under their labels', async () => {
    await mount({ data: grouped, api: { districts } });
    await tick();
    expect(tileIds()).toEqual(['?random', 'hicks', 'nix', 'ines', 'rue']);
    expect([...document.querySelectorAll('.tile-group')].map((l) => l.textContent)).toEqual(['KARASU', 'DROWNWORKS', 'SPINE']); // one tile each: no leading THE
  });
});
