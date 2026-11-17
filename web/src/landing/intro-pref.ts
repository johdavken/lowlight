/**
 * SYS → INTRO: SKIP goes straight to the splash on start up, without the opening card. Kept per browser (the desktop
 * client's too). Apart from the card (opening-card.ts) so the room can set it without loading the card's code.
 */
const SKIP_KEY = 'lowlight.introSkipped';

export function loadIntroSkipped(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return storage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveIntroSkipped(skip: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (skip) storage.setItem(SKIP_KEY, '1');
    else storage.removeItem(SKIP_KEY);
  } catch {
    // Blocked storage: the card plays as before.
  }
}
