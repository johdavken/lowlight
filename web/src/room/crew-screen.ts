/**
 * CREW (crew spec 2026-10-19 §4): ROSTER, ERRANDS (`assign` in code) and HIRE as tabs of one panel, QUEST's size, in red.
 * It's the shared screen's holo pane (`scr-holo`, ui/screen.css): the room stays, blurred, behind it.
 * Alt+K opens it (main.ts) and closes it; Esc closes it; ← / → move between tabs, ↑ / ↓ between roster cards.
 * Actions go out over the ws (`act`); the screen fetches again when the relay says the crew changed (`refresh`).
 */
import type { CrewAction, CrewView } from '../../../shared/types';
import { bugReportOpen } from '../ui/bug-report';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../ui/screen';
import { assignTab, type AssignPick } from './crew-assign';
import { hireTab } from './crew-hire';
import { rosterTab } from './crew-roster';
import { el, keepScroll, sol } from './crew-ui';
import './crew-screen.css';

export type CrewTab = 'roster' | 'assign' | 'hire';
export const CREW_TABS: CrewTab[] = ['roster', 'assign', 'hire'];
const TAB_NAME: Record<CrewTab, string> = { roster: 'ROSTER', assign: 'ERRANDS', hire: 'HIRE' };
export const CREW_ACCENT = '#ff4d4d';

export interface CrewOpts {
  load(): Promise<CrewView | null>;
  act(a: CrewAction): void;
  tab?: CrewTab;
  /** The playthrough, for the seen-results mark. */
  playthrough: string;
  reducedMotion?: boolean;
  onClose?(): void;
}

export interface CrewHandle {
  close(instant?: boolean): void;
  /** Fetches the view again (an action landed, the clock moved); keeps the tab and the selection. */
  refresh(): void;
  show(tab: CrewTab): void;
  /** A refused action, said on the screen (the feed is behind it). */
  refusal(text: string): void;
  readonly tab: CrewTab;
}

/** The seen-results mark (per browser): the newest result time you've looked at. */
const seenKey = (pt: string) => `lowlight.crewSeen.${pt}`;
export function crewSeen(pt: string): number {
  try {
    return Number(localStorage.getItem(seenKey(pt)) ?? '-Infinity');
  } catch {
    return -Infinity;
  }
}
export function markCrewSeen(pt: string, at: number | null): void {
  if (at === null) return;
  try {
    localStorage.setItem(seenKey(pt), String(at));
  } catch {
    // per-viewer convenience only
  }
}

/** The CREW word's dot: a result landed since you last looked, a promotion's pick (crew abilities spec §4) or a job's free hire is waiting. */
export function crewDotOn(kit: { crewLatest: number | null; crewPicks?: boolean; crewFree?: boolean }, seen: number): boolean {
  return (kit.crewLatest !== null && kit.crewLatest > seen) || kit.crewPicks === true || kit.crewFree === true;
}

export function openCrew(host: HTMLElement, o: CrewOpts): CrewHandle {
  const screen = openScreen(host, {
    title: 'CREW',
    className: 'scr-holo crew-screen',
    label: 'Crew',
    accent: CREW_ACCENT,
    reducedMotion: o.reducedMotion,
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      if (instantClose) return void o.onClose?.();
      if (!o.reducedMotion) {
        window.addEventListener('keydown', swallowEsc, true);
        setTimeout(() => window.removeEventListener('keydown', swallowEsc, true), SCREEN_GLITCH_OUT_MS);
      }
      o.onClose?.();
    },
  });
  const swallowEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || bugReportOpen()) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const band = el('nav', 'cr-tabs');
  const tabs = CREW_TABS.map((t) => {
    const b = el('button', 'cr-tab');
    b.type = 'button';
    b.dataset.tab = t;
    b.addEventListener('click', () => show(t));
    return b;
  });
  const strip = el('div', 'cr-strip');
  const refused = el('div', 'cr-refusal');
  band.append(...tabs, refused);
  screen.head.replaceChildren(el('span', 'cr-title', '◆ CREW'), strip, el('span', 'cr-esc', 'ESC'));
  let refusedTimer: ReturnType<typeof setTimeout> | null = null;
  const pane = el('div', 'cr-pane');
  screen.body.append(band, pane);

  let tab: CrewTab = o.tab ?? 'roster';
  let v: CrewView | null = null;
  let picked: string | null = null;
  let assignFor: string | null = null;
  const assignPick: AssignPick = { row: null, who: null, where: null };
  let token = 0;

  function label(t: CrewTab): [string, string] {
    if (!v) return [TAB_NAME[t], ''];
    if (t === 'roster') return [TAB_NAME[t], `${v.used}/${v.slots}`];
    if (t === 'assign') {
      const out = v.roster.filter((m) => m.state === 'out').length;
      return [TAB_NAME[t], out > 0 ? `${out} OUT` : ''];
    }
    const n = v.hires.reduce((k, h) => k + h.cards.filter((c) => c.recruit).length, 0);
    return [TAB_NAME[t], n > 0 ? String(n) : ''];
  }

  function draw(): void {
    for (const b of tabs) {
      const t = b.dataset.tab as CrewTab;
      const [name, n] = label(t);
      const inner = el('span', '', name);
      if (n) inner.append(el('span', 'cr-n', n));
      b.replaceChildren(inner);
      b.classList.toggle('on', t === tab);
    }
    if (!v) return;
    const h = Math.floor(v.nextSix / 60);
    strip.textContent = `SOL ${sol(v.sol)} · WAGES −${sol(v.wages)} TONIGHT · 06:00 IN ${h}h ${v.nextSix % 60}m`;
    pane.dataset.tab = tab;
    keepScroll(pane, fill);
  }

  function fill(): void {
    if (!v) return;
    if (tab === 'roster') {
      const live = v.roster.filter((m) => m.state !== 'gone');
      if (!picked || !v.roster.some((m) => m.recruit.id === picked)) picked = live[0]?.recruit.id ?? v.roster[0]?.recruit.id ?? null;
      pane.replaceChildren(
        rosterTab(v, {
          picked,
          pick: (id) => {
            picked = id;
            draw();
          },
          act: o.act,
          assign: (id) => {
            assignFor = id;
            assignPick.row = null;
            assignPick.who = null;
            show('assign');
          },
        }),
      );
    } else if (tab === 'assign') {
      pane.replaceChildren(assignTab(v, { act: o.act, picked: assignFor, sel: assignPick }));
      markCrewSeen(o.playthrough, v.results[0]?.at ?? null);
    } else pane.replaceChildren(hireTab(v, { act: o.act }));
  }

  function load(): void {
    const mine = ++token;
    void o.load().then(
      (got) => {
        if (mine !== token || !screen.isOpen) return;
        v = got;
        if (!v) return void pane.replaceChildren(el('div', 'cr-empty', 'NO CREW WITHOUT A PLAYTHROUGH.'));
        draw();
      },
      () => {
        if (mine === token && screen.isOpen) pane.replaceChildren(el('div', 'cr-error', "Couldn't load your crew."));
      },
    );
  }

  function show(t: CrewTab): void {
    tab = t;
    if (t !== 'assign') assignFor = null;
    if (v) draw();
    else for (const b of tabs) b.classList.toggle('on', b.dataset.tab === t);
  }

  const typing = (n: Element | null) => (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) && screen.root.contains(n);
  const onKey = (e: KeyboardEvent) => {
    if (bugReportOpen()) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyK') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !typing(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      const i = CREW_TABS.indexOf(tab) + (e.key === 'ArrowLeft' ? -1 : 1);
      show(CREW_TABS[(i + CREW_TABS.length) % CREW_TABS.length]);
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tab === 'roster' && v && !typing(document.activeElement)) {
      e.preventDefault();
      e.stopPropagation();
      const ids = [...v.roster.filter((m) => m.state !== 'gone'), ...v.roster.filter((m) => m.state === 'gone')].map((m) => m.recruit.id);
      const i = Math.max(0, ids.indexOf(picked ?? '')) + (e.key === 'ArrowUp' ? -1 : 1);
      picked = ids[(i + ids.length) % ids.length] ?? picked;
      draw();
      pane.querySelector('.cr-tile.on')?.scrollIntoView?.({ block: 'nearest' });
    }
  };
  window.addEventListener('keydown', onKey, true);

  let instantClose = false;
  function close(instant = false): void {
    token++;
    instantClose = instant;
    screen.close(instant);
  }

  for (const b of tabs) b.classList.toggle('on', b.dataset.tab === tab);
  load();
  return {
    close,
    refresh: load,
    show,
    refusal(text) {
      refused.textContent = text;
      if (refusedTimer) clearTimeout(refusedTimer);
      refusedTimer = setTimeout(() => (refused.textContent = ''), 4000);
    },
    get tab() {
      return tab;
    },
  };
}
