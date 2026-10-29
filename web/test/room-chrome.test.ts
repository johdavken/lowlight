import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContactEntry } from '../../shared/types';
import { connectSocket } from '../src/net/socket';
import { ApiError, saveNow } from '../src/net/playthroughs';
import { chromeKey, listenChromeKeys, worldChangedPath } from '../src/room/identity';
import { openSavePrompt, saveFailure } from '../src/room/save-prompt';
import { mountInput } from '../src/ui/input';
import { Hud } from '../src/ui/hud';

const contact = (o: Partial<ContactEntry> & { id: string; name: string }): ContactEntry => ({
  accent: '#ff4f8b',
  portrait: `/api/agents/${o.id}/avatar`,
  status: 'met',
  sceneId: `ribbon/${o.id}-room`,
  placeName: `${o.name}'s room`,
  timeOfDay: 'night',
  lastLine: null,
  ...o,
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (target: EventTarget, k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

const huds: Hud[] = [];

afterEach(() => {
  while (huds.length > 0) huds.pop()!.dispose();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('room chrome: HUD buttons', () => {
  function hud() {
    const root = document.createElement('div');
    document.body.append(root);
    const h = new Hud(root);
    huds.push(h);
    return { root, h };
  }

  it('SAVE while busy shows WAIT FOR NIX and does not open', () => {
    const { root, h } = hud();
    const open = vi.fn();
    h.setSave(open);
    const save = root.querySelector<HTMLElement>('.sys-row[data-row="save"]')!;
    expect(save.hidden).toBe(false);
    expect(save.querySelector('.sys-value')!.textContent).toBe('ALT+S');

    h.setSaveBusy('Nix');
    expect(save.querySelector('.sys-value')!.textContent).toBe('WAIT FOR NIX');
    save.click();
    h.pressSave(); // the S hotkey
    expect(open).not.toHaveBeenCalled();

    h.setSaveBusy(null);
    expect(save.querySelector('.sys-value')!.textContent).toBe('ALT+S');
    save.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('PEOPLE comes before MAP; TITLE is the back link before the scene, and there is only one', () => {
    const { root, h } = hud();
    const contacts = vi.fn();
    const title = vi.fn();
    h.setMapLink(() => {});
    h.setSave(() => {});
    h.setPeople(contacts);
    h.setBackLink(title);
    const order = [...root.querySelectorAll('.hud-right > span')].map((s) => s.className.split(' ')[0]);
    expect(order.indexOf('hud-people')).toBeLessThan(order.indexOf('hud-map'));
    expect(root.querySelector('.hud-title')).toBeNull();
    const back = root.querySelector<HTMLElement>('.hud-left > .hud-back')!;
    expect(back.textContent).toBe('‹');
    expect([...root.querySelectorAll<HTMLElement>('.hud-bar span')].filter((s) => s.title === 'Title (Alt+T)')).toHaveLength(1);
    root.querySelector<HTMLElement>('.hud-people')!.click();
    key(back, 'Enter');
    expect(contacts).toHaveBeenCalledTimes(1);
    expect(title).toHaveBeenCalledTimes(1);
  });
});

describe('room chrome: save card', () => {
  it('save prompt prefilled, Enter calls save with edited name', async () => {
    const save = vi.fn(async () => {});
    openSavePrompt(document.body, { defaultName: "Nix's apartment, night", save });
    const field = document.querySelector<HTMLInputElement>('.save-card input')!;
    expect(field.value).toBe("Nix's apartment, night");
    expect(document.activeElement).toBe(field);
    expect(document.querySelector('.save-card')!.textContent).toContain('[ENTER] SAVE · [ESC] CANCEL');

    field.value = 'before I told Nix';
    key(field, 'Enter');
    expect(save).toHaveBeenCalledWith('before I told Nix');
    await flush();
    expect(document.querySelector('.save-card')).toBeNull();
  });

  it('Esc cancels without saving and does not reach the room', () => {
    const save = vi.fn(async () => {});
    const onClose = vi.fn();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    openSavePrompt(document.body, { defaultName: 'x', save, onClose });
    key(document.querySelector('.save-card input')!, 'Escape');
    window.removeEventListener('keydown', room);
    expect(save).not.toHaveBeenCalled();
    expect(room).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.save-card')).toBeNull();
  });

  it('Esc cancels even after focus has left the field, and goes no further', () => {
    const save = vi.fn(async () => {});
    const onClose = vi.fn();
    const room = vi.fn();
    window.addEventListener('keydown', room);
    openSavePrompt(document.body, { defaultName: 'x', save, onClose });
    (document.activeElement as HTMLElement).blur();
    key(document.body, 'Escape');
    window.removeEventListener('keydown', room);
    expect(room).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.save-card')).toBeNull();
    key(document.body, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click away cancels, like Esc; a click inside does not; not while it saves', async () => {
    let finish: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const onClose = vi.fn();
    openSavePrompt(document.body, { defaultName: 'x', save, onClose });
    const box = document.querySelector('.save-card')!;
    box.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.save-card')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.save-card')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    openSavePrompt(document.body, { defaultName: 'x', save, onClose });
    key(document.querySelector('.save-card input')!, 'Enter');
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('.save-card')).not.toBeNull();
    finish();
    await flush();
    expect(document.querySelector('.save-card')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a refused name keeps the prompt open with the error inline', async () => {
    const save = vi.fn(async () => {
      throw new Error('// NAME IT — 1 TO 80 CHARACTERS');
    });
    openSavePrompt(document.body, { defaultName: 'x', save });
    const field = document.querySelector<HTMLInputElement>('.save-card input')!;
    field.value = '   ';
    key(field, 'Enter');
    await flush();
    expect(document.querySelector('.save-card')).not.toBeNull();
    expect(document.querySelector('.save-card .error')!.textContent).toBe('// NAME IT — 1 TO 80 CHARACTERS');
  });
  const SNAP = { picture: '/scenes/karasu/the-tilt/room.png', place: 'The Tilt', time: 'late', withName: 'Cass', withAccent: '#ff8a3c' };

  it('shows the room picture and PLACE · TIME · WITH NAME', () => {
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}), snapshot: SNAP, reducedMotion: true });
    expect(document.querySelector('.save-card .sc-picture')!.getAttribute('src')).toBe('/scenes/karasu/the-tilt/room.png');
    const line = document.querySelector<HTMLElement>('.save-card .sc-line')!;
    expect(line.textContent).toBe('THE TILT · LATE · WITH CASS');
    expect(line.querySelector<HTMLElement>('.sc-with')!.style.color).toBe('rgb(255, 138, 60)');
  });

  it('no time: PLACE · WITH NAME', () => {
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}), snapshot: { ...SNAP, time: null }, reducedMotion: true });
    expect(document.querySelector('.save-card .sc-line')!.textContent).toBe('THE TILT · WITH CASS');
  });

  it('a picture that fails is hidden, and none at all shows no picture', () => {
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}), snapshot: SNAP, reducedMotion: true });
    document.querySelector('.sc-picture')!.dispatchEvent(new Event('error'));
    expect(document.querySelector('.sc-picture')).toBeNull();
    document.body.replaceChildren();
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}), snapshot: { ...SNAP, picture: null }, reducedMotion: true });
    expect(document.querySelector('.sc-picture')).toBeNull();
    expect(document.querySelector('.sc-line')).not.toBeNull();
  });

  it('without a snapshot it is just the title, the field and the hint', () => {
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}) });
    expect(document.querySelector('.sc-picture')).toBeNull();
    expect(document.querySelector('.sc-line')).toBeNull();
    expect(document.querySelector('.save-card .sc-title')!.textContent).toBe('SAVE');
  });

  it('glitches in unless reduced motion', () => {
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}) });
    expect(document.querySelector('.save-card')!.classList.contains('sc-glitch-in')).toBe(true);
    document.body.replaceChildren();
    openSavePrompt(document.body, { defaultName: 'x', save: vi.fn(async () => {}), reducedMotion: true });
    expect(document.querySelector('.save-card')!.classList.contains('sc-glitch-in')).toBe(false);
  });
});


describe('room chrome: navigation', () => {
  it('world-changed navigates to the new contact', () => {
    expect(worldChangedPath({ contactId: 'cass', sceneId: 'ribbon/ribbon-rooftop' })).toBe('/room/cass');
    expect(worldChangedPath(null)).toBe('/');
  });

  it('Alt+S, Alt+C and Alt+T only, with no other modifier and no modal open', () => {
    const k = (o: KeyboardEventInit) => new KeyboardEvent('keydown', o);
    expect(chromeKey(k({ key: 's', code: 'KeyS', altKey: true }), false)).toBe('save');
    // Alt+letter types a symbol on some layouts (ß on macOS): the physical key counts.
    expect(chromeKey(k({ key: 'ç', code: 'KeyC', altKey: true }), false)).toBe('contacts');
    expect(chromeKey(k({ key: '†', code: 'KeyT', altKey: true }), false)).toBe('title');
    expect(chromeKey(k({ key: '¬', code: 'KeyL', altKey: true }), false)).toBe('leads');
    expect(chromeKey(k({ key: '←', code: 'KeyY', altKey: true }), false)).toBe('you');
    // Alt+P opens PEOPLE (its last tab); Alt+J, Alt+C and Alt+L open it on their tab; a plain j still types.
    expect(chromeKey(k({ key: 'π', code: 'KeyP', altKey: true }), false)).toBe('people');
    expect(chromeKey(k({ key: '∆', code: 'KeyJ', altKey: true }), false)).toBe('journal');
    expect(chromeKey(k({ key: 'j', code: 'KeyJ' }), false)).toBeNull();
    expect(chromeKey(k({ key: 's', code: 'KeyS' }), false)).toBeNull();
    expect(chromeKey(k({ key: 'x', code: 'KeyX', altKey: true }), false)).toBeNull();
    expect(chromeKey(k({ key: 's', code: 'KeyS', altKey: true }), true)).toBeNull();
    expect(chromeKey(k({ key: 's', code: 'KeyS', altKey: true, ctrlKey: true }), false)).toBeNull();
    expect(chromeKey(k({ key: 't', code: 'KeyT', altKey: true, metaKey: true }), false)).toBeNull();
  });

  it('Alt+S with the chat prompt focused opens the save prompt; plain s typed into it does not', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountInput(host, () => {});
    const prompt = host.querySelector('textarea')!;
    expect(document.activeElement).toBe(prompt);
    const run = vi.fn();
    let modal = false;
    const stop = listenChromeKeys(window, { modalOpen: () => modal, run });

    const plain = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true, cancelable: true });
    prompt.dispatchEvent(plain);
    expect(run).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(false);

    const alt = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true });
    prompt.dispatchEvent(alt);
    expect(run).toHaveBeenCalledWith('save');
    expect(alt.defaultPrevented).toBe(true);

    modal = true; // the save prompt (or contacts, map, journal, recap) is up
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', altKey: true, bubbles: true, cancelable: true }));
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('save errors: no-playthrough or not-active leaves, busy is a notice, a bad name stays inline', () => {
    const waitFor = (c?: string) => `Wait for ${c ?? 'her'} to finish`;
    expect(saveFailure(new ApiError(409, 'no-playthrough'), waitFor)).toEqual({ leave: '/' });
    expect(saveFailure(new ApiError(409, 'busy', 'cass'), waitFor)).toEqual({ notice: 'Wait for cass to finish' });
    expect(saveFailure(new ApiError(400, 'bad-name'), waitFor)).toEqual({ inline: '// NAME IT — 1 TO 80 CHARACTERS' });
    expect(saveFailure(new ApiError(409, 'not-active'), waitFor)).toEqual({ leave: '/' });
    expect(saveFailure(new Error('offline'), waitFor)).toEqual({ inline: "// COULDN'T SAVE — offline" });
  });

  it('a SAVE from the room names its contact', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    try {
      await saveNow('pt-1', 'Here', 'cass');
      expect(fetch).toHaveBeenCalledWith('/api/playthroughs/pt-1/saves', expect.objectContaining({ method: 'POST' }));
      expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ name: 'Here', contactId: 'cass' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the chrome buttons name their Alt keys', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const h = new Hud(root);
    huds.push(h);
    h.setSave(() => {});
    h.setPeople(() => {});
    h.setBackLink(() => {});
    expect(root.querySelector<HTMLElement>('.sys-row[data-row="save"] .sys-value')!.textContent).toBe('ALT+S');
    expect(root.querySelector<HTMLElement>('.hud-people')!.title).toBe('People (Alt+P)');
    expect(root.querySelector<HTMLElement>('.hud-back')!.title).toBe('Title (Alt+T)');
  });

  it('a socket closed with 4410 or 4409 is not retried; the code is reported', async () => {
    vi.useFakeTimers();
    const socks: { onclose: ((ev: { code: number }) => void) | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 't' }) })));
    vi.stubGlobal(
      'WebSocket',
      class {
        onclose: ((ev: { code: number }) => void) | null = null;
        constructor() {
          socks.push(this);
        }
      },
    );
    for (const code of [4410, 4409]) {
      socks.length = 0;
      const refused = vi.fn();
      connectSocket('nix', null, () => {}, () => {}, refused);
      await vi.advanceTimersByTimeAsync(0);
      expect(socks).toHaveLength(1);
      socks[0].onclose!({ code });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(socks).toHaveLength(1);
      expect(refused).toHaveBeenCalledWith(code);
    }
  });
});
