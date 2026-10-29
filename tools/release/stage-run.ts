/** Staging from release.json, shared by `npm run release` and `npm run stage` (which ships in the public repo). */
import fs from 'node:fs';
import path from 'node:path';
import { releaseListSchema, resolveRelease } from './release-list';
import { stageContent } from './stage';

export class ReleaseError extends Error {}

/** Stages content from release.json; a list that doesn't resolve stops the build. */
export function stage(work: string): string {
  const list = releaseListSchema.parse(JSON.parse(fs.readFileSync(path.join(work, 'release.json'), 'utf8')));
  const resolved = resolveRelease(work, list);
  for (const n of resolved.notes) console.log(`release.json: ${n}`);
  if (resolved.errors.length > 0) throw new ReleaseError(`release.json doesn't resolve:\n${resolved.errors.map((e) => `- ${e}`).join('\n')}`);
  const dir = path.join(work, 'build', 'stage', 'content');
  stageContent(work, resolved, list.defaultPlayer, dir, list.bugRelay ?? null);
  return dir;
}
