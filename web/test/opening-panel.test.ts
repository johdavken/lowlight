import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpeningSet } from '../src/net/scenario';
import { openOpeningPanel, OPENING_COPY, type OpeningPanelOptions } from '../src/room/opening-panel';

const SET: OpeningSet = {
  options: [
    { kind: 'history', title: 'The slip', text: '*The lamp is on.* The old slip is still on her desk.' },
    { kind: 'business', title: 'The packet', text: 'A sealed packet in his jacket.' },
    { kind: 'chance', title: 'The fuse', text: 'The power stutters.' },
  ],
  pair: { player: { id: 'hicks', name: 'Hicks' }, tie: 'She ran his court-ordered sessions.' },
};

let host: HTMLElement;
afterEach(() => host?.remove());
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function open(over: Partial<OpeningPanelOptions> = {}) {
  host = document.createElement('div');
  document.body.append(host);
  const onStart = vi.fn<(t: string) => string | null>(() => null);
  const onEdit = vi.fn<(t: string) => void>();
  const onCancel = vi.fn();
  const onCache = vi.fn<(s: OpeningSet) => void>();
  const load = vi.fn(async () => SET);
  const panel = openOpeningPanel(host, { her: { id: 'nix-direct', name: 'Nix' }, where: 'LOWLIGHT INTAKE · NIGHT · RAIN', steer: null, cached: null, load, onStart, onEdit, onCancel, onCache, ...over });
  const q = (sel: string) => panel.el.querySelector<HTMLElement>(sel);
  const key = (k: string) => panel.key(new KeyboardEvent('keydown', { key: k }));
  const cards = () => [...panel.el.querySelectorAll<HTMLElement>('.sp-card')];
  return { panel, onStart, onEdit, onCancel, onCache, load: (over.load as typeof load | undefined) ?? load, q, key, cards };
}

describe('the opening on the cards panel', () => {
  it('heads with the pair — your face and hers, both names, and the tie once the set says who you are', async () => {
    const p = open();
    expect(p.q('.ep-title')!.textContent).toBe('OPENING');
    expect(p.q('.sp-loading')!.textContent).toBe('// DEALING THREE OPENINGS…');
    expect(p.q('.op-her')!.style.backgroundImage).toBe('url("/api/agents/nix-direct/thumb")');
    expect(p.q('.op-names')!.textContent).toBe('YOU×NIX');
    expect(p.q('.op-where')!.textContent).toBe('LOWLIGHT INTAKE · NIGHT · RAIN');
    expect(p.q('.op-tie')!.hidden).toBe(true);
    await flush();
    expect(p.q('.op-face:not(.op-her)')!.style.backgroundImage).toBe('url("/api/agents/hicks/thumb")');
    expect(p.q('.op-names')!.textContent).toBe('HICKS×NIX');
    expect([p.q('.op-tie')!.hidden, p.q('.op-tie')!.textContent]).toEqual([false, 'NIX ON HICKS: She ran his court-ordered sessions.']);
    expect(p.onCache).toHaveBeenCalledWith(SET);
    expect(p.q('.ep-hints')!.textContent).toBe(OPENING_COPY.hints);
  });

  it('three cards: the kind, what it means, its picture, the opening with its actions in italics', async () => {
    const p = open();
    await flush();
    expect(p.cards().map((c) => c.querySelector('.sp-title')!.textContent)).toEqual([
      'HISTORYsomething already between them',
      'BUSINESSone needs something tonight',
      'CHANCEthe place throws them together',
    ]);
    expect(p.cards().map((c) => (c.querySelector('.sp-art') as HTMLElement).style.backgroundImage)).toEqual(['url("/opening/history.webp")', 'url("/opening/business.webp")', 'url("/opening/chance.webp")']);
    expect(p.cards()[0]!.querySelector('.sp-card-text em')!.textContent).toBe('The lamp is on.');
  });

  it('no tie: no tie line; the steer shows under the head', async () => {
    const p = open({ steer: 'a bounced fee', load: vi.fn(async () => ({ ...SET, pair: { ...SET.pair, tie: null } })) });
    expect(p.q('.sp-note')!.textContent).toBe('STEER: a bounced fee');
    await flush();
    expect(p.q('.op-tie')!.hidden).toBe(true);
  });

  it('↓ Enter starts with the second; a refusal stays under the cards; E edits; Esc goes back', async () => {
    const p = open();
    await flush();
    p.key('ArrowDown');
    p.key('Enter');
    expect(p.onStart).toHaveBeenLastCalledWith('A sealed packet in his jacket.');
    p.onStart.mockReturnValueOnce('THE ROOM IS STILL LOADING');
    p.cards()[2]!.click();
    expect(p.q('.sp-why')!.textContent).toBe('THE ROOM IS STILL LOADING');
    expect(p.cards()).toHaveLength(3);
    expect(p.key('e')).toBe(true);
    expect(p.onEdit).toHaveBeenCalledWith('A sealed packet in his jacket.');
    p.key('Escape');
    expect(p.onCancel).toHaveBeenCalled();
  });

  it("hovering chooses a card only once the mouse has moved: the panel opens under the mouse that clicked SUGGEST", async () => {
    const p = open();
    await flush();
    p.cards()[2]!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(p.cards()[0]!.classList.contains('on')).toBe(true);
    p.panel.el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    p.cards()[2]!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(p.cards()[2]!.classList.contains('on')).toBe(true);
  });

  it('a kept set shows at once, pair and all, without a call', () => {
    const p = open({ cached: SET });
    expect(p.load).not.toHaveBeenCalled();
    expect(p.cards()).toHaveLength(3);
    expect(p.q('.op-names')!.textContent).toBe('HICKS×NIX');
  });
});
