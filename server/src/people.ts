/**
 * The people library (character creator spec 2026-11-14): `<dataDir>/people/<id>/` holds `person.json`,
 * the kept figure (`figure.png` + `figure.json`, as a save's persona/ holds them) and `takes/` while the
 * creator is open. The game server is its only writer.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parsePerson, PERSON_ID_RE, type Person, type PersonRow, type PersonWho } from '../../shared/person';
import { FIGURE_JSON, FIGURE_PNG, parseFigureMeta, readFigure, TAKES_DIR, type FigureMeta } from './persona-figure';
import { DEFAULT_FIGURE_MODEL } from '../../shared/figure-prompt';

export const PERSON_JSON = 'person.json';
export const TAKE_RE = /^[0-9]{13}-[0-9a-f]{6}$/;

/** A refusal the routes turn into a status. */
export class PeopleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface People {
  list(): PersonRow[];
  get(id: string): PersonRow | null;
  draft(): Person;
  save(id: string, who: PersonWho): PersonRow;
  keep(id: string, take: string, fit: { face: { x: number; y: number }; waist: number; fields: Record<string, string> }): PersonRow;
  remove(id: string): void;
  takes(id: string): { take: string; made: number }[];
  takeFile(id: string, take: string, raw: boolean): string;
  dropTakes(id: string): void;
  dir(id: string): string;
  sweepDrafts(): void;
}

function writeAtomic(file: string, data: string | Buffer): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function createPeople(root: string): People {
  let lastMade = 0;
  const dir = (id: string) => {
    if (!PERSON_ID_RE.test(id)) throw new PeopleError(404, 'no-person', `no person '${id}'`);
    return path.join(root, id);
  };
  const read = (id: string): Person | null => {
    if (!PERSON_ID_RE.test(id)) return null;
    try {
      const p = parsePerson(JSON.parse(fs.readFileSync(path.join(root, id, PERSON_JSON), 'utf8')));
      return p && p.id === id ? p : null;
    } catch {
      return null;
    }
  };
  const row = (p: Person): PersonRow => {
    const fig = readFigure(path.join(root, p.id));
    return { ...p, figure: fig !== null, figureMade: fig?.meta.made ?? null };
  };
  const must = (id: string): Person => {
    const p = read(id);
    if (!p) throw new PeopleError(404, 'no-person', `no person '${id}'`);
    return p;
  };
  const write = (p: Person) => writeAtomic(path.join(dir(p.id), PERSON_JSON), `${JSON.stringify(p, null, 2)}\n`);
  const ids = (): string[] => {
    try {
      return fs.readdirSync(root).filter((n) => PERSON_ID_RE.test(n));
    } catch {
      return [];
    }
  };
  const takeFile = (id: string, take: string, raw: boolean) => {
    if (!TAKE_RE.test(take)) throw new PeopleError(400, 'bad-take', 'not a take');
    return path.join(dir(id), TAKES_DIR, `${take}${raw ? '.raw' : ''}.png`);
  };

  return {
    dir,
    takeFile,
    list: () =>
      ids()
        .map(read)
        .filter((p): p is Person => p !== null && !p.draft)
        .sort((a, b) => (a.made < b.made ? 1 : a.made > b.made ? -1 : a.id < b.id ? 1 : -1))
        .map(row),
    get: (id) => {
      const p = read(id);
      return p ? row(p) : null;
    },
    draft: () => {
      // Strictly increasing, so two made in one millisecond still list newest first.
      lastMade = Math.max(Date.now(), lastMade + 1);
      const id = `p-${lastMade}-${crypto.randomBytes(3).toString('hex')}`;
      const p: Person = { id, name: '', pronoun: 'they', background: '', wears: '', made: new Date(lastMade).toISOString(), draft: true };
      fs.mkdirSync(dir(id), { recursive: true });
      write(p);
      return p;
    },
    save: (id, who) => {
      const { draft: _draft, ...was } = must(id);
      const p: Person = { ...was, ...who };
      write(p);
      return row(p);
    },
    keep: (id, take, fit) => {
      const p = must(id);
      if (!p.wears) throw new PeopleError(409, 'no-wears', 'A figure needs a WEARS line: save WHO first');
      const src = takeFile(id, take, false);
      if (!fs.existsSync(src)) throw new PeopleError(404, 'no-take', 'no such take');
      const meta: FigureMeta | null = parseFigureMeta({ face: fit.face, waist: fit.waist, wears: p.wears, model: DEFAULT_FIGURE_MODEL, made: new Date().toISOString(), fields: fit.fields });
      if (!meta) throw new PeopleError(400, 'bad-fit', 'A figure needs a face point and a waist between 0 and 1');
      // The png first, then the json readFigure checks for: a half-kept figure reads as the old one or none.
      writeAtomic(path.join(dir(id), FIGURE_PNG), fs.readFileSync(src));
      writeAtomic(path.join(dir(id), FIGURE_JSON), JSON.stringify(meta, null, 2));
      return row(p);
    },
    remove: (id) => {
      fs.rmSync(dir(id), { recursive: true, force: true });
    },
    takes: (id) => {
      let files: string[] = [];
      try {
        files = fs.readdirSync(path.join(dir(id), TAKES_DIR));
      } catch {
        /* none yet */
      }
      return files
        .filter((f) => f.endsWith('.png') && !f.endsWith('.raw.png'))
        .map((f) => f.slice(0, -4))
        .filter((t) => TAKE_RE.test(t))
        .map((take) => ({ take, made: Number(take.slice(0, 13)) }))
        .sort((a, b) => b.made - a.made || (a.take < b.take ? 1 : -1));
    },
    dropTakes: (id) => {
      fs.rmSync(path.join(dir(id), TAKES_DIR), { recursive: true, force: true });
    },
    sweepDrafts: () => {
      for (const id of ids()) {
        const p = read(id);
        if (p?.draft) fs.rmSync(path.join(root, id), { recursive: true, force: true });
      }
    },
  };
}
