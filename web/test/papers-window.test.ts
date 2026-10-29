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
  const onSend = vi.fn();
  const music = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'ferry-stairs', name: 'The Ferry Stairs', district: 'Tidal Isle' },
    you: 'Ines',
    contact: 'Nix',
    load: async () => briefs,
    loadPapers: async () => ({ ...data, firstNight }),
    onSend,
    onClose: vi.fn(),
    reducedMotion: true,
    seed: () => 42,
    music,
    ...over,
  });
  await flush();
  return { onSend, music };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const buttonText = (t: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t);

describe('a papers job on the board', () => {
  it('shows ◢ DESK, its cap and SIT DOWN', async () => {
    await open();
    const cap = papersBoard('medium', 42, data).cap;
    expect(text('.gig-job-kind')).toBe('◢ DESK');
    expect(text('.gig-job-foot span')).toBe(`RISK ${cap}`);
    expect(text('.gig-job-go')).toBe('SIT DOWN');
  });

  it('SIT DOWN puts the desk up under ◢ DESK // THE FERRY STAIRS · the title, with its music', async () => {
    const { music } = await open();
    key('Enter');
    expect($('.pp-desk')).not.toBeNull();
    expect(text('.gig-where')).toBe('◢ DESK // THE FERRY STAIRS · Desk m');
    expect(text('.gig-jackout')).toBe('[ESC] WALK AWAY');
    expect(music).toHaveBeenLastCalledWith('papers');
  });

  it('Esc asks before walking away; STAY goes back to the desk', async () => {
    await open();
    key('Enter');
    expect(win.handleEscape()).toBe(true);
    expect(text('.gig-confirm p')).toBe('Walk away? The client goes back on the boat.');
    buttonText('STAY')!.click();
    expect($('.gig-confirm')).toBeNull();
    expect($('.pp-desk')).not.toBeNull();
  });

  it('WALK AWAY ends the run turned back, and sends it as back', async () => {
    const { onSend } = await open();
    key('Enter');
    win.handleEscape();
    buttonText('WALK AWAY')!.click();
    expect(text('.gig-result-big')).toBe('TURNED BACK');
    key('Enter');
    const b = papersBoard('medium', 42, data);
    expect(onSend).toHaveBeenCalledWith({ kind: 'papers', place: 'ferry-stairs', brief: 'm', result: 'back', trace: 0, max: b.cap, seed: 42, papers: { overlooked: null } });
  });

  it('a handed-over run sends its seed, cap and booth nine', async () => {
    const { onSend } = await open();
    key('Enter');
    host.querySelectorAll<HTMLButtonElement>('.pp-booth')[0].click();
    buttonText('HAND OVER')!.click();
    expect($('.gig-result')).not.toBeNull();
    key('Enter');
    expect(onSend.mock.calls[0][0]).toMatchObject({ kind: 'papers', seed: 42, papers: { overlooked: 0 } });
  });

  it('the first night: every papers card deals it, and the run goes out as seed 0', async () => {
    const { onSend } = await open({}, [desk('e', 'easy'), desk('m', 'medium')], true);
    const cap = papersBoard('easy', 0, data).cap;
    expect([...host.querySelectorAll('.gig-job-foot span')].map((x) => x.textContent)).toEqual([`RISK ${cap}`, `RISK ${cap}`]);
    key('Enter');
    expect(host.querySelectorAll('.pp-officer-note').length).toBeGreaterThan(0);
    win.handleEscape();
    buttonText('WALK AWAY')!.click();
    key('Enter');
    expect(onSend.mock.calls[0][0].seed).toBe(0);
  });

  it('without the first night pending, a card deals from the window seed', async () => {
    await open({}, [desk('m', 'medium')], false);
    key('Enter');
    expect(host.querySelectorAll('.pp-officer-note')).toHaveLength(0);
  });

  it('no papers data: the card shows RISK alone, and SIT DOWN says the desk will not resolve', async () => {
    await open({ loadPapers: () => Promise.reject(new Error('down')) });
    expect(text('.gig-job-foot span')).toBe('RISK');
    key('Enter');
    expect(text('.gig-error')).toBe("the desk won't resolve — try again");
  });

  it('a refused send offers SEND AGAIN (Review Focus 1)', async () => {
    await open();
    key('Enter');
    buttonText('HAND OVER')!.click();
    key('Enter');
    win.showRefusal("that run doesn't add up");
    expect(text('.gig-refusal')).toBe("that run doesn't add up");
    expect(text('.gig-send')).toBe('[ENTER] SEND AGAIN');
  });

  it('Tab and Enter in a select stay the select’s', async () => {
    await open();
    key('Enter');
    const sel = $<HTMLSelectElement>('select[data-f="trade"]')!;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    sel.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    sel.dispatchEvent(enter);
    expect($('.pp-booth-view')).toBeNull();
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
    expect(text('.gig-boot')).toContain("street kit · 3 charges · forger's kit · Ines · Nix on comms");
  });

  it('SIT DOWN starts the desk at the top, not where the job board was scrolled', async () => {
    await open();
    const scroll = $('.gig-scroll')!;
    let top = 640;
    Object.defineProperty(scroll, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
    key('Enter');
    expect(top).toBe(0);
  });

  it('no CRT over the desk: the scanlines are off while a papers run is up (spec §5)', async () => {
    await open();
    expect($('.gig-window')!.classList.contains('gig-papers-run')).toBe(false);
    key('Enter');
    expect($('.gig-window')!.classList.contains('gig-papers-run')).toBe(true);
    win.handleEscape();
    buttonText('WALK AWAY')!.click();
    expect($('.gig-window')!.classList.contains('gig-papers-run')).toBe(false);
  });
});

describe('final review fixes', () => {
  it('Esc during the walk-through offers nothing: the officer is already reading (finding 4)', async () => {
    await open({ reducedMotion: false });
    key('Enter');
    buttonText('HAND OVER')!.click();
    expect(win.handleEscape()).toBe(true);
    expect($('.gig-confirm')).toBeNull();
  });

  it('with the confirm up, u and r never reach the desk behind it (finding 5)', async () => {
    await open();
    key('Enter');
    const trade = () => $<HTMLSelectElement>('select[data-doc="id"][data-f="trade"]')!;
    trade().value = 'dock labor';
    trade().dispatchEvent(new Event('change', { bubbles: true }));
    win.handleEscape();
    (document.activeElement as HTMLElement | null)?.blur();
    key('r');
    key('u');
    buttonText('STAY')!.click();
    expect(trade().value).toBe('dock labor');
  });
});
