import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOT_MS, deckErrorText, renderBoot, dividers, patchThread, readOnlyText, renderPassTime, renderThread, renderThreads } from '../src/deck/deck-view';
import type { ChatMessage, DeckThread } from '../../shared/types';

afterEach(() => (document.body.innerHTML = ''));
const thread = (o: Partial<DeckThread> & { id: string }): DeckThread => ({ name: o.id.toUpperCase(), accent: '#ff4f8b', portrait: null, pronoun: 'she', last: null, unread: false, ...o });
const row = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({ role: 'user', text: 'x', toolLines: [], ts: 1, status: 'ok', mode: 'text', ...o });
// Day 1 is a Thursday; 02:09 on Day 2 is Friday.
const FRI_0209 = 1440 + 2 * 60 + 9;

describe('the thread list (deck spec §2)', () => {
  it('rows in the order given, each name in its accent, "no messages yet" when empty', () => {
    const open = vi.fn();
    const el = renderThreads([thread({ id: 'nix', last: { text: 'roof. 4:15', clock: FRI_0209, mine: false } }), thread({ id: 'cass', accent: '#46e3fc' })], open);
    const rows = [...el.querySelectorAll<HTMLElement>('.dk-row')];
    expect(rows.map((r) => r.querySelector('.dk-rname')!.textContent)).toEqual(['NIX', 'CASS']);
    expect(rows[1].querySelector<HTMLElement>('.dk-rname')!.style.color).toBe('rgb(70, 227, 252)');
    expect(rows[0].querySelector('.dk-rlast')!.textContent).toBe('roof. 4:15');
    expect(rows[1].querySelector('.dk-rlast')!.textContent).toBe('no messages yet');
    rows[1].click();
    expect(open).toHaveBeenCalledWith('cass');
  });
});

describe('unread (promised texts spec §6)', () => {
  it('an unread row has the dot and shows her text bright', () => {
    const el = renderThreads([thread({ id: 'nix', unread: true, last: { text: 'home.', clock: FRI_0209, mine: false } }), thread({ id: 'cass', last: { text: 'ok', clock: FRI_0209, mine: false } })], vi.fn());
    const rows = [...el.querySelectorAll('.dk-row')];
    expect(rows[0].classList.contains('dk-new')).toBe(true);
    expect(rows[0].querySelector('.dk-unread')).not.toBeNull();
    expect(rows[1].classList.contains('dk-new')).toBe(false);
    expect(rows[1].querySelector('.dk-unread')).toBeNull();
  });
});

describe('dividers', () => {
  it('one before the first row, and at gaps of 30 minutes or more', () => {
    const out = dividers([row({ id: 'a', clock: FRI_0209 }), row({ id: 'b', clock: FRI_0209 + 29 }), row({ id: 'c', clock: FRI_0209 + 29 + 30 })]);
    expect(out.map((x) => ('divider' in x ? x.divider : x.id))).toEqual(['— FRI 02:09 —', 'a', 'b', '— FRI 03:08 —', 'c']);
  });
});

describe('a thread (deck spec §2)', () => {
  const header = { place: 'the Intake', tail: 'the Rooftop 04:15', time: 'Day 2 · Fri 02:14', weather: 'rain' };
  const base = { contact: thread({ id: 'nix', name: 'Nix' }), header, rows: [] as ChatMessage[], readOnly: null, typing: false, pending: [] as { localId: string; text: string; failed?: string }[], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn() };

  it('the header names her, where she is and her plan; the bar the network, time and weather', () => {
    const el = renderThread(base);
    expect(el.querySelector('.dk-bar')!.textContent).toContain('CORTEX//RELAY');
    expect(el.querySelector('.dk-bar')!.textContent).toContain('02:14 · RAIN');
    expect(el.querySelector('.dk-name')!.textContent).toBe('NIX');
    expect(el.querySelector('.dk-where')!.textContent).toBe('THE INTAKE · THE ROOFTOP 04:15');
  });

  it("her reply's lines are separate bubbles; yours sit on the right", () => {
    const el = renderThread({ ...base, rows: [row({ id: 'u', text: 'up?', clock: 10 }), row({ id: 'a', role: 'agent', text: 'yeah\nroof', clock: 12 })] });
    expect([...el.querySelectorAll('.dk-msg')].map((b) => [b.classList.contains('dk-me') ? 'me' : 'her', b.textContent])).toEqual([
      ['me', 'up?'],
      ['her', 'yeah'],
      ['her', 'roof'],
    ]);
  });

  it('a failed text shows NOT DELIVERED · RETRY, and RETRY retries it', () => {
    const onRetry = vi.fn();
    const el = renderThread({ ...base, onRetry, rows: [row({ id: 'u', text: 'hey', status: 'failed', clock: 10 })] });
    const retry = el.querySelector<HTMLButtonElement>('.dk-retry')!;
    expect(el.querySelector('.dk-failed')!.textContent).toBe('NOT DELIVERED · RETRY');
    retry.click();
    expect(onRetry).toHaveBeenCalledWith('u');
  });

  it('typing… shows while she writes', () => {
    expect(renderThread({ ...base, typing: true }).querySelector('.dk-typing')?.textContent).toBe('typing…');
    expect(renderThread(base).querySelector('.dk-typing')).toBeNull();
  });

  it('read-only: no input, and the footer in their pronoun', () => {
    const el = renderThread({ ...base, contact: thread({ id: 'hicks', pronoun: 'he' }), readOnly: 'here' });
    expect(el.querySelector('.dk-input')).toBeNull();
    expect(el.querySelector('.dk-ro-why')!.textContent).toBe("HE'S RIGHT HERE");
    expect(readOnlyText('here', 'they')).toBe("THEY'RE RIGHT HERE");
    expect(readOnlyText('call', 'she')).toBe("YOU'RE ON A CALL");
  });

  it('SEND sends the trimmed text and clears the box; an empty box sends nothing', () => {
    const onSend = vi.fn();
    const el = renderThread({ ...base, onSend });
    document.body.append(el);
    const box = el.querySelector<HTMLTextAreaElement>('.dk-input textarea')!;
    const btn = el.querySelector<HTMLButtonElement>('.dk-send')!;
    btn.click();
    expect(onSend).not.toHaveBeenCalled();
    box.value = '  you on shift? ';
    btn.click();
    expect(onSend).toHaveBeenCalledWith('you on shift?');
    expect(box.value).toBe('');
  });

  it('a text shows at once while it waits; one that could not go offers NOT SENT · RETRY (final review I2)', () => {
    const onResend = vi.fn();
    const el = renderThread({ ...base, onResend, pending: [{ localId: 'L1', text: 'hey' }, { localId: 'L2', text: 'you there?', failed: 'NO SIGNAL' }] });
    expect([...el.querySelectorAll('.dk-me')].map((b) => b.textContent)).toEqual(['hey', 'you there?']);
    expect(el.querySelector('.dk-pending')?.textContent).toBe('hey');
    const retry = el.querySelector<HTMLButtonElement>('.dk-resend')!;
    expect(retry.textContent).toBe('NOT SENT · RETRY');
    retry.click();
    expect(onResend).toHaveBeenCalledWith('L2');
  });
});

describe('patchThread (final review I1)', () => {
  const header = { place: 'the Intake', tail: null, time: null, weather: null };
  const view = (rows: ChatMessage[], typing = false) => renderThread({ contact: thread({ id: 'nix' }), header, rows, readOnly: null, typing, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn() });

  it('an update keeps the same text box, its draft and its focus', () => {
    const cur = view([]);
    document.body.append(cur);
    const box = cur.querySelector<HTMLTextAreaElement>('.dk-box')!;
    box.value = 'half a tho';
    box.focus();
    patchThread(cur, view([row({ id: 'a', role: 'agent', text: 'yeah', clock: 5 })], true));
    expect(cur.querySelector('.dk-box')).toBe(box);
    expect(box.value).toBe('half a tho');
    expect(document.activeElement).toBe(box);
    expect(cur.querySelector('.dk-her')?.textContent).toBe('yeah');
    expect(cur.querySelector('.dk-typing')).not.toBeNull();
  });

  it('going read-only replaces the box with the footer', () => {
    const cur = view([]);
    const ro = renderThread({ contact: thread({ id: 'nix' }), header, rows: [], readOnly: 'here', typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn() });
    patchThread(cur, ro);
    expect(cur.querySelector('.dk-box')).toBeNull();
    expect(cur.querySelector('.dk-ro-why')?.textContent).toBe("SHE'S RIGHT HERE");
  });
});

describe("the deck's error words (deck minor M3)", () => {
  it("a key or credit problem says so on the deck, in the contact's words", () => {
    expect(deckErrorText('auth', 'she')).toBe('HER KEY WAS REJECTED · RELINK AT SELECT');
    expect(deckErrorText('credit', 'he')).toBe('NO CREDIT ON HIS KEY');
    expect(deckErrorText('unreachable', 'they')).toBe('NO SIGNAL · TRY AGAIN');
    expect(deckErrorText('busy', 'she')).toBe('NO SIGNAL · TRY AGAIN');
    expect(deckErrorText('with-them', 'they')).toBe("YOU'RE WITH THEM");
    expect(deckErrorText('save-changed', 'she')).toBe('THE SAVE CHANGED · NOT SENT');
    expect(deckErrorText('lost', 'she')).toBe('NOT DELIVERED');
    // Controls (final review #4).
    expect(deckErrorText('not-latest', 'she')).toBe('ONLY HER LATEST TEXT');
    expect(deckErrorText('unknown message', 'she')).toBe('THAT TEXT IS GONE');
  });
});

describe('STEP OUT and PASS TIME (deck, 2026-10-23)', () => {
  const header = { place: 'the Intake', tail: null, time: 'Day 12 · Mon 04:05', weather: 'rain' };
  const view = (readOnly: 'here' | 'call', o: { onStepOut?: () => void; onPassTime?: () => void } = {}) =>
    renderThread({ contact: thread({ id: 'nix' }), header, rows: [], readOnly, typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onStepOut: o.onStepOut ?? vi.fn(), onPassTime: o.onPassTime ?? vi.fn() });

  it('with her: STEP OUT; on a call: HANG UP — both leave', () => {
    const onStepOut = vi.fn();
    const here = view('here', { onStepOut });
    expect(here.querySelector('.dk-stepout')!.textContent).toBe('STEP OUT');
    here.querySelector<HTMLButtonElement>('.dk-stepout')!.click();
    expect(onStepOut).toHaveBeenCalled();
    expect(view('call').querySelector('.dk-stepout')!.textContent).toBe('HANG UP');
  });

  it('the bar shows the weekday with the time (weekends off)', () => {
    expect(view('here').querySelector('.dk-clock')!.textContent).toBe('MON 04:05 · RAIN');
    expect(renderThreads([], vi.fn(), header, vi.fn()).querySelector('.dk-clock')!.textContent).toBe('MON 04:05 · RAIN');
  });

  it('the clock in the bar opens PASS TIME, on a thread and on the list', () => {
    const onPassTime = vi.fn();
    view('here', { onPassTime }).querySelector<HTMLButtonElement>('.dk-clock')!.click();
    const list = renderThreads([], vi.fn(), header, onPassTime);
    list.querySelector<HTMLButtonElement>('.dk-clock')!.click();
    expect(onPassTime).toHaveBeenCalledTimes(2);
  });

  it('PASS TIME: +30 MIN, +1 HOUR, +4 HOURS, or UNTIL a time', () => {
    const onWait = vi.fn();
    const onClose = vi.fn();
    const el = renderPassTime(onWait, onClose);
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.dk-wait')];
    expect(buttons.map((b) => b.textContent)).toEqual(['+30 MIN', '+1 HOUR', '+4 HOURS']);
    buttons[1].click();
    expect(onWait).toHaveBeenLastCalledWith({ minutes: 60 });
    const until = el.querySelector<HTMLInputElement>('.dk-until')!;
    until.value = '17:30';
    el.querySelector<HTMLButtonElement>('.dk-until-go')!.click();
    expect(onWait).toHaveBeenLastCalledWith({ until: '17:30' });
    until.value = '';
    el.querySelector<HTMLButtonElement>('.dk-until-go')!.click();
    expect(onWait).toHaveBeenCalledTimes(2);
    el.querySelector<HTMLButtonElement>('.dk-close')!.click();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('long-press controls (deck controls spec §2)', async () => {
  const { menuItems, laterCount, renderMenu } = await import('../src/deck/deck-view');
  const u1 = row({ id: 'u1', text: 'a', clock: 10 });
  const a1 = row({ id: 'a1', role: 'agent', text: 'b', clock: 10, replyTo: 'u1' });
  const u2 = row({ id: 'u2', text: 'c', clock: 12 });
  const a2 = row({ id: 'a2', role: 'agent', text: 'd\ne', clock: 12, replyTo: 'u2', takes: { index: 1, count: 2 } });
  const rows = [u1, a1, u2, a2];

  it('her latest reply: REGEN and swipes; your latest text: EDIT; any text: DELETE', () => {
    expect(menuItems(rows, 'a2')).toEqual(['regen', 'swipe', 'delete']);
    expect(menuItems(rows, 'u2')).toEqual(['edit', 'delete']);
    expect(menuItems(rows, 'a1')).toEqual(['delete']);
    expect(menuItems(rows, 'u1')).toEqual(['delete']);
    expect(menuItems([u1, a1, u2, { ...a2, takes: undefined }], 'a2')).toEqual(['regen', 'delete']);
  });

  it('laterCount counts the texts after it', () => {
    expect(laterCount(rows, 'u2')).toBe(1);
    expect(laterCount(rows, 'u1')).toBe(3);
  });

  it('the menu: swipe count, and DELETE asks first with the count', () => {
    const o = { onRegen: vi.fn(), onSwipe: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
    const el = renderMenu({ items: ['regen', 'swipe', 'delete'], takes: { index: 1, count: 2 }, later: 1, ...o });
    expect(el.querySelector('.dk-takes')!.textContent).toBe('2/2');
    el.querySelector<HTMLButtonElement>('.dk-prev')!.click();
    expect(o.onSwipe).toHaveBeenCalledWith(0);
    el.querySelector<HTMLButtonElement>('.dk-m-regen')!.click();
    expect(o.onRegen).toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('.dk-m-delete')!.click();
    expect(o.onDelete).not.toHaveBeenCalled();
    expect(el.querySelector('.dk-confirm')!.textContent).toContain('DELETE THIS AND 1 AFTER?');
    el.querySelector<HTMLButtonElement>('.dk-yes')!.click();
    expect(o.onDelete).toHaveBeenCalled();
  });

  it('a long press or a right-click on a bubble opens its menu', () => {
    vi.useFakeTimers();
    const onMenu = vi.fn();
    const el = renderThread({ contact: thread({ id: 'nix' }), header: { place: 'x', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onMenu });
    const her = el.querySelectorAll<HTMLElement>('.dk-her')[1];
    expect(her.dataset.id).toBe('a2');
    her.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onMenu).toHaveBeenLastCalledWith('a2');
    vi.advanceTimersByTime(1000);
    const mine = el.querySelectorAll<HTMLElement>('.dk-me')[0];
    mine.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); // jsdom has no PointerEvent
    vi.advanceTimersByTime(500);
    expect(onMenu).toHaveBeenLastCalledWith('u1');
    vi.useRealTimers();
  });

  it("a long press then the browser's own long-press menu opens it once (final review #7)", () => {
    vi.useFakeTimers();
    const onMenu = vi.fn();
    const el = renderThread({ contact: thread({ id: 'nix' }), header: { place: 'x', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onMenu });
    const mine = el.querySelectorAll<HTMLElement>('.dk-me')[0];
    mine.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    vi.advanceTimersByTime(500);
    mine.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onMenu).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('editing: your text back in the box, with EDITING · CANCEL', () => {
    const onCancelEdit = vi.fn();
    const el = renderThread({ contact: thread({ id: 'nix' }), header: { place: 'x', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), editing: { id: 'u2', text: 'c' }, onCancelEdit });
    expect(el.querySelector<HTMLTextAreaElement>('.dk-box')!.value).toBe('c');
    expect(el.querySelector('.dk-editing')!.textContent).toContain('EDITING');
    el.querySelector<HTMLButtonElement>('.dk-editing button')!.click();
    expect(onCancelEdit).toHaveBeenCalled();
  });
});

describe('the boot screen (Cortex Global logo)', () => {
  afterEach(() => vi.useRealTimers());
  it('shows the logo and the network line, then gives way once', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const boot = renderBoot(done);
    document.body.append(boot);
    expect(boot.querySelector<HTMLImageElement>('.dk-boot-logo')!.getAttribute('src')).toBe('/deck/cortex-global.webp');
    expect(boot.querySelector('.dk-boot-line')!.textContent).toBe('CORTEX RELAY · A CORTEX GLOBAL NETWORK');
    vi.advanceTimersByTime(BOOT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.body.contains(boot)).toBe(false);
  });
  it('a tap skips it', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const boot = renderBoot(done);
    document.body.append(boot);
    boot.click();
    vi.advanceTimersByTime(BOOT_MS + 1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.body.contains(boot)).toBe(false);
  });
});

describe('photo bubbles (photos spec §5)', () => {
  const rows = [row({ id: 'u1', text: 'pic?' }), row({ id: 'a2', role: 'agent', text: 'here\n[photo: roof-cranes]', replyTo: 'u1' })];
  const view = (onMenu = vi.fn()) => {
    const v = renderThread({ contact: thread({ id: 'nix' }), header: { place: 'x', tail: null, time: null, weather: null }, rows, readOnly: null, typing: false, pending: [], onSend: vi.fn(), onRetry: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onMenu });
    document.body.append(v);
    return v;
  };

  it('a photo line is a picture in her bubble, from her pool', () => {
    const v = view();
    const her = [...v.querySelectorAll<HTMLElement>('.dk-her')];
    expect(her.map((b) => b.textContent)).toEqual(['here', '']);
    const img = her[1].querySelector<HTMLImageElement>('.dk-photo img')!;
    expect(img.getAttribute('src')).toBe('/api/agents/nix/photo/roof-cranes');
    expect(her[1].dataset.id).toBe('a2');
  });

  it('a photo that loads while the thread sits at the bottom keeps it at the bottom (final review I3)', () => {
    const v = view();
    const msgs = v.querySelector<HTMLElement>('.dk-msgs')!;
    let top = 600;
    Object.defineProperty(msgs, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(msgs, 'scrollTop', { get: () => top, set: (x: number) => (top = x), configurable: true });
    Object.defineProperty(msgs, 'scrollHeight', { value: 1000, configurable: true });
    const img = v.querySelector<HTMLImageElement>('.dk-photo img')!;
    Object.defineProperty(img, 'offsetHeight', { value: 300, configurable: true });
    Object.defineProperty(msgs, 'scrollHeight', { value: 1300, configurable: true });
    img.dispatchEvent(new Event('load'));
    expect(top).toBe(1300);
  });

  it('a photo that fails to load reads PHOTO UNAVAILABLE', () => {
    const v = view();
    v.querySelector<HTMLImageElement>('.dk-photo img')!.dispatchEvent(new Event('error'));
    expect(v.querySelector('.dk-photo-gone')!.textContent).toBe('PHOTO UNAVAILABLE');
    expect(v.querySelector('.dk-photo img')).toBeNull();
  });

  it('a tap opens it full screen, a tap closes it', () => {
    const v = view();
    v.querySelector<HTMLElement>('.dk-photo')!.click();
    const viewer = document.querySelector<HTMLElement>('.dk-viewer')!;
    expect(viewer.querySelector('img')!.getAttribute('src')).toBe('/api/agents/nix/photo/roof-cranes');
    viewer.click();
    expect(document.querySelector('.dk-viewer')).toBeNull();
    void v;
  });

  it('a long press on a photo opens the menu, not the viewer', () => {
    vi.useFakeTimers();
    const onMenu = vi.fn();
    const v = view(onMenu);
    const photo = v.querySelector<HTMLElement>('.dk-photo')!;
    photo.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    vi.advanceTimersByTime(500);
    photo.click();
    expect(onMenu).toHaveBeenCalledWith('a2');
    expect(document.querySelector('.dk-viewer')).toBeNull();
    vi.useRealTimers();
  });
});
