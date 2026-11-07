import type { PlaythroughInfo } from './types';

/** BRANCH HERE and B's name to start from (load in place spec §3): `<game> — branch N`, N one more than its branches so far. */
export function branchName(game: Pick<PlaythroughInfo, 'id' | 'name'>, all: Pick<PlaythroughInfo, 'forkedFrom'>[]): string {
  const n = all.filter((p) => p.forkedFrom?.playthrough === game.id).length + 1;
  return `${game.name} — branch ${n}`;
}
