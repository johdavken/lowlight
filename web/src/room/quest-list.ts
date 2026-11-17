/**
 * JOBS (quest lines spec §3; trace panel 2026-11-15, mockup jobs-trace.html): in the HUD trace (ui/trace-panel.ts), from
 * the HUD's JOBS key or Alt+Q. No pane: the list stands on the panel's rail, a leader runs from the picked job to its
 * file (title, terms, pitch, the one filled key) and its picture stands in the room at the right. HERE / ELSEWHERE /
 * RUMORS / FIXER are a list and a file; LEADS (Alt+L) and LOOSE ENDS (Alt+O) are pages to read, loaded with the first
 * state and each time it opens, and shown with nothing on them only while you've asked for them by key. The panel's
 * lines are the UI's red; a job that is someone's carries their colour. A state is a filled tag (white: yours; amber:
 * needs you; grey: can't yet), never red. ← → turn the tab, ↑ ↓ walk the list, Enter does the filled key.
 */
import type { LeadView, LooseEndsView, QuestState } from '../../../shared/types';
import { gearRule, gearStat } from '../../../shared/stock';
import { looseEndsTab } from './quest-loose-ends';
import { bugReportOpen } from '../ui/bug-report';
import { openScreen, TRACE_OUT_MS, type ScreenHandle } from '../ui/screen';
import { mountTracePanel, TRACE_RED, type TracePanel } from '../ui/trace-panel';
import { HEAT_MAX } from '../../../shared/mission';
import './quest-list.css';

/** The open quests in `state` not in `seen` (which learns them): what the "can start here" notice names. */
export function newlyOpen(seen: Set<string>, state: QuestState): QuestState['open'] {
  const fresh = state.open.filter((q) => !seen.has(q.id));
  for (const q of fresh) seen.add(q.id);
  return fresh;
}

/**
 * The "can start here" notice on a page that opens behind the arrival screen (2026-11-11): nobody reads it there, so
 * what turns up waits and shows once `release` says the room is in front of the player (a new game: her greeting is in).
 */
export function createJobNoticeHold<T>(show: (fresh: T[], held: boolean) => void, holding: boolean): { add(fresh: T[]): void; release(): void } {
  let pending: T[] = [];
  return {
    add(fresh) {
      if (fresh.length === 0) return;
      if (holding) pending.push(...fresh);
      else show(fresh, false);
    },
    release() {
      if (!holding) return;
      holding = false;
      const p = pending;
      pending = [];
      if (p.length > 0) show(p, true);
    },
  };
}

export interface QuestList {
  show(state: QuestState): void;
  toggle(): void;
  /** Alt+L / Alt+O: opens on that tab; on it already, closes. */
  openOn(tab: 'leads' | 'loose'): void;
  /** `instant`: a switch to another screen; gone at once, no draw-off. */
  close(instant?: boolean): void;
  /** Whether there's anything to list (the HUD shows QUEST only then). */
  has(): boolean;
  /** Heat where you stand (0–10), on the head line; `district` null: nowhere on the map, not shown. */
  setHeat(district: string | null, heat: number): void;
  /** Sol and tonight's NERVE, on the head line. */
  setPurse(sol: number, nerveLeft: number, nerveMax: number): void;
  readonly isOpen: boolean;
}

type Tab = 'here' | 'away' | 'rumors' | 'fixer' | 'leads' | 'loose';
type Rumor = NonNullable<QuestState['rumors']>[number];
type Open = QuestState['open'][number];
type Board = NonNullable<QuestState['boards']>[number];
type BoardJob = Board['jobs'][number];
/** A row on ELSEWHERE: the quest waiting, one in someone else's room, or a mission on another place's board. */
type Away = { key: string; kind: 'wait' | 'away' | 'job'; id: string; title: string; line: string; hint: string; art?: string; job?: BoardJob; place?: Board };

const TAB_NAME: Record<Tab, string> = { here: 'HERE', away: 'ELSEWHERE', rumors: 'RUMORS', fixer: 'FIXER', leads: 'LEADS', loose: 'LOOSE ENDS' };
/** The key line, per tab. */
const HINTS: Record<Tab, string> = {
  here: '[↑↓] JOB · [←→] TAB · [ENTER] START · [ESC] CLOSE',
  away: '[↑↓] JOB · [←→] TAB · [ENTER] GO THERE · [ESC] CLOSE',
  rumors: '[↑↓] RUMOR · [←→] TAB · [ENTER] GO · [ESC] CLOSE',
  fixer: '[↑↓] ITEM · [←→] TAB · [ENTER] BUY · [ESC] CLOSE',
  leads: '[←→] TAB · [ESC] CLOSE',
  loose: '[←→] TAB · [ESC] CLOSE',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const isJob = (q: Open) => Boolean(q.mission);
/** A board job elsewhere, as an open row for its terms. */
const asOpen = (j: BoardJob): Open => ({ id: j.id, title: j.title, pitch: j.pitch, ...(j.postedBy ? { postedBy: j.postedBy } : {}), ...(j.brief ? { brief: j.brief } : {}), timed: false, mission: { pay: j.pay, ...(j.tier !== undefined ? { tier: j.tier } : {}), ...(j.range ? { range: j.range } : {}) } });

/** A job's terms: MISSION · TIER 1 · 400 SOL, or a contact's client and its trust stake. */
function terms(q: Open): string | null {
  if (q.mission) {
    const r = q.mission.range;
    const pay = r && r[0] !== r[1] ? `${r[0]}–${r[1]} SOL` : q.mission.pay !== null ? `${q.mission.pay} SOL` : null;
    // A contact's own job (Intake board spec §3): whose client, and trust as its stake.
    // A `for:` job is the player's own, with the contact along: YOUR JOB, never her client.
    const tier = q.mission.tier !== undefined ? `TIER ${q.mission.tier}` : null;
    const comms = q.mission.comms ? ['COMMS', q.mission.comms.toUpperCase()] : [];
    const head = q.mission.own ? [`${q.mission.own.toUpperCase()}'S CLIENT`, ...comms] : q.mission.yours ? ['YOUR JOB', tier, ...comms] : ['MISSION', tier];
    return [...head, pay, q.mission.trust ? 'TRUST' : null].filter(Boolean).join(' · ');
  }
  return null;
}

/** The ELSEWHERE rows, in order: the wait, then other rooms. */
function awayRows(state: QuestState): Away[] {
  const rows: Away[] = [];
  // A contract under way: on this list, not on the room's waiting card, since it runs for days around everything else.
  if (state.arc) rows.push({ key: `arc:${state.arc.id}`, kind: 'wait', id: state.arc.id, title: state.arc.title, line: state.arc.next, hint: 'A CONTRACT', ...(state.arc.art ? { art: state.arc.art } : {}) });
  const w = state.waiting;
  if (w) rows.push({ key: `wait:${w.id}`, kind: 'wait', id: w.id, title: w.title, line: w.next, hint: w.comms ? 'ON COMMS' : w.here ? 'IT GOES ON HERE' : w.at ? `AT ${w.at.toUpperCase()}` : 'WAITING' });
  // Quests in someone else's room: listed so they're never lost; they go on only with that contact.
  for (const e of state.elsewhere) rows.push({ key: `away:${e.id}`, kind: 'away', id: e.id, title: e.title, ...(e.art ? { art: e.art } : {}), line: [`With ${e.contactName}`, e.next].filter(Boolean).join(' · '), hint: `GOES ON ONLY WITH ${e.contactName.toUpperCase()}` });
  // Tonight's missions on the other places' boards (2026-11-01), a group per place.
  for (const b of state.boards ?? []) {
    for (const j of b.jobs) {
      const hint = [`AT ${b.name.toUpperCase()}`, j.with ? `ONLY WITH ${j.with.toUpperCase()}` : null, j.opens ? `POSTS AT ${j.opens}` : null].filter(Boolean).join(' · ');
      rows.push({ key: `job:${b.place}:${j.id}`, kind: 'job', id: j.id, title: j.title, line: j.pitch ?? '', hint, job: j, place: b });
    }
  }
  return rows;
}

/** The board's moments that sound: the pick moves, a tab turns (`read`: onto a page to read), the filled key's doing,
 * a key that won't (`refused`), a rumor asking first (`aside`), and the board going with nothing done (`close`). */
export type BoardCue = 'move' | 'tab' | 'read' | 'start' | 'goto' | 'buy' | 'refused' | 'aside' | 'close';

export function mountQuestList(
  host: HTMLElement,
  o: { onStart(id: string): void; onOpen?(): void; /** The panel went (Esc, a click away, the key, nothing left on it). */ onClose?(): void; /** GO THERE on a board job elsewhere: the map's GO to its place. */ onGoTo?(place: string): void; /** GO TO on a rumor: you leave your contact for theirs. */ onGoToContact?(contact: string): void; /** BUY at the fixer (small jobs spec §5). */ onBuy?(item: string): void; /** WALK AWAY from a big job before its approach (big jobs spec §4). */ onWalk?(id: string): void; /** What LEADS and LOOSE ENDS list; absent or failed: nothing there. */ leads?(): Promise<LeadView[]>; looseEnds?(): Promise<LooseEndsView>; /** They came back: has() may have changed. */ onNotes?(): void; /** A moment of the board with a sound of its own (the page plays it). */ onCue?(cue: BoardCue): void; /** A contact's colour by their name, where the page knows it: their job carries it. */ accentOf?(name: string): string | undefined; reduced?(): boolean },
): QuestList {
  // The panel's parts outlive the screen: state lands while it's closed, so they wait in a hidden holder and move
  // into the trace screen each time it opens (its tabs and numbers onto the head line, the pane into its body).
  const holder = el('div', 'ql-host');
  holder.hidden = true;
  const tabsNav = el('div', 'ql-tabs');
  tabsNav.setAttribute('role', 'tablist');
  const noteBox = el('span', 'ql-notes');
  const numsBox = el('span', 'ql-nums');
  const pane = el('div', 'ql-pane');
  holder.append(tabsNav, noteBox, numsBox, pane);
  host.append(holder);
  /** Open from the player's side: it flips at once, while the screen still steps off for TRACE_OUT_MS. */
  let shown = false;
  let screen: ScreenHandle | null = null;
  let panel: TracePanel | null = null;
  let parkTimer: ReturnType<typeof setTimeout> | null = null;
  /** START and GO THERE close the board under their own sound: no close cue after them. */
  let acted = false;
  const cue = (c: BoardCue) => {
    if (c === 'start' || c === 'goto') acted = true;
    o.onCue?.(c);
  };
  const turned = () => cue(tab === 'leads' || tab === 'loose' ? 'read' : 'tab');
  const park = () => {
    if (parkTimer) clearTimeout(parkTimer);
    parkTimer = null;
    holder.append(tabsNav, noteBox, numsBox, pane);
  };

  const onKey = (e: KeyboardEvent) => {
    // The bug report is over everything: its keys are its own.
    if (bugReportOpen()) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // ↑ / ↓ move down the list, without wrapping, and never reach the room.
      e.preventDefault();
      e.stopPropagation();
      // A page to read (LEADS, LOOSE ENDS) has nothing to pick: they scroll it.
      const read = pane.querySelector<HTMLElement>('.ql-read');
      if (read) return void (read.scrollTop += e.key === 'ArrowUp' ? -64 : 64);
      const keys = rowKeys();
      const at = keys.indexOf(picked ?? '') + (e.key === 'ArrowUp' ? -1 : 1);
      if (keys.length === 0 || at < 0 || at >= keys.length) return;
      picked = keys[at];
      cue('move');
      render();
      pane.querySelector('.ql-list .ql-row.on')?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // ← / → turn the tab and wrap, as PEOPLE and CREW.
      e.preventDefault();
      e.stopPropagation();
      const all = tabs();
      if (all.length < 2) return;
      tab = all[(Math.max(0, all.indexOf(tab)) + (e.key === 'ArrowLeft' ? all.length - 1 : 1)) % all.length];
      picked = null;
      turned();
      render();
      return;
    }
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // Enter does the filled key (START, GO THERE, BUY), unless a button of the panel's own has the focus.
      const focus = document.activeElement;
      if (focus instanceof HTMLButtonElement && screen?.root.contains(focus) && !focus.classList.contains('ql-row')) return;
      const go = pane.querySelector<HTMLButtonElement>('.ql-go .tp-key.go:not(:disabled)');
      if (!go) {
        // A key that's there and locked, or a rumor or a shelf item with no key at all: it says no, once.
        const locked = pane.querySelector('.ql-go .tp-key.go:disabled') !== null || ((tab === 'rumors' || tab === 'fixer') && picked !== null);
        if (locked && !e.repeat) cue('refused');
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // A held Enter does it once (BUY doesn't close the panel; a rumor's LEAVE … FOR NOW? is a second, meant press).
      if (!e.repeat) go.click();
      return;
    }
    if (e.key !== 'Escape') return;
    // Capture phase: Esc closes the list and goes no further (not back to the dial-in).
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  };

  // The leader from the picked row to its file follows a redraw and a scroll.
  let queued = 0;
  const lead = () => {
    queued = 0;
    if (!panel || !screen?.isOpen) return;
    panel.lead('pick', pane.querySelector('.ql-list .ql-row.on'), pane.querySelector('.ql-file .ql-file-title'), { within: pane.querySelector('.ql-list'), fromGap: 6, toGap: 28, ...(pickHue ? { color: pickHue } : {}) });
  };
  const later = () => {
    if (!queued && panel) queued = requestAnimationFrame(lead);
  };
  pane.addEventListener('scroll', later, true);
  pane.addEventListener('load', later, true);

  /** `instant`: a switch to another screen, so no step-off over it. */
  function setOpen(open: boolean, instant = false): void {
    if (open === shown) return;
    if (!open) return void screen?.close(instant);
    shown = true;
    acted = false;
    const reduced = o.reduced?.() ?? false;
    let instantClose = false;
    const sc = openScreen(host, {
      title: 'JOBS',
      className: 'scr-trace quest-screen',
      hotkey: 'Q',
      label: 'Jobs',
      accent: TRACE_RED,
      reducedMotion: reduced,
      // Every way out comes through here: Esc, the key, a click on the backdrop, START.
      onClose: () => {
        shown = false;
        window.removeEventListener('keydown', onKey, true);
        mine.destroy();
        if (queued) cancelAnimationFrame(queued);
        queued = 0;
        if (panel === mine) panel = null;
        if (screen === sc) screen = null;
        // The parts stay on the screen while it steps off, unless it opened again meanwhile (they're over there).
        // Esc isn't held meanwhile: START goes straight on to the table, whose own Esc (the archive) mustn't be eaten.
        if (reduced || instantClose) park();
        else parkTimer = setTimeout(() => {
          parkTimer = null;
          if (!shown) park();
        }, TRACE_OUT_MS);
        if (!instantClose && !acted) cue('close');
        o.onClose?.();
      },
    });
    const close = sc.close;
    sc.close = (now = false) => {
      instantClose = now;
      close(now);
    };
    const mine = mountTracePanel(sc, { title: 'JOBS' });
    screen = sc;
    panel = mine;
    if (parkTimer) clearTimeout(parkTimer);
    parkTimer = null;
    mine.tabs.append(tabsNav);
    mine.note.append(noteBox);
    mine.nums.append(numsBox);
    sc.body.append(pane);
    mine.hints(HINTS[tab]);
    window.addEventListener('keydown', onKey, true);
    o.onOpen?.();
    lead();
    later();
  }
  let state: QuestState = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };
  let tab: Tab = 'here';
  /** The picked row: an open quest's id, or an ELSEWHERE row's key. */
  let picked: string | null = null;
  /** The picked row's own colour (a contact's job: theirs); null: the panel's. */
  let pickHue: string | null = null;
  const hue = (name: string | null | undefined): string | null => (name ? (o.accentOf?.(name) ?? null) : null);

  let leads: LeadView[] = [];
  let loose: LooseEndsView = { open: [], solved: [] };
  let noted = false;
  const looseCount = () => loose.open.length + loose.solved.length;
  /** Open leads first, then the followed ones. */
  const leadRows = () => [...leads.filter((l) => !l.followed), ...leads.filter((l) => l.followed)];
  /** Fresh leads and loose ends; each failed or absent one keeps what it had. */
  const loadNotes = () => {
    // Drawn again only if they changed: a redraw under the pointer would swallow a click on a row.
    const got = (was: unknown, now: unknown) => {
      if (JSON.stringify(was) === JSON.stringify(now)) return;
      render();
      o.onNotes?.();
    };
    void o.leads?.().then((v) => {
      const was = leads;
      leads = v;
      got(was, v);
    }, () => {});
    void o.looseEnds?.().then((v) => {
      const was = loose;
      loose = v;
      got(was, v);
    }, () => {});
  };
  const count = (t: Tab) => (t === 'here' ? state.open.length : t === 'away' ? awayRows(state).length : t === 'rumors' ? (state.rumors?.length ?? 0) : t === 'fixer' ? (state.fixer?.items.length ?? 0) : t === 'leads' ? leads.length : looseCount());
  const tabs = (): Tab[] => (['here', 'away', 'rumors', 'fixer', 'leads', 'loose'] as Tab[]).filter((t) => count(t) > 0 || (t === tab && (t === 'leads' || t === 'loose')));
  /** Story quests first, then jobs (played on the table). */
  const hereRows = () => [...state.open.filter((q) => !isJob(q)), ...state.open.filter(isJob)];

  /** The rows of the tab up, by the key `picked` holds (LEADS and LOOSE ENDS are read, not picked from). */
  const rowKeys = (): string[] => (tab === 'here' ? hereRows().map((q) => q.id) : tab === 'away' ? awayRows(state).map((a) => a.key) : tab === 'rumors' ? (state.rumors ?? []).map((r) => r.id) : tab === 'fixer' ? (state.fixer?.items ?? []).map((i) => i.id) : []);

  /** Tonight's numbers on the head line: sol, NERVE, and heat where you stand (main.ts passes them on each kit). */
  let heat: { district: string; heat: number } | null = null;
  let purse: { sol: number; nerveLeft: number; nerveMax: number } | null = null;
  const nums = () => {
    const sep = () => el('i', undefined, ' · ');
    const parts: (Node | string)[] = [];
    if (purse) parts.push('SOL ', el('b', undefined, purse.sol.toLocaleString('en-US')), sep(), 'NERVE ', el('b', undefined, `${purse.nerveLeft} / ${purse.nerveMax}`));
    if (heat) {
      if (parts.length) parts.push(sep());
      const n = el('span', heat.heat > 0 ? 'ql-hot' : 'ql-cool', `HEAT ${heat.heat}`);
      n.title = `${heat.district.replace(/-/g, ' ').toUpperCase()} HEAT ${heat.heat} / ${HEAT_MAX}`;
      parts.push(n);
    }
    // NERVE gone (the table spec §3): it takes the numbers' place; the jobs grey out and START waits for 06:00.
    if (state.nerveGone) return void numsBox.replaceChildren(el('span', 'ql-nerve', `NERVE GONE · NO NEW JOB UNTIL ${state.nerveGone.back}`));
    numsBox.replaceChildren(...parts);
  };

  /** A section head inside a list or a file. */
  const group = (text: string, cls = 'ql-group') => el('div', `${cls} tp-head`, text);

  const render = () => {
    const shownTabs = tabs();
    if (!shownTabs.includes(tab)) tab = shownTabs[0] ?? 'here';
    const keys = rowKeys();
    if (picked === null || !keys.includes(picked)) picked = keys[0] ?? null;
    pickHue = null;

    pane.dataset.tab = tab;
    nums();
    noteBox.replaceChildren(...(state.changed ? [el('span', 'ql-changed', state.changed)] : []));
    tabsNav.replaceChildren(
      ...shownTabs.map((t) => {
        const b = el('button', `ql-tab tp-tab${t === tab ? ' on' : ''}`, TAB_NAME[t]);
        b.type = 'button';
        b.dataset.tab = t;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t === tab));
        b.append(' ', el('span', 'tp-n', String(count(t))));
        b.onclick = () => {
          if (tab !== t) {
            tab = t;
            turned();
          }
          picked = null;
          render();
        };
        return b;
      }),
    );
    const top = pane.querySelector('.ql-list')?.scrollTop ?? 0;
    const parts: HTMLElement[] = [];
    if (shownTabs.length > 0) {
      const body = el('div', 'ql-body');
      if (tab === 'loose') body.append(looseEndsTab(loose));
      else if (tab === 'leads') body.append(leadPage());
      else {
        const list = el('div', 'ql-list tp-list');
        list.setAttribute('role', 'listbox');
        if (tab === 'here') list.append(...hereList());
        else if (tab === 'rumors') list.append(...rumorList());
        else if (tab === 'fixer') list.append(...fixerList());
        else list.append(...awayList());
        const q = tab === 'here' ? state.open.find((x) => x.id === picked) : undefined;
        const a = tab === 'away' ? awayRows(state).find((x) => x.key === picked) : undefined;
        const r = tab === 'rumors' ? state.rumors?.find((x) => x.id === picked) : undefined;
        const it = tab === 'fixer' ? state.fixer?.items.find((x) => x.id === picked) : undefined;
        const file = el('div', 'ql-file tp-file');
        if (it) file.append(...fixerFile(it));
        else if (r) file.append(...rumorFile(r));
        else if (q) file.append(...questFile(q));
        else if (a?.job) file.append(...boardFile(a, a.job, a.place!));
        else if (a) file.append(...awayFile(a));
        if (pickHue) file.style.setProperty('--c', pickHue);
        if (tab === 'fixer') body.classList.add('ql-fixer');
        body.append(list, file);
      }
      parts.push(body);
    }
    pane.replaceChildren(...parts);
    const list = pane.querySelector('.ql-list');
    if (list) list.scrollTop = top;
    panel?.hints(HINTS[tab]);
    later();
  };

  /** A row of the list: picked by a click; `name`: whose job it is, for its colour. */
  const pick = (row: HTMLElement, key: string, name?: string | null) => {
    const c = hue(name);
    row.classList.add('tp-row');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(key === picked));
    if (c) row.style.setProperty('--c', c);
    if (key === picked) {
      row.classList.add('on');
      pickHue = c;
    }
    row.onclick = () => {
      if (picked !== key) cue('move');
      picked = key;
      render();
    };
  };

  const hereList = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    const stories = state.open.filter((q) => !isJob(q));
    const jobs = state.open.filter(isJob);
    // Each group headed when both are here.
    const both = stories.length > 0 && jobs.length > 0;
    for (const q of hereRows()) {
      const job = isJob(q);
      if (both && (q === stories[0] || q === jobs[0])) out.push(group(job ? 'ON THE TABLE' : 'STORY'));
      const row = el('button', `ql-row ${job ? 'ql-job' : 'ql-story'}${q.once ? ' ql-once' : ''}`);
      row.type = 'button';
      const title = el('span', 'ql-title', q.title);
      // A one-off job (once: true): it won't come round again.
      if (q.once) title.append(el('span', 'ql-once-tag tp-tag', 'ONE-OFF'));
      const t = terms(q);
      // NERVE gone (the table spec §3) and the arrangement's nights used up (spec 2026-10-20 §2): greyed.
      if (q.locked) row.classList.add('ql-locked');
      if (q.mission?.capped) row.classList.add('ql-capped');
      row.append(title, q.mission ? el('span', 'ql-mission', t!) : el('span', 'ql-kind', 'STORY'));
      pick(row, q.id, q.mission?.own);
      out.push(row);
    }
    return out;
  };

  /** A locked Tier 2 Chair's requirements (spec 2026-11-01 §1): ✓ or ✗, the label, the progress. */
  const checkList = (checks: NonNullable<Open['checks']>): HTMLElement => {
    const ul = el('ul', 'ql-checks');
    for (const c of checks) {
      const li = el('li', `ql-check${c.ok ? ' ok' : ''}`);
      li.append(el('span', 'ql-check-mark', c.ok ? '✓' : '✗'), el('span', 'ql-check-label', c.label));
      if (c.progress) li.append(el('span', 'ql-check-progress', c.progress));
      ul.append(li);
    }
    return ul;
  };

  /** The job's picture, standing in the room at the file's right (trace panel); none: nothing there. */
  const art = (src: string | undefined) => {
    const a = el('div', src ? 'ql-art' : 'ql-art ql-noart');
    if (src) a.style.backgroundImage = `url('${src}')`;
    return a;
  };

  /** A state on the file's terms line, as a filled tag: `has` white (yours, in hand), `warn` amber (needs you), else grey (can't yet). */
  const chip = (cls: string, text: string, kind: 'has' | 'warn' | 'cant' = 'cant') => el('span', `ql-chip ${cls} tp-tag ${kind}`.replace(/\s+/g, ' '), text);

  /** A job's file text: the pitch, who posted it, what's involved. */
  const filed = (f: { pitch: string | null; postedBy?: string; brief?: string }): HTMLElement[] => [
    ...(f.pitch ? [el('p', 'ql-pitch', f.pitch)] : []),
    ...(f.postedBy ? [group('POSTED BY', 'ql-sub'), el('p', 'ql-postedby tp-prose', f.postedBy)] : []),
    ...(f.brief ? [group('THE JOB', 'ql-sub'), el('p', 'ql-brief tp-prose', f.brief)] : []),
  ];

  /** The foot of a file: what the key does, over the key (Enter's is filled). */
  const foot = (hint: string, ...keys: HTMLElement[]): HTMLElement => {
    const go = el('div', 'ql-go');
    go.append(el('span', 'ql-hint', hint), ...keys);
    return go;
  };
  const key = (cls: string, text: string, kind = 'go') => {
    const b = el('button', `${cls} tp-key ${kind}`, text);
    b.type = 'button';
    return b;
  };

  const questFile = (q: Open): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('h2', 'ql-file-title tp-name', q.title.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', `ql-file-tag${q.mission?.own ? ' ql-trust' : isJob(q) ? '' : ' ql-storytag'}`, terms(q) ?? 'STORY'));
    if (q.timed) meta.append(chip('ql-timed', 'HAS A DEADLINE', 'warn'));
    if (q.once) meta.append(chip('ql-file-once', 'ONE-OFF', 'warn'));
    if (q.mission?.cased) meta.append(chip('ql-cased', 'CASED', 'has'));
    if (q.outfit) meta.append(chip('ql-outfit', `OUTFIT · ${q.outfit}`));
    inner.append(meta, ...filed(q));
    // Crew (spec 2026-10-19 §2): a SCOUT shows tonight's draws and pay.
    const sc = q.mission?.scouted;
    if (sc) {
      const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');
      inner.append(group('SCOUTED', 'ql-sub'), el('div', 'ql-scouted', [sc.pay !== null ? `PAY ${sc.pay}` : null, ...Object.entries(sc.draws).map(([k, v]) => `${up(k)}: ${up(v)}`)].filter(Boolean).join(' · ')));
    }
    const start = key('ql-start', 'START');
    start.onclick = () => {
      cue('start');
      setOpen(false);
      o.onStart(q.id);
    };
    let hint = isJob(q) ? 'PLAYS ON THE TABLE · SETUP NEXT' : 'PLAYS IN THE ROOM';
    if (q.mission?.capped) {
      inner.append(el('div', 'ql-capped-note', `${q.mission.capped.toUpperCase()} IS DONE TONIGHT`));
      start.disabled = true;
      hint = '';
    }
    if (q.locked) {
      inner.append(el('div', 'ql-locked-note', q.locked));
      // A locked Tier 2 Chair (spec 2026-11-01 §1): what it still needs.
      if (q.checks) inner.append(checkList(q.checks));
      start.disabled = true;
      hint = '';
    }
    return [art(q.art), inner, foot(hint, start)];
  };

  const rumorList = (): HTMLElement[] =>
    (state.rumors ?? []).map((r) => {
      const row = el('button', 'ql-row ql-story');
      row.type = 'button';
      row.append(el('span', 'ql-title', r.contactName), el('span', 'ql-line', r.needs ? `${r.placeName} · REP ${r.needs}` : r.placeName));
      pick(row, r.id, r.contactName);
      return row;
    });

  /** A rumor: its line, and the way to it. Leaving your contact asks first (tier 3 contracts spec §5). */
  const rumorFile = (r: Rumor): HTMLElement[] => {
    const inner = el('div', 'ql-in ql-plain');
    inner.append(el('h2', 'ql-file-title tp-name', r.contactName.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', 'ql-file-tag ql-storytag', `HEARD · ${r.placeName.toUpperCase()}`));
    if (r.needs) meta.append(chip('ql-needs', `NEEDS REP ${r.needs}`));
    inner.append(meta, el('p', 'ql-pitch', r.line));
    if (r.needs) {
      inner.append(el('p', 'ql-locked-note', `NEEDS REP ${r.needs}`));
      return [inner];
    }
    const button = key('ql-goto', r.here ? 'START' : `GO TO ${r.contactName.toUpperCase()}`);
    let asked = false;
    button.onclick = () => {
      if (r.here) {
        cue('start');
        setOpen(false);
        return o.onStart(r.id);
      }
      if (r.leaving === null) {
        cue('goto');
        setOpen(false);
        return o.onGoTo?.(r.place);
      }
      if (!asked) {
        asked = true;
        cue('aside');
        button.textContent = `LEAVE ${r.leaving.toUpperCase()} FOR NOW?`;
        return;
      }
      cue('goto');
      setOpen(false);
      o.onGoToContact?.(r.contact);
    };
    return [inner, foot(`AT ${r.placeName.toUpperCase()}`, button)];
  };

  /** ELSEWHERE's rows: yours in progress first, then each other place's board under its name. */
  const awayList = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    let place: string | null = null;
    for (const a of awayRows(state)) {
      if (a.place && a.place.place !== place) {
        place = a.place.place;
        out.push(group(`${a.place.name.toUpperCase()} · TONIGHT`));
      }
      out.push(a.job ? boardRow(a, a.job) : awayRow(a));
    }
    return out;
  };

  const awayRow = (a: Away): HTMLElement => {
    const row = el('button', `ql-row ${a.kind === 'wait' ? 'ql-waiting' : 'ql-elsewhere'}`);
    row.type = 'button';
    const who = a.kind === 'wait' ? null : (state.elsewhere.find((e) => e.id === a.id)?.contactName ?? null);
    row.append(el('span', 'ql-title', a.title), el('span', 'ql-kind', a.kind === 'wait' ? 'WAITING' : (who ?? '').toUpperCase()));
    pick(row, a.key, who);
    return row;
  };

  /** A mission on another place's board: HERE's job row and its terms, with whose it is or when it posts. */
  const boardRow = (a: Away, j: BoardJob): HTMLElement => {
    const row = el('button', `ql-row ql-job ql-board${j.with || j.opens ? ' ql-later' : ''}`);
    row.type = 'button';
    const title = el('span', 'ql-title', a.title);
    if (j.once) title.append(el('span', 'ql-once-tag tp-tag', 'ONE-OFF'));
    row.append(title, el('span', 'ql-mission', [terms(asOpen(j)), j.with ? `WITH ${j.with.toUpperCase()}` : null, j.opens ? `FROM ${j.opens}` : null].filter(Boolean).join(' · ')));
    pick(row, a.key, j.with);
    return row;
  };

  const boardFile = (a: Away, j: BoardJob, b: Board): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('h2', 'ql-file-title tp-name', a.title.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', 'ql-file-tag', terms(asOpen(j))!));
    if (j.with) meta.append(chip('ql-with', `WITH ${j.with.toUpperCase()}`));
    if (j.comms) meta.append(chip('', `COMMS · ${j.comms.toUpperCase()}`));
    if (j.opens) meta.append(chip('ql-timed', `POSTS AT ${j.opens}`));
    if (j.once) meta.append(chip('ql-file-once', 'ONE-OFF', 'warn'));
    if (j.outfit) meta.append(chip('ql-outfit', `OUTFIT · ${j.outfit}`));
    inner.append(meta, ...filed(j));
    const goTo = key('ql-goto', 'GO THERE');
    goTo.onclick = () => {
      cue('goto');
      setOpen(false);
      o.onGoTo?.(b.place);
    };
    return [art(j.art), inner, foot(a.hint, goTo)];
  };

  const awayFile = (a: Away): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('h2', 'ql-file-title tp-name', a.title.toUpperCase()), el('p', 'ql-line ql-pitch', a.line));
    // A contract's groundwork: what's still to send (from CREW), out, and back.
    const arc = a.kind === 'wait' && state.arc?.id === a.id ? state.arc : null;
    if (arc?.pieces?.length) inner.append(group('GROUNDWORK', 'ql-sub'));
    for (const p of arc?.pieces ?? []) inner.append(el('p', 'ql-line ql-piece', `${p.id.toUpperCase()} · ${p.state === 'back' ? 'BACK' : p.state === 'out' ? 'OUT' : `SEND ${p.spec.toUpperCase()}`}`));
    const keys: HTMLElement[] = [];
    // A contract before its night can be walked away from.
    if (arc?.walk) {
      const walk = key('ql-walk', 'WALK AWAY', 'soft');
      walk.onclick = () => {
        setOpen(false);
        o.onWalk?.(a.id);
      };
      keys.push(walk);
    }
    return [art(a.art), inner, foot(a.hint, ...keys)];
  };

  /** LEADS, to read: each lead's title, what was said and who it points to (a ? before you've met them); the followed ones apart, struck. */
  const leadPage = (): HTMLElement => {
    const page = el('div', 'ql-read ql-leads');
    if (leads.length === 0) {
      page.append(el('div', 'ql-none', 'No leads yet. People tell you things; the useful ones end up here.'));
      return page;
    }
    const one = (l: LeadView): HTMLElement => {
      const n = el('article', `ql-lead${l.followed ? ' ql-followed' : ''}`);
      const to = el('span', 'ql-kind', `→ ${l.met ? l.toName.toUpperCase() : '?'}${l.place ? ` · ${l.place}` : ''}`);
      const c = l.met ? hue(l.toName) : null;
      if (c) to.style.color = c;
      n.append(el('div', 'ql-title', l.title), el('p', 'ql-lead-text', l.details), to);
      return n;
    };
    const open = leads.filter((l) => !l.followed);
    const done = leads.filter((l) => l.followed);
    const col = (head: HTMLElement, rows: LeadView[]) => {
      const c = el('div', 'ql-col');
      head.append(' ', el('small', undefined, String(rows.length)));
      c.append(head, ...rows.map(one));
      return c;
    };
    page.append(col(group('OPEN', 'ql-sub'), open));
    if (done.length > 0) {
      const head = group('FOLLOWED');
      head.classList.add('quiet');
      page.append(col(head, done));
    }
    return page;
  };

  // The fixer at a board (small jobs spec §5), on the trace panel as the jobs are: each item a row with its price, the
  // picked one's file beside it with its picture (web/public/gear/, a program's card), what it does, and BUY at your
  // tier there with the sol for it.
  type Item = NonNullable<QuestState['fixer']>['items'][number];
  const why = (item: Item) => (item.state === 'locked' ? `TIER ${item.tier}` : item.state === 'owned' ? 'YOU HAVE ONE' : 'NOT ENOUGH SOL');
  const fixerList = (): HTMLElement[] => {
    const out: HTMLElement[] = [group('FOR SALE HERE')];
    for (const item of state.fixer?.items ?? []) {
      const row = el('button', `ql-row ql-item ${item.state}${item.id === picked ? ' ql-picked' : ''}`);
      row.type = 'button';
      row.dataset.item = item.id;
      // Why it can't be bought leads the line, so a long deck's numbers never push it off the row.
      const sub = el('span', 'ql-item-stat');
      if (item.state !== 'ok') sub.append(el('b', 'ql-row-why', why(item)), ' · ');
      sub.append(gearStat(item));
      row.append(el('span', 'ql-item-name ql-title', item.name.toUpperCase()), el('span', 'ql-item-price', `${item.price} SOL`), sub);
      pick(row, item.id);
      out.push(row);
    }
    return out;
  };

  const fixerFile = (it: Item): HTMLElement[] => {
    const pic = el('div', 'ql-art ql-gear');
    const img = el('img');
    // A program shows its card's picture (owned programs); gear its shelf picture.
    img.src = it.kind === 'program' ? `/programs/${it.id}.webp` : `/gear/${it.id}.webp`;
    img.alt = '';
    // No picture for it yet: nothing stands there.
    img.onerror = () => pic.classList.add('ql-noart');
    pic.append(img);
    const inner = el('div', 'ql-in');
    inner.append(el('h2', 'ql-file-title tp-name', it.name.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', 'ql-file-tag', `${gearStat(it)} · ${it.price} SOL`));
    if (it.state !== 'ok') meta.append(chip('ql-item-why', why(it), it.state === 'owned' ? 'has' : 'cant'));
    const rule = el('div', 'ql-gear-rule');
    rule.append(el('span', 'ql-gear-rule-name', it.name.toUpperCase()), el('p', 'ql-brief tp-prose', gearRule(it)));
    inner.append(meta, group('WHAT IT DOES', 'ql-sub'), rule);
    const keys: HTMLElement[] = [];
    if (it.state === 'ok') {
      const buy = key('ql-buy', `BUY · ${it.price}`);
      buy.onclick = () => {
        cue('buy');
        o.onBuy?.(it.id);
      };
      keys.push(buy);
    }
    return [pic, inner, foot(it.state === 'ok' ? 'YOURS TO KEEP' : why(it), ...keys)];
  };

  return {
    show(s) {
      state = s;
      render();
      // The first state of a page: what LEADS and LOOSE ENDS hold, so QUEST is on the bar for them alone too.
      if (!noted) {
        noted = true;
        loadNotes();
      }
      if (!this.has() && tab !== 'leads' && tab !== 'loose') setOpen(false);
    },
    toggle() {
      // Each time it opens: HERE (or the first tab with something), its first row.
      if (!shown && this.has()) {
        tab = 'here';
        picked = null;
        render();
        loadNotes();
      }
      setOpen(!shown && this.has());
    },
    openOn(to) {
      if (shown && tab === to) return setOpen(false);
      tab = to;
      picked = null;
      // Already up: the page turns under its own sound. Opening on it, the board's opening is the sound.
      if (shown) turned();
      render();
      loadNotes();
      if (!shown) setOpen(true);
    },
    close(instant) {
      setOpen(false, instant);
    },
    has() {
      return leads.length > 0 || looseCount() > 0 || state.arc !== undefined || state.open.length > 0 || (state.rumors?.length ?? 0) > 0 || state.changed !== null || state.waiting !== null || state.elsewhere.length > 0 || (state.boards?.length ?? 0) > 0 || (state.fixer?.items.length ?? 0) > 0;
    },
    setHeat(district, h) {
      heat = district ? { district, heat: h } : null;
      nums();
    },
    setPurse(sol, nerveLeft, nerveMax) {
      purse = { sol, nerveLeft, nerveMax };
      nums();
    },
    get isOpen() {
      return shown;
    },
  };
}
