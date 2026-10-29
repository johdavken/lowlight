/**
 * LOAD (spec 2026-10-09 front-end restyle §4), in the select screen's language: the playthroughs
 * in the 1P file (↑↓), the selected one's timeline as the tile band (←→: NOW, then its saves
 * newest first), and the save's speaker as the CPU fighter with her line. Over the skyline.
 */
import type { PlaythroughInfo, SaveInfo } from '../../../shared/types';
import { ApiError, type PlaythroughApi, type PlaythroughListing } from '../net/playthroughs';
import { FighterStrip, type FileRow } from './fighter-strip';
import type { LandingAgent } from './landing';
import { topRowFor } from './roster-grid';
import { TileBand, type BandTile } from './tile-band';
import { playPath } from './route';
import { formatClock } from '../../../shared/clock';
import { ago, JACK_MS, spoken, type TitleCue } from './title';
import './load.css';

export interface LoadDeps {
  api: PlaythroughApi;
  nav(path: string): void;
  /** Esc: back to the title. */
  back(): void;
  sound(cue: TitleCue): void;
  /** The roster, by id (the select's): fighters' art and names. */
  agents(): ReadonlyMap<string, LandingAgent>;
  reducedMotion: boolean;
}

const HINTS = '[↑↓] PLAYTHROUGH · [←→] SAVE · [ENTER] LOAD · [R] RENAME · [DEL] DELETE · [ESC] BACK';
const CONFIRM = 'DELETE? Y/N';
const ICONS: Record<SaveInfo['trigger'], string> = { manual: '★', travel: '⇢', end: '◼', rewind: '↺' };
/** How many playthrough rows the 1P file shows at once (a window that follows the selection). */
const LIST_ROWS = 12;
const KINDS: Record<SaveInfo['trigger'], string> = { manual: 'SAVE', travel: 'TRIP', end: 'END', rewind: 'REWIND' };

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
const thumbUrl = (sceneId: string) => `/scenes/${sceneId.split('/').map(encodeURIComponent).join('/')}/room.png`;

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

/** At most one wheel step this often (a trackpad sends dozens of events per swipe). */
const WHEEL_GAP_MS = 120;

/** A wheel handler that steps `go` by ±1, down or right being +1, at most once per WHEEL_GAP_MS. */
function onWheel(go: (d: number) => void): (e: WheelEvent) => void {
  let last = -Infinity;
  return (e) => {
    e.preventDefault();
    const d = Math.sign(e.deltaY || e.deltaX);
    const now = performance.now();
    if (d === 0 || now - last < WHEEL_GAP_MS) return;
    last = now;
    go(d);
  };
}

export function mountLoad(root: HTMLElement, deps: LoadDeps): { destroy(): void; refresh(): void } {
  const box = el('div', 'load-screen');
  const title = el('div', 'load-title', 'LOAD');
  const p1 = new FighterStrip(box, 'p1', { reducedMotion: deps.reducedMotion });
  const p2 = new FighterStrip(box, 'p2', { reducedMotion: deps.reducedMotion });
  const band = new TileBand(box, { reducedMotion: deps.reducedMotion, visible: 8, tileW: 112, tileH: 124, onPick: (i) => pick(i), onHover: (i) => focusRow(i) });
  const under = el('div', 'load-under');
  const error = el('div', 'load-error');
  const jack = el('div', 'jack-in', 'JACK IN');
  const hints = el('div', 'load-hints', HINTS);
  box.append(title, under, error, jack, hints);
  root.append(box);

  let list: PlaythroughListing[] = [];
  let activeId: string | null = null;
  const savesBy = new Map<string, SaveInfo[]>();
  let places = new Map<string, string>();
  let ptIndex = 0;
  /** The playthroughs have been listed (an empty LOAD says so only then). */
  let loaded = false;
  /** The first playthrough row shown. */
  let ptTop = 0;
  /** 0 is NOW; 1.. are the saves. */
  let row = 0;
  let confirming = false;
  let renaming = false;
  /** An api call (or its JACK IN) is in flight: keys wait. */
  let busy = false;
  let destroyed = false;
  let jackTimer: ReturnType<typeof setTimeout> | null = null;

  const selected = (): PlaythroughListing | undefined => list[ptIndex];
  const savesOf = (pt: PlaythroughInfo | undefined) => (pt ? (savesBy.get(pt.id) ?? []) : []);
  const placeOf = (sceneId: string) => places.get(sceneId) ?? folderName(sceneId);

  function setHint(text: string | null): void {
    hints.textContent = text ?? HINTS;
  }

  /** The agent a save's line belongs to: its speaker by name, else the contact it was saved with. */
  function speakerOf(pt: PlaythroughInfo, s: SaveInfo | undefined): LandingAgent | undefined {
    const roster = deps.agents();
    if (s?.lastLine) {
      const name = s.lastLine.speaker.toLowerCase();
      const byName = [...roster.values()].find((a) => a.name.toLowerCase() === name);
      if (byName) return byName;
    }
    const id = s ? s.location?.contactId : (pt.location?.contactId ?? pt.startContact);
    return id ? roster.get(id) : undefined;
  }

  /** A save's place; a trip reads FROM → TO when the next older save was somewhere else. */
  function whereOf(pt: PlaythroughInfo, i: number): string {
    if (i === 0) return pt.location ? placeOf(pt.location.sceneId) : '';
    const saves = savesOf(pt);
    const s = saves[i - 1]!;
    const to = s.location ? placeOf(s.location.sceneId) : '';
    if (s.trigger !== 'travel') return to;
    const older = saves[i]?.location;
    const from = older ? placeOf(older.sceneId) : null;
    return from && from !== to ? `${from} → ${to}` : to;
  }

  function tiles(pt: PlaythroughInfo): BandTile[] {
    const art = (sceneId: string | null | undefined): BandTile['art'] => (sceneId ? { kind: 'room', src: thumbUrl(sceneId) } : { kind: 'mark', text: '?' });
    return [
      { id: 'now', name: ago(pt.updatedAt), art: art(pt.location?.sceneId), tag: { text: '▶ NOW', now: true } },
      ...savesOf(pt).map((s) => ({ id: s.id, name: ago(s.at), art: art(s.location?.sceneId), tag: { text: ICONS[s.trigger] } })),
    ];
  }

  /** The 1P side: the selected playthrough's player, and every playthrough as a row. */
  function renderPlayer(pt: PlaythroughListing): void {
    p1.show(deps.agents().get(pt.player) ?? null, { locked: false });
    // The list is something to read: lit even when the player isn't in the roster.
    p1.el.classList.remove('waiting');
    if (pt.persona) p1.showYou(pt.persona);
    p1.setTag(`1P · ${ptIndex + 1}/${list.length}`);
    ptTop = topRowFor(ptIndex, ptTop, list.length, LIST_ROWS);
    const rows: FileRow[] = list.slice(ptTop, ptTop + LIST_ROWS).map((p) => ({
      row: { id: p.id, text: p.name, on: p.id === pt.id, aside: ago(p.updatedAt), ...(p.id === activeId ? { chip: 'ACTIVE' } : {}) },
    }));
    const from = history(pt);
    p1.setFile({
      name: pt.name,
      tagline: [pt.id === activeId ? 'Active' : null, pt.persona?.name ?? cap(pt.player), ago(pt.updatedAt)].filter(Boolean).join(' · '),
      head: '// PLAYTHROUGHS',
      rows: from ? [...rows, { p: from }] : rows,
    });
  }

  /** The CPU side and the under line: the focused stop on the timeline. */
  function renderStop(pt: PlaythroughListing): void {
    const s = row === 0 ? undefined : savesOf(pt)[row - 1];
    const her = speakerOf(pt, s);
    p2.show(her ?? null, { locked: false });
    p2.setTag(`CPU · ${s ? KINDS[s.trigger] : 'NOW'}`);
    const where = whereOf(pt, row);
    const at = s ? s.at : pt.updatedAt;
    const when = [s?.timeOfDay, ago(at)].filter((x): x is string => !!x).join(' · ');
    p2.setFile({
      ...(her ? {} : { name: s?.lastLine?.speaker ?? '???' }),
      tagline: where,
      head: s ? '// AT THIS SAVE' : '// WHERE YOU LEFT IT',
      rows: [
        ...(s?.lastLine ? [{ quote: spoken(s.lastLine.text) }] : []),
        {
          facts: [
            { label: 'WHEN', value: when },
            ...(her?.modelLabel ? [{ label: 'MODEL', value: her.modelLabel }] : []),
            { label: 'LOAD', value: s ? 'starts a new one here' : 'continues this playthrough' },
          ],
        },
      ],
    });
    const storyTime = s?.clock !== undefined ? formatClock(s.clock) : null;
    if (!renaming) under.textContent = confirming ? CONFIRM : [where, s?.timeOfDay, storyTime, ago(at)].filter((x): x is string => !!x).join(' · ').toUpperCase();
  }

  /** Everything for the selected playthrough; `band` rebuilds the timeline (glitching it in on a new playthrough). */
  function render(o: { band?: 'glitch' | 'quiet' } = {}): void {
    if (destroyed) return;
    const pt = selected();
    if (!pt) {
      p1.show(null, { locked: false });
      p2.show(null, { locked: false });
      band.setTiles([], 0);
      under.textContent = loaded ? 'NO PLAYTHROUGHS' : '';
      return;
    }
    if (o.band) band.setTiles(tiles(pt), row, { glitch: o.band === 'glitch' });
    else band.move(row);
    renderPlayer(pt);
    renderStop(pt);
  }

  /** The selected playthrough's saves, newest first (fetched once). */
  async function fetchSaves(pt: PlaythroughInfo): Promise<void> {
    if (savesBy.has(pt.id)) return;
    // Arriving the first time, the timeline glitches in (the NOW tile alone just did).
    try {
      const saves = await deps.api.listSaves(pt.id);
      savesBy.set(pt.id, [...saves].sort((a, b) => b.at - a.at));
    } catch (err) {
      error.textContent = `// COULDN'T LIST SAVES — ${why(err)}`;
    }
    if (selected()?.id === pt.id) render({ band: renaming ? 'quiet' : 'glitch' });
  }

  function selectPlaythrough(i: number): void {
    ptIndex = i;
    row = 0;
    render({ band: 'glitch' });
    const pt = selected();
    if (pt) void fetchSaves(pt);
  }

  /** Keys work again: the lock and JACK IN come off. */
  function unlock(): void {
    busy = false;
    band.setLive(true);
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

  /** Lock flash and shake, then JACK IN (NOW) or FORK HERE (a save) types out; the call goes after JACK_MS. */
  function enter(): void {
    const pt = selected();
    if (!pt || busy) return;
    const s = row === 0 ? undefined : savesOf(pt)[row - 1];
    if (row !== 0 && !s) return;
    deps.sound('confirm');
    busy = true;
    band.setLive(false);
    p1.lock();
    p2.lock();
    p1.shake();
    p2.shake();
    jack.textContent = s ? 'FORK HERE' : 'JACK IN';
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

  /** Del then Y: on NOW the playthrough (the active one refuses), on a save that save. */
  function remove(): void {
    const pt = selected();
    if (!pt) return;
    if (row === 0) {
      void attempt('DELETE', async () => {
        await deps.api.removePlaythrough(pt.id);
        list = list.filter((p) => p.id !== pt.id);
        savesBy.delete(pt.id);
        selectPlaythrough(Math.min(ptIndex, Math.max(0, list.length - 1)));
      });
      return;
    }
    const s = savesOf(pt)[row - 1];
    if (!s) return;
    void attempt('DELETE', async () => {
      await deps.api.removeSave(s.id);
      const rest = savesOf(pt).filter((x) => x.id !== s.id);
      savesBy.set(pt.id, rest);
      row = Math.min(row, rest.length);
      render({ band: 'quiet' });
    });
  }

  /** R: the under line becomes the selected playthrough's name field; Enter renames, Esc keeps it. */
  function startRename(): void {
    const pt = selected();
    if (!pt) return;
    renaming = true;
    const input = el('input', 'pn-input');
    input.value = pt.name;
    input.maxLength = 80;
    under.replaceChildren(input);
    input.focus();
    input.select();
    const done = () => {
      if (!renaming) return;
      renaming = false;
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
        if (!next || next === pt.name) return done();
        // Off before the call: its render puts the under line back.
        renaming = false;
        void attempt('RENAME', async () => {
          const updated = await deps.api.rename(pt.id, next);
          list = list.map((p) => (p.id === pt.id ? { ...updated, contacts: p.contacts } : p));
        });
      }
    });
    input.addEventListener('blur', done);
  }

  function pick(i: number): void {
    if (busy || renaming) return;
    if (i === row) return enter();
    focusRow(i);
  }

  /** Focuses stop `i` on the timeline (keys, the mouse over a tile, the wheel). */
  function focusRow(i: number): void {
    if (busy || renaming || confirming || i === row) return;
    row = i;
    deps.sound('move');
    render();
  }

  /** The next or previous stop on the timeline, clamped to NOW and the oldest save. */
  function stepRow(d: number): void {
    const pt = selected();
    if (pt) focusRow(Math.min(savesOf(pt).length, Math.max(0, row + d)));
  }

  /** The next or previous playthrough, clamped to the list. */
  function stepPlaythrough(d: number): void {
    if (busy || renaming || confirming || list.length === 0) return;
    const i = Math.min(list.length - 1, Math.max(0, ptIndex + d));
    if (i === ptIndex) return;
    deps.sound('move');
    selectPlaythrough(i);
  }

  band.el.addEventListener('wheel', onWheel(stepRow), { passive: false });
  p1.el.addEventListener('wheel', onWheel(stepPlaythrough), { passive: false });

  p1.el.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.pt');
    if (!r || busy || renaming) return;
    const i = list.findIndex((p) => p.id === r.dataset.id);
    if (i >= 0 && i !== ptIndex) {
      deps.sound('move');
      selectPlaythrough(i);
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (isModified(e) || renaming) return;
    if (confirming) {
      const k = e.key.toLowerCase();
      if (k !== 'y' && k !== 'n' && e.key !== 'Escape') return;
      e.preventDefault();
      confirming = false;
      render();
      if (k === 'y') remove();
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
    const pt = selected()!;
    setHint(null);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepPlaythrough(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepRow(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enter();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      startRename();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      confirming = true;
      render();
    }
  };
  window.addEventListener('keydown', onKey);

  void (async () => {
    const [res, names] = await Promise.all([deps.api.listPlaythroughs().catch((err: unknown) => (error.textContent = `// COULDN'T LIST PLAYTHROUGHS — ${why(err)}`, null)), placeNames()]);
    if (destroyed) return;
    places = names;
    if (res) {
      list = [...res.playthroughs].sort((a, b) => b.updatedAt - a.updatedAt);
      activeId = res.active;
    }
    loaded = true;
    selectPlaythrough(Math.max(0, list.findIndex((p) => p.id === activeId)));
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
      window.removeEventListener('keydown', onKey);
      box.remove();
    },
  };
}
