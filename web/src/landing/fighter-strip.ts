/** One side of the character-select screen: full-body art plus the file strip (name, tagline, file, extras). View only — see spec §4.3, §4.4, §12. */
import { COPY } from './copy';
import type { PlaythroughPersona } from '../../../shared/persona';
import type { LandingAgent } from './landing';
import type { Fact } from '../../../shared/types';

export type Side = 'p1' | 'p2';

/** One part of a screen's own file (title, LOAD): a paragraph, a quoted line, facts, or a pickable row. */
export type FileRow =
  | { p: string }
  | { quote: string }
  | { facts: Fact[] }
  | { row: { id: string; text: string; aside?: string; chip?: string; on?: boolean } };
export interface StripFile {
  name?: string;
  tagline?: string;
  head: string;
  rows: FileRow[];
}
/** Names longer than this drop to the smaller Teko size. */
const LONG_NAME = 14;

export interface StripModels {
  state: 'loading' | 'ready' | 'offline';
  choices: { id: string; label: string }[];
  index: number;
  confirmed: boolean;
}

/** How long the transient `swap` / `locked` / `print` / `shake` flashes stay on, in ms. */
const FLASH_MS = 400;

/** LINK's value for a broken link, or null when it's fine (or not yet known). */
function linkStatus(a: LandingAgent): string | null {
  if (a.link === 'ok' || a.link === 'unknown') return null;
  return COPY.linkStatus[a.link];
}

/**
 * Stored facts first, then PREVIOUSLY (the locked player's unseen recap, p2 only) / LINK (when
 * broken) / LAST SEEN / BACKEND / MODEL (direct only) — each skipped whenever a stored fact
 * already uses that label.
 */
export function liveFacts(a: LandingAgent, o: { side?: Side; player?: string | null } = {}): Fact[] {
  const out: Fact[] = [...a.facts];
  const labels = new Set(out.map((f) => f.label));
  const recap = o.player != null ? a.recaps[o.player] : undefined;
  if (o.side === 'p2' && recap !== undefined && !labels.has(COPY.livePreviously)) out.push({ label: COPY.livePreviously, value: recap });
  const link = linkStatus(a);
  if (link !== null && !labels.has(COPY.liveLink)) out.push({ label: COPY.liveLink, value: link });
  if (a.room && !labels.has(COPY.liveLastSeen)) out.push({ label: COPY.liveLastSeen, value: a.room.scene });
  if (!labels.has(COPY.liveBackend)) out.push({ label: COPY.liveBackend, value: COPY.backendNames[a.backend] });
  if (a.backend === 'direct' && a.modelLabel !== null && !labels.has(COPY.liveModel)) out.push({ label: COPY.liveModel, value: a.modelLabel });
  return out;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** One pending removal timer per (element, class), so a second flash within the window isn't cut short by the first's timer. */
const pendingFlashes = new WeakMap<HTMLElement, Map<string, ReturnType<typeof setTimeout>>>();

/**
 * Re-triggers a transient class (remove, force reflow, re-add) and schedules its removal after
 * `ms`. Replaces any still-pending removal for the same element+class first, so flashing again
 * mid-flash (e.g. relocking onto a different character before the first `locked` flash clears)
 * keeps the class for its own full duration rather than being cut short by the earlier timer.
 */
function scheduleFlash(target: HTMLElement, cls: string, ms: number): void {
  let timers = pendingFlashes.get(target);
  if (!timers) {
    timers = new Map();
    pendingFlashes.set(target, timers);
  }
  const existing = timers.get(cls);
  if (existing !== undefined) clearTimeout(existing);
  target.classList.remove(cls);
  void target.offsetWidth; // force reflow so a repeat restarts the flash
  target.classList.add(cls);
  const timer = setTimeout(() => {
    target.classList.remove(cls);
    timers!.delete(cls);
  }, ms);
  timers.set(cls, timer);
}

/** `scheduleFlash`, skipped entirely under reduced motion (used for the swap/locked/print flashes). */
function flash(target: HTMLElement, cls: string, reducedMotion: boolean, ms = FLASH_MS): void {
  if (reducedMotion) return;
  scheduleFlash(target, cls, ms);
}

function fileRow(r: FileRow): HTMLElement {
  if ('p' in r) return el('p', '', r.p);
  if ('quote' in r) return el('q', '', r.quote);
  if ('facts' in r) {
    const dl = document.createElement('dl');
    for (const f of r.facts) dl.append(el('dt', '', f.label), el('dd', '', f.value));
    return dl;
  }
  const row = el('div', `pt${r.row.on ? ' on' : ''}`);
  row.dataset.id = r.row.id;
  row.append(el('b', '', r.row.text));
  if (r.row.chip) row.append(el('span', 'act', r.row.chip));
  if (r.row.aside) row.append(el('small', '', r.row.aside));
  return row;
}

function buildBadge(a: LandingAgent): HTMLElement {
  const badge = el('div', 'fighter-badge');
  badge.dataset.kind = a.avatarKind;
  if (a.avatarKind === 'monogram') {
    badge.append(el('div', 'mono', a.name.charAt(0).toUpperCase()));
  } else {
    const avatar = el('div', 'avatar');
    avatar.style.setProperty('--img', `url("/api/agents/${encodeURIComponent(a.id)}/avatar")`);
    avatar.style.setProperty('--a', a.accent);
    badge.append(avatar);
  }
  return badge;
}

/**
 * One fighter column: `.fighter-art` (or `.fighter-badge` with no sprite) above a `.file-strip`
 * (name, tagline, file, extras) and a `.tag`. `show(null, …)` renders the waiting silhouette;
 * `setModels` only affects p2's extras and is ignored on p1.
 */
export class FighterStrip {
  readonly el: HTMLElement;
  private readonly side: Side;
  private readonly reducedMotion: boolean;
  private readonly fileStrip: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly taglineEl: HTMLElement;
  private readonly file: HTMLElement;
  private readonly extraEl: HTMLElement;
  private readonly tagEl: HTMLElement;
  /** The last `setFile`, so the same file again doesn't print in twice. */
  private fileKey: string | null = null;
  private artEl: HTMLElement | null = null;
  private artSrc: string | null = null;
  /** The locked fighter's select face, an `<img>` stacked right after the sprite (`.fighter-art`). */
  private faceEl: HTMLImageElement | null = null;
  /** Art URLs that failed to load: shown as the badge from then on. */
  private readonly failedArt = new Set<string>();
  private agent: LandingAgent | null = null;
  private models: StripModels | null = null;
  /** The model step's panel, standing in for her file while it's up. */
  private panel: HTMLElement | null = null;

  constructor(host: HTMLElement, side: Side, o: { reducedMotion: boolean }) {
    this.side = side;
    this.reducedMotion = o.reducedMotion;
    this.el = el('div', `fighter ${side}`);
    this.fileStrip = el('div', 'file-strip');
    this.nameEl = el('div', 'name');
    this.taglineEl = el('div', 'tagline');
    this.file = el('div', 'fighter-file');
    this.extraEl = el('div', 'extra');
    this.fileStrip.append(this.nameEl, this.taglineEl, this.file, this.extraEl);
    this.tagEl = el('div', 'tag', side === 'p1' ? COPY.tagP1 : COPY.tagP2);
    this.el.append(this.fileStrip, this.tagEl);
    host.append(this.el);
  }

  show(a: LandingAgent | null, s: { locked: boolean; player?: string | null }): void {
    if (a === null) {
      this.el.classList.add('waiting');
      this.el.classList.remove('is-locked');
      this.clearArt();
      this.nameEl.textContent = '';
      this.nameEl.classList.remove('long');
      // A screen's file prints in again only when someone else stood here.
      if (this.agent !== null) this.fileKey = null;
      this.taglineEl.textContent = COPY.awaiting;
      this.file.classList.remove('has-facts');
      this.file.replaceChildren();
      this.extraEl.replaceChildren();
      this.agent = null;
      this.models = null;
      return;
    }
    this.el.classList.remove('waiting');
    this.nameEl.classList.remove('long');
    const changed = this.agent?.id !== a.id;
    // The same agent redrawn (a roster poll): the screen's file doesn't print in again.
    if (changed) this.fileKey = null;
    this.renderArt(a, s.locked);
    this.nameEl.textContent = a.name.toUpperCase();
    this.taglineEl.textContent = a.tagline;
    this.renderFile(a, s.player ?? null);
    if (changed) flash(this.file, 'print', this.reducedMotion);
    this.agent = a;
    if (changed) this.models = null;
    this.renderExtra();
    this.applyLocked(s.locked, changed);
  }

  /**
   * 1P with a persona (EDIT / CUSTOM): its name, its background's first line and a YOU file of its
   * paragraphs stand in for the character's (call after `show`). Null leaves what `show` drew.
   */
  showYou(p: PlaythroughPersona | null): void {
    this.el.classList.toggle('is-you', p !== null);
    if (!p) return;
    const paras = p.background.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    this.nameEl.textContent = p.name.toUpperCase();
    this.taglineEl.textContent = p.background.split('\n')[0]?.trim() ?? '';
    this.file.classList.remove('has-facts');
    this.file.replaceChildren(el('div', 'dh', COPY.fileHeader(COPY.you.tag)), ...paras.map((t) => el('p', '', t)));
  }

  setTag(text: string): void {
    this.tagEl.textContent = text;
  }

  /** A screen's own file over whatever `show` drew: name and tagline when given, the file always. */
  setFile(f: StripFile): void {
    if (f.name !== undefined) {
      this.nameEl.textContent = f.name.toUpperCase();
      this.nameEl.classList.toggle('long', f.name.length > LONG_NAME);
    }
    if (f.tagline !== undefined) this.taglineEl.textContent = f.tagline;
    this.file.classList.remove('has-facts');
    this.file.replaceChildren(el('div', 'dh', f.head), ...f.rows.map(fileRow));
    const key = JSON.stringify(f);
    if (key !== this.fileKey) flash(this.file, 'print', this.reducedMotion);
    this.fileKey = key;
  }

  setModels(m: StripModels | null): void {
    if (this.side === 'p1') return;
    this.models = m;
    this.renderExtra();
  }

  /** The model step's panel takes the (widened) strip's place; null gives the file back. */
  setPanel(panel: HTMLElement | null): void {
    if (panel === this.panel) return;
    this.panel?.remove();
    this.panel = panel;
    this.fileStrip.classList.toggle('wide', panel !== null);
    if (panel) this.fileStrip.replaceChildren(panel);
    else this.fileStrip.replaceChildren(this.nameEl, this.taglineEl, this.file, this.extraEl);
  }

  /** Locks in (the flash and the held look) without redrawing what's in the strip. */
  lock(): void {
    this.applyLocked(true, false);
  }

  shake(): void {
    scheduleFlash(this.el, 'shake', FLASH_MS);
  }

  private clearArt(): void {
    this.clearFace();
    this.artEl?.remove();
    this.artEl = null;
    this.artSrc = null;
  }

  private renderArt(a: LandingAgent, locked: boolean): void {
    const src = a.sprite ? a.sprite.url : null;
    if (src === null || this.failedArt.has(src)) {
      this.showNoSpriteArt(a);
      return;
    }
    let img: HTMLImageElement;
    if (this.artEl instanceof HTMLImageElement) {
      img = this.artEl;
    } else {
      img = document.createElement('img');
      img.className = 'fighter-art';
      // Spec §8: art that won't load falls to the next step, her badge.
      // Remembered, so the next render doesn't retry (and flicker) the broken image.
      img.addEventListener('error', () => {
        if (this.artEl !== img || !this.agent || this.artSrc === null) return;
        this.failedArt.add(this.artSrc);
        this.artSrc = null;
        this.showNoSpriteArt(this.agent);
      });
      this.replaceArt(img);
    }
    if (src !== this.artSrc) {
      img.src = src;
      this.artSrc = src;
      flash(img, 'swap', this.reducedMotion);
    }
    // The server picks the select face; an agent from before it did shows happy.
    const face = locked ? (a.sprite?.selectFace !== undefined ? a.sprite.selectFace : a.sprite?.expressions?.happy) : undefined;
    this.renderFace(img, face != null && !this.failedArt.has(face) ? face : null);
  }

  /** Stacks her face over the sprite `<img>` (null removes it). A face that fails is dropped, leaving the sprite. */
  private renderFace(base: HTMLImageElement, url: string | null): void {
    if (url === null) {
      this.clearFace();
      return;
    }
    if (this.faceEl?.getAttribute('src') === url) return;
    this.clearFace();
    const face = document.createElement('img');
    face.className = 'fighter-art fighter-face';
    face.addEventListener('error', () => {
      if (this.faceEl !== face) return;
      this.failedArt.add(url);
      this.clearFace();
    });
    face.src = url;
    base.after(face);
    this.faceEl = face;
    flash(face, 'swap', this.reducedMotion);
  }

  private clearFace(): void {
    this.faceEl?.remove();
    this.faceEl = null;
  }

  /** No sprite (or it failed to load): her badge. */
  private showNoSpriteArt(a: LandingAgent): void {
    this.artSrc = null;
    this.replaceArt(buildBadge(a));
  }

  private replaceArt(next: HTMLElement): void {
    this.clearFace();
    if (this.artEl) this.artEl.replaceWith(next);
    else this.el.insertBefore(next, this.fileStrip);
    this.artEl = next;
  }

  /** A character's file: the bio fades out if it runs long, the facts under it always show. */
  private renderFile(a: LandingAgent, player: string | null): void {
    const bio = el('div', 'fighter-bio');
    bio.append(el('div', 'dh', COPY.fileHeader(a.name.toUpperCase())));
    for (const para of a.bio) bio.append(el('p', '', para));
    const dl = document.createElement('dl');
    for (const f of liveFacts(a, { side: this.side, player })) {
      dl.append(el('dt', '', f.label), el('dd', '', f.value));
    }
    this.file.classList.add('has-facts');
    this.file.replaceChildren(bio, dl);
    // The fade only when the bio is cut: a bio that fits keeps its last line clear.
    requestAnimationFrame(() => bio.classList.toggle('cut', bio.scrollHeight > bio.clientHeight + 1));
  }

  private applyLocked(locked: boolean, changed: boolean): void {
    const wasLocked = this.el.classList.contains('is-locked');
    this.el.classList.toggle('is-locked', locked);
    if (locked && (!wasLocked || changed)) flash(this.el, 'locked', this.reducedMotion);
  }

  /** P1 never shows extras; p2's depend on backend/connection state and, for a connected direct character, the last `setModels`. */
  private renderExtra(): void {
    this.extraEl.replaceChildren();
    if (this.side === 'p1') return;
    const a = this.agent;
    if (!a) return;
    if (a.backend === 'none') {
      this.extraEl.textContent = COPY.noMind;
      return;
    }
    if (a.backend === 'direct' && a.connected && a.link === 'no-link') {
      this.extraEl.append(el('div', 'link-invite', COPY.link.stripExtra(a.pronoun)));
      return;
    }
    if (!a.connected) {
      this.extraEl.append(el('div', 'error', a.connectionError ?? COPY.notConnected));
      return;
    }
    if (this.models) this.extraEl.append(this.buildModels(this.models));
  }

  private buildModels(m: StripModels): HTMLElement {
    const wrap = el('div', 'models');
    wrap.append(el('div', 'mh', COPY.modelHeader));
    if (m.confirmed) {
      const choice = m.choices[m.index];
      if (choice) wrap.append(el('div', 'm on', choice.label));
      return wrap;
    }
    if (m.state === 'loading') {
      wrap.append(el('div', 'm', this.agent?.modelLabel ?? ''));
      return wrap;
    }
    m.choices.forEach((c, i) => {
      wrap.append(el('div', `m${i === m.index ? ' on' : ''}`, c.label));
    });
    if (m.state === 'offline') wrap.append(el('div', 'offline', COPY.catalogOffline));
    return wrap;
  }
}
