/** The shipped jobs' narration images (spec 2026-11-18) against the shipped portraits and cast: every face real, every image used. */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuestFile } from '../../shared/quests';
import { extrasKnown } from '../../shared/extras';
import { loadExtras } from '../src/extras';
import { loadCast } from '../src/cast';

const extras = loadExtras('world/extras', () => {});
const roster = new Set(fs.readdirSync('characters'));
const cast = loadCast('world/cast.json', { extras: new Set(extras.map((e) => e.id)), roster, warn: () => {} });
const known = { roster, places: null, extras: extrasKnown(extras), cast };

describe("Kroll's jobs and Run Sheet carry faces", () => {
  for (const id of ['come-up', 'countersign', 'clearance', 'second-desk', 'the-round', 'run-sheet']) {
    it(`${id}: its images parse, and each is marked`, () => {
      const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), known);
      expect(r.ok ? [] : r.problems.filter((p) => p.field.startsWith('image') || p.message.includes('{img'))).toEqual([]);
      expect(r.ok && r.entry.images?.length).toBeGreaterThan(0);
      expect(r.ok ? r.warnings.filter((w) => w.includes('image')) : []).toEqual([]);
      // A scene picture is a file the quest art route serves.
      for (const i of r.ok ? (r.entry.images ?? []) : []) if (i.source.kind === 'scene') expect(fs.existsSync(`world/quests/art/${i.source.file}`), i.source.file).toBe(true);
    });
  }
});
