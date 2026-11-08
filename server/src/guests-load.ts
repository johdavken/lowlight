/**
 * Guest files (The Passenger spec, engine §2): someone a mission brings on a foil crew card who isn't a contact, read
 * once at startup from world/crew/guests/<id>.md. Front matter: name, spec, sex, accent, art (a file in the crew art
 * folder), line. A file that breaks a rule is skipped with a warning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalSpec, SPECIALTIES, type Specialty } from '../../shared/crew-book';
import { splitFrontMatter } from '../../shared/lore';
import type { GuestCard } from '../../shared/types';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ART = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(png|webp|jpg)$/;

/** The guests in `dir`; none when it's missing. Their art is served from the crew art folder beside it (`../art`). */
export function loadGuests(dir: string, warn: (m: string) => void): GuestCard[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
  return names.flatMap((name): GuestCard[] => {
    const id = name.slice(0, -3);
    const r = splitFrontMatter(fs.readFileSync(path.join(dir, name), 'utf8'));
    const skip = (why: string): [] => (warn(`guest ${name}: ${why}; skipping it`), []);
    if ('field' in r) return skip(r.message);
    const f = r.front as Record<string, string | undefined>;
    const spec = normalSpec(f.spec ?? '') as Specialty;
    if (!ID.test(id)) return skip('the file name must be lowercase letters, digits and dashes');
    if (!f.name) return skip('needs name:');
    if (!(SPECIALTIES as readonly string[]).includes(spec)) return skip(`no trade '${f.spec ?? ''}'`);
    if (f.art !== undefined && !ART.test(f.art)) return skip(`art: is a .png, .webp or .jpg file name`);
    const art = f.art && fs.existsSync(path.join(dir, '..', 'art', f.art)) ? `/api/crew/art/${f.art}` : null;
    return [{ id, name: f.name, spec, accent: f.accent ?? '#c8c8c8', portrait: null, art, line: f.line ?? null }];
  });
}
