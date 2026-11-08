import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brief } from '../../shared/gig/brief';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';
import { papersBoard } from '../../shared/papers/generate';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { jobCard } from '../src/ui/gig/job-card';

const desk = (id: string, tier: Brief['tier']): Brief => ({ id, title: `Desk ${id}`, tier, kind: 'papers', place: 'ferry-stairs', client: 'A dock family', target: 'Tidal Isle · booth nine', take: 'one crossing', text: `Brief for ${id}.` });
const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces: [], reasons: [...DEFAULT_REASONS] };
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
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

async function open(over: Partial<GigWindowOpts> = {}, briefs: Brief[] = [desk('m', 'medium')], firstNight = false) {
  const onSit = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'ferry-stairs', name: 'The Ferry Stairs', district: 'Tidal Isle' },
    you: 'Ines',
    contact: 'Nix',
    load: async () => briefs,
    loadPapers: async () => ({ ...data, firstNight }),
    onSit,
    onClose: vi.fn(),
    reducedMotion: true,
    seed: () => 42,
    ...over,
  });
  await flush();
  return { onSit };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;

describe('a papers job on the board', () => {
  it('shows ◢ DESK, its cap and SIT DOWN', async () => {
    await open();
    const cap = papersBoard('medium', 42, data).cap;
    expect(text('.gig-job-kind')).toBe('◢ DESK');
    expect(text('.gig-job-foot span')).toBe(`RISK ${cap}`);
    expect(text('.gig-job-go')).toBe('SIT DOWN');
  });

  it('SIT DOWN hands the job and its dealt board over (the board goes up over the room)', async () => {
    const { onSit } = await open();
    key('Enter');
    expect(onSit).toHaveBeenCalledTimes(1);
    const { brief, board } = onSit.mock.calls[0][0];
    expect(brief.id).toBe('m');
    expect(board).toEqual(papersBoard('medium', 42, data));
  });

  it('the first night: every papers card deals it, seed 0 with the officer’s notes', async () => {
    const { onSit } = await open({}, [desk('e', 'easy'), desk('m', 'medium')], true);
    const cap = papersBoard('easy', 0, data).cap;
    expect([...host.querySelectorAll('.gig-job-foot span')].map((x) => x.textContent)).toEqual([`RISK ${cap}`, `RISK ${cap}`]);
    key('Enter');
    const { board } = onSit.mock.calls[0][0];
    expect(board.seed).toBe(0);
    expect(board.notes.length).toBeGreaterThan(0);
  });

  it('without the first night pending, a card deals from the window seed', async () => {
    const { onSit } = await open({}, [desk('m', 'medium')], false);
    key('Enter');
    expect(onSit.mock.calls[0][0].board.seed).toBe(42);
    expect(onSit.mock.calls[0][0].board.notes).toHaveLength(0);
  });

  it('no papers data: the card shows RISK alone, and SIT DOWN says the desk will not resolve', async () => {
    await open({ loadPapers: () => Promise.reject(new Error('down')) });
    expect(text('.gig-job-foot span')).toBe('RISK');
    key('Enter');
    expect(text('.gig-error')).toBe("the desk won't resolve — try again");
  });
});

describe('the job card', () => {
  it('papers without a dealt cap reads RISK alone', () => {
    const card = jobCard(desk('x', 'hard'), {});
    expect(card.querySelector('.gig-job-foot span')!.textContent).toBe('RISK');
    expect(card.querySelector('.gig-job-kind')!.textContent).toBe('◢ DESK');
  });
  it('with a cap and a go button', () => {
    const card = jobCard(desk('x', 'hard'), { cap: 9, onJackIn: () => {} });
    expect(card.querySelector('.gig-job-foot span')!.textContent).toBe('RISK 9');
    expect(card.querySelector('.gig-job-go')!.textContent).toBe('SIT DOWN');
  });
});

describe('found in the browser check', () => {
  it("the boot line names the forger's kit (spec §3.1)", async () => {
    await open();
    expect(text('.gig-boot')).toContain("> forger's kit · Ines · Nix on comms");
  });
});
