import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Atmosphere, LightDef, SceneDef } from './types';
import { roomLine } from './room-line';
import { ROOM_TOOL_TEXT } from './room-tool-text';

const scene = { id: 'karasu/lowlight-intake', name: 'Lowlight Intake', presets: { late: {}, storm: {} } } as unknown as SceneDef;
const atmosphere = { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' } as Atmosphere;
const lights = [
  { id: 'desk_lamp', label: 'desk lamp', color: '#ffb347', intensity: 0.6 },
  { id: 'window_neon', label: 'window neon', color: '#9b5cff', intensity: 0.45, outside: true },
] as LightDef[];

describe('roomLine', () => {
  it("reproduces Lowlight's line, word for word (captured from Room.summary() before the move)", () => {
    const line = roomLine({
      scene,
      atmosphere,
      lights,
      district: 'Karasu',
      places: [{ id: 'karasu/nix-apartment', name: "Nix's Apartment" }],
      ways: [{ id: 'karasu/intake-back-alley', name: 'The Intake Back Alley', way: 'down the back stairs' }],
    });
    expect(line).toBe(
      '[room: karasu/lowlight-intake "Lowlight Intake", Karasu · ambient #1a1030 35% · rain 70% · fog 20% · lights: desk_lamp "desk lamp" #ffb347 60%, window_neon "window neon" #9b5cff 45% outside · moods: late, storm · places: karasu/nix-apartment "Nix\'s Apartment" · ways out: karasu/intake-back-alley "The Intake Back Alley" (down the back stairs)]',
    );
  });

  it('says clear for no weather, and leaves out places, ways and district when there are none', () => {
    const line = roomLine({ scene, atmosphere: { ...atmosphere, weather: 'none' }, lights, places: [], ways: [] });
    expect(line).toContain(' · clear · ');
    expect(line).not.toContain('places:');
    expect(line).not.toContain('ways out:');
    expect(line.startsWith('[room: karasu/lowlight-intake "Lowlight Intake" · ambient')).toBe(true);
  });
});

describe('ROOM_TOOL_TEXT', () => {
  it("is the server's text: tools.ts reads these, not copies of them", () => {
    const tools = fs.readFileSync(path.join(__dirname, '../server/src/tools.ts'), 'utf8');
    for (const name of ['apply_mood', 'set_atmosphere', 'set_light', 'go_to'] as const) {
      expect(ROOM_TOOL_TEXT[name].length).toBeGreaterThan(80);
      expect(tools).toContain(`description: ROOM_TOOL_TEXT.${name}`);
    }
    expect(ROOM_TOOL_TEXT.apply_mood).toContain('Prefer this over adjusting lights one by one for a mood change.');
  });
});
