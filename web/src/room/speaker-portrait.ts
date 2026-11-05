/**
 * The speaker portrait (2026-10-17): a quest stranger with a face stands as a large framed bust at the
 * left of the subtitle line while they're in the scene, solid the whole time, as Disco Elysium keeps its
 * speaker's portrait up. A new stranger takes over with a quick switch; nobody present, it goes and the
 * line takes its room back (`has-portrait` on the feed's root). View only: the feed says who's present.
 */
import './speaker-portrait.css';

/** How long a switch takes: the old face leaves while the new one comes in (speaker-portrait.css matches). */
export const PORTRAIT_SWITCH_MS = 220;

export interface SpeakerPortrait {
  /** The stranger present with a face (null: nobody): their bust, framed in their accent if they have one. */
  show(s: { name: string; url: string; accent?: string } | null): void;
}

/**
 * `root` is the feed's root (`has-portrait` goes on it, so the line moves over). With `layerHost` (the game
 * stage), the busts go in their own `.sp-layer` there instead of inside the feed, so they stand over the job
 * table (z 24) as well as the subtitles; speaker-portrait.css hides that layer whenever the feed would.
 */
export function mountSpeakerPortrait(root: HTMLElement, layerHost?: HTMLElement): SpeakerPortrait {
  let into = root;
  if (layerHost) {
    into = document.createElement('div');
    into.className = 'sp-layer';
    layerHost.append(into);
  }
  let current: { el: HTMLElement; name: string; url: string } | null = null;

  const leave = (el: HTMLElement) => {
    el.classList.add('sp-leaving');
    setTimeout(() => el.remove(), PORTRAIT_SWITCH_MS);
  };

  const build = (s: { name: string; url: string; accent?: string }): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'sp-portrait';
    card.dataset.name = s.name;
    if (s.accent) card.style.setProperty('--sp-c', s.accent);
    const img = document.createElement('img');
    img.src = s.url;
    img.alt = '';
    img.addEventListener(
      'error',
      () => {
        const initial = document.createElement('div');
        initial.className = 'sp-initial';
        initial.textContent = s.name.charAt(0).toUpperCase();
        img.replaceWith(initial);
      },
      { once: true },
    );
    const corner = (side: string) => {
      const c = document.createElement('span');
      c.className = `sp-corner sp-${side}`;
      return c;
    };
    card.append(img, corner('tl'), corner('tr'));
    return card;
  };

  return {
    show(s) {
      if (s && current && s.name === current.name && s.url === current.url) return;
      if (current) leave(current.el);
      current = null;
      root.classList.toggle('has-portrait', s !== null);
      if (!s) return;
      const el = build(s);
      into.append(el);
      current = { el, name: s.name, url: s.url };
    },
  };
}
