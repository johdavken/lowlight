/**
 * Her plan's card (her plans spec 2026-10-21 §5): she says she's going, and you answer.
 * NIX IS HEADING HOME · Hae's Noodles at 21:00 — LET HER GO / GO WITH HER.
 */
import type { PlanCard } from '../../../shared/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountPlanCard(root: HTMLElement, o: { letGo(): void; stay(): void }): { show(card: PlanCard | null): void } {
  let box: HTMLElement | null = null;
  const button = (label: string, cls: string, act: () => void) => {
    const b = el('button', `pcd-btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  };
  return {
    show(card) {
      if (!card) {
        box?.remove();
        box = null;
        return;
      }
      box ??= el('div', 'plan-card');
      const keys = el('div', 'pcd-keys');
      keys.append(button('LET HER GO', 'pcd-go', o.letGo), button('GO WITH HER', 'pcd-stay', o.stay));
      box.replaceChildren(el('div', 'pcd-title', `${card.name} IS HEADING ${card.going}`.toUpperCase()), ...(card.meet ? [el('div', 'pcd-meet', card.meet.toUpperCase())] : []), keys);
      if (!box.isConnected) root.append(box);
    },
  };
}
