/**
 * The desktop app's corner on the title (spec 2026-10-09 preview build §5.2): the build's version, and
 * a ? that opens the save and log folders. Only the packaged app's preload provides `window.lowlight`;
 * in a browser (npm run dev) nothing renders.
 */
import { COPY } from './copy';
import './help.css';

export interface LowlightBridge {
  version(): string;
  /** A test build's tag (`test MM-DD HH:MM`), null for a release; absent from an older preload. */
  build?(): string | null;
  packaged: boolean;
  openSaveFolder(): void;
  openLogFolder(): void;
  /** The game window as a base64 PNG (≤ 1600 px wide), for a bug report; null if it couldn't be taken. Absent from an older preload. */
  captureScreen?(): Promise<string | null>;
}

declare global {
  interface Window {
    lowlight?: LowlightBridge;
  }
}

function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function mountHelpCorner(root: HTMLElement, bridge: LowlightBridge | undefined): { destroy(): void } {
  if (!bridge) return { destroy() {} };
  const version = bridge.version();
  const build = bridge.build?.() ?? null;
  const shown = build?.startsWith('test ') ? `${version} · TEST ${build.slice(5)}` : version;
  const copied = build ? `${version} (${build})` : version;
  const corner = document.createElement('div');
  corner.className = 'help-corner';
  const label = document.createElement('span');
  label.className = 'ver-label';
  label.textContent = COPY.help.label(shown);
  const panel = document.createElement('div');
  panel.className = 'help-panel';
  panel.hidden = true;
  const versionRow = button('help-row', COPY.help.version(copied), () => {
    void navigator.clipboard?.writeText(copied).then(
      () => {
        versionRow.textContent = `${COPY.help.version(copied)} · ${COPY.help.copied}`;
      },
      () => {},
    );
  });
  panel.append(button('help-row', COPY.help.saveFolder, () => bridge.openSaveFolder()), button('help-row', COPY.help.logFolder, () => bridge.openLogFolder()), versionRow);
  const toggle = button('help-button', COPY.help.button, () => {
    panel.hidden = !panel.hidden;
    versionRow.textContent = COPY.help.version(copied);
  });
  toggle.setAttribute('aria-label', COPY.help.buttonLabel);
  corner.append(panel, label, toggle);
  root.append(corner);

  // While the panel is open it has the keyboard: Escape closes it, and no key reaches the title behind.
  const onKey = (e: KeyboardEvent) => {
    if (panel.hidden) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      panel.hidden = true;
    }
  };
  window.addEventListener('keydown', onKey, true);
  return {
    destroy() {
      window.removeEventListener('keydown', onKey, true);
      corner.remove();
    },
  };
}
