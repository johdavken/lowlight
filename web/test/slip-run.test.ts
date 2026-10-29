import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { generateSlip } from '../../shared/slip/generate';
import { grid, at } from '../../shared/slip/testing';
import type { Brief } from '../../shared/gig/brief';
import type { Dir, SlipBoard } from '../../shared/slip/rules';

const slip = (id: string, tier: Brief['tier']): Brief => ({ id, title: `Floor ${id}`, tier, kind: 'slip', place: 'the-tilt', client: 'A dancer', target: 'Glass Orchid · back office', take: 'a ledger page', text: `Brief for ${id}.` });
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
const key = (k: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const KEY_FOR: Record<Dir, string> = { 0: 'ArrowRight', 1: 'ArrowDown', 2: 'ArrowLeft', 3: 'ArrowUp' };

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

async function open(over: Partial<GigWindowOpts> = {}, briefs: Brief[] = [slip('s', 'medium')]) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'the-tilt', name: 'The Tilt', district: 'Karasu' },
    you: 'Hicks',
    contact: 'Nix',
    load: async () => briefs,
    onSend,
    onClose,
    reducedMotion: true,
    seed: () => 7,
    dev: true,
    generateSlip: async (tier, seed) => generateSlip(tier, seed),
    ...over,
  });
  await flush();
  return { onSend, onClose };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const devButton = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.gig-dev button')].find((b) => b.textContent === label)!;
const board = generateSlip('medium', 7)!;

describe('a slip run', () => {
  it('SLIP IN shows casing the floor, then the board', async () => {
    let resolve!: (b: SlipBoard | null) => void;
    await open({ generateSlip: () => new Promise((r) => (resolve = r)) });
    key('Enter');
    expect(text('.slip-loading')).toBe('> casing the floor…');
    resolve(board);
    await flush();
    expect($('.slip-loading')).toBeNull();
    expect($('.slip-screen')).not.toBeNull();
    expect(text('.slip-run-title')).toBe('Floor s');
  });

  it('a board that never resolves says so', async () => {
    await open({ generateSlip: async () => null });
    key('Enter');
    await flush();
    expect(text('.gig-error')).toBe("the floor won't resolve — try again");
  });

  it('the title bar reads ◢ FLOOR with the job, and [ESC] SLIP OUT', async () => {
    await open();
    key('Enter');
    await flush();
    expect(text('.gig-where')).toBe('◢ FLOOR // THE TILT · KARASU · FLOOR S');
    expect(text('.gig-jackout')).toBe('[ESC] SLIP OUT');
  });

  it('arrow keys move along the mapped direction; a blocked move toasts and passes no turn', async () => {
    await open();
    key('Enter');
    await flush();
    const entry = board.nodes[board.entry];
    const open_ = ([0, 1, 2, 3] as Dir[]).find((d) => entry.adj[d] >= 0 && !board.guards.some((g) => g.poses[g.startPi][0] === entry.adj[d]))!;
    const shut = ([0, 1, 2, 3] as Dir[]).find((d) => entry.adj[d] < 0)!;
    key(KEY_FOR[shut]);
    expect(text('.slip-toast')).toBe('no way through');
    expect(text('.slip-turn')).toBe('T+00');
    key(KEY_FOR[open_]);
    expect(text('.slip-turn')).toBe('T+01');
  });

  it('space waits', async () => {
    await open();
    key('Enter');
    await flush();
    key(' ');
    expect(text('.slip-turn')).toBe('T+01');
    expect(text('.slip-log')).toContain('waited');
  });

  it('N aims: Tab cycles, Enter throws (a charge spent, a log line); Esc cancels without arming SLIP OUT or closing', async () => {
    const { onClose } = await open();
    key('Enter');
    await flush();
    key('n');
    expect(host.querySelectorAll('.slip-aim').length).toBeGreaterThan(1);
    const first = $('.slip-aim-cur')!.getAttribute('data-id');
    key('Tab');
    expect($('.slip-aim-cur')!.getAttribute('data-id')).not.toBe(first);
    expect(win.handleEscape()).toBe(true);
    expect($('.slip-aim')).toBeNull();
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    key('n');
    key('Enter');
    expect(text('.slip-kit .slip-num')).toBe('2 / 3');
    expect(text('.slip-log')).toContain('noise');
  });

  it('J with no camera in range toasts', async () => {
    await open();
    key('Enter');
    await flush();
    key('j');
    expect(text('.slip-toast')).toBe('no camera in range');
  });

  it('SHOW SOLUTION to the end → CLEAN, [ENTER] WALK AWAY; Enter sends once, with the kind', async () => {
    const { onSend } = await open();
    key('Enter');
    await flush();
    for (let i = 0; i < board.solution.length; i++) devButton('SHOW SOLUTION ▸').click();
    await flush();
    expect(text('.gig-result-big')).toBe('CLEAN');
    expect(text('.gig-send')).toBe('[ENTER] WALK AWAY');
    expect(text('.gig-result-detail')).toBe('a ledger page · heat 0/8');
    key('Enter');
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ kind: 'slip', place: 'the-tilt', brief: 's', result: 'clean', trace: 0, max: 8, seed: 7 });
  });

  it('a catch → CAUGHT, sent as caught', async () => {
    const trap = grid(['E...T']);
    trap.guards = [{ kind: 'post', poses: [[at(trap, 2), 2]], startPi: 0 }];
    const { onSend } = await open({ generateSlip: async () => trap });
    key('Enter');
    await flush();
    key('ArrowRight');
    key(' ');
    await flush();
    expect(text('.gig-result-big')).toBe('CAUGHT');
    expect(text('.gig-result-detail')).toBe('nothing taken · heat 4/8');
    key('Enter');
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ kind: 'slip', result: 'caught', trace: 4, max: 8 }));
  });

  it('a late board for a job you left is ignored', async () => {
    const pending: Record<string, (b: SlipBoard | null) => void> = {};
    await open({ generateSlip: (tier) => new Promise((r) => (pending[tier] = r)) }, [slip('e', 'easy'), slip('m', 'medium')]);
    const go = [...host.querySelectorAll<HTMLButtonElement>('.gig-job-go')];
    go[0].click();
    go[1].click();
    pending.medium(board);
    await flush();
    pending.easy(generateSlip('easy', 3));
    await flush();
    expect(text('.slip-run-title')).toBe('Floor m');
    expect(host.querySelectorAll('.slip-screen')).toHaveLength(1);
  });

  it('Esc twice mid-run closes with no send', async () => {
    const { onSend, onClose } = await open();
    key('Enter');
    await flush();
    win.handleEscape();
    expect(text('.gig-esc-prompt')).toBe('[ESC] again to slip out');
    win.handleEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('HEAT turns red within 2 of the maximum', async () => {
    const b = grid(['E....T'], { max: 5 });
    b.guards = [{ kind: 'post', poses: [[at(b, 3), 2]], startPi: 0 }];
    await open({ generateSlip: async () => b });
    key('Enter');
    await flush();
    key('ArrowRight');
    expect($('.slip-heat.slip-hot')).toBeNull();
    key('ArrowRight');
    expect(text('.slip-heat .slip-num')).toBe('3 / 5');
    expect($('.slip-heat.slip-hot')).not.toBeNull();
  });

  it('caught in a booth: the log says the guard found you in the booth', async () => {
    const b = grid(['E.H..T']);
    const [u2, u3, u4] = [at(b, 2), at(b, 3), at(b, 4)];
    b.guards = [{ kind: 'pace', poses: [[u4, 2], [u3, 2], [u2, 2], [u2, 0], [u3, 0], [u4, 0]], startPi: 0 }];
    await open({ generateSlip: async () => b, reducedMotion: false });
    key('Enter');
    await flush();
    key('ArrowRight');
    key('ArrowRight');
    expect(text('.slip-log')).toContain('✕ G-01 found you in the booth');
  });

  it('an Esc in the beat before the result never leaves "[ESC] again to slip out" on the result screen', async () => {
    const b = grid(['E...T']);
    b.guards = [{ kind: 'post', poses: [[at(b, 2), 2]], startPi: 0 }];
    await open({ generateSlip: async () => b, reducedMotion: false });
    key('Enter');
    await flush();
    key('ArrowRight');
    key(' ');
    win.handleEscape();
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(text('.gig-result-big')).toBe('CAUGHT');
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(true);
  });

  it('with SLIP OUT armed, aiming or picking a node clears the prompt', async () => {
    await open();
    key('Enter');
    await flush();
    win.handleEscape();
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(false);
    key('n');
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(true);
    win.handleEscape();
    expect($('.slip-aim')).toBeNull();
    win.handleEscape();
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(false);
    const far = board.nodes.find((n) => board.dist[board.entry][n.id] > 1)!;
    host.querySelector(`g.slip-pad[data-id="${far.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(true);
  });

  it("the title bar's SLIP OUT button slips out even while aiming (it's not Esc)", async () => {
    const { onClose } = await open();
    key('Enter');
    await flush();
    key('n');
    $<HTMLButtonElement>('.gig-jackout')!.click();
    expect($<HTMLElement>('.gig-esc-prompt')!.hidden).toBe(false);
    $<HTMLButtonElement>('.gig-jackout')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dev: SHOW SOLUTION after playing away restarts clean: the log starts over, and it works with the kit lowered', async () => {
    const easy = generateSlip('easy', 3)!;
    expect(easy.solution.some((a) => a.k === 'noise')).toBe(true);
    await open({ generateSlip: async () => easy }, [slip('e', 'easy')]);
    key('Enter');
    await flush();
    key(' ');
    expect(text('.slip-log')).toContain('waited');
    devButton('−').click();
    devButton('−').click();
    devButton('−').click();
    devButton('SHOW SOLUTION ▸').click();
    expect(text('.slip-log')).not.toContain('waited');
    for (let i = 1; i < easy.solution.length; i++) devButton('SHOW SOLUTION ▸').click();
    await flush();
    expect(text('.gig-result-big')).toBe('CLEAN');
  });
});
