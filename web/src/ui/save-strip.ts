/**
 * A save as a wide strip (pause menu spec, mockup 2026-10-30): the room cropped wide, your face on the left,
 * whoever you were with on the right, the save's name over it, and the place, story time and age under the
 * name. LOAD lists them; the room's SAVE card shows the one it's about to write.
 */
import './save-strip.css';

export interface SaveStripView {
  /** The room (a scene id), or null: no picture. */
  scene: string | null;
  /** Face thumbnails (`/api/agents/<id>/thumb`); null leaves that side to the room. */
  you: string | null;
  them: string | null;
  name: string;
  meta: string;
  /** The corner tag: `★ SAVE`, `⇢ TRIP`. */
  kind?: string;
  /** `big` (a save of yours, the card), `small` (an auto save). */
  size?: 'big' | 'small';
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** A scene's picture (its room.png). */
export const roomUrl = (sceneId: string) => `/scenes/${sceneId.split('/').map(encodeURIComponent).join('/')}/room.png`;

function face(url: string | null, side: 'l' | 'r'): HTMLElement | null {
  if (!url) return null;
  const img = el('img', `ss-face ss-${side}`);
  img.src = url;
  img.alt = '';
  // A face that won't load leaves the room showing.
  img.addEventListener('error', () => img.remove());
  return img;
}

export function saveStrip(v: SaveStripView): HTMLElement {
  const n = el('div', `ss${v.size === 'small' ? ' ss-small' : ''}`);
  const room = el('div', 'ss-room');
  if (v.scene) room.style.backgroundImage = `url('${roomUrl(v.scene)}')`;
  const text = el('div', 'ss-text');
  text.append(el('div', 'ss-name', v.name), el('div', 'ss-meta', v.meta));
  n.append(room, el('div', 'ss-fade'));
  for (const f of [face(v.you, 'l'), face(v.them, 'r')]) if (f) n.append(f);
  n.append(text);
  if (v.kind) n.append(el('div', 'ss-kind', v.kind));
  return n;
}
