/** The transcript's font (SYS → FONT): the lines people say, not their names. Kept per browser like TEXT SIZE. */
export const CHAT_FONTS = ['plex', 'chakra', 'baskerville', 'sharetech'] as const;
export type ChatFont = (typeof CHAT_FONTS)[number];
const FONT_KEY = 'lowlight.chatFont';

/** What SYS shows for each, and the family it's shown in. */
export const CHAT_FONT_LABEL: Record<ChatFont, string> = {
  plex: 'PLEX MONO',
  chakra: 'CHAKRA PETCH',
  baskerville: 'BASKERVILLE',
  sharetech: 'SHARE TECH',
};
export const CHAT_FONT_FAMILY: Record<ChatFont, string> = {
  plex: "'IBM Plex Mono', ui-monospace, monospace",
  chakra: "'Chakra Petch', ui-sans-serif, sans-serif",
  baskerville: "'Libre Baskerville', Georgia, serif",
  sharetech: "'Share Tech Mono', ui-monospace, monospace",
};

/** The saved font; Plex Mono when none is saved, it isn't one, or storage is off. */
export function loadChatFont(): ChatFont {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return (CHAT_FONTS as readonly string[]).includes(v ?? '') ? (v as ChatFont) : 'plex';
  } catch {
    return 'plex';
  }
}

export function saveChatFont(f: ChatFont): void {
  try {
    localStorage.setItem(FONT_KEY, f);
  } catch {
    // Storage off: the font holds for this page only.
  }
}

/** The next font (+1) or the one before (−1), going round. */
export function stepChatFont(f: ChatFont, d: number): ChatFont {
  const n = CHAT_FONTS.length;
  return CHAT_FONTS[(CHAT_FONTS.indexOf(f) + Math.sign(d) + n) % n];
}

/** Sets `--chat-font` on `root` (the game stage): the transcript's `.text` reads it. */
export function applyChatFont(root: HTMLElement, f: ChatFont): void {
  root.style.setProperty('--chat-font', CHAT_FONT_FAMILY[f]);
}
