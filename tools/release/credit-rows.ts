/**
 * CREDITS.md's rows, read from its structure rather than its prose. No file access, so Studio's page
 * can use it too. `credits.ts` builds the release checks on it; Studio's SOUNDS rewrites rows with it.
 */

/** Paths a credit names in full; anything else is a shared sound's or a scene folder's own path. */
export const FULL = /^(scenes|web\/public\/sound|world\/splash|world\/districts|world\/lore|world\/quests\/voice|world\/cases\/voice)\//;

/** A Source cell naming any of these can't go public (spec 2026-10-28 open-source release §2). */
export const RESTRICTED_SOURCE = /GDC|Sonniss|Bleeoop|JDSherbert/i;

/** Whether a row with this Source may go public: Suno music, or a CC0 Glitch Noises or generated ElevenLabs source with nothing restricted in it. */
export const isFreeSource = (source: string, suno: boolean) => suno || (/Glitch Noises|ElevenLabs/.test(source) && !RESTRICTED_SOURCE.test(source));

/** Whether a Studio pick with this origin may go public: only a generated ElevenLabs take (any other pick is from a Sonniss bundle). */
export const isFreePick = (origin: string) => /ElevenLabs/.test(origin) && !RESTRICTED_SOURCE.test(origin);

const backticked = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

/** A table row: its cells as written, and the full paths it credits. */
export interface TableRow {
  kind: 'table';
  /** Its line in the text (0-based). */
  line: number;
  cells: string[];
  /** The files named in its first cell, as written. */
  names: string[];
  /** `<pack>/<scene>` pairs in Used by (a scene-folder row credits its file in each). */
  rooms: string[];
  files: string[];
  /** Inside the `web/public/sound/` section (a bare path there is a shared sound). */
  shared: boolean;
  /** Inside the Suno music section. */
  suno: boolean;
  free: boolean;
}

/** A list item: a Studio pick (`- <scene>: <path> ← <origin>`) and/or backticked full paths. */
export interface ListRow {
  kind: 'list';
  line: number;
  files: string[];
  pick: { scene: string; rel: string; origin: string; free: boolean } | null;
}

export type CreditRow = TableRow | ListRow;

/**
 * Every row that credits something:
 * - a table row's first cell names files (backticked): a full path (`scenes/…`, `web/public/sound/…`,
 *   `world/splash/…`); a path under web/public/sound inside the section headed with it; or a path in a
 *   scene folder, credited for each `<pack>/<scene>` in the row's second cell (Used by);
 * - a list item `- <scene>: <path> ←` (Studio's picks) credits that path in that scene, in any pack;
 *   a list item with a backticked full path credits that path.
 * Nothing in the `## Patrons` section credits anything: those lines are names.
 */
export function creditRows(text: string): CreditRow[] {
  const rows: CreditRow[] = [];
  let shared = false;
  let patrons = false;
  let suno = false;
  text.split('\n').forEach((raw, line) => {
    const t = raw.trim();
    if (t.startsWith('#')) {
      if (/^##\s/.test(t)) {
        patrons = /^##\s+Patrons\b/i.test(t);
        suno = /^##\s+Music: Suno\b/i.test(t);
      }
      shared = t.includes('web/public/sound/');
      return;
    }
    if (patrons) return;
    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1);
      if (cells.length < 2 || /^[\s:-]+$/.test(cells[0])) return;
      const rooms = cells[1].match(/[\w-]+\/[\w-]+/g) ?? [];
      const names = backticked(cells[0]);
      const files: string[] = [];
      for (const f of names) {
        if (FULL.test(f)) files.push(f);
        else if (shared) files.push(`web/public/sound/${f}`);
        else for (const room of rooms) files.push(`scenes/${room}/${f}`);
      }
      rows.push({ kind: 'table', line, cells, names, rooms, files, shared, suno, free: isFreeSource(cells[2] ?? '', suno) });
      return;
    }
    if (t.startsWith('- ')) {
      const m = /^- ([\w-]+): (\S.*?) ←(.*)$/.exec(t);
      // A generated ElevenLabs take picked in Studio may go public; any other pick (a Sonniss bundle's) may not.
      const pick = m ? { scene: m[1], rel: m[2], origin: m[3].trim(), free: isFreePick(m[3]) } : null;
      rows.push({ kind: 'list', line, files: backticked(t).filter((f) => FULL.test(f)), pick });
    }
  });
  return rows;
}
