/** POST /api/encounter/options (encounter cards spec §2): three events for this moment in her room, written by her model. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseEncounterOptions, type Encounter } from '../../shared/encounter';
import type { NarratorKind } from '../../shared/narrator';
import type { CompletionMessage } from './turn';
import { NarratorError } from './scenario';
import type { ScenarioDeps } from './scenario-routes';

type Prompt = { messages: CompletionMessage[]; reserved: string[]; dark?: boolean };

export interface EncounterDeps extends Pick<ScenarioDeps, 'originAllowed' | 'busy' | 'target'> {
  /** The narrator's request for `ai`'s room as it stands, and the names a stranger can't take; null when there's no such room. */
  /** `dark`: her room's district has no power (blackouts phase 3 §2), so a power cut card is dropped. */
  promptFor(ai: string): Prompt | null | Promise<Prompt | null>;
}

const field = (body: unknown, k: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[k] : undefined);

export function registerEncounterRoutes(app: FastifyInstance, deps: EncounterDeps): void {
  const sameOrigin = {
    onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!deps.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };

  app.post('/api/encounter/options', sameOrigin, async (req, reply) => {
    const ai = field(req.body, 'ai');
    if (typeof ai !== 'string' || !ai) return reply.code(400).send({ error: 'bad-request' });
    const target = deps.target(ai);
    if (!target) return reply.code(400).send({ error: 'bad-request' });
    if (!target.ready()) return reply.code(409).send({ error: 'no-link' });
    const busy = deps.busy();
    if (busy) return reply.code(409).send({ error: 'busy', contact: busy });
    const prompt = await deps.promptFor(ai);
    if (!prompt) return reply.code(400).send({ error: 'bad-request' });
    // One retry, as scenario cards do: never a half-valid set; a rejected key or no credit said at once.
    let why = '';
    let kind: NarratorKind = 'bad-answer';
    for (let attempt = 0; attempt < 2; attempt++) {
      why = 'the answer was not three events';
      kind = 'bad-answer';
      try {
        const options: Encounter[] | null = parseEncounterOptions(await target.narrate(prompt.messages), prompt.reserved, { dark: prompt.dark === true });
        if (options) return { options };
      } catch (err) {
        const status = (err as { status?: unknown }).status;
        if (status === 401 || status === 403) return reply.code(409).send({ error: 'key-rejected' });
        if (status === 402) return reply.code(409).send({ error: 'no-credit' });
        why = err instanceof Error ? err.message : String(err);
        kind = err instanceof NarratorError ? err.kind : 'unknown';
      }
    }
    // The player is told the kind in plain words; the raw reason is for the log and the dev panel (spec 2026-10-14 §3).
    console.warn(`[narrator] encounter failed (${kind}): ${why}`);
    return reply.code(502).send({ error: 'failed', kind, why });
  });
}
