import { afterEach, describe, expect, it } from 'vitest';
import { LinkPanel } from '../src/landing/link-panel';
import type { LinkError, LinkInfo } from '../src/net/link';
import { COPY } from '../src/landing/copy';

type PutResult = LinkInfo | { error: LinkError };

function setup(answer: () => Promise<PutResult>, changing = false) {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.append(host);
  const sent: string[] = [];
  const linked: LinkInfo[] = [];
  let backs = 0;
  const panel = new LinkPanel(host, {
    put: (k) => {
      sent.push(k);
      return answer();
    },
    onLinked: (i) => linked.push(i),
    onBack: () => backs++,
    changing,
    beatMs: 0,
  });
  const input = host.querySelector<HTMLInputElement>('.lp-key')!;
  const button = host.querySelector<HTMLButtonElement>('.lp-link')!;
  const msg = () => host.querySelector('.lp-msg')!.textContent;
  const key = (k: string) => panel.key(new KeyboardEvent('keydown', { key: k }));
  return { host, panel, input, button, msg, key, sent, linked, backs: () => backs };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const OK: LinkInfo = { linked: true, last4: '3f9a', credit: 4.12, state: 'ok' };
afterEach(() => (document.body.innerHTML = ''));

describe('LinkPanel', () => {
  it('shows the heading, the why line and a link to get a key', () => {
    const { host } = setup(async () => OK);
    expect(host.querySelector('.lp-h')!.textContent).toBe('LINK A MIND');
    expect(host.querySelector('.lp-why')!.textContent).toBe('Your contacts think through OpenRouter. Paste a key to wake them — it stays on this machine.');
    const a = host.querySelector<HTMLAnchorElement>('.lp-get a')!;
    expect(a.href).toBe('https://openrouter.ai/keys');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
  });

  it('the field is type=password and autocomplete=off', () => {
    const { input } = setup(async () => OK);
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('off');
  });

  it('Enter submits the field value; checking… and a locked field while pending', async () => {
    let resolve!: (r: PutResult) => void;
    const { input, button, key, sent } = setup(() => new Promise((r) => (resolve = r)));
    input.value = 'sk-or-v1-abc';
    expect(key('Enter')).toBe(true);
    expect(sent).toEqual(['sk-or-v1-abc']);
    expect(button.textContent).toBe('checking…');
    expect(input.disabled).toBe(true);
    resolve(OK);
    await tick();
    expect(input.disabled).toBe(false);
  });

  it('key-rejected shows the exact copy and keeps the panel', async () => {
    const { input, key, msg, linked, host } = setup(async () => ({ error: 'key-rejected' }));
    input.value = 'sk-or-bad';
    key('Enter');
    await tick();
    expect(msg()).toBe("key rejected — OpenRouter didn't accept that key. Check you copied all of it.");
    expect(linked).toEqual([]);
    expect(host.querySelector('.lp-key')).not.toBeNull();
  });

  it('unreachable shows the exact copy', async () => {
    const { input, key, msg } = setup(async () => ({ error: 'unreachable' }));
    input.value = 'sk-or-v1-abc';
    key('Enter');
    await tick();
    expect(msg()).toBe('OpenRouter unreachable — check your connection.');
  });

  it('linked calls onLinked with the info, after showing it', async () => {
    const { input, key, linked, msg } = setup(async () => OK);
    input.value = 'sk-or-v1-abc';
    key('Enter');
    await tick();
    expect(msg()).toBe('linked · $4.12');
    await tick();
    expect(linked).toEqual([OK]);
  });

  it('no-credit warns and still links', async () => {
    const info: LinkInfo = { ...OK, credit: 0, state: 'no-credit' };
    const { input, key, linked, msg } = setup(async () => info);
    input.value = 'sk-or-v1-abc';
    key('Enter');
    await tick();
    expect(msg()).toBe(COPY.link.noCredit);
    await tick();
    expect(linked).toEqual([info]);
  });

  it('an empty field submits nothing', () => {
    const { key, sent } = setup(async () => OK);
    key('Enter');
    expect(sent).toEqual([]);
  });

  it('Esc calls onBack', () => {
    const { key, backs } = setup(async () => OK);
    expect(key('Escape')).toBe(true);
    expect(backs()).toBe(1);
  });

  it('other keys are left to the field', () => {
    const { key } = setup(async () => OK);
    expect(key('a')).toBe(false);
  });
});


describe('LinkPanel (review fixes)', () => {
  it('ESC BACK is ignored while the key is being checked', async () => {
    let resolve!: (r: PutResult) => void;
    const { input, key, backs, host } = setup(() => new Promise((r) => (resolve = r)));
    input.value = 'sk-or-v1-abc';
    key('Enter');
    host.querySelector<HTMLButtonElement>('.lp-back')!.click();
    expect(backs()).toBe(0);
    resolve(OK);
    await tick();
  });

  it('a printable key with the field unfocused puts focus back in the field', () => {
    const { input, key } = setup(async () => OK);
    input.blur();
    expect(key('s')).toBe(false);
    expect(document.activeElement).toBe(input);
  });
});

describe('LinkPanel: OPENROUTER · ANTHROPIC', () => {
  function two(answer: () => Promise<PutResult> = async () => OK, provider?: 'openrouter' | 'anthropic') {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const sent: [string, string][] = [];
    const linked: [LinkInfo, string][] = [];
    const panel = new LinkPanel(host, {
      put: (k, p) => {
        sent.push([k, p]);
        return answer();
      },
      onLinked: (i, p) => linked.push([i, p]),
      onBack: () => {},
      changing: false,
      beatMs: 0,
      ...(provider ? { provider } : {}),
    });
    const tab = (p: string) => host.querySelector<HTMLButtonElement>(`.lp-tab[data-provider="${p}"]`)!;
    return { host, panel, tab, sent, linked, input: host.querySelector<HTMLInputElement>('.lp-key')! };
  }

  it('opens on OpenRouter; the switch shows both', () => {
    const { tab } = two();
    expect(tab('openrouter').getAttribute('aria-selected')).toBe('true');
    expect(tab('anthropic').getAttribute('aria-selected')).toBe('false');
    expect(tab('openrouter').textContent).toBe('OPENROUTER');
    expect(tab('anthropic').textContent).toBe('ANTHROPIC');
  });

  it("ANTHROPIC: its own why line, field label and get-key link; the key goes up as anthropic's", async () => {
    const { host, tab, sent, linked, panel, input } = two();
    tab('anthropic').click();
    expect(host.querySelector('.lp-why')!.textContent).toBe(COPY.link.anthropic.why);
    expect(host.querySelector('.lp-lbl')!.textContent).toBe('ANTHROPIC KEY');
    expect(host.querySelector<HTMLAnchorElement>('.lp-get a')!.href).toBe('https://platform.claude.com/settings/keys');
    input.value = 'sk-ant-api03-abc';
    panel.key(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    await tick();
    expect(sent).toEqual([['sk-ant-api03-abc', 'anthropic']]);
    expect(linked.map(([, p]) => p)).toEqual(['anthropic']);
  });

  it("a rejected Anthropic key names Anthropic", async () => {
    const { tab, panel, input, host } = two(async () => ({ error: 'key-rejected' }));
    tab('anthropic').click();
    input.value = 'sk-ant-bad-123';
    panel.key(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    expect(host.querySelector('.lp-msg')!.textContent).toBe(COPY.link.anthropic.errors['key-rejected']);
    expect(COPY.link.anthropic.errors['key-rejected']).toContain('Anthropic');
  });

  it('can open on Anthropic', () => {
    const { tab } = two(undefined, 'anthropic');
    expect(tab('anthropic').getAttribute('aria-selected')).toBe('true');
  });
});
