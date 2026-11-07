// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookLines, mountBookDrawer, type BookContext, type BookDrawer, type BookDrawerOptions, type BookFile } from '../src/room/book-drawer';
import type { BookEntry, BookPage } from '../../shared/lore';
import type { ChatMessage } from '../../shared/types';

const entry = (o: Partial<BookEntry> & Pick<BookEntry, 'id' | 'title'>): BookEntry => ({ category: null, section: null, keys: [], places: [], districts: [], always: false, body: `${o.title} body.`, ...o });
const PAGE: BookPage = {
  entries: [
    entry({ id: 'sdg', title: 'Sentinel Defense Group', category: 'Factions', keys: ['SDG'] }),
    entry({ id: 'reach', title: 'Iron Reach', category: 'City', keys: ['the Reach'] }),
    entry({ id: 'tilt', title: 'The Tilt', category: 'Places', places: ['the-tilt'] }),
  ],
  rooms: { 'the-tilt': { placeId: 'the-tilt', districtId: 'karasu' }, elsewhere: { placeId: 'elsewhere', districtId: 'karasu' } },
};
const YOU: BookFile = { id: 'hicks', name: 'Hicks', tag: 'YOUR FILE', bio: ['Netrunner.'], facts: [{ label: 'KNOWN FOR', value: 'Finding the gap.' }] };
const CASS: BookFile = { id: 'cass', name: 'Cass', tag: 'THEIR FILE', bio: ['Works the late shift.'], facts: [] };
const ctx = (o: Partial<BookContext> = {}): BookContext => ({ lines: [], draft: '', sceneId: 'the-tilt', present: [], ...o });

let host: HTMLElement;
let box: HTMLTextAreaElement;
let counts: number[];
let opens: boolean[];
let over: boolean;
let book: BookDrawer;
const mount = (o: Partial<BookDrawerOptions> = {}) =>
  mountBookDrawer(host, {
    files: () => Promise.resolve([YOU, CASS]),
    onCount: (n) => counts.push(n),
    onOpenChange: (on) => opens.push(on),
    chatBox: () => box,
    over: () => over,
    ...o,
  });
const flush = () => new Promise((r) => setTimeout(r));
const drawer = () => host.querySelector<HTMLElement>('.lb-root')!;
const heads = () => [...host.querySelectorAll('.lb-grp')].map((h) => h.textContent);
const row = (title: string) => [...host.querySelectorAll<HTMLElement>('.lb-row')].find((r) => r.querySelector('.lb-row-title')?.textContent === title);
const rows = () => [...host.querySelectorAll('.lb-row-title')].map((r) => r.textContent);
const bodies = () => [...host.querySelectorAll('.lb-body')].map((b) => b.textContent);
const tab = (t: 'now' | 'all') => host.querySelector<HTMLElement>(`.lb-tab[data-tab="${t}"]`)!;
const find = () => host.querySelector<HTMLInputElement>('.lb-find')!;
const press = (key: string, o: KeyboardEventInit = {}, on: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
  on.dispatchEvent(e);
  return e;
};
const message = (o: Partial<ChatMessage>): ChatMessage => ({ id: 'm', role: 'agent', text: 'x', toolLines: [], ts: 0, status: 'ok', ...o });

beforeEach(() => {
  document.body.innerHTML = '<div id="game"></div><textarea id="box"></textarea>';
  host = document.getElementById('game')!;
  box = document.getElementById('box') as HTMLTextAreaElement;
  box.focus();
  counts = [];
  opens = [];
  over = false;
  book = mount();
  book.load(PAGE);
});
afterEach(() => book.close());

describe('bookLines', () => {
  it('skips what the player wasn’t reading, newest first', () => {
    const lines = bookLines([
      message({ text: 'oldest' }),
      message({ text: 'ooc', mode: 'ooc' }),
      message({ text: 'gone', status: 'failed' }),
      message({ text: 'hidden', promised: true }),
      message({ text: '' }),
      message({ text: 'newest', role: 'user' }),
      message({ text: 'half a li', status: 'streaming' }),
    ]);
    expect(lines).toEqual([
      { text: 'newest', by: 'you' },
      { text: 'oldest', by: 'them' },
    ]);
  });

  it('reads the take on screen', () => {
    expect(bookLines([message({ text: 'second take', takes: { index: 1, count: 2 } })])).toEqual([{ text: 'second take', by: 'them' }]);
  });
});

describe('the lore drawer', () => {
  it('sets the count from update with the drawer shut', () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    expect(counts.at(-1)).toBe(1);
    expect(drawer().hidden).toBe(true);
  });

  it('leaves the cursor in the box on opening', async () => {
    book.open();
    await flush();
    expect(document.activeElement).toBe(box);
  });

  it('opens on RIGHT NOW with its three groups', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    expect(opens).toEqual([true]);
    expect(heads()).toEqual(['JUST SAID', "WHO'S TALKING", 'WHERE YOU ARE']);
    expect(rows()).toEqual(['Sentinel Defense Group', 'Hicks', 'Cass', 'The Tilt']);
  });

  it('shows no head for an empty group', async () => {
    book.update(ctx());
    book.open();
    await flush();
    expect(heads()).toEqual(["WHO'S TALKING", 'WHERE YOU ARE']);
  });

  it('shows the key that matched under a row', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    expect(row('Sentinel Defense Group')!.querySelector('.lb-row-sub')!.textContent).toBe('FACTIONS · "SDG"');
  });

  it('tags the files', async () => {
    book.update(ctx());
    book.open();
    await flush();
    expect(row('Hicks')!.querySelector('.lb-row-sub')!.textContent).toBe('YOUR FILE');
    expect(row('Cass')!.querySelector('.lb-row-sub')!.textContent).toBe('THEIR FILE');
  });

  it('opens one row at a time, in place', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    row('Sentinel Defense Group')!.click();
    expect(bodies()).toEqual(['Sentinel Defense Group body.']);
    expect(row('Sentinel Defense Group')!.nextElementSibling!.classList.contains('lb-body')).toBe(true);
    row('Hicks')!.click();
    expect(bodies().join(' ')).toContain('Netrunner.');
    expect(bodies().join(' ')).toContain('Finding the gap.');
    expect(bodies()).toHaveLength(1);
  });

  it('fetches the files again when someone comes or goes with the drawer open', async () => {
    book.close();
    let here = [YOU];
    const open = mount({ files: () => Promise.resolve(here) });
    open.load(PAGE);
    open.update(ctx({ present: ['Hicks'] }));
    open.open();
    await flush();
    here = [YOU, CASS];
    open.update(ctx({ present: ['Hicks', 'Cass'] }));
    await flush();
    expect(host.querySelectorAll('.lb-root')[1].textContent).toContain('Cass');
    open.close();
  });

  it('goes to the top of the list on a new tab, a new search and a new room', async () => {
    book.update(ctx());
    book.open();
    await flush();
    const list = host.querySelector<HTMLElement>('.lb-list')!;
    list.scrollTop = 50;
    tab('all').click();
    expect(list.scrollTop).toBe(0);
    list.scrollTop = 50;
    find().value = 'reach';
    find().dispatchEvent(new Event('input', { bubbles: true }));
    expect(list.scrollTop).toBe(0);
    list.scrollTop = 50;
    book.update(ctx({ sceneId: 'elsewhere' }));
    expect(list.scrollTop).toBe(0);
  });

  it('leaves the rows in place when an update changes nothing, so a click in progress isn’t lost', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    const before = row('Sentinel Defense Group');
    book.update(ctx({ lines: ['SDG came by', 'older'], draft: 'typing' }));
    expect(row('Sentinel Defense Group')).toBe(before);
  });

  it('keeps an open row open when the next update no longer matches it', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    row('Sentinel Defense Group')!.click();
    book.update(ctx({ lines: ['nothing'] }));
    expect(bodies()).toEqual(['Sentinel Defense Group body.']);
    expect(counts.at(-1)).toBe(0);
  });

  it('reopens on the tab and row it last showed', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    row('Sentinel Defense Group')!.click();
    book.close();
    book.open();
    await flush();
    expect(bodies()).toEqual(['Sentinel Defense Group body.']);
    tab('all').click();
    book.close();
    book.open();
    await flush();
    expect(tab('all').classList.contains('on')).toBe(true);
  });

  it('goes back to RIGHT NOW with nothing open when the room changes', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    row('Sentinel Defense Group')!.click();
    tab('all').click();
    book.update(ctx({ sceneId: 'elsewhere' }));
    expect(tab('now').classList.contains('on')).toBe(true);
    expect(bodies()).toEqual([]);
    expect(rows()).not.toContain('The Tilt');
  });

  it('leaves out WHERE YOU ARE for a room the book doesn’t know', async () => {
    book.update(ctx({ sceneId: 'unmapped' }));
    book.open();
    await flush();
    expect(heads()).toEqual(["WHO'S TALKING"]);
  });

  it('folds ALL under categories with nothing typed', async () => {
    book.update(ctx());
    book.open();
    await flush();
    tab('all').click();
    expect([...host.querySelectorAll('.lb-cat')].map((c) => c.textContent)).toEqual(['CITY 1', 'FACTIONS 1', 'PLACES 1']);
    expect(rows()).toEqual([]);
    host.querySelector<HTMLElement>('.lb-cat')!.click();
    expect(rows()).toEqual(['Iron Reach']);
  });

  describe('sections', () => {
    const cats = () => [...host.querySelectorAll('.lb-cat')].map((c) => c.textContent);
    const cat = (text: string) => [...host.querySelectorAll<HTMLElement>('.lb-cat')].find((c) => c.textContent === text)!;
    beforeEach(async () => {
      book.load({
        ...PAGE,
        entries: [
          entry({ id: 'reach', title: 'Iron Reach', category: 'City', section: 'Districts', keys: ['the Reach'] }),
          entry({ id: 'karasu', title: 'Karasu', category: 'City', section: 'Districts' }),
          entry({ id: 'sdg', title: 'Sentinel Defense Group', category: 'City', section: 'Corps', keys: ['SDG'] }),
          entry({ id: 'lost', title: 'A Stray', category: 'City' }),
          entry({ id: 'tilt', title: 'The Tilt', category: 'Places' }),
        ],
      });
      book.update(ctx());
      book.open();
      await flush();
      tab('all').click();
    });

    it('folds a category\'s sections inside it, its loose entries first', () => {
      expect(cats()).toEqual(['CITY 4', 'PLACES 1']);
      cat('CITY 4').click();
      expect(cats()).toEqual(['CITY 4', 'CORPS 1', 'DISTRICTS 2', 'PLACES 1']);
      expect(rows()).toEqual(['A Stray']);
      cat('DISTRICTS 2').click();
      expect(rows()).toEqual(['A Stray', 'Iron Reach', 'Karasu']);
    });

    it('keeps a section open through its category closing', () => {
      cat('CITY 4').click();
      cat('CORPS 1').click();
      cat('CITY 4').click();
      expect(rows()).toEqual([]);
      cat('CITY 4').click();
      expect(rows()).toEqual(['A Stray', 'Sentinel Defense Group']);
    });

    it('walks sections with Alt+arrows, as it does categories', () => {
      const down = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      down();
      down();
      expect(rows()).toEqual(['A Stray']);
      down();
      expect(cat('CORPS 1').getAttribute('aria-expanded')).toBe('true');
      expect(rows()).toEqual(['A Stray', 'Sentinel Defense Group']);
    });

    it('names the section under a search result, and nothing under a row in its fold', () => {
      cat('CITY 4').click();
      cat('DISTRICTS 2').click();
      expect(row('Iron Reach')!.querySelector('.lb-row-sub')).toBeNull();
      find().value = 'reach';
      find().dispatchEvent(new Event('input', { bubbles: true }));
      expect(row('Iron Reach')!.querySelector('.lb-row-sub')!.textContent).toBe('DISTRICTS');
    });
  });

  it('lists search results on ALL', async () => {
    book.update(ctx());
    book.open();
    await flush();
    tab('all').click();
    find().value = 'reach';
    find().dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()).toEqual(['Iron Reach']);
    expect(host.querySelectorAll('.lb-cat')).toHaveLength(0);
  });

  it('shows your secret on your file alone, under its own head', async () => {
    book.close();
    const secret = mount({ files: () => Promise.resolve([{ ...YOU, secret: 'You signed the file.' }, CASS]) });
    secret.load(PAGE);
    secret.update(ctx());
    secret.open();
    await flush();
    const panel = host.querySelectorAll<HTMLElement>('.lb-root')[1];
    const open = (title: string) => [...panel.querySelectorAll<HTMLElement>('.lb-row')].find((r) => r.querySelector('.lb-row-title')?.textContent === title)!.click();
    open('Hicks');
    expect(panel.querySelector('.lb-secret-head')!.textContent).toBe('ONLY YOU KNOW');
    expect(panel.querySelector('.lb-secret')!.textContent).toBe('You signed the file.');
    open('Cass');
    expect(panel.querySelector('.lb-secret')).toBeNull();
    secret.close();
  });

  it('keeps the files off ALL', async () => {
    book.update(ctx());
    book.open();
    await flush();
    tab('all').click();
    find().value = 'hicks';
    find().dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()).toEqual([]);
  });

  it('shows the count and the book’s size on the tabs', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    expect(tab('now').textContent).toBe('RIGHT NOW 1');
    expect(tab('all').textContent).toBe('ALL 3');
    book.update(ctx());
    expect(tab('now').textContent).toBe('RIGHT NOW');
  });

  it('lets go of search when the box can’t take the cursor, so the next Esc still closes', async () => {
    book.close();
    const noBox = mount({ chatBox: () => null });
    noBox.load(PAGE);
    noBox.update(ctx());
    noBox.open();
    await flush();
    const panel = host.querySelectorAll<HTMLElement>('.lb-root')[1];
    panel.querySelector<HTMLElement>('.lb-tab[data-tab="all"]')!.click();
    panel.querySelector<HTMLElement>('.lb-find')!.focus();
    press('Escape');
    expect(noBox.isOpen).toBe(true);
    press('Escape');
    expect(noBox.isOpen).toBe(false);
  });

  it('hands Esc in search to the box, then closes on the next', async () => {
    book.update(ctx());
    book.open();
    await flush();
    tab('all').click();
    find().focus();
    press('Escape');
    expect(document.activeElement).toBe(box);
    expect(book.isOpen).toBe(true);
    press('Escape');
    expect(book.isOpen).toBe(false);
  });

  describe('a click off', () => {
    const down = (n: Element) => n.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const add = (id: string) => document.body.appendChild(Object.assign(document.createElement('div'), { id }));
    afterEach(() => document.querySelectorAll('#feed, #input, #room').forEach((n) => n.remove()));

    it('closes it, and stops listening once it has', () => {
      const room = add('room');
      book.open();
      down(room);
      expect(book.isOpen).toBe(false);
      expect(opens).toEqual([true, false]);
      down(room);
      expect(opens).toEqual([true, false]);
    });
    it('leaves it up from inside, on her lines and on the box', () => {
      const line = add('feed').appendChild(document.createElement('p'));
      const field = add('input').appendChild(document.createElement('textarea'));
      book.open();
      for (const n of [drawer(), tab('all'), line, field]) down(n);
      expect(book.isOpen).toBe(true);
    });
    it('leaves it up while something is over it', () => {
      const room = add('room');
      book.open();
      over = true;
      down(room);
      expect(book.isOpen).toBe(true);
    });
  });

  it('leaves Esc alone while something is over it', async () => {
    book.open();
    await flush();
    over = true;
    expect(press('Escape').defaultPrevented).toBe(false);
    expect(book.isOpen).toBe(true);
  });

  it('takes Esc before a bubble listener hears it', async () => {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    book.open();
    await flush();
    press('Escape', {}, box);
    window.removeEventListener('keydown', heard);
    expect(heard).not.toHaveBeenCalled();
  });

  it('moves through rows on Alt+arrows, the cursor left in the box', async () => {
    book.update(ctx({ lines: ['SDG came by'] }));
    book.open();
    await flush();
    press('ArrowDown', { altKey: true });
    expect(bodies()).toEqual(['Sentinel Defense Group body.']);
    press('ArrowDown', { altKey: true });
    expect(bodies().join(' ')).toContain('Netrunner.');
    press('ArrowUp', { altKey: true });
    expect(bodies()).toEqual(['Sentinel Defense Group body.']);
    expect(document.activeElement).toBe(box);
  });

  it('keeps keys typed in search from the room', async () => {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    book.open();
    await flush();
    tab('all').click();
    find().focus();
    press('a', {}, find());
    window.removeEventListener('keydown', heard);
    expect(heard).not.toHaveBeenCalled();
  });

  it('says so when the book didn’t load, and still shows the files', async () => {
    book.load(null);
    book.update(ctx());
    book.open();
    await flush();
    expect(drawer().textContent).toContain('// BOOK UNAVAILABLE');
    expect(rows()).toEqual(['Hicks', 'Cass']);
  });

  it('survives the files failing', async () => {
    book.close();
    const other = mount({ files: () => Promise.reject(new Error('no')) });
    other.load(PAGE);
    other.update(ctx());
    other.open();
    await flush();
    expect(host.querySelectorAll('.lb-root')[1].textContent).toContain('The Tilt');
    other.close();
  });

  it('heads an open entry with its picture, only when it has one, and drops a picture that fails (lore art)', async () => {
    book.load({ entries: [entry({ id: 'soma', title: 'Soma', keys: ['Soma'], art: true }), entry({ id: 'titan', title: 'Titan', keys: ['Titan'] })], rooms: {} });
    book.update(ctx({ lines: ['Soma and Titan'] }));
    book.open();
    await flush();
    expect(host.querySelector('.lb-art')).toBeNull();
    row('Soma')!.click();
    const img = host.querySelector<HTMLImageElement>('.lb-body .lb-art')!;
    expect(img.getAttribute('src')).toBe('/api/lore/art/soma');
    expect(img.alt).toBe('');
    expect(bodies()).toEqual(['Soma body.']);
    // A near-square logo (a seal) gets more height once it loads; a wide one doesn't.
    const loaded = (w: number, h: number) => {
      Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
      img.dispatchEvent(new Event('load'));
      return img.classList.contains('lb-art-tall');
    };
    expect(loaded(324, 320)).toBe(true);
    expect(loaded(691, 200)).toBe(false);
    img.dispatchEvent(new Event('error'));
    expect(host.querySelector('.lb-art')).toBeNull();
    row('Titan')!.click();
    expect(host.querySelector('.lb-art')).toBeNull();
  });

  it('shows text as text', async () => {
    book.load({ entries: [entry({ id: 'x', title: '<b>x</b>', keys: ['xylo'], body: '<img src=x>' })], rooms: {} });
    book.update(ctx({ lines: ['xylo'] }));
    book.open();
    await flush();
    row('<b>x</b>')!.click();
    expect(bodies()).toEqual(['<img src=x>']);
    expect(host.querySelector('.lb-root img')).toBeNull();
  });
});
