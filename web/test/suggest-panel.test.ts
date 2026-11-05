import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuggestDraft } from '../src/net/suggest';
import { openSuggestPanel, SUGGEST_COPY, type SuggestPanelOptions } from '../src/room/suggest-panel';

const THREE: SuggestDraft[] = [
  { angle: 'PLAIN', text: '*I nod.* Fine.' },
  { angle: 'PUSH', text: 'Pay me now.' },
  { angle: 'TURN', text: '*I look at the door.* Who else knows?' },
];

let host: HTMLElement;
afterEach(() => host?.remove());
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function open(over: Partial<SuggestPanelOptions> = {}) {
  host = document.createElement('div');
  document.body.append(host);
  const onSend = vi.fn<(t: string) => void>();
  const onEdit = vi.fn<(t: string) => void>();
  const onCancel = vi.fn();
  const onCache = vi.fn<(d: SuggestDraft[]) => void>();
  const load = vi.fn(async () => THREE);
  const panel = openSuggestPanel(host, { header: 'HICKS × CASS · THE TILT · DAY · RAIN', model: 'GLM 5.2', steer: null, cached: null, load, onSend, onEdit, onCancel, onCache, ...over });
  const q = (sel: string) => panel.el.querySelector<HTMLElement>(sel);
  const key = (k: string) => panel.key(new KeyboardEvent('keydown', { key: k }));
  const cards = () => [...panel.el.querySelectorAll<HTMLElement>('.sp-card')];
  return { panel, onSend, onEdit, onCancel, onCache, load: (over.load as typeof load | undefined) ?? load, q, key, cards };
}

describe('SUGGEST on the cards panel', () => {
  it('drafts: // DRAFTING THREE LINES…, then PLAIN / PUSH / TURN with what each does and *actions* in italics', async () => {
    const p = open();
    expect(p.q('.sp-loading')!.textContent).toBe('// DRAFTING THREE LINES…');
    expect(p.q('.ep-title')!.textContent).toBe('YOUR LINE');
    expect(p.panel.el.classList.contains('suggest-host')).toBe(true);
    expect(p.q('.sp-model')!.textContent).toBe('GLM 5.2');
    expect(p.q('.ep-hints')!.textContent).toBe(SUGGEST_COPY.hints);
    expect(p.q('.ep-foot')).toBeNull();
    await flush();
    expect(p.cards().map((c) => c.querySelector('.sp-title')!.textContent)).toEqual(['PLAINthe likely move', 'PUSHpresses harder', 'TURNgoes somewhere else']);
    const first = p.cards()[0]!.querySelector('.sp-card-text')!;
    expect(first.querySelector('em')!.textContent).toBe('I nod.');
    expect(first.textContent).toBe('I nod. Fine.');
    expect(p.onCache).toHaveBeenCalledWith(THREE);
    // Each angle's picture down the card's left edge.
    expect(p.cards().map((c) => (c.querySelector('.sp-art') as HTMLElement | null)?.style.backgroundImage)).toEqual(['url("/suggest/plain.webp")', 'url("/suggest/push.webp")', 'url("/suggest/turn.webp")']);
    expect(p.cards().every((c) => c.classList.contains('has-art'))).toBe(true);
  });

  it('the steer shows under the header; an unlabelled draft reads LINE', async () => {
    const p = open({ steer: 'tell her no', load: vi.fn(async () => [{ angle: null, text: 'No.' }]) });
    expect(p.q('.sp-note')!.textContent).toBe('STEER: tell her no');
    await flush();
    expect(p.cards()[0]!.querySelector('.sp-title')!.textContent).toBe('LINE');
    expect(p.cards()[0]!.querySelector('.sp-art')).toBeNull();
  });

  it('↓ Enter sends the second; a click sends that card; E edits the chosen one', async () => {
    const p = open();
    await flush();
    p.key('ArrowDown');
    p.key('Enter');
    expect(p.onSend).toHaveBeenLastCalledWith('Pay me now.');
    p.cards()[2]!.click();
    expect(p.onSend).toHaveBeenLastCalledWith('*I look at the door.* Who else knows?');
    expect(p.key('e')).toBe(true);
    expect(p.onEdit).toHaveBeenCalledWith('Pay me now.');
    expect(p.key('x')).toBe(false);
  });

  it('R redraws, one call at a time; Enter and E while drafting do nothing', async () => {
    const p = open();
    p.key('Enter');
    p.key('E');
    p.key('r');
    expect(p.load).toHaveBeenCalledTimes(1);
    expect(p.onSend).not.toHaveBeenCalled();
    expect(p.onEdit).not.toHaveBeenCalled();
    await flush();
    p.key('R');
    expect(p.load).toHaveBeenCalledTimes(2);
  });

  it('a kept set shows without a call; Esc cancels', () => {
    const p = open({ cached: THREE });
    expect(p.load).not.toHaveBeenCalled();
    expect(p.cards()).toHaveLength(3);
    p.key('Escape');
    expect(p.onCancel).toHaveBeenCalled();
  });

  it("a failure says why in the route's words; a refusal shows under the cards", async () => {
    const p = open({ load: vi.fn(async () => Promise.reject(new Error('NO CREDIT ON THE KEY'))) });
    await flush();
    expect(p.q('.sp-error')!.textContent).toBe('// NO LINES — NO CREDIT ON THE KEY');
    const q = open();
    await flush();
    q.panel.showRefusal('Wait for her to finish.');
    expect(q.q('.sp-why')!.textContent).toBe('Wait for her to finish.');
    expect(q.cards()).toHaveLength(3);
  });
});
