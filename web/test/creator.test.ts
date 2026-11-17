import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Creator, type CreatorOptions } from '../src/landing/creator/creator';
import type { PeopleApi } from '../src/net/people';
import type { PersonRow } from '../../shared/person';
import { FIGURE_FIELDS } from '../../shared/figure-prompt';

const ID = 'p-1794679903080-aaaaaa';
const TAKE = '1794679903099-bbbbbb';
const row = (more: Partial<PersonRow> = {}): PersonRow => ({ id: ID, name: 'Vee', pronoun: 'she', background: 'From the Spine.', wears: 'a grey jacket', made: '2026-11-14T00:00:00.000Z', figure: false, figureMade: null, ...more });

/** A people API whose generate waits for `release()` when `hold` is set. */
function fakeApi(o: { hold?: boolean } = {}) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const api = {
    draft: vi.fn(async () => ({ id: ID })),
    save: vi.fn(async (id: string, who: { name: string; pronoun: 'she' | 'he' | 'they'; background: string; wears: string }) => row({ id, ...who })),
    generate: vi.fn(async () => {
      if (o.hold) await held;
      return { take: TAKE, cost: 0.19 };
    }),
    takes: vi.fn(async () => ({ takes: [] as { take: string; made: number }[], busy: false })),
    keep: vi.fn(async () => row({ figure: true, figureMade: '2026-11-14T00:02:00.000Z' })),
    dropTakes: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    takeUrl: (id: string, take: string, raw = false) => `/api/people/${id}/take/${take}${raw ? '?raw=1' : ''}`,
    figureUrl: (id: string, made: string) => `/api/people/${id}/figure.png?v=${made}`,
  } satisfies PeopleApi;
  return { api, release: () => release() };
}

let host: HTMLElement;
let creator: Creator | null = null;
beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host')!;
});
afterEach(() => {
  creator?.destroy();
  creator = null;
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};
const make = (o: Partial<CreatorOptions> & { api: PeopleApi }) => {
  const opts: CreatorOptions = { person: null, key: true, defaults: { face: { x: 0.49, y: 0.065 }, waist: 0.4 }, onKeep: vi.fn(), onCancel: vi.fn(), ...o };
  creator = new Creator(host, opts);
  return opts;
};
const press = (key: string, more: KeyboardEventInit = {}) => creator!.key(new KeyboardEvent('keydown', { key, cancelable: true, ...more }));
const q = <T extends HTMLElement>(sel: string) => host.querySelector<T>(sel);
const click = (sel: string) => q<HTMLButtonElement>(sel)!.click();
const fill = (sel: string, value: string) => {
  const f = q<HTMLInputElement | HTMLTextAreaElement>(sel)!;
  f.value = value;
  f.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('the creator', () => {
  it('opens on LOOK: the questions in BODY, FACE and WEAR, the price beside GENERATE', () => {
    make(fakeApi());
    expect(creator!.step).toBe('look');
    expect([...host.querySelectorAll('.mk-group legend')].map((l) => l.textContent)).toEqual(['BODY', 'FACE', 'WEAR']);
    expect(host.querySelectorAll('[data-field]').length).toBe(FIGURE_FIELDS.length);
    expect(q('.mk-price')!.textContent).toMatch(/\$0\.\d+/);
    expect(q<HTMLButtonElement>('.mk-generate')!.disabled).toBe(false);
  });

  it('GENERATE makes the draft once, pays for one take, and stays off while it is on its way', async () => {
    const { api, release } = fakeApi({ hold: true });
    make({ api });
    fill('[data-field="hair"]', 'cropped, black');
    click('.mk-generate');
    await flush();
    expect(api.draft).toHaveBeenCalledTimes(1);
    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(api.generate.mock.calls[0]).toEqual([ID, expect.objectContaining({ hair: 'cropped, black' })]);
    expect(q<HTMLButtonElement>('.mk-generate')!.disabled).toBe(true);
    click('.mk-generate');
    press('Enter', { ctrlKey: true });
    await flush();
    expect(api.generate).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(creator!.step).toBe('fit');
    expect(q<HTMLImageElement>('.mk-frame img')!.getAttribute('src')).toBe(`/api/people/${ID}/take/${TAKE}`);
  });

  it('a take on its way holds the creator open: Esc says so, and the take still lands', async () => {
    const { api, release } = fakeApi({ hold: true });
    const opts = make({ api });
    click('.mk-generate');
    await flush();
    expect(press('Escape')).toBe(true);
    expect(opts.onCancel).not.toHaveBeenCalled();
    expect(q('.mk-status')!.textContent).toMatch(/on its way/i);
    release();
    await flush();
    expect(creator!.step).toBe('fit');
  });

  it('FIT: ←/→ pick a take, Enter goes on to WHO; Esc back to LOOK keeps the takes', async () => {
    const { api } = fakeApi();
    api.takes.mockResolvedValue({ takes: [{ take: TAKE, made: 1 }, { take: '1794679903000-cccccc', made: 0 }], busy: false });
    make({ api });
    click('.mk-generate');
    await flush();
    expect(host.querySelectorAll('.mk-take').length).toBe(2);
    press('ArrowRight');
    expect(q('.mk-take.on')!.getAttribute('data-take')).toBe('1794679903000-cccccc');
    press('Escape');
    expect(creator!.step).toBe('look');
    press('Escape'); // with takes: asks first
    expect(q('.mk-confirm')).not.toBeNull();
    press('Escape'); // no: stays
    expect(q('.mk-confirm')).toBeNull();
    click('.mk-to-fit');
    expect(creator!.step).toBe('fit');
    press('Enter');
    expect(creator!.step).toBe('who');
  });

  it('WHO then KEEP: a name and WEARS are needed; then save, keep the picked take, and hand back the person', async () => {
    const { api } = fakeApi();
    const opts = make({ api });
    click('.mk-generate');
    await flush();
    press('Enter'); // FIT → WHO
    expect(q('.mk-wears')).not.toBeNull();
    click('.mk-keep');
    await flush();
    expect(api.save).not.toHaveBeenCalled();
    expect(q('.mk-status')!.textContent).toMatch(/name/i);
    fill('.mk-name', 'Vee');
    host.querySelector<HTMLButtonElement>('.mk-pronoun[data-pronoun="she"]')!.click();
    fill('.mk-background', 'From the Spine.');
    click('.mk-keep');
    await flush();
    expect(q('.mk-status')!.textContent).toMatch(/wears/i);
    fill('.mk-wears', 'a grey quilted jacket');
    press('Enter', { ctrlKey: true });
    await flush();
    expect(api.save).toHaveBeenCalledWith(ID, { name: 'Vee', pronoun: 'she', background: 'From the Spine.', wears: 'a grey quilted jacket' });
    expect(api.keep).toHaveBeenCalledWith(ID, { take: TAKE, face: { x: 0.49, y: 0.065 }, waist: 0.4, fields: expect.any(Object) });
    expect(opts.onKeep).toHaveBeenCalledWith(expect.objectContaining({ figure: true }));
  });

  it('a CLOTHES answer over two lines prefills WEARS as one, and KEEP sends one line', async () => {
    const { api } = fakeApi();
    make({ api });
    fill('[data-field="clothes"]', 'a grey jacket\nboots');
    click('.mk-generate');
    await flush();
    press('Enter');
    expect(q<HTMLTextAreaElement>('.mk-wears')!.value).toBe('a grey jacket boots');
    fill('.mk-wears', 'a grey jacket\nwet boots');
    fill('.mk-name', 'Vee');
    click('.mk-keep');
    await flush();
    expect(api.save).toHaveBeenCalledWith(ID, expect.objectContaining({ wears: 'a grey jacket wet boots' }));
  });

  it('no key: LOOK offers SKIP, WHO has no WEARS, and KEEP makes them without a figure', async () => {
    const { api } = fakeApi();
    const opts = make({ api, key: false });
    expect(q('.mk-generate')).toBeNull();
    expect(q('.mk-nokey')!.textContent).toMatch(/OpenRouter/);
    click('.mk-skip');
    expect(creator!.step).toBe('who');
    expect(q('.mk-wears')).toBeNull();
    fill('.mk-name', 'Ash');
    click('.mk-keep');
    await flush();
    expect(api.draft).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(ID, { name: 'Ash', pronoun: 'they', background: '', wears: '' });
    expect(api.keep).not.toHaveBeenCalled();
    expect(opts.onKeep).toHaveBeenCalled();
  });

  it('setKey: a key linked since the creator opened brings GENERATE on LOOK', () => {
    const { api } = fakeApi();
    make({ api, key: false });
    expect(q('.mk-generate')).toBeNull();
    creator!.setKey(true);
    expect(q('.mk-generate')).not.toBeNull();
    expect(q('.mk-nokey')).toBeNull();
  });

  it('leaving with unkept takes: Enter at the question drops them and the draft', async () => {
    const { api } = fakeApi();
    const opts = make({ api });
    click('.mk-generate');
    await flush();
    press('Escape'); // FIT → LOOK
    press('Escape'); // asks
    press('Enter');
    await flush();
    expect(api.dropTakes).toHaveBeenCalledWith(ID);
    expect(api.remove).toHaveBeenCalledWith(ID);
    expect(opts.onCancel).toHaveBeenCalled();
  });

  it('leaving a fresh creator before any take makes no draft and asks nothing', () => {
    const { api } = fakeApi();
    const opts = make({ api });
    press('Escape');
    expect(api.draft).not.toHaveBeenCalled();
    expect(opts.onCancel).toHaveBeenCalled();
  });

  it('EDIT on someone made: opens on WHO with their fields; KEEP saves them and keeps their old figure', async () => {
    const { api } = fakeApi();
    const opts = make({ api, person: row({ figure: true, figureMade: 'x' }) });
    expect(creator!.step).toBe('who');
    expect(q<HTMLInputElement>('.mk-name')!.value).toBe('Vee');
    expect(q<HTMLTextAreaElement>('.mk-wears')!.value).toBe('a grey jacket');
    fill('.mk-name', 'Vee Okafor');
    click('.mk-keep');
    await flush();
    expect(api.save).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'Vee Okafor' }));
    expect(api.keep).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(opts.onKeep).toHaveBeenCalled();
  });

  it('EDIT: NEW FIGURE on WHO goes to LOOK to make another', () => {
    const { api } = fakeApi();
    make({ api, person: row({ figure: true, figureMade: 'x' }) });
    click('.mk-to-look');
    expect(creator!.step).toBe('look');
    expect(q('.mk-generate')).not.toBeNull();
  });

  it('EDIT, Esc with nothing new: back out without touching them', () => {
    const { api } = fakeApi();
    const opts = make({ api, person: row() });
    press('Escape');
    expect(api.remove).not.toHaveBeenCalled();
    expect(opts.onCancel).toHaveBeenCalled();
  });
});
