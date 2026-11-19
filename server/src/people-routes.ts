/**
 * The people library's routes (character creator spec 2026-11-14): the 1P creator makes a draft, pays for
 * takes on the player's own OpenRouter key, fits one and keeps it with WHO. One take at a time per person,
 * so a redraw or a second press never pays twice.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { PNG } from 'pngjs';
import { DEFAULT_FIGURE_MODEL, FIGURE_FIELDS, figurePrompt, type FigureFields } from '../../shared/figure-prompt';
import { parsePersonWho } from '../../shared/person';
import { cleanTake } from './figure-clean';
import { createNormalCache, type NormalCache } from './normal-cache';
import { createPeople, PeopleError, type People } from './people';
import { readFigure, TAKES_DIR } from './persona-figure';
import { readSettingsKey } from './settings';
import { readCastPalette } from './snap';
import { renderThumb } from './thumb';

/** Every take starts from the stand-in's silhouette (pose and framing) in the newest cast sprite's style. */
export const STAND_IN = 'newcomer';
export const STAND_IN_SPRITE = 'newcomer-outfit-plain.png';
export const STYLE_ANCHOR = path.join('ember', 'ember-outfit-indoors.png');
const GENERATE_TIMEOUT_MS = 180_000;
const DEFAULT_FACE = { x: 0.5, y: 0.1 };

export interface PeopleRouteOptions {
  /** `<dataDir>/people`. */
  dir: string;
  /** Where settings.json (the OpenRouter key) lives. */
  dataDir: string;
  /** Figure normal maps (the app's own cache); absent: one under `<dataDir>/cache/normals`. */
  normals?: NormalCache;
  charactersDir: string;
  /** shared/cast-palette.json. */
  paletteFile: string;
  openrouterBaseUrl: string;
  originAllowed: (origin: string | undefined) => boolean;
}

export function registerPeopleRoutes(app: FastifyInstance, o: PeopleRouteOptions): People {
  const people = createPeople(o.dir);
  const normals = o.normals ?? createNormalCache(path.join(o.dataDir, 'cache', 'normals'));
  /** People with a take on its way. */
  const busy = new Set<string>();
  const sameOrigin = {
    preHandler: async (req: { headers: { origin?: string } }, reply: FastifyReply) => {
      if (!o.originAllowed(req.headers.origin)) return reply.code(403).send({ error: 'origin' });
    },
  };
  const fail = (reply: FastifyReply, err: unknown) => {
    if (err instanceof PeopleError) return reply.code(err.status).send({ error: err.code });
    throw err;
  };
  const must = (id: string) => {
    const p = people.get(id);
    if (!p) throw new PeopleError(404, 'no-person', `no person '${id}'`);
    return p;
  };
  const fields = (raw: unknown): FigureFields => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    return Object.fromEntries(FIGURE_FIELDS.map((f) => [f, typeof r[f] === 'string' ? (r[f] as string).slice(0, 600) : ''])) as FigureFields;
  };
  const dataUrl = (file: string) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  const standInFace = (): { x: number; y: number } => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(o.charactersDir, STAND_IN, 'character.json'), 'utf8')) as { face?: { x?: unknown; y?: unknown } };
      return typeof c.face?.x === 'number' && typeof c.face?.y === 'number' ? { x: c.face.x, y: c.face.y } : DEFAULT_FACE;
    } catch {
      return DEFAULT_FACE;
    }
  };
  const png = (reply: FastifyReply, buf: Buffer) => reply.type('image/png').header('Cache-Control', 'no-cache').send(buf);

  app.get('/api/people', async () => ({ people: people.list(), key: readSettingsKey(o.dataDir, 'openrouter') !== null }));

  app.post('/api/people', sameOrigin, async () => ({ id: people.draft().id }));

  app.put<{ Params: { id: string } }>('/api/people/:id', sameOrigin, async (req, reply) => {
    try {
      must(req.params.id);
      const who = parsePersonWho(req.body);
      if (!who) return reply.code(400).send({ error: 'bad-who' });
      return people.save(req.params.id, who);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/people/:id', sameOrigin, async (req, reply) => {
    try {
      must(req.params.id);
      people.remove(req.params.id);
      return {};
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string }; Body: { fields?: unknown } }>('/api/people/:id/generate', sameOrigin, async (req, reply) => {
    const { id } = req.params;
    try {
      const p = must(id);
      const key = readSettingsKey(o.dataDir, 'openrouter');
      if (!key) return reply.code(400).send({ error: 'no-key' });
      if (busy.has(id)) return reply.code(409).send({ error: 'busy' });
      // Everything the take needs, read before anything is paid for: a missing piece costs nothing.
      let palette: ReturnType<typeof readCastPalette>;
      let refs: string[];
      try {
        palette = readCastPalette(o.paletteFile);
      } catch {
        return reply.code(500).send({ error: 'no-palette' });
      }
      try {
        refs = [path.join(o.charactersDir, STYLE_ANCHOR), path.join(o.charactersDir, STAND_IN, STAND_IN_SPRITE)].map(dataUrl);
      } catch {
        return reply.code(500).send({ error: 'no-stand-in' });
      }
      busy.add(id);
      try {
        const body = {
          model: DEFAULT_FIGURE_MODEL,
          prompt: figurePrompt(fields(req.body?.fields), p.pronoun),
          n: 1,
          quality: 'high',
          aspect_ratio: '2:3',
          output_format: 'png',
          background: 'opaque',
          input_references: refs.map((url) => ({ type: 'image_url', image_url: { url } })),
        };
        let res: Response;
        try {
          res = await fetch(`${o.openrouterBaseUrl}/images`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
          });
        } catch (err) {
          return reply.code(502).send({ error: 'generate-failed', message: `Couldn't reach OpenRouter: ${(err as Error).message}` });
        }
        const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
        if (!res.ok || !json?.data?.[0]?.b64_json) return reply.code(502).send({ error: 'generate-failed', message: json?.error?.message ?? `OpenRouter answered ${res.status} with no image` });
        const raw = Buffer.from(json.data[0].b64_json, 'base64');
        let pic: PNG;
        try {
          pic = PNG.sync.read(raw);
        } catch {
          return reply.code(502).send({ error: 'generate-failed', message: 'The image came back in a form the game can\'t read (not a PNG)' });
        }
        const take = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        fs.mkdirSync(path.join(people.dir(id), TAKES_DIR), { recursive: true });
        fs.writeFileSync(people.takeFile(id, take, true), raw);
        fs.writeFileSync(people.takeFile(id, take, false), PNG.sync.write(cleanTake(pic, palette)));
        return { take, cost: typeof json.usage?.cost === 'number' ? json.usage.cost : null };
      } finally {
        busy.delete(id);
      }
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/people/:id/takes', async (req, reply) => {
    try {
      must(req.params.id);
      return { takes: people.takes(req.params.id), busy: busy.has(req.params.id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string; take: string }; Querystring: { raw?: string } }>('/api/people/:id/take/:take', async (req, reply) => {
    try {
      const file = people.takeFile(req.params.id, req.params.take, req.query.raw === '1');
      if (!fs.existsSync(file)) return reply.code(404).send({ error: 'no-take' });
      return png(reply, fs.readFileSync(file));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/people/:id/takes', sameOrigin, async (req, reply) => {
    try {
      must(req.params.id);
      people.dropTakes(req.params.id);
      return {};
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/people/:id/keep', sameOrigin, async (req, reply) => {
    try {
      const b = req.body ?? {};
      const face = b.face as { x: number; y: number };
      return people.keep(req.params.id, typeof b.take === 'string' ? b.take : '', { face, waist: b.waist as number, fields: fields(b.fields) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>('/api/people/:id/figure.png', async (req, reply) => {
    try {
      must(req.params.id);
      const fig = readFigure(people.dir(req.params.id));
      if (!fig) return reply.code(404).send({ error: 'no-figure' });
      // `?normal=1`: its normal map (figure lighting spec §1); made figures are snapped, so per 2 px.
      if ((req.query as { normal?: unknown } | undefined)?.normal !== undefined) {
        const map = await normals.file(fig.file, { px: 2 });
        return map ? png(reply, fs.readFileSync(map)) : reply.code(404).send({ error: 'no-normal-map' });
      }
      return png(reply, fs.readFileSync(fig.file));
    } catch (err) {
      return fail(reply, err);
    }
  });

  // EXPORT FOR SILLYTAVERN (spec 2026-11-14): their figure for a persona picture (it stands on the left of the
  // package's stage), and the persona's description as the package writes one: who, then # Wearing.
  const fileName = (name: string) => name.replace(/[^\p{L}\p{N} .'-]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'person';
  // A header is Latin-1: a plain ASCII fallback, and the whole name in UTF-8 for browsers that read filename*.
  const attach = (reply: FastifyReply, name: string, ext: string) => {
    const ascii = fileName(name.replace(/[^\x20-\x7e]+/g, ' '));
    return reply.header('Content-Disposition', `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(fileName(name))}.${ext}`);
  };
  app.get<{ Params: { id: string } }>('/api/people/:id/export.png', async (req, reply) => {
    try {
      const p = must(req.params.id);
      const fig = readFigure(people.dir(p.id));
      const file = fig?.file ?? path.join(o.charactersDir, STAND_IN, STAND_IN_SPRITE);
      return attach(reply, p.name, 'png').type('image/png').send(fs.readFileSync(file));
    } catch (err) {
      return fail(reply, err);
    }
  });
  app.get<{ Params: { id: string } }>('/api/people/:id/export.txt', async (req, reply) => {
    try {
      const p = must(req.params.id);
      const forms = { she: 'she/her', he: 'he/him', they: 'they/them' }[p.pronoun];
      const parts = [`${p.name} (${forms}).`, p.background, p.figure && p.wears ? `# Wearing\n\n${p.wears}` : ''].filter(Boolean);
      return attach(reply, p.name, 'txt').type('text/plain; charset=utf-8').send(`${parts.join('\n\n')}\n`);
    } catch (err) {
      return fail(reply, err);
    }
  });

  // Their tile at 1P: their figure's head, else the stand-in's.
  app.get<{ Params: { id: string } }>('/api/people/:id/thumb', async (req, reply) => {
    try {
      must(req.params.id);
      const fig = readFigure(people.dir(req.params.id));
      const file = fig?.file ?? path.join(o.charactersDir, STAND_IN, STAND_IN_SPRITE);
      return png(reply, renderThumb(PNG.sync.read(fs.readFileSync(file)), fig?.meta.face ?? standInFace()));
    } catch (err) {
      return fail(reply, err);
    }
  });

  return people;
}
