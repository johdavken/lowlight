import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { actionSpans, Feed, portrait2x } from '../src/ui/feed';
import { mountInput } from '../src/ui/input';

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage {
  return { role: 'agent', text: '', toolLines: [], ts: 0, status: 'ok', ...over };
}

/** Every feed a test made: each listens on window, so old ones are disposed before paging tests. */
const allFeeds: Feed[] = [];

function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onRetry = vi.fn();
  const feed = new Feed(root, onRetry);
  allFeeds.push(feed);
  return { root, feed, onRetry };
}

const el = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
const textOf = (root: HTMLElement, id: string) => el(root, id).querySelector<HTMLElement>('.text')!;

describe('Feed', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it("the archive's hint brackets the key", () => {
    const { root } = setup();
    expect(root.querySelector('.feed-head-hint')!.textContent).toBe('[ESC] CLOSE');
  });

  it('renders message text as text, never as HTML, with a pre-wrap class', () => {
    const { root, feed } = setup();
    const raw = '<b>hi</b> & *x*\nline2';
    feed.upsert(msg({ id: 'n1', text: raw }));
    const text = textOf(root, 'n1');
    expect(text.innerHTML).toContain('&lt;b&gt;');
    expect(text.querySelector('b')).toBeNull();
    expect(text.textContent).toBe(raw);
    expect(text.classList.contains('text')).toBe(true);
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    expect(css).toMatch(/\.text\s*\{[^}]*white-space:\s*pre-wrap/);
  });

  it('delta appends to the matching message', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'n1', status: 'streaming' }));
    feed.upsert(msg({ id: 'n2', status: 'streaming' }));
    feed.delta('n1', 'Quiet');
    feed.delta('n1', "'s earned.");
    feed.delta('n2', 'other');
    expect(textOf(root, 'n1').textContent).toBe("Quiet's earned.");
    expect(textOf(root, 'n2').textContent).toBe('other');
  });

  it('upsert replaces a message in place by id', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'a' }));
    feed.upsert(msg({ id: 'n1', status: 'streaming' }));
    feed.delta('n1', 'partial');
    feed.upsert(msg({ id: 'n1', text: 'final text', status: 'ok' }));
    expect(root.querySelectorAll('[data-id="n1"]')).toHaveLength(1);
    expect(textOf(root, 'n1').textContent).toBe('final text');
    const ids = [...root.querySelectorAll<HTMLElement>('[data-id]')].map((e) => e.dataset.id);
    expect(ids).toEqual(['u1', 'n1']);
  });

  it('toolLine inserts a .tool row after the message text, or a standalone row for null', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'n1', text: 'There.' }));
    feed.toolLine('n1', '// SET_LIGHT · SIGN · 80%');
    const tool = el(root, 'n1').querySelector<HTMLElement>('.tool')!;
    expect(tool.textContent).toBe('// SET_LIGHT · SIGN · 80%');
    expect(textOf(root, 'n1').compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    feed.toolLine(null, '// SET_SCENE · ROOFTOP · FADE');
    const standalone = [...root.querySelectorAll<HTMLElement>('.tool')].find((t) => !t.closest('[data-id]'))!;
    expect(standalone.textContent).toBe('// SET_SCENE · ROOFTOP · FADE');
  });

  it('delta for an unknown id warns once with the id and renders nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { root, feed } = setup();
      feed.delta('ghost', 'boo');
      feed.delta('ghost', 'boo again');
      expect(root.querySelector('.text')).toBeNull();
      expect(root.textContent).not.toContain('boo');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0].join(' '))).toContain('ghost');
    } finally {
      warn.mockRestore();
    }
  });

  it('toolLine for an unknown non-null id warns once and does not render a stray row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { root, feed } = setup();
      feed.toolLine('ghost', '// SET_LIGHT · X');
      feed.toolLine('ghost', '// SET_LIGHT · Y');
      expect(root.querySelector('.tool')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0].join(' '))).toContain('ghost');
    } finally {
      warn.mockRestore();
    }
  });

  it('renders a message toolLines on upsert', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'n1', text: 'ok', toolLines: ['// A', '// B'] }));
    expect([...el(root, 'n1').querySelectorAll('.tool')].map((t) => t.textContent)).toEqual(['// A', '// B']);
  });

  it('collapsed: only the last 6 messages are visible; expand/collapse toggle the rest', () => {
    const { root, feed } = setup();
    const history = Array.from({ length: 9 }, (_, i) => msg({ id: `m${i}`, role: i % 2 ? 'agent' : 'user', text: `t${i}` }));
    feed.setHistory(history);
    const hidden = () => [...root.querySelectorAll<HTMLElement>('.hidden-collapsed')].map((e) => e.dataset.id);
    expect(hidden()).toEqual(['m0', 'm1', 'm2']);
    expect(feed.expanded).toBe(false);

    feed.expand();
    expect(hidden()).toEqual([]);
    expect(feed.expanded).toBe(true);
    expect(root.classList.contains('expanded')).toBe(true);

    feed.collapse();
    expect(hidden()).toEqual(['m0', 'm1', 'm2']);
    expect(root.classList.contains('expanded')).toBe(false);

    feed.upsert(msg({ id: 'm9', text: 't9' }));
    expect(hidden()).toEqual(['m0', 'm1', 'm2', 'm3']);
  });

  it('setHistory replaces existing content', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'old', text: 'x' }));
    feed.setHistory([msg({ id: 'a', text: 'a' })]);
    expect(root.querySelector('[data-id="old"]')).toBeNull();
    expect(root.querySelector('[data-id="a"]')).not.toBeNull();
  });

  it('wheel-up on the feed and PageUp expand; Escape collapses', () => {
    const { root, feed } = setup();
    feed.setHistory([msg({ id: 'a', text: 'a' })]);
    const list = root.querySelector<HTMLElement>('.feed')!;
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true }));
    expect(feed.expanded).toBe(false);
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true }));
    expect(feed.expanded).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(feed.expanded).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
    expect(feed.expanded).toBe(true);
  });

  it('a failed user message renders a retry button that calls onRetry(id)', () => {
    const { root, feed, onRetry } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hi', status: 'failed' }));
    const btn = el(root, 'u1').querySelector<HTMLButtonElement>('button.retry')!;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onRetry).toHaveBeenCalledWith('u1');

    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hi', status: 'ok' }));
    expect(el(root, 'u1').querySelector('button.retry')).toBeNull();
  });

  it('a lost nix message shows // SIGNAL LOST and retries its replyTo', () => {
    const { root, feed, onRetry } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hi' }));
    feed.upsert(msg({ id: 'n1', text: 'half a th', status: 'lost', replyTo: 'u1' }));
    const node = el(root, 'n1');
    expect(node.textContent).toContain('// SIGNAL LOST');
    node.querySelector<HTMLButtonElement>('button.retry')!.click();
    expect(onRetry).toHaveBeenCalledWith('u1');
  });

  describe('portrait avatar', () => {
    const avatar = (root: HTMLElement, id: string) => el(root, id).querySelector<HTMLElement>('.avatar');

    it('renders an avatar beside nix messages only — not user messages or standalone tool rows', () => {
      const { root, feed } = setup();
      feed.setHistory([msg({ id: 'u1', role: 'user', text: 'hi' }), msg({ id: 'n1', text: 'hey' })]);
      feed.toolLine(null, '// SET_SCENE · ROOFTOP · FADE');
      expect(avatar(root, 'n1')).not.toBeNull();
      expect(avatar(root, 'n1')!.getAttribute('aria-hidden')).toBe('true');
      expect(avatar(root, 'u1')).toBeNull();
      expect(root.querySelectorAll('.avatar')).toHaveLength(1);
      // Sits before the header, so it lines up with it.
      expect(el(root, 'n1').firstElementChild).toBe(avatar(root, 'n1'));
    });

    it('pulses while streaming, settles when ok, dims when lost', () => {
      const { root, feed } = setup();
      feed.upsert(msg({ id: 'n1', status: 'streaming' }));
      expect(avatar(root, 'n1')!.classList.contains('pulse')).toBe(true);
      expect(avatar(root, 'n1')!.classList.contains('dim')).toBe(false);

      feed.upsert(msg({ id: 'n1', text: 'done', status: 'ok' }));
      expect(avatar(root, 'n1')!.classList.contains('pulse')).toBe(false);
      expect(avatar(root, 'n1')!.classList.contains('dim')).toBe(false);

      feed.upsert(msg({ id: 'n2', text: 'half', status: 'lost', replyTo: 'u1' }));
      expect(avatar(root, 'n2')!.classList.contains('dim')).toBe(true);
      expect(avatar(root, 'n2')!.classList.contains('pulse')).toBe(false);
    });

    it('shows no portrait until the server sends one (no old Nix flash), then follows the latest url (2x derived)', () => {
      const { root, feed } = setup();
      feed.upsert(msg({ id: 'n1', text: 'a' }));
      const vars = () => [root.style.getPropertyValue('--portrait'), root.style.getPropertyValue('--portrait-2x')];
      expect(vars()).toEqual(['', '']);
      expect(root.classList.contains('portrait-pending')).toBe(true);

      feed.setPortrait('/portraits/alt.png');
      expect(vars()).toEqual(['url("/portraits/alt.png")', 'url("/portraits/alt@2x.png")']);
      expect(root.classList.contains('portrait-pending')).toBe(false);
      // Avatars read the url from the feed root, so existing and new ones both follow it.
      feed.upsert(msg({ id: 'n2', text: 'b' }));
      for (const a of root.querySelectorAll<HTMLElement>('.avatar')) expect(a.style.getPropertyValue('--portrait')).toBe('');
      const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
      expect(css).toMatch(/mask-image:\s*var\(--portrait\)/);
    });

    it('a face is her sprite crop as a picture: no 2x, no mask (face avatars)', () => {
      const { root, feed } = setup();
      feed.setPortrait('/api/agents/hicks/thumb', 'face', 'Hicks');
      expect(root.style.getPropertyValue('--portrait')).toBe('url("/api/agents/hicks/thumb")');
      expect(root.style.getPropertyValue('--portrait-2x')).toBe('url("/api/agents/hicks/thumb")');
      expect(root.classList.contains('portrait-face')).toBe(true);
      feed.setPortrait('/portraits/alt.png');
      expect(root.classList.contains('portrait-face')).toBe(false);
      const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
      expect(css).toMatch(/\.portrait-face \.avatar-art\s*\{[^}]*mask-image:\s*none/);
    });

    it('derives the 2x url before the extension', () => {
      expect(portrait2x('/portraits/nix.png')).toBe('/portraits/nix@2x.png');
      expect(portrait2x('/p/v1.2/nix.webp?v=3')).toBe('/p/v1.2/nix@2x.webp?v=3');
      expect(portrait2x('/portraits/nix')).toBe('/portraits/nix@2x');
    });
  });
});

describe('Feed out-of-character tags', () => {
  it('OOC messages (user and nix) get an ooc class and an OOC tag in the header; roleplay ones do not', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'app question', mode: 'ooc' }));
    feed.upsert(msg({ id: 'n1', role: 'agent', text: 'plain answer', mode: 'ooc', replyTo: 'u1' }));
    feed.upsert(msg({ id: 'u2', role: 'user', text: 'back in the room' }));
    for (const id of ['u1', 'n1']) {
      expect(el(root, id).classList.contains('ooc')).toBe(true);
      expect(el(root, id).querySelector('.meta .ooc-tag')?.textContent).toBe('OOC');
    }
    expect(el(root, 'u2').classList.contains('ooc')).toBe(false);
    expect(el(root, 'u2').querySelector('.ooc-tag')).toBeNull();
  });
});

describe('Feed end-scene tags', () => {
  it('your end line has an END SCENE tag and the end class; her reply to it has no tag and keeps RP markup', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'one last word', mode: 'end' }));
    feed.upsert(msg({ id: 'n1', role: 'agent', text: 'she steps back *into the dark*', mode: 'end', replyTo: 'u1' }));

    expect(el(root, 'u1').classList.contains('end')).toBe(true);
    expect(el(root, 'u1').querySelector('.meta .end-tag')?.textContent).toBe('END SCENE');

    expect(el(root, 'n1').querySelector('.end-tag')).toBeNull();
    expect(textOf(root, 'n1').querySelector('.act')).not.toBeNull();
  });
});

describe('Feed leave tag and messages()', () => {
  it('a LEAVE line has the end class and a LEAVE tag', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'bye', mode: 'end', leave: true }));
    expect(el(root, 'u1').classList.contains('end')).toBe(true);
    expect(el(root, 'u1').querySelector('.meta .end-tag')?.textContent).toBe('LEAVE');
  });

  it('messages() is the feed in order', () => {
    const { feed } = setup();
    feed.setHistory([msg({ id: 'a', text: 'a' }), msg({ id: 'b', text: 'b' })]);
    feed.upsert(msg({ id: 'c', text: 'c' }));
    feed.remove(['a']);
    expect(feed.messages().map((m) => m.id)).toEqual(['b', 'c']);
  });
});

describe('Feed messages() order (final review 4)', () => {
  it('is time order, even for a line brought back (undo) after newer ones', () => {
    const { feed } = setup();
    feed.setHistory([msg({ id: 'a', text: 'a', ts: 1 }), msg({ id: 'c', text: 'c', ts: 3 })]);
    feed.upsert(msg({ id: 'b', text: 'b', ts: 2 }));
    expect(feed.messages().map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('Feed paging (long replies in the collapsed feed)', () => {
  /** Fake layout: every reply's text is `content` px tall, the feed has `available` px for it (450 − 40 button → 400px pages), 25px lines. */
  function paged(content: Record<string, number>, available = 450) {
    for (const f of allFeeds.splice(0)) f.dispose();
    // Earlier tests' feeds still listen on window; jsdom has no scrollBy for their PageDown handling.
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    const ta = document.createElement('textarea');
    document.body.append(root, ta);
    const feed = new Feed(root, vi.fn(), (id) => ({ content: content[id] ?? 50, available, lineHeight: 25 }));
    allFeeds.push(feed);
    return { root, feed, ta };
  }
  const btn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.continue');
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  it('shows the first page of a long reply with [CONTINUE ▸ 1/3], hiding older entries', () => {
    const { root, feed } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'hi' }), msg({ id: 'long', text: 'x' })]);
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    expect(root.classList.contains('paging')).toBe(true);
    expect(textOf(root, 'long').style.maxHeight).toBe('400px');
    expect(textOf(root, 'long').dataset.page).toBe('0');
    expect(el(root, 'u1').classList.contains('hidden-collapsed')).toBe(true);
  });

  it('a click turns the page; past the last page the reply shows normally again', () => {
    const { root, feed } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'hi' }), msg({ id: 'long', text: 'x' })]);
    btn(root)!.click();
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    expect(textOf(root, 'long').dataset.page).toBe('1');
    btn(root)!.click();
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/3]');
    btn(root)!.click();
    expect(btn(root)).toBeNull();
    expect(root.classList.contains('paging')).toBe(false);
    expect(textOf(root, 'long').style.maxHeight).toBe('');
    expect(el(root, 'u1').classList.contains('hidden-collapsed')).toBe(false);
  });

  it('Enter, Space or PageDown turn the page while the prompt is empty; typing is left alone', () => {
    const { root, feed, ta } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'long', text: 'x' })]);
    ta.focus();
    key('Enter');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    key(' ');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/3]');
    ta.value = 'typing';
    key(' ');
    key('Enter');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/3]');
    ta.value = '';
    key('PageDown');
    expect(btn(root)).toBeNull();
  });

  it('Enter in the real (empty) prompt turns the page, though the prompt swallows it to keep out a newline', () => {
    const { root, feed } = paged({ long: 1000 });
    const send = vi.fn();
    mountInput(document.body, send);
    const prompt = document.querySelector<HTMLTextAreaElement>('.input textarea')!;
    feed.setHistory([msg({ id: 'long', text: 'x' })]);
    prompt.focus();
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    expect(send).not.toHaveBeenCalled();
  });

  it('a key another handler already consumed does not turn the page (final review 2)', () => {
    const { root, feed } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'long', text: 'x' })]);
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
  });

  it('a short reply has no button', () => {
    const { root, feed } = paged({ short: 300 });
    feed.setHistory([msg({ id: 'short', text: 'x' })]);
    expect(btn(root)).toBeNull();
    expect(root.classList.contains('paging')).toBe(false);
  });

  it('while she is still streaming, the last page waits (pulsing) instead of releasing, and grows as text arrives', () => {
    const content: Record<string, number> = { s: 700 };
    const { root, feed } = paged(content);
    feed.upsert(msg({ id: 's', text: 'x', status: 'streaming' }));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/2]');
    expect(btn(root)!.classList.contains('more')).toBe(true);
    btn(root)!.click();
    btn(root)!.click(); // on the last page, still streaming: stays
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/2]');
    content.s = 1000;
    feed.delta('s', ' more');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    feed.upsert(msg({ id: 's', text: 'x more', status: 'ok' }));
    expect(btn(root)!.classList.contains('more')).toBe(false);
    expect(textOf(root, 's').dataset.page).toBe('1');
  });

  it('a new message ends paging; the finished reply is not paged again', () => {
    const { root, feed } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'long', text: 'x' })]);
    feed.upsert(msg({ id: 'u2', role: 'user', text: 'next' }));
    expect(btn(root)).toBeNull();
    expect(root.classList.contains('paging')).toBe(false);
  });

  it('the expanded history is never paged', () => {
    const { root, feed } = paged({ long: 1000 });
    feed.setHistory([msg({ id: 'long', text: 'x' })]);
    feed.expand();
    expect(btn(root)).toBeNull();
    expect(textOf(root, 'long').style.maxHeight).toBe('');
    feed.collapse();
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
  });

  it('keep going resumes on the page where the old text ended, not page 1', () => {
    const content: Record<string, number> = { long: 1000 };
    const { root, feed } = paged(content);
    feed.setHistory([msg({ id: 'long', text: 'old' })]);
    btn(root)!.click(); btn(root)!.click(); btn(root)!.click(); // read to the end: unpaged
    expect(btn(root)).toBeNull();
    feed.upsert(msg({ id: 'long', text: 'old', status: 'streaming' })); // keep going reopens it
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/3]');
    expect(textOf(root, 'long').dataset.page).toBe('2');
    content.long = 1300;
    feed.delta('long', ' more');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/4]');
  });

  it('a new take (reopened empty, or text that is not a prefix) pages from page 1 (Review Focus 3)', () => {
    const content: Record<string, number> = { long: 1000 };
    const { root, feed } = paged(content);
    feed.setHistory([msg({ id: 'long', text: 'old' })]);
    btn(root)!.click(); btn(root)!.click(); btn(root)!.click();
    feed.upsert(msg({ id: 'long', text: 'different', status: 'streaming' }));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
  });
});

describe('Feed RP markup', () => {
  const kinds = (root: HTMLElement, id: string, cls: string) =>
    [...textOf(root, id).querySelectorAll(`.${cls}`)].map((n) => n.textContent).join('|');

  it('styles *actions* in roleplay replies (quotes are plain text), keeping the exact text', () => {
    const { root, feed } = setup();
    const raw = '*nods slowly* "Yes." She waits.';
    feed.setHistory([msg({ id: 'n1', text: raw })]);
    expect(kinds(root, 'n1', 'act')).toBe('nods slowly');
    expect(textOf(root, 'n1').querySelector('.say')).toBeNull();
    expect(textOf(root, 'n1').textContent).toBe(raw);
  });

  it('styles your roleplay messages too', () => {
    const { root, feed } = setup();
    feed.setHistory([msg({ id: 'u1', role: 'user', text: '*hands her the cup*' })]);
    expect(kinds(root, 'u1', 'act')).toBe('hands her the cup');
  });

  it('leaves out-of-character messages alone (asterisks there are just emphasis)', () => {
    const { root, feed } = setup();
    feed.setHistory([msg({ id: 'o1', text: 'that is *really* odd', mode: 'ooc' })]);
    expect(textOf(root, 'o1').querySelector('.act')).toBeNull();
    expect(textOf(root, 'o1').textContent).toBe('that is *really* odd');
  });

  it('an action split across streamed deltas stays an action', () => {
    const { root, feed } = setup();
    feed.upsert(msg({ id: 's1', text: '', status: 'streaming' }));
    feed.delta('s1', '*lea');
    feed.delta('s1', 'ns in* ok');
    expect(kinds(root, 's1', 'act')).toBe('lea|ns in');
    expect(textOf(root, 's1').textContent).toBe('*leans in* ok');
  });
});

describe('Feed stage mode (the dialogue box)', () => {
  function stageFeed(content: Record<string, number> = {}, available = 450) {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    const ta = document.createElement('textarea');
    document.body.append(root, ta);
    const onRetry = vi.fn();
    const feed = new Feed(root, onRetry, (id) => ({ content: content[id] ?? 50, available, lineHeight: 25 }), { stage: true });
    allFeeds.push(feed);
    const current: Array<{ role: string; status: string } | null> = [];
    feed.onCurrent((c) => current.push(c && { role: c.role, status: c.status }));
    return { root, feed, onRetry, current };
  }
  const shown = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.feed > *')].filter((n) => !n.classList.contains('hidden-collapsed'));

  it('subtitles: a scrim instead of the box frame, and one line stack beside the feed', () => {
    const { root } = stageFeed();
    expect(root.querySelector('.sub-scrim')).not.toBeNull();
    expect(root.querySelector('.box-frame')).toBeNull();
    expect(root.querySelectorAll('.line-keys')).toHaveLength(1);
    expect(root.querySelector('.feed .line-keys')).toBeNull();
  });

  it('shows only the newest message, on the speaker side', () => {
    const { root, feed } = stageFeed();
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'a' }), msg({ id: 'a1', text: 'b' }), msg({ id: 'u2', role: 'user', text: 'c' })]);
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['u2']);
    expect(root.classList.contains('speaker-user')).toBe(true);
    feed.upsert(msg({ id: 'a2', text: 'reply' }));
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['a2']);
    expect(root.classList.contains('speaker-agent')).toBe(true);
    expect(root.classList.contains('speaker-user')).toBe(false);
  });

  it('standalone tool lines after the current message show beneath it', () => {
    const { root, feed } = stageFeed();
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'a' }), msg({ id: 'a1', text: 'b' })]);
    feed.toolLine(null, '// SET_LIGHT · LAMP · 50%');
    expect(shown(root).map((n) => n.dataset.id ?? n.textContent)).toEqual(['a1', '// SET_LIGHT · LAMP · 50%']);
  });

  it("the player's line stays current until her first text, then hers (Review Focus 1)", () => {
    const { root, feed, current } = stageFeed();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hello', status: 'ok' }));
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['u1']);
    feed.delta('a1', 'Hi');
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['a1']);
    feed.upsert(msg({ id: 'a1', text: 'Hi there', status: 'ok' }));
    expect(current).toEqual([
      { role: 'user', status: 'ok' },
      { role: 'agent', status: 'streaming' },
      { role: 'agent', status: 'ok' },
    ]);
  });

  describe('the box grows to fit, then pages', () => {
    // At rest the box gives the text 200px; stretched to its cap (--box-max), 300px.
    function fitFeed(content: Record<string, number>) {
      for (const f of allFeeds.splice(0)) f.dispose();
      document.body.innerHTML = '';
      const root = document.createElement('div');
      document.body.append(root);
      const feed = new Feed(root, vi.fn(), (id) => ({ content: content[id] ?? 50, available: 300, base: 200, lineHeight: 25 }), { stage: true });
      allFeeds.push(feed);
      return { root, feed };
    }
    const fit = (root: HTMLElement) => root.style.getPropertyValue('--box-fit');

    it('TEXT SIZE keeps the reader on the text they were reading, not on the same page number', () => {
      const c = { a1: 1000 };
      const { root, feed } = fitFeed(c);
      feed.setHistory([msg({ id: 'a1', text: 'long' })]);
      const pages = () => root.querySelector('button.continue')!.textContent!.match(/(\d+)\/(\d+)/)!.slice(1).map(Number);
      feed.advance();
      feed.advance();
      const [at, of] = pages();
      expect(at).toBe(3);
      c.a1 = 2500; // the same reply, set much larger
      feed.relayout();
      const [now, ofNow] = pages();
      expect(now).not.toBe(at); // where keeping the page number would leave you
      expect(ofNow).toBeGreaterThan(of);
      // The old page began (at − 1) / of of the way in: the new page is the one holding that point.
      expect(now).toBe(Math.floor(((at - 1) / of) * ofNow) + 1);
      expect(textOf(root, 'a1').dataset.page).toBe(String(now - 1));
    });

    it('in the box a long reply stays on its last page once read: it never shows unpaged under the footer', () => {
      const { root, feed } = fitFeed({ a1: 1000 });
      feed.setHistory([msg({ id: 'a1', text: 'long' })]);
      for (let i = 0; i < 6; i++) feed.advance();
      const text = textOf(root, 'a1');
      expect(text.classList.contains('paged')).toBe(true);
      expect(text.style.maxHeight).not.toBe('');
      expect(text.dataset.page).toBe('3');
      expect(root.querySelector('button.continue')).toBeNull();
      const e = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });

    it('a reply that fits at rest leaves the box at rest', () => {
      const { root, feed } = fitFeed({ a1: 150 });
      feed.setHistory([msg({ id: 'a1', text: 'short' })]);
      expect(fit(root)).toBe('');
      expect(root.querySelector('button.continue')).toBeNull();
    });

    it('a reply that only fits stretched grows the box by just what it needs, and does not page', () => {
      const { root, feed } = fitFeed({ a1: 260 });
      feed.setHistory([msg({ id: 'a1', text: 'seven lines' })]);
      expect(fit(root)).toBe('calc(var(--box-h) + 60px)');
      expect(root.querySelector('button.continue')).toBeNull();
    });

    it('the grown box is on :root too, for what stands on it outside the feed (the dice tray); back at rest it goes', () => {
      const { feed } = fitFeed({ a1: 260, u2: 50 });
      feed.setHistory([msg({ id: 'a1', text: 'seven lines' })]);
      expect(fit(document.documentElement)).toBe('calc(var(--box-h) + 60px)');
      feed.upsert(msg({ id: 'u2', role: 'user', text: 'ok' }));
      expect(fit(document.documentElement)).toBe('');
    });

    it('a reply too long even stretched pages in the box at its cap', () => {
      const { root, feed } = fitFeed({ a1: 1000 });
      feed.setHistory([msg({ id: 'a1', text: 'long' })]);
      expect(fit(root)).toBe('var(--box-max)');
      expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/4]');
    });

    it('[CONTINUE] sits in the footer row, so a page gets all the text room the box has', () => {
      const { root, feed } = fitFeed({ a1: 1000 });
      feed.setHistory([msg({ id: 'a1', text: 'long' })]);
      expect(textOf(root, 'a1').style.maxHeight).toBe('300px');
      expect(root.querySelector('.foot > button.continue')).not.toBeNull();
    });

    it('the next short line puts the box back at rest', () => {
      const { root, feed } = fitFeed({ a1: 260, u2: 50 });
      feed.setHistory([msg({ id: 'a1', text: 'seven lines' })]);
      feed.upsert(msg({ id: 'u2', role: 'user', text: 'ok' }));
      expect(fit(root)).toBe('');
    });
  });

  it('a greet line is never shown; her greeting is, with no mode tag', () => {
    const { root, feed } = stageFeed();
    feed.setHistory([msg({ id: 'g1', role: 'user', text: '', mode: 'greet' }), msg({ id: 'a1', text: '*looks up*', mode: 'greet', replyTo: 'g1' })]);
    expect(root.querySelector('[data-id="g1"]')).toBeNull();
    expect(root.querySelector('.feed-head-count')!.textContent).toBe('1 ENTRIES');
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['a1']);
    expect(el(root, 'a1').querySelector('.end-tag, .ooc-tag')).toBeNull();
    expect(el(root, 'a1').classList.contains('greet')).toBe(true);
    feed.upsert(msg({ id: 'g2', role: 'user', text: '', mode: 'greet' }));
    expect(root.querySelector('[data-id="g2"]')).toBeNull();
  });

  it('while her greeting is still empty, it is current (her, thinking), not the last visit’s line', () => {
    const { root, feed, current } = stageFeed();
    feed.setHistory([msg({ id: 'u0', role: 'user', text: 'goodnight' }), msg({ id: 'a0', text: 'night' })]);
    feed.upsert(msg({ id: 'g1', role: 'user', text: '', mode: 'greet' }));
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming', mode: 'greet', replyTo: 'g1' }));
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['a1']);
    expect(root.classList.contains('speaker-agent')).toBe(true);
    expect(textOf(root, 'a1').getAttribute('aria-busy')).toBe('true');
    expect(current.at(-1)).toEqual({ role: 'agent', status: 'streaming' });
  });

  it('a failed turn keeps the player’s line up with NOT DELIVERED and RETRY; a lost reply shows SIGNAL LOST (Review Focus 1)', () => {
    const { root, feed, onRetry } = stageFeed();
    feed.setHistory([msg({ id: 'a0', text: 'earlier' }), msg({ id: 'u1', role: 'user', text: 'hello', status: 'failed' })]);
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['u1']);
    expect(el(root, 'u1').querySelector('.status-label')!.textContent).toBe('// NOT DELIVERED');
    (el(root, 'u1').querySelector('.retry') as HTMLElement).click();
    expect(onRetry).toHaveBeenCalledWith('u1');
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'hello' }), msg({ id: 'a1', text: 'half', status: 'lost', replyTo: 'u1' })]);
    expect(el(root, 'a1').querySelector('.status-label')!.textContent).toBe('// SIGNAL LOST');
  });

  it('pages a long reply measured against the box, even with a tool line after it; a reply that fits never pages (Review Focus 2)', () => {
    const { root, feed } = stageFeed({ long: 1000, short: 300 });
    feed.setHistory([msg({ id: 'short', text: 'x' })]);
    expect(root.querySelector('button.continue')).toBeNull();
    feed.upsert(msg({ id: 'long', text: 'y' }));
    feed.toolLine(null, '// SET_SCENE · ROOFTOP · FADE');
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/3]');
    expect(shown(root).map((n) => n.dataset.id ?? n.textContent)).toEqual(['long', '// SET_SCENE · ROOFTOP · FADE']);
  });

  it("reports her line's expression; the player's line has none", () => {
    const { feed } = stageFeed();
    const seen: Array<string | undefined> = [];
    feed.onCurrent((c) => seen.push(c?.expression));
    feed.upsert(msg({ id: 'a1', text: 'hey', expression: 'happy' }));
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'yo' }));
    expect(seen).toEqual(['happy', undefined]);
  });

  it('a new expression on the streaming reply alone re-reports the line (Review Focus 5)', () => {
    const { feed } = stageFeed();
    const seen: Array<string | undefined> = [];
    feed.onCurrent((c) => seen.push(c?.expression));
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hello' }));
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
    feed.delta('a1', 'Oh');
    feed.upsert(msg({ id: 'a1', text: 'Oh', status: 'streaming', expression: 'happy' }));
    expect(seen).toEqual([undefined, undefined, 'happy']);
  });

  it("an update to the streaming reply keeps the text she's streamed so far (the server's copy lags)", () => {
    const { root, feed } = stageFeed();
    const seen: Array<string | undefined> = [];
    feed.onCurrent((c) => seen.push(c?.expression));
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'hello' }));
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
    feed.delta('a1', 'Oh, ');
    feed.delta('a1', 'hey');
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming', expression: 'happy' }));
    expect(textOf(root, 'a1').textContent).toBe('Oh, hey');
    expect(feed.get('a1')?.text).toBe('Oh, hey');
    expect(seen[seen.length - 1]).toBe('happy');
    feed.delta('a1', ' you');
    expect(textOf(root, 'a1').textContent).toBe('Oh, hey you');
  });

  it('keep going reopening a finished reply still takes the server text (ok → streaming replaces)', () => {
    const { root, feed } = stageFeed();
    feed.upsert(msg({ id: 'a1', text: 'old local', status: 'ok' }));
    feed.upsert(msg({ id: 'a1', text: 'pre-turn', status: 'streaming' }));
    expect(textOf(root, 'a1').textContent).toBe('pre-turn');
    feed.delta('a1', ' more');
    expect(textOf(root, 'a1').textContent).toBe('pre-turn more');
  });

  it('the archive still shows everything', () => {
    const { root, feed } = stageFeed();
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'a' }), msg({ id: 'a1', text: 'b' }), msg({ id: 'u2', role: 'user', text: 'c' })]);
    feed.expand();
    expect(shown(root).map((n) => n.dataset.id)).toEqual(['u1', 'a1', 'u2']);
  });
});

describe('Feed user name', () => {
  it("setUserName labels the player's lines, including ones already shown", () => {
    const { root, feed } = setup();
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'a' })]);
    feed.setUserName('Hicks');
    feed.upsert(msg({ id: 'u2', role: 'user', text: 'b' }));
    expect([...root.querySelectorAll('.msg.user .name')].map((n) => n.textContent)).toEqual(['HICKS', 'HICKS']);
  });
});

describe('Feed typing', () => {
  const TICK = 1000 / 60;
  const PAGE_ENDS = [40, 80];
  /** Fake layout as in the paging tests (pages of 400px), and a fake page end: page 0 ends at 40, page 1 at 80. */
  function typingFeed(content: Record<string, number> = {}, opts: { reducedMotion?: boolean } = {}) {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const sizes = { ...content };
    const measure = (id: string) => ({ content: sizes[id] ?? 50, available: 450, lineHeight: 25 });
    const pageEnd = (_id: string, page: number) => PAGE_ENDS[page] ?? Infinity;
    const feed = new Feed(root, vi.fn(), measure, { pageEnd, ...opts });
    allFeeds.push(feed);
    return { root, feed, sizes };
  }
  /** The text a reader can see: everything outside `.unshown`. */
  const typed = (root: HTMLElement, id: string) => {
    const copy = textOf(root, id).cloneNode(true) as HTMLElement;
    for (const n of copy.querySelectorAll('.unshown')) n.remove();
    return copy.textContent;
  };
  const cursor = (root: HTMLElement, id: string) => textOf(root, id).querySelector('.type-cursor');
  const btn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.continue');
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const LONG = 'abcdefghij'.repeat(12); // 120 chars, no pauses

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a new reply types at 60 chars a second, with the cursor at the frontier', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hello there.', status: 'streaming' }));
    expect(typed(root, 'a1')).toBe('');
    expect(cursor(root, 'a1')).not.toBeNull();
    vi.advanceTimersByTime(TICK * 5);
    expect(typed(root, 'a1')).toBe('Hello');
    expect(cursor(root, 'a1')).not.toBeNull();
    expect(textOf(root, 'a1').textContent).toBe('Hello there.'); // the rest is laid out, just hidden
    expect(vi.getTimerCount()).toBe(1);
  });

  it('the text speed scales the pace; instant shows the reply as it comes, and finishes one typing', () => {
    const { root, feed } = typingFeed();
    feed.setTextSpeed(0.5);
    feed.upsert(msg({ id: 'a1', text: 'Hello there.', status: 'streaming' }));
    vi.advanceTimersByTime((TICK / 2) * 5);
    expect(typed(root, 'a1')).toBe('Hello');
    feed.setTextSpeed(0);
    expect(typed(root, 'a1')).toBe('Hello there.');
    expect(vi.getTimerCount()).toBe(0);
    feed.upsert(msg({ id: 'a2', text: 'Next.', status: 'streaming' }));
    expect(typed(root, 'a2')).toBe('Next.');
  });

  it('pauses after a sentence end', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hi. Yo', status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 3);
    expect(typed(root, 'a1')).toBe('Hi.');
    vi.advanceTimersByTime(TICK + 180 - 5);
    expect(typed(root, 'a1')).toBe('Hi.');
    vi.advanceTimersByTime(10);
    expect(typed(root, 'a1')).toBe('Hi. ');
  });

  it('waits at the frontier when typing catches up with the stream, and resumes on a delta', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
    feed.delta('a1', 'Hi');
    vi.runAllTimers();
    expect(typed(root, 'a1')).toBe('Hi');
    expect(cursor(root, 'a1')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    feed.delta('a1', ' you');
    expect(typed(root, 'a1')).toBe('Hi');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TICK * 4);
    expect(typed(root, 'a1')).toBe('Hi you');
    expect(cursor(root, 'a1')).not.toBeNull();
  });

  it('finishes and drops the cursor once the reply is ok and fully typed', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hi', status: 'streaming' }));
    vi.runAllTimers();
    feed.upsert(msg({ id: 'a1', text: 'Hi there', status: 'ok' }));
    expect(typed(root, 'a1')).toBe('Hi'); // still typing the rest
    expect(cursor(root, 'a1')).not.toBeNull();
    vi.runAllTimers();
    expect(typed(root, 'a1')).toBe('Hi there');
    expect(cursor(root, 'a1')).toBeNull();
    expect(root.querySelector('.unshown')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('history, the expanded archive, your own lines and reduced motion show text at once', () => {
    const { root, feed } = typingFeed();
    feed.setHistory([msg({ id: 'h1', text: 'From before.', status: 'streaming' })]);
    expect(typed(root, 'h1')).toBe('From before.');
    expect(cursor(root, 'h1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    feed.upsert(msg({ id: 'a1', text: 'Typing now', status: 'streaming', ts: 1 }));
    vi.advanceTimersByTime(TICK * 2);
    expect(typed(root, 'a1')).toBe('Ty');
    feed.expand();
    expect(typed(root, 'a1')).toBe('Typing now');
    expect(cursor(root, 'a1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    feed.delta('a1', ' still');
    expect(typed(root, 'a1')).toBe('Typing now still');
    feed.upsert(msg({ id: 'a3', text: 'Arrives in the archive', status: 'streaming', ts: 1 }));
    expect(typed(root, 'a3')).toBe('Arrives in the archive');
    expect(cursor(root, 'a3')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    feed.collapse();

    feed.upsert(msg({ id: 'u1', role: 'user', text: 'My line.', ts: 2 }));
    expect(typed(root, 'u1')).toBe('My line.');
    expect(cursor(root, 'u1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const calm = typingFeed({}, { reducedMotion: true });
    calm.feed.upsert(msg({ id: 'a2', text: '', status: 'streaming' }));
    calm.feed.delta('a2', 'All at once.');
    expect(typed(calm.root, 'a2')).toBe('All at once.');
    expect(cursor(calm.root, 'a2')).toBeNull();
    expect(calm.root.querySelector('.rv')).toBeNull(); // her deltas no longer play the per-delta reveal
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Enter while a page types finishes that page only; the next Enter turns it, and typing resumes', () => {
    const { root, feed } = typingFeed({ a1: 1000 });
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    vi.advanceTimersByTime(TICK);
    expect(typed(root, 'a1')).toBe('a');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    key('Enter');
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40));
    expect(cursor(root, 'a1')).not.toBeNull(); // waits at the end of the page
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TICK * 10);
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40)); // stays at the page end
    key('Enter');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TICK * 3);
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 43));
    key('PageDown');
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 80));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
  });

  it('a click on [CONTINUE] while typing finishes the page instead of turning', () => {
    const { root, feed } = typingFeed({ a1: 1000 });
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 2);
    btn(root)!.click();
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    expect(vi.getTimerCount()).toBe(0);
    btn(root)!.click();
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    expect(vi.getTimerCount()).toBe(1);
  });

  it("a click on the reply's text while typing finishes the page", () => {
    const { root, feed } = typingFeed({ a1: 1000 });
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 2);
    textOf(root, 'a1').click();
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    textOf(root, 'a1').click(); // a finished page: a click on the text does nothing, as before
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
  });

  it('Enter while a short (unpaged) reply types finishes it', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hello there.', status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 2);
    expect(btn(root)).toBeNull();
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(typed(root, 'a1')).toBe('Hello there.');
    expect(cursor(root, 'a1')).not.toBeNull(); // still streaming: waits for more
    expect(vi.getTimerCount()).toBe(0);
    const again = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false); // nothing left to skip: Enter is left alone, as before
  });

  it('keep going types only the new text', () => {
    const { root, feed } = typingFeed();
    feed.setHistory([msg({ id: 'a1', text: 'Hello.' })]);
    feed.upsert(msg({ id: 'a1', text: 'Hello.', status: 'streaming' }));
    expect(typed(root, 'a1')).toBe('Hello.');
    expect(cursor(root, 'a1')).not.toBeNull();
    feed.delta('a1', ' Again');
    expect(typed(root, 'a1')).toBe('Hello.');
    vi.advanceTimersByTime(TICK + 180 + 1); // the pause after 'Hello.', then ' '
    expect(typed(root, 'a1')).toBe('Hello. ');
    vi.runAllTimers();
    expect(typed(root, 'a1')).toBe('Hello. Again');
  });

  it('a reopen for a new take types from the start', () => {
    const { root, feed } = typingFeed();
    feed.setHistory([msg({ id: 'a1', text: 'Old take.' })]);
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
    feed.delta('a1', 'New');
    expect(typed(root, 'a1')).toBe('');
    vi.advanceTimersByTime(TICK * 3);
    expect(typed(root, 'a1')).toBe('New');
  });

  it('a swipe to another take while typing shows it at once and stops typing (Review Focus 2)', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'first take', status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 3);
    expect(typed(root, 'a1')).toBe('fir');
    feed.upsert(msg({ id: 'a1', text: 'other take', status: 'ok' }));
    expect(typed(root, 'a1')).toBe('other take');
    expect(cursor(root, 'a1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an update of the typing reply (her expression) keeps typing where it was', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hello there.', status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 3);
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming', expression: 'happy' }));
    expect(typed(root, 'a1')).toBe('Hel');
    expect(cursor(root, 'a1')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a resize mid-typing keeps the frontier on the same character (Review Focus 5)', () => {
    const { root, feed, sizes } = typingFeed({ a1: 1000 });
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 7);
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 7));
    sizes.a1 = 1400;
    window.dispatchEvent(new Event('resize'));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/4]');
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 7));
    expect(cursor(root, 'a1')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("measures the page end against the page height the box was given, though the layout reads differently once paged (e2e: a line short)", () => {
    for (const f of allFeeds.splice(0)) f.dispose();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    // As in the browser: once paged (button in, controls under it) the message's chrome reads taller,
    // so re-measuring then would give a smaller page (350px) than the box actually got (400px).
    const measure = (id: string) => {
      const paged = root.querySelector(`[data-id="${id}"] .text`)?.classList.contains('paged') ?? false;
      return { content: 1000, available: paged ? 410 : 450, lineHeight: 25 };
    };
    const heights: number[] = [];
    const pageEnd = (_id: string, _page: number, pageHeight: number) => {
      heights.push(pageHeight);
      return 40;
    };
    const feed = new Feed(root, vi.fn(), measure, { pageEnd });
    allFeeds.push(feed);
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    expect(textOf(root, 'a1').style.maxHeight).toBe('400px');
    vi.advanceTimersByTime(TICK * 2);
    key('Enter');
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40));
    expect(heights.length).toBeGreaterThan(0);
    expect(new Set(heights)).toEqual(new Set([400]));
  });

  it('keep going while the reply is still typing resumes on its last page with the old text shown (final review 1)', () => {
    const { root, feed } = typingFeed({ a1: 1000 });
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 2);
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'ok' })); // done streaming, still typing page 1
    expect(typed(root, 'a1')).toBe('ab');
    feed.upsert(msg({ id: 'a1', text: LONG, status: 'streaming' })); // KEEP GOING
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 3/3]');
    expect(typed(root, 'a1')).toBe(LONG);
    expect(cursor(root, 'a1')).not.toBeNull();
    expect(textOf(root, 'a1').lastChild).toBe(cursor(root, 'a1'));
    feed.delta('a1', ' more');
    vi.runAllTimers();
    expect(typed(root, 'a1')).toBe(`${LONG} more`);
  });

  it('marks her text aria-busy while it streams or types, and clears it once finished (final review 2)', () => {
    const { root, feed } = typingFeed();
    feed.setHistory([msg({ id: 'h1', text: 'Before.' })]);
    expect(textOf(root, 'h1').getAttribute('aria-busy')).toBeNull();
    feed.upsert(msg({ id: 'a1', text: 'Hi', status: 'streaming', ts: 1 }));
    expect(textOf(root, 'a1').getAttribute('aria-busy')).toBe('true');
    vi.runAllTimers();
    expect(textOf(root, 'a1').getAttribute('aria-busy')).toBe('true'); // caught up, still streaming
    feed.upsert(msg({ id: 'a1', text: 'Hi there', status: 'ok', ts: 1 }));
    expect(textOf(root, 'a1').getAttribute('aria-busy')).toBe('true'); // done streaming, still typing
    vi.runAllTimers();
    expect(cursor(root, 'a1')).toBeNull();
    expect(textOf(root, 'a1').getAttribute('aria-busy')).toBeNull();
  });

  it('a regenerate that fails before any text shows the restored reply at once (final review 3)', () => {
    const { root, feed } = typingFeed();
    feed.setHistory([msg({ id: 'a1', text: 'Old take.' })]);
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' })); // regenerate reopens it empty
    expect(cursor(root, 'a1')).not.toBeNull();
    feed.upsert(msg({ id: 'a1', text: 'Old take.', status: 'ok' })); // the server restores the old reply
    expect(typed(root, 'a1')).toBe('Old take.');
    expect(cursor(root, 'a1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a caught-up reply that grows into pages un-types past the page end, then types the next page (final review 4)', () => {
    const { root, feed, sizes } = typingFeed({ a1: 50 });
    feed.upsert(msg({ id: 'a1', text: LONG.slice(0, 60), status: 'streaming' }));
    vi.runAllTimers();
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 60)); // short: typed in full, waiting for more
    expect(btn(root)).toBeNull();
    sizes.a1 = 1000;
    feed.delta('a1', LONG.slice(60));
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 1/3]');
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 40));
    expect(cursor(root, 'a1')).not.toBeNull(); // waiting at the page end
    expect([...textOf(root, 'a1').querySelectorAll('.unshown')].map((n) => n.textContent).join('')).toBe(LONG.slice(40));
    expect(vi.getTimerCount()).toBe(0);
    key('Enter');
    expect(btn(root)!.textContent).toBe('[CONTINUE ▸ 2/3]');
    vi.advanceTimersByTime(TICK);
    expect(typed(root, 'a1')).toBe(LONG.slice(0, 41));
  });

  it('a new message (your line) finishes the typing reply at once', () => {
    const { root, feed } = typingFeed();
    feed.upsert(msg({ id: 'a1', text: 'Still going on', status: 'streaming' }));
    vi.advanceTimersByTime(TICK * 2);
    expect(typed(root, 'a1')).toBe('St');
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'Interrupting.', ts: 1 }));
    expect(typed(root, 'a1')).toBe('Still going on');
    expect(cursor(root, 'a1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Feed paging fit (the box the reply will actually have)', () => {
  /**
   * The real measurement (measureDom) over a fake layout taken from a Chromium probe of the stage
   * box at 1920×1080: a 259.2px box, 27.2px lines, 14px top padding over the text (the nameplate
   * sits on the box's edge) and 42px under it: room for the footer row (controls once she's done,
   * [CONTINUE] when paging), pinned to the box's bottom out of the flow.
   */
  const content: Record<string, number> = {};
  const saved: Array<[object, string, PropertyDescriptor]> = [];
  function stub(proto: object, prop: string, get: (this: HTMLElement) => number) {
    saved.push([proto, prop, Object.getOwnPropertyDescriptor(proto, prop)!]);
    Object.defineProperty(proto, prop, { configurable: true, get });
  }
  function textHeight(t: HTMLElement): number {
    const id = t.closest<HTMLElement>('.msg')?.dataset.id ?? '';
    return t.classList.contains('paged') ? parseFloat(t.style.maxHeight) : (content[id] ?? 0);
  }
  function height(n: HTMLElement): number {
    if (n.classList.contains('text')) return textHeight(n);
    if (n.classList.contains('controls')) return 17;
    if (n.classList.contains('continue')) return 23;
    if (n.classList.contains('foot')) return 24;
    if (n.classList.contains('msg')) return 14 + textHeight(n.querySelector<HTMLElement>('.text')!) + 42;
    return 0;
  }

  beforeEach(() => {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    stub(HTMLElement.prototype, 'offsetHeight', function () {
      return height(this);
    });
    stub(Element.prototype, 'scrollHeight', function () {
      return this.classList.contains('text') ? textHeight(this) : 0;
    });
  });
  afterEach(() => {
    for (const [proto, prop, desc] of saved.splice(0)) Object.defineProperty(proto, prop, desc);
    for (const k of Object.keys(content)) delete content[k];
  });

  function boxFeed() {
    document.head.innerHTML = `<style>
      .feed { max-height: 259.2px; } .text { line-height: 27.2px; } .msg { padding: 14px 22px 42px; }
    </style>`;
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: () => {}, reducedMotion: true });
    allFeeds.push(feed);
    return { root, feed };
  }
  const btn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('button.continue');

  it('a 7-line reply that fits beside the controls never pages: not while streaming, not once done, not on a later refresh', () => {
    const { root, feed } = boxFeed();
    content.a1 = 190; // 7 lines
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'go' }));
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'streaming', ts: 1 }));
    expect(btn(root)).toBeNull();
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'ok', ts: 1 }));
    expect(root.querySelectorAll('.line-keys button.key').length).toBeGreaterThan(0);
    expect(btn(root)).toBeNull();
    window.dispatchEvent(new Event('resize'));
    expect(btn(root)).toBeNull();
  });

  it('a long reply keeps one page size from streaming, through done, to a later refresh, and fits in the box', () => {
    const { root, feed } = boxFeed();
    content.a1 = 1000;
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'streaming' }));
    const streaming = textOf(root, 'a1').style.maxHeight;
    expect(streaming).not.toBe('');
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'ok' }));
    expect(textOf(root, 'a1').style.maxHeight).toBe(streaming);
    window.dispatchEvent(new Event('resize'));
    expect(textOf(root, 'a1').style.maxHeight).toBe(streaming);
    // The whole message, with room for the pinned footer, fits the box: nothing runs under it.
    expect(height(el(root, 'a1'))).toBeLessThanOrEqual(259.2);
  });

  it('TEXT SIZE raised while a reply is shown re-pages it at once: a page button, no empty page (fixed stage, Review Focus 3)', () => {
    const { root, feed } = boxFeed();
    content.a1 = 190; // 7 lines at 100 %
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'ok', ts: 1 }));
    expect(btn(root)).toBeNull();
    content.a1 = 285; // the same reply at 150 %
    feed.relayout();
    expect(btn(root)).not.toBeNull();
    expect(btn(root)!.textContent).toMatch(/\[CONTINUE ▸ 1\/2\]/);
    expect(textOf(root, 'a1').style.maxHeight).not.toBe('0px');
  });
});

describe('Feed paging measures the current line shown, not hidden', () => {
  it('her first text arriving whole pages at once in the box, though her empty reply was hidden until then', () => {
    for (const f of allFeeds.splice(0)) f.dispose();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    // As in the browser: a display:none node measures 0 tall.
    const measure = (id: string) => {
      const hidden = root.querySelector(`[data-id="${id}"]`)!.classList.contains('hidden-collapsed');
      return { content: hidden ? 0 : 1000, available: 450, lineHeight: 25 };
    };
    const feed = new Feed(root, vi.fn(), measure, { stage: true, reducedMotion: true });
    allFeeds.push(feed);
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'tell me' }));
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming', ts: 1 }));
    expect(el(root, 'a1').classList.contains('hidden-collapsed')).toBe(true); // the player's line is up until she has text
    feed.delta('a1', 'the whole long reply in one go');
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/3]');
  });
});

describe('Feed streaming caret', () => {
  it('takes no layout space (it can never wrap onto a line of its own and page a reply that fits)', () => {
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    const rule = /\.msg\.s-streaming \.text::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).not.toMatch(/display:\s*inline-block/);
    expect(css).toMatch(/\.msg\.s-streaming \.text\s*\{[^}]*position:\s*relative/);
  });
});

describe('Feed paging lets go of a reply that fits once done', () => {
  it('a reply measured long while streaming but short once finished shows no [CONTINUE] (never n/1)', () => {
    for (const f of allFeeds.splice(0)) f.dispose();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const sizes: Record<string, number> = { a1: 218 };
    const feed = new Feed(root, vi.fn(), (id) => ({ content: sizes[id] ?? 50, available: 200, lineHeight: 25 }), { stage: true, reducedMotion: true });
    allFeeds.push(feed);
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'streaming' }));
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/2]');
    sizes.a1 = 180; // the streaming caret's wrapped line is gone
    feed.upsert(msg({ id: 'a1', text: 'x', status: 'ok' }));
    expect(root.querySelector('button.continue')).toBeNull();
    expect(root.classList.contains('paging')).toBe(false);
    expect(textOf(root, 'a1').style.maxHeight).toBe('');
  });
});

describe('Feed travel lines', () => {
  function withControls(messages: ChatMessage[]) {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const feed = new Feed(root, vi.fn(), () => ({ content: 20, available: 400, lineHeight: 20 }), { stage: true, onControl: () => {} });
    allFeeds.push(feed);
    feed.expand();
    for (const m of messages) feed.upsert(m);
    return root;
  }
  const move = (over: Partial<ChatMessage> = {}) => msg({ id: 't1', role: 'user', mode: 'travel', text: "*Hicks and Nix head from Lowlight Intake to Hae's Noodles.*", ...over });

  it('shows the move as an action line with the travel class', () => {
    const root = withControls([move(), msg({ id: 'n1', role: 'agent', text: 'Two, no greens.', replyTo: 't1', mode: 'travel' })]);
    // Her reply carries the travel mode too (as greeting replies carry 'greet'): it stays an ordinary line.
    expect(el(root, 'n1').classList.contains('travel')).toBe(false);
    expect(el(root, 't1').classList.contains('travel')).toBe(true);
    expect(textOf(root, 't1').querySelector('.act')!.textContent).toContain("head from Lowlight Intake to Hae's Noodles");
    expect(el(root, 'n1').querySelector('.controls')).not.toBeNull();
  });

  it('a failed move still offers RETRY', () => {
    const root = withControls([move({ status: 'failed' })]);
    expect(el(root, 't1').querySelector('.status button')).not.toBeNull();
  });
});

describe('Feed with a resident (Hae at her stall)', () => {
  const HAE = { id: 'hae', name: 'Hae', accent: '#ff8a3c' };
  const SILAS = { id: 'silas', name: 'Silas', accent: '#6f9bff' };
  type Seen = { role: string; speaker: string; otherId?: string; othersExpressions?: Record<string, string> };
  function residentFeed(measure: Record<string, { content: number; beats?: number[] }> = {}, opts: { stage?: boolean; motion?: boolean } = {}) {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(
      root,
      vi.fn(),
      (id) => ({ content: measure[id]?.content ?? 50, available: 300, base: 200, lineHeight: 25, ...(measure[id]?.beats ? { beats: measure[id].beats } : {}) }),
      { stage: opts.stage ?? true, reducedMotion: !opts.motion },
    );
    allFeeds.push(feed);
    feed.setAgentName('Nix');
    feed.setOthers([HAE]);
    const seen: Seen[] = [];
    feed.onCurrent((c) => {
      if (c) seen.push({ role: c.role, speaker: c.speaker, ...(c.otherId ? { otherId: c.otherId } : {}), ...(c.othersExpressions ? { othersExpressions: c.othersExpressions } : {}) });
    });
    return { root, feed, seen };
  }
  const beats = (root: HTMLElement, id: string) => [...textOf(root, id).querySelectorAll<HTMLElement>('.beat')];
  const plate = (root: HTMLElement, id: string) => el(root, id).querySelector<HTMLElement>('.meta .name')!.textContent;

  it('renders a reply as beats, her marker in its own label', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    const b = beats(root, 'a1');
    expect(b.map((n) => n.dataset.who)).toEqual(['contact', 'other']);
    expect(b[1].querySelector('.beat-name')!.textContent).toBe('Hae: ');
    expect(textOf(root, 'a1').textContent).toBe('Fine.\n\nHae: Two bowls.');
  });

  it('a reply without her keeps its ordinary text, no beats', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: '*nods* Fine.' }));
    expect(beats(root, 'a1')).toHaveLength(0);
    expect(textOf(root, 'a1').textContent).toBe('*nods* Fine.');
  });

  it('each speaker gets a page: the nameplate and the speaker follow the page', () => {
    const { root, feed, seen } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/2]');
    expect(seen.at(-1)!.speaker).toBe('contact');
    expect(plate(root, 'a1')).toBe('NIX');
    feed.advance();
    expect(seen.at(-1)!.speaker).toBe('other');
    expect(plate(root, 'a1')).toBe('HAE');
    expect(root.classList.contains('speaker-other')).toBe(true);
    expect(beats(root, 'a1')[1].style.marginTop).not.toBe('');
  });

  it('a reply that is only her line is hers from the start, on one page', () => {
    const { root, feed, seen } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hae: Yo.' }));
    expect(seen.at(-1)!.speaker).toBe('other');
    expect(plate(root, 'a1')).toBe('HAE');
    expect(root.querySelector('button.continue')).toBeNull();
  });

  it("two others: Silas's page wears his nameplate and his accent, and reports him by id", () => {
    const { root, feed, seen } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.setOthers([HAE, SILAS]);
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nSilas: Not hungry.' }));
    feed.advance();
    expect(seen.at(-1)).toMatchObject({ speaker: 'other', otherId: 'silas' });
    expect(plate(root, 'a1')).toBe('SILAS');
    expect(root.classList.contains('speaker-other')).toBe(true);
    expect(root.style.getPropertyValue('--other')).toBe('#6f9bff');
    expect(beats(root, 'a1')[1].style.getPropertyValue('--beat-c')).toBe('#6f9bff');
  });

  it("reports her face from the reply", () => {
    const { feed, seen } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hae: Yo.', othersExpressions: { hae: 'happy' } }));
    expect(seen.at(-1)!.othersExpressions).toEqual({ hae: 'happy' });
  });

  it('a marker completing mid-stream turns the last paragraph into her beat, keeping the text', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', status: 'streaming' }));
    feed.delta('a1', 'x\n\nHa');
    expect(beats(root, 'a1')).toHaveLength(0);
    feed.delta('a1', 'e: hi');
    expect(beats(root, 'a1').map((n) => n.dataset.who)).toEqual(['contact', 'other']);
    expect(textOf(root, 'a1').textContent!.startsWith('x')).toBe(true);
  });

  it('without a resident her marker is plain text again', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    feed.setOthers([]);
    expect(beats(root, 'a1')).toHaveLength(0);
    expect(textOf(root, 'a1').textContent).toContain('Hae: Two bowls.');
  });

  it('the archive labels her paragraphs and never forces pages', () => {
    const { root, feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    feed.expand();
    expect(beats(root, 'a1')[1].querySelector('.beat-name')).not.toBeNull();
    expect(root.querySelector('button.continue')).toBeNull();
    expect(beats(root, 'a1')[1].style.marginTop).toBe('');
  });

  it('a swipe to another take starts again from its first speaker', () => {
    const { root, feed, seen } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    feed.advance();
    expect(seen.at(-1)!.speaker).toBe('other');
    feed.upsert(msg({ id: 'a1', text: 'Sure.\n\nHae: One bowl.', takes: { index: 1, count: 2 } }));
    expect(seen.at(-1)!.speaker).toBe('contact');
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/2]');
  });

  it('a reply in beats that is current again pages again, a speaker at a time', () => {
    const { root, feed, seen } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'thanks', ts: 1 }));
    feed.remove(['u1']);
    expect(seen.at(-1)).toMatchObject({ role: 'agent', speaker: 'contact' });
    expect(root.querySelector('button.continue')!.textContent).toBe('[CONTINUE ▸ 1/2]');
    expect(beats(root, 'a1')[1].style.marginTop).not.toBe('');
  });

  it('her nameplate leaves a reply once it is no longer current', () => {
    const { root, feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    feed.advance();
    expect(plate(root, 'a1')).toBe('HAE');
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'thanks', ts: 1 }));
    expect(plate(root, 'a1')).toBe('NIX');
    expect(el(root, 'a1').classList.contains('other-page')).toBe(false);
  });

  it('her page break survives the typing redrawing the text', () => {
    vi.useFakeTimers();
    try {
      const { root, feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } }, { motion: true });
      feed.upsert(msg({ id: 'a1', status: 'streaming' }));
      feed.delta('a1', 'Fine.\n\nHae: Two bowls.');
      vi.advanceTimersByTime(200); // a few characters typed: the text is redrawn each one
      expect(beats(root, 'a1')[1].style.marginTop).not.toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the blank line between speakers is kept apart from her beat and the one before', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    const first = beats(root, 'a1')[0];
    expect(first.querySelector('.beat-gap')!.textContent).toBe('\n\n');
    expect(textOf(root, 'a1').textContent).toBe('Fine.\n\nHae: Two bowls.');
  });

  it('the last speaker has room under her line, so her page scrolls to its top', () => {
    const { root, feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    // Pages of 200 (the box at rest): Hae starts at 200 and ends at 250; two pages run to 400.
    expect(beats(root, 'a1')[1].style.marginTop).toBe('150px');
    expect(beats(root, 'a1')[1].style.marginBottom).toBe('150px');
  });

  it('her second paragraph in a row hides its marker too', () => {
    const { root, feed } = residentFeed();
    feed.upsert(msg({ id: 'a1', text: 'Hae: *ladles broth*\n\nHae: Eat.' }));
    const b = beats(root, 'a1');
    expect(b).toHaveLength(1);
    expect([...b[0].querySelectorAll('.beat-name')].map((n) => n.textContent)).toEqual(['Hae: ', 'Hae: ']);
    expect(textOf(root, 'a1').textContent).toBe('Hae: *ladles broth*\n\nHae: Eat.');
  });

  it('a new resident (walking to or from her place) keeps a reply typing', () => {
    vi.useFakeTimers();
    try {
      const { root, feed } = residentFeed({}, { motion: true });
      feed.upsert(msg({ id: 'a1', status: 'streaming' }));
      feed.delta('a1', 'You made it. The rain followed you in.');
      vi.advanceTimersByTime(100);
      feed.setOthers([]);
      expect(textOf(root, 'a1').querySelector('.type-cursor')).not.toBeNull();
      expect(textOf(root, 'a1').querySelector('.unshown')).not.toBeNull();
      vi.advanceTimersByTime(20_000);
      expect(textOf(root, 'a1').querySelector('.unshown')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('after her last page, page keys are left alone', () => {
    const { feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } });
    feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.' }));
    const press = () => {
      const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(press()).toBe(true); // turns to her page
    expect(press()).toBe(false); // nothing after it
  });

  it("at the end of a speaker's page the cursor waits in sight, not inside the next marker", () => {
    vi.useFakeTimers();
    try {
      const { root, feed } = residentFeed({ a1: { content: 100, beats: [50, 50] } }, { motion: true });
      feed.upsert(msg({ id: 'a1', status: 'streaming' }));
      feed.delta('a1', 'Fine.\n\nHae: Two bowls.');
      feed.upsert(msg({ id: 'a1', text: 'Fine.\n\nHae: Two bowls.', status: 'ok' }));
      vi.advanceTimersByTime(20_000);
      const cursor = textOf(root, 'a1').querySelector('.type-cursor')!;
      expect(cursor).not.toBeNull();
      expect(cursor.closest('.beat-name, .beat-gap')).toBeNull();
      expect(cursor.closest('.beat')!.getAttribute('data-who')).toBe('contact');
      feed.advance();
      vi.advanceTimersByTime(20_000);
      expect(textOf(root, 'a1').querySelector('.unshown')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a new resident while a line is being edited gives that line its line stack back', () => {
    for (const f of allFeeds.splice(0)) f.dispose();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), () => ({ content: 50, available: 300, lineHeight: 25 }), { stage: true, onControl: () => {}, reducedMotion: true });
    allFeeds.push(feed);
    feed.setOthers([HAE]);
    feed.upsert(msg({ id: 'a1', text: 'Hae: Yo.' }));
    const stack = root.querySelector<HTMLElement>('.line-keys')!;
    stack.querySelector<HTMLButtonElement>('[data-key="edit"]')!.click();
    expect(stack.hidden).toBe(true);
    feed.setOthers([]);
    expect(stack.hidden).toBe(false);
    expect(stack.querySelector('[data-key="edit"]')).not.toBeNull();
  });

  it("only her markers take her colour; the contact's takes the contact's", () => {
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    expect(css).toMatch(/\.beat\[data-who='other'\] \.beat-name\s*\{[^}]*var\(--beat-c/);
    expect(css).not.toMatch(/(^|\n)\.beat-name\s*\{[^}]*--beat-c/);
  });

  it('a user line is the user speaking', () => {
    const { feed, seen } = residentFeed();
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'Hae: two please' }));
    expect(seen.at(-1)).toEqual({ role: 'user', speaker: 'user' });
  });
});

describe('the opening scene', () => {
  const SCENE = msg({ id: 'scene-pt', role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon early.', scene: { title: 'After closing', source: 'generated' }, ts: 1 });
  const stage = () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const control = vi.fn();
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: control, reducedMotion: true });
    allFeeds.push(feed);
    return { root, feed, control };
  };
  const banner = (root: HTMLElement) => root.querySelector<HTMLElement>('.scene-banner');

  it('a history with a scene row shows the banner with its title and text, unfolded while her greeting writes', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'g1', role: 'user', mode: 'greet', ts: 2 }), msg({ id: 'n1', mode: 'greet', text: 'You', status: 'streaming', ts: 3 })]);
    const b = banner(root)!;
    expect(b.querySelector('.sb-title')!.textContent).toBe('THE SCENE · AFTER CLOSING');
    expect(b.querySelector('.sb-text')!.textContent).toBe('Rain has shut the Ribbon early.');
    expect(b.classList.contains('folded')).toBe(false);
  });

  it('her finished greeting takes the banner away; loading into one shows none; the archive keeps the card', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'g1', role: 'user', mode: 'greet', ts: 2 }), msg({ id: 'n1', mode: 'greet', text: 'You', status: 'streaming', ts: 3 })]);
    feed.upsert(msg({ id: 'n1', mode: 'greet', text: 'You came.', ts: 3 }));
    expect(banner(root)).toBeNull();
    feed.setHistory([SCENE, msg({ id: 'g1', role: 'user', mode: 'greet', ts: 2 }), msg({ id: 'n1', mode: 'greet', text: 'You came.', ts: 3 })]);
    expect(banner(root)).toBeNull();
    expect(root.querySelector('.scene-entry')!.textContent).toContain('Rain has shut the Ribbon early.');
    expect(root.querySelector('.msg:not(.hidden-collapsed) .text')!.textContent).toBe('You came.');
  });

  it('a failed greeting leaves the banner up', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'g1', role: 'user', mode: 'greet', ts: 2 }), msg({ id: 'n1', mode: 'greet', text: '', status: 'failed', ts: 3 })]);
    expect(banner(root)!.classList.contains('folded')).toBe(false);
  });

  it('while she writes, a click folds and unfolds it; a user line takes it away', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'n1', mode: 'greet', text: 'You', status: 'streaming', ts: 3 })]);
    const b = banner(root)!;
    b.click();
    expect(b.classList.contains('folded')).toBe(true);
    b.click();
    expect(b.classList.contains('folded')).toBe(false);
    feed.upsert(msg({ id: 'u1', role: 'user', text: 'Hey.', ts: 4 }));
    expect(banner(root)).toBeNull();
  });

  it('removing her greeting brings the banner back', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'n1', mode: 'greet', text: 'You came.', ts: 3 })]);
    expect(banner(root)).toBeNull();
    feed.remove(['n1']);
    expect(banner(root)).not.toBeNull();
  });

  it('with motion, the banner fades before it goes', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '';
      const root = document.createElement('div');
      document.body.appendChild(root);
      const feed = new Feed(root, vi.fn(), undefined, { stage: true, reducedMotion: false });
      allFeeds.push(feed);
      feed.setHistory([SCENE, msg({ id: 'n1', mode: 'greet', text: 'You', status: 'streaming', ts: 3 })]);
      feed.upsert(msg({ id: 'n1', mode: 'greet', text: 'You came.', ts: 3 }));
      expect(banner(root)!.classList.contains('fading')).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(banner(root)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the scene entry is in the archive, never .msg, and never gets message controls', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'n1', mode: 'greet', text: 'You came.', ts: 3 })]);
    const entry = root.querySelector<HTMLElement>('.feed .scene-entry')!;
    expect(entry.classList.contains('msg')).toBe(false);
    expect(entry.textContent).toContain('THE SCENE · AFTER CLOSING');
    expect(entry.textContent).toContain('Rain has shut the Ribbon early.');
    expect(entry.classList.contains('hidden-collapsed')).toBe(true);
    expect(feed.get('scene-pt')).toBeUndefined();
    feed.expand();
    expect(entry.classList.contains('hidden-collapsed')).toBe(false);
    expect(entry.querySelector('.controls, .retry')).toBeNull();
    expect(root.querySelector('.feed')!.firstElementChild).toBe(entry);
  });

  it('once the scene ends (END SCENE), the banner goes; the archive keeps its card', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'n1', text: 'You came.', ts: 3 })]);
    feed.upsert(msg({ id: 'e1', role: 'user', mode: 'end', text: '', ts: 4 }));
    expect(banner(root)).toBeNull();
    expect(root.querySelector('.scene-entry')).not.toBeNull();
    feed.setHistory([SCENE, msg({ id: 'n1', text: 'You came.', ts: 3 }), msg({ id: 'e1', role: 'user', mode: 'end', text: '', ts: 4 })]);
    expect(banner(root)).toBeNull();
  });

  it('a failed END SCENE leaves the banner; removing the END SCENE brings it back', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE, msg({ id: 'e1', role: 'user', mode: 'end', text: '', ts: 4, status: 'failed' })]);
    expect(banner(root)).not.toBeNull();
    feed.upsert(msg({ id: 'e1', role: 'user', mode: 'end', text: '', ts: 4 }));
    expect(banner(root)).toBeNull();
    feed.remove(['e1']);
    expect(banner(root)).not.toBeNull();
  });

  it('no scene row, no banner', () => {
    const { root, feed } = stage();
    feed.setHistory([msg({ id: 'n1', text: 'You came.', ts: 3 })]);
    expect(banner(root)).toBeNull();
    expect(root.querySelector('.scene-entry')).toBeNull();
  });

  it('a new history without the scene (another playthrough) takes the banner away', () => {
    const { root, feed } = stage();
    feed.setHistory([SCENE]);
    expect(banner(root)).not.toBeNull();
    feed.setHistory([msg({ id: 'n1', text: 'You came.', ts: 3 })]);
    expect(banner(root)).toBeNull();
  });
});

describe('encounters in the feed', () => {
  const COURIER = { name: 'Courier', voice: 'clipped' };
  const EVENT = msg({ id: 'e1', role: 'user', mode: 'encounter', text: 'A courier drops a box.', ts: 1, encounter: { title: 'Wrong package', stranger: COURIER } });
  function stage(measure: Record<string, { content: number; beats?: number[] }> = {}) {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const onRetry = vi.fn();
    const feed = new Feed(
      root,
      onRetry,
      (id) => ({ content: measure[id]?.content ?? 50, available: 300, base: 200, lineHeight: 25, ...(measure[id]?.beats ? { beats: measure[id].beats } : {}) }),
      { stage: true, reducedMotion: true },
    );
    allFeeds.push(feed);
    feed.setAgentName('Nix');
    const seen: string[] = [];
    feed.onCurrent((c) => {
      if (c) seen.push(c.speaker);
    });
    return { root, feed, seen, onRetry };
  }
  const card = (root: HTMLElement) => root.querySelector<HTMLElement>('.encounter-banner');
  const plate = (root: HTMLElement, id: string) => el(root, id).querySelector<HTMLElement>('.meta .name')!.textContent;

  it('an encounter row is an amber card: ◆ ENCOUNTER · TITLE, COURIER ARRIVES, the text; gone once her reaction finishes', () => {
    const { root, feed } = stage();
    feed.setHistory([msg({ id: 'a0', text: 'Eat.', ts: 0 }), EVENT, msg({ id: 'a1', text: 'That', status: 'streaming', ts: 2, replyTo: 'e1', mode: 'encounter' })]);
    const c = card(root)!;
    expect(c.querySelector('.eb-title')!.textContent).toBe('◆ ENCOUNTER · WRONG PACKAGE');
    expect(c.querySelector('.eb-arrives')!.textContent).toBe('COURIER ARRIVES');
    expect(c.querySelector('.eb-text')!.textContent).toBe('A courier drops a box.');
    expect(c.classList.contains('folded')).toBe(false);
    c.click();
    expect(c.classList.contains('folded')).toBe(true);
    feed.upsert(msg({ id: 'a1', text: 'That is not my name.', ts: 2, replyTo: 'e1', mode: 'encounter' }));
    expect(card(root)).toBeNull();
    // Loading into an event she has reacted to shows no card.
    feed.setHistory([msg({ id: 'a0', text: 'Eat.', ts: 0 }), EVENT, msg({ id: 'a1', text: 'That is not my name.', ts: 2, replyTo: 'e1', mode: 'encounter' })]);
    expect(card(root)).toBeNull();
    // The archive keeps the event at its place.
    feed.expand();
    const entry = root.querySelector<HTMLElement>('.encounter-entry')!;
    expect(entry.previousElementSibling!.getAttribute('data-id')).toBe('a0');
    expect(entry.textContent).toContain('A courier drops a box.');
  });

  it('the event is never the line in the box; the banner goes at END SCENE or travel', () => {
    const { root, feed, seen } = stage();
    feed.setHistory([msg({ id: 'a0', text: 'Eat.', ts: 0 }), EVENT]);
    expect(seen.at(-1)).toBe('contact');
    feed.upsert(msg({ id: 'x1', role: 'user', mode: 'end', text: '', ts: 5 }));
    expect(card(root)).toBeNull();
    feed.setHistory([EVENT, msg({ id: 't1', role: 'user', mode: 'travel', text: '*They head out.*', ts: 5 })]);
    expect(card(root)).toBeNull();
  });

  it('a failed event row shows NOT DELIVERED with RETRY on its card', () => {
    const { root, feed, onRetry } = stage();
    feed.setHistory([{ ...EVENT, status: 'failed' }]);
    card(root)!.querySelector<HTMLButtonElement>('button.retry')!.click();
    expect(onRetry).toHaveBeenCalledWith('e1');
  });

  it('deleting the event re-pages the replies after it; UNDO brings the stranger back (minor M2)', () => {
    const { root, feed } = stage();
    const reply = msg({ id: 'a1', text: 'Not my name.\n\nCourier: Print here.', ts: 2, replyTo: 'e1', mode: 'encounter' });
    feed.setHistory([EVENT, reply]);
    const whos = () => [...textOf(root, 'a1').querySelectorAll<HTMLElement>('.beat')].map((b) => b.dataset.who);
    expect(whos()).toEqual(['contact', 'stranger']);
    feed.remove(['e1']);
    expect(whos()).toEqual([]);
    feed.upsert(EVENT);
    expect(whos()).toEqual(['contact', 'stranger']);
  });

  it('the event card in the archive never gets message controls (minor M4)', () => {
    for (const f of allFeeds.splice(0)) f.dispose();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory([{ ...EVENT, status: 'failed' }]);
    feed.expand();
    expect(root.querySelector('.encounter-entry .controls')).toBeNull();
    expect(root.querySelector('.controls')).toBeNull();
  });

  it("the reply after the event pages Courier: as the stranger's page; a reply after END SCENE is all hers (Review Focus 4)", () => {
    const { root, feed, seen } = stage({ a1: { content: 100, beats: [50, 50] } });
    feed.setHistory([EVENT, msg({ id: 'a1', text: 'Not my name.\n\nCourier: Print here.', ts: 2, replyTo: 'e1', mode: 'encounter' })]);
    expect(seen.at(-1)).toBe('contact');
    feed.advance();
    expect(seen.at(-1)).toBe('stranger');
    expect(plate(root, 'a1')).toBe('COURIER');
    expect(el(root, 'a1').classList.contains('stranger-page')).toBe(true);
    expect(root.classList.contains('speaker-stranger')).toBe(true);

    feed.setHistory([
      EVENT,
      msg({ id: 'a1', text: 'Not my name.\n\nCourier: Print here.', ts: 2, replyTo: 'e1', mode: 'encounter' }),
      msg({ id: 'x1', role: 'user', mode: 'end', text: '', ts: 3 }),
      msg({ id: 'a2', text: 'Goodnight.', ts: 4, replyTo: 'x1', mode: 'end' }),
      msg({ id: 'u2', role: 'user', text: 'Next night.', ts: 5 }),
      msg({ id: 'a3', text: 'Hm.\n\nCourier: Back again.', ts: 6 }),
    ]);
    expect(textOf(root, 'a3').querySelectorAll('.beat')).toHaveLength(0);
    // The older reply keeps its stranger's beats.
    expect([...textOf(root, 'a1').querySelectorAll<HTMLElement>('.beat')].map((b) => b.dataset.who)).toEqual(['contact', 'stranger']);
  });
});

describe('gig runs in the feed', () => {
  const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'Thick lacquer and two watchers.', result: 'clean' as const, trace: 8, max: 14 };
  const ROW = msg({ id: 'g1', role: 'user', mode: 'gig', text: `*Hicks jacks into a job off The Tilt's board: "Held Pay".*`, ts: 1, gig });
  const mount = (rows: ChatMessage[]) => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory(rows);
    feed.expand();
    return root;
  };

  it('a gig row is an amber card: ◢ GIG · TITLE · TIER, its stamp and trace, the brief folded', () => {
    const root = mount([ROW]);
    const card = root.querySelector<HTMLElement>('article.gig-row')!;
    expect(card.classList.contains('msg')).toBe(true);
    expect([...card.classList].filter((c) => c.startsWith('gig') && !c.startsWith('gig-'))).toEqual([]);
    expect(card.querySelector('.gig-head')!.textContent).toBe('◢ GIG · HELD PAY · HARD');
    expect(card.querySelector('.gig-stamp.gig-clean')!.textContent).toBe('CLEAN');
    expect(card.querySelector('.gig-trace')!.textContent).toBe('trace 8/14');
    const brief = card.querySelector<HTMLElement>('.gig-brief')!;
    expect(brief.hidden).toBe(true);
    card.querySelector<HTMLButtonElement>('.gig-brief-toggle')!.click();
    expect(brief.hidden).toBe(false);
    expect(brief.textContent).toBe('Thick lacquer and two watchers.');
  });

  it.each([
    ['close', 'gig-close', 'CLOSE CALL'],
    ['traced', 'gig-traced', 'TRACED'],
  ] as const)('a %s run is stamped %s', (result, cls, text) => {
    const root = mount([{ ...ROW, gig: { ...gig, result } }]);
    expect(root.querySelector(`.gig-stamp.${cls}`)!.textContent).toBe(text);
  });

  it('a slip row: FLOOR in the head, CAUGHT stamped red-classed, the meter reads heat', () => {
    const root = mount([{ ...ROW, gig: { ...gig, kind: 'slip', tier: 'medium', result: 'caught', trace: 9, max: 8 } }]);
    expect(root.querySelector('.gig-head')!.textContent).toBe('◢ GIG · FLOOR · HELD PAY · MEDIUM');
    expect(root.querySelector('.gig-stamp.gig-caught')!.textContent).toBe('CAUGHT');
    expect(root.querySelector('.gig-trace')!.textContent).toBe('heat 9/8');
  });
});

describe('liar\'s dice in the feed', () => {
  const dice = { you: 'Hicks', her: 'Cass', stake: 'a drink', result: 'won' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 4, her: 5 } }, { round: 2, bids: [{ q: 3, face: 6 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [6, 6, 1, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3, 2, 2, 4] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 3, face: 6 as const, by: 'you' as const }, count: 3, loser: 'her' as const, left: { you: 4, her: 4 } }], lines: ['Collar again.', null] };
  const ROW = msg({ id: 'd1', role: 'user', mode: 'dice', text: "*Hicks plays liar's dice with Cass, for a drink.*", ts: 1, dice });
  const mount = (rows: ChatMessage[]) => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory(rows);
    feed.expand();
    return root;
  };

  it('a dice row: ◆ DICE head, the score, the rounds folded', () => {
    const root = mount([ROW]);
    const card = root.querySelector<HTMLElement>('article.dice-row')!;
    expect(card.classList.contains('msg')).toBe(true);
    expect(card.querySelector('.dice-head')!.textContent).toBe('◆ DICE · YOU WON · for a drink');
    expect(card.querySelector('.dice-score')!.textContent).toBe('4 – 4');
    const rounds = card.querySelector<HTMLElement>('.dice-rounds')!;
    expect(rounds.hidden).toBe(true);
    card.querySelector<HTMLButtonElement>('.dice-rounds-toggle')!.click();
    expect(rounds.hidden).toBe(false);
    expect([...rounds.querySelectorAll('div')].map((d) => d.textContent)).toEqual([
      'round 1: you bid two 4s, Cass called, there was 1, you lost a die',
      'round 2: you bid three 6s, Cass called, there were 3, Cass lost a die',
    ]);
  });

  it('a lost game reads <NAME> WON', () => {
    const root = mount([{ ...ROW, dice: { ...dice, result: 'lost' } }]);
    expect(root.querySelector('.dice-head')!.textContent).toBe('◆ DICE · CASS WON · for a drink');
  });
});


describe('papers runs in the feed', () => {
  const gig = { kind: 'papers' as const, you: 'Ines', title: 'Night Crossing', tier: 'medium' as const, place: 'The Ferry Stairs', client: 'C', target: 'T', take: 'K', brief: 'At four.', result: 'back' as const, trace: 3, max: 6 };
  const papers = { name: 'Tomas Varga', bulletin: [{ text: 'No arrivals from Kessen tonight.', why: 'Quarantine.', lore: 'tidal-isle' }], overlooked: 0 };
  const mount = (g: object) => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory([msg({ id: 'p1', role: 'user', mode: 'gig', text: '*Ines sits down at a forger\'s desk for "Night Crossing".*', ts: 1, gig: g as never })]);
    feed.expand();
    return root;
  };
  it('DESK in the head, TURNED BACK stamped, the meter reads risk, the client and booth nine below', () => {
    const root = mount({ ...gig, papers });
    expect(root.querySelector('.gig-head')!.textContent).toBe('◢ GIG · DESK · NIGHT CROSSING · MEDIUM');
    expect(root.querySelector('.gig-stamp.gig-back')!.textContent).toBe('TURNED BACK');
    expect(root.querySelector('.gig-trace')!.textContent).toBe('risk 3/6');
    expect(root.querySelector('.gig-client')!.textContent).toBe('Tomas Varga · booth nine');
  });
  it('without booth nine the line is the name; without the detail there is no line (Review Focus 5)', () => {
    expect(mount({ ...gig, papers: { ...papers, overlooked: null } }).querySelector('.gig-client')!.textContent).toBe('Tomas Varga');
    const bare = mount(gig);
    expect(bare.querySelector('.gig-head')!.textContent).toBe('◢ GIG · DESK · NIGHT CROSSING · MEDIUM');
    expect(bare.querySelector('.gig-client')).toBeNull();
  });
});

describe('quest rows stay out of the box (the panel above shows them)', () => {
  const mountBox = (rows: ChatMessage[]) => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory(rows);
    return { root, feed };
  };
  const beat = msg({ id: 'q1', role: 'user', mode: 'quest', text: '*Boots on the stairs.*', ts: 2, quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel' } });
  const before = msg({ id: 'a0', role: 'agent', text: 'Earlier line.', ts: 1 });

  it('a quest row is never the line in the box: the one before stays while she starts', () => {
    const { root } = mountBox([before, beat]);
    expect(root.querySelector('article.quest-row')!.classList.contains('hidden-collapsed')).toBe(true);
    expect(root.querySelector('[data-id="a0"]')!.classList.contains('hidden-collapsed')).toBe(false);
  });

  it('her reply after it is the line in the box', () => {
    const { root } = mountBox([before, beat, msg({ id: 'a1', role: 'agent', text: 'Hm.', ts: 3, mode: 'quest', replyTo: 'q1' })]);
    expect(root.querySelector('article.quest-row')!.classList.contains('hidden-collapsed')).toBe(true);
    expect(root.querySelector('[data-id="a1"]')!.classList.contains('hidden-collapsed')).toBe(false);
  });

  it('the archive keeps it', () => {
    const { root, feed } = mountBox([before, beat]);
    feed.expand();
    expect(root.querySelector('article.quest-row')!.classList.contains('hidden-collapsed')).toBe(false);
  });
});

describe('quest rows in the feed', () => {
  const mount = (rows: ChatMessage[]) => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    allFeeds.push(feed);
    feed.setHistory(rows);
    feed.expand();
    return root;
  };

  it('a beat row is a quest card: its title, then the beat as narration', () => {
    const root = mount([msg({ id: 'q1', role: 'user', mode: 'quest', text: '*Boots on the stairs.*', ts: 1, quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel' } })]);
    const row = root.querySelector<HTMLElement>('article.quest-row')!;
    expect(row.classList.contains('msg')).toBe(true);
    expect(row.querySelector('.qr-head')!.textContent).toBe('◆ QUEST · PAPER TRAIL');
    expect(row.querySelector('.qr-pick')).toBeNull();
    expect(row.querySelector('.text')!.textContent).toContain('Boots on the stairs.');
  });

  it("a pick row shows the pick line as the player's, then what followed", () => {
    const text = 'You stall him till morning.\n\n*He nods and goes.*';
    const root = mount([msg({ id: 'q2', role: 'user', mode: 'quest', text, ts: 1, quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'return', pick: { choice: 'stall', line: 'You stall him till morning.' } } })]);
    const row = root.querySelector<HTMLElement>('article.quest-row')!;
    expect(row.querySelector('.qr-pick')!.textContent).toBe('You stall him till morning.');
    expect(row.querySelector('.text')!.textContent).not.toContain('You stall him');
    expect(row.querySelector('.text')!.textContent).toContain('He nods and goes.');
  });
});

describe('onStranger (stranger faces spec §6)', () => {
  const row = (id: string, ts: number, quest?: ChatMessage['quest']) => msg({ id, role: 'user', ts, mode: 'quest', text: 'x', quest });
  const VENN = { name: 'Arlo Venn', voice: 'polite', face: 'sdg-07' };
  it("says who's present after the rows change, and only when it changes", () => {
    const { feed } = setup();
    const seen: unknown[] = [];
    feed.onStranger((s) => seen.push(s));
    feed.setHistory([row('q1', 1, { id: 'p', title: 'P', beat: 'a', stranger: VENN })]);
    expect(seen).toEqual([VENN]);
    feed.upsert(msg({ id: 'a1', ts: 2, text: 'Hm.' }));
    expect(seen).toHaveLength(1);
    feed.upsert(row('q2', 3, { id: 'p', title: 'P', beat: 'b' }));
    expect(seen).toEqual([VENN, null]);
  });
});

describe('current line actions (faces from actions)', () => {
  const HAE = { id: 'hae', name: 'Hae', accent: '#ff8a3c' };
  const TWO_PAGES = '*She smiles.* Text. *Her jaw sets.* More.';
  /** A stage feed whose replies page by a fake page end; `measure` as the box would lay them out. */
  function actionsFeed(o: { pageEnds?: number[]; measure?: Record<string, { content: number; beats?: number[] }>; motion?: boolean } = {}) {
    for (const f of allFeeds.splice(0)) f.dispose();
    HTMLElement.prototype.scrollBy ??= () => {};
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const pageEnd = (_id: string, page: number) => o.pageEnds?.[page] ?? Infinity;
    const feed = new Feed(
      root,
      vi.fn(),
      (id) => ({ content: o.measure?.[id]?.content ?? 50, available: 450, lineHeight: 25, ...(o.measure?.[id]?.beats ? { beats: o.measure[id].beats } : {}) }),
      { stage: true, reducedMotion: !o.motion, pageEnd },
    );
    allFeeds.push(feed);
    feed.setAgentName('Nix');
    const seen: Array<{ speaker: string; actions: string }> = [];
    feed.onCurrent((c) => {
      if (c) seen.push({ speaker: c.speaker, actions: c.actions });
    });
    return { feed, seen };
  }

  it('a user line reports its actions', () => {
    const { feed, seen } = actionsFeed();
    feed.upsert(msg({ id: 'u1', role: 'user', text: '*I grin* hi' }));
    expect(seen.at(-1)).toEqual({ speaker: 'user', actions: 'I grin' });
  });

  it('actions run from the reply start through the page showing', () => {
    const { feed, seen } = actionsFeed({ pageEnds: [TWO_PAGES.indexOf('Text.') + 5], measure: { a1: { content: 900 } } });
    feed.upsert(msg({ id: 'a1', text: TWO_PAGES }));
    expect(seen.at(-1)!.actions).toContain('She smiles');
    expect(seen.at(-1)!.actions).not.toContain('jaw');
    feed.advance();
    expect(seen.at(-1)!.actions).toContain('She smiles');
    expect(seen.at(-1)!.actions).toContain('Her jaw sets');
  });

  it("an unpaged reply's actions are all of hers", () => {
    const { feed, seen } = actionsFeed();
    feed.upsert(msg({ id: 'a1', text: TWO_PAGES }));
    expect(seen.at(-1)).toEqual({ speaker: 'contact', actions: 'She smiles.\nHer jaw sets.' });
  });

  describe('while typing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('actions grow as she types; an action not yet closed counts', () => {
      const { feed, seen } = actionsFeed({ motion: true });
      feed.upsert(msg({ id: 'a1', text: '', status: 'streaming' }));
      feed.delta('a1', '*She gri');
      vi.runAllTimers();
      expect(seen.at(-1)!.actions).toBe('She gri');
      feed.delta('a1', 'ns.* Hey.');
      vi.runAllTimers();
      expect(seen.at(-1)!.actions).toBe('She grins.');
    });

    it('skipping to the end reports the whole line\'s actions', () => {
      const { feed, seen } = actionsFeed({ motion: true });
      feed.upsert(msg({ id: 'a1', text: 'Hey. *She looks away, jaw tight.*', status: 'streaming' }));
      vi.advanceTimersByTime((1000 / 60) * 2);
      expect(seen.at(-1)!.actions).toBe('');
      feed.setTextSpeed(0);
      expect(seen.at(-1)!.actions).toBe('She looks away, jaw tight.');
    });

    it('typing to the end reports the action with its last character', () => {
      const { feed, seen } = actionsFeed({ motion: true });
      feed.upsert(msg({ id: 'a1', text: '*She smiles.*', status: 'streaming' }));
      feed.upsert(msg({ id: 'a1', text: '*She smiles.*', status: 'ok' }));
      vi.runAllTimers();
      expect(seen.at(-1)!.actions).toBe('She smiles.');
    });

    it('an action not typed yet is not in the actions', () => {
      const { feed, seen } = actionsFeed({ motion: true });
      feed.upsert(msg({ id: 'a1', text: 'Hey there. *She grins.*', status: 'streaming' }));
      vi.advanceTimersByTime((1000 / 60) * 4);
      expect(seen.at(-1)!.actions).toBe('');
    });
  });

  it("others' beats are not hers, and hers are not theirs", () => {
    const { feed, seen } = actionsFeed({ measure: { a1: { content: 100, beats: [50, 50] } } });
    feed.setOthers([HAE]);
    feed.upsert(msg({ id: 'a1', text: '*I grin.*\n\nHae: *She glares.*' }));
    expect(seen.at(-1)!.speaker).toBe('contact');
    expect(seen.at(-1)!.actions).toContain('I grin');
    expect(seen.at(-1)!.actions).not.toContain('glares');
    feed.advance();
    expect(seen.at(-1)!.speaker).toBe('other');
    expect(seen.at(-1)!.actions).toContain('She glares');
    expect(seen.at(-1)!.actions).not.toContain('grin');
  });
});

describe('actionSpans', () => {
  it('one span per action, joined across streamed chunks, in text offsets', () => {
    const segs = [
      { kind: 'mark' as const, text: '*' },
      { kind: 'action' as const, text: 'She gri' },
      { kind: 'action' as const, text: 'ns.' },
      { kind: 'mark' as const, text: '*' },
      { kind: 'plain' as const, text: ' Hey. ' },
      { kind: 'mark' as const, text: '*' },
      { kind: 'action' as const, text: 'Sits.' },
    ];
    expect(actionSpans(segs)).toEqual([
      [1, 11],
      [19, 24],
    ]);
  });
});
