/** Encounter cards' route (spec 2026-10-09 encounter cards §2): three events for this moment in her room. */
import type { Encounter } from '../../../shared/encounter';
import { narratorKind } from '../../../shared/narrator';
import { ENCOUNTER_COPY, EncounterNotice } from '../room/encounter-panel';
import { her } from '../room/her-copy';
import { NarratorFailure } from './scenario';

/** Refusals said as they are, by the route's `error` (in her pronoun, read when one comes back). */
const notices = (): Record<string, string> => ({
  'no-link': ENCOUNTER_COPY.noKey,
  'key-rejected': her().encounters.keyRejected,
  'no-credit': her().encounters.noCredit,
  busy: her().waitToFinish,
});

/** Three events her model deals for `ai`'s room. Rejects with an EncounterNotice (a refusal), a NarratorFailure (spec 2026-10-14 §3) or an Error. */
export async function encounterOptions(ai: string): Promise<Encounter[]> {
  const res = await fetch('/api/encounter/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ai }),
  });
  const b = (await res.json().catch(() => ({}))) as { options?: Encounter[]; error?: unknown; kind?: unknown; why?: unknown };
  if (res.ok && Array.isArray(b.options)) return b.options;
  const error = typeof b.error === 'string' ? b.error : `HTTP ${res.status}`;
  const said = notices();
  if (Object.hasOwn(said, error)) throw new EncounterNotice(said[error]!);
  if (error === 'failed') throw new NarratorFailure(narratorKind(b.kind), typeof b.why === 'string' ? b.why : '');
  throw new Error(error);
}
