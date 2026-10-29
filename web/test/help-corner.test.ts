import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountHelpCorner as mountRaw, type LowlightBridge } from '../src/landing/help-corner';

/** Every corner a test mounts, destroyed after it, so an open panel's key listener can't leak into the next test. */
const mounted: { destroy(): void }[] = [];
const mountHelpCorner = (...a: Parameters<typeof mountRaw>) => {
  const h = mountRaw(...a);
  mounted.push(h);
  return h;
};

function bridge(over: Partial<LowlightBridge> = {}): LowlightBridge {
  return { version: () => '0.1.0-preview.1', packaged: true, openSaveFolder: vi.fn(), openLogFolder: vi.fn(), ...over };
}
const byText = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.startsWith(text))!;
const key = (k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe('mountHelpCorner', () => {
  afterEach(() => {
    for (const h of mounted.splice(0)) h.destroy();
    document.body.innerHTML = '';
  });

  it('renders nothing without the desktop bridge', () => {
    const root = document.createElement('div');
    mountHelpCorner(root, undefined);
    expect(root.innerHTML).toBe('');
  });

  it('shows the version and opens the save and log folders', () => {
    const b = bridge();
    const root = document.body.appendChild(document.createElement('div'));
    mountHelpCorner(root, b);
    expect(root.querySelector('.ver-label')!.textContent).toBe('PREVIEW 0.1.0-preview.1');
    expect(root.querySelector('.help-panel')!.hasAttribute('hidden')).toBe(true);
    root.querySelector<HTMLButtonElement>('.help-button')!.click();
    expect(root.querySelector('.help-panel')!.hasAttribute('hidden')).toBe(false);
    byText(root, 'OPEN SAVE FOLDER').click();
    expect(b.openSaveFolder).toHaveBeenCalledOnce();
    byText(root, 'OPEN LOG FOLDER').click();
    expect(b.openLogFolder).toHaveBeenCalledOnce();
  });

  it('a test build says so beside its version', () => {
    const root = document.body.appendChild(document.createElement('div'));
    mountHelpCorner(root, bridge({ build: () => 'test 10-09 21:14' }));
    expect(root.querySelector('.ver-label')!.textContent).toBe('PREVIEW 0.1.0-preview.1 · TEST 10-09 21:14');
    expect(byText(root, 'VERSION').textContent).toBe('VERSION 0.1.0-preview.1 (test 10-09 21:14)');
  });

  it('a release (no build tag, or an older preload without build) shows the plain version', () => {
    for (const b of [bridge({ build: () => null }), bridge()]) {
      const root = document.body.appendChild(document.createElement('div'));
      mountHelpCorner(root, b);
      expect(root.querySelector('.ver-label')!.textContent).toBe('PREVIEW 0.1.0-preview.1');
    }
  });

  it('VERSION copies the version', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const root = document.body.appendChild(document.createElement('div'));
    mountHelpCorner(root, bridge());
    byText(root, 'VERSION').click();
    expect(writeText).toHaveBeenCalledWith('0.1.0-preview.1');
  });

  it('closes on Escape and on a second click of ?, and keeps keys from the title while open', () => {
    const root = document.body.appendChild(document.createElement('div'));
    mountHelpCorner(root, bridge());
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    const button = root.querySelector<HTMLButtonElement>('.help-button')!;
    const panel = root.querySelector('.help-panel')!;
    button.click();
    key('Enter');
    expect(behind).not.toHaveBeenCalled();
    key('Escape');
    expect(panel.hasAttribute('hidden')).toBe(true);
    key('Enter');
    expect(behind).toHaveBeenCalledOnce();
    button.click();
    button.click();
    expect(panel.hasAttribute('hidden')).toBe(true);
    window.removeEventListener('keydown', behind);
  });

  it('destroy removes it and its key listener', () => {
    const root = document.body.appendChild(document.createElement('div'));
    const h = mountHelpCorner(root, bridge());
    root.querySelector<HTMLButtonElement>('.help-button')!.click();
    h.destroy();
    expect(root.innerHTML).toBe('');
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    key('Enter');
    expect(behind).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', behind);
  });
});
