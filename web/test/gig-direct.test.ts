import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { generate } from '../../shared/gig/generate';
import { solve } from '../../shared/gig/solve';
import { generateSlip } from '../../shared/slip/generate';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';
import type { Brief } from '../../shared/gig/brief';

const brief = (kind: Brief['kind'], tier: Brief['tier'] = 'easy'): Brief => ({ id: 'north-gate-gig', title: 'North Gate', tier, kind, place: 'haes-noodles', client: 'the fixer', target: 'North Gate', take: 'the job', text: 'A courier keeps getting through.' });
const papers: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces: [], reasons: [...DEFAULT_REASONS] };
const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

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

async function open(b: Brief, seed: number, over: Partial<GigWindowOpts> = {}) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  const load = vi.fn(async () => []);
  win = new GigWindow(host, {
    place: { id: 'haes-noodles', name: "Hae's Noodles", district: 'Karasu' },
    you: 'Hicks',
    contact: 'Nix',
    load,
    onSend,
    onClose,
    reducedMotion: true,
    direct: { brief: b, seed },
    generateSlip: async (tier, s) => generateSlip(tier, s),
    loadPapers: async () => ({ ...papers, firstNight: false }),
    ...over,
  });
  await flush();
  await flush();
  return { onSend, onClose, load };
}
const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const clickNode = (id: number) => $(`g.gig-node[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('the gig window, direct', () => {
  it('opens straight onto the run for that brief and seed (hack, slip, papers); no jobs list', async () => {
    const hack = await open(brief('hack'), 7);
    expect(hack.load).not.toHaveBeenCalled();
    expect($('.gig-job')).toBeNull();
    expect($('g.gig-node')).not.toBeNull();
    win.destroy();
    await open(brief('slip'), 11);
    expect($('.gig-job')).toBeNull();
    expect(host.querySelector('.gig-tbar')!.textContent).toContain('FLOOR');
    win.destroy();
    await open(brief('papers', 'medium'), 5);
    expect($('.gig-job')).toBeNull();
    expect(host.querySelector('.pp-run, .pp-desk')).not.toBeNull();
  });

  it("its result goes to onSend once, with the route's seed; CONTINUE closes", async () => {
    const { onSend, onClose } = await open(brief('hack'), 7);
    const b = generate('easy', 7);
    for (const id of solve(b).path!.slice(1)) {
      clickNode(id);
      key('e');
    }
    key('Enter');
    expect($('.gig-result-big')!.textContent).toBe('CLEAN');
    key('Enter');
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toMatchObject({ kind: 'hack', result: 'clean', seed: 7 });
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc walks away as a failure of that kind', async () => {
    const { onSend, onClose } = await open(brief('hack'), 7);
    key('Escape');
    key('Escape');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toMatchObject({ kind: 'hack', result: 'traced', seed: 7 });
    expect(onClose).toHaveBeenCalled();
  });
});
