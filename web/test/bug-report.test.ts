import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bugReportOpen, closeBugReport, installBugReportKey, openBugReport, resetBugReportDraft } from '../src/ui/bug-report';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const flush = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function typeIn(sel: string, value: string): void {
  const el = $<HTMLInputElement | HTMLTextAreaElement>(sel)!;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

let fetchMock: ReturnType<typeof vi.fn>;
let posted: { description: string; contact: string; includeTurns: boolean; screenshot: string | null }[];

function reply(post: unknown) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/bug-report/context') return new Response(JSON.stringify({ playthroughName: 'Hicks — Oct 11', hasTurns: true }));
    posted.push(JSON.parse(init!.body as string));
    return new Response(JSON.stringify(post));
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  posted = [];
  reply({ sent: true });
});
afterEach(() => {
  closeBugReport();
  resetBugReportDraft();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (window as { lowlight?: unknown }).lowlight;
});

describe('bug report panel', () => {
  it('title panel has no screenshot box and shows the tip', async () => {
    openBugReport({ from: 'title', screenshot: null, onClose: () => {} });
    await flush();
    expect($('.bug-shot')).toBeNull();
    expect($('.bug-tip')!.textContent).toBe('Tip: press F8 in a scene to report from there, with a screenshot.');
    expect($('.bug-turns')!.textContent).toContain('The last 10 turns of Hicks — Oct 11 — your story text');
    expect($('.bug-fine')!.textContent).toBe(
      "Always included: build version, OS, room, who's here, model, and the last 200 lines of the game's log. Your OpenRouter key is never sent.",
    );
  });

  it('title panel hides the turns box when the playthrough has none', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ playthroughName: null, hasTurns: false })));
    openBugReport({ from: 'title', screenshot: null, onClose: () => {} });
    await flush();
    expect($('.bug-turns')).toBeNull();
  });

  it('scene panel shows the screenshot box when given one', () => {
    openBugReport({ from: 'scene', screenshot: 'iVBOR', canCapture: true, onClose: () => {} });
    const box = $<HTMLInputElement>('.bug-shot input')!;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect($('.bug-turns')!.textContent).toContain('The last 10 turns of this scene — your story text');
    expect($('.bug-tip')).toBeNull();
  });

  it('a failed capture shows the box unticked and disabled; a browser shows none', () => {
    openBugReport({ from: 'scene', screenshot: null, canCapture: true, onClose: () => {} });
    expect($<HTMLInputElement>('.bug-shot input')!.checked).toBe(false);
    expect($<HTMLInputElement>('.bug-shot input')!.disabled).toBe(true);
    closeBugReport();
    openBugReport({ from: 'scene', screenshot: null, canCapture: false, onClose: () => {} });
    expect($('.bug-shot')).toBeNull();
  });

  it('SEND disabled until there is a description', () => {
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    expect($<HTMLButtonElement>('.bug-send')!.disabled).toBe(true);
    typeIn('.bug-desc', '   ');
    expect($<HTMLButtonElement>('.bug-send')!.disabled).toBe(true);
    typeIn('.bug-desc', 'Hae froze');
    expect($<HTMLButtonElement>('.bug-send')!.disabled).toBe(false);
  });

  it('SEND posts once', async () => {
    openBugReport({ from: 'scene', screenshot: 'iVBOR', canCapture: true, onClose: () => {} });
    typeIn('.bug-desc', 'Hae froze');
    typeIn('.bug-contact', 'pat@x.io');
    $<HTMLButtonElement>('.bug-send')!.click();
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    expect(posted).toEqual([{ description: 'Hae froze', contact: 'pat@x.io', includeTurns: true, screenshot: 'iVBOR' }]);
    expect($('.bug-status')!.textContent).toBe('Sent — thanks. Bug reports go straight to the developer.');
  });

  it('unticked boxes send includeTurns:false and screenshot:null', async () => {
    openBugReport({ from: 'scene', screenshot: 'iVBOR', canCapture: true, onClose: () => {} });
    typeIn('.bug-desc', 'Hae froze');
    $<HTMLInputElement>('.bug-shot input')!.click();
    $<HTMLInputElement>('.bug-turns input')!.click();
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    expect(posted[0]).toMatchObject({ includeTurns: false, screenshot: null });
  });

  it('shows the saved file on failure, and OPEN FOLDER only in the desktop app', async () => {
    reply({ sent: false, reason: "couldn't reach the report server", file: '/logs/bug-report-20261011-120000.zip' });
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    typeIn('.bug-desc', 'Hae froze');
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    expect($('.bug-status')!.textContent).toBe("Couldn't send (couldn't reach the report server). The report is saved as /logs/bug-report-20261011-120000.zip.");
    expect($('.bug-open')).toBeNull();
    expect($('.bug-close')).not.toBeNull();

    closeBugReport();
    const openLogFolder = vi.fn();
    (window as { lowlight?: unknown }).lowlight = { openLogFolder };
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    $<HTMLButtonElement>('.bug-open')!.click();
    expect(openLogFolder).toHaveBeenCalledTimes(1);
  });

  it('nothing saved: says so and keeps the text', async () => {
    reply({ sent: false, reason: 'no report address in this build', file: null });
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    typeIn('.bug-desc', 'Hae froze');
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    expect($('.bug-status')!.textContent).toBe("Couldn't send (no report address in this build), and it couldn't be saved. Copy your text before closing.");
    expect($<HTMLTextAreaElement>('.bug-desc')!.value).toBe('Hae froze');
  });

  it('Escape closes and keeps the text; a sent report clears it', async () => {
    const onClose = vi.fn();
    openBugReport({ from: 'scene', screenshot: null, onClose });
    typeIn('.bug-desc', 'Hae froze');
    key('Escape');
    expect(bugReportOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    expect($<HTMLTextAreaElement>('.bug-desc')!.value).toBe('Hae froze');
    $<HTMLButtonElement>('.bug-send')!.click();
    await flush();
    closeBugReport();
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    expect($<HTMLTextAreaElement>('.bug-desc')!.value).toBe('');
  });

  it('gives focus back to what had it when it closes', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    openBugReport({ from: 'title', screenshot: null, onClose: () => {} });
    expect(document.activeElement).not.toBe(before);
    key('Escape');
    expect(document.activeElement).toBe(before);
  });

  it("keys don't reach the screen behind while open", () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    openBugReport({ from: 'title', screenshot: null, onClose: () => {} });
    key('Enter');
    key('ArrowRight');
    window.removeEventListener('keydown', behind);
    expect(behind).not.toHaveBeenCalled();
  });

  it('closes itself 2 s after sending', async () => {
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    typeIn('.bug-desc', 'Hae froze');
    vi.useFakeTimers();
    $<HTMLButtonElement>('.bug-send')!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(bugReportOpen()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(bugReportOpen()).toBe(false);
  });
});

describe('F8', () => {
  it('opens the panel in a scene, after taking the screenshot', async () => {
    const captureScreen = vi.fn(async () => {
      expect(bugReportOpen()).toBe(false);
      return 'iVBOR';
    });
    (window as { lowlight?: unknown }).lowlight = { captureScreen, openLogFolder: () => {} };
    const off = installBugReportKey({ inScene: () => true });
    key('F8');
    await flush();
    expect(captureScreen).toHaveBeenCalledTimes(1);
    expect(bugReportOpen()).toBe(true);
    expect($<HTMLInputElement>('.bug-shot input')!.checked).toBe(true);
    off();
  });

  it('does nothing outside a scene', async () => {
    const off = installBugReportKey({ inScene: () => false });
    key('F8');
    await flush();
    expect(bugReportOpen()).toBe(false);
    off();
  });

  it('F8 works while the room prompt has focus (it always has; F8 types nothing)', async () => {
    const off = installBugReportKey({ inScene: () => true });
    const chat = document.createElement('textarea');
    document.body.append(chat);
    chat.focus();
    key('F8', chat);
    await flush();
    expect(bugReportOpen()).toBe(true);
    off();
  });

  it('F8 ignored while the panel is open', async () => {
    const captureScreen = vi.fn(async () => 'iVBOR');
    (window as { lowlight?: unknown }).lowlight = { captureScreen, openLogFolder: () => {} };
    const off = installBugReportKey({ inScene: () => true });
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    key('F8');
    await flush();
    expect(captureScreen).not.toHaveBeenCalled();
    off();
  });

  it('in a browser: no screenshot box', async () => {
    const off = installBugReportKey({ inScene: () => true });
    key('F8');
    await flush();
    expect(bugReportOpen()).toBe(true);
    expect($('.bug-shot')).toBeNull();
    off();
  });
});
