// Her four room tools in SillyTavern: their definitions (Lowlight's own text, shared/room-tool-text.ts) and the check
// of what she asked for. Pure: the extension (extension/room-tools.js) registers them and carries out the action.
import type { Atmosphere, SceneDef, Weather } from '../../shared/types';
import { ROOM_TOOL_TEXT } from '../../shared/room-tool-text';

export type RoomAction =
  | { kind: 'mood'; name: string; seconds: number }
  | { kind: 'atmosphere'; patch: Partial<Atmosphere>; seconds: number }
  | { kind: 'light'; id: string; patch: { intensity?: number; flicker?: number }; seconds: number }
  | { kind: 'go'; folder: string; transition: 'fade' | 'glitch' };

export interface RoomView {
  scene: SceneDef;
  /** Her places (room folders); none in a group chat or with no character. */
  places: string[];
  /** This room's ways out (room folders). */
  exits: string[];
  /** The rooms the package carries (folders). */
  rooms: string[];
}

const DEFAULT_SECONDS = 1.5;
const WEATHERS: Weather[] = ['rain', 'snow', 'ash', 'dust', 'none'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const unit = (v: unknown) => {
  const n = num(v);
  return n === undefined ? undefined : Math.max(0, Math.min(1, n));
};
const seconds = (v: unknown) => Math.max(0, num(v) ?? DEFAULT_SECONDS);
const folderOf = (id: string) => id.split('/').pop() ?? id;

/** Lowlight's go_to text, without its pointer to list_scenes (the package's ids are all in the [room] line). */
const GO_TO_TEXT = ROOM_TOOL_TEXT.go_to.replace(
  / Use list_scenes for the ids \([^)]*\)\./,
  ' The ids are in the [room] line (full names like karasu/noodle-stall, or the bare name).',
);

/** The four tools as SillyTavern registers them: name, description, JSON-schema parameters. */
export const ROOM_TOOLS = [
  {
    name: 'apply_mood',
    description: ROOM_TOOL_TEXT.apply_mood,
    parameters: { type: 'object', properties: { name: { type: 'string' }, duration: { type: 'number' } }, required: ['name'] },
  },
  {
    name: 'set_atmosphere',
    description: ROOM_TOOL_TEXT.set_atmosphere,
    parameters: {
      type: 'object',
      properties: { weather: { type: 'string', enum: WEATHERS }, weather_level: { type: 'number' }, fog: { type: 'number' }, duration: { type: 'number' } },
      required: [] as string[],
    },
  },
  {
    name: 'set_light',
    description: ROOM_TOOL_TEXT.set_light,
    parameters: {
      type: 'object',
      properties: { light_id: { type: 'string' }, intensity: { type: 'number' }, flicker: { type: 'number' }, duration: { type: 'number' } },
      required: ['light_id'],
    },
  },
  {
    name: 'go_to',
    description: GO_TO_TEXT,
    parameters: { type: 'object', properties: { id: { type: 'string' }, transition: { type: 'string', enum: ['fade', 'glitch'] } }, required: ['id'] },
  },
];

const fail = (result: string) => ({ ok: false as const, result });

/** What she asked for, checked against the room: the action to carry out, or a plain result and no change. */
export function checkRoomTool(name: string, args: unknown, room: RoomView): { ok: true; action: RoomAction } | { ok: false; result: string } {
  if (!args || typeof args !== 'object') return fail(`${name}: no arguments`);
  const a = args as Record<string, unknown>;
  const moods = Object.keys(room.scene.presets ?? {});
  switch (name) {
    case 'apply_mood': {
      const mood = typeof a.name === 'string' ? a.name.trim() : '';
      if (!moods.includes(mood)) return fail(`no mood "${mood}" here; this room's moods: ${moods.join(', ') || 'none'}`);
      return { ok: true, action: { kind: 'mood', name: mood, seconds: seconds(a.duration) } };
    }
    case 'set_atmosphere': {
      const patch: Partial<Atmosphere> = {};
      if (typeof a.weather === 'string') {
        if (!WEATHERS.includes(a.weather as Weather)) return fail(`weather is one of ${WEATHERS.join(', ')}`);
        patch.weather = a.weather as Weather;
      }
      const level = unit(a.weather_level);
      if (level !== undefined) patch.weatherLevel = level;
      const fog = unit(a.fog);
      if (fog !== undefined) patch.fog = fog;
      if (Object.keys(patch).length === 0) return fail('set_atmosphere: give weather, weather_level or fog');
      return { ok: true, action: { kind: 'atmosphere', patch, seconds: seconds(a.duration) } };
    }
    case 'set_light': {
      const want = typeof a.light_id === 'string' ? a.light_id.trim().replace(/^"|"$/g, '') : '';
      const light = room.scene.lights.find((l) => l.id === want || l.label === want);
      if (!light) return fail(`no light "${want}" here; lights: ${room.scene.lights.map((l) => `${l.id} "${l.label}"`).join(', ')}`);
      const patch: { intensity?: number; flicker?: number } = {};
      const intensity = unit(a.intensity);
      if (intensity !== undefined) patch.intensity = intensity;
      const flicker = unit(a.flicker);
      if (flicker !== undefined) patch.flicker = flicker;
      return { ok: true, action: { kind: 'light', id: light.id, patch, seconds: seconds(a.duration) } };
    }
    case 'go_to': {
      const folder = typeof a.id === 'string' ? folderOf(a.id.trim()) : '';
      if (!room.places.includes(folder) && !room.exits.includes(folder)) {
        return fail(`${folder || 'that'} isn't one of your places or a way out of here; anywhere else, they walk you both there on the map`);
      }
      if (!room.rooms.includes(folder)) return fail(`${folder} isn't here in this version of Lowlight; the room stays as it is`);
      return { ok: true, action: { kind: 'go', folder, transition: a.transition === 'glitch' ? 'glitch' : 'fade' } };
    }
    default:
      return fail(`no tool ${name}`);
  }
}

/** A tool's result once it applied: the room as it now is. */
export function appliedText(line: string): string {
  return `applied: ${line}`;
}

/** A SillyTavern tool-call message made only of her room tools (hidden in the Lowlight look; anyone else's stays). */
export function isRoomToolMessage(msg: { extra?: { tool_invocations?: { name?: string }[] } } | undefined): boolean {
  const calls = msg?.extra?.tool_invocations;
  const names = new Set(ROOM_TOOLS.map((t) => t.name));
  return Array.isArray(calls) && calls.length > 0 && calls.every((c) => names.has(String(c.name)));
}

/**
 * Her own reply just before a tool-call message made of her tools (index `toolAt`), or null. SillyTavern writes the
 * real reply after the tools ran, so whatever she sent with the call (nothing, or a first go at the same beat) is
 * superseded: the extension hides it from view and from the prompt, keeping its saved room.
 */
export function preToolMessage(chat: { is_user?: boolean; is_system?: boolean; mes?: string; extra?: { tool_invocations?: { name?: string }[] } }[], toolAt: number): number | null {
  if (!isRoomToolMessage(chat[toolAt])) return null;
  const prev = chat[toolAt - 1];
  return prev && !prev.is_user && !prev.is_system ? toolAt - 1 : null;
}
