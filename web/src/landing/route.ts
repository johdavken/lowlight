/** Where a playthrough is played from: the solo screen while solo (go solo), else its contact's room. */
import type { PlaythroughInfo } from '../../../shared/types';

export function playPath(pt: Pick<PlaythroughInfo, 'solo' | 'location' | 'startContact'>): string {
  if (pt.solo) return '/solo';
  return `/room/${encodeURIComponent(pt.location?.contactId ?? pt.startContact)}`;
}
