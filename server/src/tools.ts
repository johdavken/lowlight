import { named, type Pronoun } from '../../shared/pronoun';
import { z } from 'zod';
import { ROOM_TOOL_TEXT } from '../../shared/room-tool-text';
import { capAtWordBoundary } from '../../shared/persona';
import { formatClock, nextOccurrence, parseHhmm } from '../../shared/clock';
import { LEAD_DETAILS_MAX } from '../../shared/leads';
import { STANDING } from '../../shared/standing';
import type { StandingControl } from './standing';
import type { Source } from '../../shared/types';
import type { Db } from './db';
import type { ExpressionControl } from './expressions';
import type { Journal } from './journal';
import type { Result, Room } from './room-state';

/** What a tool can reach: the agent's room, her journal and (when she has any) her expressions. */
export interface ToolContext {
  room: Room;
  journal: Journal;
  /** Whose pair a journal tool call belongs to: the turn it's running in, else the default player. */
  player: () => string;
  /** On comms (spec 2026-10-20): the room's tools aren't hers. */
  comms?: () => boolean;
  /** Her face on the stage; null when her character file lists no expressions. */
  expressions: ExpressionControl | null;
  /** Everyone else here who has faces (set_expression who), in who's-here order; absent or empty when none. */
  others?: () => { id: string; name: string; expressions: ExpressionControl }[];
  /** Her own id and name: `who` naming herself means her own face. */
  self?: string[];
  /** The reply being streamed (what a share belongs to), else null. */
  replyId?: () => string | null;
  /** Which writing of that reply this is (a regenerate or keep-going reuses its id). */
  replyTurn?: () => number;
  /** Shows a line in the chat of the turn in progress. */
  toolLine?: (text: string) => void;
  /** Records in her database that the player now knows a contact (false: already recorded). */
  share?: (r: Parameters<Db['shareContact']>[0]) => boolean;
  /** The story clock in this turn (direct characters in a playthrough): now, and pass_time's move (null outside a stamped turn). */
  clock?: { now(): number | null; pass(minutes: number): number | null };
  /** The city's contacts (fixed residents aren't), and whether the player already knows one. */
  contacts?: { list(): { id: string; name: string; pronoun: Pronoun }[]; isKnown(id: string): boolean };
  /** Plays one of the room's sounds on the player's page (a `sound` event; never stored). */
  playSound?: (scene: string, name: string, player: string) => void;
  /** Leads: the ones this turn offers her (give_lead), and recording one as given (false: already held). */
  leads?: { offered(): { id: string; title: string }[]; give(id: string, details: string, messageId: string): boolean };
  /** Standing (spec 2026-10-13): her trust and warmth on the turn's player (shift_standing); absent outside a story. */
  standing?: StandingControl;
}

/** The sounds the agent may play in the room she's in. */
const agentSounds = (ctx: ToolContext) => (ctx.room.scene().sound?.sounds ?? []).filter((s) => s.agent);

/** The sounds already played in the reply being written (by message id and turn: a regenerated take starts afresh). */
let playedIn: { reply: string; names: Set<string> } | null = null;

/** The contacts she could introduce: everyone but herself. */
function othersOf(ctx: ToolContext): { id: string; name: string; pronoun: Pronoun }[] {
  const self = (ctx.self ?? []).map((s) => s.toLowerCase());
  return (ctx.contacts?.list() ?? []).filter((c) => !self.includes(c.id.toLowerCase()));
}

export interface ToolSpec {
  name: string;
  description: string;
  args: z.ZodObject<any>;
  run(ctx: ToolContext, args: any, src: Source): Result;
  readOnly: boolean;
  /** Whether this agent is offered the tool at all (default: always). Otherwise it answers as unknown. */
  available?(ctx: ToolContext): boolean;
  /** Her own description, when it depends on her (default: `description`). */
  describe?(ctx: ToolContext): string;
}

/** The bookkeeping tools the Residual owns (scribe spec §1): never offered to her model or run when it calls one anyway (direct-tools); the dev panel still can. */
export const RESIDUAL_TOOLS: readonly string[] = ['note', 'read_notes', 'forget', 'set_recap', 'update_dossier', 'shift_standing'];

/** Tools her model is never offered, and a call she makes anyway answers as unknown: the Residual's, and set_expression (faces come from her *actions*, spec 2026-10-20; the dev panel still sets them). */
export const NOT_HERS: readonly string[] = [...RESIDUAL_TOOLS, 'set_expression'];

const transitionSchema = z.enum(['fade', 'glitch']);
const weatherSchema = z.enum(['none', 'rain', 'snow', 'ash', 'dust']);

export const TOOLS: ToolSpec[] = [
  {
    name: 'get_room',
    description: "See the room as it is right now: the current scene, lights, ambient color, weather, fog and available presets. Call this whenever you need to check a light's id or the room's current state before changing it.",
    args: z.object({}),
    readOnly: true,
    run({ room }) {
      return { ok: true, text: room.describe() };
    },
  },
  {
    name: 'list_scenes',
    description: 'List your places — the rooms you can take them to yourself, plus the room you are in and its ways out — one per line as `id — name: description`. Ids are full room names like karasu/noodle-stall. Use the id with go_to.',
    args: z.object({}),
    readOnly: true,
    run({ room }) {
      const exits = room.exitsHere();
      const text = [
        ...room
          .listScenes()
          .filter((s) => !exits.some((e) => e.scene.id === s.id))
          .map((s) => `${s.id} — ${s.name}: ${s.description}`),
        ...exits.map((e) => `${e.scene.id} — ${e.scene.name} (way out: ${e.way}): ${e.scene.description}`),
      ].join('\n');
      return { ok: true, text };
    },
  },
  {
    // Was set_scene: the name leaked into the story ("*sets the scene as we arrive*", chat stress 2026-10-15).
    name: 'go_to',
    description: ROOM_TOOL_TEXT.go_to,
    args: z.object({
      id: z.string(),
      transition: transitionSchema.optional(),
    }),
    readOnly: false,
    run({ room }, args, src) {
      return room.setScene(args, src);
    },
  },
  {
    name: 'set_light',
    description: ROOM_TOOL_TEXT.set_light,
    args: z.object({
      light_id: z.string(),
      color: z.string().optional(),
      intensity: z.number().optional(),
      flicker: z.number().optional(),
      duration: z.number().optional(),
    }),
    readOnly: false,
    run({ room }, args, src) {
      return room.setLight(args, src);
    },
  },
  {
    name: 'set_ambient',
    description: "Change the room's overall ambient light. `color` is only a tint (a dark color doesn't darken the room); the level is brightness, 0 (dark) to 1, and rooms usually sit around 0.25–0.5. To darken the room, lower the level. Changes ease in over `duration` seconds (default 1.5).",
    args: z.object({
      color: z.string().optional(),
      level: z.number().optional(),
      duration: z.number().optional(),
    }),
    readOnly: false,
    run({ room }, args, src) {
      return room.setAmbient(args, src);
    },
  },
  {
    name: 'set_atmosphere',
    description: ROOM_TOOL_TEXT.set_atmosphere,
    args: z.object({
      weather: weatherSchema.optional(),
      weather_level: z.number().optional(),
      fog: z.number().optional(),
      duration: z.number().optional(),
    }),
    readOnly: false,
    run({ room }, args, src) {
      return room.setAtmosphere(args, src);
    },
  },
  {
    // Was apply_preset: the name leaked into the story ("*applies the quiet preset*", chat stress 2026-10-15).
    name: 'apply_mood',
    description: ROOM_TOOL_TEXT.apply_mood,
    args: z.object({
      name: z.string(),
      duration: z.number().optional(),
    }),
    readOnly: false,
    run({ room }, args, src) {
      return room.applyPreset(args, src);
    },
  },
  {
    name: 'note',
    description:
      'Write a note that should last: to your dossier on the person you\'re talking to, or to your own journal. Up to 280 characters. For a new note leave id out: ids are given to you. Use about "me" for your own life, room and plans; about "you" (the default) for what you learn about the person you\'re talking to. Pin the few that matter every time; pinned notes show in the [journal: …] line each turn. With id, rewrites that note; with id and pinned alone (no text), just pins or unpins it; with id and about, moves it between your journal and this dossier.',
    args: z.object({
      text: z.string().optional(),
      pinned: z.boolean().optional(),
      id: z.string().optional(),
      about: z.enum(['you', 'me']).optional(),
    }),
    readOnly: false,
    run({ journal, player }, args, src) {
      return journal.note(player(), args, src);
    },
  },
  {
    name: 'read_notes',
    description: 'Read your journal (your own notes) and your dossier on the person you\'re talking to, every note with its id, pinned first. Pass query to find notes containing a word.',
    args: z.object({ query: z.string().optional() }),
    readOnly: true,
    run({ journal, player }, args) {
      return journal.read(player(), args.query);
    },
  },
  {
    name: 'forget',
    description: 'Delete a note from your journal or from your dossier on the person you\'re talking to, by its id (e.g. n7), when it is no longer true or worth keeping.',
    args: z.object({ id: z.string() }),
    readOnly: false,
    run({ journal, player }, args, src) {
      return journal.forget(player(), args.id, src);
    },
  },
  {
    name: 'set_recap',
    description:
      'Leave a short recap of where things stand with the person you\'re talking to, when a scene or night winds down, so the next visit can pick up where you left off. Replaces the previous recap. Up to 600 characters.',
    args: z.object({ text: z.string() }),
    readOnly: false,
    run({ journal, player }, args, src) {
      return journal.setRecap(player(), args.text, src);
    },
  },
  {
    name: 'update_dossier',
    description:
      "Rewrite your dossier page on the person you're talking to: a short page in your own words on who they are to you, what matters to them and what to watch for. It replaces the whole page, so carry over what still holds. Rewrite it when you learn something lasting; keep one-off facts in notes. Up to 1375 characters.",
    args: z.object({ text: z.string() }),
    readOnly: false,
    run({ journal, player }, args, src) {
      return journal.setPage(player(), args.text, src);
    },
  },
  {
    name: 'set_expression',
    description: 'Change your facial expression on the stage for this reply.',
    args: z.object({ name: z.string(), who: z.string().optional() }),
    readOnly: false,
    available: (ctx) => ctx.expressions !== null || (ctx.others?.() ?? []).length > 0,
    describe: (ctx) => {
      const others = ctx.others?.() ?? [];
      const own = ctx.expressions
        ? `Change your facial expression on the stage for this reply. Names: ${['neutral', ...ctx.expressions.names()].join(', ')}. It lasts until your next reply, which starts neutral.`
        : 'Change a face on the stage for this reply.';
      const theirs = others.map((o) => `For ${o.name}'s face pass who: "${o.id}"; theirs: ${['neutral', ...o.expressions.names()].join(', ')}.`);
      return [own, ...theirs].join(' ');
    },
    run({ expressions, others, self, player }, args, src) {
      if (args.who !== undefined) {
        const who = args.who.trim().toLowerCase();
        const here = others?.() ?? [];
        const o = here.find((x) => x.id.toLowerCase() === who);
        if (o) return o.expressions.set(args.name, player(), src);
        if (!(self ?? []).some((s) => s.toLowerCase() === who)) {
          if (here.length === 0) return { ok: false, error: `no one called '${args.who}' is here` };
          const list = here.map((x) => `who: "${x.id}" is for ${x.name}'s face`).join(', ');
          return { ok: false, error: `no one called '${args.who}' is here; ${list}, and leaving who out is for yours` };
        }
      }
      if (!expressions) return { ok: false, error: 'you have no expressions of your own' };
      return expressions.set(args.name, player(), src);
    },
  },
  {
    name: 'play_sound',
    description: 'Play a sound in the room when the story makes it.',
    args: z.object({ name: z.string() }),
    readOnly: false,
    available: (ctx) => ctx.playSound !== undefined && agentSounds(ctx).length > 0,
    describe: (ctx) => `Play a sound in the room when the story makes it: ${agentSounds(ctx).map((s) => `${s.name} (${s.agent!.about})`).join(', ')}.`,
    run(ctx, args) {
      const sounds = agentSounds(ctx);
      const sound = sounds.find((s) => s.name === args.name.trim().toLowerCase());
      if (!sound) return { ok: false, error: `no sound '${args.name}' here; the room's sounds: ${sounds.map((s) => s.name).join(', ')}` };
      // Once per reply (a looping model can't ring the bell five times); the dev panel (no reply) may repeat.
      const id = ctx.replyId?.() ?? null;
      const reply = id === null ? null : `${id}#${ctx.replyTurn?.() ?? 0}`;
      if (reply !== null) {
        if (playedIn?.reply !== reply) playedIn = { reply, names: new Set() };
        if (playedIn.names.has(sound.name)) return { ok: false, error: `already played '${sound.name}' this reply` };
        playedIn.names.add(sound.name);
      }
      ctx.playSound!(ctx.room.state.sceneId, sound.name, ctx.player());
      ctx.toolLine?.(`♪ ${sound.name}`);
      return { ok: true, text: `played ${sound.name}` };
    },
  },
  {
    name: 'share_contact',
    description: "Introduce the person you're talking to to someone you know: when you'd give them someone's number or tell them where to find someone.",
    // A how over 120 is cut at a word (below), not refused: a refusal made GLM rewrite its reply.
    args: z.object({ who: z.string(), how: z.string().optional() }),
    readOnly: false,
    available: (ctx) => othersOf(ctx).length > 0,
    describe: (ctx) =>
      `Introduce the person you're talking to to someone you know: when you'd give them someone's number or tell them where to find someone. They can then look that person up themselves. \`who\` is one of: ${othersOf(ctx)
        .map((c) => named(c.name, c.pronoun))
        .join(', ')}. \`how\` is a short in-story note (e.g. "gave you the number"), up to 120 characters.`,
    run(ctx, args) {
      // The list shows `Cass (she)`; a model may copy the pronoun along with the name.
      const who = args.who.trim().replace(/\s*\((?:she|he|they)\)$/i, '').toLowerCase();
      if ((ctx.self ?? []).some((s) => s.toLowerCase() === who)) return { ok: false, error: "that's you" };
      const contact = othersOf(ctx).find((c) => c.id.toLowerCase() === who || c.name.toLowerCase() === who);
      if (!contact || !ctx.contacts) return { ok: false, error: `no contact '${args.who}'` };
      if (ctx.contacts.isKnown(contact.id)) return { ok: true, text: 'already known' };
      const messageId = ctx.replyId?.() ?? null;
      if (messageId === null || !ctx.share) return { ok: false, error: 'share_contact only works inside a reply' };
      if (!ctx.share({ contactId: contact.id, player: ctx.player(), messageId, how: args.how === undefined ? null : capAtWordBoundary(args.how.trim(), 120), at: Date.now() })) return { ok: true, text: 'already known' };
      const self = ctx.self ?? [];
      ctx.toolLine?.(`${self[1] ?? self[0] ?? 'Someone'} shared a contact: ${contact.name.toUpperCase()}`);
      return { ok: true, text: `shared ${contact.name}` };
    },
  },
  {
    name: 'give_lead',
    description: 'Give the person you are talking to a lead, once you have told them about it.',
    // No max here: over-long details are cut in run(). Refusing them gave GLM a fix-up round, and it
    // filled that round by writing its reply again (Ines live check, 2026-10-14).
    args: z.object({ id: z.string(), details: z.string().trim().min(1) }),
    readOnly: false,
    available: (ctx) => (ctx.leads?.offered().length ?? 0) > 0,
    describe: (ctx) =>
      `Call this once you have actually told the person you're talking to about one of these — never before, and only if it came up naturally: ${ctx
        .leads!.offered()
        .map((l) => `"${l.id}" (${l.title})`)
        .join(', ')}. \`details\` is what you told them, in a few words (names, amounts, places), up to ${LEAD_DETAILS_MAX} characters.`,
    run(ctx, args) {
      const offered = ctx.leads?.offered() ?? [];
      const lead = offered.find((l) => l.id === args.id.trim());
      if (!lead || !ctx.leads) return { ok: false, error: `no lead '${args.id}' to give now; you can give: ${offered.map((l) => l.id).join(', ')}` };
      const messageId = ctx.replyId?.() ?? null;
      if (messageId === null) return { ok: false, error: 'give_lead only works inside a reply' };
      const long = args.details.length > LEAD_DETAILS_MAX;
      const details = long ? capAtWordBoundary(args.details, LEAD_DETAILS_MAX).trimEnd() : args.details;
      if (!ctx.leads.give(lead.id, details, messageId)) return { ok: true, text: 'already given' };
      const self = ctx.self ?? [];
      ctx.toolLine?.(`${self[1] ?? self[0] ?? 'Someone'} gave you a lead: ${lead.title}`);
      return { ok: true, text: `gave the lead: ${lead.title}${long ? ` (details shortened to ${LEAD_DETAILS_MAX} characters)` : ''}` };
    },
  },
  {
    name: 'shift_standing',
    description:
      "How the person you're talking to just landed with you. Most turns move nothing; ±1 for something that would stay with you. trust: whether you believe them and would tell them things. warmth: whether you like having them around. Call it after you've reacted in your reply, never instead of reacting. reason: a few words, for yourself.",
    args: z.object({ trust: z.number().int().min(-STANDING.step).max(STANDING.step), warmth: z.number().int().min(-STANDING.step).max(STANDING.step), reason: z.string().trim().min(1) }),
    readOnly: false,
    available: (ctx) => ctx.standing?.applies() === true,
    run(ctx, args, src) {
      if (args.trust === 0 && args.warmth === 0) return { ok: false, error: 'move trust or warmth' };
      // The dev panel acts as its tab's player; standing moves for the running turn's.
      if (src === 'dev' && ctx.player() !== ctx.standing!.player()) return { ok: false, error: "standing belongs to this turn's player; open their tab" };
      const messageId = ctx.replyId?.() ?? null;
      if (messageId === null) return { ok: false, error: 'shift_standing only works inside a reply' };
      // GLM writes long reasons: cut, never refuse (a refused call gets retried, and can repeat the reply).
      const r = ctx.standing!.move({ trust: args.trust, warmth: args.warmth, reason: capAtWordBoundary(args.reason, STANDING.reasonMax) }, messageId);
      if (r === 'off') return { ok: false, error: 'standing does not apply here' };
      if (r === 'already') return { ok: true, text: 'already moved this turn' };
      // The player sees a change of word, never the numbers (spec §6).
      if (r.before !== r.after) {
        const self = ctx.self ?? [];
        ctx.toolLine?.(`${self[1] ?? self[0] ?? 'Someone'} · now: ${r.after}`);
      }
      return { ok: true, text: `now: ${r.after}` };
    },
  },
  {
    name: 'pass_time',
    description: "Skip the story ahead when it jumps or your reply moves to a later hour — you talked till dawn, you'll see them tomorrow — so Lowlight's clock agrees. Give `minutes` (1–1440) or `until` (HH:MM, the next time the clock reads it). Not for ordinary back-and-forth.",
    args: z.object({ minutes: z.number().int().min(1).max(1440).optional(), until: z.string().optional() }),
    readOnly: false,
    available: (ctx) => ctx.clock !== undefined,
    run(ctx, args) {
      if ((args.minutes === undefined) === (args.until === undefined)) return { ok: false, error: 'give minutes (1–1440) or until (HH:MM), not both' };
      const at = args.until !== undefined ? parseHhmm(args.until) : null;
      if (args.until !== undefined && at === null) return { ok: false, error: 'until must be HH:MM' };
      const now = ctx.clock!.now();
      if (now === null) return { ok: false, error: 'pass_time only works in a story' };
      const minutes = at !== null ? nextOccurrence(now, at) - now : args.minutes!;
      const after = ctx.clock!.pass(minutes);
      if (after === null) return { ok: false, error: 'pass_time only works in a story' };
      return { ok: true, text: `time passed: now ${formatClock(after).replace(' · ', ', ')}` };
    },
  },
];

/** The tools this agent is offered, in TOOLS order, each with her own description. */
/** The room's own tools: on comms (spec 2026-10-20 §2) her model doesn't get them — she isn't there. */
const ROOM_TOOLS = ['go_to', 'list_scenes', 'set_light', 'set_ambient', 'set_atmosphere', 'apply_mood', 'play_sound'];
const offComms = (ctx: ToolContext, name: string) => !(ctx.comms?.() && ROOM_TOOLS.includes(name));

export function toolsFor(ctx: ToolContext, o: { agent?: boolean } = {}): { name: string; description: string; args: z.ZodObject<any>; readOnly: boolean }[] {
  return TOOLS.filter((t) => (t.available?.(ctx) ?? true) && !(o.agent && NOT_HERS.includes(t.name)) && (!o.agent || offComms(ctx, t.name))).map((t) => ({
    name: t.name,
    description: t.describe?.(ctx) ?? t.description,
    args: t.args,
    readOnly: t.readOnly,
  }));
}

/** Format a zod error into a short, readable message naming the offending field(s). */
function formatZodError(name: string, error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${field}: ${issue.message}`;
  });
  return `invalid arguments for ${name}: ${parts.join('; ')}`;
}

export function dispatchTool(ctx: ToolContext, name: string, args: unknown, src: Source): Result {
  if (src === 'agent' && !offComms(ctx, name)) return { ok: false, error: `${name} isn't yours on comms: you're not there` };
  const tool = TOOLS.find((t) => t.name === name && (t.available?.(ctx) ?? true));
  if (!tool) {
    // Her model is shown only the tools she's offered (not the Residual's or set_expression).
    const names = toolsFor(ctx, { agent: src === 'agent' })
      .map((t) => t.name)
      .join(', ');
    return { ok: false, error: `unknown tool '${name}'; available: ${names}` };
  }

  const parsed = tool.args.safeParse(args ?? {});
  if (!parsed.success) {
    return { ok: false, error: formatZodError(name, parsed.error) };
  }

  return tool.run(ctx, parsed.data, src);
}
