import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaythroughInfo, SaveInfo } from '../../shared/types';
import { mountLoad } from '../src/landing/load';
import { JACK_MS } from '../src/landing/title';
import type { LandingAgent } from '../src/landing/landing';
import { ApiError, type PlaythroughApi } from '../src/net/playthroughs';

const NOW = Date.UTC(2026, 9, 7, 22, 0, 0);
const HOUR = 3_600_000;

const playthrough = (o: Partial<PlaythroughInfo> = {}): PlaythroughInfo => ({
  id: 'pt-1',
  name: 'Hicks — Oct 7',
  player: 'hicks',
  startContact: 'nix',
  createdAt: NOW - 5 * HOUR,
  updatedAt: NOW - 2 * HOUR,
  forkedFrom: null,
  location: { contactId: 'nix', sceneId: 'ribbon/nix-apartment' },
  ...o,
});
const save = (o: Partial<SaveInfo> & { id: string }): SaveInfo => ({
  playthrough: 'pt-1',
  kind: 'checkpoint',
  trigger: 'end',
  name: 'Talk with Cass ended',
  at: NOW - 4 * HOUR,
  location: { contactId: 'cass', sceneId: 'ribbon/ribbon-rooftop' },
  timeOfDay: 'dusk',
  participants: ['cass'],
  lastLine: { speaker: 'Cass', text: "Don't make it weird." },
  fingerprint: {},
  ...o,
});

const active = playthrough();
const truth = playthrough({
  id: 'pt-2',
  name: 'The truth route',
  updatedAt: NOW - 24 * HOUR,
  forkedFrom: { playthrough: 'pt-1', save: 's-man', name: 'before I told Nix' },
  location: null,
  startContact: 'cass',
});
const old = playthrough({ id: 'pt-3', name: 'Imported — hicks', updatedAt: NOW - 120 * HOUR });
const saves: SaveInfo[] = [
  save({ id: 's-end', kind: 'checkpoint', trigger: 'end', at: NOW - 4 * HOUR }),
  save({
    id: 's-travel',
    trigger: 'travel',
    name: "Left noodle stall → Nix's apartment",
    at: NOW - 2 * HOUR,
    location: { contactId: 'hae', sceneId: 'ribbon/noodle-stall' },
    timeOfDay: 'night',
    lastLine: { speaker: 'Hae', text: 'You came back.' },
  }),
  save({
    id: 's-man',
    kind: 'manual',
    trigger: 'manual',
    name: 'before I told Nix the truth',
    at: NOW - 3 * HOUR,
    location: { contactId: 'nix', sceneId: 'ribbon/noodle-stall' },
    timeOfDay: 'dusk',
    lastLine: { speaker: 'Nix', text: 'Say it, then.' },
  }),
];

function fakeApi() {
  return {
    // Oldest first on purpose: the screen sorts.
    listPlaythroughs: vi.fn(async () => ({
      active: 'pt-1',
      playthroughs: [
        { ...old, contacts: null },
        { ...active, contacts: 3 },
        { ...truth, contacts: 1 },
      ],
    })),
    listSaves: vi.fn(async (id: string) => (id === 'pt-1' ? saves : [])),
    activate: vi.fn(async (id: string) => playthrough({ id })),
    loadSave: vi.fn(async () => playthrough({ id: 'pt-9', location: { contactId: 'nix', sceneId: 'ribbon/noodle-stall' } })),
    removeSave: vi.fn(async () => undefined),
    removePlaythrough: vi.fn(async () => undefined),
    rename: vi.fn(async (id: string, name: string) => playthrough({ id, name })),
    renameSave: vi.fn(async (id: string, name: string) => ({ ...saves.find((x) => x.id === id)!, name })),
  } as unknown as PlaythroughApi &
    Record<'listPlaythroughs' | 'listSaves' | 'activate' | 'loadSave' | 'removeSave' | 'removePlaythrough' | 'rename' | 'renameSave', ReturnType<typeof vi.fn>>;
}

const MAP = { places: [{ id: 'stall', name: 'Noodle stall', scene: 'ribbon/noodle-stall' }, { id: 'apt', name: "Nix's apartment", scene: 'ribbon/nix-apartment' }] };

function agent(id: string, name: string, extra: Partial<LandingAgent> = {}): LandingAgent {
  return {
    id, name, pronoun: 'she', start: null, description: '', accent: '#ff4f8b', avatarKind: 'monogram',
    rooms: [], startRoom: 'ribbon/x', legacyDistrict: null, group: null, connected: true, backend: 'direct', modelLabel: 'GLM 5.2',
    connectionError: null, sprite: { url: `/sprites/${id}.png` } as LandingAgent['sprite'], tagline: `${name} tagline`, bio: [],
    facts: [], face: { x: 0.5, y: 0.2 }, thumb: `/thumb/${id}`, link: 'ok', room: null, recaps: {}, ...extra,
  };
}
const agents = new Map<string, LandingAgent>([
  ['hicks', agent('hicks', 'Hicks')],
  ['nix', agent('nix', 'Nix')],
  ['cass', agent('cass', 'Cass', { sprite: null })],
  ['hae', agent('hae', 'Hae')],
]);

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const q = (sel: string) => document.querySelector<HTMLElement>(`.load-screen ${sel}`);
const t = (sel: string) => q(sel)?.textContent ?? null;
const pts = () => [...document.querySelectorAll<HTMLElement>('.load-screen .ld-pts .pt')];
const strips = () => [...document.querySelectorAll<HTMLElement>('.load-screen .ld-saves .ss')];
const ids = () => strips().map((x) => x.dataset.id);
const on = () => q('.ss.on')?.dataset.id;
const strip = (id: string) => q(`.ss[data-id="${id}"]`)!;
const under = () => t('.load-under');
const enterIn = (input: HTMLInputElement, k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const handles: { destroy(): void }[] = [];
async function mount(api = fakeApi()) {
  document.body.innerHTML = '<div id="root"></div>';
  const deps = { api, nav: vi.fn(), back: vi.fn(), sound: vi.fn(), agents: () => agents, reducedMotion: false };
  handles.push(mountLoad(document.getElementById('root')!, deps));
  await vi.advanceTimersByTimeAsync(0);
  return deps;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => MAP })));
});
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('load screen', () => {
  it('lists playthroughs on the left, newest first, ACTIVE chip, the active one selected with its buttons', async () => {
    await mount();
    expect(pts().map((p) => p.dataset.id)).toEqual(['pt-1', 'pt-2', 'pt-3']);
    expect(q('.ld-pts .pt.on')!.dataset.id).toBe('pt-1');
    expect(pts().map((p) => p.querySelector('.chip')?.textContent ?? null)).toEqual(['ACTIVE', null, null]);
    expect(pts().map((p) => p.querySelector('.pt-ago')!.textContent)).toEqual(['2h ago', '1d ago', '5d ago']);
    expect([...document.querySelectorAll('.ld-pts > .ld-acts .ld-btn')].map((b) => b.textContent)).toEqual(['✎ RENAME', '✕ DELETE']);
    expect(t('.ld-file')).toContain('1 save · 2 auto');
  });

  it('a fork and a branch say where they came from', async () => {
    const api = fakeApi();
    const branch = playthrough({
      id: 'pt-4',
      name: 'Night one — branch',
      createdAt: NOW - 3 * HOUR,
      updatedAt: NOW - HOUR,
      forkedFrom: { playthrough: 'pt-1', message: { contactId: 'nix', messageId: 'm1', excerpt: 'Hey there' }, name: 'Night one' },
    });
    api.listPlaythroughs.mockResolvedValueOnce({ active: 'pt-4', playthroughs: [{ ...branch, contacts: 1 }, { ...truth, contacts: 1 }] });
    await mount(api);
    // The age is when it was forked (createdAt), not when it was last played.
    expect(t('.ld-from')).toBe('branched from "Night one" · "Hey there" · 3h ago');
    key('ArrowRight');
    expect(t('.ld-from')).toBe('forked from "before I told Nix" · 5h ago');
  });

  it('the saves: NOW, then yours under SAVES, then the automatic ones under AUTO, each newest first', async () => {
    await mount();
    expect(ids()).toEqual(['now', 's-man', 's-travel', 's-end']);
    expect([...document.querySelectorAll('.ld-group')].map((g) => g.firstChild!.textContent)).toEqual(['SAVES', 'AUTO']);
    expect(on()).toBe('now');
    expect(strip('s-man').classList.contains('ss-small')).toBe(false);
    expect(strip('s-end').classList.contains('ss-small')).toBe(true);
  });

  it("each strip shows the save's name, its room, your face and theirs", async () => {
    await mount();
    expect(strip('s-man').querySelector('.ss-name')!.textContent).toBe('before I told Nix the truth');
    expect(strip('s-man').querySelector('.ss-kind')!.textContent).toBe('★ SAVE');
    expect((strip('s-man').querySelector('.ss-room') as HTMLElement).style.backgroundImage).toContain('/scenes/ribbon/noodle-stall/room.png');
    expect(strip('s-man').querySelector<HTMLImageElement>('.ss-face.ss-l')!.getAttribute('src')).toBe('/thumb/hicks');
    expect(strip('s-man').querySelector<HTMLImageElement>('.ss-face.ss-r')!.getAttribute('src')).toBe('/thumb/nix');
    // The speaker of the save's last line, else the contact it was saved with.
    expect(strip('s-travel').querySelector<HTMLImageElement>('.ss-face.ss-r')!.getAttribute('src')).toBe('/thumb/hae');
    expect(strip('now').querySelector('.ss-name')!.textContent).toBe('▶ NOW');
    expect(strip('now').querySelector('.ss-meta')!.textContent).toBe("Nix's apartment · 2h ago");
  });

  it('a solo save has no face on the right', async () => {
    const api = fakeApi();
    api.listSaves.mockResolvedValue([save({ id: 'alone', kind: 'manual', trigger: 'manual', solo: true, lastLine: null })]);
    await mount(api);
    expect(strip('alone').querySelector('.ss-face.ss-r')).toBeNull();
    expect(strip('alone').querySelector('.ss-face.ss-l')).not.toBeNull();
  });

  it("a save's meta has its story time; a trip reads FROM → TO when the older save was somewhere else", async () => {
    const api = fakeApi();
    api.listSaves.mockResolvedValue([
      save({ id: 'a', trigger: 'travel', at: NOW - HOUR, clock: 1500, location: { contactId: 'nix', sceneId: 'ribbon/nix-apartment' }, lastLine: { speaker: 'Nix', text: 'Upstairs.' } }),
      save({ id: 'b', trigger: 'manual', kind: 'manual', at: NOW - 2 * HOUR, location: { contactId: 'nix', sceneId: 'ribbon/noodle-stall' } }),
    ]);
    await mount(api);
    expect(strip('a').querySelector('.ss-meta')!.textContent).toBe("Noodle stall → Nix's apartment · Day 2 · Fri 01:00 · 1h ago");
  });

  it('places fall back to the scene folder when the map fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await mount();
    expect(strip('s-man').querySelector('.ss-meta')!.textContent).toContain('noodle stall');
  });

  it('↓↑ step the saves (with the move sound), clamped at NOW and the last', async () => {
    const deps = await mount();
    key('ArrowUp');
    expect(on()).toBe('now');
    key('ArrowDown');
    expect(on()).toBe('s-man');
    expect(deps.sound).toHaveBeenCalledWith('move');
    for (let i = 0; i < 6; i++) key('ArrowDown');
    expect(on()).toBe('s-end');
  });

  it('only the focused save carries RENAME and DELETE', async () => {
    await mount();
    expect(document.querySelectorAll('.ld-saves .ld-acts')).toHaveLength(0);
    key('ArrowDown');
    expect(strip('s-man').querySelector('.ld-acts')).not.toBeNull();
    expect(document.querySelectorAll('.ld-saves .ld-acts')).toHaveLength(1);
  });

  it('→ changes playthrough: its saves load, focus on NOW', async () => {
    const api = fakeApi();
    await mount(api);
    key('ArrowDown');
    key('ArrowRight');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.listSaves).toHaveBeenCalledWith('pt-2');
    expect(ids()).toEqual(['now']);
    expect(on()).toBe('now');
    expect(q('.ld-pts .pt.on')!.dataset.id).toBe('pt-2');
  });

  it('Enter on a save: FORK HERE, then loadSave and nav after JACK_MS', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    expect(deps.sound).toHaveBeenCalledWith('confirm');
    expect(t('.jack-in')).toBe('FORK HERE');
    expect(q('.jack-in')!.classList.contains('on')).toBe(true);
    expect(api.loadSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).toHaveBeenCalledWith('s-man');
    expect(deps.nav).toHaveBeenCalledWith('/room/nix');
  });

  it('Enter on NOW of a non-active playthrough: JACK IN, activate, then its room', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowRight');
    await vi.advanceTimersByTimeAsync(0);
    key('Enter');
    expect(t('.jack-in')).toBe('JACK IN');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.activate).toHaveBeenCalledWith('pt-2');
    expect(deps.nav).toHaveBeenCalledWith('/room/cass');
  });

  it('Enter on NOW of the active playthrough goes straight in', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.activate).not.toHaveBeenCalled();
    expect(deps.nav).toHaveBeenCalledWith('/room/nix');
  });

  it('a solo playthrough: NOW and a fork that comes back solo land on the solo screen', async () => {
    const api = fakeApi();
    api.loadSave.mockImplementation(async () => playthrough({ id: 'pt-9', solo: true }));
    let deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).toHaveBeenCalledWith('/solo');

    api.listPlaythroughs.mockImplementation(async () => ({ active: 'pt-1', playthroughs: [{ ...active, solo: true, contacts: 3 }] }));
    deps = await mount(api);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).toHaveBeenCalledWith('/solo');
  });

  it('busy: the wait hint, no nav; Enter twice calls loadSave once', async () => {
    const api = fakeApi();
    api.loadSave.mockRejectedValueOnce(new ApiError(409, 'busy', 'nix'));
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS * 2);
    expect(api.loadSave).toHaveBeenCalledTimes(1);
    expect(t('.load-hints')).toBe('Wait for Nix to finish');
    expect(deps.nav).not.toHaveBeenCalled();
    key('ArrowDown');
    expect(on()).toBe('s-travel');
  });

  it('Del on a save then Y removes it; N and Esc cancel', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowDown');
    key('ArrowDown');
    key('Delete');
    expect(under()).toBe(`DELETE "Left noodle stall → Nix's apartment"? Y/NYESNO`);
    key('n');
    expect(under()).toBe('');
    key('Delete');
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removeSave).toHaveBeenCalledWith('s-travel');
    expect(ids()).toEqual(['now', 's-man', 's-end']);
  });

  it('DELETE? has clickable YES and NO (review I2)', async () => {
    const api = fakeApi();
    await mount(api);
    key('ArrowDown');
    strip('s-man').querySelector<HTMLElement>('.ld-delete')!.click();
    q('.load-under .ld-no')!.click();
    expect(under()).toBe('');
    expect(api.removeSave).not.toHaveBeenCalled();
    strip('s-man').querySelector<HTMLElement>('.ld-delete')!.click();
    q('.load-under .ld-yes')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removeSave).toHaveBeenCalledWith('s-man');
  });

  it('the DELETE button on a save asks first; the one under the playthrough deletes the playthrough', async () => {
    const api = fakeApi();
    await mount(api);
    key('ArrowDown');
    strip('s-man').querySelector<HTMLElement>('.ld-delete')!.click();
    expect(under()).toBe('DELETE "before I told Nix the truth"? Y/NYESNO');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removeSave).toHaveBeenCalledWith('s-man');
    // Focus on a save, the playthrough's own button still names the playthrough.
    key('ArrowRight');
    await vi.advanceTimersByTimeAsync(0);
    q('.ld-pts > .ld-acts .ld-delete')!.click();
    expect(under()).toBe('DELETE "The truth route"? Y/NYESNO');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removePlaythrough).toHaveBeenCalledWith('pt-2');
  });

  it('Del on NOW removes the playthrough; the active one shows the error', async () => {
    const api = fakeApi();
    api.removePlaythrough.mockRejectedValueOnce(new ApiError(409, 'active'));
    await mount(api);
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removePlaythrough).toHaveBeenCalledWith('pt-1');
    expect(pts()).toHaveLength(3);
    expect(t('.load-error')).toContain('active');
    key('ArrowRight');
    await vi.advanceTimersByTimeAsync(0);
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(pts().map((p) => p.dataset.id)).toEqual(['pt-1', 'pt-3']);
  });

  it('R on NOW renames the playthrough in its row: Enter saves, Esc keeps', async () => {
    const api = fakeApi();
    await mount(api);
    key('r');
    const input = q('.ld-pts .pt.editing input') as HTMLInputElement;
    expect(input.value).toBe('Hicks — Oct 7');
    enterIn(input, 'Escape');
    expect(q('.ld-pts input')).toBeNull();
    key('r');
    const again = q('.ld-pts .pt.editing input') as HTMLInputElement;
    again.value = 'Night one';
    enterIn(again, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.rename).toHaveBeenCalledWith('pt-1', 'Night one');
    expect(q('.ld-pts .pt.on .pt-name')!.firstChild!.textContent).toBe('Night one');
  });

  it("R on a save renames the save in its strip (the RENAME button too)", async () => {
    const api = fakeApi();
    await mount(api);
    key('ArrowDown');
    strip('s-man').querySelector<HTMLElement>('.ld-rename')!.click();
    const input = strip('s-man').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('before I told Nix the truth');
    input.value = 'The truth, finally';
    enterIn(input, 'Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.renameSave).toHaveBeenCalledWith('s-man', 'The truth, finally');
    expect(api.rename).not.toHaveBeenCalled();
    expect(strip('s-man').querySelector('.ss-name')!.textContent).toBe('The truth, finally');
  });

  it('saves arriving mid-rename leave the field alone', async () => {
    const api = fakeApi();
    let release!: (s: SaveInfo[]) => void;
    api.listSaves.mockImplementation((id: string) => (id === 'pt-2' ? new Promise((r) => (release = r)) : Promise.resolve(saves)));
    await mount(api);
    key('ArrowRight');
    key('r');
    const input = q('.ld-pts input') as HTMLInputElement;
    input.value = 'The truth, again';
    release([save({ id: 's-2', playthrough: 'pt-2' })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual(['now', 's-2']);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('The truth, again');
  });

  it('Enter twice in the rename field renames once', async () => {
    const api = fakeApi();
    let release!: (v: PlaythroughInfo) => void;
    api.rename.mockImplementation(() => new Promise((r) => (release = r)));
    await mount(api);
    key('r');
    const input = q('.ld-pts input') as HTMLInputElement;
    input.value = 'Night one';
    enterIn(input, 'Enter');
    enterIn(input, 'Enter');
    release(playthrough({ id: 'pt-1', name: 'Night one' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.rename).toHaveBeenCalledTimes(1);
  });

  it('clicking a playthrough row selects it; clicking a strip focuses it, the focused strip loads', async () => {
    const api = fakeApi();
    await mount(api);
    q('.ld-pts .pt[data-id="pt-3"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(q('.ld-pts .pt.on')!.dataset.id).toBe('pt-3');
    q('.ld-pts .pt[data-id="pt-1"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    strip('s-man').click();
    expect(on()).toBe('s-man');
    strip('s-man').click();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).toHaveBeenCalledWith('s-man');
  });

  it('a load that succeeds stays locked, keys held, until the room opens', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).toHaveBeenCalledTimes(1);
    expect(q('.jack-in')!.classList.contains('on')).toBe(true);
    expect(document.querySelector('.load-screen')!.classList.contains('locked')).toBe(true);
    key('ArrowDown');
    expect(on()).toBe('s-man');
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
  });

  it('Esc while a load call is in flight is ignored', async () => {
    const api = fakeApi();
    let release!: (v: PlaythroughInfo) => void;
    api.loadSave.mockImplementation(() => new Promise((r) => (release = r)));
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
    release(playthrough({ id: 'pt-9' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.nav).toHaveBeenCalledTimes(1);
  });

  it('Esc during JACK IN (before the call) cancels: no call, and back', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    key('Escape');
    expect(deps.back).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).not.toHaveBeenCalled();
  });

  it('25 playthroughs: the selected row stays in the list window', async () => {
    const api = fakeApi();
    api.listPlaythroughs.mockResolvedValueOnce({
      active: 'p0',
      playthroughs: Array.from({ length: 25 }, (_, i) => ({ ...playthrough({ id: `p${i}`, name: `Run ${i}`, updatedAt: NOW - i * HOUR }), contacts: 1 })),
    });
    await mount(api);
    for (let i = 0; i < 20; i++) key('ArrowRight');
    await vi.advanceTimersByTimeAsync(0);
    expect(q('.ld-pts .pt.on')!.dataset.id).toBe('p20');
    expect(pts().length).toBeLessThanOrEqual(12);
  });

  it('refresh() puts the faces in once the roster arrives', async () => {
    const roster = new Map<string, LandingAgent>();
    document.body.innerHTML = '<div id="root"></div>';
    const h = mountLoad(document.getElementById('root')!, { api: fakeApi(), nav: vi.fn(), back: vi.fn(), sound: vi.fn(), agents: () => roster, reducedMotion: true });
    handles.push(h);
    await vi.advanceTimersByTimeAsync(0);
    expect(strip('now').querySelector('.ss-face')).toBeNull();
    for (const [k, v] of agents) roster.set(k, v);
    h.refresh();
    expect(strip('now').querySelector<HTMLImageElement>('.ss-face.ss-l')!.getAttribute('src')).toBe('/thumb/hicks');
  });

  it('deleting the last playthrough says NO PLAYTHROUGHS', async () => {
    const api = fakeApi();
    api.listPlaythroughs.mockResolvedValueOnce({ active: null, playthroughs: [{ ...old, contacts: 1 }] });
    await mount(api);
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removePlaythrough).toHaveBeenCalledWith('pt-3');
    expect(under()).toBe('NO PLAYTHROUGHS');
  });

  it('Esc goes back', async () => {
    const deps = await mount();
    key('Escape');
    expect(deps.back).toHaveBeenCalledTimes(1);
  });

  it('destroy stops a pending load', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('Enter');
    handles.pop()!.destroy();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).not.toHaveBeenCalled();
  });
});

describe('load screen over a room (exclusive)', () => {
  it("its keys go first and no further; a name field's keys still reach the field", async () => {
    document.body.innerHTML = '<div id="root"></div><input id="prompt">';
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const deps = { api: fakeApi(), nav: vi.fn(), back: vi.fn(), sound: vi.fn(), agents: () => agents, reducedMotion: true, exclusive: true };
    handles.push(mountLoad(document.getElementById('root')!, deps));
    await vi.advanceTimersByTimeAsync(0);
    key('ArrowDown');
    key('x');
    expect(behind).not.toHaveBeenCalled();
    expect(on()).toBe('s-man');
    key('r');
    const input = strip('s-man').querySelector('input') as HTMLInputElement;
    enterIn(input, 'Escape');
    expect(strip('s-man').querySelector('input')).toBeNull();
    key('Escape');
    expect(deps.back).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', behind);
  });
});
