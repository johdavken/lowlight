/** The playthrough and save routes (spec §4): the title screen's Continue, New Game, Load and the save list. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parsePersona } from '../../shared/persona';
import type { Playthroughs } from './playthroughs';
import type { World } from './world';

const NAME_MAX = 80;

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>)[key] : undefined;

/** The trimmed name, or null when it's missing, blank or too long. */
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim();
  return name === '' || name.length > NAME_MAX ? null : name;
}

/** Runs `fn`, answering 404 for an unknown or malformed id (Playthroughs throws 'bad-id' for the latter). */
function notFoundOn<T>(reply: FastifyReply, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    if ((e as Error).message === 'bad-id' || /^(no (playthrough|save)|save '.*' has no playthrough\.json)/.test((e as Error).message)) {
      void reply.code(404).send({ error: 'not-found' });
      return undefined;
    }
    throw e;
  }
}

export function registerPlaythroughRoutes(app: FastifyInstance, world: World, pts: Playthroughs, originAllowed: (origin: string | undefined) => boolean): void {
  // A change from another site's page (a cross-origin "simple" request) is refused, as the socket is;
  // a request without an Origin (curl, tests) passes.
  const sameOrigin = {
    onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
      if (!originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };
  const busy = (reply: FastifyReply, contact: string) => reply.code(409).send({ error: 'busy', contact });
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'not-found' });

  // Each with its known-contact count (the load screen's "3 contacts"), worked out from its databases,
  // and whether its player has a sprite (the load screen asks for a portrait only then).
  app.get('/api/playthroughs', async () => ({
    active: pts.active()?.id ?? null,
    playthroughs: pts.list().map((pt) => ({ ...pt, contacts: world.contactCount(pt), sprite: world.hasSprite(pt.player) })),
  }));

  app.post('/api/playthroughs', sameOrigin, async (req, reply) => {
    const player = field(req.body, 'player');
    const startContact = field(req.body, 'startContact');
    if (typeof player !== 'string' || player === '' || typeof startContact !== 'string' || !world.inRoster(startContact)) {
      return reply.code(400).send({ error: 'bad-request' });
    }
    const rawName = field(req.body, 'name');
    const name = rawName === undefined ? undefined : cleanName(rawName);
    if (name === null) return reply.code(400).send({ error: 'bad-name' });
    const rawPersona = field(req.body, 'persona');
    const persona = rawPersona === undefined ? undefined : parsePersona(rawPersona);
    if (persona === null) return reply.code(400).send({ error: 'bad-persona' });
    // The opening scene comes with the greeting now (arrival screen spec §3): a client still sending one is out of date.
    if (field(req.body, 'scene') !== undefined) return reply.code(400).send({ error: 'bad-request' });
    const made = world.create(player, startContact, name, persona);
    return 'busy' in made ? busy(reply, made.busy) : made;
  });

  app.post<{ Params: { id: string } }>('/api/playthroughs/:id/activate', sameOrigin, async (req, reply) => {
    const info = notFoundOn(reply, () => pts.get(req.params.id));
    if (info === undefined) return reply;
    if (!info) return notFound(reply);
    const r = world.activate(info.id);
    return 'busy' in r ? busy(reply, r.busy) : r;
  });

  app.patch<{ Params: { id: string } }>('/api/playthroughs/:id', sameOrigin, async (req, reply) => {
    const name = cleanName(field(req.body, 'name'));
    if (name === null) return reply.code(400).send({ error: 'bad-name' });
    if (!pts.get(req.params.id)) return notFound(reply);
    pts.rename(req.params.id, name);
    return pts.get(req.params.id);
  });

  app.delete<{ Params: { id: string } }>('/api/playthroughs/:id', sameOrigin, async (req, reply) => {
    if (!pts.get(req.params.id)) return notFound(reply);
    if (pts.active()?.id === req.params.id) return reply.code(409).send({ error: 'active' });
    pts.remove(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/playthroughs/:id/saves', async (req, reply) => {
    if (!pts.get(req.params.id)) return notFound(reply);
    return pts.saves(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/playthroughs/:id/saves', sameOrigin, async (req, reply) => {
    const name = cleanName(field(req.body, 'name'));
    if (name === null) return reply.code(400).send({ error: 'bad-name' });
    // The room the SAVE came from (optional): a known contact's room is where the save is.
    const contactId = field(req.body, 'contactId');
    if (contactId !== undefined && typeof contactId !== 'string') return reply.code(400).send({ error: 'bad-request' });
    if (!pts.get(req.params.id)) return notFound(reply);
    // Only the active playthrough has live databases to save.
    if (pts.active()?.id !== req.params.id) return reply.code(409).send({ error: 'not-active' });
    const saved = world.save(name, contactId);
    return 'busy' in saved ? busy(reply, saved.busy) : saved;
  });

  app.post<{ Params: { saveId: string } }>('/api/saves/:saveId/load', sameOrigin, async (req, reply) => {
    // Refused up front too, so a busy world never forks a copy it would only throw away.
    const streaming = world.busy();
    if (streaming) return busy(reply, streaming);
    const fork = notFoundOn(reply, () => pts.fork(req.params.saveId));
    if (!fork) return reply;
    const r = world.activate(fork.id);
    if ('busy' in r) {
      pts.remove(fork.id);
      return busy(reply, r.busy);
    }
    return r;
  });

  // BRANCH HERE: the story from a line on, as a new playthrough (activated); the one it came from stays.
  app.post('/api/branch', sameOrigin, async (req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    const contactId = field(req.body, 'contactId');
    const messageId = field(req.body, 'messageId');
    if (typeof contactId !== 'string' || typeof messageId !== 'string') return reply.code(404).send({ error: 'no such line' });
    const r = world.branch(contactId, messageId);
    if (r === 'unknown') return reply.code(404).send({ error: 'no such line' });
    return 'busy' in r ? busy(reply, r.busy) : r;
  });

  app.delete<{ Params: { saveId: string } }>('/api/saves/:saveId', sameOrigin, async (req, reply) => {
    // An unknown but well-formed id is already gone.
    try {
      pts.removeSave(req.params.saveId);
    } catch (e) {
      if ((e as Error).message === 'bad-id') return notFound(reply);
      throw e;
    }
    return reply.code(204).send();
  });

  app.get('/api/playthroughs/active/contacts', async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    return world.contacts();
  });

  app.get('/api/playthroughs/active/around', async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    return world.around();
  });

  app.get('/api/playthroughs/active/leads', async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    return world.leads();
  });

  app.get('/api/playthroughs/active/loose-ends', async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    return world.looseEnds();
  });

  app.get('/api/playthroughs/active/clock', async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    return { clock: world.clock() };
  });

  app.post('/api/playthroughs/active/wait', sameOrigin, async (req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    const r = world.wait({ minutes: field(req.body, 'minutes'), until: field(req.body, 'until') });
    if (r === 'bad') return reply.code(400).send({ error: 'bad-request' });
    return 'busy' in r ? busy(reply, r.busy) : r;
  });

  app.post('/api/playthroughs/active/solo', sameOrigin, async (_req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    const r = world.goSolo();
    return 'busy' in r ? busy(reply, r.busy) : r;
  });

  app.post('/api/playthroughs/active/location', sameOrigin, async (req, reply) => {
    if (!world.active()) return reply.code(409).send({ error: 'no-playthrough' });
    const contactId = field(req.body, 'contactId');
    if (typeof contactId !== 'string') return reply.code(400).send({ error: 'bad-request' });
    const where = world.setLocation(contactId);
    return where === 'unknown' ? reply.code(403).send({ error: 'unknown-contact' }) : where;
  });
}
