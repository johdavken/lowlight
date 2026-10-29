import type { Source } from '../../shared/types';
import type { RoomOp, Room } from './room-state';

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * Format a `RoomOp` as the pixel-feed "tool line" shown under Nix's dialogue — a terse,
 * all-caps, `·`-separated summary of what just changed. `duration` never appears: it's an
 * animation detail, not part of what changed. Called after the op has been applied, so `room`
 * reflects the post-change state (used to resolve labels/names the op only references by id).
 * A mood the story applied (`src` world, story moods spec §4) reads MOOD, so it isn't taken for hers.
 */
export function formatToolLine(op: RoomOp, room: Room, src?: Source): string {
  switch (op.tool) {
    case 'set_light': {
      const a = op.args as { light_id: string; color?: string; intensity?: number; flicker?: number };
      const light = room.state.lights.find((l) => l.id === a.light_id);
      const label = (light?.label ?? a.light_id).toUpperCase();
      const parts = [label];
      if (a.color !== undefined) parts.push(a.color.toUpperCase());
      if (a.intensity !== undefined) parts.push(pct(a.intensity));
      if (a.flicker !== undefined) parts.push(`FLICKER ${pct(a.flicker)}`);
      return `// SET_LIGHT · ${parts.join(' · ')}`;
    }

    case 'power': {
      // The story turned the power off or on (blackouts phase 3 §3).
      const a = op.args as { state: 'out' | 'back' };
      return `// MOOD · POWER ${a.state === 'out' ? 'OUT' : 'BACK'}`;
    }

    case 'go_to': {
      const a = op.args as { id: string; transition?: string };
      const scene = room.findScene(a.id);
      const name = (scene?.name ?? a.id).toUpperCase();
      const transition = (a.transition ?? 'fade').toUpperCase();
      return `// GO_TO · ${name} · ${transition}`;
    }

    case 'set_atmosphere': {
      const a = op.args as { weather?: string; weather_level?: number; fog?: number };
      const parts: string[] = [];
      if (a.weather !== undefined) {
        // The post-change level: a weather switch without weather_level keeps the old level.
        const level = room.state.atmosphere.weatherLevel;
        parts.push(a.weather === 'none' ? 'CLEAR' : `${a.weather.toUpperCase()} ${pct(level)}`);
      } else if (a.weather_level !== undefined) {
        parts.push(pct(room.state.atmosphere.weatherLevel));
      }
      if (a.fog !== undefined) parts.push(`FOG ${pct(a.fog)}`);
      return `// SET_ATMOSPHERE · ${parts.join(' · ')}`;
    }

    case 'apply_mood': {
      const a = op.args as { name: string };
      return `// ${src === 'world' ? 'MOOD' : 'APPLY_MOOD'} · ${a.name.toUpperCase()}`;
    }

    case 'set_ambient': {
      const a = op.args as { color?: string; level?: number };
      const parts: string[] = [];
      if (a.color !== undefined) parts.push(a.color.toUpperCase());
      if (a.level !== undefined) parts.push(pct(a.level));
      return `// SET_AMBIENT · ${parts.join(' · ')}`;
    }

    default:
      return `// ${op.tool.toUpperCase()}`;
  }
}
