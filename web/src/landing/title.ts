/**
 * The title menu (spec 2026-10-09 front-end restyle §3), in the select screen's language: the
 * player and the contact as fighters with their files, and a tile band — CONTINUE the active
 * playthrough with a known contact (↑↓ picks which), NEW GAME (the select flow), LOAD, and REPORT A BUG
 * (spec 2026-10-11 bug report §3.1).
 */
import type { AroundEntry, ContactEntry, PlaythroughInfo } from '../../../shared/types';
import type { PlaythroughApi, PlaythroughListing } from '../net/playthroughs';
import { FighterStrip, liveFacts, type StripFile } from './fighter-strip';
import { mountHelpCorner } from './help-corner';
import type { LandingAgent } from './landing';
import { canBeAi } from './select-flow';
import { TileBand, type BandTile } from './tile-band';
import './title.css';

export type TitleItem = 'continue' | 'new' | 'load' | 'report';
export type TitleCue = 'move' | 'confirm';

export interface TitleDeps {
  api: PlaythroughApi;
  nav(path: string): void;
  onNewGame(): void;
  onLoad(): void;
  onReport(): void;
  sound(cue: TitleCue): void;
  /** The roster, by id (the select's): fighters' art, taglines and facts. */
  agents(): ReadonlyMap<string, LandingAgent>;
  /** What the backdrop shows: an agent's room, or the skyline (null). The landing waits for the cursor to rest. */
  backdrop(agentId: string | null): void;
  reducedMotion: boolean;
}

/** JACK IN shows this long before the room opens. */
export const JACK_MS = 900;

const LABELS: Record<TitleItem, string> = { continue: 'CONTINUE', new: 'NEW GAME', load: 'LOAD', report: 'REPORT A BUG' };
// Keys in brackets, so a key never reads as part of its action (ENTER JACK IN).
const HINTS = '[←→] CHOOSE · [↑↓] CONTACT · [ENTER] JACK IN · [ESC] SPLASH';
const HINTS_ONE = '[←→] CHOOSE · [ENTER] JACK IN · [ESC] SPLASH';

/** "just now", "5m ago", "2h ago", "3d ago". */
export function ago(at: number, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const isModified = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey;
/** How long the server cuts a last line (ContactEntry.lastLine, SaveInfo.lastLine). */
const LAST_LINE_MAX = 120;
/** A last line as a quote: no *action* markup, and … when the server cut it. */
export function spoken(text: string): string {
  const plain = text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  return text.length >= LAST_LINE_MAX ? `${plain}…` : plain;
}
const roomThumb = (sceneId: string) => `/scenes/${sceneId.split('/').map(encodeURIComponent).join('/')}/room.png`;

export function mountTitle(root: HTMLElement, deps: TitleDeps): { destroy(): void; refresh(): void } {
  const box = el('div', 'title-menu');
  // The heading names the focused tile's action (as select's SELECT YOUR OPERATOR heads the select).
  const logo = el('div', 'title-logo');
  const p1 = new FighterStrip(box, 'p1', { reducedMotion: deps.reducedMotion });
  const p2 = new FighterStrip(box, 'p2', { reducedMotion: deps.reducedMotion });
  // Room for all four (CONTINUE, NEW GAME, LOAD, REPORT A BUG): none hides past the edge.
  const band = new TileBand(box, { reducedMotion: deps.reducedMotion, visible: 4, tileW: 150, tileH: 160, onPick: (i) => pick(i), onHover: (i) => focus(i) });
  const under = el('div', 'title-under');
  const error = el('div', 'title-error');
  const jack = el('div', 'jack-in', 'JACK IN');
  const hints = el('div', 'title-hints');
  box.append(logo, under, error, jack, hints);
  root.append(box);
  const help = mountHelpCorner(box, window.lowlight);

  let items: TitleItem[] = [];
  let index = 0;
  let list: PlaythroughListing[] = [];
  let active: PlaythroughInfo | null = null;
  let known: ContactEntry[] = [];
  let shown = 0;
  /** The contact CONTINUE opens on (where the playthrough is); while solo, staying on it means the solo screen. */
  let initialShown = 0;
  /** The contact the playthrough is at is no longer known (she left the roster): no place of hers to name. */
  let leftGone = false;
  /** The playthrough is in a stranger's room (AROUND LOWLIGHT, not met yet): where, for CONTINUE. */
  let strangerHere: AroundEntry | null = null;
  let personaName = '';
  /** Who persona.json names (the default player), for whom its name stands. */
  let personaId: string | null = null;
  let busy = false;
  let destroyed = false;
  let jackTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<void> {
    let res: Awaited<ReturnType<PlaythroughApi['listPlaythroughs']>> | null = null;
    try {
      res = await deps.api.listPlaythroughs();
    } catch {
      // The server can't list playthroughs: a new game is still on offer.
    }
    list = res?.playthroughs ?? [];
    active = list.find((p) => p.id === res!.active) ?? null;
    if (active) {
      const [cs, persona, around] = await Promise.all([
        deps.api.contacts().catch(() => []),
        deps.api.persona().catch(() => null),
        deps.api.around().catch(() => [] as AroundEntry[]),
      ]);
      known = cs;
      // No persona file: the player id, capitalised as the server names such a player.
      personaName = persona?.name ?? active.player.charAt(0).toUpperCase() + active.player.slice(1);
      personaId = persona?.id ?? null;
      const at = active.location?.contactId ?? active.startContact;
      shown = Math.max(0, known.findIndex((c) => c.id === at));
      initialShown = shown;
      leftGone = !known.some((c) => c.id === at);
      // Walked in on a stranger whose greeting never came: CONTINUE goes back into her room.
      strangerHere = around.find((e) => e.contactId === active!.location?.contactId) ?? null;
    }
    items = [...(active ? (['continue'] as const) : []), 'new', ...(list.length > 0 ? (['load'] as const) : []), 'report'];
    index = 0;
    if (!destroyed) {
      rebuild();
      render();
    }
  }

  function tile(item: TitleItem): BandTile {
    if (item === 'continue') {
      const c = known[shown];
      // Her select thumbnail (the grid's face), else her portrait, else her initial.
      const thumb = c ? deps.agents().get(c.id)?.thumb : null;
      return {
        id: item,
        name: LABELS[item],
        art: thumb
          ? { kind: 'room', src: thumb }
          : c?.portrait
            ? { kind: 'face', src: c.portrait }
            : { kind: 'mark', text: (c?.name ?? '?').charAt(0).toUpperCase() },
        tag: { text: '▶', now: true },
      };
    }
    if (item === 'new') return { id: item, name: LABELS[item], art: { kind: 'mark', text: '?' } };
    if (item === 'report') return { id: item, name: LABELS[item], art: { kind: 'mark', text: '!' } };
    const rooms = [...new Set(list.map((p) => p.location?.sceneId).filter((s): s is string => !!s))].slice(0, 4);
    return { id: item, name: LABELS[item], art: rooms.length ? { kind: 'mosaic', srcs: rooms.map(roomThumb) } : { kind: 'mark', text: '≡' } };
  }

  /** The band's tiles (when the items or the contact shown change). */
  function rebuild(): void {
    band.setTiles(items.map(tile), index);
  }

  /** Shows `a`, or the waiting fighter when the roster doesn't have her. */
  function fighter(s: FighterStrip, a: LandingAgent | undefined, locked = false): void {
    s.show(a ?? null, { locked });
  }

  function render(): void {
    band.move(index);
    const item = items[index];
    logo.textContent = item ? LABELS[item] : '';
    p1.setTag('1P · YOU');
    p2.setTag('CPU · AI');
    hints.textContent = item === 'continue' && known.length > 1 ? HINTS : HINTS_ONE;
    if (item === 'continue' && active) renderContinue(active);
    else if (item === 'load') renderLoad();
    else if (item === 'report') renderReport();
    else renderNew();
  }

  function renderContinue(pt: PlaythroughInfo): void {
    const c = known[shown];
    const her = c ? deps.agents().get(c.id) : undefined;
    fighter(p1, deps.agents().get(pt.player));
    if (pt.persona) p1.showYou(pt.persona);
    const when = [c?.timeOfDay, ago(pt.updatedAt)].filter((s): s is string => !!s).join(' · ');
    // The playthrough's own persona, else persona.json's name for the default player, else the character's.
    const name = pt.persona?.name ?? (personaId === pt.player ? personaName : (deps.agents().get(pt.player)?.name ?? personaName));
    p1.setFile({
      name,
      head: '// LAST SCENE',
      rows: [
        {
          facts: [
            ...(c ? [{ label: 'WHERE', value: c.placeName }] : []),
            { label: 'WHEN', value: when },
            { label: 'SAVE', value: pt.name },
            { label: 'CONTACTS', value: known.map((k) => k.name).join(' · ') },
          ],
        },
      ],
    });
    fighter(p2, her);
    const herFile: StripFile = {
      head: '// LAST LINE',
      rows: [c?.lastLine ? { quote: spoken(c.lastLine.text) } : { p: 'No lines yet.' }, { facts: her ? liveFacts(her, { side: 'p2' }).slice(0, 3) : [] }],
    };
    p2.setFile(her ? herFile : { ...herFile, name: c?.name ?? '???' });
    const place = c ? [c.placeName, c.timeOfDay, ago(pt.updatedAt)].filter((s): s is string => !!s).join(' · ').toUpperCase() : '';
    const untouched = shown === initialShown;
    const where =
      pt.solo && untouched ? (leftGone ? 'ON YOUR OWN' : `ON YOUR OWN · ${place}`) : strangerHere && untouched ? strangerHere.placeName.toUpperCase() : place;
    under.textContent = known.length > 1 ? `${where}  ◀ ${shown + 1}/${known.length} ▶` : where;
    deps.backdrop(c && c.timeOfDay !== null ? c.id : null);
  }

  function renderNew(): void {
    fighter(p1, undefined);
    fighter(p2, undefined);
    p1.setFile({ name: '???', head: '// NEW GAME', rows: [{ p: 'Your character, then theirs.' }, { p: 'Then SET THE SCENE deals three openings.' }] });
    const online = [...deps.agents().values()].filter(canBeAi).length;
    p2.setFile({ name: '???', head: '// OPEN LINE', rows: [{ p: `${online} contacts online` }] });
    under.textContent = 'PICK WHO YOU ARE · THEN WHO ANSWERS';
    deps.backdrop(null);
  }

  function renderLoad(): void {
    fighter(p1, undefined);
    fighter(p2, undefined);
    // The list is something to read: the 1P strip stays lit (only FORK waits).
    p1.el.classList.remove('waiting');
    p1.setFile({
      name: 'Saves',
      tagline: 'Newest first',
      head: '// PLAYTHROUGHS',
      rows: list.map((p) => ({ row: { id: p.id, text: p.name, aside: ago(p.updatedAt) } })),
    });
    p2.setFile({
      name: 'Fork',
      tagline: 'Loading never overwrites',
      head: '// HOW LOAD WORKS',
      rows: [{ p: 'Pick a save; a new playthrough starts there.' }, { p: 'The original stays as it was.' }],
    });
    under.textContent = `${list.length} PLAYTHROUGHS`;
    deps.backdrop(null);
  }

  function renderReport(): void {
    fighter(p1, undefined);
    fighter(p2, undefined);
    p1.el.classList.remove('waiting');
    p1.setFile({ name: 'Bugs', head: '// BUG REPORT', rows: [{ p: 'What went wrong, in your words.' }, { p: 'It goes straight to the developer.' }] });
    p2.setFile({ name: 'Tip', head: '// IN A SCENE', rows: [{ p: 'Press F8 in a scene to report from there, with a screenshot.' }] });
    under.textContent = 'SOMETHING BROKE? TELL THE DEVELOPER';
    deps.backdrop(null);
  }

  /** Back from a failed CONTINUE: keys work again. */
  function unlock(): void {
    busy = false;
    band.setLive(true);
    jack.classList.remove('on');
  }

  async function continueWith(): Promise<void> {
    if (!active) return;
    const c = known[shown];
    const id = c?.id ?? active.location?.contactId ?? active.startContact;
    error.textContent = '';
    // Solo and still on the contact you left: back to the solo screen, not into her room.
    if (active.solo && shown === initialShown) {
      if (!destroyed) deps.nav('/solo');
      return;
    }
    // In a stranger's room and still on it: back in there (she isn't a contact to switch to).
    if (strangerHere && shown === initialShown) {
      if (!destroyed) deps.nav(`/room/${encodeURIComponent(strangerHere.contactId)}`);
      return;
    }
    try {
      if (id !== active.location?.contactId) await deps.api.setLocation(id);
    } catch (err) {
      if (destroyed) return;
      unlock();
      error.textContent = `// COULDN'T REACH ${(c?.name ?? id).toUpperCase()} — ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    if (!destroyed) deps.nav(`/room/${encodeURIComponent(id)}`);
  }

  function enter(): void {
    if (busy || items.length === 0) return;
    const item = items[index];
    deps.sound('confirm');
    if (item === 'new') return deps.onNewGame();
    if (item === 'load') return deps.onLoad();
    if (item === 'report') return deps.onReport();
    busy = true;
    band.setLive(false);
    // Lock in without redrawing: the files stay as they are under JACK IN.
    p1.lock();
    p2.lock();
    p1.shake();
    p2.shake();
    jack.classList.add('on');
    jackTimer = setTimeout(() => {
      jackTimer = null;
      void continueWith();
    }, JACK_MS);
  }

  function focus(i: number): void {
    if (busy || i === index || i < 0 || i >= items.length) return;
    index = i;
    deps.sound('move');
    render();
  }

  function pick(i: number): void {
    if (i === index) enter();
    else focus(i);
  }

  const onKey = (e: KeyboardEvent) => {
    if (items.length === 0 || isModified(e)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      focus(index + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (busy || items[index] !== 'continue' || known.length < 2) return;
      shown = (shown + (e.key === 'ArrowUp' ? -1 : 1) + known.length) % known.length;
      deps.sound('move');
      rebuild();
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enter();
    }
  };
  window.addEventListener('keydown', onKey);
  void load();

  return {
    /** The roster changed (it arrived, or a poll): redraw what's shown, unless JACK IN is under way. */
    refresh() {
      if (destroyed || busy || items.length === 0) return;
      rebuild();
      render();
    },
    destroy() {
      destroyed = true;
      if (jackTimer !== null) clearTimeout(jackTimer);
      window.removeEventListener('keydown', onKey);
      help.destroy();
      box.remove();
    },
  };
}
