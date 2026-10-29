/**
 * The comms inset (spec 2026-10-20 §2, mockup C): while she's on the line, her face on a small tinted
 * monitor at the left of the subtitle line, a recording light, and `ON COMMS · <where she is>`. View only.
 */
import './comms-inset.css';

export interface CommsInset {
  /** Her on the line (null: off): her face (a sprite or portrait URL), where she is, her accent. */
  show(s: { name: string; face: string; where: string; accent?: string } | null): void;
}

export function mountCommsInset(root: HTMLElement): CommsInset {
  let current: HTMLElement | null = null;
  return {
    show(s) {
      current?.remove();
      current = null;
      root.classList.toggle('has-comms', s !== null);
      if (!s) return;
      const box = document.createElement('div');
      box.className = 'ci';
      if (s.accent) box.style.setProperty('--ci-c', s.accent);
      const face = document.createElement('div');
      face.className = 'ci-face';
      face.style.backgroundImage = `url("${s.face}")`;
      face.setAttribute('role', 'img');
      face.setAttribute('aria-label', s.name);
      const scan = document.createElement('div');
      scan.className = 'ci-scan';
      const rec = document.createElement('div');
      rec.className = 'ci-rec';
      const cap = document.createElement('div');
      cap.className = 'ci-cap';
      cap.textContent = `ON COMMS · ${s.where.toUpperCase()}`;
      box.append(face, scan, rec, cap);
      root.append(box);
      current = box;
    },
  };
}
