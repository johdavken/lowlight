/** POST /api/suggest: the player character's next line, drafted by her model for the chat box (never sent). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NarratorKind } from '../../shared/narrator';
import type { CompletionMessage } from './turn';
import { NarratorError } from './scenario';
import type { ScenarioDeps } from './scenario-routes';
import { cleanSuggestion } from './suggest';

export interface SuggestDeps extends Pick<ScenarioDeps, 'originAllowed' | 'busy' | 'target'> {
  /** The draft's request for `ai`'s room as it stands, with the player's name and everyone else's; null when there's no such room. */
  promptFor(
    ai: string,
    steer: string | null,
    /** On the arrival screen: the move about to be made (spec 2026-10-27 §4). */
    travel?: SuggestTravel,
  ): { messages: CompletionMessage[]; player: string; others: string[] } | null | Promise<{ messages: CompletionMessage[]; player: string; others: string[] } | null>;
}

export type SuggestTravel = { from: string | null; to: string; comms: boolean; back: boolean };

/** The body's `travel`: absent is undefined, a bad one null. */
function parseTravel(raw: unknown): SuggestTravel | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.to !== 'string' || !t.to.trim()) return null;
  if (t.from !== undefined && t.from !== null && typeof t.from !== 'string') return null;
  if (t.comms !== undefined && typeof t.comms !== 'boolean') return null;
  if (t.back !== undefined && typeof t.back !== 'boolean') return null;
  return { from: typeof t.from === 'string' && t.from.trim() ? t.from : null, to: t.to, comms: t.comms === true, back: t.back === true };
}

const field = (body: unknown, k: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[k] : undefined);

export function registerSuggestRoutes(app: FastifyInstance, deps: SuggestDeps): void {
  const sameOrigin = {
    onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!deps.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };

  app.post('/api/suggest', sameOrigin, async (req, reply) => {
    const ai = field(req.body, 'ai');
    const rawSteer = field(req.body, 'steer');
    if (typeof ai !== 'string' || !ai || (rawSteer !== undefined && rawSteer !== null && typeof rawSteer !== 'string')) return reply.code(400).send({ error: 'bad-request' });
    const steer = typeof rawSteer === 'string' && rawSteer.trim() !== '' ? rawSteer.trim() : null;
    const travel = parseTravel(field(req.body, 'travel'));
    if (travel === null) return reply.code(400).send({ error: 'bad-request' });
    const target = deps.target(ai);
    if (!target) return reply.code(400).send({ error: 'bad-request' });
    if (!target.ready()) return reply.code(409).send({ error: 'no-link' });
    const busy = deps.busy();
    if (busy) return reply.code(409).send({ error: 'busy', contact: busy });
    const prompt = await (travel ? deps.promptFor(ai, steer, travel) : deps.promptFor(ai, steer));
    if (!prompt) return reply.code(400).send({ error: 'bad-request' });
    // One retry, as the narrator's routes do; a rejected key or no credit said at once.
    let why = '';
    let kind: NarratorKind = 'bad-answer';
    for (let attempt = 0; attempt < 2; attempt++) {
      why = 'the answer was empty';
      kind = 'bad-answer';
      try {
        const text = cleanSuggestion(await target.narrate(prompt.messages), prompt.player, prompt.others);
        if (text) return { text };
      } catch (err) {
        const status = (err as { status?: unknown }).status;
        if (status === 401 || status === 403) return reply.code(409).send({ error: 'key-rejected' });
        if (status === 402) return reply.code(409).send({ error: 'no-credit' });
        why = err instanceof Error ? err.message : String(err);
        kind = err instanceof NarratorError ? err.kind : 'unknown';
      }
    }
    console.warn(`[narrator] suggest failed (${kind}): ${why}`);
    return reply.code(502).send({ error: 'failed', kind, why });
  });
}
