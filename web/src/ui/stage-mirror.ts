/**
 * SYS → MIRROR: her figure on the stage flipped to face the other way. Her default comes from her file
 * (Studio MIRROR, `sprite.mirror`); a pick here overrides it, kept per character, per browser.
 */
const MIRROR_KEY = 'lowlight.mirror.picks';
/** The old list of mirrored contacts (on only): read as picks of on until a pick is saved. */
const OLD_KEY = 'lowlight.mirror';

function picks(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  try {
    const old: unknown = JSON.parse(localStorage.getItem(OLD_KEY) ?? '[]');
    if (Array.isArray(old)) for (const id of old) if (typeof id === 'string') out[id] = true;
    const v: unknown = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [id, on] of Object.entries(v)) if (typeof on === 'boolean') out[id] = on;
  } catch {
    // Storage off or unreadable: her default.
  }
  return out;
}

/** Whether this character is mirrored: the pick saved here, else `fallback` (her file's default). */
export function loadMirror(id: string, fallback = false): boolean {
  const p = picks();
  return Object.hasOwn(p, id) ? p[id] : fallback;
}

export function saveMirror(id: string, on: boolean): void {
  const p = picks();
  p[id] = on;
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(p));
    localStorage.removeItem(OLD_KEY);
  } catch {
    // Storage off: it holds for this page only.
  }
}

/**
 * Which way your contact shows: her setting on the right; stepped to the middle beside a place's resident she turns
 * the other way (mirrored on the right faces you, so in the middle she faces the resident).
 */
export function contactMirror(setting: boolean, inMiddle: boolean): boolean {
  return inMiddle ? !setting : setting;
}
