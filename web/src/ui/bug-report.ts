/**
 * The bug report panel (spec 2026-10-11 bug report §3): REPORT A BUG on the title, or F8 in a scene. The
 * player writes what happened; the server adds the game's state and log and sends it to the developer,
 * or saves it in the logs folder when it can't. Story text and a screenshot go only when ticked.
 * While open it takes every key, so neither the title's band nor the room hears them; the room's own
 * overlays that listen on window first (journal, map, gig window, dice tray) check `bugReportOpen()`.
 */
import './bug-report.css';
import { gameRoot } from './game-stage';

const COPY = {
  title: 'REPORT A BUG',
  desc: 'What happened?',
  contact: 'Your Patreon name or email (optional, for a reply)',
  shot: 'Screenshot of the game window',
  turnsScene: 'The last 10 turns of this scene — your story text',
  turnsOf: (name: string) => `The last 10 turns of ${name} — your story text`,
  fine: "Always included: build version, OS, room, who's here, model, and the last 200 lines of the game's log. Your OpenRouter key is never sent.",
  tip: 'Tip: press F8 in a scene to report from there, with a screenshot.',
  sending: 'Sending…',
  sent: 'Sent — thanks. Bug reports go straight to the developer.',
  saved: (reason: string, file: string) => `Couldn't send (${reason}). The report is saved as ${file}.`,
  lost: (reason: string) => `Couldn't send (${reason}), and it couldn't be saved. Copy your text before closing.`,
  failed: "Couldn't reach the game's server. Copy your text before closing.",
};
const DESC_MAX = 4000;
const CONTACT_MAX = 200;
const SENT_CLOSE_MS = 2000;

type Outcome = { sent: true } | { sent: false; reason: string; file: string | null };

interface Bridge {
  captureScreen?(): Promise<string | null>;
  openLogFolder?(): void;
}
const bridge = (): Bridge | undefined => (window as { lowlight?: Bridge }).lowlight;

/** What the player typed: kept across cancel and reopen in this session, cleared once a report is sent. */
const draft = { description: '', contact: '' };

let current: { root: HTMLElement; close(): void } | null = null;

export function bugReportOpen(): boolean {
  return current !== null;
}

export function closeBugReport(): void {
  current?.close();
}

/** Tests: forget the draft. */
export function resetBugReportDraft(): void {
  draft.description = '';
  draft.contact = '';
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function checkbox(cls: string, label: string, checked: boolean, disabled = false): { row: HTMLLabelElement; box: HTMLInputElement } {
  const row = el('label', `bug-check ${cls}`);
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.disabled = disabled;
  row.append(box, el('span', 'bug-check-label', label));
  return { row, box };
}

/**
 * Opens the panel. From a scene, `screenshot` is the capture taken before opening (null: none) and
 * `canCapture` says whether this app can take one at all (the desktop app; a browser can't).
 */
export function openBugReport(o: { from: 'title' | 'scene'; screenshot: string | null; canCapture?: boolean; onClose(): void }): void {
  if (current) return;
  const focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = el('div', 'bug-report');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', COPY.title);
  const panel = el('div', 'bug-panel');
  const desc = el('textarea', 'bug-desc');
  desc.placeholder = COPY.desc;
  desc.maxLength = DESC_MAX;
  desc.value = draft.description;
  const contact = el('input', 'bug-contact');
  contact.type = 'text';
  contact.placeholder = COPY.contact;
  contact.maxLength = CONTACT_MAX;
  contact.value = draft.contact;

  const checks = el('div', 'bug-checks');
  const shot = o.from === 'scene' && o.canCapture ? checkbox('bug-shot', COPY.shot, o.screenshot !== null, o.screenshot === null) : null;
  if (shot) checks.append(shot.row);
  let turns: { row: HTMLLabelElement; box: HTMLInputElement } | null = null;
  if (o.from === 'scene') {
    turns = checkbox('bug-turns', COPY.turnsScene, true);
    checks.append(turns.row);
  }

  const status = el('p', 'bug-status');
  status.setAttribute('aria-live', 'polite');
  const send = el('button', 'bug-send', 'SEND');
  const cancel = el('button', 'bug-cancel', 'CANCEL');
  for (const b of [send, cancel]) b.type = 'button';
  const buttons = el('div', 'bug-buttons');
  buttons.append(send, cancel);

  panel.append(el('h2', 'bug-title', COPY.title), desc, contact, checks, el('p', 'bug-fine', COPY.fine));
  if (o.from === 'title') panel.append(el('p', 'bug-tip', COPY.tip));
  panel.append(status, buttons);
  root.append(panel);
  gameRoot().append(root);

  let pending = false;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let sent = false;
  const update = () => {
    if (!sent) {
      draft.description = desc.value;
      draft.contact = contact.value;
    }
    send.disabled = pending || done || desc.value.trim() === '';
  };
  desc.addEventListener('input', update);
  contact.addEventListener('input', update);
  update();

  function close(): void {
    if (current?.root !== root) return;
    if (timer) clearTimeout(timer);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
    current = null;
    if (focusBefore?.isConnected) focusBefore.focus();
    o.onClose();
  }

  /** After the outcome: CLOSE (and OPEN FOLDER, in the desktop app, when a file was saved). */
  function finish(file: string | null): void {
    buttons.replaceChildren();
    const b = bridge();
    if (file && b?.openLogFolder) {
      const openFolder = el('button', 'bug-open', 'OPEN FOLDER');
      openFolder.type = 'button';
      openFolder.addEventListener('click', () => b.openLogFolder?.());
      buttons.append(openFolder);
    }
    const closeB = el('button', 'bug-close', 'CLOSE');
    closeB.type = 'button';
    closeB.addEventListener('click', close);
    buttons.append(closeB);
    closeB.focus();
  }

  async function submit(): Promise<void> {
    if (send.disabled) return;
    pending = true;
    update();
    status.textContent = COPY.sending;
    let out: Outcome | null = null;
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: desc.value,
          contact: contact.value,
          includeTurns: turns?.box.checked ?? false,
          screenshot: shot?.box.checked ? o.screenshot : null,
        }),
      });
      out = res.ok ? ((await res.json()) as Outcome) : null;
    } catch {
      out = null;
    }
    pending = false;
    if (out?.sent) {
      done = true;
      sent = true;
      resetBugReportDraft();
      status.textContent = COPY.sent;
      update();
      finish(null);
      timer = setTimeout(close, SENT_CLOSE_MS);
      return;
    }
    status.textContent = !out ? COPY.failed : out.file ? COPY.saved(out.reason, out.file) : COPY.lost(out.reason);
    done = true;
    update();
    finish(out?.file ?? null);
  }
  send.addEventListener('click', () => void submit());
  cancel.addEventListener('click', close);

  // Capture phase: every key stops here, so the screen behind never hears it.
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (done && e.key !== 'Tab' && !(e.target instanceof HTMLButtonElement)) {
      // Sent or saved: any key closes, as the CLOSE button does.
      e.preventDefault();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  current = { root, close };
  desc.focus();

  if (o.from === 'title') {
    void fetch('/api/bug-report/context')
      .then((r) => r.json() as Promise<{ playthroughName: string | null; hasTurns: boolean }>)
      .then((c) => {
        if (current?.root !== root || !c.hasTurns || !c.playthroughName) return;
        turns = checkbox('bug-turns', COPY.turnsOf(c.playthroughName), true);
        checks.append(turns.row);
      })
      .catch(() => {});
  }
}

/** F8 in a scene: the screenshot first (so it shows the scene, not the panel), then the panel. Returns the uninstall. */
export function installBugReportKey(o: { inScene(): boolean }): () => void {
  let capturing = false;
  const onKey = async (e: KeyboardEvent) => {
    // Any focus: the room's prompt always has it, and F8 types nothing into it.
    if (e.key !== 'F8' || capturing || bugReportOpen() || !o.inScene()) return;
    e.preventDefault();
    const capture = bridge()?.captureScreen;
    capturing = true;
    let screenshot: string | null = null;
    try {
      screenshot = capture ? await capture() : null;
    } catch {
      screenshot = null;
    } finally {
      capturing = false;
    }
    if (bugReportOpen() || !o.inScene()) return;
    openBugReport({ from: 'scene', screenshot, canCapture: !!capture, onClose: () => {} });
  };
  const handler = (e: KeyboardEvent) => void onKey(e);
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
