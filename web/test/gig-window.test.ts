import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { candidates, enterPreview, watchLine } from '../src/ui/gig/hack-run';
import { generate } from '../../shared/gig/generate';
import { solve } from '../../shared/gig/solve';
import { act, startRun, type Board, type NodeType } from '../../shared/gig/rules';
import type { Brief } from '../../shared/gig/brief';

const brief = (id: string, tier: Brief['tier']): Brief => ({ id, title: `Job ${id}`, tier, place: 'the-tilt', client: 'A courier', target: 'Voltaic · ledger', take: 'one line', text: `Brief for ${id}.` });
const BRIEFS = [brief('h', 'hard'), brief('e', 'easy'), brief('m', 'medium')];
const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

let host: HTMLElement;
let win: GigWindow;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  win?.destroy();
  host.remove();
});

async function open(over: Partial<GigWindowOpts> = {}) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'the-tilt', name: 'The Tilt', district: 'Karasu' },
    you: 'Hicks',
    contact: 'Nix',
    load: async () => BRIEFS,
    onSend,
    onClose,
    reducedMotion: true,
    seed: () => 7,
    ...over,
  });
  await flush();
  return { onSend, onClose };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const clickNode = (id: number) => $(`g.gig-node[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('jobs', () => {
  it('boots the deck and deals one job per tier, easy to hard', async () => {
    await open();
    expect(text('.gig-where')).toBe('◢ GRID // THE TILT · KARASU · 3 JOBS');
    expect(text('.gig-jackout')).toBe('[ESC] JACK OUT');
    expect(text('.gig-boot')).toContain("> patched deck · 3 RAM · street kit · 3 charges · forger's kit · Hicks · Nix on comms");
    const cards = [...host.querySelectorAll('.gig-job')];
    expect(cards.map((c) => c.querySelector('.gig-job-tier')!.textContent)).toEqual(['EASY ▮▯▯', 'MEDIUM ▮▮▯', 'HARD ▮▮▮']);
    expect(cards[0].querySelector('.gig-job-title')!.textContent).toBe('Job e');
    expect(cards[0].textContent).toContain('CLIENTA courier');
    expect(cards[0].textContent).toContain('Brief for e.');
    expect(cards[0].textContent).toContain('TRACE 10');
  });

  it('a slip card is dealt as ◢ FLOOR with SLIP IN and HEAT', async () => {
    await open({ load: async () => [{ ...brief('s', 'medium'), kind: 'slip' }] });
    expect(text('.gig-job-kind')).toBe('◢ FLOOR');
    expect(text('.gig-job-go')).toBe('SLIP IN');
    expect(text('.gig-job-foot')).toContain('HEAT 8');
    expect(text('.gig-hint')).toBe('[←/→] PICK · [ENTER] GO · [ESC] CLOSE');
  });

  it('nothing posted: says so, and Esc closes', async () => {
    const { onClose } = await open({ load: async () => [] });
    expect(text('.gig-empty')).toBe('no jobs posted here tonight');
    expect(text('.gig-empty-close')).toBe('[ESC] CLOSE');
    expect(win.handleEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed load reads as nothing posted', async () => {
    await open({ load: () => Promise.reject(new Error('down')) });
    expect(text('.gig-empty')).toBe('no jobs posted here tonight');
  });

  it('[ENTER] runs the first job; a card button runs its own', async () => {
    await open();
    key('Enter');
    expect(text('.gig-run-title')).toBe('Job e');
    win.destroy();
    await open();
    $<HTMLButtonElement>('.gig-job:nth-child(3) .gig-job-go')!.click();
    expect(text('.gig-run-title')).toBe('Job h');
  });
});

describe('picking a job with the pointer', () => {
  const at = (sel: string, type: string, x: number, y: number) => $(sel)!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

  it("a pointer resting where the window opened doesn't pick the card under it; moving over a card does", async () => {
    await open();
    // The board opens under a still pointer: the browser reports it over the second card.
    at('.gig-job:nth-child(2)', 'mouseenter', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    key('Enter');
    expect(text('.gig-run-title')).toBe('Job e');
    win.destroy();
    await open();
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 310, 204);
    key('Enter');
    expect(text('.gig-run-title')).toBe('Job m');
  });
});

describe('a run', () => {
  const b = generate('easy', 7);

  it('the title bar reads ◢ GRID for a hack run', async () => {
    await open();
    key('Enter');
    expect(text('.gig-where')).toBe('◢ GRID // THE TILT · KARASU · EASY');
  });

  it('starts with the deck full and the meter empty, par marked', async () => {
    await open();
    key('Enter');
    expect(text('.gig-rambox .gig-num')).toBe('3 / 3');
    expect(text('.gig-tracebox .gig-num')).toBe(`0 / ${b.max} · clean ≤ ${b.par}`);
  });

  it('[TAB] cycles only the nodes in reach', async () => {
    await open();
    key('Enter');
    const want = candidates(startRun(b));
    const seen: number[] = [];
    for (let i = 0; i < want.length; i++) {
      key('Tab');
      seen.push(Number($('g.gig-node.gig-sel')!.getAttribute('data-id')));
    }
    expect(seen).toEqual(want);
    key('Tab');
    expect(Number($('g.gig-node.gig-sel')!.getAttribute('data-id'))).toBe(want[0]);
  });

  it('[P] probes for 1 RAM; [E] takes; the log is newest first', async () => {
    await open();
    key('Enter');
    const fog = candidates(startRun(b)).find((id: number) => !['ICE2', 'ICE3', 'SENTRY', 'TARGET'].includes(b.nodes[id].type))!;
    clickNode(fog);
    key('p');
    expect(text('.gig-rambox .gig-num')).toBe('2 / 3');
    key('e');
    expect($(`g.gig-node[data-id="${fog}"]`)!.classList.contains('gig-held')).toBe(true);
    const lines = [...host.querySelectorAll('.gig-log div')].map((d) => d.textContent);
    const enterAt = lines.findIndex((l) => /^> enter( blind)? n\d+/.test(l ?? ''));
    const probeAt = lines.findIndex((l) => /^> probe n\d+/.test(l ?? ''));
    expect(enterAt).toBeGreaterThanOrEqual(0);
    expect(probeAt).toBeGreaterThan(enterAt);
  });

  it('PROBE is disabled at 0 RAM', async () => {
    await open({ ram: 0 });
    key('Enter');
    const fog = candidates(startRun(b)).find((id: number) => !['ICE2', 'ICE3', 'SENTRY', 'TARGET'].includes(b.nodes[id].type))!;
    clickNode(fog);
    const probe = $<HTMLButtonElement>('.gig-act-probe')!;
    expect(probe.disabled).toBe(true);
    expect(probe.title).toBe('out of RAM');
    expect(text('.gig-rambox .gig-num')).toContain('out — go in blind');
  });

  it("the solver's route, then [ENTER], wins CLEAN; [ENTER] [ENTER] sends once (Review Focus 1)", async () => {
    const { onSend } = await open();
    key('Enter');
    for (const id of solve(b).path!.slice(1)) {
      clickNode(id);
      key('e');
    }
    key('Enter');
    expect(text('.gig-result-big')).toBe('CLEAN');
    expect(text('.gig-send')).toBe('[ENTER] JACK OUT');
    key('Enter');
    key('Enter');
    $<HTMLButtonElement>('.gig-send')?.click();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ kind: 'hack', place: 'the-tilt', brief: 'e', result: 'clean', trace: b.best, max: b.max, seed: 7 });
  });

  it('a refusal shows on the result screen and [ENTER] SEND AGAIN sends again', async () => {
    const { onSend } = await open();
    key('Enter');
    for (const id of solve(b).path!.slice(1)) (clickNode(id), key('e'));
    key('Enter');
    key('Enter');
    win.showRefusal('wait for her to finish');
    expect(text('.gig-refusal')).toBe('wait for her to finish');
    expect(text('.gig-send')).toBe('[ENTER] SEND AGAIN');
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});

describe('Esc (Review Focus 2)', () => {
  it('mid-run: the first asks, the second jacks out without sending', async () => {
    const { onSend, onClose } = await open();
    key('Enter');
    expect(win.handleEscape()).toBe(true);
    expect(text('.gig-esc-prompt')).toBe('[ESC] again to jack out');
    expect(onClose).not.toHaveBeenCalled();
    expect(win.handleEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('on the jobs screen, one Esc closes', async () => {
    const { onClose } = await open();
    expect(win.handleEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the title bar button does what Esc does', async () => {
    const { onClose } = await open();
    $<HTMLButtonElement>('.gig-jackout')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('destroyed mid-run (the map closed under it): gone, nothing sent', async () => {
    const { onSend } = await open();
    key('Enter');
    win.destroy();
    expect(host.querySelector('.gig-window')).toBeNull();
    key('Enter');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('edges', () => {
  it("a board that won't resolve says so", async () => {
    await open({ generate: () => { throw new Error('no board'); } });
    key('Enter');
    expect(text('.gig-error')).toBe("the board won't resolve — try again");
  });

  it('a later seed is tried when the first fails', async () => {
    const tries: number[] = [];
    await open({ generate: (tier: Parameters<typeof generate>[0], seed: number) => { tries.push(seed); if (tries.length < 3) throw new Error('no'); return generate(tier, seed); } });
    key('Enter');
    expect(tries).toEqual([7, 8, 9]);
    expect(text('.gig-run-title')).toBe('Job e');
  });

  it('a short stage: the window scrolls inside itself (Review Focus 5; no narrow layout on the fixed stage)', () => {
    const css = readFileSync('web/src/ui/gig/gig.css', 'utf8');
    expect(css).toMatch(/\.gig-term\s*\{[^}]*max-height:\s*calc\(900px/);
    expect(css).toMatch(/\.gig-scroll\s*\{[^}]*overflow:\s*auto/);
  });
});

/** A board from a type list in a line: 0 ENTRY … last TARGET, each linked to the next. */
function line(types: NodeType[], max = 10): Board {
  return { tier: 'easy', seed: 1, max, nodes: types.map((type, id) => ({ id, type, col: id, row: 0.5 })), links: types.slice(1).map((_, i) => [i, i + 1] as [number, number]), entry: 0, target: types.length - 1, best: 4, par: 6, routes: 1 };
}

describe('enterPreview', () => {
  it('names the verb and the cost, blind for fog', () => {
    expect(enterPreview(startRun(line(['ENTRY', 'RELAY', 'TARGET'])), 1)).toEqual({ verb: 'ENTER BLIND', cost: 1, danger: false, wouldTrace: false });
    expect(enterPreview(startRun(line(['ENTRY', 'ICE3', 'TARGET'])), 1)).toMatchObject({ verb: 'BREACH', cost: 3 });
    expect(enterPreview(startRun(line(['ENTRY', 'SENTRY', 'TARGET'])), 1)).toMatchObject({ verb: 'BLIND IT', cost: 3 }); // 2 + its own watch
  });
  it('a known trap is dangerous at its full cost; a cost past the max would trace', () => {
    const b = line(['ENTRY', 'TRAP', 'TARGET']);
    const seen = { ...startRun(b), seen: new Set([1]) };
    expect(enterPreview(seen, 1)).toEqual({ verb: 'ENTER', cost: 4, danger: true, wouldTrace: false });
    expect(enterPreview({ ...seen, trace: 7 }, 1)).toEqual({ verb: 'ENTER', cost: 4, danger: true, wouldTrace: true });
  });
});

describe('watchLine', () => {
  it('says who is watching and what the key does', () => {
    const b = line(['ENTRY', 'SENTRY', 'TARGET']);
    expect(watchLine(startRun(b))).toBe('◉ 1 sentry watching · every action +1');
    expect(watchLine({ ...startRun(b), key: true })).toBe('◉ 1 sentry watching · every action +1 · ⚷ key held · lacquer costs 1');
    expect(watchLine(startRun(line(['ENTRY', 'RELAY', 'TARGET'])))).toBe('');
  });
});

describe('candidates', () => {
  it('nodes in reach, then the target once held', () => {
    const b = line(['ENTRY', 'RELAY', 'TARGET']);
    const s = startRun(b);
    expect(candidates(s)).toEqual([1]);
    const r1 = act(s, { kind: 'enter', node: 1 });
    const r2 = r1.ok ? act(r1.state, { kind: 'enter', node: 2 }) : r1;
    expect(r2.ok && candidates(r2.state)).toEqual([2]);
  });
});

describe('final review fixes', () => {
  const b = generate('easy', 7);
  const win7 = async () => {
    const r = await open();
    key('Enter');
    for (const id of solve(b).path!.slice(1)) (clickNode(id), key('e'));
    key('Enter');
    expect(text('.gig-result-big')).toBe('CLEAN');
    return r;
  };

  it('Esc on the result screen never drops the result; the only way out is [ENTER] JACK OUT (review I1)', async () => {
    const { onSend, onClose } = await win7();
    expect(win.handleEscape()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect($<HTMLButtonElement>('.gig-jackout')!.hidden).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('after a refusal, Esc may drop it (spec §8)', async () => {
    const { onClose } = await win7();
    key('Enter');
    win.showRefusal('wait for her to finish');
    expect($<HTMLButtonElement>('.gig-jackout')!.hidden).toBe(false);
    win.handleEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keys it doesn't use never reach the room behind it: a letter, Enter before the target (review I2)", async () => {
    await open();
    key('Enter');
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    for (const k of ['t', 'x', 'Enter', ' ']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('typing in a field outside the window (the dev panel) is left alone; so is the admin key', async () => {
    await open();
    key('Enter');
    const field = document.createElement('input');
    document.body.append(field);
    const typed = new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true });
    field.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect($('g.gig-node.gig-held')!.getAttribute('data-id')).toBe(String(b.entry));
    field.remove();
    const admin = new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true });
    document.body.dispatchEvent(admin);
    expect(admin.defaultPrevented).toBe(false);
  });
});

describe('deferred minors', () => {
  const b = generate('easy', 7);
  const toTarget = async () => {
    const r = await open();
    key('Enter');
    for (const id of solve(b).path!.slice(1)) (clickNode(id), key('e'));
    return r;
  };

  it('a held Enter (auto-repeat) neither pulls nor sends; a fresh press does', async () => {
    const { onSend } = await toTarget();
    key('Enter', { repeat: true });
    expect(text('.gig-result-big')).toBeNull();
    key('Enter');
    expect(text('.gig-result-big')).toBe('CLEAN');
    key('Enter', { repeat: true });
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('no answer after sending: back to SEND AGAIN, and Esc can leave', async () => {
    const { onSend, onClose } = await toTarget();
    vi.useFakeTimers();
    try {
      key('Enter');
      key('Enter');
      expect(onSend).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(9_999);
      expect(text('.gig-refusal')).toBeNull();
      vi.advanceTimersByTime(1);
      expect(text('.gig-refusal')).toBe('no answer — check the link and send again');
      expect(text('.gig-send')).toBe('[ENTER] SEND AGAIN');
      win.handleEscape();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroyed while waiting: the timer does nothing', async () => {
    await toTarget();
    vi.useFakeTimers();
    try {
      key('Enter');
      key('Enter');
      win.destroy();
      expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
      expect(host.querySelector('.gig-refusal')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the scanlines cover the whole window: they sit outside the scrolling part', async () => {
    await open();
    expect($('.gig-term > .gig-scan')).not.toBeNull();
    expect($('.gig-term > .gig-scroll > .gig-view')).not.toBeNull();
  });
});

describe('dev strip (Slip final review minors)', () => {
  const b = generate('easy', 7);
  const dev = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.gig-dev button')].find((x) => x.textContent === label)!;

  it('REVEAL BOARD survives RERUN SAME BOARD and NEW BOARD', async () => {
    await open({ dev: true });
    key('Enter');
    dev('REVEAL BOARD').click();
    dev('RERUN SAME BOARD').click();
    expect(dev('HIDE BOARD')).toBeTruthy();
    dev('NEW BOARD').click();
    expect(dev('HIDE BOARD')).toBeTruthy();
  });

  it("the result screen's dev line keeps the board: seed, nodes, routes, best and par", async () => {
    await open({ dev: true });
    key('Enter');
    for (const id of solve(b).path!.slice(1)) (clickNode(id), key('e'));
    key('Enter');
    expect(text('.gig-result-big')).toBe('CLEAN');
    expect(text('.gig-dev')).toContain(`DEV · seed 7 · ${b.nodes.length} nodes · ${b.routes} routes · best ${b.best}/${b.max} · par ${b.par}`);
  });
});

