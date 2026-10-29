import { her } from '../room/her-copy';
import type { ClientEvent, JournalEditor, Note } from '../../../shared/types';
import '../room/journal-view.css';

const UNDO_MS = 6000;
const PAGE_MAX = 1375;

export interface DossierPageView {
  text: string | null;
  at: number | null;
  by: JournalEditor | null;
  /** While there's no page: what she knows of you from before (ties). */
  tie?: string;
}

const pageTime = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The player's view of the agent's room journal, as the PEOPLE screen's JOURNAL tab (2026-10-18 spec §2): her dossier
 * page on him and her notes, laid out as a case file. Pinned notes first, then newest first; edit in place,
 * pin/unpin, delete with a short undo. Changes go to the server as journal events; the list comes back as
 * `journal` events, whether or not the tab is showing. All note text goes in through `textContent`.
 */
export class JournalView {
  /** The tab's content; persistent, so the PEOPLE screen mounts the same element each time. */
  readonly element: HTMLElement;
  private notes: Note[] = [];
  private playerName: string | null = null;
  private contact: { name: string; accent: string; face: string | null } | null = null;
  private editing: string | null = null;
  /** Which part of the note `editing` is: its text or its keywords. */
  private editField: 'text' | 'keys' = 'text';
  /** The text being typed in the open edit; survives live re-renders. */
  private draft = '';
  /** Focus the edit box on the next render (only right after an edit starts — never steal focus later). */
  private focusEdit = false;
  private undo: { note: Note; timer: ReturnType<typeof setTimeout> } | null = null;
  private flash: ReturnType<typeof setTimeout> | null = null;
  private error = '';
  private page: DossierPageView = { text: null, at: null, by: null };
  /** Unsaved typing in the page box; null when the box shows the server's page. */
  private pageDraft: string | null = null;
  private readonly undoMs: number;

  constructor(
    private readonly send: (e: ClientEvent) => void,
    opts: { undoMs?: number } = {},
  ) {
    this.undoMs = opts.undoMs ?? UNDO_MS;
    this.element = el('div', 'jd-root');
    this.render();
  }

  /** A note edit is open, or the page has unsaved text: the screen mustn't close over it. */
  get busy(): boolean {
    return this.editing !== null || this.pageDraft !== null;
  }

  setNotes(notes: Note[]): void {
    this.notes = notes;
    if (this.editing && !notes.some((n) => n.id === this.editing)) this.editing = null;
    this.render();
  }

  /** The dossier heading's name (`Dossier: <name>`); plain "Dossier" until this is called. */
  setPlayerName(name: string): void {
    this.playerName = name;
    this.render();
  }

  /** Whose journal this is: the contact you're with, in the tab's header line. */
  setContact(c: { name: string; accent: string; face: string | null }): void {
    this.contact = c;
    this.render();
  }

  /** Her dossier page on this tab's player. Unsaved typing in the box is kept over a newer page. */
  setPage(page: DossierPageView): void {
    this.page = page;
    // The server trims what it saves, so a saved draft comes back trimmed.
    if (this.pageDraft !== null && this.pageDraft.trim() === (page.text ?? '')) this.pageDraft = null;
    this.render();
  }

  showError(text: string): void {
    this.error = text;
    this.render();
  }

  /** The page's SAVE lights for a moment: what a refused close points at. */
  flashSave(): void {
    const save = this.element.querySelector('.jd-save');
    if (!save) return;
    if (this.flash) clearTimeout(this.flash);
    save.classList.add('flash');
    this.flash = setTimeout(() => {
      this.flash = null;
      this.element.querySelector('.jd-save')?.classList.remove('flash');
    }, 600);
  }

  dispose(): void {
    if (this.undo) clearTimeout(this.undo.timer);
    if (this.flash) clearTimeout(this.flash);
  }

  private render(): void {
    const head = el('header', 'jd-who');
    const count = this.notes.length;
    if (this.contact) {
      const c = this.contact;
      head.style.setProperty('--c', c.accent);
      const mono = el('span', 'jd-mono', c.name.charAt(0).toUpperCase());
      if (c.face) {
        const img = el('img', 'jd-face');
        img.alt = '';
        img.src = c.face;
        img.addEventListener('error', () => img.replaceWith(mono));
        head.append(img);
      } else head.append(mono);
      head.append(el('span', 'jd-name', c.name.toUpperCase()));
    }
    head.append(el('span', 'journal-count', `${count} ${count === 1 ? 'NOTE' : 'NOTES'}`));
    const list = el('div', 'journal-list');
    const dossierTitle = this.playerName ? `Dossier: ${this.playerName}` : 'Dossier';
    if (count === 0) {
      const dossier = el('div', 'journal-section');
      dossier.append(el('h3', 'journal-section-title', dossierTitle), this.pageBox());
      list.append(dossier, el('div', 'journal-empty', '// NO NOTES YET'));
    } else {
      list.append(this.section(dossierTitle, this.notes.filter((n) => n.about === 'you'), 'me', true));
      list.append(this.section('Journal', this.notes.filter((n) => n.about === 'me'), 'you'));
    }
    const parts: HTMLElement[] = [head];
    if (this.error) parts.push(el('div', 'journal-error', this.error));
    parts.push(list);
    if (this.undo) {
      const bar = el('div', 'journal-undo', 'NOTE DELETED · ');
      const btn = el('button', 'journal-undo-btn', 'UNDO');
      btn.type = 'button';
      btn.addEventListener('click', () => this.restore());
      bar.append(btn);
      parts.push(bar);
    }
    // Re-rendering replaces the page box; keep its focus and caret if the player is typing in it.
    const active = document.activeElement;
    const typing = active instanceof HTMLTextAreaElement && active.classList.contains('jd-text') && this.element.contains(active);
    const caret = typing ? [active.selectionStart, active.selectionEnd] : null;
    this.element.replaceChildren(...parts);
    const pageText = this.element.querySelector<HTMLTextAreaElement>('.jd-text');
    if (caret && pageText) {
      pageText.focus();
      pageText.setSelectionRange(caret[0], caret[1]);
    }
    const edit = this.element.querySelector<HTMLTextAreaElement | HTMLInputElement>('.jr-edit, .jr-keys-edit');
    if (edit && this.focusEdit) {
      this.focusEdit = false;
      edit.focus();
      edit.setSelectionRange(edit.value.length, edit.value.length);
    }
  }

  private section(title: string, notes: Note[], toggleTo: 'me' | 'you', withPage = false): HTMLElement {
    const section = el('div', 'journal-section');
    section.append(el('h3', 'journal-section-title', title));
    if (withPage) section.append(this.pageBox());
    if (notes.length === 0) section.append(el('div', 'journal-section-empty', 'Nothing yet.'));
    else for (const n of notes) section.append(this.row(n, toggleTo));
    return section;
  }

  /** Her one-page dossier: free text she rewrites with update_dossier; the player edits and saves it here. */
  private pageBox(): HTMLElement {
    const box = el('div', 'jd-page');
    const text = el('textarea', 'jd-text');
    text.value = this.pageDraft ?? this.page.text ?? '';
    text.rows = 5;
    text.placeholder = this.page.tie ? her().pageTie(this.page.tie) : her().pageEmpty;
    const { at, by } = this.page;
    const meta = el('div', 'jd-meta', at !== null && by !== null ? `${by === 'agent' ? her().byHer : 'edited by you'} · ${pageTime(at)}` : '');
    const count = el('span', 'jd-count', `${text.value.length}/${PAGE_MAX}`);
    text.addEventListener('input', () => {
      this.pageDraft = text.value === (this.page.text ?? '') ? null : text.value;
      count.textContent = `${text.value.length}/${PAGE_MAX}`;
      count.classList.toggle('over', text.value.trim().length > PAGE_MAX);
    });
    // Enter is a newline here; keep it from turning a [CONTINUE] page in the feed. Esc with a draft reverts it
    // to her page (as Esc cancels a note's edit): the way out of an edit you've changed your mind about.
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.stopPropagation();
      if (e.key === 'Escape' && this.pageDraft !== null) {
        e.preventDefault();
        e.stopPropagation();
        this.pageDraft = null;
        this.render();
      }
    });
    count.classList.toggle('over', text.value.trim().length > PAGE_MAX);
    const save = el('button', 'jd-save', 'SAVE');
    save.type = 'button';
    save.addEventListener('click', () => {
      this.error = '';
      this.send({ type: 'dossier_page_edit', text: text.value });
    });
    const foot = el('div', 'jd-foot');
    foot.append(meta, count, save);
    box.append(text, foot);
    return box;
  }

  private row(n: Note, toggleTo: 'me' | 'you'): HTMLElement {
    const row = el('div', `journal-row${n.pinned ? ' pinned' : ''}`);
    row.dataset.id = n.id;
    const pin = el('button', 'jr-pin', n.pinned ? '◆' : '◇');
    pin.type = 'button';
    pin.title = n.pinned ? 'Unpin' : 'Pin';
    pin.addEventListener('click', () => {
      this.error = '';
      this.send({ type: 'journal_edit', id: n.id, pinned: !n.pinned });
    });
    const body = el('div', 'jr-body');
    if (this.editing === n.id && this.editField === 'text') {
      const edit = el('textarea', 'jr-edit');
      edit.value = this.draft;
      edit.rows = 2;
      edit.addEventListener('input', () => (this.draft = edit.value));
      edit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // Consumed here: it must not also turn a [CONTINUE] page in the feed.
          e.preventDefault();
          e.stopPropagation();
          this.editing = null;
          this.error = '';
          if (edit.value.trim() !== n.text) this.send({ type: 'journal_edit', id: n.id, text: edit.value.trim() });
          this.render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.editing = null;
          this.render();
        }
      });
      body.append(edit);
    } else {
      const text = el('div', 'jr-text', n.text);
      text.addEventListener('click', () => {
        this.editing = n.id;
        this.editField = 'text';
        this.draft = n.text;
        this.focusEdit = true;
        this.render();
      });
      body.append(text);
    }
    body.append(this.keysRow(n));
    if (n.editedBy === 'user') body.append(el('div', 'jr-edited', 'edited by you'));
    const toggle = el('button', 'jr-toggle', toggleTo === 'me' ? '→ journal' : '→ dossier');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      this.error = '';
      this.send({ type: 'journal_edit', id: n.id, about: toggleTo });
    });
    const del = el('button', 'jr-del', '✕');
    del.type = 'button';
    del.title = 'Delete';
    del.addEventListener('click', () => this.remove(n));
    row.append(pin, body, toggle, del);
    return row;
  }

  /** The note's keywords (what brings it back to her when they come up); click to edit, comma-separated. */
  private keysRow(n: Note): HTMLElement {
    const keys = n.keys ?? [];
    if (this.editing === n.id && this.editField === 'keys') {
      const input = el('input', 'jr-keys-edit');
      input.value = this.draft;
      input.placeholder = 'names, places, things — comma-separated';
      input.addEventListener('input', () => (this.draft = input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this.editing = null;
          this.error = '';
          const next = input.value.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
          if (next.join('\u0000') !== keys.join('\u0000')) this.send({ type: 'journal_edit', id: n.id, keys: next });
          this.render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.editing = null;
          this.render();
        }
      });
      return input;
    }
    const row = el('button', 'jr-keys', keys.length > 0 ? `# ${keys.join(' · ')}` : '+ KEYWORDS');
    row.type = 'button';
    row.title = 'Keywords: she remembers this note when one comes up';
    row.addEventListener('click', () => {
      this.editing = n.id;
      this.editField = 'keys';
      this.draft = keys.join(', ');
      this.focusEdit = true;
      this.render();
    });
    return row;
  }

  private remove(n: Note): void {
    if (this.undo) clearTimeout(this.undo.timer);
    this.send({ type: 'journal_delete', id: n.id });
    this.undo = {
      note: n,
      timer: setTimeout(() => {
        this.undo = null;
        this.render();
      }, this.undoMs),
    };
    this.render();
  }

  private restore(): void {
    if (!this.undo) return;
    clearTimeout(this.undo.timer);
    this.send({ type: 'journal_restore', note: this.undo.note });
    this.undo = null;
    this.render();
  }
}
