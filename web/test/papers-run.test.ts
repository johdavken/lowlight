import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';
import { papersBoard, type PapersBoard } from '../../shared/papers/generate';
import type { Brief } from '../../shared/gig/brief';
import type { RunEnd, RunHost } from '../src/ui/papers/run-host';
import { PapersRun } from '../src/ui/papers/run';
import type { DeskRegions } from '../src/ui/papers/desk-view';

const faces = (['u25', 'mid', 'o40'] as const).map((p, i) => ({ id: `${p}-01`, band: (['under 25', '25–40', 'over 40'] as const)[i], looks: [(['under 25', '25–40', 'over 40'] as const)[i]] }));
const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces, reasons: [...DEFAULT_REASONS] };
const brief: Brief = { id: 'night-crossing', title: 'Night Crossing', tier: 'medium', kind: 'papers', place: 'ferry-stairs', client: 'A dock family', target: 'Tidal Isle · booth nine', take: 'one crossing', text: 'At four.' };

let view: HTMLElement;
let strip: HTMLElement;
let regions: DeskRegions;
let run: PapersRun | null = null;
beforeEach(() => {
  view = document.createElement('div');
  strip = document.createElement('div');
  const part = () => view.appendChild(document.createElement('div'));
  regions = { root: view, top: part(), log: part(), middle: part(), levers: part(), bottom: part() };
  document.body.append(view, strip);
});
afterEach(() => {
  run?.destroy();
  run = null;
  view.remove();
  strip.remove();
  vi.useRealTimers();
});

function start(board: PapersBoard, over: Partial<RunHost> = {}) {
  const ended: [RunEnd, string][] = [];
  const cues: string[] = [];
  const host: RunHost = {
    cue: (n) => cues.push(n),
    disarm: () => {},
    repaint: () => {},
    ended: (e, d) => ended.push([e, d]),
    dev: false,
    reducedMotion: true,
    ...over,
  };
  run = new PapersRun(host, { brief, board }, { name: 'The Ferry Stairs' }, host.dev);
  run.mount(regions, strip);
  return { ended, cues };
}
const $ = <T extends Element = HTMLElement>(sel: string) => view.querySelector(sel) as T | null;
const $$ = (sel: string) => [...view.querySelectorAll<HTMLElement>(sel)];
const pick = (doc: string, f: string, v: string) => {
  const s = $<HTMLSelectElement>(`select[data-doc="${doc}"][data-f="${f}"]`)!;
  s.value = v;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};
const press = (k: string, init: KeyboardEventInit = {}, target?: Element) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return run!.key(e);
};
const button = (text: string) => $$('button').find((b) => b.textContent === text)!;
const first = () => papersBoard('easy', 0, data);
/** Booth nine's token picked up, then put on rule i. */
const lookPast = (i: number) => {
  $('.pp-token')!.click();
  $$('.pp-booth')[i].click();
};

describe('the desk', () => {
  it('a field changed on one paper changes it on every paper, and RISK follows', () => {
    const { cues } = start(first());
    pick('id', 'trade', 'dock labor');
    expect($<HTMLSelectElement>('select[data-doc="permit"][data-f="trade"]')!.value).toBe('dock labor');
    expect($('.pp-risk')!.textContent).toBe('2');
    expect(cues).toContain('papers:pick');
  });

  it('an edit past the cap is refused: the select keeps its value and the meter shakes', () => {
    const { cues } = start(first(), { reducedMotion: false });
    pick('id', 'origin', 'Varna');
    pick('permit', 'district', 'Velvet');
    pick('id', 'trade', 'freight');
    pick('transit', 'arrival', 'this week');
    expect($<HTMLSelectElement>('select[data-doc="transit"][data-f="arrival"]')!.value).toBe('last week');
    expect($('.pp-meter')!.classList.contains('pp-shake')).toBe(true);
    expect(cues.at(-1)).toBe('papers:refuse');
  });

  it('UNDO by button and by u', () => {
    start(first());
    pick('id', 'trade', 'dock labor');
    pick('id', 'age', '25–40');
    button('UNDO').click();
    expect($<HTMLSelectElement>('select[data-doc="id"][data-f="age"]')!.value).toBe('over 40');
    expect(press('u')).toBe(true);
    expect($<HTMLSelectElement>('select[data-doc="id"][data-f="trade"]')!.value).toBe('clinic');
  });

  it('clicking a rule cycles its note', () => {
    start(first());
    const rule = () => $$('.pp-rule-text')[1];
    rule().click();
    expect($$('.pp-note')[1].textContent).toBe('✓');
    rule().click();
    expect($$('.pp-note')[1].textContent).toBe('?');
  });

  it('booth nine is a token: picked up, every rule offers a place; put down, one rule is marked and the token says which', () => {
    start(first());
    expect($$('.pp-booth')).toHaveLength(0);
    $('.pp-token')!.click();
    expect($$('.pp-booth')).toHaveLength(3);
    $$('.pp-booth')[1].click();
    expect($$('.pp-booth.pp-on')).toHaveLength(1);
    expect($$('.pp-booth')).toHaveLength(1);
    expect($('.pp-token')!.textContent).toBe('⌁ON RULE 2');
    // The token takes him back; picked up again, he goes to another rule.
    $('.pp-token')!.click();
    expect($$('.pp-booth')).toHaveLength(0);
    lookPast(2);
    expect($$('li').map((li) => li.classList.contains('pp-looked'))).toEqual([false, false, true]);
  });

  it('a face from the pool, or a silhouette when the band has none (Review Focus 2)', () => {
    start(first());
    expect($<HTMLImageElement>('.pp-photo img')!.getAttribute('src')).toBe('/api/papers/faces/o40-01.jpg');
    run!.destroy();
    start(papersBoard('easy', 0, { ...data, faces: [] }));
    expect($('.pp-photo img')).toBeNull();
    expect($('.pp-photo svg')).not.toBeNull();
  });

  it('the ID card prints the name, ID number and issue date as text', () => {
    const b = first();
    start(b);
    expect($('.pp-idname')!.textContent).toBe(b.name);
    expect($('.pp-idmeta')!.textContent).toContain(b.idNumber);
    expect($('.pp-mrz')!.textContent).toMatch(/^ARR<<LWL</);
  });

  it('easy warns about a photo that will not pass; medium never warns', () => {
    start(first());
    pick('id', 'age', '25–40');
    expect($('.pp-warn')!.textContent).toBe("the photo won't pass for that age");
    run!.destroy();
    const m = papersBoard('medium', 42, data);
    start(m);
    const other = m.face.looks.includes('under 25') ? 'over 40' : 'under 25';
    pick('id', 'age', other);
    expect($('.pp-warn')).toBeNull();
  });

  it('the hint follows the tier', () => {
    start(first());
    expect($('.pp-hint')!.textContent).toBe("The desk flags a photo that won't pass. It never tells you whether a rule passes.");
    run!.destroy();
    start(papersBoard('medium', 42, data));
    expect($('.pp-hint')!.textContent).toBe('The desk tells you nothing. The bulletin is all you get.');
  });

  it('the first night pins the officer’s notes, and GOT IT clears them', () => {
    const b = first();
    start(b);
    expect($$('.pp-officer-note')).toHaveLength(b.notes.length);
    $$('.pp-officer-note button')[0].click();
    expect($$('.pp-officer-note')).toHaveLength(b.notes.length - 1);
    button('GOT IT').click();
    expect($$('.pp-officer-note')).toHaveLength(0);
  });
});

describe('the handover', () => {
  it('one walk-through for a double click, a held Enter, or Enter in a select (Review Focus 4)', () => {
    vi.useFakeTimers();
    const { ended, cues } = start(first(), { reducedMotion: false });
    expect(press('Enter', {}, $('select')!)).toBe(false);
    expect($('.pp-booth-view')).toBeNull();
    const hand = button('HAND OVER');
    hand.click();
    hand.click();
    press('Enter', { repeat: true });
    press('Enter');
    expect($$('.pp-booth-view')).toHaveLength(1);
    expect(cues.filter((c) => c === 'papers:slide')).toHaveLength(1);
    vi.advanceTimersByTime(380 * 10 + 2000);
    expect(ended).toHaveLength(1);
  });

  it('with reduced motion every line is there at once, and the run ends with the papers detail', () => {
    const b = first();
    const { ended } = start(b);
    lookPast(2);
    pick('id', 'trade', 'dock labor');
    button('HAND OVER').click();
    expect($$('.pp-check')).toHaveLength(2 + b.rules.length);
    expect($$('.pp-check.pp-looked')).toHaveLength(1);
    expect(ended).toEqual([[{ result: 'clean', meter: 2, max: b.cap, seed: 0, papers: { overlooked: 2 }, devLine: expect.any(String) }, `risk 2/${b.cap} · best ${b.minWith}`]]);
  });

  it('turned back names the first failed check', () => {
    const b = first();
    const { ended } = start(b);
    button('HAND OVER').click();
    expect(ended[0][0].result).toBe('back');
    expect(ended[0][1]).toBe(`risk 0/${b.cap} · best ${b.minWith} · Clinic workers need a medical slip.`);
  });

  it('the walk-through plays a cue per line', () => {
    const { cues } = start(first());
    button('HAND OVER').click();
    expect(cues.filter((c) => c === 'papers:check' || c === 'papers:fail').length).toBe(5);
    expect(cues).toContain('papers:back');
  });
});

describe('the dev strip', () => {
  it('shows the seed and the best, and SHOW BEST lists the changes', () => {
    start(papersBoard('medium', 42, data), { dev: true });
    expect(strip.textContent).toContain('seed 42');
    expect(strip.textContent).toMatch(/min \d+ · with booth \d+/);
    [...strip.querySelectorAll('button')].find((b) => b.textContent === 'SHOW BEST')!.click();
    expect(strip.querySelector('.pp-dev-best')!.textContent).not.toBe('');
  });
});

it('Escape drops a lifted card, then the picked-up token; otherwise it is the board’s', () => {
  start(first());
  expect(run!.escape()).toBe(false);
  $('[data-k="field-origin"]')!.click();
  expect(run!.escape()).toBe(true);
  expect($('.pp-field.pp-lift')).toBeNull();
  $('.pp-token')!.click();
  expect(run!.escape()).toBe(true);
  expect($$('.pp-booth')).toHaveLength(0);
  expect(run!.escape()).toBe(false);
});

describe('review fixes (Task 10)', () => {
  it('the walk-through stays inside the papers root, so its look carries over', () => {
    start(first());
    button('HAND OVER').click();
    expect($('.pp-run .pp-booth-view')).not.toBeNull();
  });

  it('a rule is a real button; Enter on it cycles nothing and hands nothing over', () => {
    start(first());
    const rule = $$('.pp-rule-text')[0];
    expect(rule.tagName).toBe('BUTTON');
    expect(press('Enter', {}, rule)).toBe(false);
    expect($('.pp-booth-view')).toBeNull();
  });

  it('u and r in a select are the select’s', () => {
    start(first());
    pick('id', 'trade', 'dock labor');
    expect(press('u', {}, $('select')!)).toBe(false);
    expect($<HTMLSelectElement>('select[data-doc="id"][data-f="trade"]')!.value).toBe('dock labor');
  });

  it('r resets the packet, the notes and booth nine', () => {
    start(first());
    pick('id', 'trade', 'dock labor');
    $$('.pp-rule-text')[0].click();
    lookPast(1);
    press('r');
    expect($<HTMLSelectElement>('select[data-doc="id"][data-f="trade"]')!.value).toBe('clinic');
    expect($$('.pp-note')[0].textContent).toBe('');
    expect($$('.pp-booth.pp-on')).toHaveLength(0);
  });

  it('focus stays on the control you used across the redraw', () => {
    start(first());
    $('.pp-token')!.click();
    $$('.pp-booth')[1].focus();
    $$('.pp-booth')[1].click();
    expect((document.activeElement as HTMLElement).dataset.k).toBe('booth-1');
    pick('id', 'trade', 'dock labor');
    const undo = button('UNDO');
    undo.focus();
    undo.click();
    expect((document.activeElement as HTMLElement).dataset.k).toBe('undo');
  });

  it('a refused edit keeps focus on its select', () => {
    start(first());
    pick('id', 'origin', 'Varna');
    pick('permit', 'district', 'Velvet');
    pick('id', 'trade', 'freight');
    const sel = $<HTMLSelectElement>('select[data-doc="transit"][data-f="arrival"]')!;
    sel.focus();
    pick('transit', 'arrival', 'this week');
    expect((document.activeElement as HTMLElement).dataset.f).toBe('arrival');
  });

  it('torn down mid walk-through, it never ends', () => {
    vi.useFakeTimers();
    const { ended } = start(first(), { reducedMotion: false });
    button('HAND OVER').click();
    run!.destroy();
    vi.advanceTimersByTime(20_000);
    expect(ended).toEqual([]);
  });

  it('names and reasons from the data files are text, never markup', () => {
    const b = { ...first(), name: '<b>Ines</b>' };
    b.rules = b.rules.map((r) => ({ ...r, why: '<img src=x onerror=alert(1)>' }));
    start(b);
    expect($('.pp-idname')!.textContent).toBe('<b>Ines</b>');
    expect(view.querySelector('.pp-idname b')).toBeNull();
    expect(view.querySelector('.pp-why img')).toBeNull();
  });

  it('missing stamp art: the desk and the booth both show the words', () => {
    const real = window.Image;
    class Broken {
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    (window as unknown as { Image: unknown }).Image = Broken;
    try {
      start(first());
      return Promise.resolve().then(() => {
        expect(view.classList.contains('pp-noart')).toBe(true);
        pick('id', 'trade', 'dock labor');
        expect(view.classList.contains('pp-noart')).toBe(true);
        button('HAND OVER').click();
        expect(view.classList.contains('pp-noart')).toBe(true);
      });
    } finally {
      (window as unknown as { Image: unknown }).Image = real;
    }
  });
});

it('a photo that will not load falls back to the silhouette (final review, finding 2)', () => {
  start(first());
  $('.pp-photo img')!.dispatchEvent(new Event('error'));
  expect($('.pp-photo img')).toBeNull();
  expect($('.pp-photo svg')).not.toBeNull();
});

describe('the renewal stamp has a slot of its own', () => {
  it('without one, an empty NO RENEWAL STAMP slot offers STAMP +2, like the medical slip', () => {
    start(first());
    const slot = $$('.pp-ghost').find((g) => g.textContent!.startsWith('NO RENEWAL STAMP'))!;
    expect(slot).toBeDefined();
    const btn = slot.querySelector('button')!;
    expect(btn.textContent).toBe('STAMP +2');
    btn.click();
    expect($('.pp-risk')!.textContent).toBe('2');
    expect($('.pp-renew')).not.toBeNull();
    expect($$('.pp-ghost').some((g) => g.textContent!.startsWith('NO RENEWAL STAMP'))).toBe(false);
  });
  it('stamped, the ticket stub takes it off again', () => {
    start(first());
    $$('.pp-ghost').find((g) => g.textContent!.startsWith('NO RENEWAL STAMP'))!.querySelector('button')!.click();
    const unstamp = $$('.pp-tstub button').find((b) => b.textContent === 'UNSTAMP')!;
    unstamp.click();
    expect($('.pp-risk')!.textContent).toBe('0');
    expect($$('.pp-tstub button')).toHaveLength(0);
  });
});

describe('the field hand', () => {
  const sel = (doc: string, f: string) => $<HTMLSelectElement>(`select[data-doc="${doc}"][data-f="${f}"]`)!;
  it('one card per field, with its value, where it prints, and what changing it costs', () => {
    const b = first();
    start(b);
    const cards = $$('.pp-field');
    expect(cards.map((c) => c.dataset.field)).toEqual(['origin', 'district', 'trade', 'age', 'sponsor', 'arrival']);
    const origin = cards[0];
    expect(origin.querySelector('.pp-val')!.textContent).toBe(b.truth.origin);
    expect(origin.querySelector('.pp-on')!.textContent).toBe('ON ID · TICKET');
    expect(origin.querySelector('.pp-cost')!.textContent).toBe('+2');
    expect(cards[4].querySelector('.pp-on')!.textContent).toBe('ON PERMIT + LETTER');
  });

  it('lifted, a card lists its values with their cost and lights its rows on every paper; a pick rewrites them all', () => {
    const b = first();
    const { cues } = start(b);
    $('[data-k="field-trade"]')!.click();
    expect($$('.pp-row.pp-lit').map((r) => r.dataset.f)).toEqual(['trade', 'trade']);
    const opts = $$('.pp-field.pp-lift .pp-opt');
    expect(opts.find((o) => o.classList.contains('pp-true'))!.dataset.v).toBe(b.truth.trade);
    const dock = opts.find((o) => o.dataset.v === 'dock labor')!;
    expect(dock.querySelector('small')!.textContent).toBe('+2');
    dock.click();
    expect(sel('id', 'trade').value).toBe('dock labor');
    expect(sel('permit', 'trade').value).toBe('dock labor');
    expect($('.pp-field.pp-lift')).toBeNull();
    const card = $('.pp-field[data-field="trade"]')!;
    expect(card.classList.contains('pp-forged')).toBe(true);
    expect(card.querySelector('.pp-tru')!.textContent).toBe(`TRUE: ${b.truth.trade}`);
    expect($('.pp-risk')!.textContent).toBe('2');
    expect(cues).toContain('papers:pick');
  });

  it('the sponsor card counts the letter it brings', () => {
    const b = papersBoard('medium', 42, data);
    start(b);
    $('[data-k="field-sponsor"]')!.click();
    const corp = $$('.pp-opt').find((o) => o.dataset.v === 'a corp')!;
    const t = b.truth.sponsor;
    expect(corp.querySelector('small')!.textContent).toBe(t === 'a corp' ? 'TRUE' : t === 'none' ? '+3' : '+2');
  });

  it('on easy the AGE card marks the ages the photo will not pass for; on medium it says nothing', () => {
    const b = first();
    start(b);
    $('[data-k="field-age"]')!.click();
    const bad = $$('.pp-opt.pp-photo-bad').map((o) => o.dataset.v);
    expect(bad).toEqual(['under 25', '25–40', 'over 40'].filter((v) => !(b.face.looks as string[]).includes(v)));
    run!.destroy();
    start(papersBoard('medium', 42, data));
    $('[data-k="field-age"]')!.click();
    expect($$('.pp-opt.pp-photo-bad')).toHaveLength(0);
  });

  it('a pick over the cap is refused and its card stays up for another', () => {
    const b = first();
    start(b);
    for (const [f, v] of [['origin', 'Varna'], ['district', 'Velvet'], ['trade', 'freight']] as const) {
      $(`[data-k="field-${f}"]`)!.click();
      $$('.pp-opt').find((o) => o.dataset.v === v)!.click();
    }
    $('[data-k="field-arrival"]')!.click();
    $$('.pp-opt').find((o) => o.dataset.v === 'this week')!.click();
    expect($('.pp-field.pp-lift')!.dataset.field).toBe('arrival');
  });

  it('the SPONSOR card at rest shows the cheapest change, the letter counted', () => {
    const b = first();
    start(b);
    const at = $('.pp-field[data-field="sponsor"] .pp-cost')!.textContent;
    expect(at).toBe(b.truth.sponsor === 'none' ? '+3' : '+1');
  });

  it('an UNDO that puts booth nine back never leaves the token in your hand too', () => {
    start(first());
    lookPast(1);
    $('.pp-token')!.click();
    $('.pp-token')!.click();
    expect($('.pp-token')!.classList.contains('pp-armed')).toBe(true);
    button('UNDO').click();
    expect($('.pp-token')!.classList.contains('pp-armed')).toBe(false);
    expect($('.pp-token')!.textContent).toBe('⌁ON RULE 2');
    expect($$('.pp-booth')).toHaveLength(1);
  });

  it('a pick keeps focus on its card', () => {
    start(first());
    $('[data-k="field-trade"]')!.click();
    const opt = $$('.pp-opt').find((o) => o.dataset.v === 'freight')!;
    opt.focus();
    opt.click();
    expect((document.activeElement as HTMLElement).dataset.k).toBe('field-trade');
  });
});

describe('the read on the board', () => {
  it('the checks fill the column, the rule cards take their marks, and the verdict says what she hears', () => {
    const b = first();
    start(b);
    lookPast(2);
    pick('id', 'trade', 'dock labor');
    button('HAND OVER').click();
    expect(regions.log.querySelectorAll('.pp-check')).toHaveLength(2 + b.rules.length);
    const cards = [...regions.bottom.querySelectorAll<HTMLElement>('.pp-rcard')];
    expect(cards).toHaveLength(b.rules.length);
    expect(cards[2].classList.contains('pp-looked')).toBe(true);
    expect(cards[2].querySelector('.pp-rmark')!.textContent).toBe('⌁');
    expect(regions.middle.querySelector('.pp-verdict-word')!.textContent).toBe('CLEAN');
    expect(regions.middle.querySelector('.pp-hears')!.textContent).toBe(`SHE HEARSResult: waved through clean, risk 2 of ${b.cap}.`);
    expect(regions.levers.childElementCount).toBe(0);
  });
});
