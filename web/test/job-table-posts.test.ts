import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountJobTable, tipsFor } from '../src/room/table/job-table';
import type { QuestState } from '../../shared/types';

type Active = NonNullable<QuestState['active']>;
const pool = (stat: string, dice: number, position: 'dark' | 'open' | 'wire') => ({ stat, base: dice, dice, parts: [], position, noDeck: false });
const koji = { id: 'koji', name: 'Koji Marsh', spec: 'muscle' as const, grade: 1 as const, face: null, traits: [], free: 1, risk: null, down: false, abilities: [] };
const A: Active = {
  id: 'night-clerk',
  title: 'Night Clerk',
  beat: 'stairwell',
  choices: [
    { id: 'force', line: 'Force the fire door.', pool: pool('BODY', 2, 'open'), plays: { koji: { dice: 2, position: 'dark' }, dez: { dice: 3, position: 'open' } } },
    { id: 'wait', line: 'Wait out the laundry shift.', pool: pool('WITS', 2, 'open'), plays: { koji: { dice: 3, position: 'open' }, dez: { dice: 3, position: 'open' } } },
    { id: 'leave', line: 'Leave it.' },
  ],
  alarm: 1,
  nerve: { left: 4, max: 5 },
  take: { filled: 1, size: 4 },
  heat: 0,
  pay: [360, 440],
  hand: { approach: 'quiet', people: [koji, { ...koji, id: 'dez', name: 'Dez Vance', spec: 'runner' as const }, { ...koji, id: 'moss', name: 'Moss Ade', spec: 'fence' as const, free: 0 }, { ...koji, id: 'ash', name: 'Ash Lee', down: true }, { ...koji, id: 'guest-noa', name: 'Noa Reyes', guest: true }], favour: null, contacts: [] },
};
const POST = { id: 'door', line: 'Someone holds the service door.', gives: 'The way out stays open.', suits: 'muscle' as const };
const P: Active = { ...A, post: POST };

const one = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const mount = () => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const onChoose = vi.fn();
  const t = mountJobTable(g, { onChoose, onTalk: vi.fn(), reduced: () => true });
  return { t, onChoose };
};
const choice = (id: string) => one(`.tb-deal .tb-card[data-choice="${id}"]`);
const slot = (id: string) => one(`.tb-hand .tb-slot[data-id="${id}"]`);
const post = () => one('.tb-post');
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('a fork and a post (routes and posts spec §1–§2)', () => {
  it('shows LEADS TO only on a fork', () => {
    const { t } = mount();
    t.show({ ...A, choices: [{ ...A.choices[0], leads: 'THE DESK' }, { ...A.choices[1], leads: 'THE STAIRWELL' }, A.choices[2]] });
    expect(choice('force').querySelector('.tb-leads')!.textContent).toBe('LEADS TO THE DESK');
    expect(choice('wait').querySelector('.tb-leads')!.textContent).toBe('LEADS TO THE STAIRWELL');
    expect(choice('leave').querySelector('.tb-leads')).toBeNull();
    t.show({ ...A, beat: 'desk' });
    expect(all('.tb-leads')).toEqual([]);
  });

  it('shows the POST slot with its line and promise, and none on a beat without one', () => {
    const { t } = mount();
    t.show(A);
    expect(document.querySelector('.tb-post')).toBeNull();
    t.show(P);
    expect(post().textContent).toContain('Someone holds the service door.');
    expect(post().textContent).toContain('The way out stays open.');
    expect(post().textContent).toContain('NO CALL OR ABILITY FOR THE REST OF THE JOB');
    expect(post().textContent).toContain('SUITS MUSCLE');
    t.show(A);
    expect(document.querySelector('.tb-post')).toBeNull();
  });

  it('a tap on a ready recruit while the slot is armed marks them, a second tap takes them back', () => {
    const { t } = mount();
    t.show(P);
    post().click();
    expect(post().classList.contains('armed')).toBe(true);
    slot('koji').click();
    expect(post().textContent).toContain('KOJI GOES');
    expect(post().classList.contains('armed')).toBe(false);
    // Marked for the post, they aren't lifted for a call.
    expect(choice('leave').textContent).not.toContain('NO CARD HERE');
    post().click();
    expect(post().textContent).not.toContain('KOJI GOES');
  });

  it('the pick carries the marked recruit, once', () => {
    const { t, onChoose } = mount();
    t.show(P);
    post().click();
    slot('koji').click();
    choice('force').click();
    expect(onChoose).toHaveBeenLastCalledWith('force', { post: 'koji' });
    t.show(P);
    choice('wait').click();
    expect(onChoose).toHaveBeenLastCalledWith('wait', {});
  });

  it('O arms the slot', () => {
    const { t } = mount();
    t.show(P);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    expect(post().classList.contains('armed')).toBe(true);
  });

  it('a guest and a downed recruit cannot be marked', () => {
    const { t } = mount();
    t.show(P);
    for (const id of ['guest-noa', 'ash']) {
      post().click();
      slot(id).click();
      // (An armed slot reads PICK WHO GOES, so the class says it.)
      expect(post().classList.contains('marked')).toBe(false);
      if (post().classList.contains('armed')) post().click();
    }
  });

  it("a posted recruit's card reads AT THE DOOR and is locked; the slot says who holds it", () => {
    const { t } = mount();
    t.show({ ...P, post: { ...POST, by: 'koji' }, hand: { ...P.hand!, people: P.hand!.people.map((p) => (p.id === 'koji' ? { ...p, free: 0, at: 'DOOR' } : p)) } });
    expect(slot('koji').textContent).toContain('AT THE DOOR');
    expect(slot('koji').dataset.state).toBe('locked');
    expect(slot('koji').classList.contains('away')).toBe(true);
    expect(post().textContent).toContain('KOJI HOLDS IT');
    post().click();
    expect(post().classList.contains('armed')).toBe(false);
  });

  it('offers the post tip while the post is open', () => {
    expect(tipsFor(P)).toContain('post');
    expect(tipsFor(A)).not.toContain('post');
    expect(tipsFor({ ...P, post: { ...POST, by: 'koji' } })).not.toContain('post');
  });

  // Review fixes (the table's fresh review, 2026-11-14).
  it('an armed tap marks the recruit tapped and leaves a lifted call alone', () => {
    const { t, onChoose } = mount();
    t.show(P);
    slot('dez').click();
    expect(choice('force').textContent).toContain('●●●');
    post().click();
    slot('koji').click();
    expect(post().textContent).toContain('KOJI GOES');
    expect(slot('dez').classList.contains('lifted')).toBe(true);
    choice('force').click();
    expect(onChoose).toHaveBeenLastCalledWith('force', { card: 'dez', post: 'koji' });
  });

  it('someone who plays at the end can still be sent', () => {
    const { t, onChoose } = mount();
    t.show(P);
    post().click();
    slot('moss').click();
    expect(post().textContent).toContain('MOSS GOES');
    choice('wait').click();
    expect(onChoose).toHaveBeenLastCalledWith('wait', { post: 'moss' });
  });

  it('armed, a tap on someone who cannot go is a tap like any other, and the post stays armed', () => {
    const { t } = mount();
    t.show(P);
    post().click();
    slot('guest-noa').click();
    expect(post().classList.contains('armed')).toBe(true);
    expect(post().classList.contains('marked')).toBe(false);
  });

  it('a marked recruit called on the pick is called, not sent', () => {
    const { t, onChoose } = mount();
    t.show(P);
    post().click();
    slot('koji').click();
    slot('koji').click();
    expect(post().classList.contains('marked')).toBe(false);
    choice('force').click();
    expect(onChoose).toHaveBeenLastCalledWith('force', { card: 'koji' });
  });

  it('the strip goes when the job ends', () => {
    const { t } = mount();
    t.show(P);
    expect(document.querySelector('.tb-post')).not.toBeNull();
    t.end('Night Clerk', 'Out.', document.createElement('div'));
    expect(document.querySelector('.tb-post')).toBeNull();
  });

  it('a held O does not toggle the post', () => {
    const { t } = mount();
    t.show(P);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', repeat: true }));
    expect(post().classList.contains('armed')).toBe(true);
  });
});
