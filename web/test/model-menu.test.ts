import { afterEach, describe, expect, it } from 'vitest';
import type { ClientEvent, ModelEvent } from '../../shared/types';
import { ModelMenu } from '../src/ui/model-menu';

const EVENT: ModelEvent = {
  type: 'model',
  model: 'z-ai/glm-5.2',
  provider: 'openrouter',
  label: 'GLM 5.2',
  credit: 4.12,
  choices: [
    { id: 'z-ai/glm-5.2', label: 'GLM 5.2', priceIn: 0.4, priceOut: 1.6 },
    { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', priceIn: 0.25, priceOut: 0.38 },
    { id: 'other/x', label: 'x', priceIn: null, priceOut: null },
  ],
};

function setup(e: ModelEvent = EVENT) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.append(root);
  const sent: ClientEvent[] = [];
  const menu = new ModelMenu(root, (ev) => sent.push(ev));
  menu.update(e);
  menu.open();
  return { root, menu, sent };
}
const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.mm-row')];
afterEach(() => (document.body.innerHTML = ''));

describe('ModelMenu', () => {
  it('lists the choices with prices as "$0.40 / $1.60" and marks the current one', () => {
    const { root } = setup();
    expect(rows(root).map((r) => r.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      '▸ GLM 5.2 $0.40 / $1.60',
      'DeepSeek V3.2 $0.25 / $0.38',
      'x — / —',
    ]);
    expect(rows(root)[0].classList.contains('current')).toBe(true);
  });

  it('shows "$4.12 LEFT" when credit is known and nothing when null', () => {
    expect(setup().root.querySelector('.mm-credit')!.textContent).toBe('$4.12 LEFT');
    expect(setup({ ...EVENT, credit: null }).root.querySelector('.mm-credit')).toBeNull();
  });

  it('choosing a row sends set_model and closes', () => {
    const { root, menu, sent } = setup();
    rows(root)[1].click();
    expect(sent).toEqual([{ type: 'set_model', model: 'deepseek/deepseek-v3.2' }]);
    expect(menu.isOpen).toBe(false);
  });

  it('OTHER… sends the typed id; model_rejected shows "// UNKNOWN MODEL" inline and keeps the menu open', () => {
    const { root, menu, sent } = setup();
    root.querySelector<HTMLButtonElement>('.mm-other')!.click();
    const input = root.querySelector<HTMLInputElement>('.mm-input')!;
    input.value = 'mistral/nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sent).toEqual([{ type: 'set_model', model: 'mistral/nope' }]);
    menu.reject('unknown-model');
    expect(menu.isOpen).toBe(true);
    expect(root.querySelector('.mm-error')!.textContent).toBe('// UNKNOWN MODEL');
  });

  it('Esc closes', () => {
    const { menu } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.isOpen).toBe(false);
  });
});

describe('ModelMenu search', () => {
  const CATALOG = Array.from({ length: 12 }, (_, i) => ({ id: `anthropic/claude-${i}`, label: `Claude ${i}`, priceIn: 3, priceOut: 15 }));
  function searching(results = CATALOG) {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const sent: ClientEvent[] = [];
    const asked: string[] = [];
    const menu = new ModelMenu(root, (ev) => sent.push(ev), async (q) => (asked.push(q), { results }), 0);
    menu.update(EVENT);
    menu.open();
    root.querySelector<HTMLButtonElement>('.mm-other')!.click();
    const input = root.querySelector<HTMLInputElement>('.mm-input')!;
    const type = async (v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 5));
    };
    const key = (k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const hits = () => [...root.querySelectorAll<HTMLButtonElement>('.mm-hit')];
    return { root, sent, asked, type, key, hits };
  }

  it('lists up to 8 matches as you type, from 2 characters', async () => {
    const { asked, type, hits } = searching();
    await type('c');
    expect(asked).toEqual([]);
    await type('cla');
    expect(asked).toEqual(['cla']);
    expect(hits()).toHaveLength(8);
    expect(hits()[0].textContent!.replace(/\s+/g, ' ').trim()).toBe('Claude 0 $3.00 / $15.00');
  });

  it('Enter picks the highlighted match; arrows move it', async () => {
    const { sent, type, key, hits } = searching();
    await type('claude');
    key('ArrowDown');
    key('ArrowDown');
    expect(hits()[2].classList.contains('on')).toBe(true);
    key('Enter');
    expect(sent).toEqual([{ type: 'set_model', model: 'anthropic/claude-2' }]);
  });

  it('clicking a match sends it', async () => {
    const { sent, type, hits } = searching();
    await type('claude');
    hits()[4].click();
    expect(sent).toEqual([{ type: 'set_model', model: 'anthropic/claude-4' }]);
  });

  it('a pasted id that is listed is the one Enter sends', async () => {
    const { sent, type, key } = searching();
    await type('anthropic/claude-3');
    key('Enter');
    expect(sent).toEqual([{ type: 'set_model', model: 'anthropic/claude-3' }]);
  });

  it('with no matches it says so and Enter sends the typed id', async () => {
    const { root, sent, type, key } = searching([]);
    await type('mistral/nope');
    expect(root.querySelector('.mm-none')!.textContent).toBe('NO MATCHES — ENTER SENDS THE ID');
    key('Enter');
    expect(sent).toEqual([{ type: 'set_model', model: 'mistral/nope' }]);
  });
});
