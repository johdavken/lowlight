import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AroundEntry, ContactEntry, PlaythroughInfo } from '../../shared/types';
import { JACK_MS, mountTitle } from '../src/landing/title';
import type { LandingAgent } from '../src/landing/landing';
import { ApiError, createPlaythrough, type PlaythroughApi } from '../src/net/playthroughs';

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
const known: ContactEntry[] = [
  contact({ id: 'nix', name: 'Nix', status: 'start', placeName: "Nix's apartment", timeOfDay: 'night' }),
  contact({ id: 'cass', name: 'Cass', placeName: 'Ribbon rooftop', timeOfDay: null }),
];

function fakeApi(o: { active?: PlaythroughInfo | null; others?: PlaythroughInfo[]; contacts?: ContactEntry[]; around?: AroundEntry[] } = {}) {
  const active = o.active ?? null;
  const all = [...(active ? [active] : []), ...(o.others ?? [])];
  return {
    listPlaythroughs: vi.fn(async () => ({ active: active?.id ?? null, playthroughs: all })),
    contacts: vi.fn(async () => o.contacts ?? known),
    persona: vi.fn(async () => ({ id: 'hicks', name: 'Hicks' })),
    setLocation: vi.fn(async (contactId: string) => ({ contactId, sceneId: 'x' })),
    around: vi.fn(async () => o.around ?? []),
  } as unknown as PlaythroughApi & Record<'listPlaythroughs' | 'contacts' | 'persona' | 'setLocation' | 'around', ReturnType<typeof vi.fn>>;
}

function agent(id: string, name: string, extra: Partial<LandingAgent> = {}): LandingAgent {
  return {
    id, name, pronoun: 'she', start: null, description: '', accent: '#ff4f8b', avatarKind: 'monogram',
    rooms: [], startRoom: 'ribbon/x', legacyDistrict: null, group: null, connected: true, backend: 'direct', modelLabel: 'GLM 5.2',
    connectionError: null, sprite: { url: `/sprites/${id}.png` } as LandingAgent['sprite'], tagline: `${name} tagline`, bio: [],
    facts: [{ label: 'KNOWN FOR', value: `${name} things` }], face: { x: 0.5, y: 0.2 }, thumb: null, link: 'ok',
    room: null, recaps: {}, ...extra,
  };
}
const agents = new Map<string, LandingAgent>([
  ['hicks', agent('hicks', 'Hicks')],
  ['nix', agent('nix', 'Nix')],
  ['cass', agent('cass', 'Cass', { sprite: null })],
]);

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const tiles = () => [...document.querySelectorAll<HTMLElement>('.title-menu .tile')].map((t) => t.dataset.id);
const focused = () => document.querySelector<HTMLElement>('.title-menu .tile.on')?.dataset.id;
const text = (sel: string) => document.querySelector(`.title-menu ${sel}`)?.textContent ?? null;
const p1 = (sel: string) => text(`.fighter.p1 ${sel}`);
const p2 = (sel: string) => text(`.fighter.p2 ${sel}`);
const under = () => text('.title-under');
const facts = (side: 'p1' | 'p2') =>
  Object.fromEntries([...document.querySelectorAll(`.title-menu .fighter.${side} .fighter-file dt`)].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));

const handles: { destroy(): void }[] = [];
async function mount(api: PlaythroughApi) {
  document.body.innerHTML = '<div id="root"></div>';
  const deps = { api, nav: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onReport: vi.fn(), sound: vi.fn(), agents: () => agents, backdrop: vi.fn(), reducedMotion: false };
  handles.push(mountTitle(document.getElementById('root')!, deps));
  await vi.advanceTimersByTimeAsync(0);
  return deps;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('title menu', () => {
  it('REPORT A BUG is the last tile; Enter on it calls onReport', async () => {
    const deps = await mount(fakeApi());
    key('ArrowRight');
    expect(focused()).toBe('report');
    expect(text('.title-logo')).toBe('REPORT A BUG');
    expect(under()).toBe('SOMETHING BROKE? TELL THE DEVELOPER');
    expect(p1('.dh')).toBe('// BUG REPORT');
    key('Enter');
    expect(deps.onReport).toHaveBeenCalledTimes(1);
    expect(deps.onNewGame).not.toHaveBeenCalled();
  });

  it('no playthrough: only the NEW GAME tile, focused; both fighters waiting with ???', async () => {
    const deps = await mount(fakeApi());
    expect(tiles()).toEqual(['new', 'report']);
    expect(focused()).toBe('new');
    expect(document.querySelector('.title-menu .fighter.p1')!.classList.contains('waiting')).toBe(true);
    expect(p1('.name')).toBe('???');
    expect(p2('.name')).toBe('???');
    expect(p1('.dh')).toBe('// NEW GAME');
    expect(under()).toBe('PICK WHO YOU ARE · THEN WHO ANSWERS');
    expect(deps.backdrop).toHaveBeenLastCalledWith(null);
    key('Enter');
    expect(deps.onNewGame).toHaveBeenCalledTimes(1);
    expect(deps.sound).toHaveBeenCalledWith('confirm');
  });

  it('playthroughs but none active: NEW GAME and LOAD; → Enter calls onLoad', async () => {
    const deps = await mount(fakeApi({ others: [playthrough(), playthrough({ id: 'pt-2', name: 'Imported – cass' })] }));
    expect(tiles()).toEqual(['new', 'load', 'report']);
    key('ArrowRight');
    expect(focused()).toBe('load');
    expect(deps.sound).toHaveBeenCalledWith('move');
    expect(under()).toBe('2 PLAYTHROUGHS');
    expect(p1('.dh')).toBe('// PLAYTHROUGHS');
    expect([...document.querySelectorAll('.title-menu .fighter.p1 .pt b')].map((b) => b.textContent)).toEqual(['Hicks — Oct 7', 'Imported – cass']);
    key('Enter');
    expect(deps.onLoad).toHaveBeenCalledTimes(1);
    expect(deps.onNewGame).not.toHaveBeenCalled();
  });

  it('all four tiles fit the band at once: REPORT A BUG is never cut off', async () => {
    await mount(fakeApi({ active: playthrough(), contacts: [known[0]!] }));
    expect(tiles()).toEqual(['continue', 'new', 'load', 'report']);
    expect(document.querySelector('.title-menu .band')!.classList.contains('more-right')).toBe(false);
  });

  it('active: CONTINUE first; 1P is the player with // LAST SCENE; CPU is Nix with // LAST LINE; the under line names the place', async () => {
    const api = fakeApi({ active: playthrough(), contacts: [{ ...known[0]!, lastLine: { speaker: 'Nix', text: 'Fee clears first.' } }, known[1]!] });
    const deps = await mount(api);
    expect(tiles()).toEqual(['continue', 'new', 'load', 'report']);
    expect(focused()).toBe('continue');
    expect(p1('.name')).toBe('HICKS');
    expect(p1('.tag')).toBe('1P · YOU');
    expect(p1('.dh')).toBe('// LAST SCENE');
    expect(facts('p1')).toMatchObject({ WHERE: "Nix's apartment", WHEN: 'night · 2h ago', SAVE: 'Hicks — Oct 7', CONTACTS: 'Nix · Cass' });
    expect(p2('.name')).toBe('NIX');
    expect(p2('.tag')).toBe('CPU · AI');
    expect(p2('.dh')).toBe('// LAST LINE');
    expect(p2('q')).toBe('Fee clears first.');
    expect(under()).toBe("NIX'S APARTMENT · NIGHT · 2H AGO  ◀ 1/2 ▶");
    expect(deps.backdrop).toHaveBeenLastCalledWith('nix');
  });

  it('without a persona the 1P name is the player id, capitalised', async () => {
    const api = fakeApi({ active: playthrough() });
    api.persona.mockResolvedValueOnce(null);
    await mount(api);
    expect(p1('.name')).toBe('HICKS');
  });

  it('↓ cycles the contact: CPU becomes CASS and, her room unknown, the backdrop goes to the skyline', async () => {
    const deps = await mount(fakeApi({ active: playthrough() }));
    key('ArrowDown');
    expect(p2('.name')).toBe('CASS');
    expect(under()).toBe('RIBBON ROOFTOP · 2H AGO  ◀ 2/2 ▶');
    expect(deps.backdrop).toHaveBeenLastCalledWith(null);
    key('ArrowDown'); // wraps
    expect(p2('.name')).toBe('NIX');
    key('ArrowUp');
    expect(p2('.name')).toBe('CASS');
  });

  it('one contact: ↑↓ do nothing and the under line has no ◀ ▶', async () => {
    await mount(fakeApi({ active: playthrough(), contacts: [known[0]!] }));
    key('ArrowDown');
    expect(p2('.name')).toBe('NIX');
    expect(under()).toBe("NIX'S APARTMENT · NIGHT · 2H AGO");
  });

  it('↑↓ off CONTINUE do nothing', async () => {
    await mount(fakeApi({ active: playthrough() }));
    key('ArrowRight');
    key('ArrowDown');
    expect(focused()).toBe('new');
    key('ArrowLeft');
    expect(p2('.name')).toBe('NIX');
  });

  it('→ to NEW GAME: the skyline, both fighters waiting', async () => {
    const deps = await mount(fakeApi({ active: playthrough() }));
    key('ArrowRight');
    expect(focused()).toBe('new');
    expect(deps.backdrop).toHaveBeenLastCalledWith(null);
    expect(p1('.name')).toBe('???');
    expect(under()).toBe('PICK WHO YOU ARE · THEN WHO ANSWERS');
  });

  it("the heading is the focused tile's action, not LOWLIGHT", async () => {
    await mount(fakeApi({ active: playthrough() }));
    expect(text('.title-logo')).toBe('CONTINUE');
    key('ArrowRight');
    expect(text('.title-logo')).toBe('NEW GAME');
    key('ArrowRight');
    expect(text('.title-logo')).toBe('LOAD');
  });

  it('the hints bracket each key, so a key never reads as part of its action', async () => {
    await mount(fakeApi({ active: playthrough() }));
    expect(text('.title-hints')).toBe('[←→] CHOOSE · [↑↓] CONTACT · [ENTER] JACK IN · [ESC] SPLASH');
    key('ArrowRight');
    expect(text('.title-hints')).toBe('[←→] CHOOSE · [ENTER] JACK IN · [ESC] SPLASH');
  });

  it('← at the first tile stays; sound(move) only when the focus moves', async () => {
    const deps = await mount(fakeApi({ active: playthrough() }));
    key('ArrowLeft');
    expect(focused()).toBe('continue');
    expect(deps.sound).not.toHaveBeenCalled();
  });

  it('Enter on CONTINUE: lock flash on both fighters, JACK IN, then setLocation and nav after JACK_MS', async () => {
    const api = fakeApi({ active: playthrough() });
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    expect(document.querySelector('.title-menu .fighter.p1')!.classList.contains('is-locked')).toBe(true);
    expect(document.querySelector('.title-menu .fighter.p2')!.classList.contains('is-locked')).toBe(true);
    expect(document.querySelector('.title-menu .jack-in')!.classList.contains('on')).toBe(true);
    expect(document.querySelector('.title-menu .cursor')!.classList.contains('live')).toBe(false);
    expect(deps.nav).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).toHaveBeenCalledWith('cass');
    expect(deps.nav).toHaveBeenCalledWith('/room/cass');
    expect(api.setLocation.mock.invocationCallOrder[0]).toBeLessThan(deps.nav.mock.invocationCallOrder[0]);
  });

  it('Enter on CONTINUE with the same contact skips setLocation', async () => {
    const api = fakeApi({ active: playthrough() });
    const deps = await mount(api);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).not.toHaveBeenCalled();
    expect(deps.nav).toHaveBeenCalledWith('/room/nix');
  });

  it('CONTINUE on a solo playthrough: ON YOUR OWN under the contact you left, Enter goes to the solo screen', async () => {
    const api = fakeApi({ active: playthrough({ solo: true }) });
    const deps = await mount(api);
    expect(under()).toMatch(/^ON YOUR OWN · /);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).not.toHaveBeenCalled();
    expect(deps.nav).toHaveBeenCalledWith('/solo');
  });

  it('CONTINUE on a solo playthrough after ↓: to that contact as usual', async () => {
    const api = fakeApi({ active: playthrough({ solo: true }) });
    const deps = await mount(api);
    key('ArrowDown');
    expect(under()).not.toMatch(/ON YOUR OWN/);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).toHaveBeenCalledWith('cass');
    expect(deps.nav).toHaveBeenCalledWith('/room/cass');
  });

  it('solo and the contact you left gone: plain ON YOUR OWN, no place under someone else; Enter still goes solo', async () => {
    const api = fakeApi({ active: playthrough({ solo: true, location: { contactId: 'ghost', sceneId: 'ribbon/x' } }) });
    const deps = await mount(api);
    expect(under()).toMatch(/^ON YOUR OWN(  ◀|$)/);
    expect(under()).not.toContain("NIX'S APARTMENT");
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).not.toHaveBeenCalled();
    expect(deps.nav).toHaveBeenCalledWith('/solo');
  });

  it("in a stranger's room (her greeting never came): CONTINUE goes back into her room, not to the start contact (final review 1)", async () => {
    const api = fakeApi({
      active: playthrough({ location: { contactId: 'vee', sceneId: 'ribbon/x' } }),
      around: [{ contactId: 'vee', sceneId: 'ribbon/x', placeName: 'The Back Room', timeOfDay: null }],
    });
    const deps = await mount(api);
    expect(under()).toMatch(/^THE BACK ROOM/);
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(api.setLocation).not.toHaveBeenCalled();
    expect(deps.nav).toHaveBeenCalledWith('/room/vee');
  });

  it('Enter twice on CONTINUE calls setLocation and nav once', async () => {
    const api = fakeApi({ active: playthrough() });
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS * 2);
    expect(api.setLocation).toHaveBeenCalledTimes(1);
    expect(deps.nav).toHaveBeenCalledTimes(1);
  });

  it("a failed setLocation shows // COULDN'T REACH … and stays, the cursor live again", async () => {
    const api = fakeApi({ active: playthrough() });
    api.setLocation.mockRejectedValueOnce(new ApiError(403, 'unknown-contact'));
    const deps = await mount(api);
    key('ArrowDown');
    key('Enter');
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).not.toHaveBeenCalled();
    expect(text('.title-error')).toContain('unknown-contact');
    expect(document.querySelector('.title-menu .cursor')!.classList.contains('live')).toBe(true);
    key('ArrowRight');
    expect(focused()).toBe('new');
  });

  it('no sprite: Cass shows the badge, not a broken img', async () => {
    await mount(fakeApi({ active: playthrough() }));
    key('ArrowDown');
    expect(document.querySelector('.title-menu .fighter.p2 .fighter-badge')).not.toBeNull();
    expect(document.querySelector('.title-menu .fighter.p2 img.fighter-art')).toBeNull();
  });

  it('a contact with no portrait gets her initial on the CONTINUE tile', async () => {
    await mount(fakeApi({ active: playthrough(), contacts: [contact({ id: 'nix', name: 'Nix', portrait: null })] }));
    expect(document.querySelector('.title-menu .tile[data-id="continue"] .tile-mark')!.textContent).toBe('N');
  });

  it("the CONTINUE tile uses her select thumbnail when the roster has one", async () => {
    agents.set('nix', agent('nix', 'Nix', { thumb: '/api/agents/nix/thumb' }));
    await mount(fakeApi({ active: playthrough() }));
    expect(document.querySelector('.title-menu .tile[data-id="continue"] img.tile-art')!.getAttribute('src')).toBe('/api/agents/nix/thumb');
    agents.set('nix', agent('nix', 'Nix'));
  });

  it('her last line drops the roleplay markup, and a line cut at 120 characters ends with …', async () => {
    const long = `*Of course.* ${'x'.repeat(107)}`;
    expect(long).toHaveLength(120);
    await mount(fakeApi({ active: playthrough(), contacts: [{ ...known[0]!, lastLine: { speaker: 'Nix', text: long } }] }));
    expect(p2('q')).toBe(`Of course. ${'x'.repeat(107)}…`);
    handles.splice(0).forEach((h) => h.destroy());
    await mount(fakeApi({ active: playthrough(), contacts: [{ ...known[0]!, lastLine: { speaker: 'Nix', text: '*Nods.* Fee clears first.' } }] }));
    expect(p2('q')).toBe('Nods. Fee clears first.');
  });

  it('on LOAD the playthrough list is lit, not waiting', async () => {
    await mount(fakeApi({ active: playthrough() }));
    key('ArrowRight');
    key('ArrowRight');
    expect(document.querySelector('.title-menu .fighter.p1')!.classList.contains('waiting')).toBe(false);
    expect(document.querySelector('.title-menu .fighter.p2')!.classList.contains('waiting')).toBe(true);
  });

  it('Enter on CONTINUE keeps both files while JACK IN shows (review 3)', async () => {
    await mount(fakeApi({ active: playthrough() }));
    key('Enter');
    expect(p1('.dh')).toBe('// LAST SCENE');
    expect(p2('.dh')).toBe('// LAST LINE');
    expect(p1('.name')).toBe('HICKS');
  });

  it("the 1P name is the playthrough's own: its persona, else its player (review 4)", async () => {
    await mount(fakeApi({ active: playthrough({ persona: { name: 'Rook', background: 'A fixer.' } as PlaythroughInfo['persona'] }) }));
    expect(p1('.name')).toBe('ROOK');
    handles.splice(0).forEach((h) => h.destroy());
    await mount(fakeApi({ active: playthrough({ player: 'cass' }) }));
    expect(p1('.name')).toBe('CASS');
  });

  it('refresh() redraws once the roster arrives (review 2)', async () => {
    const roster = new Map<string, LandingAgent>();
    document.body.innerHTML = '<div id="root"></div>';
    const deps = { api: fakeApi({ active: playthrough() }), nav: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onReport: vi.fn(), sound: vi.fn(), agents: () => roster, backdrop: vi.fn(), reducedMotion: true };
    const h = mountTitle(document.getElementById('root')!, deps);
    handles.push(h);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.title-menu .fighter.p2')!.classList.contains('waiting')).toBe(true);
    for (const [k, v] of agents) roster.set(k, v);
    h.refresh();
    expect(document.querySelector('.title-menu .fighter.p2')!.classList.contains('waiting')).toBe(false);
    expect(document.querySelector('.title-menu .fighter.p2 img.fighter-art')!.getAttribute('src')).toBe('/sprites/nix.png');
    expect(deps.backdrop).toHaveBeenLastCalledWith('nix');
  });

  it('the mouse over a tile focuses it, with the move sound', async () => {
    const deps = await mount(fakeApi({ active: playthrough() }));
    document.querySelector<HTMLElement>('.title-menu .tile[data-id="load"]')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(focused()).toBe('load');
    expect(deps.sound).toHaveBeenCalledWith('move');
    expect(deps.onLoad).not.toHaveBeenCalled();
  });

  it('clicking a tile focuses it; clicking the focused tile is Enter', async () => {
    const deps = await mount(fakeApi({ active: playthrough() }));
    document.querySelector<HTMLElement>('.title-menu .tile[data-id="load"]')!.click();
    expect(focused()).toBe('load');
    expect(deps.onLoad).not.toHaveBeenCalled();
    document.querySelector<HTMLElement>('.title-menu .tile[data-id="load"]')!.click();
    expect(deps.onLoad).toHaveBeenCalledTimes(1);
  });

  it('a failed playthrough list still offers NEW GAME', async () => {
    const api = fakeApi();
    api.listPlaythroughs.mockRejectedValueOnce(new Error('down'));
    await mount(api);
    expect(tiles()).toEqual(['new', 'report']);
  });

  it('destroy removes the screen and its keys; no nav after destroy', async () => {
    const api = fakeApi({ active: playthrough() });
    const deps = await mount(api);
    key('Enter');
    handles.pop()!.destroy();
    expect(document.querySelector('.title-menu')).toBeNull();
    await vi.advanceTimersByTimeAsync(JACK_MS);
    expect(deps.nav).not.toHaveBeenCalled();
    key('Enter');
    expect(deps.onNewGame).not.toHaveBeenCalled();
  });
});

describe('playthrough client', () => {
  it('posts JSON and returns the parsed body', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(playthrough()), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect((await createPlaythrough('hicks', 'nix')).id).toBe('pt-1');
    expect(fetch).toHaveBeenCalledWith('/api/playthroughs', expect.objectContaining({ method: 'POST', body: JSON.stringify({ player: 'hicks', startContact: 'nix' }) }));
  });

  it('throws ApiError with status, error and contact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'busy', contact: 'nix' }), { status: 409 })));
    await expect(createPlaythrough('hicks', 'nix')).rejects.toMatchObject({ status: 409, error: 'busy', contact: 'nix' });
  });
});
