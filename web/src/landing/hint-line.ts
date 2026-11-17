/**
 * The front end's key line in the HUD trace (mockup frontend-hud.html B, playtest 2026-11-14): each `[KEY]` lit in
 * cyan, its words dim, the ` · ` between them dimmer. The text reads the same as before (tests and screen readers).
 */
import './trace.css';

export function setHints(el: HTMLElement, text: string): void {
  const out: Node[] = [];
  text.split(' · ').forEach((part, i) => {
    if (i > 0) {
      const sep = document.createElement('i');
      sep.textContent = ' · ';
      out.push(sep);
    }
    const m = /^(\[[^\]]+\])(.*)$/su.exec(part);
    if (!m) {
      out.push(document.createTextNode(part));
      return;
    }
    const key = document.createElement('b');
    key.textContent = m[1];
    out.push(key, document.createTextNode(m[2]));
  });
  el.replaceChildren(...out);
  el.classList.add('hint-line');
}
