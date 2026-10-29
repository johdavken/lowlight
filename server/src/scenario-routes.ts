/** POST /api/scenario/draft (arrival screen spec §3): one opening for a new game's first scene, written by her model and steered by what's typed. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseSceneDraft } from '../../shared/scenario';
import type { NarratorKind } from '../../shared/narrator';
import type { CompletionMessage } from './turn';
import { NarratorError } from './scenario';

export interface ScenarioDeps {
  originAllowed(origin: string | undefined): boolean;
  /** The contact whose reply is streaming, if any. */
  busy(): string | null;
  /** Who writes for `ai`: her model, or nobody (unknown, or a character with no mind). */
  target(ai: string): { kind: 'direct'; ready(): boolean; narrate(messages: CompletionMessage[]): Promise<string> } | null;
  /** The narrator's request for the playthrough's player and `ai`'s room, with the steer; null when either is unknown. */
  promptFor(ai: string, steer: string | null): Promise<CompletionMessage[] | null>;
}

const field = (body: unknown, k: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[k] : undefined);

export function registerScenarioRoutes(app: FastifyInstance, deps: ScenarioDeps): void {
  const sameOrigin = {
    onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!deps.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };

  app.post('/api/scenario/draft', sameOrigin, async (req, reply) => {
    const ai = field(req.body, 'ai');
    const rawSteer = field(req.body, 'steer');
    if (typeof ai !== 'string' || !ai || (rawSteer !== undefined && rawSteer !== null && typeof rawSteer !== 'string')) return reply.code(400).send({ error: 'bad-request' });
    const steer = typeof rawSteer === 'string' && rawSteer.trim() !== '' ? rawSteer.trim() : null;
    const target = deps.target(ai);
    if (!target) return reply.code(400).send({ error: 'bad-request' });
    if (!target.ready()) return reply.code(409).send({ error: 'no-link' });
    const busy = deps.busy();
    if (busy) return reply.code(409).send({ error: 'busy', contact: busy });
    const messages = await deps.promptFor(ai, steer);
    if (!messages) return reply.code(400).send({ error: 'bad-request' });
    // One retry: a bad answer (or a failed call) gets a second try; never a half-valid set. The
    // reason given is the last try's. A rejected key or no credit won't mend on a retry: said at once.
    let why = '';
    let kind: NarratorKind = 'bad-answer';
    for (let attempt = 0; attempt < 2; attempt++) {
      why = 'the answer was not one opening';
      kind = 'bad-answer';
      try {
        const draft = parseSceneDraft(await target.narrate(messages));
        if (draft) return { text: draft.text };
      } catch (err) {
        const status = (err as { status?: unknown }).status;
        if (status === 401 || status === 403) return reply.code(409).send({ error: 'key-rejected' });
        if (status === 402) return reply.code(409).send({ error: 'no-credit' });
        why = err instanceof Error ? err.message : String(err);
        kind = err instanceof NarratorError ? err.kind : 'unknown';
      }
    }
    // The player is told the kind in plain words; the raw reason is for the log and the dev panel (spec 2026-10-14 §3).
    console.warn(`[narrator] scene failed (${kind}): ${why}`);
    return reply.code(502).send({ error: 'failed', kind, why });
  });
}
