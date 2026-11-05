/** SYS → MIRROR: her figure on the stage flipped to face the other way. Kept per contact, per browser. */
const MIRROR_KEY = 'lowlight.mirror';

function mirrored(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether this contact is mirrored; not, when none is saved or storage is off. */
export function loadMirror(contactId: string): boolean {
  return mirrored().includes(contactId);
}

export function saveMirror(contactId: string, on: boolean): void {
  const rest = mirrored().filter((id) => id !== contactId);
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(on ? [...rest, contactId] : rest));
  } catch {
    // Storage off: it holds for this page only.
  }
}
