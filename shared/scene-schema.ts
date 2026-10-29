/** The scene.json schema, pure zod (no file IO), so the browser can validate drafts too. */
import { z } from 'zod';
import { normalizeHex } from './color';
import { FLAT_FRAME, isFlat } from './frame';
import { MAX_SONGS, toSceneMusic } from './music';
import { MAX_POINTS, MAX_SHAPES, MIN_POINTS, MIN_SHAPE_AREA, rectToShape, selfCrosses, shapeArea } from './weather-area';

const hexSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeHex(value);
  if (normalized === null) {
    ctx.addIssue({ code: 'custom', message: `invalid hex color '${value}'` });
    return z.NEVER;
  }
  return normalized;
});

const weatherSchema = z.enum(['none', 'rain', 'snow', 'ash', 'dust']);
const timeOfDaySchema = z.enum(['dusk', 'night', 'late-night', 'dawn']);
const unit = () => z.number().min(0).max(1);

const layerSchema = z.object({
  id: z.string(),
  src: z.string(),
  parallax: unit(),
  emissive: z.string().optional(),
  /** Per-light glow maps (light id → PNG): drawn scaled by that light's current intensity. */
  emissiveLights: z.record(z.string(), z.string()).optional(),
});

/** Most dust a light can hold: 300% of the default motes. */
export const MAX_DUST = 3;

const lightSchema = z.object({
  id: z.string(),
  label: z.string(),
  pos: z.tuple([z.number(), z.number()]),
  color: hexSchema,
  intensity: unit(),
  radius: z.number().nonnegative(),
  flicker: unit(),
  sound: z.literal('neon').optional(),
  dust: z.union([z.boolean(), z.number().min(0).max(MAX_DUST)]).optional(),
  outside: z.boolean().optional(),
});

const fxRect = () => z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);

/** Rain on the glass: the most beads, as a multiple of the default. */
export const MAX_GLASS = 3;
/** A plume's most puffs, as a multiple of the default. */
export const MAX_PLUME = 3;

/** At most this many effects in a room. */
export const MAX_EFFECTS = 16;

const effectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('screen'), rect: fxRect(), light: z.string(), scroll: z.number().nonnegative().optional(), picture: z.enum(['art', 'static']).optional(), grain: unit().optional(), roll: z.boolean().optional() }),
  z.object({ kind: z.literal('leds'), rect: fxRect(), rate: z.number().min(0.25).max(4).optional() }),
  z.object({ kind: z.literal('lightning'), strength: unit().optional() }).strict(),
  z.object({ kind: z.literal('glass'), amount: z.number().min(0).max(MAX_GLASS).optional() }).strict(),
  z.object({ kind: z.literal('passing'), rect: fxRect(), source: z.enum(['car', 'police', 'drone']).optional(), every: z.number().min(5).max(300).optional(), strength: unit().optional() }).strict(),
  z.object({ kind: z.literal('plume'), rect: fxRect(), style: z.enum(['steam', 'smoke']).optional(), amount: z.number().min(0).max(MAX_PLUME).optional(), lean: z.number().min(-1).max(1).optional() }).strict(),
]);

export const ROOM_SOUND_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_ROOM_SOUND_NAME = 32;
export const MAX_ROOM_SOUND_ABOUT = 120;

/** A room sound's shape only (any values): what a Studio draft holds while it's being edited. */
export const roomSoundsShape = z.array(
  z.looseObject({
    name: z.string(),
    src: z.string(),
    level: z.number().optional(),
    agent: z.looseObject({ about: z.string() }).optional(),
    timer: z.looseObject({ min: z.number(), max: z.number() }).optional(),
    onEntry: z.boolean().optional(),
  }),
);

/** A room's one-off sounds, every rule (the game's scene loader and Studio's validateDraft both use this). */
export const roomSoundsSchema = z
  .array(
    z
      .object({
        name: z.string().max(MAX_ROOM_SOUND_NAME, `a name is at most ${MAX_ROOM_SOUND_NAME} characters`).regex(ROOM_SOUND_NAME, 'a name is lowercase letters, digits and single dashes'),
        src: z.string().min(1),
        level: unit().optional(),
        agent: z.object({ about: z.string().min(1, 'the agent needs a line about it').max(MAX_ROOM_SOUND_ABOUT, `at most ${MAX_ROOM_SOUND_ABOUT} characters`) }).strict().optional(),
        timer: z
          .object({ min: z.number().min(0.5, 'at least half a minute'), max: z.number().max(60, 'at most 60 minutes') })
          .strict()
          .refine((t) => t.min <= t.max, { message: 'the first number is more than the second' })
          .optional(),
        onEntry: z.boolean().optional(),
      })
      .strict(),
  )
  .superRefine((sounds, ctx) => {
    const seen = new Set<string>();
    sounds.forEach((s, i) => {
      if (seen.has(s.name)) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: `another sound is already called '${s.name}'` });
      seen.add(s.name);
    });
  });

const soundSchema = z.object({
  indoor: z.boolean().optional(),
  bed: z.object({ src: z.string(), level: unit().optional() }).optional(),
  hum: unit().optional(),
  // A list of songs; the old single `{ src }` loads as a one-song list.
  music: z
    .union([
      z.object({ songs: z.array(z.string()).min(1).max(MAX_SONGS), level: unit().optional() }).strict(),
      z.object({ src: z.string(), level: unit().optional() }).strict(),
    ])
    .transform(toSceneMusic)
    .refine((m) => new Set(m.songs).size === m.songs.length, { message: 'a song is listed twice' })
    .optional(),
  sounds: roomSoundsSchema.optional(),
});

const atmosphereSchema = z.object({
  ambient: hexSchema,
  ambientLevel: unit(),
  weather: weatherSchema,
  weatherLevel: unit(),
  fog: unit(),
  timeOfDay: timeOfDaySchema,
});

const presetSchema = z.object({
  ambient: hexSchema.optional(),
  ambientLevel: unit().optional(),
  weather: weatherSchema.optional(),
  weatherLevel: unit().optional(),
  fog: unit().optional(),
  timeOfDay: timeOfDaySchema.optional(),
  lights: z
    .record(
      z.string(),
      z.object({
        color: hexSchema.optional(),
        intensity: unit().optional(),
        flicker: unit().optional(),
      }),
    )
    .optional(),
});

const regionInt = () => z.number().int().nonnegative();

/** A room's exits (room exits spec §2): rooms reached from it without the map. */
export const MAX_EXITS = 4;
export const MAX_EXIT_WAY = 60;
const exitSchema = z
  .object({
    to: z.string().min(1),
    way: z.string().min(1).max(MAX_EXIT_WAY).refine((s) => !s.includes('\n'), 'one line'),
    // Checked loosely: a bad box is dropped at load (doorFits), never a broken scene.
    door: z.custom<[number, number, number, number]>((v) => Array.isArray(v) && v.every((n) => typeof n === 'number'), 'a list of numbers').optional(),
  })
  .strict();

/** A time of day, HH:MM (00:00–23:59). */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');

export const sceneSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    resolution: z.tuple([z.number().positive(), z.number().positive()]).default([480, 270]),
    layers: z.array(layerSchema),
    lights: z
      .array(lightSchema)
      .max(8)
      .refine((lights) => new Set(lights.map((l) => l.id)).size === lights.length, {
        message: 'duplicate light ids',
      }),
    defaults: atmosphereSchema,
    presets: z.record(z.string(), presetSchema).default({}),
    /** Where weather is visible, `[x, y, w, h]` in render-texture px. Absent = the whole frame. */
    weatherRegion: z
      .tuple([regionInt(), regionInt(), regionInt().positive(), regionInt().positive()])
      .optional(),
    /** Where weather is visible: shapes in frame px. Absent = the whole frame. */
    weatherArea: z
      .array(z.array(z.tuple([z.number(), z.number()])).min(MIN_POINTS).max(MAX_POINTS))
      .min(1)
      .max(MAX_SHAPES)
      .optional(),
    sound: soundSchema.optional(),
    weatherHidden: z.boolean().optional(),
    effects: z.array(effectSchema).max(MAX_EFFECTS).optional(),
    /** The place's resident (a fixed character, e.g. Hae): who she is and how big she stands, centre stage. */
    resident: z.object({ character: z.string().min(1), scale: z.number().min(0.3).max(1).default(0.78) }).strict().optional(),
    /** Everyone's place (e.g. Hae's stall): any contact can take you there, not only the one whose rooms list it. */
    public: z.boolean().optional(),
    /** Rooms you reach from this one (a full room id and how you get there); a broken one is dropped at load. */
    exits: z
      .array(exitSchema)
      .max(MAX_EXITS)
      .refine((exits) => new Set(exits.map((e) => e.to)).size === exits.length, { message: 'duplicate exit' })
      .optional(),
    /** A venue's hours (story moods spec §5): last call, closing and closed follow them. */
    // A bad value is dropped, not the room (the loader says so): a typo mustn't strand a contact's start room.
    hours: z.object({ open: hhmm, close: hhmm }).strict().optional().catch(undefined),
  })
  .refine(
    (s) => {
      if (!s.weatherRegion) return true;
      const [x, y, w, h] = s.weatherRegion;
      return x + w <= s.resolution[0] && y + h <= s.resolution[1];
    },
    { message: 'weatherRegion must lie inside resolution', path: ['weatherRegion'] },
  )
  .superRefine((s, ctx) => {
    // A layered room's layers move with the camera, so a box on it wouldn't stay on its art.
    if (!isFlat(s.resolution)) {
      if (s.effects?.length) ctx.addIssue({ code: 'custom', message: 'effects need a flat room', path: ['effects'] });
      s.lights.forEach((l, i) => {
        if (l.dust) ctx.addIssue({ code: 'custom', message: 'dust needs a flat room', path: ['lights', i, 'dust'] });
      });
    }
    if (s.weatherArea && s.weatherRegion) {
      ctx.addIssue({ code: 'custom', message: 'use weatherArea or weatherRegion, not both', path: ['weatherArea'] });
    }
    (s.weatherArea ?? []).forEach((shape, i) => {
      shape.forEach(([x, y], j) => {
        if (x < 0 || y < 0 || x > s.resolution[0] || y > s.resolution[1]) {
          ctx.addIssue({ code: 'custom', message: 'weather shape point must lie inside the frame', path: ['weatherArea', i, j] });
        }
      });
      if (shapeArea(shape) < MIN_SHAPE_AREA) ctx.addIssue({ code: 'custom', message: 'weather shape is too small', path: ['weatherArea', i] });
      else if (selfCrosses(shape)) ctx.addIssue({ code: 'custom', message: 'weather shape crosses itself', path: ['weatherArea', i] });
    });
    if ((s.effects ?? []).filter((e) => e.kind === 'lightning').length > 1) {
      ctx.addIssue({ code: 'custom', message: 'a room has at most one lightning', path: ['effects'] });
    }
    if ((s.effects ?? []).filter((e) => e.kind === 'glass').length > 1) {
      ctx.addIssue({ code: 'custom', message: 'a room has at most one glass', path: ['effects'] });
    }
    const lightIds = new Set(s.lights.map((l) => l.id));
    (s.effects ?? []).forEach((e, i) => {
      if ('rect' in e) {
        const [x, y, w, h] = e.rect;
        if (x < 0 || y < 0 || x + w > s.resolution[0] || y + h > s.resolution[1]) {
          ctx.addIssue({ code: 'custom', message: 'effect box must lie inside the frame', path: ['effects', i, 'rect'] });
        }
      }
      if (e.kind === 'screen' && !lightIds.has(e.light)) {
        ctx.addIssue({ code: 'custom', message: `unknown light '${e.light}'`, path: ['effects', i, 'light'] });
      }
    });
  })
  .superRefine((s, ctx) => {
    if (!isFlat(s.resolution)) return;
    if (s.resolution[0] !== FLAT_FRAME[0] || s.resolution[1] !== FLAT_FRAME[1]) {
      ctx.addIssue({ code: 'custom', message: 'flat rooms are 1536×864', path: ['resolution'] });
    }
    if (s.layers.length !== 1) ctx.addIssue({ code: 'custom', message: 'a flat room has exactly one layer', path: ['layers'] });
    else if (s.layers[0].parallax !== 0) ctx.addIssue({ code: 'custom', message: 'a flat room has no parallax', path: ['layers', 0, 'parallax'] });
  })
  // Everything downstream reads only weatherArea: an old rectangle becomes one 4-point shape.
  .transform(({ weatherRegion, ...s }) => (weatherRegion ? { ...s, weatherArea: [rectToShape(weatherRegion)] } : s));
