/**
 * Who's here, as a party window down the left (2026-10-17, replacing the cameo strip): you, your contact,
 * everyone else in the room and a quest stranger with a face, one row each — their face, their name in
 * their accent, and who they are here — in full colour all the time. Whoever's line is in the box gets
 * a lit border and a speaker icon on their face. View only: the room feeds it the people and the
 * speaker. A click on someone else opens their file card; it never changes who your contact is.
 */
import type { OtherInfo } from '../../../shared/types';
import './whos-here.css';

/** The ids of your row and your contact's. */
export const PARTY_ROLE = { you: 'party:you', contact: 'party:contact' } as const;

/** You or your contact, as the party window shows them. */
export interface Member {
  name: string;
  accent: string;
  /** A face thumbnail; null shows their initial. */
  thumb: string | null;
}

interface Row {
  id: string;
  name: string;
  accent: string;
  thumb: string | null;
  role: string;
  /** Their file card, for someone else here (not you, your contact or a stranger). */
  info?: OtherInfo;
}

export class WhosHere {
  private readonly rows = new Map<string, HTMLElement>();
  private readonly reducedMotion: boolean;
  private card: { id: string; node: HTMLElement } | null = null;
  private speaker: string | null = null;
  private you: Member | null = null;
  private contact: Member | null = null;
  private comms = false;
  private others: OtherInfo[] = [];
  private stranger: { name: string; url: string } | null = null;

  constructor(
    private readonly root: HTMLElement,
    opts: { reducedMotion?: boolean } = {},
  ) {
    this.reducedMotion = opts.reducedMotion ?? false;
    root.classList.add('wh-party');
    root.hidden = true;
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('click', this.onOutside);
  }

  /** Whether someone's file card is open. */
  get cardOpen(): boolean {
    return this.card !== null;
  }

  /** You and your contact, at the top. */
  setParty(you: Member | null, contact: Member | null, o: { comms?: boolean } = {}): void {
    this.you = you;
    this.contact = contact;
    this.comms = o.comms === true;
    this.sync();
  }

  /** Everyone else here now, in order: newcomers fade in, those who left fade out. */
  set(others: OtherInfo[]): void {
    this.others = others;
    this.sync();
  }

  /** The quest stranger present with a face, last; null takes them away. */
  setStranger(s: { name: string; url: string } | null): void {
    if (s?.name === this.stranger?.name && s?.url === this.stranger?.url) return;
    this.stranger = s;
    this.sync();
  }

  /** Lights `id`'s row (a PARTY_ROLE, someone's id, or `stranger:<name>`); null lights nobody. */
  speaking(id: string | null): void {
    this.speaker = id;
    for (const [rid, node] of this.rows) {
      const on = rid === id;
      node.classList.toggle('wh-lit', on);
      const icon = node.querySelector('.wh-speaker');
      if (on && !icon) node.querySelector('.wh-face')!.append(speakerIcon());
      if (!on) icon?.remove();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('click', this.onOutside);
    this.closeCard();
    this.root.replaceChildren();
    this.rows.clear();
  }

  private list(): Row[] {
    const out: Row[] = [];
    if (this.you) out.push({ id: PARTY_ROLE.you, ...this.you, role: 'YOU' });
    // On comms (spec 2026-10-20 §2) she's on the line, not here.
    if (this.contact) out.push({ id: PARTY_ROLE.contact, ...this.contact, role: this.comms ? 'ON COMMS' : 'WITH YOU' });
    for (const o of this.others) out.push({ id: o.id, name: o.name, accent: o.accent, thumb: o.thumb, role: o.kind === 'resident' ? 'WORKS HERE' : 'HERE', info: o });
    if (this.stranger) out.push({ id: `stranger:${this.stranger.name}`, name: this.stranger.name, accent: '#a9c4d6', thumb: this.stranger.url, role: 'STRANGER' });
    return out;
  }

  private sync(): void {
    const list = this.list();
    const ids = new Set(list.map((r) => r.id));
    for (const [id, node] of this.rows) {
      if (ids.has(id)) continue;
      this.rows.delete(id);
      if (this.card?.id === id) this.closeCard();
      this.leave(node);
    }
    for (const r of list) {
      const had = this.rows.get(r.id);
      const node = had ?? this.make(r);
      if (had) this.fill(node, r);
      // Kept in order: each row goes after the previous one (leaving rows stay where they were).
      this.root.append(node);
      if (!had) {
        this.rows.set(r.id, node);
        if (!this.reducedMotion) {
          node.classList.add('wh-entering');
          requestAnimationFrame(() => node.classList.remove('wh-entering'));
        }
      }
    }
    this.root.hidden = list.length === 0;
    if (this.speaker !== null && !ids.has(this.speaker)) this.speaker = null;
    this.speaking(this.speaker);
  }

  private make(r: Row): HTMLElement {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'wh-tile';
    node.dataset.id = r.id;
    const face = document.createElement('span');
    face.className = 'wh-face';
    const who = document.createElement('span');
    who.className = 'wh-who';
    const name = document.createElement('span');
    name.className = 'wh-name';
    const role = document.createElement('span');
    role.className = 'wh-role';
    who.append(name, role);
    node.append(face, who);
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      const info = this.list().find((x) => x.id === r.id)?.info;
      if (!info) return;
      if (this.card?.id === info.id) this.closeCard();
      else this.openCard(info);
    });
    this.fill(node, r);
    return node;
  }

  /** Their name, role, accent and face (their thumbnail, or their initial when there's none or it fails). */
  private fill(node: HTMLElement, r: Row): void {
    node.style.setProperty('--wh-accent', r.accent);
    node.querySelector('.wh-name')!.textContent = r.name.toUpperCase();
    node.querySelector('.wh-role')!.textContent = r.role;
    const face = node.querySelector<HTMLElement>('.wh-face')!;
    if (face.dataset.src === (r.thumb ?? '')) return;
    face.dataset.src = r.thumb ?? '';
    const icon = face.querySelector('.wh-speaker');
    const initial = () => face.replaceChildren(document.createTextNode(r.name.charAt(0).toUpperCase()), ...(icon ? [icon] : []));
    if (!r.thumb) return initial();
    const img = document.createElement('img');
    img.src = r.thumb;
    img.alt = '';
    img.addEventListener(
      'error',
      () => {
        img.remove();
        initial();
      },
      { once: true },
    );
    face.replaceChildren(img, ...(icon ? [icon] : []));
  }

  private leave(node: HTMLElement): void {
    if (this.reducedMotion) {
      node.remove();
      return;
    }
    node.classList.add('wh-leaving');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    // A tab in the background never runs the transition: gone anyway.
    setTimeout(() => node.remove(), 600);
  }

  private openCard(o: OtherInfo): void {
    this.closeCard();
    const node = document.createElement('div');
    node.className = 'wh-card';
    node.style.setProperty('--wh-accent', o.accent);
    const head = document.createElement('div');
    head.className = 'wh-card-name';
    head.textContent = o.name.toUpperCase();
    node.append(head);
    if (o.tagline) {
      const tag = document.createElement('div');
      tag.className = 'wh-card-tag';
      tag.textContent = o.tagline;
      node.append(tag);
    }
    for (const f of o.facts) {
      const row = document.createElement('div');
      row.className = 'wh-card-fact';
      const label = document.createElement('span');
      label.className = 'wh-card-label';
      label.textContent = f.label;
      const value = document.createElement('span');
      value.textContent = f.value;
      row.append(label, value);
      node.append(row);
    }
    node.addEventListener('click', (e) => e.stopPropagation());
    this.root.append(node);
    this.card = { id: o.id, node };
  }

  private closeCard(): void {
    this.card?.node.remove();
    this.card = null;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this.card) return;
    e.stopPropagation();
    this.closeCard();
  };

  private readonly onOutside = (): void => {
    if (this.card) this.closeCard();
  };
}

/** The party row lit for the line in the box: you, your contact, someone here, or the quest stranger present. */
export function partySpeaker(c: { speaker: 'user' | 'contact' | 'other' | 'stranger'; otherId?: string } | null, stranger: string | null): string | null {
  if (!c) return null;
  if (c.speaker === 'user') return PARTY_ROLE.you;
  if (c.speaker === 'contact') return PARTY_ROLE.contact;
  if (c.speaker === 'other') return c.otherId ?? null;
  return stranger ? `stranger:${stranger}` : null;
}

/** A small speaker glyph for the speaking row's face (drawn in its accent by whos-here.css). */
function speakerIcon(): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'wh-speaker';
  icon.setAttribute('aria-label', 'speaking');
  icon.innerHTML =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.6a6 6 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  return icon;
}
