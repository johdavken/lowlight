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
  } as unknown as PlaythroughApi &
    Record<'listPlaythroughs' | 'listSaves' | 'activate' | 'loadSave' | 'removeSave' | 'removePlaythrough' | 'rename', ReturnType<typeof vi.fn>>;
}

const MAP = { places: [{ id: 'stall', name: 'Noodle stall', scene: 'ribbon/noodle-stall' }, { id: 'apt', name: "Nix's apartment", scene: 'ribbon/nix-apartment' }] };

function agent(id: string, name: string, extra: Partial<LandingAgent> = {}): LandingAgent {
  return {
    id, name, pronoun: 'she', start: null, description: '', accent: '#ff4f8b', avatarKind: 'monogram',
    rooms: [], startRoom: 'ribbon/x', legacyDistrict: null, group: null, connected: true, backend: 'direct', modelLabel: 'GLM 5.2',
    connectionError: null, sprite: { url: `/sprites/${id}.png` } as LandingAgent['sprite'], tagline: `${name} tagline`, bio: [],
    facts: [], face: { x: 0.5, y: 0.2 }, thumb: null, link: 'ok', room: null, recaps: {}, ...extra,
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
const pts = () => [...document.querySelectorAll<HTMLElement>('.load-screen .fighter.p1 .pt')];
const tiles = () => [...document.querySelectorAll<HTMLElement>('.load-screen .tile')];
const ids = () => tiles().map((x) => x.dataset.id);
const on = () => q('.tile.on')?.dataset.id;
const under = () => t('.load-under');

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
  it('lists playthroughs in the 1P file, newest first, ACTIVE chip, the active one selected', async () => {
    await mount();
    expect(pts().map((p) => p.dataset.id)).toEqual(['pt-1', 'pt-2', 'pt-3']);
    expect(q('.fighter.p1 .pt.on')!.dataset.id).toBe('pt-1');
    expect(pts().map((p) => p.querySelector('.act')?.textContent ?? null)).toEqual(['ACTIVE', null, null]);
    expect(pts().map((p) => p.querySelector('small')!.textContent)).toEqual(['2h ago', '1d ago', '5d ago']);
    expect(t('.fighter.p1 .name')).toBe('HICKS — OCT 7');
    expect(t('.fighter.p1 .tag')).toBe('1P · 1/3');
    expect(t('.fighter.p1 .tagline')).toBe('Active · Hicks · 2h ago');
    expect(q('.fighter.p1 img.fighter-art')!.getAttribute('src')).toBe('/sprites/hicks.png');
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
    expect(t('.fighter.p1 .fighter-file > p')).toBe('branched from "Night one" · "Hey there" · 3h ago');
    key('ArrowDown');
    expect(t('.fighter.p1 .fighter-file > p')).toBe('forked from "before I told Nix" · 5h ago');
  });

  it('the band is NOW then the saves newest first, with their icon tags and ages', async () => {
    await mount();
    expect(ids()).toEqual(['now', 's-travel', 's-man', 's-end']);
    expect(tiles().map((x) => x.querySelector('.band-tag')!.textContent)).toEqual(['▶ NOW', '⇢', '★', '◼']);
    expect(tiles().map((x) => x.querySelector('.tile-name')!.textContent)).toEqual(['2H AGO', '2H AGO', '3H AGO', '4H AGO']);
    expect(tiles()[0]!.querySelector('img')!.getAttribute('src')).toBe('/scenes/ribbon/nix-apartment/room.png');
    expect(tiles()[1]!.querySelector('img')!.getAttribute('src')).toBe('/scenes/ribbon/noodle-stall/room.png');
    expect(on()).toBe('now');
  });

  it('NOW: the CPU is the location contact, // WHERE YOU LEFT IT; the under line names the place', async () => {
    await mount();
    expect(t('.fighter.p2 .tag')).toBe('CPU · NOW');
    expect(t('.fighter.p2 .name')).toBe('NIX');
    expect(t('.fighter.p2 .dh')).toBe('// WHERE YOU LEFT IT');
    expect(under()).toBe("NIX'S APARTMENT · 2H AGO");
  });

  it('→ steps the timeline: the speaker as CPU, her line as the quote, the save kind on the tag', async () => {
    const deps = await mount();
    key('ArrowRight');
    expect(on()).toBe('s-travel');
    expect(deps.sound).toHaveBeenCalledWith('move');
    expect(t('.fighter.p2 .tag')).toBe('CPU · TRIP');
    expect(t('.fighter.p2 .name')).toBe('HAE');
    expect(t('.fighter.p2 .dh')).toBe('// AT THIS SAVE');
    expect(t('.fighter.p2 q')).toBe('You came back.');
    expect(under()).toBe('NOODLE STALL · NIGHT · 2H AGO');
    key('ArrowRight');
    expect(t('.fighter.p2 .tag')).toBe('CPU · SAVE');
    expect(t('.fighter.p2 .name')).toBe('NIX');
    expect(t('.fighter.p2 q')).toBe('Say it, then.');
    key('ArrowRight');
    expect(t('.fighter.p2 .tag')).toBe('CPU · END');
    expect(t('.fighter.p2 .name')).toBe('CASS');
    // Cass has no sprite: select's badge, not a broken image.
    expect(q('.fighter.p2 .fighter-badge')).not.toBeNull();
    // A place the map doesn't name: the scene folder, dashes as spaces.
    expect(t('.fighter.p2 .tagline')).toBe('ribbon rooftop');
  });

  it("a save's under line has its story time", async () => {
    const api = fakeApi();
    api.listSaves.mockImplementation(async (id: string) => (id === 'pt-1' ? saves.map((x) => (x.id === 's-travel' ? { ...x, clock: 1500 } : x)) : []));
    await mount(api);
    key('ArrowRight');
    expect(under()).toContain('DAY 2 · FRI 01:00');
  });

  it('a trip reads FROM → TO when the older save was somewhere else', async () => {
    const api = fakeApi();
    api.listSaves.mockResolvedValue([
      save({ id: 'a', trigger: 'travel', at: NOW - HOUR, location: { contactId: 'nix', sceneId: 'ribbon/nix-apartment' }, lastLine: { speaker: 'Nix', text: 'Upstairs.' } }),
      save({ id: 'b', trigger: 'manual', kind: 'manual', at: NOW - 2 * HOUR, location: { contactId: 'nix', sceneId: 'ribbon/noodle-stall' } }),
    ]);
    await mount(api);
    key('ArrowRight');
    expect(t('.fighter.p2 .tagline')).toBe("Noodle stall → Nix's apartment");
  });

  it('← at NOW and → at the last save stay put', async () => {
    await mount();
    key('ArrowLeft');
    expect(on()).toBe('now');
    for (let i = 0; i < 6; i++) key('ArrowRight');
    expect(on()).toBe('s-end');
  });

  it('places fall back to the scene folder when the map fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await mount();
    key('ArrowRight');
    expect(t('.fighter.p2 .tagline')).toBe('noodle stall');
  });

  it('↓ changes playthrough: its timeline glitches in, focus on NOW, the 1P fighter follows the player', async () => {
    const api = fakeApi();
    api.listPlaythroughs.mockResolvedValueOnce({
      active: 'pt-1',
      playthroughs: [{ ...active, contacts: 3 }, { ...truth, player: 'cass', contacts: 1 }],
    });
    await mount(api);
    key('ArrowRight');
    key('ArrowDown');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.listSaves).toHaveBeenCalledWith('pt-2');
    expect(ids()).toEqual(['now']);
    expect(on()).toBe('now');
    expect(tiles()[0]!.classList.contains('glitch-in')).toBe(true);
    expect(t('.fighter.p1 .tag')).toBe('1P · 2/2');
    expect(q('.fighter.p1 .pt.on')!.dataset.id).toBe('pt-2');
    // Cass plays this one, and has no sprite: the badge.
    expect(q('.fighter.p1 .fighter-badge')).not.toBeNull();
    // No location yet: the start contact.
    expect(t('.fighter.p2 .name')).toBe('CASS');
  });

  it('Enter on a save: lock flash, FORK HERE, then loadSave and nav after JACK_MS', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowRight');
    key('ArrowRight');
    key('Enter');
    expect(deps.sound).toHaveBeenCalledWith('confirm');
    expect(q('.fighter.p1')!.classList.contains('is-locked')).toBe(true);
    expect(q('.fighter.p2')!.classList.contains('is-locked')).toBe(true);
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
    key('ArrowDown');
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

  it('a solo playthrough: NOW and a fork that comes back solo land on the solo screen (Review Focus 4)', async () => {
    const api = fakeApi();
    api.loadSave.mockImplementation(async () => playthrough({ id: 'pt-9', solo: true }));
    let deps = await mount(api);
    key('ArrowRight');
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
    key('ArrowRight');
    key('Enter');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS * 2);
    expect(api.loadSave).toHaveBeenCalledTimes(1);
    expect(t('.load-hints')).toBe('Wait for Nix to finish');
    expect(deps.nav).not.toHaveBeenCalled();
    // Keys work again: the cursor moves.
    key('ArrowRight');
    expect(on()).toBe('s-man');
  });

  it('Del on a save then Y removes it; N and Esc cancel', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowRight');
    key('Delete');
    expect(under()).toBe('DELETE? Y/N');
    key('n');
    expect(under()).toBe('NOODLE STALL · NIGHT · 2H AGO');
    key('Delete');
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removeSave).toHaveBeenCalledWith('s-travel');
    expect(ids()).toEqual(['now', 's-man', 's-end']);
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
    key('ArrowDown');
    await vi.advanceTimersByTimeAsync(0);
    key('Delete');
    key('y');
    await vi.advanceTimersByTimeAsync(0);
    expect(pts().map((p) => p.dataset.id)).toEqual(['pt-1', 'pt-3']);
  });

  it('R renames in the under line: Enter saves, Esc keeps', async () => {
    const api = fakeApi();
    await mount(api);
    key('r');
    const input = q('.load-under input') as HTMLInputElement;
    expect(input.value).toBe('Hicks — Oct 7');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(q('.load-under input')).toBeNull();
    expect(under()).toBe("NIX'S APARTMENT · 2H AGO");
    key('r');
    const again = q('.load-under input') as HTMLInputElement;
    again.value = 'Night one';
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.rename).toHaveBeenCalledWith('pt-1', 'Night one');
    expect(t('.fighter.p1 .name')).toBe('NIGHT ONE');
  });

  it('a timeline arriving mid-rename leaves the field alone', async () => {
    const api = fakeApi();
    let release!: (s: SaveInfo[]) => void;
    api.listSaves.mockImplementation((id: string) => (id === 'pt-2' ? new Promise((r) => (release = r)) : Promise.resolve(saves)));
    await mount(api);
    key('ArrowDown');
    key('r');
    const input = q('.load-under input') as HTMLInputElement;
    input.value = 'The truth, again';
    release([save({ id: 's-2', playthrough: 'pt-2' })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual(['now', 's-2']);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('The truth, again');
  });

  it('25 saves: → past the eighth tile scrolls the band', async () => {
    const api = fakeApi();
    api.listSaves.mockResolvedValue(Array.from({ length: 25 }, (_, i) => save({ id: `s${i}`, at: NOW - (i + 1) * HOUR })));
    await mount(api);
    expect(q('.band')!.classList.contains('more-right')).toBe(true);
    for (let i = 0; i < 9; i++) key('ArrowRight');
    expect(on()).toBe('s8');
    expect(q('.band')!.classList.contains('more-left')).toBe(true);
  });

  it('clicking a playthrough row selects it; clicking a tile focuses it, the focused tile is Enter', async () => {
    const api = fakeApi();
    await mount(api);
    q('.fighter.p1 .pt[data-id="pt-3"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(t('.fighter.p1 .tag')).toBe('1P · 3/3');
    q('.fighter.p1 .pt[data-id="pt-1"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    q('.tile[data-id="s-man"]')!.click();
    expect(on()).toBe('s-man');
    q('.tile[data-id="s-man"]')!.click();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).toHaveBeenCalledWith('s-man');
  });

  it('a load that succeeds stays locked, keys held, until the room opens (final review 3)', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowRight');
    key('ArrowRight');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).toHaveBeenCalledTimes(1);
    expect(q('.jack-in')!.classList.contains('on')).toBe(true);
    expect(q('.fighter.p1')!.classList.contains('is-locked')).toBe(true);
    key('ArrowLeft');
    expect(on()).toBe('s-man');
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
  });

  it('Esc while a load call is in flight is ignored; during JACK IN it cancels and goes back (final review 4)', async () => {
    const api = fakeApi();
    let release!: (v: PlaythroughInfo) => void;
    api.loadSave.mockImplementation(() => new Promise((r) => (release = r)));
    const deps = await mount(api);
    key('ArrowRight');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).toHaveBeenCalledTimes(1);
    key('Escape');
    expect(deps.back).not.toHaveBeenCalled();
    release(playthrough({ id: 'pt-9' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.nav).toHaveBeenCalledTimes(1);
  });

  it('Esc during JACK IN (before the call) cancels: no call, and back', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    key('ArrowRight');
    key('Enter');
    key('Escape');
    expect(deps.back).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).not.toHaveBeenCalled();
  });

  it('the mouse over a save focuses it, with the move sound; nothing loads', async () => {
    const api = fakeApi();
    const deps = await mount(api);
    q('.tile[data-id="s-man"]')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(on()).toBe('s-man');
    expect(deps.sound).toHaveBeenCalledWith('move');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.loadSave).not.toHaveBeenCalled();
  });

  it('the wheel over the band steps the timeline, at most one step per 120 ms', async () => {
    await mount();
    const wheel = (dy: number) => q('.band')!.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
    expect(on()).toBe('now');
    wheel(100);
    expect(on()).toBe(ids()[1]);
    wheel(100); // too soon after the last step
    expect(on()).toBe(ids()[1]);
    await vi.advanceTimersByTimeAsync(200);
    wheel(-100);
    expect(on()).toBe('now');
  });

  it('the wheel over the 1P side steps the playthroughs', async () => {
    await mount();
    const wheel = (dy: number) => q('.fighter.p1')!.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
    wheel(100);
    await vi.advanceTimersByTimeAsync(200);
    expect(t('.fighter.p1 .tag')).toBe('1P · 2/3');
    wheel(-100);
    await vi.advanceTimersByTimeAsync(200);
    expect(t('.fighter.p1 .tag')).toBe('1P · 1/3');
  });

  it('25 playthroughs: the selected row stays in the list window (final review 5)', async () => {
    const api = fakeApi();
    api.listPlaythroughs.mockResolvedValueOnce({
      active: 'p0',
      playthroughs: Array.from({ length: 25 }, (_, i) => ({ ...playthrough({ id: `p${i}`, name: `Run ${i}`, updatedAt: NOW - i * HOUR }), contacts: 1 })),
    });
    await mount(api);
    for (let i = 0; i < 20; i++) key('ArrowDown');
    await vi.advanceTimersByTimeAsync(0);
    expect(q('.fighter.p1 .pt.on')!.dataset.id).toBe('p20');
    expect(pts().length).toBeLessThanOrEqual(12);
    expect(t('.fighter.p1 .tag')).toBe('1P · 21/25');
  });

  it('Enter twice in the rename field renames once', async () => {
    const api = fakeApi();
    let release!: (v: PlaythroughInfo) => void;
    api.rename.mockImplementation(() => new Promise((r) => (release = r)));
    await mount(api);
    key('r');
    const input = q('.load-under input') as HTMLInputElement;
    input.value = 'Night one';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    release(playthrough({ id: 'pt-1', name: 'Night one' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.rename).toHaveBeenCalledTimes(1);
  });

  it('refresh() redraws the fighters once the roster arrives', async () => {
    const roster = new Map<string, LandingAgent>();
    document.body.innerHTML = '<div id="root"></div>';
    const h = mountLoad(document.getElementById('root')!, { api: fakeApi(), nav: vi.fn(), back: vi.fn(), sound: vi.fn(), agents: () => roster, reducedMotion: true });
    handles.push(h);
    await vi.advanceTimersByTimeAsync(0);
    expect(q('.fighter.p1 img.fighter-art')).toBeNull();
    for (const [k, v] of agents) roster.set(k, v);
    h.refresh();
    expect(q('.fighter.p1 img.fighter-art')!.getAttribute('src')).toBe('/sprites/hicks.png');
    expect(q('.fighter.p1')!.classList.contains('waiting')).toBe(false);
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
