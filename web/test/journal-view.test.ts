import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientEvent, Note } from '../../shared/types';
import { JournalView } from '../src/ui/journal';
import { setHerPronoun } from '../src/room/her-copy';

// These rooms' contact is a she (the page learns it from her portrait event).
setHerPronoun('she');

const note = (o: Partial<Note> & { id: string }): Note => ({ text: 'x', pinned: false, createdAt: 1, updatedAt: 1, editedBy: 'agent', about: 'you', ...o });
const NOTES: Note[] = [
  note({ id: 'n2', text: 'Hae owes us a favour', pinned: true, createdAt: 2 }),
  note({ id: 'n3', text: 'the window crack got worse', createdAt: 3, editedBy: 'user' }),
  note({ id: 'n1', text: '<b>the blue mug</b> is yours now', createdAt: 1 }),
];

let panels: JournalView[] = [];
let sent: ClientEvent[];
let prompt: HTMLTextAreaElement;

function setup(undoMs = 6000) {
  document.body.innerHTML = '';
  prompt = document.createElement('textarea');
  sent = [];
  const panel = new JournalView((e) => sent.push(e), { undoMs });
  const root = panel.element;
  document.body.append(prompt, root);
  panels.push(panel);
  panel.setNotes(NOTES);
  return { root, panel };
}
const key = (k: string, target: EventTarget = document.activeElement ?? document.body, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.journal-row')];

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  for (const p of panels) p.dispose();
  panels = [];
});

describe('JournalView note keywords', () => {
  it('shows a note\'s keywords, and editing them sends journal_edit keys', () => {
    const { root, panel } = setup();
    panel.setNotes([note({ id: 'n1', text: 'Teo owes', keys: ['Teo', 'debt'] })]);
    const keys = root.querySelector<HTMLElement>('.jr-keys')!;
    expect(keys.textContent).toBe('# Teo · debt');
    keys.click();
    const input = root.querySelector<HTMLInputElement>('.jr-keys-edit')!;
    expect(input.value).toBe('Teo, debt');
    input.value = 'Teo, Mother Rot';
    key('Enter', input);
    expect(sent.at(-1)).toEqual({ type: 'journal_edit', id: 'n1', keys: ['Teo', 'Mother Rot'] });
  });
  it('an unkeyed note offers + KEYWORDS', () => {
    const { root, panel } = setup();
    panel.setNotes([note({ id: 'n1', text: 'x' })]);
    expect(root.querySelector('.jr-keys')!.textContent).toBe('+ KEYWORDS');
  });
});

describe('JournalView rows', () => {
  it('shows the header, pinned first then newest first, the editor mark, and text as text', () => {
    const { root, panel } = setup();
    expect(root.querySelector('.journal-count')!.textContent).toBe('3 NOTES');
    expect(rows(root).map((r) => r.dataset.id)).toEqual(['n2', 'n3', 'n1']);
    expect(rows(root)[0].classList.contains('pinned')).toBe(true);
    expect(rows(root)[1].querySelector('.jr-edited')!.textContent).toBe('edited by you');
    expect(rows(root)[2].querySelector('.jr-edited')).toBeNull();
    const text = rows(root)[2].querySelector('.jr-text')!;
    expect(text.textContent).toBe('<b>the blue mug</b> is yours now');
    expect(text.querySelector('b')).toBeNull();
  });

  it('shows an empty state, and "1 NOTE" for one', () => {
    const { root, panel } = setup();
    panel.setNotes([]);
    expect(root.querySelector('.journal-empty')!.textContent).toBe('// NO NOTES YET');
    panel.setNotes([NOTES[0]]);
    expect(root.querySelector('.journal-count')!.textContent).toBe('1 NOTE');
  });

  it('edits in place: Enter saves, Esc cancels the edit', () => {
    const { root, panel } = setup();
    (rows(root)[1].querySelector('.jr-text') as HTMLElement).click();
    const edit = root.querySelector<HTMLTextAreaElement>('.jr-edit')!;
    expect(edit.value).toBe('the window crack got worse');
    edit.value = 'the window crack is spreading';
    key('Enter', edit);
    expect(sent).toEqual([{ type: 'journal_edit', id: 'n3', text: 'the window crack is spreading' }]);
    (rows(root)[1].querySelector('.jr-text') as HTMLElement).click();
    key('Escape', root.querySelector('.jr-edit')!);
    expect(root.querySelector('.jr-edit')).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('a live update mid-edit keeps the draft and never steals focus (final review 1)', () => {
    const { root, panel } = setup();
    (rows(root)[1].querySelector('.jr-text') as HTMLElement).click();
    const edit = root.querySelector<HTMLTextAreaElement>('.jr-edit')!;
    expect(document.activeElement).toBe(edit); // focused when the edit starts
    edit.value = 'half-typed draft';
    edit.dispatchEvent(new Event('input'));
    prompt.focus();
    panel.setNotes([note({ id: 'n9', text: 'she just noted this', createdAt: 9 }), ...NOTES]);
    panel.showError('something');
    const after = root.querySelector<HTMLTextAreaElement>('.jr-edit')!;
    expect(after.value).toBe('half-typed draft');
    expect(document.activeElement).toBe(prompt);
  });

  it('Enter that saves an edit goes no further (no page turn in the feed) (final review 2)', () => {
    const { root, panel } = setup();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    (rows(root)[0].querySelector('.jr-text') as HTMLElement).click();
    const edit = root.querySelector<HTMLTextAreaElement>('.jr-edit')!;
    edit.value = 'changed';
    key('Enter', edit);
    expect(later).not.toHaveBeenCalled();
    window.removeEventListener('keydown', later);
  });

  it('typing j while editing types it', () => {
    const { root, panel } = setup();
    (rows(root)[0].querySelector('.jr-text') as HTMLElement).click();
    const edit = root.querySelector<HTMLTextAreaElement>('.jr-edit')!;
    edit.focus();
    expect(key('j', edit).defaultPrevented).toBe(false);
  });

  it('the pin button toggles the pin', () => {
    const { root, panel } = setup();
    (rows(root)[0].querySelector('.jr-pin') as HTMLElement).click();
    (rows(root)[2].querySelector('.jr-pin') as HTMLElement).click();
    expect(sent).toEqual([
      { type: 'journal_edit', id: 'n2', pinned: false },
      { type: 'journal_edit', id: 'n1', pinned: true },
    ]);
  });

  it('delete offers undo for a while, which restores the original note', () => {
    vi.useFakeTimers();
    const { root, panel } = setup(6000);
    (rows(root)[1].querySelector('.jr-del') as HTMLElement).click();
    expect(sent).toEqual([{ type: 'journal_delete', id: 'n3' }]);
    expect(root.querySelector('.journal-undo')!.textContent).toContain('NOTE DELETED · UNDO');
    (root.querySelector('.journal-undo-btn') as HTMLElement).click();
    expect(sent[1]).toEqual({ type: 'journal_restore', note: NOTES[1] });
    expect(root.querySelector('.journal-undo')).toBeNull();
    (rows(root)[0].querySelector('.jr-del') as HTMLElement).click();
    vi.advanceTimersByTime(6001);
    expect(root.querySelector('.journal-undo')).toBeNull();
  });

  it('splits into Dossier and Journal sections, each toggleable to the other (Review Focus 5)', () => {
    const { root, panel } = setup();
    panel.setPlayerName('Cass');
    const notes = [
      note({ id: 'n7', text: 'likes her coffee black', about: 'you', createdAt: 1 }),
      note({ id: 'n3', text: 'need to fix the window', about: 'me', createdAt: 2 }),
    ];
    panel.setNotes(notes);
    const headings = [...root.querySelectorAll('.journal-section-title')].map((h) => h.textContent);
    expect(headings).toEqual(['Dossier: Cass', 'Journal']);

    const sections = [...root.querySelectorAll('.journal-section')];
    const dossierRows = [...sections[0].querySelectorAll('.journal-row')];
    const journalRows = [...sections[1].querySelectorAll('.journal-row')];
    expect(dossierRows.map((r) => (r as HTMLElement).dataset.id)).toEqual(['n7']);
    expect(journalRows.map((r) => (r as HTMLElement).dataset.id)).toEqual(['n3']);

    const toDossier = journalRows[0].querySelector('.jr-toggle') as HTMLElement;
    expect(toDossier.textContent).toBe('→ dossier');
    const toJournal = dossierRows[0].querySelector('.jr-toggle') as HTMLElement;
    expect(toJournal.textContent).toBe('→ journal');
    toJournal.click();
    expect(sent).toEqual([{ type: 'journal_edit', id: 'n7', about: 'me' }]);
  });

  it('an empty section shows a muted placeholder, and the heading is plain "Dossier" before setPlayerName', () => {
    const { root, panel } = setup();
    panel.setNotes([note({ id: 'n1', text: 'only in the journal', about: 'me' })]);
    const headings = [...root.querySelectorAll('.journal-section-title')].map((h) => h.textContent);
    expect(headings).toEqual(['Dossier', 'Journal']);
    const sections = [...root.querySelectorAll('.journal-section')];
    expect(sections[0].querySelector('.journal-section-empty')!.textContent).toBe('Nothing yet.');
  });

  it('shows an error inline, and re-renders when notes arrive while open', () => {
    const { root, panel } = setup();
    panel.showError('pinned notes are full (8): …');
    expect(root.querySelector('.journal-error')!.textContent).toBe('pinned notes are full (8): …');
    panel.setNotes([...NOTES, note({ id: 'n4', text: 'new one', createdAt: 9 })]);
    expect(rows(root).map((r) => r.dataset.id)).toContain('n4');
  });
});

describe('JournalView dossier page', () => {
  const PAGE = { text: 'Hicks: steady, runs a crew, going all in on contracts.', at: Date.UTC(2026, 9, 6, 5, 0), by: 'agent' as const };
  const box = (root: HTMLElement) => root.querySelector<HTMLTextAreaElement>('.jd-page textarea.jd-text')!;

  it('an empty page with a tie shows the tie as the box hint (final review 5)', () => {
    const { root, panel } = setup();
    panel.setPage({ text: null, at: null, by: null, tie: 'Court.' });
    expect(box(root).value).toBe('');
    expect(box(root).placeholder).toBe('Empty. What she knows of you from before: Court.');
  });

  it('the dossier section starts with the page box holding the page text and its meta line', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    const dossier = root.querySelector('.journal-section')!;
    expect(dossier.querySelector('.journal-section-title')!.nextElementSibling!.classList.contains('jd-page')).toBe(true);
    expect(box(root).value).toBe(PAGE.text);
    expect(root.querySelector('.jd-meta')!.textContent).toMatch(/^by her · /);
    panel.setPage({ ...PAGE, by: 'user' });
    expect(root.querySelector('.jd-meta')!.textContent).toMatch(/^edited by you · /);
  });

  it('SAVE sends dossier_page_edit with the textarea value', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    box(root).value = 'Hicks: quit production.';
    box(root).dispatchEvent(new Event('input'));
    const save = root.querySelector<HTMLButtonElement>('.jd-page button.jd-save')!;
    expect(save.textContent).toBe('SAVE');
    save.click();
    expect(sent).toEqual([{ type: 'dossier_page_edit', text: 'Hicks: quit production.' }]);
  });

  it('an empty page shows an empty box and no meta line, even with no notes', () => {
    const { root, panel } = setup();
    panel.setNotes([]);
    panel.setPage({ text: null, at: null, by: null });
    expect(box(root).value).toBe('');
    expect(root.querySelector('.jd-meta')!.textContent).toBe('');
    expect(root.querySelector('.journal-empty')!.textContent).toBe('// NO NOTES YET');
  });

  it('the counter shows n/1375 as you type', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    expect(root.querySelector('.jd-count')!.textContent).toBe(`${PAGE.text.length}/1375`);
    box(root).value = 'abc';
    box(root).dispatchEvent(new Event('input'));
    expect(root.querySelector('.jd-count')!.textContent).toBe('3/1375');
  });

  it('a server update does not clobber unsaved typing in the focused box', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    box(root).focus();
    box(root).value = 'half-typed page';
    box(root).dispatchEvent(new Event('input'));
    panel.setPage({ ...PAGE, text: 'she rewrote it meanwhile' });
    panel.setNotes(NOTES);
    expect(box(root).value).toBe('half-typed page');
    expect(document.activeElement).toBe(box(root));
    box(root).value = 'she rewrote it meanwhile'; // matches the server's page: nothing unsaved
    box(root).dispatchEvent(new Event('input'));
    panel.setPage({ ...PAGE, text: 'newer still' });
    expect(box(root).value).toBe('newer still');
  });
});

describe('JournalView in the PEOPLE screen', () => {
  const PAGE = { text: 'Hicks: steady.', at: 1, by: 'agent' as const };
  it('busy while a note edit is open or the page has unsaved text; not otherwise', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    expect(panel.busy).toBe(false);
    (rows(root)[0].querySelector('.jr-text') as HTMLElement).click();
    expect(panel.busy).toBe(true);
    key('Escape', root.querySelector('.jr-edit')!);
    expect(panel.busy).toBe(false);
    const box = root.querySelector<HTMLTextAreaElement>('.jd-text')!;
    box.value = 'Hicks: steady, and owes Hae.';
    box.dispatchEvent(new Event('input'));
    expect(panel.busy).toBe(true);
  });

  it('Esc in the page with a draft reverts it to her page; busy no more', () => {
    const { root, panel } = setup();
    panel.setPage(PAGE);
    const box = root.querySelector<HTMLTextAreaElement>('.jd-text')!;
    box.value = 'changed my mind';
    box.dispatchEvent(new Event('input'));
    expect(panel.busy).toBe(true);
    const e = key('Escape', box);
    expect(e.defaultPrevented).toBe(true);
    expect(panel.busy).toBe(false);
    expect(root.querySelector<HTMLTextAreaElement>('.jd-text')!.value).toBe(PAGE.text);
  });

  it('flashSave marks the page SAVE for 600 ms', () => {
    vi.useFakeTimers();
    const { root, panel } = setup();
    panel.flashSave();
    expect(root.querySelector('.jd-save')!.classList.contains('flash')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(root.querySelector('.jd-save')!.classList.contains('flash')).toBe(false);
  });

  it('setContact puts her face, name and note count in the header line', () => {
    const { root, panel } = setup();
    panel.setContact({ name: 'Nix', accent: '#ff4f8b', face: '/nix.png' });
    const who = root.querySelector<HTMLElement>('.jd-who')!;
    expect(who.querySelector('img')!.getAttribute('src')).toBe('/nix.png');
    expect(who.querySelector('.jd-name')!.textContent).toBe('NIX');
    expect(who.querySelector('.journal-count')!.textContent).toBe('3 NOTES');
    panel.setContact({ name: 'Cass', accent: '#f80', face: null });
    expect(root.querySelector('.jd-who .jd-mono')!.textContent).toBe('C');
  });

  it('notes that arrive before the view is in the page show when it is mounted', () => {
    const view = new JournalView(() => {});
    panels.push(view);
    view.setNotes(NOTES);
    view.setPage(PAGE);
    document.body.replaceChildren(view.element);
    expect(rows(view.element).map((r) => r.dataset.id)).toEqual(['n2', 'n3', 'n1']);
    expect(view.element.querySelector<HTMLTextAreaElement>('.jd-text')!.value).toBe(PAGE.text);
  });
});
