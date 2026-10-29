import { afterEach, describe, expect, it } from 'vitest';
import type { ModelChoice, ModelEvent } from '../../shared/types';
import { ModelPanel, modelRows, priceText } from '../src/landing/model-panel';
import type { LinkInfo } from '../src/net/link';

const c = (id: string, label: string, priceIn: number | null = 0.4, priceOut: number | null = 1.6, why?: string): ModelChoice => ({
  id,
  label,
  priceIn,
  priceOut,
  ...(why ? { why } : {}),
});
const GLM = c('z-ai/glm-5.2', 'GLM 5.2', 0.4, 1.6, 'her default · strong in character, cheap');
const SONNET = c('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 2, 10, 'best writing; pricier for long nights');
const DEEP = c('deepseek/deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 1.32, 3.96);
const QWEN = c('qwen/qwen-4-235b', 'Qwen 4 235B', 0.2, 0.8);

const LINK: LinkInfo = { linked: true, last4: '3f9a', credit: 4.12, state: 'ok' };
const event = (model: string): ModelEvent => ({ type: 'model', model, provider: 'openrouter', label: model === DEEP.id ? DEEP.label : GLM.label, choices: [GLM, DEEP, SONNET], credit: 4.12, default: GLM.id });

describe('modelRows', () => {
  it('orders current, reset (only when current ≠ default), picks, recent, results', () => {
    const rows = modelRows({ current: DEEP, def: GLM, picks: [GLM, SONNET], recent: [DEEP], results: [QWEN] });
    expect(rows.map((r) => [r.kind, r.id])).toEqual([
      ['current', DEEP.id],
      ['reset', null],
      ['pick', GLM.id],
      ['pick', SONNET.id],
      ['result', QWEN.id],
    ]);
    expect(modelRows({ current: GLM, def: GLM, picks: [], recent: [], results: [] }).map((r) => r.kind)).toEqual(['current']);
  });

  it('her current model is not repeated under picks or recent', () => {
    const rows = modelRows({ current: GLM, def: GLM, picks: [GLM, SONNET], recent: [GLM], results: [] });
    expect(rows.filter((r) => r.id === GLM.id)).toHaveLength(1);
  });

  it('a recent entry equal to a pick is not listed twice', () => {
    const rows = modelRows({ current: GLM, def: GLM, picks: [GLM, SONNET], recent: [SONNET, DEEP], results: [] });
    expect(rows.filter((r) => r.id === SONNET.id)).toHaveLength(1);
  });

  it('the reset row names her default', () => {
    const rows = modelRows({ current: DEEP, def: GLM, picks: [], recent: [], results: [], pronoun: 'she' });
    expect(rows[1]!.label).toBe('↺ reset to her default · GLM 5.2');
  });
});

describe('priceText', () => {
  it('formats two decimals, and — for unknown', () => {
    expect(priceText(GLM)).toBe('$0.40 / $1.60');
    expect(priceText(c('a/b', 'B', null, null))).toBe('—');
  });
});

type Answer = { picks: ModelChoice[]; recent: ModelChoice[]; results: ModelChoice[] };

function setup(opts: { model?: string; search?: (q: string) => Promise<Answer> } = {}) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.append(host);
  const picks: (string | null)[] = [];
  const calls: string[] = [];
  let backs = 0;
  let changes = 0;
  let unlinks = 0;
  const search =
    opts.search ??
    (async (q: string) => {
      calls.push(q);
      return { picks: [GLM, SONNET], recent: [DEEP], results: q.length >= 2 ? [QWEN] : [] };
    });
  const panel = new ModelPanel(host, {
    link: LINK,
    pronoun: 'she',
    agentModels: event(opts.model ?? GLM.id),
    search,
    onPick: (id) => picks.push(id),
    onBack: () => backs++,
    onChangeKey: () => changes++,
    onUnlink: () => unlinks++,
    debounceMs: 0,
  });
  const key = (k: string) => panel.key(new KeyboardEvent('keydown', { key: k }));
  const rows = () => [...host.querySelectorAll<HTMLElement>('.mp-row')];
  const on = () => host.querySelector('.mp-row.on .mp-label')?.textContent;
  return { host, panel, key, rows, on, picks, calls, backs: () => backs, changes: () => changes, unlinks: () => unlinks };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
afterEach(() => (document.body.innerHTML = ''));

describe('ModelPanel', () => {
  it('header shows the link: last 4 and credit', async () => {
    const { host } = setup();
    expect(host.querySelector('.mp-link')!.textContent).toContain('LINK …3f9a · $4.12');
  });

  it('loads picks and recent on open', async () => {
    const { rows, calls } = setup();
    await settle();
    expect(calls).toEqual(['']);
    expect(rows().map((r) => r.querySelector('.mp-label')!.textContent)).toEqual(['GLM 5.2', 'Claude Sonnet 5.5', 'DeepSeek V4 Pro']);
  });

  it('↓ moves the selection; Enter picks the row id; the reset row picks null', async () => {
    const { key, on, picks } = setup({ model: DEEP.id });
    await settle();
    expect(on()).toBe('DeepSeek V4 Pro');
    expect(key('ArrowDown')).toBe(true);
    expect(on()).toBe('↺ reset to her default · GLM 5.2');
    key('Enter');
    expect(picks).toEqual([null]);
    key('ArrowDown');
    key('Enter');
    expect(picks).toEqual([null, GLM.id]);
  });

  it('a pick shows its why line', async () => {
    const { rows } = setup();
    await settle();
    expect(rows()[1]!.querySelector('.mp-why')!.textContent).toBe('best writing; pricier for long nights');
  });

  it('typing goes into search and searches once q has 2 characters', async () => {
    const { key, calls, host, rows } = setup();
    await settle();
    expect(key('q')).toBe(true);
    await settle();
    expect(calls).toEqual(['']);
    key('w');
    await settle();
    expect(host.querySelector<HTMLInputElement>('.mp-search input')!.value).toBe('qw');
    expect(calls).toEqual(['', 'qw']);
    expect(rows().at(-1)!.querySelector('.mp-label')!.textContent).toBe('Qwen 4 235B');
    key('Backspace');
    await settle();
    expect(rows().some((r) => r.querySelector('.mp-label')!.textContent === 'Qwen 4 235B')).toBe(false);
  });

  it('a stale search response is ignored', async () => {
    const pending = new Map<string, (a: Answer) => void>();
    const search = (q: string) =>
      q === '' ? Promise.resolve({ picks: [GLM], recent: [], results: [] }) : new Promise<Answer>((r) => pending.set(q, r));
    const { key, rows } = setup({ search });
    await settle();
    key('q');
    key('w');
    await settle();
    key('e');
    await settle();
    pending.get('qwe')!({ picks: [GLM], recent: [], results: [QWEN] });
    await settle();
    pending.get('qw')!({ picks: [GLM], recent: [], results: [DEEP] });
    await settle();
    const labels = rows().map((r) => r.querySelector('.mp-label')!.textContent);
    expect(labels).toContain('Qwen 4 235B');
    expect(labels).not.toContain('DeepSeek V4 Pro');
  });

  it('CHANGE KEY calls onChangeKey; UNLINK asks once inline, then calls onUnlink', () => {
    const { host, changes, unlinks } = setup();
    host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    expect(changes()).toBe(1);
    const unlink = host.querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    expect(unlinks()).toBe(0);
    expect(unlink.textContent).toBe('UNLINK? CLICK AGAIN');
    unlink.click();
    expect(unlinks()).toBe(1);
  });

  it('Esc calls onBack', () => {
    const { key, backs } = setup();
    expect(key('Escape')).toBe(true);
    expect(backs()).toBe(1);
  });

  it('clicking a row picks it', async () => {
    const { rows, picks } = setup();
    await settle();
    rows()[1]!.click();
    expect(picks).toEqual([SONNET.id]);
  });
});
