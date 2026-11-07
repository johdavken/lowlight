/**
 * LOAD's game list in groups (load in place spec §4): ★ KEPT (starred), RECENT (the newest unstarred), and
 * OLDER (the rest, closed until opened). Pure, so the screen and its tests share it.
 */
import type { PlaythroughInfo } from '../../../shared/types';

export type Group = 'kept' | 'recent' | 'older';

/** How many unstarred games RECENT holds. */
export const RECENT_SIZE = 8;

type Game = Pick<PlaythroughInfo, 'id' | 'updatedAt' | 'starred'>;

/** Each group newest first. The active game is never in OLDER: it takes RECENT's last place. */
export function groupGames<T extends Game>(list: readonly T[], activeId: string | null): Record<Group, T[]> {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  const kept = sorted.filter((p) => p.starred);
  const rest = sorted.filter((p) => !p.starred);
  const recent = rest.slice(0, RECENT_SIZE);
  let older = rest.slice(RECENT_SIZE);
  const active = older.find((p) => p.id === activeId);
  if (active) {
    const bumped = recent.pop();
    recent.push(active);
    older = [...(bumped ? [bumped] : []), ...older.filter((p) => p !== active)];
  }
  return { kept, recent, older };
}

export type Stop<T> = { kind: 'pt'; pt: T } | { kind: 'older' };

/** Where ←→ stops: every shown game, and a closed OLDER as one stop (none when OLDER is empty). */
export function stops<T>(groups: Record<Group, T[]>, olderOpen: boolean): Stop<T>[] {
  const games = (l: T[]) => l.map((pt): Stop<T> => ({ kind: 'pt', pt }));
  const older: Stop<T>[] = groups.older.length === 0 ? [] : olderOpen ? games(groups.older) : [{ kind: 'older' }];
  return [...games(groups.kept), ...games(groups.recent), ...older];
}
