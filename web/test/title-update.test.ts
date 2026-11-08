import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateInfo, UpdateStatus } from '../../shared/update';
import { UPDATE_POLL_MS, mountTitle, type TitleUpdate } from '../src/landing/title';
import type { PlaythroughApi } from '../src/net/playthroughs';

const NOW = Date.UTC(2026, 10, 8, 22, 0, 0);

/** No playthrough yet: the band is NEW GAME, REPORT A BUG, and UPDATE when there is one. */
const api = {
  listPlaythroughs: vi.fn(async () => ({ active: null, playthroughs: [] })),
  contacts: vi.fn(async () => []),
  persona: vi.fn(async () => null),
  setLocation: vi.fn(),
  around: vi.fn(async () => []),
} as unknown as PlaythroughApi;

const status = (o: Partial<UpdateStatus> = {}): UpdateStatus => ({
  available: true,
  behind: 3,
  newestAt: Date.UTC(2026, 10, 8, 10),
  areas: { characters: 1, rooms: 0, world: 0, code: 2 },
  needsPackages: false,
  canApply: true,
  ...o,
});

function fakeUpdate(info: UpdateInfo, o: Partial<TitleUpdate> = {}) {
  return { status: vi.fn(async () => info), start: vi.fn(async () => {}), reload: vi.fn(), ...o };
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const tiles = () => [...document.querySelectorAll<HTMLElement>('.title-menu .tile')].map((t) => t.dataset.id);
const focused = () => document.querySelector<HTMLElement>('.title-menu .tile.on')?.dataset.id;
const text = (sel: string) => document.querySelector(`.title-menu ${sel}`)?.textContent ?? null;
const facts = (side: 'p1' | 'p2') =>
  Object.fromEntries([...document.querySelectorAll(`.title-menu .fighter.${side} .fighter-file dt`)].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));
const fileText = (side: 'p1' | 'p2') => document.querySelector(`.title-menu .fighter.${side} .fighter-file`)?.textContent ?? '';

const handles: { destroy(): void }[] = [];
async function mount(update?: TitleUpdate) {
  document.body.innerHTML = '<div id="root"></div>';
  const deps = { api, nav: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onReport: vi.fn(), sound: vi.fn(), agents: () => new Map(), backdrop: vi.fn(), reducedMotion: false, update };
  handles.push(mountTitle(document.getElementById('root')!, deps));
  await vi.advanceTimersByTimeAsync(0);
  return deps;
}
/** NEW GAME → REPORT A BUG → UPDATE. */
const toUpdate = () => {
  key('ArrowRight');
  key('ArrowRight');
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
  vi.useRealTimers();
});

describe('UPDATE on the title', () => {
  it('has no tile without the update deps, outside a public clone, or with nothing new', async () => {
    await mount();
    expect(tiles()).toEqual(['new', 'report']);
    await mount(fakeUpdate({ eligible: false }));
    expect(tiles()).toEqual(['new', 'report']);
    await mount(fakeUpdate({ eligible: true, status: status({ available: false }), last: null }));
    expect(tiles()).toEqual(['new', 'report']);
  });

  it('adds a last tile tagged NEW, whose card counts the changes', async () => {
    await mount(fakeUpdate({ eligible: true, status: status(), last: null }));
    expect(tiles()).toEqual(['new', 'report', 'update']);
    expect(document.querySelector('.tile[data-id="update"] .band-tag')?.textContent).toBe('NEW');
    toUpdate();
    expect(focused()).toBe('update');
    expect(text('.title-logo')).toBe('UPDATE');
    expect(text('.title-under')).toBe('UPDATE AVAILABLE · 3 CHANGES');
    expect(fileText('p1')).toContain('3 changes · newest Nov 8');
    expect(facts('p1')).toEqual({ CHARACTERS: '1 file', CODE: '2 files' });
    expect(fileText('p2')).toContain('The game closes, updates and opens again');
    expect(fileText('p2')).not.toContain('New packages');
    expect(text('.title-hints')).toContain('[ENTER] UPDATE');
  });

  it('says when packages come too', async () => {
    await mount(fakeUpdate({ eligible: true, status: status({ needsPackages: true }), last: null }));
    toUpdate();
    expect(fileText('p2')).toContain('New packages too');
  });

  it('explains each reason it can’t update, and Enter does nothing then', async () => {
    const cases: [Partial<UpdateStatus>, string][] = [
      [{ canApply: false, reason: 'launcher' }, 'npm run play'],
      [{ canApply: false, reason: 'local-edits', files: ['a.md', 'b.md', 'c.md', 'd.md'] }, 'a.md · b.md · c.md · +1 more'],
      [{ canApply: false, reason: 'diverged' }, 'commits of its own'],
    ];
    for (const [o, says] of cases) {
      const up = fakeUpdate({ eligible: true, status: status(o), last: null });
      const deps = await mount(up);
      toUpdate();
      expect(fileText('p2')).toContain(says);
      expect(text('.title-hints')).not.toContain('ENTER');
      deps.sound.mockClear();
      key('Enter');
      expect(up.start).not.toHaveBeenCalled();
      expect(deps.sound).not.toHaveBeenCalled();
      handles.splice(0).forEach((h) => h.destroy());
    }
  });

  it('on Enter asks the game to update, waits for it to come back, then reloads', async () => {
    let info: UpdateInfo = { eligible: true, status: status(), last: null };
    const statusFn = vi.fn(async (): Promise<UpdateInfo> => info);
    const up = fakeUpdate(info, { status: statusFn });
    await mount(up);
    toUpdate();
    key('Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(up.start).toHaveBeenCalledTimes(1);
    expect(text('.jack-in')).toBe('UPDATING');
    // The game is down: calls fail, the tab keeps waiting.
    statusFn.mockImplementation(async () => {
      throw new Error('fetch failed');
    });
    await vi.advanceTimersByTimeAsync(UPDATE_POLL_MS * 3);
    expect(up.reload).not.toHaveBeenCalled();
    expect(text('.title-under')).toMatch(/^KEEP THIS TAB OPEN · 0:0\d$/);
    // Back, with the launcher's note from after the press.
    info = { eligible: true, status: status({ available: false }), last: { ok: true, from: 'a', to: 'b', at: Date.now() } };
    statusFn.mockImplementation(async () => info);
    await vi.advanceTimersByTimeAsync(UPDATE_POLL_MS);
    expect(up.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads on a new result even when the launcher’s clock is behind this tab’s', async () => {
    const old = { ok: true, from: 'x', to: 'a', at: NOW - 3_600_000 };
    let info: UpdateInfo = { eligible: true, status: status(), last: old };
    const statusFn = vi.fn(async (): Promise<UpdateInfo> => info);
    const up = fakeUpdate(info, { status: statusFn });
    await mount(up);
    toUpdate();
    key('Enter');
    await vi.advanceTimersByTimeAsync(UPDATE_POLL_MS);
    expect(up.reload).not.toHaveBeenCalled();
    // Stamped ten minutes before the press by a slow clock: still the new one.
    info = { eligible: true, status: status({ available: false }), last: { ok: true, from: 'a', to: 'b', at: NOW - 600_000 } };
    await vi.advanceTimersByTimeAsync(UPDATE_POLL_MS);
    expect(up.reload).toHaveBeenCalledTimes(1);
  });

  it('shows a later error in red after the green UPDATED', async () => {
    const info: UpdateInfo = { eligible: true, status: status(), last: { ok: true, from: 'a', to: 'abcdef1234567', at: NOW - 10_000 } };
    await mount(fakeUpdate(info, { start: vi.fn(async () => Promise.reject(new Error('origin'))) }));
    expect(document.querySelector('.title-error')?.classList.contains('ok')).toBe(true);
    toUpdate();
    key('Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(text('.title-error')).toBe("// COULDN'T UPDATE — origin");
    expect(document.querySelector('.title-error')?.classList.contains('ok')).toBe(false);
  });

  it('shows why when the game refuses the press, and the band works again', async () => {
    const up = fakeUpdate({ eligible: true, status: status(), last: null }, { start: vi.fn(async () => Promise.reject(new Error('launcher'))) });
    await mount(up);
    toUpdate();
    key('Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(text('.title-error')).toBe("// COULDN'T UPDATE — launcher");
    expect(text('.jack-in')).toBe('JACK IN');
    key('ArrowLeft');
    expect(focused()).toBe('report');
  });

  it('announces a fresh result once', async () => {
    const info: UpdateInfo = { eligible: true, status: status({ available: false }), last: { ok: true, from: 'a', to: 'abcdef1234567', at: NOW - 10_000 } };
    await mount(fakeUpdate(info));
    expect(text('.title-error')).toBe('UPDATED · abcdef12');
    expect(document.querySelector('.title-error')?.classList.contains('ok')).toBe(true);
    handles.splice(0).forEach((h) => h.destroy());
    await mount(fakeUpdate(info));
    expect(text('.title-error')).toBe('');
  });

  it('announces a failed one in red', async () => {
    await mount(fakeUpdate({ eligible: true, status: status({ available: false }), last: { ok: false, from: 'a', to: 'a', at: NOW - 10_000, error: 'npm ci failed' } }));
    expect(text('.title-error')).toBe('// UPDATE FAILED — npm ci failed');
    expect(document.querySelector('.title-error')?.classList.contains('ok')).toBe(false);
  });
});
