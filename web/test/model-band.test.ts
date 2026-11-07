import { afterEach, describe, expect, it } from 'vitest';
import type { ModelChoice, ModelEvent } from '../../shared/types';
import { COPY } from '../src/landing/copy';
import { browseRows, contextText, ModelBand, modelRows, priceText, vendorName, vendorOf, type ModelBandOptions } from '../src/landing/model-band';
import type { LinkError, LinkInfo, ModelBrowse, Provider } from '../src/net/link';

const c = (id: string, label: string, priceIn: number | null = 0.4, priceOut: number | null = 1.6, more: Partial<ModelChoice> = {}): ModelChoice => ({ id, label, priceIn, priceOut, ...more });
const GLM = c('z-ai/glm-5.2', 'GLM 5.2', 0.4, 1.6, { why: 'her default · strong in character, cheap', context: 200_000 });
const SONNET = c('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 2, 10, { via: 'anthropic', context: 1_000_000 });
const DEEP = c('deepseek/deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 1.32, 3.96, { context: 131_072 });
const QWEN = c('qwen/qwen-4-235b', 'Qwen 4 235B', 0.2, 0.8);
const FREE = c('~z-ai/glm-free', 'GLM Free', 0, 0);
const ALL = [GLM, SONNET, DEEP, QWEN, FREE];

const LINK: LinkInfo = { linked: true, last4: '3f9a', credit: 4.12, state: 'ok' };
const NONE: LinkInfo = { linked: false, last4: null, credit: null, state: 'no-link' };
const event = (model: string): ModelEvent => ({ type: 'model', model, provider: 'openrouter', label: model === DEEP.id ? DEEP.label : GLM.label, choices: [GLM, DEEP, SONNET], credit: 4.12, default: GLM.id });

function setup(o: Partial<ModelBandOptions> & { model?: string; answer?: LinkInfo | { error: LinkError } } = {}) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.append(host);
  const picks: (string | null)[] = [];
  const puts: [string, Provider][] = [];
  const linked: Provider[] = [];
  const unlinks: Provider[] = [];
  let backs = 0;
  let changes = 0;
  const browse = async (): Promise<ModelBrowse> => ({ picks: [GLM, SONNET], recent: [DEEP], all: ALL });
  const band = new ModelBand(host, {
    links: { openrouter: LINK, anthropic: NONE },
    pronoun: 'she',
    agentModels: event(o.model ?? GLM.id),
    needsKey: false,
    browse,
    put: async (k, p) => {
      puts.push([k, p]);
      return o.answer ?? LINK;
    },
    onPick: (id) => picks.push(id),
    onBack: () => backs++,
    onLinked: (_, p) => linked.push(p),
    onUnlink: (p) => unlinks.push(p),
    onChange: () => changes++,
    beatMs: 0,
    ...o,
  });
  const key = (k: string) => band.key(new KeyboardEvent('keydown', { key: k }));
  const keys = (...ks: string[]) => ks.forEach(key);
  /** Keys as the browser has them: what `key` leaves alone, the search field takes. */
  const type = (s: string) => {
    for (const ch of s) {
      if (key(ch)) continue;
      field().value += ch;
      field().dispatchEvent(new Event('input'));
    }
  };
  const erase = () => {
    if (key('Backspace')) return;
    field().value = field().value.slice(0, -1);
    field().dispatchEvent(new Event('input'));
  };
  const rows = () => [...host.querySelectorAll<HTMLElement>('.mp-row')];
  const labels = () => [...host.querySelectorAll('.mp-row .mp-label')].map((n) => n.textContent);
  const on = () => host.querySelector('.mp-row.on .mp-label')?.textContent;
  const tab = (t: string) => host.querySelector<HTMLButtonElement>(`.mb-tab[data-tab="${t}"]`)!;
  const field = () => host.querySelector<HTMLInputElement>('.mp-search input')!;
  return { host, band, key, keys, type, erase, rows, labels, on, tab, field, picks, puts, linked, unlinks, backs: () => backs, changes: () => changes };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
afterEach(() => (document.body.innerHTML = ''));

describe('modelRows', () => {
  it('orders current, reset (only when current ≠ default), picks, recent', () => {
    const rows = modelRows({ current: DEEP, def: GLM, picks: [GLM, SONNET], recent: [QWEN] });
    expect(rows.map((r) => [r.kind, r.id])).toEqual([['current', DEEP.id], ['reset', null], ['pick', GLM.id], ['pick', SONNET.id], ['recent', QWEN.id]]);
    expect(modelRows({ current: GLM, def: GLM, picks: [], recent: [] }).map((r) => r.kind)).toEqual(['current']);
  });

  it('each model once: her current one, then a pick under recent', () => {
    const rows = modelRows({ current: GLM, def: GLM, picks: [GLM, SONNET], recent: [GLM, SONNET, DEEP] });
    expect(rows.map((r) => r.id)).toEqual([GLM.id, SONNET.id, DEEP.id]);
  });

  it('the reset row names her default', () => {
    const rows = modelRows({ current: DEEP, def: GLM, picks: [], recent: [], pronoun: 'he' });
    expect(rows[1]!.label).toBe(COPY.link.reset('he', 'GLM 5.2'));
  });
});

describe('the small words', () => {
  it('prices: two decimals, — for unknown, FREE for nothing', () => {
    expect(priceText(GLM)).toBe('$0.40 / $1.60');
    expect(priceText(c('a/b', 'x', null, null))).toBe('—');
    expect(priceText(FREE)).toBe('FREE');
  });

  it('memory: K and M, — when not said', () => {
    expect(contextText(131_072)).toBe('131K');
    expect(contextText(1_000_000)).toBe('1M');
    expect(contextText(1_500_000)).toBe('1.5M');
    expect(contextText(undefined)).toBe('—');
  });

  it('vendors: ~ aliases and Meta fold together', () => {
    expect(vendorOf('~z-ai/glm-free')).toBe('z-ai');
    expect(vendorOf('meta-llama/llama-5')).toBe('meta');
    expect(vendorName('z-ai')).toBe('Z.AI');
    expect(vendorName('qwen')).toBe('QWEN');
  });
});

describe('browseRows', () => {
  const ids = (o: Partial<Parameters<typeof browseRows>[1]>) => browseRows(ALL, { vendor: null, query: '', sort: 'price', flip: false, ...o }).map((m) => m.label);

  it('lowest price first; flipped, the dearest', () => {
    expect(ids({})).toEqual(['GLM Free', 'Qwen 4 235B', 'GLM 5.2', 'DeepSeek V4 Pro', 'Claude Sonnet 5.5']);
    expect(ids({ flip: true })[0]).toBe('Claude Sonnet 5.5');
  });

  it('by memory, the most first, the unknown last either way', () => {
    expect(ids({ sort: 'context' }).slice(0, 3)).toEqual(['Claude Sonnet 5.5', 'GLM 5.2', 'DeepSeek V4 Pro']);
    expect(ids({ sort: 'context', flip: true }).slice(0, 3)).toEqual(['DeepSeek V4 Pro', 'GLM 5.2', 'Claude Sonnet 5.5']);
  });

  it('a vendor and a search narrow it, on id or name', () => {
    expect(ids({ vendor: 'z-ai' })).toEqual(['GLM Free', 'GLM 5.2']);
    expect(ids({ query: 'SONNET' })).toEqual(['Claude Sonnet 5.5']);
    expect(ids({ query: 'deepseek/' })).toEqual(['DeepSeek V4 Pro']);
    expect(ids({ vendor: 'qwen', query: 'glm' })).toEqual([]);
  });

  it("doesn't reorder what it was given", () => {
    const before = ALL.map((m) => m.id);
    browseRows(ALL, { vendor: null, query: '', sort: 'name', flip: false });
    expect(ALL.map((m) => m.id)).toEqual(before);
  });
});

describe('FOR HER', () => {
  it('opens on her list: current, picks, recent; the tab counts the catalog once it loads', async () => {
    const t = setup();
    expect(t.tab('her').textContent).toBe('FOR HER');
    expect(t.tab('all').textContent).toBe('ALL MODELS');
    await settle();
    expect(t.labels()).toEqual(['GLM 5.2', 'Claude Sonnet 5.5', 'DeepSeek V4 Pro']);
    expect(t.tab('all').textContent).toBe('ALL MODELS 5');
    expect(t.host.querySelector('.mp-via')!.textContent).toBe(COPY.link.via);
  });

  it('↓ moves the mark; Enter picks the row; the reset row picks null', async () => {
    const t = setup({ model: DEEP.id });
    await settle();
    expect(t.on()).toBe('DeepSeek V4 Pro');
    t.keys('ArrowDown', 'Enter');
    expect(t.picks).toEqual([null]);
    t.keys('ArrowDown', 'Enter');
    expect(t.picks).toEqual([null, GLM.id]);
  });

  it('a click picks; Esc backs out', async () => {
    const t = setup();
    await settle();
    t.rows()[1]!.click();
    expect(t.picks).toEqual([SONNET.id]);
    t.key('Escape');
    expect(t.backs()).toBe(1);
  });

  it('the summary names what is linked, and warns of a key with no credit', () => {
    const t = setup({ links: { openrouter: { ...LINK, state: 'no-credit' }, anthropic: NONE } });
    const s = t.host.querySelector('.mb-summary')!.textContent!;
    expect(s).toContain(`OPENROUTER ${COPY.link.noCreditShort}`);
    expect(s).not.toContain('ANTHROPIC');
    expect(setup().host.querySelector('.mb-summary')!.textContent).toContain('OPENROUTER $4.12');
  });

  it('the on-screen BACK backs out, for a phone or a mouse', () => {
    const t = setup();
    t.host.querySelector<HTMLButtonElement>('.mb-back')!.click();
    expect(t.backs()).toBe(1);
  });

  it('an unread catalog leaves her list up and says so on ALL MODELS', async () => {
    const t = setup({ browse: async () => ({ picks: [GLM], recent: [], all: null }) });
    await settle();
    expect(t.labels()).toEqual(['GLM 5.2']);
    t.key('ArrowRight');
    expect(t.host.querySelector('.mp-empty')!.textContent).toBe(COPY.link.catalogOffline);
  });

  it('a failed load does the same, without her picks', async () => {
    const t = setup({ browse: async () => Promise.reject(new Error('down')) });
    await settle();
    expect(t.labels()).toEqual(['GLM 5.2']);
  });
});

describe('ALL MODELS', () => {
  async function all() {
    const t = setup();
    await settle();
    t.key('ArrowRight');
    return t;
  }
  const vendors = (t: ReturnType<typeof setup>) => [...t.host.querySelectorAll<HTMLElement>('.mb-ven')];

  it('←→ step the tabs and tell the title; the ends stop', async () => {
    const t = await all();
    expect(t.band.tab).toBe('all');
    expect(t.changes()).toBe(1);
    t.keys('ArrowRight', 'ArrowRight');
    expect(t.band.tab).toBe('keys');
    expect(t.band.title).toBe(COPY.link.titleKeys);
    t.keys('ArrowLeft', 'ArrowLeft', 'ArrowLeft');
    expect(t.band.tab).toBe('her');
    expect(t.band.title).toBe(COPY.link.titleModel('she'));
  });

  it('every model, cheapest first, with memory and price; Enter picks the row', async () => {
    const t = await all();
    expect(t.labels()[0]).toBe('GLM Free');
    const glm = t.rows().find((r) => r.textContent!.startsWith('GLM 5.2'))!;
    expect(glm.querySelector('.mp-mem')!.textContent).toBe('200K');
    expect(glm.querySelector('.mp-price')!.textContent).toBe('$0.40 / $1.60');
    expect(glm.classList.contains('mp-current')).toBe(true);
    t.keys('ArrowDown', 'Enter');
    expect(t.picks).toEqual([QWEN.id]);
    expect(t.band.labelFor(QWEN.id)).toBe('Qwen 4 235B');
  });

  it('vendors list by count; a click narrows to one', async () => {
    const t = await all();
    expect(vendors(t).map((v) => v.textContent)).toEqual(['ALL5', 'Z.AI2', 'ANTHROPIC1', 'DEEPSEEK1', 'QWEN1']);
    vendors(t)[1]!.click();
    expect(t.labels()).toEqual(['GLM Free', 'GLM 5.2']);
  });

  it('Tab moves the arrows to the vendors and back; Enter on a vendor returns to its models', async () => {
    const t = await all();
    t.keys('Tab', 'ArrowDown');
    expect(t.labels()).toEqual(['GLM Free', 'GLM 5.2']);
    t.keys('Enter', 'ArrowDown', 'Enter');
    expect(t.picks).toEqual([GLM.id]);
  });

  it('a head sorts, and again flips', async () => {
    const t = await all();
    const head = () => t.host.querySelector<HTMLButtonElement>('.mb-head[data-sort="price"]')!;
    head().click();
    expect(t.labels()[0]).toBe('Claude Sonnet 5.5');
    t.host.querySelector<HTMLButtonElement>('.mb-head[data-sort="name"]')!.click();
    expect(t.labels()[0]).toBe('Claude Sonnet 5.5');
    expect(t.labels()[4]).toBe('Qwen 4 235B');
  });

  it('PageDown runs down the list and stops at its end', async () => {
    const t = await all();
    t.key('PageDown');
    expect(t.on()).toBe('Claude Sonnet 5.5');
  });
});

describe('search', () => {
  it('typing from FOR HER jumps to ALL MODELS and narrows it; Backspace and Esc undo it, then Esc backs out', async () => {
    const t = setup();
    await settle();
    t.type('qw');
    expect(t.band.tab).toBe('all');
    expect(t.field().value).toBe('qw');
    expect(t.labels()).toEqual(['Qwen 4 235B']);
    t.erase();
    expect(t.field().value).toBe('q');
    t.key('Escape');
    expect(t.field().value).toBe('');
    expect(t.labels()).toHaveLength(5);
    expect(t.backs()).toBe(0);
    t.key('Escape');
    expect(t.backs()).toBe(1);
  });

  it('in the field the keys are the field\'s, so selecting and deleting work; only the first letter is caught', async () => {
    const t = setup();
    await settle();
    expect(t.key('g')).toBe(true);
    expect(document.activeElement).toBe(t.field());
    expect(t.key('p')).toBe(false);
    expect(t.key('Backspace')).toBe(false);
    expect(t.key('ArrowDown')).toBe(true);
  });

  it('a search stays on ALL MODELS: leaving clears it, so Esc backs straight out', async () => {
    const t = setup();
    await settle();
    t.type('gpt');
    t.tab('keys').click();
    expect(t.field().value).toBe('');
    t.key('Escape');
    expect(t.backs()).toBe(1);
  });

  it('a search from FOR HER is over everything, whatever vendor was left picked', async () => {
    const t = setup();
    await settle();
    t.key('ArrowRight');
    t.host.querySelector<HTMLElement>('.mb-ven[data-vendor="qwen"]')!.click();
    t.key('ArrowLeft');
    t.type('sonnet');
    expect(t.labels()).toEqual(['Claude Sonnet 5.5']);
  });

  it('a search on ALL MODELS starts over every vendor; a vendor picked during it narrows it', async () => {
    const t = setup();
    await settle();
    t.key('ArrowRight');
    t.host.querySelector<HTMLElement>('.mb-ven[data-vendor="qwen"]')!.click();
    t.type('g');
    expect(t.labels()).toContain('GLM 5.2');
    expect(t.host.querySelector('.mb-ven.on')!.textContent).toContain('ALL');
    t.host.querySelector<HTMLElement>('.mb-ven[data-vendor="z-ai"]')!.click();
    expect(t.labels()).toEqual(['GLM Free', 'GLM 5.2']);
  });

  it('with words in the search ←→ move the caret; with none they step the tabs', async () => {
    const t = setup();
    await settle();
    t.type('glm');
    expect(t.key('ArrowLeft')).toBe(false);
    expect(t.band.tab).toBe('all');
    expect(t.field().value).toBe('glm');
    t.key('Escape');
    expect(t.key('ArrowLeft')).toBe(true);
    expect(t.band.tab).toBe('her');
  });

  it('nothing found says so', async () => {
    const t = setup();
    await settle();
    t.type('zzz');
    expect(t.host.querySelector('.mp-empty')!.textContent).toBe(COPY.link.searchEmpty);
  });

  it("a phone's keyboard fills the field and the list follows", async () => {
    const t = setup();
    await settle();
    expect(t.field().readOnly).toBe(false);
    t.field().value = 'deep';
    t.field().dispatchEvent(new Event('input'));
    expect(t.band.tab).toBe('all');
    expect(t.labels()).toEqual(['DeepSeek V4 Pro']);
  });
});

describe('KEYS', () => {
  const keysTab = (o: Parameters<typeof setup>[0] = {}) => {
    const t = setup({ ...o, tab: 'keys' });
    return t;
  };
  const row = (t: ReturnType<typeof setup>, p: Provider) => t.host.querySelector<HTMLElement>(`.mp-link[data-provider="${p}"]`)!;
  const input = (t: ReturnType<typeof setup>) => t.host.querySelector<HTMLInputElement>('.lp-key')!;

  it('a row per backend: linked with CHANGE KEY and UNLINK, the other + LINK', () => {
    const t = keysTab();
    expect(row(t, 'openrouter').textContent).toContain('…3f9a');
    expect(row(t, 'openrouter').querySelector('.mp-change')).not.toBeNull();
    expect(row(t, 'anthropic').querySelector('.mp-add')!.textContent).toBe(COPY.link.addLink('anthropic'));
    expect(t.host.querySelector('.mp-search')!.hasAttribute('hidden')).toBe(true);
    expect(t.band.hint).toBe(COPY.link.hintKeys);
  });

  it('the catalog landing leaves a half-typed key alone', async () => {
    let land!: (r: ModelBrowse) => void;
    const t = keysTab({ browse: () => new Promise((r) => (land = r)) });
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    const field = input(t);
    field.value = 'sk-or-half';
    land({ picks: [], recent: [], all: ALL });
    await settle();
    expect(input(t)).toBe(field);
    expect(field.value).toBe('sk-or-half');
    expect(t.tab('all').textContent).toBe('ALL MODELS 5');
  });

  it('Enter on a button reached with Tab is the button\'s, not the marked row\'s', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-link[data-provider="anthropic"] .mp-add')!.focus();
    expect(t.key('Enter')).toBe(false);
    expect(t.key(' ')).toBe(false);
    expect(t.host.querySelector('.lp-field')).toBeNull();
  });

  it('a mouse press takes no focus, so Enter stays with the marked row', () => {
    const t = keysTab();
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    t.tab('all').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it('after a tabbed-to button, the arrows hand Enter back to the rows', async () => {
    const t = setup();
    await settle();
    t.tab('her').focus();
    t.keys('ArrowRight', 'ArrowDown');
    expect(document.activeElement).not.toBe(t.tab('her'));
    t.key('Enter');
    expect(t.picks).toEqual([QWEN.id]);
  });

  it('BACK goes one level at a time, like Esc', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    const back = t.host.querySelector<HTMLButtonElement>('.mb-back')!;
    back.click();
    expect(t.host.querySelector('.lp-field')).toBeNull();
    expect(t.backs()).toBe(0);
    back.click();
    expect(t.backs()).toBe(1);
  });

  it('Ctrl+V with the field unfocused goes back into it, so the paste lands', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    input(t).blur();
    expect(t.band.key(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }))).toBe(false);
    expect(document.activeElement).toBe(input(t));
  });

  it('nothing starts during the linked beat', async () => {
    const t = keysTab({ beatMs: 30 });
    t.host.querySelector<HTMLButtonElement>('.mp-add')!.click();
    input(t).value = 'k';
    t.key('Enter');
    await settle();
    t.tab('her').click();
    t.key('Escape');
    expect(t.band.tab).toBe('keys');
    expect(t.backs()).toBe(0);
  });

  it('UNLINK waits while a key is checked', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-add')!.click();
    input(t).value = 'k';
    const unlink = row(t, 'openrouter').querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    t.key('Enter');
    unlink.click();
    expect(t.unlinks).toEqual([]);
  });

  it('UNLINK asks once, then goes', () => {
    const t = keysTab();
    const unlink = row(t, 'openrouter').querySelector<HTMLButtonElement>('.mp-unlink')!;
    unlink.click();
    expect(unlink.textContent).toBe(COPY.link.unlinkConfirm);
    expect(t.unlinks).toEqual([]);
    unlink.click();
    expect(t.unlinks).toEqual(['openrouter']);
  });

  it('↓ and Enter open the row under the mark, focused, with its own words; Esc closes it and the step stays', () => {
    const t = keysTab();
    t.keys('ArrowDown', 'Enter');
    expect(document.activeElement).toBe(input(t));
    expect(input(t).type).toBe('password');
    expect(input(t).autocomplete).toBe('off');
    expect(input(t).getAttribute('aria-label')).toBe(COPY.link.anthropic.fieldLabel);
    expect(t.host.querySelector('.lp-why')!.textContent).toBe(COPY.link.anthropic.why);
    expect(t.host.querySelector<HTMLAnchorElement>('.lp-get a')!.href).toBe(COPY.link.anthropic.href);
    expect(t.band.hint).toBe(COPY.link.hintLink);
    t.key('Escape');
    expect(t.host.querySelector('.lp-field')).toBeNull();
    expect(t.backs()).toBe(0);
  });

  it('Enter sends the key for that backend; checking… and a locked field while it runs', async () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-add')!.click();
    input(t).value = ' sk-ant-1 ';
    t.key('Enter');
    expect(t.host.querySelector('.lp-link')!.textContent).toBe(COPY.link.checking);
    expect(input(t).disabled).toBe(true);
    await settle();
    expect(t.puts).toEqual([['sk-ant-1', 'anthropic']]);
    expect(t.linked).toEqual(['anthropic']);
  });

  it('Esc and the tabs wait while a key is checked', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-add')!.click();
    input(t).value = 'k';
    t.key('Enter');
    t.key('Escape');
    t.tab('her').click();
    expect(t.host.querySelector('.lp-field')).not.toBeNull();
    expect(t.band.tab).toBe('keys');
  });

  it('a rejected key keeps the field and names its backend', async () => {
    const t = keysTab({ answer: { error: 'key-rejected' } });
    t.host.querySelector<HTMLButtonElement>('.mp-add')!.click();
    input(t).value = 'nope';
    t.key('Enter');
    await settle();
    expect(t.host.querySelector('.lp-msg')!.textContent).toBe(COPY.link.anthropic.errors['key-rejected']);
    expect(t.linked).toEqual([]);
    expect(document.activeElement).toBe(input(t));
  });

  it('no credit warns and still links', async () => {
    const t = keysTab({ answer: { ...LINK, state: 'no-credit' }, beatMs: 1 });
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    input(t).value = 'k';
    t.key('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(t.host.querySelector('.lp-msg')!.textContent).toBe(COPY.link.noCredit);
    await settle();
    expect(t.linked).toEqual(['openrouter']);
  });

  it('an empty field sends nothing; arrows and letters are the field\'s', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    t.key('Enter');
    expect(t.puts).toEqual([]);
    expect(t.key('ArrowLeft')).toBe(false);
    expect(t.key('a')).toBe(false);
    expect(t.band.tab).toBe('keys');
  });

  it('a letter with the field unfocused goes back into it', () => {
    const t = keysTab();
    t.host.querySelector<HTMLButtonElement>('.mp-change')!.click();
    input(t).blur();
    t.key('a');
    expect(document.activeElement).toBe(input(t));
  });

  it("with no key: KEYS only, OpenRouter's field up, nothing browsed; Esc backs out", () => {
    let browsed = 0;
    const t = setup({
      needsKey: true,
      links: { openrouter: NONE, anthropic: NONE },
      browse: async () => {
        browsed++;
        return { picks: [], recent: [], all: null };
      },
    });
    expect(t.band.tab).toBe('keys');
    expect(t.band.title).toBe(COPY.link.titleLink);
    expect(t.tab('her').disabled).toBe(true);
    expect(t.tab('all').disabled).toBe(true);
    expect(document.activeElement).toBe(input(t));
    expect(browsed).toBe(0);
    t.key('Escape');
    expect(t.backs()).toBe(1);
  });

  it("with no key, Anthropic's + LINK swaps the field over", () => {
    const t = setup({ needsKey: true, links: { openrouter: NONE, anthropic: NONE } });
    row(t, 'anthropic').querySelector<HTMLButtonElement>('.mp-add')!.click();
    expect(input(t).getAttribute('aria-label')).toBe(COPY.link.anthropic.fieldLabel);
    expect(t.host.querySelectorAll('.lp-field')).toHaveLength(1);
  });
});
