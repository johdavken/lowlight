import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AroundEntry, ContactEntry, PlaythroughInfo } from '../../shared/types';
import { mountSolo } from '../src/landing/solo';
import { lineFor } from '../src/room/people-contacts';
import { BUILT_IN } from '../src/landing/splash';
import type { LandingAgent } from '../src/landing/landing';
import { ApiError } from '../src/net/playthroughs';

const pt = (o: Partial<PlaythroughInfo> = {}): PlaythroughInfo => ({
  id: 'pt-1', name: 'Hicks — Oct 10', player: 'hicks', startContact: 'nix', createdAt: 1, updatedAt: 2, forkedFrom: null,
  location: { contactId: 'cass', sceneId: 'ribbon/the-tilt' }, solo: true, ...o,
});
const contact = (o: Partial<ContactEntry> & { id: string; name: string }): ContactEntry => ({
  accent: '#ff4f8b', portrait: null, status: 'met', sceneId: `ribbon/${o.id}`, placeName: `${o.name}'s place`, timeOfDay: 'night', lastLine: null, ...o,
});
const known = [
  contact({ id: 'nix', name: 'Nix', status: 'start', lastLine: { speaker: 'Nix', text: 'Fee clears first.' } }),
  contact({ id: 'cass', name: 'Cass', placeName: 'The Tilt' }),
  contact({ id: 'hicks2', name: 'Wren', status: 'shared', sharedBy: 'Nix' }),
];

function fakeApi(o: { active?: PlaythroughInfo | null; contacts?: ContactEntry[]; around?: AroundEntry[] } = {}) {
  const active = o.active === undefined ? pt() : o.active;
  return {
    listPlaythroughs: vi.fn(async () => ({ active: active?.id ?? null, playthroughs: active ? [{ ...active, contacts: 3 }] : [] })),
    contacts: vi.fn(async () => o.contacts ?? known),
    persona: vi.fn(async () => ({ id: 'hicks', name: 'Hicks' })),
    setLocation: vi.fn(async (contactId: string) => ({ contactId, sceneId: 'x' })),
    saveNow: vi.fn(async () => ({ id: 'sv-1' })),
    around: vi.fn(async () => o.around ?? []),
    clock: vi.fn(async () => ({ clock: 1200 })),
    wait: vi.fn(async () => ({ clock: 1260 })),
  };
}

const hicks = { id: 'hicks', name: 'Hicks', accent: '#3df', sprite: null, tagline: '', facts: [], bio: [], connected: true } as unknown as LandingAgent;
const handles: { destroy(): void }[] = [];
async function mount(api = fakeApi()) {
  document.body.innerHTML = '<div id="root"></div>';
  const deps = { api, agents: async () => new Map([['hicks', hicks]]), art: BUILT_IN, nav: vi.fn(), sound: vi.fn() };
  handles.push(mountSolo(document.getElementById('root')!, deps as never));
  await vi.waitFor(() => expect(api.listPlaythroughs).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  return { api, deps };
}
const rows = () => [...document.querySelectorAll<HTMLElement>('.solo-row')];
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  for (const h of handles.splice(0)) h.destroy();
});

describe('the solo screen', () => {
  it('lists your contacts, the one you left first with LAST WITH, each with her place and line', async () => {
    await mount();
    expect(rows().map((r) => r.dataset.id)).toEqual(['cass', 'nix', 'hicks2']);
    expect(rows()[0]!.querySelector('.solo-last')?.textContent).toBe('LAST WITH');
    expect(rows()[1]!.querySelector('.solo-last')).toBeNull();
    expect(rows()[1]!.textContent).toContain('Fee clears first.');
    expect(rows()[2]!.textContent).toContain('heard from Nix');
  });

  it('the one you left gone from the roster: the rest, no LAST WITH (Review Focus 5)', async () => {
    await mount(fakeApi({ contacts: known.filter((c) => c.id !== 'cass') }));
    expect(rows().map((r) => r.dataset.id)).toEqual(['nix', 'hicks2']);
    expect(document.querySelector('.solo-last')).toBeNull();
  });

  it('picking a contact goes to her: setLocation, then her room', async () => {
    const { api, deps } = await mount();
    rows()[1]!.click();
    await vi.waitFor(() => expect(deps.nav).toHaveBeenCalledWith('/room/nix'));
    expect(api.setLocation).toHaveBeenCalledWith('nix');
  });

  it('the first row has focus; ↓ then Enter picks the second', async () => {
    const { deps } = await mount();
    expect(document.activeElement).toBe(rows()[0]);
    key('ArrowDown');
    key('Enter');
    await vi.waitFor(() => expect(deps.nav).toHaveBeenCalledWith('/room/nix'));
  });

  it("busy: Wait for <Name> to finish, and you stay", async () => {
    const api = fakeApi();
    api.setLocation.mockRejectedValue(new ApiError(409, 'busy', 'nix'));
    const { deps } = await mount(api);
    rows()[1]!.click();
    await vi.waitFor(() => expect(document.querySelector('.solo-error')?.textContent).toBe('Wait for Nix to finish'));
    expect(deps.nav).not.toHaveBeenCalled();
  });

  it('the playthrough gone while picking, or none at all: the title', async () => {
    const api = fakeApi();
    api.setLocation.mockRejectedValue(new ApiError(409, 'no-playthrough'));
    const { deps } = await mount(api);
    rows()[0]!.click();
    await vi.waitFor(() => expect(deps.nav).toHaveBeenCalledWith('/'));

    const none = await mount(fakeApi({ active: null }));
    await vi.waitFor(() => expect(none.deps.nav).toHaveBeenCalledWith('/'));
  });

  it("SAVE saves 'On your own' with no contact (it would move you into her room)", async () => {
    const { api } = await mount();
    key('s');
    const field = document.querySelector<HTMLInputElement>('.save-card .sc-field')!;
    expect(field.value).toBe('On your own');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.saveNow).toHaveBeenCalledWith('pt-1', 'On your own'));
    await vi.waitFor(() => expect(document.querySelector('.save-card')).toBeNull());
  });

  it('cues: a step per row moved and the pick, the save once written; focus the page gives is silent', async () => {
    const { deps } = await mount();
    const cues = () => deps.sound.mock.calls.map(([c]) => c);
    expect(cues()).toEqual([]); // the first row's focus on load
    key('ArrowDown');
    expect(cues()).toEqual(['move']);
    key('s');
    document.querySelector<HTMLInputElement>('.save-card .sc-field')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('.save-card')).toBeNull());
    expect(cues()).toEqual(['move', 'save']); // the prompt closing hands focus back without a step
    key('Enter');
    expect(cues()).toEqual(['move', 'save', 'confirm']);
  });

  it('Esc goes back to the title', async () => {
    const { deps } = await mount();
    key('Escape');
    expect(deps.nav).toHaveBeenCalledWith('/');
  });
});

describe('lineFor from before', () => {
  it('a contact you know from before, with no line yet, reads from before', () => {
    expect(lineFor(contact({ id: 'nix', name: 'Nix', status: 'knows', placeName: 'Lowlight Intake' }))).toBe('Lowlight Intake · from before');
  });
});

describe('AROUND LOWLIGHT', () => {
  const nixThere: AroundEntry = { contactId: 'nix-direct', sceneId: 'ribbon/lowlight-intake', placeName: 'Lowlight Intake', timeOfDay: 'night' };

  it('strangers by place, not by name, under their own heading; picking one goes to her', async () => {
    const { api, deps } = await mount(fakeApi({ around: [nixThere] }));
    expect(document.querySelector('.solo-head2')?.textContent).toBe('AROUND LOWLIGHT');
    const row = document.querySelector<HTMLElement>('.solo-row.solo-stranger')!;
    expect(row.textContent).toContain('LOWLIGHT INTAKE');
    expect(row.textContent).toContain("someone's there · night");
    expect(row.textContent!.toLowerCase()).not.toContain('nix');
    row.click();
    await vi.waitFor(() => expect(deps.nav).toHaveBeenCalledWith('/room/nix-direct'));
    expect(api.setLocation).toHaveBeenCalledWith('nix-direct');
  });

  it('no strangers, or the call failing: no heading, contacts still listed (Review Focus 5)', async () => {
    await mount(fakeApi({ around: [] }));
    expect(document.querySelector('.solo-head2')).toBeNull();
    const api = fakeApi();
    api.around.mockRejectedValue(new Error('down'));
    await mount(api);
    expect(document.querySelector('.solo-head2')).toBeNull();
    expect(rows().length).toBe(3);
  });

  it('strangers join the arrow keys after your contacts', async () => {
    await mount(fakeApi({ around: [nixThere] }));
    key('ArrowUp');
    expect((document.activeElement as HTMLElement).classList.contains('solo-stranger')).toBe(true);
  });
});

describe('a stranger stays unnamed (Task 3 review 6)', () => {
  it("a busy refusal on a stranger says someone, not her name", async () => {
    const api = fakeApi({ around: [{ contactId: 'nix-direct', sceneId: 'ribbon/lowlight-intake', placeName: 'Lowlight Intake', timeOfDay: null }] });
    api.setLocation.mockRejectedValue(new ApiError(409, 'busy', 'nix-direct'));
    await mount(api);
    document.querySelector<HTMLElement>('.solo-stranger')!.click();
    await vi.waitFor(() => expect(document.querySelector('.solo-error')?.textContent).toBe('Wait for someone to finish'));
  });
});

describe('LAST WITH a stranger (final review, deferred minor)', () => {
  it("the room you walked out of was a stranger's: her row says LAST WITH and has focus", async () => {
    await mount(fakeApi({ active: pt({ location: { contactId: 'vee', sceneId: 'ribbon/x' } }), around: [{ contactId: 'vee', sceneId: 'ribbon/x', placeName: 'The Back Room', timeOfDay: null }] }));
    const row = document.querySelector<HTMLElement>('.solo-stranger')!;
    expect(row.querySelector('.solo-last')?.textContent).toBe('LAST WITH');
    expect(document.activeElement).toBe(row);
    expect(document.querySelectorAll('.solo-last')).toHaveLength(1);
  });
});

describe('the clock on the solo screen', () => {
  it('reads Day 1 · Thu 20:00 · who next?', async () => {
    await mount();
    await vi.waitFor(() => expect(document.querySelector('.solo-sub')?.textContent).toBe('Day 1 · Thu 20:00 · who next?'));
  });
  it('+1 HOUR waits an hour and refreshes the lists; WAIT UNTIL takes HH:MM', async () => {
    const { api } = await mount();
    (document.querySelector('.solo-wait-1h') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.wait).toHaveBeenCalledWith({ minutes: 60 }));
    await vi.waitFor(() => expect(api.contacts).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.querySelector('.solo-sub')?.textContent).toBe('Day 1 · Thu 21:00 · who next?'));
    (document.querySelector('.solo-wait-4h') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.wait).toHaveBeenCalledWith({ minutes: 240 }));
    await vi.waitFor(() => expect(api.contacts).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 0));
    const field = document.querySelector<HTMLInputElement>('.solo-wait-until')!;
    field.value = '05:00';
    (document.querySelector('.solo-wait-go') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.wait).toHaveBeenCalledWith({ until: '05:00' }));
  });
  it('a bad time says how to write it; busy says who to wait for', async () => {
    const api = fakeApi();
    await mount(api);
    const field = document.querySelector<HTMLInputElement>('.solo-wait-until')!;
    field.value = '5am';
    (document.querySelector('.solo-wait-go') as HTMLButtonElement).click();
    expect(document.querySelector('.solo-error')?.textContent).toBe('// HH:MM, like 20:00');
    expect(api.wait).not.toHaveBeenCalled();
    api.wait.mockRejectedValue(new ApiError(409, 'busy', 'nix'));
    (document.querySelector('.solo-wait-1h') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.solo-error')?.textContent).toBe('Wait for Nix to finish'));
  });
});

describe('typing a time', () => {
  it("keys in the WAIT UNTIL field are the field's: S doesn't save, Enter waits", async () => {
    const { api } = await mount();
    const field = document.querySelector<HTMLInputElement>('.solo-wait-until')!;
    field.focus();
    field.value = '05:00';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    expect(document.querySelector('.save-card')).toBeNull();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.wait).toHaveBeenCalledWith({ until: '05:00' }));
    expect(api.setLocation).not.toHaveBeenCalled();
  });

  it('Esc in the field still leaves the screen (final review minor 6)', async () => {
    const { deps } = await mount();
    const field = document.querySelector<HTMLInputElement>('.solo-wait-until')!;
    field.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(deps.nav).toHaveBeenCalledWith('/');
  });
});

describe('her plan on the row (her plans spec §7)', () => {
  it("a contact's line reads her plan's tail in place of her place", () => {
    expect(lineFor(contact({ id: 'nix', name: 'Nix', placeName: "Nix's flat", planTail: "Hae's 21:00" }))).toBe("Nix's flat · Hae's 21:00");
    expect(lineFor(contact({ id: 'nix', name: 'Nix', placeName: 'The Tilt', planTail: "Hae's 21:00", lastLine: { speaker: 'Nix', text: 'Later.' } }))).toBe(`The Tilt · Hae's 21:00 · "Later."`);
    expect(lineFor(contact({ id: 'nix', name: 'Nix', planTail: null }))).toBe("Nix's place");
  });
  it('a stranger around Lowlight shows the tail as her place', async () => {
    await mount(fakeApi({ around: [{ contactId: 'ines', sceneId: 'x/y', placeName: 'Pump House', planTail: "Hae's 21:00", timeOfDay: null }] }));
    expect(document.querySelector('.solo-stranger .solo-name')?.textContent).toBe("PUMP HOUSE · HAE'S 21:00");
  });
});
