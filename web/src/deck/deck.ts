/**
 * The deck (spec 2026-10-23): texting your contacts, built for a phone. Its own page at /deck: no stage, no room
 * audio. The list and a thread share the screen; the phone's back button goes from a thread to the list.
 */
import './deck.css';
import { historyNav, mountDeck } from './deck-client';
import { renderBoot } from './deck-view';

export function startDeck(): void {
  document.title = 'Lowlight · Deck';
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Chakra+Petch:wght@400;600&display=swap';
  document.head.append(fonts);
  document.body.innerHTML = '';
  document.body.className = 'dk-body';
  const root = document.createElement('div');
  root.className = 'dk-root';
  document.body.append(root);
  // The network's boot screen over the deck while it connects; once per page load.
  document.body.append(renderBoot(() => {}));

  // The keyboard takes the bottom of the screen: the deck fits what's left (Review Focus 5).
  // iOS pans the page up as the keyboard opens: follow the visual viewport's top too (#4).
  const fit = () => {
    root.style.setProperty('--dk-h', `${window.visualViewport?.height ?? window.innerHeight}px`);
    root.style.setProperty('--dk-top', `${window.visualViewport?.offsetTop ?? 0}px`);
  };
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  fit();

  mountDeck(root, { look: 'phone', nav: historyNav() });
}
