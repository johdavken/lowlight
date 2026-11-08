/**
 * QUEST (quest lines spec §3; quest panel 2026-10-31): a holo pane in the middle of the screen, as
 * TEXTS, from the HUD's QUEST key or Alt+Q. HERE / ELSEWHERE / FIXER tabs over a list and the picked
 * quest's file (its art, terms, pitch and START). A run here whose quest file lost its beat says so.
 * LEADS (Alt+L) and LOOSE ENDS (Alt+O) came over from PEOPLE on 2026-11-04: they load with the first state and each time it opens, and a tab
 * with nothing on it shows only while you've asked for it by key.
 */
import type { LeadView, LooseEndsView, QuestState } from '../../../shared/types';
import { onClickAway } from '../ui/click-away';
import { gearRule, gearStat } from '../../../shared/stock';
import { looseEndsTab } from './quest-loose-ends';
import './quest-list.css';

/** The open quests in `state` not in `seen` (which learns them): what the "can start here" notice names. */
export function newlyOpen(seen: Set<string>, state: QuestState): QuestState['open'] {
  const fresh = state.open.filter((q) => !seen.has(q.id));
  for (const q of fresh) seen.add(q.id);
  return fresh;
}

export interface QuestList {
  show(state: QuestState): void;
  toggle(): void;
  /** Alt+L / Alt+O: opens on that tab; on it already, closes. */
  openOn(tab: 'leads' | 'loose'): void;
  close(): void;
  /** Whether there's anything to list (the HUD shows QUEST only then). */
  has(): boolean;
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
    const head = q.mission.own ? [`${q.mission.own.toUpperCase()}'S CLIENT`, ...(q.mission.comms ? ['COMMS', q.mission.comms.toUpperCase()] : [])] : ['MISSION', q.mission.tier !== undefined ? `TIER ${q.mission.tier}` : null];
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

export function mountQuestList(
  host: HTMLElement,
  o: { onStart(id: string): void; onOpen?(): void; /** The panel went (Esc, a click away, the key, nothing left on it). */ onClose?(): void; /** GO THERE on a board job elsewhere: the map's GO to its place. */ onGoTo?(place: string): void; /** GO TO on a rumor: you leave your contact for theirs. */ onGoToContact?(contact: string): void; /** BUY at the fixer (small jobs spec §5). */ onBuy?(item: string): void; /** WALK AWAY from a big job before its approach (big jobs spec §4). */ onWalk?(id: string): void; /** What LEADS and LOOSE ENDS list; absent or failed: nothing there. */ leads?(): Promise<LeadView[]>; looseEnds?(): Promise<LooseEndsView>; /** They came back: has() may have changed. */ onNotes?(): void; reduced?(): boolean },
): QuestList {
  host.classList.add('ql-host');
  host.hidden = true;
  const pane = el('div', 'ql-pane');
  host.append(pane);
  // Like the other panels: a click outside the pane, or Esc, closes it (click-away spec 2026-10-15).
  let off: (() => void) | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // ↑ / ↓ move down the list, without wrapping, and never reach the room.
      e.preventDefault();
      e.stopPropagation();
      const keys = rowKeys();
      const at = keys.indexOf(picked ?? '') + (e.key === 'ArrowUp' ? -1 : 1);
      if (keys.length === 0 || at < 0 || at >= keys.length) return;
      picked = keys[at];
      render();
      return;
    }
    if (e.key !== 'Escape') return;
    // Capture phase: Esc closes the list and goes no further (not back to the dial-in).
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  };
  function setOpen(open: boolean): void {
    const was = !host.hidden;
    host.hidden = !open;
    if (open) o.onOpen?.();
    else if (was) o.onClose?.();
    // A projection coming up: TEXTS' flicker.
    if (open && !was) {
      pane.classList.remove('ql-flicker');
      if (!o.reduced?.()) {
        void pane.offsetWidth;
        pane.classList.add('ql-flicker');
      }
    }
    if (open && !off) {
      const offAway = onClickAway((n) => pane.contains(n), () => setOpen(false));
      window.addEventListener('keydown', onKey, true);
      off = () => {
        offAway();
        window.removeEventListener('keydown', onKey, true);
      };
    } else if (!open && off) {
      off();
      off = null;
    }
  }
  let state: QuestState = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };
  let tab: Tab = 'here';
  /** The picked row: an open quest's id, or an ELSEWHERE row's key. */
  let picked: string | null = null;

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

  /** The rows of the tab up, by the key `picked` holds. */
  const rowKeys = (): string[] => (tab === 'here' ? hereRows().map((q) => q.id) : tab === 'away' ? awayRows(state).map((a) => a.key) : tab === 'rumors' ? (state.rumors ?? []).map((r) => r.id) : tab === 'leads' ? leadRows().map((l) => l.id) : tab === 'fixer' ? (state.fixer?.items ?? []).map((i) => i.id) : []);

  const render = () => {
    const shown = tabs();
    if (!shown.includes(tab)) tab = shown[0] ?? 'here';
    const keys = rowKeys();
    if (picked === null || !keys.includes(picked)) picked = keys[0] ?? null;

    pane.dataset.tab = tab;
    const head = el('div', 'ql-head', '◆ JOBS');
    head.append(el('span', 'ql-esc', 'ESC'));
    const parts: HTMLElement[] = [head];
    // NERVE gone (the table spec §3): one line for the pane; the jobs grey out and START waits for 06:00.
    if (state.nerveGone) parts.push(el('div', 'ql-nerve', `NERVE GONE — NO NEW JOB UNTIL ${state.nerveGone.back} · STORY STILL PLAYS`));
    if (state.changed) parts.push(el('div', 'ql-changed', state.changed));
    if (shown.length > 0) {
      const bar = el('div', 'ql-tabs');
      bar.setAttribute('role', 'tablist');
      for (const t of shown) {
        const b = el('button', 'ql-tab', TAB_NAME[t]);
        b.type = 'button';
        b.dataset.tab = t;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t === tab));
        b.append(el('i', undefined, ` ${count(t)}`));
        b.onclick = () => {
          tab = t;
          picked = null;
          render();
        };
        bar.append(b);
      }
      parts.push(bar);
      const body = el('div', 'ql-body');
      if (tab === 'fixer') body.append(fixerFile());
      else if (tab === 'loose') body.append(looseEndsTab(loose));
      else if (tab === 'leads' && leads.length === 0) body.append(el('div', 'ql-none', 'No leads yet. People tell you things; the useful ones end up here.'));
      else {
        const list = el('div', 'ql-list');
        list.setAttribute('role', 'listbox');
        if (tab === 'here') list.append(...hereList());
        else if (tab === 'rumors') list.append(...rumorList());
        else if (tab === 'leads') list.append(...leadList());
        else list.append(...awayList());
        const file = el('div', 'ql-file');
        const q = tab === 'here' ? state.open.find((x) => x.id === picked) : undefined;
        const a = tab === 'away' ? awayRows(state).find((x) => x.key === picked) : undefined;
        const r = tab === 'rumors' ? state.rumors?.find((x) => x.id === picked) : undefined;
        const l = tab === 'leads' ? leads.find((x) => x.id === picked) : undefined;
        if (l) file.append(leadFile(l));
        else if (r) file.append(...rumorFile(r));
        else if (q) file.append(...questFile(q));
        else if (a?.job) file.append(...boardFile(a, a.job, a.place!));
        else if (a) file.append(...awayFile(a));
        body.append(list, file);
      }
      parts.push(body);
    }
    pane.replaceChildren(...parts);
  };

  const pick = (row: HTMLElement, key: string) => {
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(key === picked));
    row.onclick = () => {
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
      if (both && (q === stories[0] || q === jobs[0])) out.push(el('div', 'ql-group', job ? 'ON THE TABLE' : 'STORY'));
      const row = el('button', `ql-row ${job ? 'ql-job' : 'ql-story'}${q.once ? ' ql-once' : ''}`);
      row.type = 'button';
      // A job's mark is its art, else the table's card back; a story's the quest diamond.
      let icon: HTMLElement;
      if (job) {
        const img = el('img');
        img.src = q.art ?? '/cards/back.webp';
        img.alt = '';
        icon = img;
      } else icon = el('span', undefined, '◆');
      icon.className = 'ql-icon';
      const text = el('span', 'ql-text');
      text.append(el('span', 'ql-title', q.title));
      // A one-off job (once: true): it won't come round again.
      if (q.once) text.append(el('span', 'ql-once-tag', 'ONE-OFF'));
      const t = terms(q);
      if (q.mission) text.append(el('span', 'ql-mission', t!));
      else text.append(el('span', 'ql-kind', 'STORY'));
      // NERVE gone (the table spec §3) and the arrangement's nights used up (spec 2026-10-20 §2): greyed.
      if (q.locked) row.classList.add('ql-locked');
      if (q.mission?.capped) row.classList.add('ql-capped');
      row.append(icon, text);
      // A locked Tier 2 Chair (spec 2026-11-01 §1): its requirements show on hover.
      if (q.checks) row.append(checkList(q.checks));
      pick(row, q.id);
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

  const art = (src: string | undefined) => {
    const a = el('div', src ? 'ql-art' : 'ql-art ql-noart');
    if (src) a.style.backgroundImage = `url('${src}')`;
    return a;
  };

  /** A job's file text: who posted it, the pitch, what's involved. */
  const filed = (o: { pitch: string | null; postedBy?: string; brief?: string }): HTMLElement[] => [
    ...(o.postedBy ? [el('div', 'ql-postedby', `POSTED BY ${o.postedBy}`)] : []),
    ...(o.pitch ? [el('p', 'ql-pitch', o.pitch)] : []),
    ...(o.brief ? [el('p', 'ql-brief', o.brief)] : []),
  ];

  const questFile = (q: Open): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('div', 'ql-file-title', q.title.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', `ql-file-tag${q.mission?.own ? ' ql-trust' : isJob(q) ? '' : ' ql-storytag'}`, terms(q) ?? 'STORY'));
    if (q.timed) meta.append(el('span', 'ql-chip ql-timed', 'HAS A DEADLINE'));
    if (q.once) meta.append(el('span', 'ql-chip ql-file-once', 'ONE-OFF'));
    if (q.mission?.cased) meta.append(el('span', 'ql-chip ql-cased', 'CASED'));
    inner.append(meta, ...filed(q));
    // Crew (spec 2026-10-19 §2): a SCOUT shows tonight's draws and pay.
    const sc = q.mission?.scouted;
    if (sc) {
      const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');
      inner.append(el('div', 'ql-scouted', [sc.pay !== null ? `PAY ${sc.pay}` : null, ...Object.entries(sc.draws).map(([k, v]) => `${up(k)}: ${up(v)}`)].filter(Boolean).join(' · ')));
    }
    const start = el('button', 'ql-start', 'START');
    start.type = 'button';
    start.onclick = () => {
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
      if (q.checks) inner.append(checkList(q.checks));
      start.disabled = true;
      hint = '';
    }
    const go = el('div', 'ql-go');
    go.append(el('span', 'ql-hint', hint), start);
    inner.append(go);
    return [art(q.art), inner];
  };

  /** ELSEWHERE's rows: yours in progress first, then each other place's board under its name. */
  const rumorList = (): HTMLElement[] =>
    (state.rumors ?? []).map((r) => {
      const row = el('button', 'ql-row ql-story');
      row.type = 'button';
      row.append(el('span', 'ql-title', r.contactName), el('span', 'ql-line', r.needs ? `${r.placeName} · REP ${r.needs}` : r.placeName));
      pick(row, r.id);
      return row;
    });

  /** A rumor: its line, and the way to it. Leaving your contact asks first (tier 3 contracts spec §5). */
  const rumorFile = (r: Rumor): HTMLElement[] => {
    const inner = el('div', 'ql-in ql-plain');
    inner.append(el('p', 'ql-pitch', r.line));
    if (r.needs) {
      inner.append(el('p', 'ql-locked-note', `NEEDS REP ${r.needs}`));
      return [inner];
    }
    const button = el('button', 'ql-goto', r.here ? 'START' : `GO TO ${r.contactName.toUpperCase()}`);
    button.type = 'button';
    let asked = false;
    button.onclick = () => {
      if (r.here) {
        setOpen(false);
        return o.onStart(r.id);
      }
      if (r.leaving === null) {
        setOpen(false);
        return o.onGoTo?.(r.place);
      }
      if (!asked) {
        asked = true;
        button.textContent = `LEAVE ${r.leaving.toUpperCase()} FOR NOW?`;
        return;
      }
      setOpen(false);
      o.onGoToContact?.(r.contact);
    };
    const go = el('div', 'ql-go');
    go.append(el('span', 'ql-hint', `AT ${r.placeName.toUpperCase()}`), button);
    return [inner, go];
  };

  const awayList = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    let place: string | null = null;
    for (const a of awayRows(state)) {
      if (a.place && a.place.place !== place) {
        place = a.place.place;
        out.push(el('div', 'ql-group', `${a.place.name.toUpperCase()} · TONIGHT`));
      }
      out.push(a.job ? boardRow(a, a.job) : awayRow(a));
    }
    return out;
  };

  const awayRow = (a: Away): HTMLElement => {
    const row = el('button', `ql-row ${a.kind === 'wait' ? 'ql-waiting' : 'ql-elsewhere'}`);
    row.type = 'button';
    const icon = el('span', 'ql-icon', a.kind === 'wait' ? '◷' : '◆');
    const text = el('span', 'ql-text');
    text.append(el('span', 'ql-title', a.title), el('span', 'ql-kind', a.kind === 'wait' ? 'WAITING' : (state.elsewhere.find((e) => e.id === a.id)?.contactName ?? '').toUpperCase()));
    row.append(icon, text);
    pick(row, a.key);
    return row;
  };

  /** A mission on another place's board: HERE's job row, its art and terms, with whose it is or when it posts. */
  const boardRow = (a: Away, j: BoardJob): HTMLElement => {
    const row = el('button', `ql-row ql-job ql-board${j.with || j.opens ? ' ql-later' : ''}`);
    row.type = 'button';
    const img = el('img', 'ql-icon');
    img.src = j.art ?? '/cards/back.webp';
    img.alt = '';
    const text = el('span', 'ql-text');
    text.append(el('span', 'ql-title', a.title));
    if (j.once) text.append(el('span', 'ql-once-tag', 'ONE-OFF'));
    text.append(el('span', 'ql-mission', [terms(asOpen(j)), j.with ? `WITH ${j.with.toUpperCase()}` : null, j.opens ? `FROM ${j.opens}` : null].filter(Boolean).join(' · ')));
    row.append(img, text);
    pick(row, a.key);
    return row;
  };

  const boardFile = (a: Away, j: BoardJob, b: Board): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('div', 'ql-file-title', a.title.toUpperCase()));
    const meta = el('div', 'ql-meta');
    meta.append(el('span', 'ql-file-tag', terms(asOpen(j))!));
    if (j.with) meta.append(el('span', 'ql-chip ql-with', `WITH ${j.with.toUpperCase()}`));
    if (j.comms) meta.append(el('span', 'ql-chip', `COMMS · ${j.comms.toUpperCase()}`));
    if (j.opens) meta.append(el('span', 'ql-chip ql-timed', `POSTS AT ${j.opens}`));
    if (j.once) meta.append(el('span', 'ql-chip ql-file-once', 'ONE-OFF'));
    inner.append(meta, ...filed(j));
    const goTo = el('button', 'ql-goto', 'GO THERE');
    goTo.type = 'button';
    goTo.onclick = () => {
      setOpen(false);
      o.onGoTo?.(b.place);
    };
    const go = el('div', 'ql-go');
    go.append(el('span', 'ql-hint', a.hint), goTo);
    inner.append(go);
    return [art(j.art), inner];
  };

  const awayFile = (a: Away): HTMLElement[] => {
    const inner = el('div', 'ql-in');
    inner.append(el('div', 'ql-file-title', a.title.toUpperCase()), el('p', 'ql-line', a.line));
    const go = el('div', 'ql-go');
    go.append(el('span', 'ql-hint', a.hint));
    // A contract's groundwork: what's still to send (from CREW), out, and back.
    const arc = a.kind === 'wait' && state.arc?.id === a.id ? state.arc : null;
    for (const p of arc?.pieces ?? []) inner.append(el('p', 'ql-line ql-piece', `${p.id.toUpperCase()} · ${p.state === 'back' ? 'BACK' : p.state === 'out' ? 'OUT' : `SEND ${p.spec.toUpperCase()}`}`));
    // A contract before its night can be walked away from.
    if (arc?.walk) {
      const walk = el('button', 'ql-walk', 'WALK AWAY');
      walk.type = 'button';
      walk.onclick = () => {
        setOpen(false);
        o.onWalk?.(a.id);
      };
      go.append(walk);
    }
    inner.append(go);
    return [art(a.art), inner];
  };

  /** LEADS' rows: who each points to (a ? before you've met them), the followed ones under FOLLOWED, dimmed. */
  const leadList = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    let last = false;
    for (const l of leadRows()) {
      if (l.followed && !last) out.push(el('div', 'ql-group', 'FOLLOWED'));
      last = l.followed;
      const row = el('button', `ql-row ql-lead${l.followed ? ' ql-followed' : ''}`);
      row.type = 'button';
      let icon: HTMLElement = el('span', 'ql-icon', l.met ? l.toName.charAt(0).toUpperCase() : '?');
      if (l.met && l.portrait) {
        const img = el('img', 'ql-icon');
        img.src = l.portrait;
        img.alt = '';
        const initial = icon;
        img.addEventListener('error', () => img.replaceWith(initial), { once: true });
        icon = img;
      }
      const text = el('span', 'ql-text');
      text.append(el('span', 'ql-title', l.title), el('span', 'ql-kind', `→ ${l.toName.toUpperCase()}`));
      row.append(icon, text);
      pick(row, l.id);
      out.push(row);
    }
    return out;
  };

  const leadFile = (l: LeadView): HTMLElement => {
    const inner = el('div', `ql-in ql-plain${l.followed ? ' ql-followed' : ''}`);
    inner.append(el('div', 'ql-file-title', l.title.toUpperCase()), el('div', 'ql-file-tag ql-storytag', `→ ${l.toName.toUpperCase()}${l.place ? ` · ${l.place}` : ''}`), el('p', 'ql-lead-text', l.details));
    return inner;
  };

  // The fixer at a board (small jobs spec §5), as a shelf (mock docs/mockups/fixer-gear.html, A): each item a 3:4
  // card from web/public/gear/, its name and numbers over the picture's empty foot, the price and BUY under it, the
  // picked item's rule below the row. BUY at your tier there with the sol for it.
  const fixerFile = (): HTMLElement => {
    const box = el('div', 'ql-fixer');
    const items = state.fixer?.items ?? [];
    const shelf = el('div', 'ql-shelf');
    for (const item of items) {
      const card = el('div', `ql-item ${item.state}${item.id === picked ? ' ql-picked' : ''}`);
      card.dataset.item = item.id;
      const pic = el('button', 'ql-gear');
      pic.type = 'button';
      pic.setAttribute('aria-pressed', String(item.id === picked));
      const img = el('img');
      img.src = `/gear/${item.id}.webp`;
      img.alt = '';
      // No picture for it yet: the panel's hatch.
      img.onerror = () => img.replaceWith(el('span', 'ql-noart'));
      const words = el('span', 'ql-gear-words');
      words.append(el('span', 'ql-item-name', item.name.toUpperCase()), el('span', 'ql-item-stat', gearStat(item)));
      pic.append(img, words);
      pic.onclick = () => {
        picked = item.id;
        render();
      };
      const foot = el('div', 'ql-gear-foot');
      foot.append(el('span', 'ql-item-price', `${item.price} SOL`));
      if (item.state !== 'ok') foot.append(el('span', 'ql-item-why', item.state === 'locked' ? `TIER ${item.tier}` : item.state === 'owned' ? 'YOU HAVE ONE' : 'NOT ENOUGH SOL'));
      else {
        const buy = el('button', 'ql-buy', 'BUY');
        buy.type = 'button';
        buy.onclick = () => o.onBuy?.(item.id);
        foot.append(buy);
      }
      card.append(pic, foot);
      shelf.append(card);
    }
    box.append(shelf);
    const it = items.find((i) => i.id === picked);
    if (it) {
      const rule = el('div', 'ql-gear-rule');
      rule.append(el('span', 'ql-gear-rule-name', it.name.toUpperCase()), el('p', 'ql-brief', gearRule(it)));
      box.append(rule);
    }
    return box;
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
      if (host.hidden && this.has()) {
        tab = 'here';
        picked = null;
        render();
        loadNotes();
      }
      setOpen(host.hidden && this.has());
    },
    openOn(to) {
      if (!host.hidden && tab === to) return setOpen(false);
      tab = to;
      picked = null;
      render();
      loadNotes();
      if (host.hidden) setOpen(true);
    },
    close() {
      setOpen(false);
    },
    has() {
      return leads.length > 0 || looseCount() > 0 || state.arc !== undefined || state.open.length > 0 || (state.rumors?.length ?? 0) > 0 || state.changed !== null || state.waiting !== null || state.elsewhere.length > 0 || (state.boards?.length ?? 0) > 0 || (state.fixer?.items.length ?? 0) > 0;
    },
    get isOpen() {
      return !host.hidden;
    },
  };
}
