/**
 * LOAD (spec 2026-10-09 front-end restyle §4; save strips, pause menu mockup 2026-10-30): the playthroughs
 * on the left (←→), and the selected one's saves on the right as wide strips (↑↓): NOW, then your saves
 * newest first, then the automatic ones. Each strip is the room with your face and theirs and the save's
 * name. RENAME and DELETE (or R and Del) act on the playthrough at NOW, else on the save. Over the skyline.
 */
import type { PlaythroughInfo, SaveInfo } from '../../../shared/types';
import { ApiError, type PlaythroughApi, type PlaythroughListing } from '../net/playthroughs';
import type { LandingAgent } from './landing';
import { topRowFor } from './roster-grid';
import { playPath } from './route';
import { formatClock } from '../../../shared/clock';
import { ago, JACK_MS, type TitleCue } from './title';
import { saveStrip } from '../ui/save-strip';
import { groupGames, stops, type Stop } from './load-groups';
import { openSavePrompt } from '../room/save-prompt';
import { branchName } from '../../../shared/branch-name';
import './load.css';

export interface LoadDeps {
  api: PlaythroughApi;
  nav(path: string): void;
  /** Esc: back to the title (or the pause menu). */
  back(): void;
  sound(cue: TitleCue): void;
  /** The roster, by id (the select's): faces and names. */
  agents(): ReadonlyMap<string, LandingAgent>;
  reducedMotion: boolean;
  /** Over a room (the pause menu): its keys go first and no further, so none reach the chat prompt behind it. */
  exclusive?: boolean;
}

const HINTS = '[↑↓] SAVE · [←→] GAME · [ENTER] LOAD · [B] BRANCH · [S] STAR · [O] OLDER · [R] RENAME · [DEL] DELETE · [ESC] BACK';
/** Once a game is starred, the star tip never shows again (a per-browser convenience, like Graft's tips). */
const STAR_TIP_KEY = 'nix-room.load-star-hint';
const STAR_TIP = 'S stars a game you want to keep. The rest fold into OLDER.';
function starTipDone(): boolean {
  try {
    return localStorage.getItem(STAR_TIP_KEY) === 'done';
  } catch {
    return false;
  }
}
function setStarTipDone(): void {
  try {
    localStorage.setItem(STAR_TIP_KEY, 'done');
  } catch {
    // A blocked store: the tip shows again next time, which is harmless.
  }
}
const CONFIRM = 'DELETE? Y/N';
const ICONS: Record<SaveInfo['trigger'], string> = { manual: '★', travel: '⇢', end: '◼', rewind: '↺', load: '⤺' };
/** How many rows (games and group headers) the left list shows at once: a window that follows the selection. */
const LIST_ROWS = 10;
const KINDS: Record<SaveInfo['trigger'], string> = { manual: 'SAVE', travel: 'TRIP', end: 'END', rewind: 'REWIND', load: 'BEFORE LOAD' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const isModified = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const why = (err: unknown) => (err instanceof ApiError ? err.error : err instanceof Error ? err.message : String(err));
/** A scene the map doesn't name: its folder, dashes as spaces. */
const folderName = (sceneId: string) => (sceneId.split('/').pop() ?? sceneId).replace(/-/g, ' ');

/** The city map's place names by scene id; empty when the map can't load. */
async function placeNames(): Promise<Map<string, string>> {
  try {
    const res = await fetch('/api/map');
    if (!res.ok) return new Map();
    const map = (await res.json()) as { places?: { name: string; scene?: string }[] };
    return new Map((map.places ?? []).filter((p) => p.scene).map((p) => [p.scene!, p.name]));
  } catch {
    return new Map();
  }
}

/** Where a playthrough came from, or null for one started fresh. */
function history(pt: PlaythroughInfo): string | null {
  const from = pt.forkedFrom;
  if (!from) return null;
  // A fork or branch is a new playthrough: its createdAt is when it was made.
  return 'message' in from
    ? `branched from "${from.name}" · "${from.message.excerpt}" · ${ago(pt.createdAt)}`
    : `forked from "${from.name}" · ${ago(pt.createdAt)}`;
}

/** What R, Del and the buttons act on: the playthrough, or one save. */
type Target = { kind: 'pt'; pt: PlaythroughListing } | { kind: 'save'; pt: PlaythroughListing; save: SaveInfo };

export function mountLoad(root: HTMLElement, deps: LoadDeps): { destroy(): void; refresh(): void } {
  const box = el('div', 'load-screen');
  const title = el('div', 'load-title', 'LOAD');
  const left = el('div', 'ld-pts');
  const right = el('div', 'ld-saves');
  const under = el('div', 'load-under');
  const error = el('div', 'load-error');
  const jack = el('div', 'jack-in', 'JACK IN');
  const hints = el('div', 'load-hints', HINTS);
  const tip = el('div', 'load-tip');
  box.append(title, left, right, under, error, jack, tip, hints);
  root.append(box);

  let list: PlaythroughListing[] = [];
  let activeId: string | null = null;
  /** Each playthrough's saves, newest first (fetched once). */
  const savesBy = new Map<string, SaveInfo[]>();
  let places = new Map<string, string>();
  /** The selected stop on the left (a game, or a closed OLDER), an index into `view()`. */
  let ptIndex = 0;
  /** OLDER shows its games. */
  let olderOpen = false;
  /** DELETE OLDER's YES/NO is up. */
  let confirmingOlder = false;
  /** B's name prompt is open: its field takes the keys. */
  let prompting = false;
  /** The playthroughs have been listed (an empty LOAD says so only then). */
  let loaded = false;
  /** The first playthrough row shown. */
  let ptTop = 0;
  /** 0 is NOW; 1.. are the saves in shown order (yours, then automatic). */
  let row = 0;
  /** DELETE? Y/N is up, for this. */
  let confirming: Target | null = null;
  /** A name field is open, for this; its input survives redraws. */
  let renaming: { target: Target; input: HTMLInputElement } | null = null;
  /** An api call (or its JACK IN) is in flight: keys wait. */
  let busy = false;
  let destroyed = false;
  let jackTimer: ReturnType<typeof setTimeout> | null = null;

  const groups = () => groupGames(list, activeId);
  const view = (): Stop<PlaythroughListing>[] => stops(groups(), olderOpen);
  const stopAt = (i: number): Stop<PlaythroughListing> | undefined => view()[i];
  const selected = (): PlaythroughListing | undefined => {
    const st = stopAt(ptIndex);
    return st?.kind === 'pt' ? st.pt : undefined;
  };
  /** Where a game is among the stops (-1: folded into a closed OLDER). */
  const stopOf = (id: string) => view().findIndex((x) => x.kind === 'pt' && x.pt.id === id);
  const byTime = (pt: PlaythroughInfo | undefined) => (pt ? (savesBy.get(pt.id) ?? []) : []);
  /** The saves as shown: yours newest first, then the automatic ones newest first. */
  const savesOf = (pt: PlaythroughInfo | undefined) => {
    const all = byTime(pt);
    return [...all.filter((s) => s.kind === 'manual'), ...all.filter((s) => s.kind !== 'manual')];
  };
  const placeOf = (sceneId: string) => places.get(sceneId) ?? folderName(sceneId);
  const saveAt = (pt: PlaythroughInfo, i: number): SaveInfo | undefined => (i === 0 ? undefined : savesOf(pt)[i - 1]);
  const targetAt = (pt: PlaythroughListing, i: number): Target => {
    const save = saveAt(pt, i);
    return save ? { kind: 'save', pt, save } : { kind: 'pt', pt };
  };

  function setHint(text: string | null): void {
    hints.textContent = text ?? HINTS;
  }

  /** A face thumbnail for an agent id, or null. */
  const faceOf = (id: string | undefined | null) => (id ? (deps.agents().get(id)?.thumb ?? null) : null);

  /** Who a save was with: its speaker by name, else the contact it was saved with; never you; none solo. */
  function withWhom(pt: PlaythroughInfo, s: SaveInfo | undefined): string | null {
    if (s?.solo || (!s && pt.solo)) return null;
    const roster = deps.agents();
    let id: string | undefined;
    if (s?.lastLine) {
      const name = s.lastLine.speaker.toLowerCase();
      id = [...roster.values()].find((a) => a.name.toLowerCase() === name)?.id;
    }
    id ??= s ? s.location?.contactId : (pt.location?.contactId ?? pt.startContact);
    return id && id !== pt.player ? id : null;
  }

  /** A save's place; a trip reads FROM → TO when the next older save was somewhere else. */
  function whereOf(pt: PlaythroughInfo, s: SaveInfo | undefined): string {
    if (!s) return pt.location ? placeOf(pt.location.sceneId) : '';
    const to = s.location ? placeOf(s.location.sceneId) : '';
    if (s.trigger !== 'travel') return to;
    const all = byTime(pt);
    const older = all[all.indexOf(s) + 1]?.location;
    const from = older ? placeOf(older.sceneId) : null;
    return from && from !== to ? `${from} → ${to}` : to;
  }

  /** RENAME and DELETE for `t`. */
  function actions(t: Target): HTMLElement {
    const acts = el('div', 'ld-acts');
    const btn = (text: string, cls: string, go: () => void) => {
      const b = el('button', `ld-btn ${cls}`, text);
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (busy || renaming) return;
        go();
      });
      return b;
    };
    if (t.kind === 'pt') acts.append(btn(t.pt.starred ? '★ UNSTAR' : '☆ STAR', 'ld-star', () => toggleStar(t.pt)));
    acts.append(btn('✎ RENAME', 'ld-rename', () => startRename(t)), btn('✕ DELETE', 'ld-delete', () => askDelete(t)));
    return acts;
  }

  /**
   * The left side: the games in their groups (★ KEPT, RECENT, OLDER; a window round the selection), the selected one's
   * buttons and its file. `pt` null: a closed OLDER is selected.
   */
  function renderLeft(pt: PlaythroughListing | null): void {
    const g = groups();
    const shown: ({ head: string; cls: string; on?: boolean } | { game: PlaythroughListing })[] = [];
    if (g.kept.length > 0) shown.push({ head: '★ KEPT', cls: 'ld-kept' }, ...g.kept.map((game) => ({ game })));
    if (g.recent.length > 0) shown.push({ head: 'RECENT', cls: 'ld-recent' }, ...g.recent.map((game) => ({ game })));
    if (g.older.length > 0) {
      shown.push({ head: `OLDER (${g.older.length})`, cls: `ld-older${olderOpen ? ' open' : ''}`, on: !pt });
      if (olderOpen) shown.push(...g.older.map((game) => ({ game })));
    }
    const at = Math.max(0, shown.findIndex((x) => ('game' in x ? x.game.id === pt?.id : !!x.on)));
    ptTop = topRowFor(at, ptTop, shown.length, LIST_ROWS);
    // A group's first game brings its header into view with it.
    if (ptTop === at && at > 0 && !('game' in shown[at - 1]!)) ptTop = at - 1;
    const rows: HTMLElement[] = [el('div', 'ld-head', 'PLAYTHROUGHS')];
    for (const x of shown.slice(ptTop, ptTop + LIST_ROWS)) {
      if (!('game' in x)) {
        const h = el('div', `ld-ghead ${x.cls}${x.on ? ' on' : ''}`, x.head);
        if (x.cls.startsWith('ld-older') && olderOpen) {
          const b = el('button', 'ld-btn ld-delete ld-delete-older', '✕ DELETE OLDER');
          b.type = 'button';
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (busy || renaming || prompting) return;
            confirming = null;
            confirmingOlder = true;
            render();
          });
          h.append(b);
        }
        rows.push(h);
        continue;
      }
      const p = x.game;
      const on = p.id === pt?.id;
      const editing = renaming?.target.kind === 'pt' && renaming.target.pt.id === p.id;
      const r = el('div', `pt${on ? ' on' : ''}${editing ? ' editing' : ''}`);
      r.dataset.id = p.id;
      if (editing) {
        r.append(renaming!.input, el('small', 'ld-edit-hint', '[ENTER] RENAME · [ESC] KEEP'));
      } else {
        const name = el('span', 'pt-name', p.name);
        if (p.id === activeId) name.append(el('span', 'chip', 'ACTIVE'));
        r.append(name, el('small', 'pt-ago', ago(p.updatedAt)));
        // Where it came from, by its parent's name now (gone: the name it was made from).
        const from = p.forkedFrom;
        if (from) r.append(el('small', 'pt-from', `branch of ${list.find((x) => x.id === from.playthrough)?.name ?? from.name}`));
      }
      rows.push(r);
      if (on && !editing) rows.push(actions({ kind: 'pt', pt: p }));
    }
    if (!pt) {
      left.replaceChildren(...rows);
      return;
    }
    const saves = byTime(pt);
    const mine = saves.filter((s) => s.kind === 'manual').length;
    const from = history(pt);
    const file = el('div', 'ld-file');
    file.append(
      el('div', '', [pt.persona?.name ?? cap(pt.player), pt.id === activeId ? 'Active' : null].filter(Boolean).join(' · ')),
      el('div', '', `${mine} ${mine === 1 ? 'save' : 'saves'} · ${saves.length - mine} auto`),
      ...(from ? [el('div', 'ld-from', from)] : []),
    );
    rows.push(file);
    left.replaceChildren(...rows);
  }

  /** One stop on the right: NOW (i 0) or a save, as a strip. */
  function stripFor(pt: PlaythroughListing, i: number): HTMLElement {
    const s = saveAt(pt, i);
    const editing = !!s && renaming?.target.kind === 'save' && renaming.target.save.id === s.id;
    const where = whereOf(pt, s);
    const storyTime = s?.clock !== undefined ? formatClock(s.clock) : null;
    const meta = [where, s ? (storyTime ?? s.timeOfDay) : null, ago(s ? s.at : pt.updatedAt)].filter((x): x is string => !!x).join(' · ');
    const strip = saveStrip({
      scene: (s ? s.location?.sceneId : pt.location?.sceneId) ?? null,
      you: faceOf(pt.player),
      them: faceOf(withWhom(pt, s)),
      name: s ? s.name : '▶ NOW',
      meta,
      ...(s ? { kind: `${ICONS[s.trigger]} ${KINDS[s.trigger]}` } : {}),
      size: s && s.kind !== 'manual' ? 'small' : 'big',
    });
    strip.dataset.row = String(i);
    strip.dataset.id = s ? s.id : 'now';
    if (!s) strip.classList.add('ss-now');
    if (i === row) strip.classList.add('on');
    if (editing) {
      const name = strip.querySelector('.ss-name')!;
      name.replaceChildren(renaming!.input);
      strip.classList.add('editing');
    } else if (s && i === row) strip.append(actions({ kind: 'save', pt, save: s }));
    return strip;
  }

  /** The right side: NOW, then SAVES (yours), then AUTO, each group headed. */
  function renderRight(pt: PlaythroughListing): void {
    const shown = savesOf(pt);
    const mine = shown.filter((s) => s.kind === 'manual').length;
    const out: HTMLElement[] = [stripFor(pt, 0)];
    const group = (text: string, small: string) => {
      const g = el('div', 'ld-group', text);
      g.append(el('small', '', small));
      return g;
    };
    if (mine > 0) out.push(group('SAVES', 'YOURS · NEVER PRUNED'));
    shown.forEach((s, k) => {
      if (k === mine) out.push(group('AUTO', 'LAST 10'));
      out.push(stripFor(pt, k + 1));
    });
    right.replaceChildren(...out);
    right.querySelector<HTMLElement>('.ss.on')?.scrollIntoView?.({ block: 'nearest' });
  }

  function render(): void {
    if (destroyed) return;
    tip.textContent = loaded && list.length > 0 && !list.some((p) => p.starred) && !starTipDone() ? STAR_TIP : '';
    const pt = selected();
    if (!pt && stopAt(ptIndex)?.kind === 'older') {
      renderLeft(null);
      right.replaceChildren(el('div', 'ld-older-hint', `[O] OPEN OLDER (${groups().older.length})`));
      under.textContent = '';
      return;
    }
    if (!pt) {
      left.replaceChildren(el('div', 'ld-head', 'PLAYTHROUGHS'));
      right.replaceChildren();
      under.textContent = loaded ? 'NO PLAYTHROUGHS' : '';
      return;
    }
    renderLeft(pt);
    renderRight(pt);
    if (confirmingOlder) {
      under.textContent = `DELETE ${groups().older.length} OLDER GAMES? Starred and recent ones stay.`;
      const answer = (text: string, cls: string, yes: boolean) => {
        const b = el('button', `ld-btn ${cls}`, text);
        b.type = 'button';
        b.addEventListener('click', () => answerOlder(yes));
        return b;
      };
      under.append(answer('YES', 'ld-yes ld-delete', true), answer('NO', 'ld-no', false));
      return;
    }
    under.textContent = confirming ? (confirming.kind === 'pt' ? `DELETE "${confirming.pt.name}"? Y/N` : `DELETE "${confirming.save.name}"? Y/N`) : '';
    // YES and NO for a pointer (review I2), as Y and N.
    if (confirming) {
      const answer = (text: string, cls: string, yes: boolean) => {
        const b = el('button', `ld-btn ${cls}`, text);
        b.type = 'button';
        b.addEventListener('click', () => {
          const t = confirming;
          if (!t) return;
          confirming = null;
          render();
          if (yes) remove(t);
        });
        return b;
      };
      under.append(answer('YES', 'ld-yes ld-delete', true), answer('NO', 'ld-no', false));
    }
    // Focus stays in an open name field through a redraw.
    if (renaming && document.activeElement !== renaming.input) renaming.input.focus();
  }

  /** The selected playthrough's saves (fetched once). */
  async function fetchSaves(pt: PlaythroughInfo): Promise<void> {
    if (savesBy.has(pt.id)) return;
    try {
      const saves = await deps.api.listSaves(pt.id);
      savesBy.set(pt.id, [...saves].sort((a, b) => b.at - a.at));
    } catch (err) {
      error.textContent = `// COULDN'T LIST SAVES — ${why(err)}`;
    }
    if (selected()?.id === pt.id) render();
  }

  function selectPlaythrough(i: number): void {
    ptIndex = i;
    row = 0;
    render();
    const pt = selected();
    if (pt) void fetchSaves(pt);
  }

  /** B on a save: a new game from it, named in the BRANCH card. */
  function branchFrom(pt: PlaythroughListing, s: SaveInfo): void {
    if (busy || renaming || confirming || prompting) return;
    prompting = true;
    deps.sound('confirm');
    openSavePrompt(box, {
      defaultName: branchName(pt, list),
      title: 'BRANCH',
      action: 'BRANCH',
      reducedMotion: deps.reducedMotion,
      onClose: () => (prompting = false),
      save: async (name) => {
        try {
          const made = await deps.api.branchSave(s.id, name);
          busy = true;
          box.classList.add('locked');
          if (!destroyed) deps.nav(playPath(made));
        } catch (err) {
          if (err instanceof ApiError && err.error === 'busy') throw new Error(`Wait for ${cap(err.contact ?? 'them')} to finish`);
          if (err instanceof ApiError && err.error === 'bad-name') throw new Error('// NAME IT — 1 TO 80 CHARACTERS');
          throw new Error(`// COULDN'T BRANCH — ${why(err)}`);
        }
      },
    });
  }

  /** YES on DELETE OLDER: each OLDER game in turn, stopping at the first that fails. NO: nothing. */
  function answerOlder(yes: boolean): void {
    confirmingOlder = false;
    if (!yes) return render();
    const doomed = groups().older;
    const keep = selected()?.id ?? null;
    busy = true;
    error.textContent = '';
    void (async () => {
      for (const [k, p] of doomed.entries()) {
        under.textContent = `DELETING ${doomed.length - k}…`;
        try {
          await deps.api.removePlaythrough(p.id);
        } catch (err) {
          if (!destroyed) error.textContent = `// COULDN'T DELETE ${p.name} — ${why(err)}`;
          break;
        }
        list = list.filter((x) => x.id !== p.id);
        savesBy.delete(p.id);
      }
      if (destroyed) return;
      under.textContent = '';
      if (groups().older.length === 0) olderOpen = false;
      const i = keep ? stopOf(keep) : -1;
      ptIndex = i >= 0 ? i : Math.min(ptIndex, Math.max(0, view().length - 1));
      busy = false;
      render();
      const pt = selected();
      if (pt) void fetchSaves(pt);
    })();
  }

  /** O: opens or closes OLDER. Opened from its stop, on its first game; closed from one of its games, on its stop. */
  function toggleOlder(): void {
    if (busy || renaming || confirming || groups().older.length === 0) return;
    // Closing OLDER takes DELETE OLDER's question with it (never left up unseen, waiting for a y).
    confirmingOlder = false;
    const was = stopAt(ptIndex);
    olderOpen = !olderOpen;
    deps.sound('move');
    if (was?.kind === 'older') return selectPlaythrough(stopOf(groups().older[0]!.id));
    const i = was?.kind === 'pt' ? stopOf(was.pt.id) : -1;
    if (i >= 0) {
      ptIndex = i;
      render();
    } else selectPlaythrough(view().findIndex((x) => x.kind === 'older'));
  }

  /** S and STAR: stars or unstars `pt`; it moves to or from ★ KEPT and stays selected. */
  function toggleStar(pt: PlaythroughListing): void {
    void attempt('STAR', async () => {
      const updated = await deps.api.star(pt.id, !pt.starred);
      list = list.map((p) => (p.id === pt.id ? { ...updated, contacts: p.contacts, sprite: p.sprite } : p));
      if (updated.starred) setStarTipDone();
      const i = stopOf(pt.id);
      ptIndex = i >= 0 ? i : view().findIndex((x) => x.kind === 'older');
    });
  }

  /** Keys work again: the lock and JACK IN come off. */
  function unlock(): void {
    busy = false;
    box.classList.remove('locked');
    jack.classList.remove('on');
    render();
  }

  /**
   * Runs one api call with keys held; a `busy` 409 becomes the wait hint, anything else the error
   * line. With `holdOnSuccess` (a load or continue: the room opens next) the lock stays on success.
   */
  async function attempt(what: string, run: () => Promise<void>, o: { holdOnSuccess?: boolean } = {}): Promise<void> {
    busy = true;
    error.textContent = '';
    try {
      await run();
      if (!o.holdOnSuccess && !destroyed) unlock();
    } catch (err) {
      if (destroyed) return;
      if (err instanceof ApiError && err.error === 'busy') setHint(`Wait for ${cap(err.contact ?? 'them')} to finish`);
      else error.textContent = `// COULDN'T ${what} — ${why(err)}`;
      unlock();
    }
  }

  /** JACK IN (NOW) or LOAD (a save) types out; the call goes after JACK_MS. */
  function enter(): void {
    const pt = selected();
    if (!pt || busy) return;
    const s = saveAt(pt, row);
    if (row !== 0 && !s) return;
    deps.sound('confirm');
    busy = true;
    box.classList.add('locked');
    jack.textContent = s ? 'LOAD' : 'JACK IN';
    jack.classList.add('on');
    jackTimer = setTimeout(() => {
      jackTimer = null;
      if (!s) {
        void attempt('CONTINUE', async () => {
          if (pt.id !== activeId) await deps.api.activate(pt.id);
          if (!destroyed) deps.nav(playPath(pt));
        }, { holdOnSuccess: true });
      } else {
        void attempt('LOAD', async () => {
          const forked = await deps.api.loadSave(s.id);
          if (!destroyed) deps.nav(playPath(forked));
        }, { holdOnSuccess: true });
      }
    }, JACK_MS);
  }

  function askDelete(t: Target): void {
    confirming = t;
    render();
  }

  /** Y on DELETE?: the playthrough (the active one refuses), or that save. */
  function remove(t: Target): void {
    const pt = t.pt;
    if (t.kind === 'pt') {
      void attempt('DELETE', async () => {
        await deps.api.removePlaythrough(pt.id);
        list = list.filter((p) => p.id !== pt.id);
        savesBy.delete(pt.id);
        selectPlaythrough(Math.min(ptIndex, Math.max(0, view().length - 1)));
      });
      return;
    }
    void attempt('DELETE', async () => {
      await deps.api.removeSave(t.save.id);
      const rest = byTime(pt).filter((x) => x.id !== t.save.id);
      savesBy.set(pt.id, rest);
      row = Math.min(row, rest.length);
    });
  }

  /** A name field in place of the playthrough's row or the save's name: Enter renames, Esc (or leaving it) keeps. */
  function startRename(t: Target): void {
    if (busy || renaming) return;
    confirming = null;
    const input = el('input', 'pn-input');
    const old = t.kind === 'pt' ? t.pt.name : t.save.name;
    input.value = old;
    input.maxLength = 80;
    renaming = { target: t, input };
    render();
    input.focus();
    input.select();
    const done = () => {
      if (renaming?.input !== input) return;
      renaming = null;
      render();
    };
    input.addEventListener('keydown', (e) => {
      // The field owns its keys: none reach the screen (or the landing behind it).
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        done();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const next = input.value.trim();
        if (busy) return;
        if (!next || next === old) return done();
        // Off before the call: its redraw puts the row or strip back.
        renaming = null;
        void attempt('RENAME', async () => {
          if (t.kind === 'pt') {
            const updated = await deps.api.rename(t.pt.id, next);
            list = list.map((p) => (p.id === t.pt.id ? { ...updated, contacts: p.contacts } : p));
          } else {
            const updated = await deps.api.renameSave(t.save.id, next);
            savesBy.set(t.pt.id, byTime(t.pt).map((x) => (x.id === updated.id ? updated : x)));
          }
        });
      }
    });
    input.addEventListener('blur', done);
  }

  /** Focuses stop `i` (keys, a click on a strip). */
  function focusRow(i: number): void {
    if (busy || renaming || confirming || i === row) return;
    row = i;
    deps.sound('move');
    render();
  }

  /** The next or previous stop, clamped to NOW and the last save. */
  function stepRow(d: number): void {
    const pt = selected();
    if (pt) focusRow(Math.min(savesOf(pt).length, Math.max(0, row + d)));
  }

  /** The next or previous playthrough, clamped to the list. */
  function stepPlaythrough(d: number): void {
    const n = view().length;
    if (busy || renaming || confirming || n === 0) return;
    const i = Math.min(n - 1, Math.max(0, ptIndex + d));
    if (i === ptIndex) return;
    deps.sound('move');
    selectPlaythrough(i);
  }

  left.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.ld-older')) return toggleOlder();
    const r = (e.target as HTMLElement).closest<HTMLElement>('.pt');
    if (!r || busy || renaming || confirming || confirmingOlder) return;
    const i = stopOf(r.dataset.id ?? '');
    if (i >= 0 && i !== ptIndex) {
      deps.sound('move');
      selectPlaythrough(i);
    }
  });

  // A click on a strip focuses it; on the focused one, it loads.
  right.addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>('.ss');
    if (!s || busy || renaming || confirming) return;
    const i = Number(s.dataset.row);
    if (i === row) enter();
    else focusRow(i);
  });

  const onKey = (e: KeyboardEvent) => {
    // A name field takes its own keys (and stops them there).
    if (renaming || prompting) return;
    if (deps.exclusive) e.stopImmediatePropagation();
    if (isModified(e)) return;
    if (confirmingOlder) {
      const k = e.key.toLowerCase();
      if (k !== 'y' && k !== 'n' && e.key !== 'Escape') return;
      e.preventDefault();
      answerOlder(k === 'y');
      return;
    }
    if (confirming) {
      const k = e.key.toLowerCase();
      if (k !== 'y' && k !== 'n' && e.key !== 'Escape') return;
      e.preventDefault();
      const t = confirming;
      confirming = null;
      render();
      if (k === 'y') remove(t);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // A call already sent finishes first (its result decides where we go); JACK IN alone cancels.
      if (busy && jackTimer === null) return;
      if (jackTimer !== null) {
        clearTimeout(jackTimer);
        jackTimer = null;
      }
      deps.back();
      return;
    }
    if (busy || list.length === 0) return;
    setHint(null);
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      return toggleOlder();
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      return stepPlaythrough(e.key === 'ArrowLeft' ? -1 : 1);
    }
    const pt = selected();
    // A closed OLDER: Enter opens it; nothing else acts on it.
    if (!pt) {
      if (e.key === 'Enter') {
        e.preventDefault();
        toggleOlder();
      }
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      return toggleStar(pt);
    }
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      const s = saveAt(pt, row);
      if (s) branchFrom(pt, s);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepRow(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enter();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      startRename(targetAt(pt, row));
    } else if (e.key === 'Delete') {
      e.preventDefault();
      askDelete(targetAt(pt, row));
    }
  };
  window.addEventListener('keydown', onKey, deps.exclusive === true);

  void (async () => {
    const [res, names] = await Promise.all([deps.api.listPlaythroughs().catch((err: unknown) => (error.textContent = `// COULDN'T LIST PLAYTHROUGHS — ${why(err)}`, null)), placeNames()]);
    if (destroyed) return;
    places = names;
    if (res) {
      list = [...res.playthroughs].sort((a, b) => b.updatedAt - a.updatedAt);
      activeId = res.active;
    }
    loaded = true;
    selectPlaythrough(Math.max(0, activeId ? stopOf(activeId) : 0));
  })();
  render();

  return {
    /** The roster changed (it arrived, or a poll): redraw, unless a load is under way or a name is being typed. */
    refresh() {
      if (destroyed || busy || renaming) return;
      render();
    },
    destroy() {
      destroyed = true;
      if (jackTimer !== null) clearTimeout(jackTimer);
      window.removeEventListener('keydown', onKey, deps.exclusive === true);
      box.remove();
    },
  };
}
