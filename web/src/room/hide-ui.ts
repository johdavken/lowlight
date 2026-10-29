/**
 * Alt+H hides the room's UI, leaving the room and its figures (for screenshots, or a look at an outfit).
 * `body.ui-hidden` does the hiding (style.css). Alt+H again, any other key or a click brings it back,
 * and that key or click does nothing else: Esc doesn't leave the room, a letter doesn't type unseen.
 * Returns the toggle; the chrome keys call it.
 */
export function listenHideUi(target: Window, body: HTMLElement): { toggle(): void; readonly hidden: boolean } {
  const show = (e: Event) => {
    if (!body.classList.contains('ui-hidden')) return;
    // Alt+H is the toggle's own key (the chrome keys run it); a lone modifier is half of a chord.
    if (e instanceof KeyboardEvent && ((e.altKey && e.code === 'KeyH') || ['Alt', 'Shift', 'Control', 'Meta'].includes(e.key))) return;
    body.classList.remove('ui-hidden');
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  target.addEventListener('keydown', show, true);
  target.addEventListener('pointerdown', show, true);
  return {
    toggle: () => body.classList.toggle('ui-hidden'),
    get hidden() {
      return body.classList.contains('ui-hidden');
    },
  };
}
