import fs from 'node:fs';
import path from 'node:path';

/**
 * A character's identity for one playthrough: `<pt>/chars/<id>/identity.md`, beside her room.db.
 * When it's there (and not blank) it replaces characters/<id>/identity.md in that playthrough only.
 */
export const IDENTITY_OVERRIDE = 'identity.md';

/** Her identity, read now: the playthrough's override in `dir` (her state folder), else the shared one. */
export function identityWithOverride(dir: string, shared: () => string): () => string {
  const file = path.join(dir, IDENTITY_OVERRIDE);
  return () => {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return shared();
      throw err;
    }
    return text.trim() ? text : shared();
  };
}

/** Copies every contact's override from one chars/ folder to another (saves and copies carry them). */
export function copyIdentityOverrides(fromChars: string, toChars: string): void {
  if (!fs.existsSync(fromChars)) return;
  for (const contact of fs.readdirSync(fromChars)) {
    const src = path.join(fromChars, contact, IDENTITY_OVERRIDE);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.join(toChars, contact), { recursive: true });
    fs.copyFileSync(src, path.join(toChars, contact, IDENTITY_OVERRIDE));
  }
}
