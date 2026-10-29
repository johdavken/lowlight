import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { loadCharacter } from '../../server/src/character';

/** release.json: what a preview build ships (spec §3.2). */
export const releaseListSchema = z.object({
  version: z.literal(1),
  packs: z.array(z.string().min(1)),
  characters: z.array(z.string().min(1)),
  defaultPlayer: z.string().min(1),
  /** Where in-game bug reports go (the relay Worker, tools/bug-relay); without it a build only saves them. */
  bugRelay: z.url().startsWith('https://').nullable().optional(),
  /** Quests (world/quests/<id>.md) left out of the build: written, but not ready to ship (big jobs in preview.5). */
  holdQuests: z.array(z.string().min(1)).optional(),
});
export type ReleaseList = z.infer<typeof releaseListSchema>;

export interface ResolvedRelease {
  packs: string[];
  /** The listed characters in order, then each `extends` base not already listed. */
  characters: string[];
  /** The quests left out of the build (each one there in world/quests). */
  holdQuests: string[];
  notes: string[];
  errors: string[];
}

/** Resolves `list` against the content tree at `root`: follows `extends`, and checks every room lands in a shipped pack. */
export function resolveRelease(root: string, list: ReleaseList): ResolvedRelease {
  const notes: string[] = [];
  const errors: string[] = [];
  const isDir = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();
  const packs = list.packs.filter((p) => {
    if (isDir(path.join(root, 'scenes', p))) return true;
    errors.push(`unknown pack ${p}`);
    return false;
  });

  const characters: string[] = [];
  const queue = list.characters.map((id) => ({ id, baseOf: null as string | null }));
  while (queue.length > 0) {
    const { id, baseOf } = queue.shift()!;
    if (characters.includes(id)) continue;
    const dir = path.join(root, 'characters', id);
    const char = isDir(dir) ? loadCharacter(dir) : null;
    if (!char) {
      errors.push(baseOf ? `${baseOf}: extends unknown character ${id}` : `unknown character ${id}`);
      continue;
    }
    characters.push(id);
    if (baseOf) notes.push(`copied ${id} as the base of ${baseOf}`);
    const rooms = char.rooms ?? [];
    for (const room of rooms) {
      if (!packs.includes(room.split('/')[0])) errors.push(`${id}: room ${room} is not in a shipped pack`);
    }
    if (rooms.length === 0 && char.scenePack && !packs.includes(char.scenePack)) errors.push(`${id}: pack ${char.scenePack} is not shipped`);
    if (char.extends) queue.push({ id: char.extends, baseOf: id });
  }

  if (!characters.includes(list.defaultPlayer)) errors.push(`defaultPlayer ${list.defaultPlayer} is not a shipped character`);
  // A held quest that isn't there is a typo: the build would ship what it meant to hold back.
  const holdQuests = (list.holdQuests ?? []).filter((id) => {
    if (fs.existsSync(path.join(root, 'world', 'quests', `${id}.md`))) return true;
    errors.push(`holdQuests: unknown quest ${id}`);
    return false;
  });
  return { packs, characters, holdQuests, notes, errors };
}
