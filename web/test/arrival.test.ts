import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DistrictInfo } from '../../shared/districts';
import { createArrival, type Arrival, type ArrivalTravel } from '../src/room/arrival';

const KARASU: DistrictInfo = { id: 'karasu', name: 'Karasu', subtitle: 'Old Town · The Ribbon', lore: 'Old. Older still.\n\nBones.', hasArt: true };
const TRAVEL: ArrivalTravel = { sceneId: 'strand/low-roller', to: 'The Low Roller', from: 'The Tilt', comms: false };
let host: HTMLElement;
let made: Arrival[] = [];
const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const box = () => host.querySelector<HTMLTextAreaElement>('.ar-box textarea');
const flush = () => vi.advanceTimersByTimeAsync(0);
const key = (k: string, o: KeyboardEventInit = {}, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const barWidth = () => parseFloat($('.ar-bar i')!.style.width);

type MakeOpts = { reducedMotion?: boolean; paused?: () => boolean; suggest?: (steer: string | null) => Promise<string>; travel?: ArrivalTravel; preload?: (id: string) => void };
function make(info: DistrictInfo | null = KARASU, o: MakeOpts = {}) {
  const fetchDistrict = vi.fn(async () => info);
  const arrival = createArrival(host, {
    reducedMotion: o.reducedMotion ?? true,
    fetchDistrict,
    paused: o.paused,
    suggest: o.suggest,
    ...(o.travel ? { travel: o.travel, moveLine: '*Jo and Nix head from the Tilt to the Low Roller.*' } : {}),
    preload: o.preload,
  });
  made.push(arrival);
  return { arrival, fetchDistrict };
}
/** A page-load screen, filled and ready, in `mode`. */
async function toReady(arrival: Arrival, mode: 'opening' | 'resume' = 'resume') {
  arrival.setScene('karasu', 'The Tilt');
  await flush();
  arrival.setMode(mode);
  arrival.ready();
  await vi.advanceTimersByTimeAsync(1600);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  // Close every screen a test left open, so its key listener doesn't leak into the next test.
  for (const a of made) a.close();
  await vi.advanceTimersByTimeAsync(1600);
  expect(made.every((a) => !a.open)).toBe(true);
  made = [];
  vi.useRealTimers();
});

describe('arrival screen: what the load screen did', () => {
  it('starts waiting and open', () => {
    const { arrival } = make();
    expect(arrival.state()).toBe('waiting');
    expect(arrival.open).toBe(true);
    expect($('.ar-root')).not.toBeNull();
  });

  it('is not scaled by itself: the game stage does that (fixed stage §4)', () => {
    make();
    window.dispatchEvent(new Event('resize'));
    expect($('.ar-stage')!.style.transform).toBe('');
  });

  it('fills on setScene: the place, the district and its subtitle, the lore', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    expect(arrival.state()).toBe('filling');
    expect($('.ar-name')!.textContent).toBe('THE TILT');
    expect($('.ar-sub')!.textContent).toBe('KARASU · Old Town · The Ribbon');
    expect(host.querySelectorAll('.ar-lore p')).toHaveLength(2);
  });

  it('the clock shows under the place', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.setClock(1200);
    expect($('.ar-meta')!.textContent).toBe('DAY 1 · THU 20:00');
  });

  it('holds at 90 % until ready', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(barWidth()).toBeLessThanOrEqual(90);
    expect(arrival.state()).toBe('filling');
  });

  it('ready waits for the minimum', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.setMode('resume');
    await vi.advanceTimersByTimeAsync(200);
    arrival.ready();
    await vi.advanceTimersByTimeAsync(100);
    expect(arrival.state()).toBe('filling');
    await vi.advanceTimersByTimeAsync(1300);
    expect(arrival.state()).toBe('ready');
    expect($('.ar-go')!.hidden).toBe(false);
    expect(barWidth()).toBe(100);
  });

  it('keys before ready do nothing', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.setMode('resume');
    key('Enter');
    expect(arrival.open).toBe(true);
  });

  it('ignores repeated keys', async () => {
    const { arrival } = make();
    await toReady(arrival);
    key('Enter', { repeat: true });
    expect(arrival.open).toBe(true);
  });

  it('resume: Enter, Space and click close it once', async () => {
    let root: HTMLElement | null = null;
    for (const close of [() => key('Enter'), () => key(' '), () => root!.click()]) {
      host.innerHTML = '';
      const { arrival } = make();
      root = $('.ar-root');
      const cb = vi.fn();
      arrival.onClose(cb);
      await toReady(arrival);
      close();
      close();
      expect(cb).toHaveBeenCalledTimes(1);
      expect(arrival.state()).toBe('closed');
      expect(arrival.open).toBe(false);
      expect($('.ar-root')).toBeNull();
    }
  });

  it('fades out over 300 ms without reduced motion', async () => {
    const { arrival } = make(KARASU, { reducedMotion: false });
    await toReady(arrival);
    key('Enter');
    expect(arrival.state()).toBe('closed');
    expect($('.ar-root')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    expect($('.ar-root')).toBeNull();
  });

  it('room listeners added after it never see a key while it is open', async () => {
    const { arrival } = make();
    const after = vi.fn();
    window.addEventListener('keydown', after, { capture: true });
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    key('j', { altKey: true });
    key('Enter');
    window.removeEventListener('keydown', after, { capture: true });
    expect(after).not.toHaveBeenCalled();
  });

  it('a listener registered before it still sees the closing key', async () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen, { capture: true });
    const { arrival } = make();
    await toReady(arrival);
    key('Enter');
    window.removeEventListener('keydown', seen, { capture: true });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(arrival.open).toBe(false);
  });

  it('a null district still shows the place, with no art (an opening must not lose its box; review I4)', async () => {
    const { arrival } = make(null);
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    expect(arrival.open).toBe(true);
    expect($('.ar-root')!.classList.contains('ar-no-art')).toBe(true);
    expect($('.ar-name')!.textContent).toBe('THE TILT');
    expect($('.ar-sub')!.textContent).toBe('');
    arrival.setMode('opening');
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600);
    expect(box()).not.toBeNull();
  });

  it('undefined scene closes at once', () => {
    const { arrival, fetchDistrict } = make();
    arrival.setScene(undefined, 'X');
    expect(arrival.state()).toBe('closed');
    expect(fetchDistrict).not.toHaveBeenCalled();
  });

  it('no art', async () => {
    const { arrival } = make({ ...KARASU, hasArt: false });
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    expect($('.ar-root')!.classList.contains('ar-no-art')).toBe(true);
    expect($('img.ar-art')).toBeNull();
  });

  it('drops a broken image', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    $('img.ar-art')!.dispatchEvent(new Event('error'));
    expect($('img.ar-art')).toBeNull();
    expect($('.ar-root')!.classList.contains('ar-no-art')).toBe(true);
  });

  it('no subtitle: the district alone', async () => {
    const { subtitle: _, ...bare } = KARASU;
    const { arrival } = make(bare);
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    expect($('.ar-sub')!.textContent).toBe('KARASU');
  });

  it('shows lore text literally', async () => {
    const { arrival } = make({ ...KARASU, lore: '<b>x</b> & y' });
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    expect($('.ar-lore')!.textContent).toContain('<b>x</b> & y');
    expect($('.ar-lore')!.innerHTML).not.toContain('<b>');
  });

  it('gives up when no district arrives', async () => {
    const { arrival } = make();
    await vi.advanceTimersByTimeAsync(8000);
    expect(arrival.state()).toBe('closed');
  });

  it('an opening never gives up: a slow district fills in with no art (review I4)', async () => {
    const fetchDistrict = vi.fn(() => new Promise<DistrictInfo | null>(() => {}));
    const arrival = createArrival(host, { reducedMotion: true, fetchDistrict });
    made.push(arrival);
    arrival.setScene('karasu', 'The Tilt');
    arrival.setMode('opening');
    await vi.advanceTimersByTimeAsync(9000);
    expect(arrival.open).toBe(true);
    expect($('.ar-root')!.classList.contains('ar-no-art')).toBe(true);
  });

  it('setScene only counts once', async () => {
    const { arrival, fetchDistrict } = make();
    arrival.setScene('karasu', 'The Tilt');
    arrival.setScene('velvet', 'Glass Orchid');
    await flush();
    expect(fetchDistrict).toHaveBeenCalledTimes(1);
    expect($('.ar-name')!.textContent).toBe('THE TILT');
  });

  it('onClose after closing fires at once', () => {
    const { arrival } = make();
    arrival.setScene(undefined, 'X');
    const cb = vi.fn();
    arrival.onClose(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('keys never reach the page while it is open', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    const under = document.createElement('textarea');
    document.body.append(under);
    const below = vi.fn();
    under.addEventListener('keydown', below);
    for (const k of ['a', 'Enter', ' ', 'Backspace']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      under.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(below).not.toHaveBeenCalled();
    const reload = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(false);
    under.remove();
  });

  it('keys reach the page again once closed', async () => {
    const { arrival } = make();
    await toReady(arrival);
    key('Enter');
    const under = document.createElement('textarea');
    document.body.append(under);
    const below = vi.fn();
    under.addEventListener('keydown', below);
    under.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(below).toHaveBeenCalledTimes(1);
    under.remove();
  });

  it('keys pass through while a panel above it is open (the bug report)', async () => {
    let bugUp = true;
    const { arrival } = make(KARASU, { paused: () => bugUp });
    await toReady(arrival);
    const under = document.createElement('textarea');
    document.body.append(under);
    const below = vi.fn();
    under.addEventListener('keydown', below);
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    under.dispatchEvent(e);
    expect(below).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
    expect(arrival.open).toBe(true);
    bugUp = false;
    key('Enter');
    expect(arrival.open).toBe(false);
    under.remove();
  });

  it('a room that never says ready still finishes after 20 s', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    await vi.advanceTimersByTimeAsync(19000);
    expect(arrival.state()).toBe('filling');
    await vi.advanceTimersByTimeAsync(1100);
    expect(arrival.state()).toBe('ready');
  });

  it('Ctrl+Enter never reaches the chat prompt', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    const under = document.createElement('textarea');
    document.body.append(under);
    const below = vi.fn();
    under.addEventListener('keydown', below);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...mod });
      under.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(below).not.toHaveBeenCalled();
    under.remove();
  });

  it('close() closes it at once and fires onClose (a room notice shows instead)', () => {
    const { arrival } = make();
    const cb = vi.fn();
    arrival.onClose(cb);
    arrival.close();
    expect(arrival.state()).toBe('closed');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('takes focus off the chat prompt and gives it back', async () => {
    host.innerHTML = '';
    const prompt = document.createElement('textarea');
    document.body.append(prompt);
    prompt.focus();
    const { arrival } = make();
    expect(document.activeElement).not.toBe(prompt);
    await toReady(arrival);
    key('Enter');
    expect(document.activeElement).toBe(prompt);
    prompt.remove();
  });

  it('Ctrl+V and Ctrl+Backspace never reach a field under it', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    const under = document.createElement('textarea');
    document.body.append(under);
    for (const k of ['v', 'Backspace', 'x']) {
      const e = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      under.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    under.remove();
  });
});

describe('arrival screen: modes (spec 2026-10-27 §2)', () => {
  it('no mode yet: no box, and ENTER stays hidden even when ready (Review Focus 5)', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600);
    expect(box()).toBeNull();
    expect($('.ar-go')!.hidden).toBe(true);
    key('Enter');
    expect(arrival.open).toBe(true);
  });

  it('resume: BACK AT, no box, the whole lore', async () => {
    const { arrival } = make();
    await toReady(arrival, 'resume');
    expect($('.ar-rule')!.textContent).toBe('BACK AT');
    expect(box()).toBeNull();
    expect(host.querySelectorAll('.ar-lore p')).toHaveLength(2);
    expect($('.ar-go')!.hidden).toBe(false);
  });

  it('opening: OPENING AT, HOW IT OPENS, an 800-character box, the lore cut to its first sentence', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    expect($('.ar-rule')!.textContent).toBe('OPENING AT');
    expect($('.ar-label')!.textContent).toContain('HOW IT OPENS');
    expect($('.ar-label')!.textContent).toContain('OPTIONAL');
    expect(box()!.maxLength).toBe(800);
    expect(host.querySelectorAll('.ar-lore p')).toHaveLength(0);
    expect($('.ar-lore-line')!.textContent).toBe('Old.');
    expect(document.activeElement).toBe(box());
  });

  it('opening: Enter in the box sends what is typed once the room is ready, then closes', async () => {
    const { arrival } = make();
    const sent = vi.fn();
    arrival.onSend(sent);
    await toReady(arrival, 'opening');
    box()!.value = '  Rain.  ';
    key('Enter', {}, box()!);
    expect(sent).toHaveBeenCalledExactlyOnceWith('Rain.');
    expect(arrival.text()).toBe('Rain.');
    expect(arrival.open).toBe(false);
  });

  it('opening: Enter before ready does nothing; the bar filling never closes it on its own', async () => {
    const { arrival } = make();
    const sent = vi.fn();
    arrival.onSend(sent);
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.setMode('opening');
    box()!.value = 'Rain.';
    key('Enter', {}, box()!);
    expect(sent).not.toHaveBeenCalled();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600);
    expect(arrival.open).toBe(true);
    expect(box()!.value).toBe('Rain.');
    key('Enter', {}, box()!);
    expect(sent).toHaveBeenCalledExactlyOnceWith('Rain.');
  });

  it('opening: a click on the screen does not close it', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    $('.ar-root')!.click();
    expect(arrival.open).toBe(true);
  });

  it('text() is only what ENTER sent: a close that was not ENTER sends nothing (review I3)', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    box()!.value = ' half typed ';
    expect(arrival.text()).toBe('');
    arrival.close();
    expect(arrival.text()).toBe('');
    const other = make().arrival;
    await toReady(other, 'opening');
    box()!.value = ' a ';
    key('Enter', {}, box()!);
    expect(other.text()).toBe('a');
  });

  it('keys in order: SUGGEST, then ENTER at the right (review I1)', async () => {
    const { arrival } = make(KARASU, { suggest: async () => 'x' });
    await toReady(arrival, 'opening');
    expect([...$('.ar-keys')!.children].map((c) => c.className.split(' ')[0])).toEqual(['ar-suggest', 'ar-go']);
  });

  it('a click on the screen puts the caret back in the box (review M6)', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    box()!.blur();
    $('.ar-file')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(box());
  });

  it('the box is not focused while a panel above owns the keyboard (review M5)', async () => {
    const { arrival } = make(KARASU, { paused: () => true });
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.setMode('opening');
    expect(document.activeElement).not.toBe(box());
  });

  it("Safari's composition Enter (keyCode 229) never sends (review M7)", async () => {
    const { arrival } = make();
    const sent = vi.fn();
    arrival.onSend(sent);
    await toReady(arrival, 'opening');
    box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    expect(sent).not.toHaveBeenCalled();
  });

  it('no mode 4 s after ready: it resumes, so the room is never stuck behind it (review M8)', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600 + 4000);
    expect($('.ar-rule')!.textContent).toBe('BACK AT');
    expect(box()).toBeNull();
    key('Enter');
    expect(arrival.open).toBe(false);
  });

  it('a late opening still turns the fallback resume into the opening, while nothing has been pressed', async () => {
    const { arrival } = make();
    const sent = vi.fn();
    arrival.onSend(sent);
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600 + 4000);
    expect($('.ar-rule')!.textContent).toBe('BACK AT');
    arrival.setMode('opening');
    expect($('.ar-rule')!.textContent).toBe('OPENING AT');
    expect(box()).not.toBeNull();
    expect(document.activeElement).toBe(box());
    // The resume's lore paragraphs give way to the opening's one line.
    expect(host.querySelectorAll('.ar-lore p')).toHaveLength(0);
    expect($('.ar-lore-line')!.textContent).toBe('Old.');
    expect($('.ar-go')!.textContent).toContain('ENTER');
    box()!.value = 'Rain.';
    key('Enter', {}, box()!);
    expect(sent).toHaveBeenCalledWith('Rain.');
    expect(arrival.text()).toBe('Rain.');
  });

  it('a fallback resume that was pressed through stays closed: a late opening changes nothing', async () => {
    const { arrival } = make();
    arrival.setScene('karasu', 'The Tilt');
    await flush();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600 + 4000);
    key('Enter');
    arrival.setMode('opening');
    expect(arrival.open).toBe(false);
    expect(arrival.text()).toBe('');
  });

  it('a resume the history said is never upgraded, and a fallback ignores a late resume', async () => {
    const { arrival } = make();
    await toReady(arrival, 'resume');
    arrival.setMode('opening');
    expect($('.ar-rule')!.textContent).toBe('BACK AT');
    expect(box()).toBeNull();

    const second = make().arrival;
    second.setScene('karasu', 'The Tilt');
    await flush();
    second.ready();
    await vi.advanceTimersByTimeAsync(1600 + 4000);
    second.setMode('resume');
    second.setMode('opening');
    expect(host.querySelectorAll('.ar-rule')[1]!.textContent).toBe('BACK AT');
  });

  it('the box types: keys in it are not swallowed, and Ctrl+V pastes', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    for (const [k, o] of [['a', {}], [' ', {}], ['Backspace', {}], ['v', { ctrlKey: true }]] as const) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
      box()!.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
  });

  it('Shift+Enter and Enter while composing never send (Review Focus 1)', async () => {
    const { arrival } = make();
    const sent = vi.fn();
    arrival.onSend(sent);
    await toReady(arrival, 'opening');
    const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    box()!.dispatchEvent(shift);
    expect(shift.defaultPrevented).toBe(false);
    box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    expect(sent).not.toHaveBeenCalled();
    expect(arrival.open).toBe(true);
  });

  it('setWith shows who comes with you, and null hides it', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    arrival.setWith('NIX ON THE LINE');
    expect($('.ar-with')!.hidden).toBe(false);
    expect($('.ar-with')!.textContent).toBe('NIX ON THE LINE');
    arrival.setWith(null);
    expect($('.ar-with')!.hidden).toBe(true);
  });
});

describe('arrival screen: SUGGEST', () => {
  it('Alt+G or a click drafts from the box, then fills it', async () => {
    let answer!: (s: string) => void;
    const suggest = vi.fn(() => new Promise<string>((r) => (answer = r)));
    const { arrival } = make(KARASU, { suggest });
    await toReady(arrival, 'opening');
    box()!.value = 'want to see the fence';
    key('g', { altKey: true }, box()!);
    expect(suggest).toHaveBeenCalledExactlyOnceWith('want to see the fence');
    expect($('.ar-label')!.textContent).toContain('SUGGEST IS DRAFTING');
    expect(($('.ar-suggest') as HTMLButtonElement).disabled).toBe(true);
    $('.ar-suggest')!.click();
    expect(suggest).toHaveBeenCalledTimes(1);
    answer('Rain on the glass.');
    await flush();
    expect(box()!.value).toBe('Rain on the glass.');
    expect(($('.ar-suggest') as HTMLButtonElement).disabled).toBe(false);
    expect($('.ar-label')!.textContent).toContain('HOW IT OPENS');
    box()!.value = '';
    $('.ar-suggest')!.click();
    expect(suggest).toHaveBeenLastCalledWith(null);
  });

  it('a failed draft keeps the text and says why', async () => {
    const suggest = vi.fn(async () => {
      throw new Error('NO KEY LINKED');
    });
    const { arrival } = make(KARASU, { suggest });
    await toReady(arrival, 'opening');
    box()!.value = 'mine';
    $('.ar-suggest')!.click();
    await flush();
    expect(box()!.value).toBe('mine');
    expect($('.ar-fail')!.textContent).toBe('NO KEY LINKED');
  });

  it('no suggest given: no SUGGEST key', async () => {
    const { arrival } = make();
    await toReady(arrival, 'opening');
    expect($('.ar-suggest')).toBeNull();
  });
});

describe('arrival screen: travel (spec 2026-10-27 §4)', () => {
  async function travel(o: MakeOpts = {}) {
    const preload = vi.fn();
    const r = make(KARASU, { travel: TRAVEL, preload, ...o });
    await flush();
    return { ...r, preload };
  }

  it('HEADING TO, the route, the move line, a 2000-character box; the art preloads', async () => {
    const { fetchDistrict, preload } = await travel();
    expect(fetchDistrict).toHaveBeenCalledWith('strand/low-roller');
    expect(preload).toHaveBeenCalledWith('strand/low-roller');
    expect($('.ar-rule')!.textContent).toBe('HEADING TO');
    expect($('.ar-name')!.textContent).toBe('THE LOW ROLLER');
    expect($('.ar-route')!.textContent).toContain('THE TILT');
    expect($('.ar-route')!.textContent).toContain('THE LOW ROLLER');
    expect($('.ar-move')!.textContent).toBe('*Jo and Nix head from the Tilt to the Low Roller.*');
    expect($('.ar-label')!.textContent).toContain('WHAT YOU SAY ON THE WAY');
    expect(box()!.maxLength).toBe(2000);
    expect($('.ar-lore-line')!.textContent).toBe('Old.');
  });

  it('Enter sends at once, and only once until a notice (Review Focus 2)', async () => {
    const { arrival } = await travel();
    const sent = vi.fn();
    arrival.onSend(sent);
    box()!.value = 'Come on.';
    key('Enter', {}, box()!);
    key('Enter', {}, box()!);
    $('.ar-go')!.click();
    expect(sent).toHaveBeenCalledExactlyOnceWith('Come on.');
    expect(arrival.open).toBe(true);
    arrival.notice('wait for her to finish');
    expect($('.ar-notice')!.textContent).toBe('wait for her to finish');
    expect(box()!.value).toBe('Come on.');
    key('Enter', {}, box()!);
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it('the notice clears on the next keystroke in the box', async () => {
    const { arrival } = await travel();
    arrival.notice('no');
    box()!.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('.ar-notice')!.textContent).toBe('');
  });

  it('after GO, ready() closes it', async () => {
    const { arrival } = await travel();
    const closed = vi.fn();
    arrival.onClose(closed);
    arrival.onSend(() => {});
    key('Enter', {}, box()!);
    expect(arrival.open).toBe(true);
    arrival.ready();
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(arrival.open).toBe(false);
  });

  it('a move that never lands still steps aside after 20 s', async () => {
    const { arrival } = await travel();
    arrival.onSend(() => {});
    key('Enter', {}, box()!);
    await vi.advanceTimersByTimeAsync(19000);
    expect(arrival.open).toBe(true);
    await vi.advanceTimersByTimeAsync(1100);
    expect(arrival.open).toBe(false);
  });

  it('ready() before GO does nothing', async () => {
    const { arrival } = await travel();
    arrival.ready();
    await vi.advanceTimersByTimeAsync(1600);
    expect(arrival.open).toBe(true);
  });

  it('keys in order: SUGGEST, BACK, GO (review I1)', async () => {
    await travel({ suggest: async () => 'x' });
    expect([...$('.ar-keys')!.children].map((c) => c.className.split(' ')[0])).toEqual(['ar-suggest', 'ar-back', 'ar-go']);
  });

  it('once GO is sent, BACK and SUGGEST wait: the move is already on its way (review I2)', async () => {
    const suggest = vi.fn(async () => 'late');
    const { arrival } = await travel({ suggest });
    const back = vi.fn();
    arrival.onBack(back);
    arrival.onSend(() => {});
    key('Enter', {}, box()!);
    key('Escape', {}, box()!);
    $('.ar-back')!.click();
    key('g', { altKey: true }, box()!);
    expect(back).not.toHaveBeenCalled();
    expect(suggest).not.toHaveBeenCalled();
    expect(arrival.open).toBe(true);
    expect(($('.ar-back') as HTMLButtonElement).disabled).toBe(true);
    arrival.notice('wait for her to finish');
    expect(($('.ar-back') as HTMLButtonElement).disabled).toBe(false);
    key('Escape', {}, box()!);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('Esc is BACK: it closes and fires onBack, never onSend', async () => {
    const { arrival } = await travel();
    const back = vi.fn();
    const sent = vi.fn();
    arrival.onBack(back);
    arrival.onSend(sent);
    key('Escape', {}, box()!);
    expect(back).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
    expect(arrival.open).toBe(false);
  });

  it('BACK by click', async () => {
    const { arrival } = await travel();
    const back = vi.fn();
    arrival.onBack(back);
    $('.ar-back')!.click();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('a district that never comes still shows the place, with no art, and stays up', async () => {
    const preload = vi.fn();
    const { arrival } = make(null, { travel: TRAVEL, preload });
    await flush();
    await vi.advanceTimersByTimeAsync(9000);
    expect(arrival.open).toBe(true);
    expect($('.ar-root')!.classList.contains('ar-no-art')).toBe(true);
    expect($('.ar-name')!.textContent).toBe('THE LOW ROLLER');
  });

  it('on comms the route still shows; setWith says she is on the line', async () => {
    const { arrival } = make(KARASU, { travel: { ...TRAVEL, comms: true } });
    await flush();
    arrival.setWith('NIX ON THE LINE');
    expect($('.ar-with')!.textContent).toBe('NIX ON THE LINE');
  });
});
