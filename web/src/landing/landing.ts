import type { Pronoun } from '../../../shared/pronoun';
import type { AgentInfo, LinkState, ModelEvent, RoomState, SceneDef, Transition } from '../../../shared/types';
import { openBugReport } from '../ui/bug-report';
import { lastMatch, rememberAgent, rememberMatch } from '../room/identity';
import { markSplashSeen, mountSplash, sessionSplashArt, shouldShowSplash, splashArt, type Splash, type SplashArt } from './splash';
import { createTheme, THEME, THEME_IN_SECONDS, type MenuSong } from './theme';
import type { EngineState } from '../audio/engine';
import { COPY } from './copy';
import { canBeAi, createFlow, type Flow, type FlowState, type Phase } from './select-flow';
import { COLUMNS, RosterGrid, type GridTile } from './roster-grid';
import { FighterStrip, type StripModels } from './fighter-strip';
import { glitchIn, mountStage } from './stage';
import { mountTitle, type TitleCue } from './title';
import { mountLoad } from './load';
import { MENU_CUE_URL, menuCuePlayer } from './menu-sound';
import * as playthroughs from '../net/playthroughs';
import './select.css';
import { LinkPanel } from './link-panel';
import { ModelPanel } from './model-panel';
import { YouPanel } from './you-panel';
import type { PlaythroughPersona } from '../../../shared/persona';
import * as link from '../net/link';
import { gameRoot } from '../ui/game-stage';
import { markOpeningCardSeen, mountOpeningCard, shouldShowOpeningCard } from './opening-card';

export interface LandingAgent extends AgentInfo {
  link: LinkState;
  room: { scene: string; weather: string; weatherLevel: number; fog: number; state: RoomState | null } | null;
  /** Each pair's recap the player hasn't seen yet, by player id. */
  recaps: Record<string, string>;
  /** Where a new game with her starts: her start room's name and default time and weather (SET THE SCENE's header). */
  start: { name: string; timeOfDay: string | null; weather: string | null } | null;
}
export interface AgentsResponse {
  agents: LandingAgent[];
}
export interface LandingApi {
  agents(): Promise<AgentsResponse>;
  packScenes(pack: string): Promise<{ base: string; scenes: SceneDef[] }>;
  /** A direct character's model picker: her current model and the choices. */
  models(id: string): Promise<ModelEvent>;
  /** Saves a direct character's model (null: back to her default); rejects with the server's `error` string. */
  setModel(id: string, model: string | null): Promise<void>;
  /** The in-game link: is a key linked, its last 4 and credit. */
  link(): Promise<link.LinkInfo>;
  putLink(apiKey: string): Promise<link.LinkInfo | { error: link.LinkError }>;
  deleteLink(): Promise<void>;
  /** The shipped picks, recent models and (with q) the catalog's matches. */
  searchModels(q: string): Promise<link.ModelLists>;
  /** Every map district's name (the select screen's group labels). */
  districts?(): Promise<{ id: string; name: string }[]>;
}
/** Draws the selected agent's room behind the preview (a stub in tests). */
export interface PreviewLike {
  /** With a transition, the scene swap plays inside it (the glitch out of the splash). */
  show(agent: LandingAgent, opts?: { transition?: Transition }): Promise<void>;
  /** Draws the app's splash skyline; false when it can't (no WebGL, missing scene). */
  showSplash(): Promise<boolean>;
  /** True once the backdrop renders something (e2e hook). */
  nonBlank(): boolean;
  /** The backdrop room's frame in px (e2e hook). */
  frameSize(): [number, number];
  /** The backdrop's glitch transition alone, with no scene change. */
  glitch(): Promise<void>;
  dispose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export interface LandingOptions {
  /** Open on the splash: `host` holds the overlay (outside `root`, which the error states replace). */
  /** The splash's picked art (splashArt / sessionSplashArt); the built-in when absent. */
  splashArt?: SplashArt;
  splash?: {
    host: HTMLElement;
    reducedMotion: boolean;
    /** The browser blocked the theme until a gesture: the first key or click starts it, the next goes on. */
    needsSound?: boolean;
  };
  /** Where Esc on the title brings the splash back. Defaults to `splash.host`; without either, Esc on the title does nothing. */
  splashHost?: HTMLElement;
  /** No glitches, print-ins or pulses; the backdrop fades. Defaults to the splash's setting. */
  reducedMotion?: boolean;
  /** The splash was dismissed (the gesture that starts the theme). */
  onSplashDismiss?: () => void;
  /** The intro glitch (logo out, grid in) started: the static burst. */
  onIntroGlitch?: () => void;
  /** Esc on the title glitched the screen out and the splash back in: the static burst. */
  onSplashReturn?: () => void;
  /** The select screen's cues: the live cursor stepped to another tile, a fighter locked in, both locked (READY). */
  onCue?: (cue: 'move' | 'lock' | 'vs') => void;
  /** Runs before navigating into a room (the theme's fade); a second Enter meanwhile is ignored. */
  beforeNav?: () => Promise<void>;
  /** The browser restored this page from its back/forward cache (Back from a room). */
  onRestore?: () => void;
  /**
   * The title menu (save/load spec 2026-10-07 §6): the splash, or a mount that skips it, opens on
   * CONTINUE / NEW GAME / LOAD; NEW GAME runs the select, whose dial-in starts a playthrough, and
   * LOAD the load screen (Esc there comes back to the title).
   */
  title: { api: playthroughs.PlaythroughApi; sound(cue: TitleCue): void };
}

/** Keys that belong to the browser or the OS, not "any key": reload, shortcuts, Escape, a lone modifier. */
function isBrowserKey(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || ['Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key) || /^F\d+$/.test(e.key);
}

/** The grid glitches in this long after the logo starts glitching out. */
const INTRO_MS = 400;
/** The backdrop swaps once the AI cursor rests this long. */
const REST_MS = 150;
/** The model id standing in for "whatever she runs now" when her model couldn't be read. */
const KEEP = '';
/** How often the roster is re-polled for link/offline changes once the roster is up. */
export const POLL_MS = 15_000;
const SPLASH = Symbol('splash');

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const TITLES: Record<Exclude<Phase, 'model'>, string> = { p1: COPY.titleP1, you: COPY.you.title, p2: COPY.titleP2, ready: '' };


/** A direct contact with no key linked yet: pickable, and her model step opens on LINK A MIND. */
const isNoLink = (a: LandingAgent): boolean => a.backend === 'direct' && a.connected && a.link === 'no-link';

function toTile(id: string, a: LandingAgent | undefined): GridTile {
  if (!a) return { id, name: COPY.random, accent: '', thumb: null, avatar: null, avatarKind: 'monogram', offline: false, noLink: false };
  return {
    id,
    name: a.name,
    accent: a.accent,
    thumb: a.thumb,
    // Only a mask portrait is drawn from /avatar; a face is the tile's thumb.
    avatar: a.avatarKind === 'mask' ? `/api/agents/${encodeURIComponent(a.id)}/avatar` : null,
    avatarKind: a.avatarKind,
    offline: !canBeAi(a),
    noLink: isNoLink(a),
  };
}

/**
 * The character select (spec 2026-10-05): a roster grid bottom-centre, the player (green) and the
 * AI (magenta) standing at the sides with their files, a model pick for direct characters, then
 * //JACK IN Y/N to dial in. It opens on the title menu (NEW GAME enters the select); with
 * `opts.splash` the splash comes first, and the first key or click glitches the logo out and the
 * title in. Everything on the select is drawn from `flow.state` by one `render()` after each action.
 */
export function mountLanding(
  root: HTMLElement,
  api: LandingApi,
  nav: (path: string) => void,
  preview: PreviewLike,
  opts: LandingOptions,
):{ ready: Promise<void>; soundStarted(): void; dispose(): void } {
  const reducedMotion = opts.reducedMotion ?? opts.splash?.reducedMotion ?? false;
  root.classList.add('landing');
  root.classList.toggle('still', reducedMotion);
  const stage = mountStage(root);
  const title = el('div', 'select-title');
  const band = el('div', 'grid-band');
  const jackIn = el('div', 'jack-in', COPY.jackIn);
  const hints = el('div', 'select-hints');
  const dialError = el('div', 'dial-error');
  stage.el.append(title);
  const stripP1 = new FighterStrip(stage.el, 'p1', { reducedMotion });
  const stripP2 = new FighterStrip(stage.el, 'p2', { reducedMotion });
  /** Holds the title menu while it's up (the rest of the stage hides under `.titling`). */
  const titleHost = el('div', 'title-host');
  stage.el.append(band, jackIn, hints, dialError, titleHost);

  let flow: Flow | null = null;
  let byId = new Map<string, LandingAgent>();
  /** The model each direct AI was last given here, by id (READY shows it). */
  const picked = new Map<string, string>();
  /** The model step's panel: LINK A MIND or her model list, for the locked AI. */
  let panel: { kind: 'link' | 'model'; ai: string; obj: LinkPanel | ModelPanel } | null = null;
  /** Bumped on every panel change: a late answer for an older one is dropped. */
  let panelSeq = 0;
  /** The YOU step's panel, for the locked player (in its own host, which 1P's strip shows). */
  let you: { player: string; host: HTMLElement; obj: YouPanel; shown: boolean } | null = null;
  /** A pick being saved: Enter meanwhile does nothing. */
  let saving = false;
  let errorText: string | null = null;
  /** True from the splash's first frame until it's gone; keys meanwhile are swallowed. */
  let splashing = false;
  let leaving = false;
  /** What the backdrop shows (or is about to): the skyline or an agent's room. */
  let shown: string | typeof SPLASH | null = opts.splash ? SPLASH : null;
  /** Whether the skyline drew (the splash needs its own gradient when it didn't). */
  let skylineOk = true;
  const splashHost = opts.splashHost ?? opts.splash?.host ?? null;
  let swapTimer: ReturnType<typeof setTimeout> | null = null;
  let introTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  /** Whether the band has drawn its tiles (once, on the first render). */
  let bandDrawn = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Where the live cursor rests, or null outside P1/P2: a change is a step, and its cue. */
  const liveSpot = (): string | null => {
    const s = flow?.state;
    if (!s || (s.phase !== 'p1' && s.phase !== 'p2')) return null;
    return `${s.phase}:${s.cursor[s.phase]}`;
  };
  const stepped = (before: string | null) => {
    if (before !== null && liveSpot() !== before) opts.onCue?.('move');
  };

  const grid = new RosterGrid(band, {
    onHover(i) {
      if (!flow || leaving) return;
      const before = liveSpot();
      flow.hover(i);
      stepped(before);
      render();
    },
    onPick(i) {
      if (!flow || leaving || (flow.state.phase !== 'p1' && flow.state.phase !== 'p2')) return;
      flow.hover(i);
      lock();
    },
    onWheel(rows) {
      grid.scrollTo(grid.top + rows);
    },
  });
  grid.el.querySelector('.cursor.c1')?.append(el('span', 'lbl', COPY.cursorP1));
  grid.el.querySelector('.cursor.c2')?.append(el('span', 'lbl', COPY.cursorP2));

  const closePanel = () => {
    panelSeq++;
    panel?.obj.destroy();
    panel = null;
    saving = false;
  };

  /** YOU: the panel for the locked player, opened with the persona already chosen (back from p2); gone elsewhere. */
  const syncYou = () => {
    const s = flow?.state;
    const player = s?.phase === 'you' ? s.player : null;
    if (you && you.player === player) return;
    you?.obj.destroy();
    you = null;
    const a = player ? byId.get(player) : undefined;
    if (!player || !a) return;
    const host = el('div', 'panel-host');
    const obj = new YouPanel(host, {
      character: { name: a.name, pronoun: a.pronoun, tagline: a.tagline, bio: a.bio },
      initial: flow!.state.persona,
      onChoose: (persona) => {
        if (!flow || leaving) return;
        flow.chooseYou(persona);
        act();
      },
      onBack: () => {
        if (!flow || leaving) return;
        flow.back();
        act();
      },
      onChange: () => render(),
    });
    you = { player, host, obj, shown: false };
  };


  /** MODEL with no panel yet: LINK A MIND when no key is linked, else her model list. */
  const syncPanel = () => {
    const s = flow?.state;
    if (!flow || !s || s.phase !== 'model' || !s.ai) {
      // Always: a panel still loading for a step the player has left must never open.
      closePanel();
      return;
    }
    if (panel?.ai === s.ai) return;
    if (panel) closePanel();
    const ai = s.ai;
    const seq = ++panelSeq;
    // Her own link decides (a contact on a local endpoint needs no OpenRouter key); the OpenRouter
    // link only fills the model list's header.
    const needsKey = isNoLink(byId.get(ai)!);
    const fallback: link.LinkInfo = { linked: !needsKey, last4: null, credit: null, state: byId.get(ai)!.link };
    void api.link().then(
      (info) => seq === panelSeq && !disposed && (needsKey ? openLinkPanel(ai, false) : openModelPanel(ai, info)),
      () => seq === panelSeq && !disposed && (needsKey ? openLinkPanel(ai, false) : openModelPanel(ai, fallback)),
    );
  };

  function openLinkPanel(ai: string, changing: boolean, previous?: link.LinkInfo): void {
    closePanel();
    const host = el('div', 'panel-host');
    const obj = new LinkPanel(host, {
      put: (k) => api.putLink(k),
      changing,
      onLinked: (info) => {
        refreshRoster();
        openModelPanel(ai, info);
      },
      onBack: () => {
        if (changing && previous) openModelPanel(ai, previous);
        else {
          closePanel();
          flow!.back();
          act();
        }
      },
    });
    panel = { kind: 'link', ai, obj };
    render();
    obj.el.querySelector('input')?.focus();
  }

  function openModelPanel(ai: string, info: link.LinkInfo): void {
    closePanel();
    render();
    const seq = panelSeq;
    const a = byId.get(ai)!;
    // Her model as the server keeps it; unreadable, the panel offers what she runs now (KEEP).
    const keep: ModelEvent = { type: 'model', model: KEEP, provider: 'openrouter', label: a.modelLabel ?? '…', choices: [], default: KEEP };
    void api.models(ai).then(
      (e) => e,
      () => keep,
    ).then((agentModels) => {
      if (seq !== panelSeq || disposed) return;
      const obj = new ModelPanel(el('div', 'panel-host'), {
        link: info,
        pronoun: a.pronoun,
        agentModels,
        search: (q) => api.searchModels(q),
        onPick: (id) => void choose(ai, id, agentModels),
        onBack: () => {
          closePanel();
          flow!.back();
          act();
        },
        onChangeKey: () => openLinkPanel(ai, true, info),
        onUnlink: () => {
          const at = panelSeq;
          const still = () => at === panelSeq && !disposed && flow?.state.phase === 'model' && flow.state.ai === ai;
          void api.deleteLink().then(
            () => {
              refreshRoster();
              if (still()) openLinkPanel(ai, false);
            },
            (err: unknown) => {
              if (!still()) return;
              errorText = COPY.link.unlinkFailed(err instanceof Error ? err.message : String(err));
              render();
            },
          );
        },
      });
      panel = { kind: 'model', ai, obj };
      render();
    });
  }

  /** A row picked: saved at once (her model is a setting), then READY. KEEP changes nothing. */
  async function choose(ai: string, id: string | null, e: ModelEvent): Promise<void> {
    if (saving || leaving) return;
    const label = (m: string) => e.choices?.find((c) => c.id === m)?.label ?? m;
    const searchLabel = id && panel?.obj instanceof ModelPanel ? panel.obj.labelFor(id) : null;
    const at = panelSeq;
    if (id !== KEEP) {
      saving = true;
      errorText = null;
      try {
        await api.setModel(ai, id);
      } catch (err) {
        if (at !== panelSeq) return;
        saving = false;
        errorText = COPY.dialFailed(err instanceof Error ? err.message : String(err));
        render();
        return;
      }
      if (at !== panelSeq) return;
      saving = false;
    }
    if (disposed || flow?.state.phase !== 'model' || flow.state.ai !== ai) return;
    const shown = id === KEEP ? (e.label ?? byId.get(ai)?.modelLabel ?? '') : id === null ? label(e.default ?? e.model) : (searchLabel ?? label(id));
    picked.set(ai, shown);
    closePanel();
    flow.chooseModel();
    act();
  }

  /** READY shows the model she'll run (the strip's MODEL row). */
  const stripModels = (): StripModels | null => {
    const s = flow!.state;
    const a = s.ai ? byId.get(s.ai) : undefined;
    if (!a || a.backend !== 'direct' || s.phase !== 'ready') return null;
    const label = picked.get(a.id) ?? a.modelLabel ?? '…';
    return { state: 'ready', choices: [{ id: KEEP, label }], index: 0, confirmed: true };
  };

  const cancelSwap = () => {
    if (swapTimer !== null) clearTimeout(swapTimer);
    swapTimer = null;
  };
  /** The roster's district names, fetched once for the group labels. */
  const districts = new Map<string, string>();
  /** P1: the skyline. P2 on: the hovered (then locked) AI's room, once the cursor rests. */
  const backdrop = () => {
    // The title and LOAD own the backdrop while they're up (screenBackdrop); the select waits underneath.
    if (disposed || root.classList.contains('titling')) return;
    const s = flow!.state;
    cancelSwap();
    if (s.phase === 'p1') {
      if (shown !== SPLASH) {
        shown = SPLASH;
        void drawSkyline();
      }
      return;
    }
    const id = s.phase === 'p2' ? flow!.idAt('p2') : s.ai;
    const a = id ? byId.get(id) : undefined;
    // RANDOM and characters with no mind (no room) keep whatever is showing.
    if (!a || a.backend === 'none' || a.id === shown) return;
    swapTimer = setTimeout(() => {
      swapTimer = null;
      shown = a.id;
      void preview.show(a, { transition: reducedMotion ? 'fade' : 'glitch' }).catch(() => {});
    }, REST_MS);
  };

  /** Re-reads connected/link state (offline tiles, NO LINK tags) without moving cursors or locks. */
  function refreshRoster(): void {
    api.agents().then(
      (data) => {
        if (leaving || disposed || !flow) return;
        for (const a of data.agents) {
          if (byId.has(a.id)) byId.set(a.id, a);
        }
        flow.updateLinks(data.agents);
        grid.setOffline(new Set(flow.tiles.filter((id) => byId.has(id) && !canBeAi(byId.get(id)!))));
        grid.setNoLink(new Set(flow.tiles.filter((id) => byId.has(id) && isNoLink(byId.get(id)!))));
        render();
        titleMenu?.refresh();
        loadScreen?.refresh();
      },
      () => {},
    );
  }

  const stopPoll = () => {
    if (pollTimer === null) return;
    clearInterval(pollTimer);
    pollTimer = null;
  };
  /** Refreshes connected/link state (and so offline tiles) every `POLL_MS`, without moving cursors or locks. */
  const startPoll = () => {
    if (pollTimer !== null) return;
    pollTimer = setInterval(() => {
      if (leaving || disposed || !flow) return;
      refreshRoster();
    }, POLL_MS);
  };

  /** `COPY.hintGrid` and `COPY.hintBack`. */
  function renderHints(s: FlowState): void {
    hints.replaceChildren();
    if (s.phase === 'you') {
      hints.textContent = you?.obj.editing ? COPY.you.hintForm : COPY.you.hint;
      return;
    }
    if (s.phase === 'ready') {
      hints.textContent = COPY.hintReady;
      return;
    }
    if (s.phase !== 'p1' && s.phase !== 'p2') {
      hints.textContent = panel?.kind === 'link' ? COPY.link.hintLink : COPY.link.hint;
      return;
    }
    hints.textContent = `${COPY.hintGrid} · ${COPY.hintBack}`;
  }

  function loadDistricts(): void {
    if (!api.districts) return;
    api.districts().then(
      (list) => {
        if (disposed) return;
        for (const d of list) districts.set(d.id, d.name);
        grid.setGroupNames((g) => districts.get(g) ?? null);
      },
      () => {},
    );
  }

  function render(): void {
    if (!flow || disposed) return;
    const s = flow.state;
    if (!bandDrawn) {
      grid.render(flow.tiles.map((id) => toTile(id, byId.get(id))), { layout: flow.layout, groupName: (g) => districts.get(g) ?? null });
      bandDrawn = true;
      loadDistricts();
    }
    const picked = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
    const aiLocked = s.phase === 'model' || s.phase === 'ready';
    stage.el.dataset.phase = s.phase;
    grid.setCursor('p1', s.cursor.p1, { live: s.phase === 'p1', locked: s.phase !== 'p1' });
    grid.setCursor('p2', s.cursor.p2, { live: s.phase === 'p2', locked: aiLocked });
    stripP1.show(s.phase === 'p1' ? picked(flow.idAt('p1')) : picked(s.player), { locked: s.phase !== 'p1' });
    stripP1.showYou(s.phase === 'p1' || s.phase === 'you' ? null : s.persona);
    stripP1.setPanel(s.phase === 'you' && you ? you.host : null);
    // Built before its host was in the page, a reopened form (back from p2) gets its focus once shown.
    if (s.phase === 'you' && you && !you.shown) {
      you.shown = true;
      you.obj.focus();
    }
    stripP2.show(s.phase === 'p1' ? null : s.phase === 'p2' ? picked(flow.idAt('p2')) : picked(s.ai), { locked: aiLocked, player: s.player });
    stripP2.setModels(stripModels());
    stripP2.setPanel(s.phase === 'model' && panel ? panel.obj.el.parentElement : null);
    title.textContent =
      s.phase === 'model' ? (panel?.kind === 'link' ? COPY.link.titleLink : COPY.link.titleModel(byId.get(s.ai ?? '')?.pronoun ?? 'they')) : TITLES[s.phase];
    renderHints(s);
    dialError.textContent = errorText ?? '';
    backdrop();
  }

  /** The playthrough this dial-in already started, as JSON of {player, ai, persona} (a retry doesn't start another). */
  let started: string | null = null;
  /**
   * Enter on READY (New Game): start a playthrough, save the model into it, remember the matchup,
   * fade the theme, go. One attempt at a time.
   */
  const dial = async () => {
    if (!flow || leaving) return;
    const { player, ai, persona } = flow.state;
    if (!player || !ai) return;
    leaving = true;
    stopPoll();
    errorText = null;
    render();
    const fail = (text: string) => {
      leaving = false;
      startPoll();
      errorText = text;
      render();
    };
    const why = (err: unknown) => (err instanceof Error ? err.message : String(err));
    const match = JSON.stringify({ player, ai, persona });
    if (started !== match) {
      try {
        const create = opts.title.api.createPlaythrough;
        await (persona ? create(player, ai, persona) : create(player, ai));
        started = match;
      } catch (err) {
        if (err instanceof playthroughs.ApiError && err.error === 'busy') {
          const who = err.contact ?? '';
          return fail(COPY.dialBusy(byId.get(who)?.name ?? who));
        }
        return fail(COPY.newGameFailed(why(err)));
      }
    }
    // Her model was saved when it was picked (a setting, not part of the playthrough).
    // A cache only (the server's playthrough is the truth): NEW GAME starts its cursors here.
    rememberMatch({ player, ai });
    rememberAgent(ai);
    // No `?as=`: every turn in a playthrough uses its player.
    await leaveTo(`/room/${encodeURIComponent(ai)}`);
  };
  /** Fades the theme, then navigates. */
  async function leaveTo(path: string): Promise<void> {
    leaving = true;
    stopPoll();
    if (opts.beforeNav) await opts.beforeNav().catch(() => {});
    nav(path);
  }

  function lock(): void {
    if (!flow || leaving) return;
    const result = flow.lock();
    if (result === 'dial') {
      void dial();
      return;
    }
    if (result === 'refused') stripP2.shake();
    act();
  }
  /** The phase `act` last saw: a lock (P1 → YOU, P2 → model) and READY after P2 or the model step have cues. */
  let cuePhase: Phase | null = null;
  const phaseCue = () => {
    const now = flow?.state.phase ?? null;
    const was = cuePhase;
    cuePhase = now;
    if (!was || was === now) return;
    if (now === 'ready' && (was === 'p2' || was === 'model')) opts.onCue?.('vs');
    else if ((was === 'p1' && now === 'you') || (was === 'p2' && now === 'model')) opts.onCue?.('lock');
  };
  /** After any flow change: clear a stale error, open or close the YOU and model steps' panels, redraw. */
  const act = () => {
    if (disposed) return;
    phaseCue();
    errorText = null;
    syncYou();
    syncPanel();
    render();
  };

  let splash: Splash | null = null;
  let dismissing = false;
  /** Waiting for the gesture that lets the theme play; that gesture stays on the splash. */
  let awaitingSound = opts.splash?.needsSound ?? false;
  const soundStarted = () => {
    if (!awaitingSound) return;
    awaitingSound = false;
    splash?.arm();
  };
  /** A key or click on the splash: the first (when sound was blocked) starts the theme, the next goes on. */
  const splashGesture = () => {
    if (awaitingSound) soundStarted();
    else void dismissSplash();
  };
  /** The intro: the logo glitches out with the backdrop and the burst; the screen glitches in ~0.4 s later. */
  const dismissSplash = async () => {
    if (!splash || dismissing) return;
    dismissing = true;
    markSplashSeen();
    opts.onSplashDismiss?.();
    const out = splash.dismiss();
    if (!reducedMotion && !disposed) void preview.glitch().catch(() => {});
    opts.onIntroGlitch?.();
    introTimer = setTimeout(
      () => {
        introTimer = null;
        root.classList.remove('splashing');
        openTitle();
      },
      reducedMotion ? 0 : INTRO_MS,
    );
    await out;
    splash = null;
    dismissing = false;
    splashing = false;
    startPoll();
  };
  /** Draws the skyline behind the splash and P1, remembering whether it could. */
  function drawSkyline(): Promise<void> {
    return preview.showSplash().then(
      (ok) => {
        skylineOk = ok;
        splash?.setSceneOk(ok);
      },
      () => {
        skylineOk = false;
        splash?.setSceneOk(false);
      },
    );
  }
  /** Puts the splash overlay up over the (hidden) select screen. */
  const raiseSplash = (host: HTMLElement, intro = true) => {
    splashing = true;
    root.classList.add('splashing');
    splash = mountSplash(host, { reducedMotion, needsSound: awaitingSound, art: opts.splashArt, intro });
    splash.el.addEventListener('pointerdown', splashGesture);
  };
  let titleMenu: ReturnType<typeof mountTitle> | null = null;
  /**
   * The title's and LOAD's backdrop: an agent's room once the cursor rests (select's REST_MS and
   * transition), or the skyline (null) at once.
   */
  function screenBackdrop(id: string | null): void {
    if (disposed) return;
    cancelSwap();
    if (id === null) {
      if (shown !== SPLASH) {
        shown = SPLASH;
        void drawSkyline();
      }
      return;
    }
    const a = byId.get(id);
    if (!a || a.backend === 'none' || a.id === shown) return;
    swapTimer = setTimeout(() => {
      swapTimer = null;
      shown = a.id;
      void preview.show(a, { transition: reducedMotion ? 'fade' : 'glitch' }).catch(() => {});
    }, REST_MS);
  }
  /** The title menu over the skyline (or her room); the select waits hidden underneath. */
  function openTitle(): void {
    if (disposed) return;
    const t = opts.title;
    titleMenu?.destroy();
    cancelSwap();
    root.classList.add('titling');
    if (shown !== SPLASH) {
      shown = SPLASH;
      void drawSkyline();
    }
    titleMenu = mountTitle(titleHost, {
      api: t.api,
      nav: (path) => void leaveTo(path),
      onNewGame: newGame,
      onLoad: openLoad,
      onReport: () => openBugReport({ from: 'title', screenshot: null, onClose: () => {} }),
      sound: (cue) => t.sound(cue),
      agents: () => byId,
      backdrop: screenBackdrop,
      reducedMotion,
    });
    glitchIn([...titleHost.children] as HTMLElement[], { reducedMotion });
  }
  function closeTitle(): void {
    titleMenu?.destroy();
    titleMenu = null;
    root.classList.remove('titling');
  }
  let loadScreen: ReturnType<typeof mountLoad> | null = null;
  /** LOAD: the load screen takes the title's place (still over the skyline); Esc brings the title back. */
  function openLoad(): void {
    if (disposed) return;
    titleMenu?.destroy();
    titleMenu = null;
    const t = opts.title;
    loadScreen = mountLoad(titleHost, {
      api: t.api,
      nav: (path) => void leaveTo(path),
      back: () => {
        loadScreen?.destroy();
        loadScreen = null;
        openTitle();
      },
      sound: (cue) => t.sound(cue),
      agents: () => byId,
      reducedMotion,
    });
    // LOAD sits on the skyline: the rooms are in its tiles.
    screenBackdrop(null);
    glitchIn([...titleHost.children] as HTMLElement[], { reducedMotion });
  }
  /** NEW GAME: the select flow, from P1. */
  function newGame(): void {
    closeTitle();
    started = null;
    glitchIn([...grid.el.querySelectorAll<HTMLElement>('.tile'), stripP1.el, stripP2.el, title, hints], { reducedMotion });
    act();
  }

  if (opts.splash) {
    raiseSplash(opts.splash.host);
    void drawSkyline();
  }
  /** Esc on the title: the title goes, the logo glitches back in over the skyline (which the title already shows). */
  const returnToSplash = () => {
    if (!splashHost || splashing || leaving || disposed) return;
    stopPoll();
    cancelSwap();
    if (introTimer !== null) clearTimeout(introTimer);
    introTimer = null;
    closeTitle();
    // Her room may be up behind the title: the splash goes back over the skyline.
    if (shown !== SPLASH) {
      shown = SPLASH;
      void drawSkyline();
    }
    // Back from Esc the glitch-in is the logo's entrance: no power-on after it.
    raiseSplash(splashHost, false);
    splash!.setSceneOk(skylineOk);
    // The art, the logo and the prompt (the logo and prompt sit on the splash's own stage).
    glitchIn([...splash!.el.querySelectorAll<HTMLElement>('.splash-art, .splash-logo, .splash-wordmark, .splash-prompt')], { reducedMotion });
    if (!reducedMotion) void preview.glitch().catch(() => {});
    opts.onSplashReturn?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (splashing) {
      // Any key dismisses the splash; it (and any key during the glitch) never reaches the grid.
      // Browser keys pass through untouched: Ctrl+R / F5 still reload, Escape doesn't count.
      if (isBrowserKey(e)) return;
      e.preventDefault();
      // The title menu mounts mid-glitch: it must not hear the key either.
      e.stopImmediatePropagation();
      splashGesture();
      return;
    }
    // The load screen reads its own keys (Esc included).
    if (loadScreen) return;
    // The title menu reads its own keys; Esc there brings the splash back.
    if (titleMenu) {
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        returnToSplash();
      }
      return;
    }
    // The YOU panel reads its own keys; while its form is open the fields type (key() leaves them be).
    if (flow?.state.phase === 'you') {
      if (leaving) return;
      if (you?.obj.key(e)) e.preventDefault();
      return;
    }
    // The model step's panel reads its own keys (typing into search or the key field included).
    if (flow?.state.phase === 'model') {
      if (leaving) return;
      if (panel?.obj.key(e)) e.preventDefault();
      else if (!panel && e.key === 'Escape') {
        e.preventDefault();
        flow.back();
        act();
      }
      return;
    }
    // On READY the prompt is //JACK IN Y/N: Y answers like Enter, N like Escape.
    const yn = flow?.state.phase === 'ready' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const key = yn && (e.key === 'y' || e.key === 'Y') ? 'Enter' : yn && (e.key === 'n' || e.key === 'N') ? 'Escape' : e.key;
    const dir = ARROWS[key];
    if (!dir && key !== 'Enter' && key !== 'Escape') return;
    if (!flow) return;
    e.preventDefault();
    if (leaving) return;
    if (dir) {
      const before = liveSpot();
      flow.move(dir);
      stepped(before);
      act();
    } else if (key === 'Enter') lock();
    else if (flow.state.phase === 'p1') openTitle();
    else {
      flow.back();
      act();
    }
  };
  window.addEventListener('keydown', onKey);
  // After `onKey`, so it hears each key first and ignores the one that closes the title (NEW GAME's Enter).
  if (!opts.splash) openTitle();
  // Back from a room into a page the browser kept: it left mid-dial-in, so let it dial again (still on READY).
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    leaving = false;
    startPoll();
    opts.onRestore?.();
  };
  window.addEventListener('pageshow', onPageShow);

  const showMessage = (text: string) => {
    cancelSwap();
    // The title stays (CONTINUE doesn't need the roster); the message shows once NEW GAME is picked.
    stage.el.replaceChildren(el('div', 'select-message', text), titleHost);
  };

  const ready = api.agents().then(
    (data) => {
      if (disposed) return;
      if (data.agents.length === 0) {
        showMessage(COPY.empty);
        return;
      }
      byId = new Map(data.agents.map((a) => [a.id, a]));
      const f = createFlow(data.agents, { columns: COLUMNS });
      // NEW GAME starts on the last matchup's cursors (a cache; the playthrough is the truth).
      f.begin(lastMatch());
      flow = f;
      // Splash dismissal (not mount) starts the poll while a splash is up (spec §4.2); with
      // no splash (or one already dismissed), start it now.
      if (!splashing) startPoll();
      act();
      // A title (or LOAD) that opened before the roster came: its fighters and tiles redraw now.
      titleMenu?.refresh();
      loadScreen?.refresh();
    },
    () => {
      if (!disposed) showMessage(COPY.unreachable);
    },
  );

  return {
    ready,
    /** The theme started without a key (the browser let it play): the splash goes straight to PRESS ANY KEY. */
    soundStarted,
    dispose() {
      disposed = true;
      closePanel();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pageshow', onPageShow);
      stopPoll();
      cancelSwap();
      if (introTimer !== null) clearTimeout(introTimer);
      titleMenu?.destroy();
      loadScreen?.destroy();
      splash?.destroy();
      stage.dispose();
      root.classList.remove('landing', 'still', 'splashing');
      preview.dispose();
    },
  };
}

/** Entry point from main.ts. */
export async function startLanding(): Promise<void> {
  document.title = 'Dial-in · Nix Room';
  const root = document.createElement('div');
  gameRoot().append(root);
  const [{ createPreview }, { AudioEngine }, { createRoomAudio }] = await Promise.all([
    import('./preview'),
    import('../audio/engine'),
    import('../audio/room-audio'),
  ]);
  const host = document.getElementById('stage') ?? document.body;
  // Faint ambience of the selected agent's room, once the player clicks or presses a key.
  const engine = new AudioEngine();
  const audio = createRoomAudio({ engine, scale: 0.25 });
  // Registered before the landing's own key handler, so the splash's keypress unlocks audio first.
  const unlock = () => audio.gesture();
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => audio.visibility(document.hidden));
  // Warm the menu cues so the first press isn't the one paying for its fetch+decode (queued
  // if audio isn't unlocked yet; room-audio issues it on unlock).
  for (const url of Object.values(MENU_CUE_URL)) audio.preloadCue(url);
  const menuCue = menuCuePlayer(audio);

  // The theme Studio picked (the built-in on an error or no answer within 1 s), fetched as soon as it's
  // known so it's ready by the first key (the engine's fetch hits this cache).
  const themePick = fetch('/api/menu-theme', { signal: AbortSignal.timeout(1000) })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<MenuSong>>) : null))
    .then((t): MenuSong => (typeof t?.title === 'string' && typeof t.url === 'string' ? { title: t.title, url: t.url } : THEME))
    .catch(() => THEME);
  void themePick.then((t) => {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'fetch';
    preload.href = t.url;
    preload.crossOrigin = 'anonymous';
    document.head.append(preload);
  });

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const splash = shouldShowSplash();
  // The splash's image: picked from the library when it shows (≤ 1 s); else this session's pick, for Esc back to it.
  // Started now, awaited only just before the landing mounts: the theme, sound and preview don't wait on it.
  const artPick = splash ? splashArt() : Promise.resolve(sessionSplashArt() ?? undefined);
  // The theme, then the game's other songs shuffled; the PLAYING label follows what's heard.
  const songs = fetch('/api/songs')
    .then((r) => (r.ok ? (r.json() as Promise<{ songs: MenuSong[] }>) : { songs: [] }))
    .then((b) => b.songs);
  const theme = createTheme({ audio, onMusicEnded: (fn) => engine.onMusicEnded(fn), songs, theme: themePick });
  mountNowPlaying(gameRoot(), () => theme.title());
  // No splash (back from a room): the theme sits under the previews from the first gesture.
  if (!splash) theme.dialIn(0);
  // Splash: queue the theme and try to start sound now. Browsers that allow it (sites you use a lot,
  // the Electron app) play at once; otherwise the context waits, suspended, for the first key or click.
  let needsSound = false;
  if (splash) {
    theme.splash();
    audio.gesture();
    const s = audio.state();
    needsSound = s.available && s.context !== 'running';
  }
  // The opening card over everything while the splash mounts underneath, the theme under its text. With sound
  // blocked it opens on the sound prompt: that first key starts the theme and the typing together.
  if (shouldShowOpeningCard(splash)) {
    markOpeningCardSeen();
    const card = mountOpeningCard(gameRoot(), { reducedMotion, waitForSound: needsSound, onGesture: () => audio.gesture() });
    if (needsSound) engine.onStateChange(() => engine.state().context === 'running' && card.soundStarted());
  }

  const preview = createPreview(host, (pack) => fetch(`/api/packs/${encodeURIComponent(pack)}/scenes`).then((r) => r.json()), { audio });
  window.__lowlightLanding = { audio: () => audio.state(), nonBlank: () => preview.nonBlank(), frameSize: () => preview.frameSize() };
  const agentUrl = (id: string, rest: string) => `/api/agents/${encodeURIComponent(id)}/${rest}`;
  const art = await artPick;
  const landing = mountLanding(
    root,
    {
      agents: async () => {
        const res = await fetch('/api/agents');
        if (!res.ok) throw new Error(`/api/agents: HTTP ${res.status}`);
        return res.json() as Promise<AgentsResponse>;
      },
      packScenes: async (pack) => (await fetch(`/api/packs/${encodeURIComponent(pack)}/scenes`)).json(),
      models: async (id) => {
        const res = await fetch(agentUrl(id, 'models'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ModelEvent>;
      },
      link: () => link.getLink(),
      putLink: (k) => link.putLink(k),
      deleteLink: () => link.deleteLink(),
      searchModels: (q) => link.searchModels(q),
      districts: async () => {
        const res = await fetch('/api/district-list', { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return [];
        const list = (await res.json()) as { id?: unknown; name?: unknown }[];
        return list.flatMap((d) => (typeof d.id === 'string' && typeof d.name === 'string' ? [{ id: d.id, name: d.name }] : []));
      },
      setModel: async (id, model) => {
        const res = await fetch(agentUrl(id, 'model'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model }),
        });
        if (res.ok) return;
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      },
    },
    (p) => location.assign(p),
    preview,
    {
      splash: splash ? { host: gameRoot(), reducedMotion, needsSound } : undefined,
      splashHost: gameRoot(),
      splashArt: art,
      reducedMotion,
      onSplashDismiss: () => theme.splashDismissed(),
      onIntroGlitch: () => audio.burst(),
      onSplashReturn: () => audio.burst(),
      onCue: menuCue,
      beforeNav: () => theme.leave(),
      // Back from a room into a page the browser kept (bfcache): the theme was faded out for the dial-in.
      onRestore: () => theme.dialIn(THEME_IN_SECONDS),
      title: {
        api: playthroughs,
        sound: menuCue,
      },
    },
  );
  // If the browser lets the suspended context run without a key after all, skip the "for sound" step.
  if (needsSound) engine.onStateChange(() => engine.state().context === 'running' && landing.soundStarted());
}

/** `PLAYING: <TITLE>` in the window's bottom-left corner over the splash and the select; fades out between songs. */
function mountNowPlaying(host: HTMLElement, title: () => string | null): void {
  const el = document.createElement('div');
  el.className = 'now-playing';
  el.setAttribute('aria-live', 'polite');
  const name = document.createElement('span');
  el.append('PLAYING: ', name);
  host.append(el);
  let shown: string | null = null;
  setInterval(() => {
    const t = title();
    if (t === shown) return;
    shown = t;
    // The old title stays while it fades out.
    if (t !== null) name.textContent = t;
    el.classList.toggle('on', t !== null);
  }, 250);
}

/** E2E hook on the dial-in page (the room page has `__nixRoom`). */
export interface LowlightLandingHook {
  audio(): EngineState;
  nonBlank(): boolean;
  frameSize(): [number, number];
}

declare global {
  interface Window {
    __lowlightLanding?: LowlightLandingHook;
  }
}
