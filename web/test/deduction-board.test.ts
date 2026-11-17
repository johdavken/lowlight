import { afterEach, describe, expect, it, vi } from 'vitest';
import { COUNT_MS, mountDeduction } from '../src/room/table/deduction';
import type { BoardView } from '../../shared/deduction';

afterEach(() => document.body.replaceChildren());

// The deduction board's screen (spec 2026-11-09 §4): it draws the server's view and sends moves.
const VIEW: BoardView = {
  case: 'mini',
  title: 'Mini',
  hand: [
    { id: 'ONE', kind: 'street', source: 'HAE', line: 'First.' },
    { id: 'TWO', kind: 'said', source: 'A SAYS', line: 'Second.' },
    { id: 'THREE', kind: 'grid', source: 'THE NET', line: 'Third.' },
  ],
  missing: [{ source: 'THE BOOK', missed: 'Job 1: the crack failed.', n: 2 }],
  filed: [{ id: 'X', blank: 'WHO', text: 'x holds.' }],
  blanks: {},
  suspects: [
    { name: 'A', face: 'sdg-01', role: 'One.', slug: 'a' },
    { name: 'B', face: 'sdg-02', role: 'Two.', slug: 'b' },
  ],
  suspect: null,
  patience: 2,
  patienceMax: 3,
  tried: { 'ONE|TWO': 'filed', 'ONE|THREE': 'bounced' },
  accuseOpen: false,
};
function board(v: Partial<BoardView> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onMove = vi.fn();
  const b = mountDeduction(host, { onMove });
  b.show({ ...VIEW, ...v });
  const q = (s: string) => host.querySelector<HTMLElement>(s)!;
  const all = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
  const card = (id: string) => q(`.dd-hand .dd-card[data-id="${id}"]`);
  return { host, b, onMove, q, all, card };
}

describe('the deduction board screen', () => {
  it('given a side (the trace table), DEDUCTIONS and NOT IN YOUR HAND stand there, go with the board, and leave with it; a pinned slot unpins on a click', () => {
    const host = document.createElement('div');
    const side = document.createElement('div');
    document.body.append(host, side);
    const b = mountDeduction(host, { onMove: vi.fn(), side });
    b.show(VIEW);
    expect(side.querySelector('.dd-dcol .dd-ded[data-id="X"]')).toBeTruthy();
    expect(side.querySelector('.dd-dcol .dd-missing')!.textContent).toContain('THE BOOK');
    expect(host.querySelector('.dd-dcol')).toBeNull();
    expect(host.querySelector<HTMLElement>('.dd-hand')!.dataset.n).toBe('3');
    b.missing(false);
    expect(side.querySelector<HTMLElement>('.dd-dcol')!.hidden).toBe(true);
    b.missing(true);
    expect(side.querySelector<HTMLElement>('.dd-dcol')!.hidden).toBe(false);
    host.querySelector<HTMLElement>('.dd-hand .dd-fs[data-id="TWO"]')!.click();
    const sw = host.querySelector<HTMLElement>('.dd-sw')!;
    expect(sw.dataset.k).toBe('said');
    sw.click();
    expect(host.querySelector('.dd-sw .dd-card')).toBeNull();
    expect(sw.dataset.k).toBeUndefined();
    // Without a side (a phone) the slot's box does nothing: the card in it unpins itself.
    const plain = board();
    plain.card('TWO').click();
    plain.q('.dd-sw').click();
    expect(plain.q('.dd-sw .dd-card')).toBeTruthy();
    b.destroy();
    expect(side.querySelector('.dd-dcol')).toBeNull();
  });
  it("clicking two cards then THEY CAN'T BOTH BE TRUE sends a pair move", () => {
    const t = board();
    t.card('TWO').click();
    t.card('THREE').click();
    t.q('.dd-press').click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'pair', a: 'TWO', b: 'THREE' });
  });
  it('a picked card marks the cards tried with it TRIED or FILED', () => {
    const t = board();
    t.card('ONE').click();
    expect(t.card('TWO').querySelector('.dd-badge')!.textContent).toBe('FILED');
    expect(t.card('THREE').querySelector('.dd-badge')!.textContent).toBe('TRIED');
  });
  it('naming a suspect sends it, and the named one opens its WHO, HOW and WHY under the portrait', () => {
    const t = board();
    t.all('.dd-sus .dd-pick')[1].click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'name', suspect: 'B' });
    const named = board({ suspect: 'A' });
    expect(named.q('.dd-suspect.on').textContent).toContain('A');
    expect(named.all('.dd-suspect.on .dd-blank').map((b) => b.dataset.b)).toEqual(['WHO', 'HOW', 'WHY']);
    expect(named.all('.dd-suspect:not(.on) .dd-blank')).toHaveLength(0);
  });
  it('with nobody named there are no blanks, a hint says how to open them, and ACCUSE heads the deductions column', () => {
    const t = board({ patience: 0, accuseOpen: true });
    expect(t.all('.dd-blank')).toHaveLength(0);
    expect(t.q('.dd-hint').hidden).toBe(false);
    expect(t.q('.dd-dcol .dd-accuse')).toBeTruthy();
    // First in the column, so a long list of deductions never scrolls it out of sight (playtest, 2026-11-11).
    expect(t.q('.dd-dcol').firstElementChild!.classList.contains('dd-accuse')).toBe(true);
    t.q('.dd-accuse').click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'accuse' });
    expect(board({ suspect: 'A' }).q('.dd-suspect.on .dd-accuse')).toBeTruthy();
  });
  it("each blank is one row: its word, and an empty slot asks the spec's question (mockup accuse-panel.html D)", () => {
    const t = board({ suspect: 'A' });
    expect(t.all('.dd-blank .dd-q').map((x) => x.textContent)).toEqual(['WHO', 'HOW', 'WHY']);
    expect(t.all('.dd-blank .dd-bslot').map((x) => x.textContent)).toEqual(['PUTS YOUR SUSPECT AT THE SCENE', 'HOW HE REALLY DIED', "YOUR SUSPECT'S REASON"]);
  });
  it('ACCUSE is a bar under the named portrait, not laid over it', () => {
    const col = board({ suspect: 'A' }).q('.dd-suspect.on > .dd-pcol')!;
    expect([...col.children].map((c) => c.className)).toEqual(['dd-pick', 'dd-accuse']);
  });
  it('the hand is a fan of fixed strips, one per card, and clicking a strip picks its card', () => {
    const t = board();
    expect(t.all('.dd-hand > .dd-fs').map((s) => s.dataset.id)).toEqual(['ONE', 'TWO', 'THREE']);
    t.q('.dd-fs[data-id="ONE"]').click();
    expect(t.card('ONE').classList.contains('used')).toBe(true);
    expect(t.q('.dd-slot .dd-card[data-id="ONE"]')).toBeTruthy();
  });
  it('NOT IN YOUR HAND lists the missing cards with their lines', () => {
    expect(board().q('.dd-missing').textContent).toContain("THE BOOK · 2 CARDS");
    expect(board().q('.dd-missing').textContent).toContain('Job 1: the crack failed.');
  });
  it('ACCUSE is disabled until the view says it is open', () => {
    expect((board().q('.dd-accuse') as HTMLButtonElement).disabled).toBe(true);
    const t = board({ accuseOpen: true });
    t.q('.dd-accuse').click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'accuse' });
  });
  it('clicking a deduction then a blank sends a file move', () => {
    const t = board({ suspect: 'A' });
    t.q('.dd-ded[data-id="X"]').click();
    t.q('.dd-blank[data-b="WHO"] .dd-bslot').click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'file', deduction: 'X', blank: 'WHO' });
  });
  it("say() shows the board's line", () => {
    const t = board();
    t.b.say('They can both be true.');
    expect(t.q('.dd-verdict').textContent).toBe('They can both be true.');
  });
});

describe('while she speaks (final review I3)', () => {
  it('the board says who is on the line, takes no picks, and keeps nothing half-picked', () => {
    const t = board();
    t.card('TWO').click();
    t.b.hold('Nix');
    expect(t.host.querySelector('.tb-dboard')!.classList.contains('held')).toBe(true);
    expect(t.q('.dd-held').textContent).toBe('NIX ON THE LINE');
    t.card('THREE').click();
    t.q('.dd-press').click();
    expect(t.onMove).not.toHaveBeenCalled();
    t.b.hold(null);
    expect(t.host.querySelector('.tb-dboard')!.classList.contains('held')).toBe(false);
    t.card('THREE').click();
    t.q('.dd-press').click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'pair', a: 'TWO', b: 'THREE' });
  });
});

describe('the card faces (as the accounts board, no pictures)', () => {
  const ART = { ...VIEW, hand: VIEW.hand.map((c) => ({ ...c, art: `/api/cases/art/mini/${c.id.toLowerCase()}.webp` })) };
  it('a card is the accounts board\'s face with no picture (playtest 2026-11-12): its name, its kind, its line showing', () => {
    const t = board(ART);
    const c = t.card('TWO');
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('.dd-nm')!.textContent).toBe('A SAYS');
    expect(c.querySelector('.dd-ft')!.textContent).toBe(c.dataset.k!.toUpperCase());
    expect(c.querySelector('.dd-line')!.textContent).toBe('Second.');
  });
  it("a pinned card's words print under its slot, and an empty slot's caption is empty", () => {
    const t = board(ART);
    t.q('.dd-fs[data-id="TWO"]').click();
    const caps = t.all('.dd-against .dd-cap');
    expect(caps).toHaveLength(2);
    expect(caps[0].querySelector('.dd-cap-src')!.textContent).toBe('A SAYS');
    expect(caps[0].querySelector('.dd-cap-line')!.textContent).toBe('Second.');
    expect(caps[1].textContent).toBe('');
  });
  it('a card with a picture on file still shows no picture, only its words', () => {
    expect(board().card('ONE').querySelector('.dd-line')!.textContent).toBeTruthy();
    expect(board({ ...VIEW, hand: VIEW.hand.map((c) => ({ ...c, art: '/x.webp' })) }).card('ONE').querySelector('img')).toBeNull();
  });
});

describe("Nix's barks at the board (The Fourteenth voice script)", () => {
  const clip = (g: string, n: number) => Array.from({ length: n }, (_, i) => `/v/${g}-${i}.ogg`);
  const BARKS = { clips: { bounce1: clip('bounce1', 3), bounce2: clip('bounce2', 3), gone: clip('gone', 3), clash: clip('clash', 3), kat: clip('kat', 1) }, on: { kat: ['X'] } };
  const V: BoardView = { ...VIEW, filed: [], patience: 3, barks: BARKS };
  const heard = () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onBark = vi.fn();
    const b = mountDeduction(host, { onMove: vi.fn(), onBark });
    const group = () => (onBark.mock.calls.at(-1)?.[0] as string | undefined)?.split('/').pop()?.split('-')[0];
    return { b, onBark, group };
  };
  it('the first show of a board says nothing', () => {
    const t = heard();
    t.b.show({ ...V, patience: 1 });
    expect(t.onBark).not.toHaveBeenCalled();
  });
  it('a bounce plays bounce1, the next bounce2, and the last box gone', () => {
    const t = heard();
    t.b.show(V);
    t.b.show({ ...V, patience: 2 });
    expect(t.group()).toBe('bounce1');
    t.b.show({ ...V, patience: 1 });
    expect(t.group()).toBe('bounce2');
    t.b.show({ ...V, patience: 0 });
    expect(t.group()).toBe('gone');
  });
  it("a filed deduction plays clash, and the case's kat deductions play kat the first time", () => {
    const t = heard();
    const f = (ids: string[]) => ids.map((id) => ({ id, blank: 'WHO' as const, text: id }));
    t.b.show(V);
    t.b.show({ ...V, filed: f(['Y']) });
    expect(t.group()).toBe('clash');
    t.b.show({ ...V, filed: f(['Y', 'X']) });
    expect(t.group()).toBe('kat');
  });
  it("the same clip doesn't play twice running", () => {
    const t = heard();
    let v: BoardView = { ...V, patience: 9, patienceMax: 9 };
    t.b.show(v);
    const urls: string[] = [];
    for (let p = 7; p >= 1; p--) {
      v = { ...v, patience: p };
      t.b.show(v);
      urls.push(t.onBark.mock.calls.at(-1)![0] as string);
    }
    for (let i = 1; i < urls.length; i++) expect(urls[i]).not.toBe(urls[i - 1]);
  });
  it('a board with no clips says nothing', () => {
    const t = heard();
    t.b.show({ ...V, barks: undefined });
    t.b.show({ ...V, barks: undefined, patience: 2 });
    expect(t.onBark).not.toHaveBeenCalled();
  });
});

describe("THEY CAN'T BOTH BE TRUE counts it out (playtest 2026-11-11)", () => {
  const barks = { clips: { bounce1: ['/b1.ogg'], clash: ['/c.ogg'] }, on: {} };
  function counting(o: { reduced?: boolean } = {}) {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.append(host);
    const onMove = vi.fn();
    const onBark = vi.fn();
    const onCue = vi.fn();
    const b = mountDeduction(host, { onMove, onBark, onCue, reduced: () => !!o.reduced });
    b.show({ ...VIEW, tried: {}, patience: 3, barks });
    const q = (s: string) => host.querySelector<HTMLElement>(s)!;
    const strip = (id: string) => q(`.dd-hand .dd-fs[data-id="${id}"]`);
    strip('TWO').click();
    strip('THREE').click();
    return { host, b, onMove, onBark, onCue, q };
  }
  afterEach(() => vi.useRealTimers());

  it('3, 2, 1 with the pair still pinned; what the server says waits for the count, then lands with her bark', () => {
    const { host, b, onMove, onBark, onCue, q } = counting();
    q('.dd-press').click();
    // The move goes at once; the board counts, the two cards stay in their slots.
    expect(onMove).toHaveBeenCalledWith({ kind: 'pair', a: 'TWO', b: 'THREE' });
    expect(host.querySelector('.tb-dboard')!.classList.contains('counting')).toBe(true);
    expect(host.querySelectorAll('.dd-slot .dd-card')).toHaveLength(2);
    expect(q('.dd-count').textContent).toBe('3');
    // The server's answer arrives mid count: a box of patience lost and the verdict. Neither shows yet.
    b.show({ ...VIEW, tried: { 'TWO|THREE': 'bounced' }, patience: 2, barks });
    b.say('Rain keeps nobody home.');
    expect(q('.dd-verdict').textContent).toBe('');
    expect(onBark).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COUNT_MS);
    expect(q('.dd-count').textContent).toBe('2');
    vi.advanceTimersByTime(COUNT_MS);
    expect(q('.dd-count').textContent).toBe('1');
    expect(onCue.mock.calls.filter(([c]) => c === 'count').map(([, n]) => n)).toEqual([3, 2, 1]);
    vi.advanceTimersByTime(COUNT_MS);
    // It lands: the count goes, the slots clear, the verdict stamps in red (a bounce), her bounce bark plays.
    expect(q('.dd-count').hidden).toBe(true);
    expect(host.querySelector('.tb-dboard')!.classList.contains('counting')).toBe(false);
    expect(host.querySelectorAll('.dd-slot .dd-card')).toHaveLength(0);
    expect(q('.dd-verdict').textContent).toBe('Rain keeps nobody home.');
    expect(q('.dd-verdict').classList.contains('miss')).toBe(true);
    expect(onBark).toHaveBeenCalledWith('/b1.ogg');
    expect(onCue).toHaveBeenCalledWith('result');
  });

  it('a deduction filed lands in amber, with the clash bark', () => {
    const { b, onBark, q } = counting();
    q('.dd-press').click();
    b.show({ ...VIEW, tried: { 'TWO|THREE': 'filed' }, patience: 3, filed: [...VIEW.filed, { id: 'Y', blank: 'HOW', text: 'y holds.' }], barks });
    b.say('Y holds.');
    vi.advanceTimersByTime(3 * COUNT_MS);
    expect(q('.dd-verdict').classList.contains('hit')).toBe(true);
    expect(onBark).toHaveBeenCalledWith('/c.ogg');
  });

  it('under reduced motion there is no count: the result lands as it comes', () => {
    const { host, b, onBark, q } = counting({ reduced: true });
    q('.dd-press').click();
    expect(host.querySelector('.tb-dboard')!.classList.contains('counting')).toBe(false);
    b.show({ ...VIEW, tried: { 'TWO|THREE': 'bounced' }, patience: 2, barks });
    expect(onBark).toHaveBeenCalledWith('/b1.ogg');
  });

  it('a new case mid count ends it and draws the new board', () => {
    const { host, b, q } = counting();
    q('.dd-press').click();
    b.show({ ...VIEW, case: 'other', title: 'Other' });
    expect(host.querySelector('.tb-dboard')!.classList.contains('counting')).toBe(false);
    expect(q('.dd-count').hidden).toBe(true);
  });
});
