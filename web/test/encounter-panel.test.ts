import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Encounter } from '../../shared/encounter';
import type { NarratorKind } from '../../shared/narrator';
import { encounterOptions } from '../src/net/encounter';
import { NarratorFailure } from '../src/net/scenario';
import { setHerPronoun } from '../src/room/her-copy';
import { EncounterPanel, EncounterNotice, ENCOUNTER_COPY, hereLine, type EncounterPanelOptions } from '../src/room/encounter-panel';

const THREE: Encounter[] = [
  { title: 'Wrong package', text: 'A courier drops a box.', stranger: { name: 'Courier', voice: 'clipped, nervous' } },
  { title: 'Blackout', text: 'The grid drops.' },
  { title: 'Regular', text: 'An old man sits.', stranger: { name: 'Old Man Wen', voice: 'slow' } },
];

let host: HTMLElement;
afterEach(() => host?.remove());
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function open(over: Partial<EncounterPanelOptions> = {}) {
  host = document.createElement('div');
  document.body.append(host);
  const onPlay = vi.fn<(e: Encounter) => void>();
  const onCancel = vi.fn();
  const onCache = vi.fn<(e: Encounter[]) => void>();
  const load = vi.fn(async () => THREE);
  const panel = new EncounterPanel(host, { header: 'HICKS × NIX · NOODLE STALL · NIGHT · RAIN · HAE IS HERE', model: 'GLM 5.2', cached: null, load, onPlay, onCancel, onCache, ...over });
  const q = (sel: string) => panel.el.querySelector<HTMLElement>(sel);
  const key = (k: string) => panel.key(new KeyboardEvent('keydown', { key: k }));
  return { panel, onPlay, onCancel, onCache, load: (over.load as typeof load | undefined) ?? load, q, key };
}

describe('EncounterPanel', () => {
  it('the hints bracket each key', () => {
    expect(ENCOUNTER_COPY.hints).toBe('[▲▼] CHOOSE · [ENTER] PLAY · [R] REDRAW · [ESC] CANCEL');
    expect(ENCOUNTER_COPY.cancel).toBe('[ESC] CANCEL');
  });

  it('deals: // DEALING THREE EVENTS…, then three cards with the stranger chip; the header and model', async () => {
    const p = open();
    expect(p.q('.sp-loading')!.textContent).toBe('// DEALING THREE EVENTS…');
    expect(p.q('.ep-title')!.textContent).toBe('ENCOUNTER');
    expect(p.q('.sp-head')!.textContent).toContain('HAE IS HERE');
    expect(p.q('.sp-model')!.textContent).toBe('GLM 5.2');
    await flush();
    const cards = [...p.panel.el.querySelectorAll('.sp-card')];
    expect(cards.map((c) => c.querySelector('.sp-title')!.textContent)).toEqual(['Wrong package', 'Blackout', 'Regular']);
    expect(cards[0].querySelector('.ep-who')!.textContent).toBe('+ COURIERclipped, nervous');
    expect(cards[1].querySelector('.ep-who')).toBeNull();
    expect(cards[0].classList.contains('on')).toBe(true);
    expect(p.onCache).toHaveBeenCalledWith(THREE);
    expect(p.q('.ep-foot')!.textContent).toContain('the last 8 lines');
  });

  it('↓ Enter plays the second; a click plays that card', async () => {
    const p = open();
    await flush();
    expect(p.key('ArrowDown')).toBe(true);
    p.key('Enter');
    expect(p.onPlay).toHaveBeenLastCalledWith(THREE[1]);
    (p.panel.el.querySelectorAll('.sp-card')[2] as HTMLElement).click();
    expect(p.onPlay).toHaveBeenLastCalledWith(THREE[2]);
  });

  it('R redraws; R while dealing makes no second call; Enter while dealing plays nothing', async () => {
    const p = open();
    p.key('r');
    p.key('Enter');
    expect(p.load).toHaveBeenCalledTimes(1);
    expect(p.onPlay).not.toHaveBeenCalled();
    await flush();
    p.key('r');
    expect(p.load).toHaveBeenCalledTimes(2);
  });

  it('a cached set shows without a call; Esc cancels', () => {
    const p = open({ cached: THREE });
    expect(p.load).not.toHaveBeenCalled();
    expect(p.panel.el.querySelectorAll('.sp-card')).toHaveLength(3);
    p.key('Escape');
    expect(p.onCancel).toHaveBeenCalled();
  });

  it('a failure shows its plain line, the raw why only in the console (spec 2026-10-14 §1); a notice shows as it is; REDRAW stays', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setHerPronoun('she');
    const p = open({ load: vi.fn(async () => Promise.reject(new NarratorFailure('refused', 'HTTP 404: no such model'))) });
    await flush();
    expect(p.q('.sp-error')!.textContent).toBe("// COULDN'T DEAL EVENTS — Her model turned the request down. Pick another model from her MODEL menu.");
    expect(p.q('.sp-error')!.title).toBe('');
    expect(warn).toHaveBeenCalledWith('[narrator] events:', 'HTTP 404: no such model');
    warn.mockRestore();
    expect(p.q('.sp-reroll')!.textContent).toBe('↻ REDRAW');
    const n = open({ load: vi.fn(async () => Promise.reject(new EncounterNotice(ENCOUNTER_COPY.noKey))) });
    await flush();
    expect(n.q('.sp-error')!.textContent).toBe(ENCOUNTER_COPY.noKey);
  });

  it('each kind has its line, in her pronoun; a plain error reads as unknown', async () => {
    setHerPronoun('he');
    const lines: [NarratorKind | 'plain', string][] = [
      ['timeout', 'His model took too long to answer. Try again, or pick a faster model from his MODEL menu.'],
      ['too-long', "His model's answer didn't fit. Try again, or pick another model from his MODEL menu."],
      ['bad-answer', "His model's answer didn't fit. Try again, or pick another model from his MODEL menu."],
      ['busy', "OpenRouter couldn't reach his model just now. Try again in a moment."],
      ['refused', 'His model turned the request down. Pick another model from his MODEL menu.'],
      ['unknown', 'Something went wrong dealing the events. Try again.'],
      ['plain', 'Something went wrong dealing the events. Try again.'],
    ];
    for (const [kind, line] of lines) {
      const err = kind === 'plain' ? new TypeError('Failed to fetch') : new NarratorFailure(kind, 'raw');
      const p = open({ load: vi.fn(async () => Promise.reject(err)) });
      await flush();
      expect(p.q('.sp-error')!.textContent).toBe(ENCOUNTER_COPY.failed(line));
      host.remove();
    }
    setHerPronoun('they');
  });

  it('encounterOptions: a failed 502 rejects with a NarratorFailure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'failed', kind: 'busy', why: 'HTTP 503: x' }), { status: 502 })));
    await expect(encounterOptions('nix-direct')).rejects.toMatchObject({ name: 'NarratorFailure', kind: 'busy', why: 'HTTP 503: x' });
    vi.unstubAllGlobals();
  });

  it("showRefusal puts the server's refusal under the cards", async () => {
    const p = open();
    await flush();
    p.panel.showRefusal('wait for her to finish');
    expect(p.q('.sp-why')!.textContent).toBe('wait for her to finish');
    expect(p.panel.el.querySelectorAll('.sp-card')).toHaveLength(3);
  });
});

describe("hereLine (the header's who's-here part)", () => {
  it('nobody, one, several', () => {
    expect(hereLine([])).toBeNull();
    expect(hereLine(['Silas'])).toBe('SILAS IS HERE');
    expect(hereLine(['Hae', 'Silas'])).toBe('HAE, SILAS ARE HERE');
  });
});
