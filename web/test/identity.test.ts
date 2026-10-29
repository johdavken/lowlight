import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { reloadOnRestore, worldChangedPath, routeFromPath, shouldReturnToDialIn, showRoomNotice, lastMatch, rememberMatch, playerFromSearch, setFlash, takeFlash, markSkipIntro, takeSkipIntro } from '../src/room/identity';
import { Feed } from '../src/ui/feed';
import { Hud } from '../src/ui/hud';
import { mountInput } from '../src/ui/input';
import type { ChatMessage } from '../../shared/types';

const msg = (o: Partial<ChatMessage> & { id: string }): ChatMessage => ({ role: 'agent', text: 'x', toolLines: [], ts: 1, status: 'ok', ...o });

describe('routeFromPath', () => {
  it('maps /, /room/<id> and bare /room', () => {
    expect(routeFromPath('/', null)).toEqual({ kind: 'landing' });
    expect(routeFromPath('/room/dixie', null)).toEqual({ kind: 'room', id: 'dixie' });
    expect(routeFromPath('/room', 'nix')).toEqual({ kind: 'room', id: 'nix' });
    expect(routeFromPath('/room', null)).toEqual({ kind: 'landing' });
    expect(routeFromPath('/room/Bad%20Id', null)).toEqual({ kind: 'landing' });
  });
  it('/deck routes to the deck (deck spec §6)', () => {
    expect(routeFromPath('/deck', null)).toEqual({ kind: 'deck' });
    expect(routeFromPath('/deck/', 'nix')).toEqual({ kind: 'deck' });
  });
});

describe('playerFromSearch', () => {
  it('a valid id, a missing one, and an invalid one', () => {
    expect(playerFromSearch('?as=cass')).toBe('cass');
    expect(playerFromSearch('')).toBeNull();
    expect(playerFromSearch('?foo=bar')).toBeNull();
    expect(playerFromSearch('?as=Bad%20Id')).toBeNull();
  });
});

describe('agent identity in the room', () => {
  it("the feed labels the agent's messages with her name, including ones already shown", () => {
    document.body.innerHTML = '<div id="f"></div>';
    const feed = new Feed(document.getElementById('f')!, () => {});
    feed.upsert(msg({ id: 'a1' }));
    feed.setAgentName('Dixie');
    feed.upsert(msg({ id: 'a2' }));
    const names = [...document.querySelectorAll('.msg.agent .name')].map((n) => n.textContent);
    expect(names).toEqual(['DIXIE', 'DIXIE']);
  });

  it('the feed switches avatar style by portrait kind', () => {
    document.body.innerHTML = '<div id="f"></div>';
    const root = document.getElementById('f')!;
    const feed = new Feed(root, () => {});
    feed.setPortrait('/api/agents/dixie/avatar', 'mask', 'Dixie');
    expect(root.classList.contains('portrait-monogram')).toBe(false);
    feed.setPortrait('/api/agents/beta/avatar', 'monogram', 'Beta');
    expect(root.classList.contains('portrait-monogram')).toBe(true);
    expect(root.style.getPropertyValue('--monogram')).toBe('"B"');
  });

  it("the input's label and busy text use her name", () => {
    document.body.innerHTML = '<div id="i"></div>';
    const handle = mountInput(document.getElementById('i')!, () => {});
    handle.setAgentName('Dixie');
    expect(document.querySelector('textarea')!.getAttribute('aria-label')).toBe('Message Dixie');
    handle.setBusy(true);
    expect(document.querySelector('.hint')!.textContent).toBe('// DIXIE IS TRANSMITTING');
  });

  it('the HUD has a ‹ link back to the title', () => {
    document.body.innerHTML = '<div id="h"></div>';
    const hud = new Hud(document.getElementById('h')!);
    const nav = vi.fn();
    hud.setBackLink(nav);
    const link = document.querySelector('.hud-back') as HTMLElement;
    expect(link.textContent).toBe('‹');
    expect(link.title).toBe('Title (Alt+T)');
    link.click();
    expect(nav).toHaveBeenCalled();
    hud.dispose();
  });

  it('Esc returns to the dial-in only with the feed collapsed and the dev panel closed', () => {
    const esc = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(shouldReturnToDialIn(esc, { feedExpanded: false, devPanelOpen: false, journalOpen: false })).toBe(true);
    expect(shouldReturnToDialIn(esc, { feedExpanded: true, devPanelOpen: false, journalOpen: false })).toBe(false);
    expect(shouldReturnToDialIn(esc, { feedExpanded: false, devPanelOpen: true, journalOpen: false })).toBe(false);
    expect(shouldReturnToDialIn(esc, { feedExpanded: false, devPanelOpen: false, journalOpen: true })).toBe(false);
    expect(shouldReturnToDialIn(new KeyboardEvent('keydown', { key: 'a' }), { feedExpanded: false, devPanelOpen: false, journalOpen: false })).toBe(false);
  });

  it('Escape that already closed something (the archive collapsing first) stays in the room', () => {
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    esc.preventDefault();
    expect(shouldReturnToDialIn(esc, { feedExpanded: false, devPanelOpen: false, journalOpen: false })).toBe(false);
  });

  it('an unconnected room says so instead of a dead room: no command, back link', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'dixie', name: 'Dixie', reason: 'not-connected' });
    expect(document.querySelector('.notice-title')!.textContent).toBe('// NOT CONNECTED');
    expect(document.querySelector('.notice-body')!.textContent).toBe("Dixie isn't connected to the room. The file at select says why.");
    expect(document.querySelector('.notice-cmd')).toBeNull();
    expect(document.querySelector('a.notice-back')!.getAttribute('href')).toBe('/');
  });

  it('an unknown id: no such character', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'zed', name: 'zed', reason: 'unknown' });
    expect(document.querySelector('.notice-title')!.textContent).toBe('// NO SUCH CHARACTER');
    expect(document.querySelector('.notice-body')!.textContent).toBe('There is no character called "zed".');
  });

  it('no-link notice: title, the relink line, no command, back link', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'nix', name: 'Nix', reason: 'no-link' });
    expect(document.querySelector('.notice-title')!.textContent).toBe('// NO LINK');
    expect(document.querySelector('.notice-body')!.textContent).toBe('Relink at select (TITLE → contact).');
    expect(document.querySelector('.notice-cmd')).toBeNull();
    expect(document.querySelector('a.notice-back')!.getAttribute('href')).toBe('/');
  });

  it('key-rejected: the relink line, no command', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'nix', name: 'Nix', reason: 'key-rejected' });
    expect(document.querySelector('.notice-title')!.textContent).toBe('// KEY REJECTED');
    expect(document.querySelector('.notice-body')!.textContent).toBe('Relink at select (TITLE → contact).');
    expect(document.querySelector('.notice-cmd')).toBeNull();
  });

  it('only one notice at a time', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'nix', name: 'Nix', reason: 'no-link' });
    showRoomNotice(document.body, { id: 'nix', name: 'Nix', reason: 'no-link' });
    expect(document.querySelectorAll('.room-notice')).toHaveLength(1);
  });

  it('no-mind notice: title, body, no command, back link', () => {
    document.body.innerHTML = '';
    showRoomNotice(document.body, { id: 'hicks', name: 'Hicks', reason: 'no-mind' });
    expect(document.querySelector('.notice-title')!.textContent).toBe('// NO MIND ATTACHED');
    expect(document.querySelector('.notice-body')!.textContent).toBe('Hicks is a character you can play as, not one you can talk to.');
    expect(document.querySelector('.notice-cmd')).toBeNull();
    expect(document.querySelector('a.notice-back')!.getAttribute('href')).toBe('/');
  });
});

describe('setFlash / takeFlash', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('the flash is taken once', () => {
    setFlash('// BRANCHED — Night one — branch');
    expect(takeFlash()).toBe('// BRANCHED — Night one — branch');
    expect(takeFlash()).toBeNull();
  });

  it('the flash survives a throwing storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => setFlash('x', broken)).not.toThrow();
    expect(takeFlash(broken)).toBeNull();
  });
});

describe('lastMatch / rememberMatch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rememberMatch / lastMatch round-trip (her model is a server setting now, not part of the match)', () => {
    rememberMatch({ player: 'hicks', ai: 'nix' });
    expect(lastMatch()).toEqual({ player: 'hicks', ai: 'nix' });
  });

  it('a match stored before (with a model) still reads, without it', () => {
    localStorage.setItem('lowlight.lastMatch', '{"player":"hicks","ai":"nix","model":"z-ai/glm-5.2"}');
    expect(lastMatch()).toEqual({ player: 'hicks', ai: 'nix' });
  });

  it.each([
    ['missing', null],
    ['not JSON', '{nope'],
    ['wrong shape', '{"player":1}'],
    ['bad id', '{"player":"Bad Id","ai":"nix","model":null}'],
  ])('lastMatch with %s storage → null', (_desc, storedValue) => {
    if (storedValue !== null) {
      localStorage.setItem('lowlight.lastMatch', storedValue);
    }
    expect(lastMatch()).toBeNull();
  });

  it('storage that throws → lastMatch null, rememberMatch silent', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(lastMatch()).toBeNull();
    expect(() => rememberMatch({ player: 'hicks', ai: 'nix' })).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});

describe('worldChangedPath', () => {
  it("goes to the new location's room, the solo screen when solo, else the title (final review 2)", () => {
    expect(worldChangedPath({ contactId: 'nix', sceneId: 'x' })).toBe('/room/nix');
    expect(worldChangedPath({ contactId: 'nix', sceneId: 'x' }, true)).toBe('/solo');
    expect(worldChangedPath(null)).toBe('/');
  });
});

describe('routeFromPath /solo', () => {
  it('is the solo screen, with or without a slash', () => {
    expect(routeFromPath('/solo', 'nix')).toEqual({ kind: 'solo' });
    expect(routeFromPath('/solo/', null)).toEqual({ kind: 'solo' });
  });
});

describe('reloadOnRestore', () => {
  it('reloads a page the browser brought back from its cache (Back from /solo), not a fresh one', () => {
    const reload = vi.fn();
    reloadOnRestore(window, reload);
    const show = (persisted: boolean) => {
      const e = new Event('pageshow') as Event & { persisted: boolean };
      Object.defineProperty(e, 'persisted', { value: persisted });
      window.dispatchEvent(e);
    };
    show(false);
    expect(reload).not.toHaveBeenCalled();
    show(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('district screen skip flag', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('skip flag is taken once', () => {
    const s = mem();
    markSkipIntro(s);
    expect(takeSkipIntro(s)).toBe(true);
    expect(takeSkipIntro(s)).toBe(false);
  });

  it('skip flag goes stale after 30 s (a reload that never loaded)', () => {
    const s = mem();
    markSkipIntro(s, 1000);
    expect(takeSkipIntro(s, 1000 + 31_000)).toBe(false);
    markSkipIntro(s, 1000);
    expect(takeSkipIntro(s, 1000 + 29_000)).toBe(true);
  });

  it('skip flag survives a throwing storage', () => {
    expect(
      takeSkipIntro({
        getItem() {
          throw new Error('blocked');
        },
        removeItem() {},
      }),
    ).toBe(false);
    expect(() =>
      markSkipIntro({
        setItem() {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
