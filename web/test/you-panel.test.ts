import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaythroughPersona } from '../../shared/persona';
import { editPrefill, YouPanel } from '../src/landing/you-panel';

const NIX = { name: 'Nix', pronoun: 'she' as const, tagline: 'Courier on the Ribbon.', bio: ['Runs packages nobody else will.', 'Owes Cass a favour.'] };

let host: HTMLElement;
afterEach(() => host?.remove());

function open(initial: PlaythroughPersona | null = null) {
  host = document.createElement('div');
  document.body.append(host);
  const onChoose = vi.fn<(p: PlaythroughPersona | null) => void>();
  const onBack = vi.fn();
  const panel = new YouPanel(host, { character: NIX, initial, onChoose, onBack });
  const q = <T extends Element>(sel: string) => panel.el.querySelector(sel) as T;
  const key = (k: string, mods: KeyboardEventInit = {}) => panel.key(new KeyboardEvent('keydown', { key: k, ...mods }));
  const type = (sel: string, value: string) => {
    const f = q<HTMLInputElement | HTMLTextAreaElement>(sel);
    f.value = value;
    f.dispatchEvent(new Event('input'));
  };
  return { panel, onChoose, onBack, q, key, type };
}

describe('editPrefill', () => {
  it("the character's name, and tagline then bio paragraphs separated by blank lines", () => {
    expect(editPrefill(NIX)).toEqual({ name: 'Nix', background: 'Courier on the Ribbon.\n\nRuns packages nobody else will.\n\nOwes Cass a favour.' });
  });

  it('skips an empty tagline and caps at 1200 on a word boundary', () => {
    const long = editPrefill({ name: 'Nix', tagline: '', bio: ['word '.repeat(400).trim()] });
    expect(long.background.startsWith('word')).toBe(true);
    expect(long.background.length).toBeLessThanOrEqual(1200);
    expect(long.background.endsWith('word')).toBe(true);
  });
});

describe('YouPanel', () => {
  it('three rows, PLAY AS highlighted', () => {
    const { panel } = open();
    const rows = [...panel.el.querySelectorAll('.yp-row')];
    expect(rows.map((r) => r.textContent)).toEqual(['PLAY AS NIX', 'EDIT', 'CUSTOM']);
    expect(rows.map((r) => (r as HTMLElement).dataset.kind)).toEqual(['as', 'edit', 'custom']);
    expect(rows[0].classList.contains('on')).toBe(true);
  });

  it('Enter on PLAY AS chooses none', () => {
    const { key, onChoose } = open();
    expect(key('Enter')).toBe(true);
    expect(onChoose).toHaveBeenCalledWith(null);
  });

  it('arrows move the highlight; EDIT opens the form prefilled', () => {
    const { key, q, panel } = open();
    expect(key('ArrowDown')).toBe(true);
    expect(panel.el.querySelector('.yp-row.on')!.getAttribute('data-kind')).toBe('edit');
    key('Enter');
    expect(q<HTMLInputElement>('.yp-name').value).toBe('Nix');
    expect(q<HTMLTextAreaElement>('.yp-background').value).toBe(editPrefill(NIX).background);
    expect(q('.yp-count').textContent).toBe(`${editPrefill(NIX).background.length} / 1200`);
    expect(q<HTMLInputElement>('.yp-name').maxLength).toBe(40);
    expect(q<HTMLTextAreaElement>('.yp-background').maxLength).toBe(1200);
  });

  it('CUSTOM opens a blank form with the placeholder; CONFIRM waits for a name', () => {
    const { key, q, type } = open();
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(q<HTMLInputElement>('.yp-name').value).toBe('');
    expect(q<HTMLTextAreaElement>('.yp-background').placeholder).toBe('Who are you? A line or a few paragraphs.');
    expect(q<HTMLButtonElement>('.yp-confirm').disabled).toBe(true);
    type('.yp-name', '  ');
    expect(q<HTMLButtonElement>('.yp-confirm').disabled).toBe(true);
    type('.yp-name', 'Vee');
    expect(q<HTMLButtonElement>('.yp-confirm').disabled).toBe(false);
  });

  it('an EDIT confirmed unchanged chooses none; changed, it chooses the persona (trimmed)', () => {
    const a = open();
    a.key('ArrowDown');
    a.key('Enter');
    a.type('.yp-name', 'Nix ');
    expect(a.key('Enter', { ctrlKey: true })).toBe(true);
    expect(a.onChoose).toHaveBeenCalledWith(null);
    a.panel.destroy();

    const b = open();
    b.key('ArrowDown');
    b.key('Enter');
    b.type('.yp-background', 'Retired courier. ');
    b.key('Enter', { ctrlKey: true });
    expect(b.onChoose).toHaveBeenCalledWith({ name: 'Nix', background: 'Retired courier.', kind: 'edit' });
  });

  it('Ctrl+Enter confirms a custom persona; with no name it does nothing', () => {
    const { key, type, onChoose } = open();
    key('ArrowUp'); // stays on PLAY AS
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(key('Enter', { ctrlKey: true })).toBe(true);
    expect(onChoose).not.toHaveBeenCalled();
    type('.yp-name', 'Vee');
    type('.yp-background', 'Ex-courier.');
    key('Enter', { metaKey: true });
    expect(onChoose).toHaveBeenCalledWith({ name: 'Vee', background: 'Ex-courier.', kind: 'custom' });
  });

  it('while the form is open, letters, arrows and plain Enter are left to the field', () => {
    const { key } = open();
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    for (const k of ['h', 'H', 'ArrowLeft', 'ArrowDown', 'Enter', ' ', 'Backspace']) expect(key(k), k).toBe(false);
  });

  it('Esc in the form returns to the rows; Esc on the rows calls onBack', () => {
    const { key, panel, onBack } = open();
    key('ArrowDown');
    key('Enter');
    expect(key('Escape')).toBe(true);
    expect(panel.el.querySelector('.yp-form')).toBeNull();
    expect(panel.el.querySelector('.yp-row.on')!.getAttribute('data-kind')).toBe('edit');
    expect(onBack).not.toHaveBeenCalled();
    expect(key('Escape')).toBe(true);
    expect(onBack).toHaveBeenCalled();
  });

  it('the mouse: clicking a row picks it; clicking CONFIRM and BACK work like the keys', () => {
    const { panel, q, type, onChoose } = open();
    (panel.el.querySelector('.yp-row[data-kind="custom"]') as HTMLElement).click();
    type('.yp-name', 'Vee');
    q<HTMLButtonElement>('.yp-back').click();
    expect(panel.el.querySelector('.yp-form')).toBeNull();
    (panel.el.querySelector('.yp-row[data-kind="as"]') as HTMLElement).click();
    expect(onChoose).toHaveBeenCalledWith(null);
    onChoose.mockClear();
    (panel.el.querySelector('.yp-row[data-kind="custom"]') as HTMLElement).click();
    type('.yp-name', 'Vee');
    q<HTMLButtonElement>('.yp-confirm').click();
    expect(onChoose).toHaveBeenCalledWith({ name: 'Vee', background: '', kind: 'custom' });
  });

  it('a persona already chosen reopens the form with its values, and confirming keeps it', () => {
    const { q, key, onChoose } = open({ name: 'Vee', background: 'Ex-courier.' });
    expect(q<HTMLInputElement>('.yp-name').value).toBe('Vee');
    expect(q<HTMLTextAreaElement>('.yp-background').value).toBe('Ex-courier.');
    key('Enter', { ctrlKey: true });
    expect(onChoose).toHaveBeenCalledWith({ name: 'Vee', background: 'Ex-courier.', kind: 'custom' });
  });

  it('an EDIT persona reopened stays an EDIT, and confirming it unchanged keeps it (ties need the kind)', () => {
    const { key, onChoose } = open({ name: 'Nix', background: 'Retired courier.', kind: 'edit' });
    key('Enter', { ctrlKey: true });
    expect(onChoose).toHaveBeenCalledWith({ name: 'Nix', background: 'Retired courier.', kind: 'edit' });
  });

  it('text goes in as text, never markup', () => {
    host = document.createElement('div');
    const panel = new YouPanel(host, { character: { ...NIX, name: '<b>X</b>' }, initial: null, onChoose: () => {}, onBack: () => {} });
    expect(panel.el.querySelector('b')).toBeNull();
    expect(panel.el.querySelector('.yp-row')!.textContent).toBe('PLAY AS <B>X</B>');
  });

  it('destroy removes the panel', () => {
    const { panel } = open();
    panel.destroy();
    expect(host.querySelector('.you-panel')).toBeNull();
  });
});

describe("YouPanel: the persona's pronoun (spec 2026-10-12 §5)", () => {
  const pressed = (q: ReturnType<typeof open>['q']) =>
    [...(q<HTMLElement>('.yp-pronoun').querySelectorAll('button'))].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.pronoun);

  it("the form offers SHE · HE · THEY, starting on the character's", () => {
    const { key, q } = open();
    key('ArrowDown');
    key('Enter');
    expect([...q<HTMLElement>('.yp-pronoun').querySelectorAll('button')].map((b) => b.textContent)).toEqual(['SHE', 'HE', 'THEY']);
    expect(pressed(q)).toEqual(['she']);
  });

  it("EDIT keeping her pronoun saves none; CUSTOM set to THEY saves they", () => {
    const edit = open();
    edit.key('ArrowDown');
    edit.key('Enter');
    edit.type('.yp-name', 'Vee');
    edit.key('Enter', { ctrlKey: true });
    expect(edit.onChoose.mock.calls[0]![0]).not.toHaveProperty('pronoun');
    edit.panel.destroy();

    const custom = open();
    custom.key('ArrowDown');
    custom.key('ArrowDown');
    custom.key('Enter');
    custom.type('.yp-name', 'Rin');
    custom.q<HTMLElement>('.yp-pronoun button[data-pronoun="they"]').click();
    custom.key('Enter', { ctrlKey: true });
    expect(custom.onChoose).toHaveBeenCalledWith({ name: 'Rin', background: '', kind: 'custom', pronoun: 'they' });
  });

  it('EDIT changed only in pronoun is a persona, not playing as written', () => {
    const { key, q, onChoose } = open();
    key('ArrowDown');
    key('Enter');
    q<HTMLElement>('.yp-pronoun button[data-pronoun="he"]').click();
    key('Enter', { ctrlKey: true });
    expect(onChoose.mock.calls[0]![0]).toMatchObject({ name: 'Nix', kind: 'edit', pronoun: 'he' });
  });

  it('reopened with a pronoun, the form shows it', () => {
    const { q } = open({ name: 'Rin', background: '', kind: 'custom', pronoun: 'he' });
    expect(pressed(q)).toEqual(['he']);
  });
});

