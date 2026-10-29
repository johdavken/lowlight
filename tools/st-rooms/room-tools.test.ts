import { describe, expect, it } from 'vitest';
import type { SceneDef } from '../../shared/types';
import { appliedText, checkRoomTool, ROOM_TOOLS } from './room-tools';

const scene = {
  id: 'lowlight-intake',
  name: 'Lowlight Intake',
  presets: { late: {}, storm: {}, quiet: {} },
  lights: [
    { id: 'monitor', label: 'intake terminal glow', color: '#7fe9ff', intensity: 0.5, radius: 80, flicker: 0, pos: [0, 0] },
    { id: 'desk_lamp', label: 'desk lamp', color: '#ffb347', intensity: 0.6, radius: 80, flicker: 0, pos: [0, 0] },
  ],
} as unknown as SceneDef;
const room = { scene, places: ['the-tilt', 'nix-apartment'], exits: ['intake-back-alley'], rooms: ['lowlight-intake', 'the-tilt', 'intake-back-alley'] };

describe('checkRoomTool', () => {
  it("an unknown mood: a plain result naming the room's moods, no action", () => {
    const r = checkRoomTool('apply_mood', { name: 'disco' }, room);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result).toContain('late, storm, quiet');
  });

  it('a mood: the action, with the default 1.5 s', () => {
    expect(checkRoomTool('apply_mood', { name: 'storm' }, room)).toEqual({ ok: true, action: { kind: 'mood', name: 'storm', seconds: 1.5 } });
  });

  it('a light by its quoted label resolves to its id', () => {
    const r = checkRoomTool('set_light', { light_id: '"intake terminal glow"', intensity: 0.2 }, room);
    expect(r).toEqual({ ok: true, action: { kind: 'light', id: 'monitor', patch: { intensity: 0.2 }, seconds: 1.5 } });
  });

  it('go_to her place, by full or bare id', () => {
    for (const id of ['karasu/the-tilt', 'the-tilt']) expect(checkRoomTool('go_to', { id }, room)).toEqual({ ok: true, action: { kind: 'go', folder: 'the-tilt', transition: 'fade' } });
  });

  it('go_to elsewhere: the map, not her', () => {
    const r = checkRoomTool('go_to', { id: 'velvet/glass-orchid' }, room);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result).toContain('walk you both there on the map');
  });

  it("go_to a place of hers the package doesn't have: said plainly, nothing moves", () => {
    const r = checkRoomTool('go_to', { id: 'nix-apartment' }, room);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.result).toContain("isn't here");
  });

  it('no character: exits only', () => {
    const none = { ...room, places: [] };
    expect(checkRoomTool('go_to', { id: 'the-tilt' }, none).ok).toBe(false);
    expect(checkRoomTool('go_to', { id: 'intake-back-alley' }, none)).toMatchObject({ ok: true });
  });

  it('clamps levels to 0–1', () => {
    expect(checkRoomTool('set_atmosphere', { fog: 2 }, room)).toEqual({ ok: true, action: { kind: 'atmosphere', patch: { fog: 1 }, seconds: 1.5 } });
    expect(checkRoomTool('set_light', { light_id: 'desk_lamp', intensity: -1 }, room)).toMatchObject({ ok: true, action: { patch: { intensity: 0 } } });
  });

  it('an unknown tool or bad arguments: a plain result', () => {
    expect(checkRoomTool('set_scene', {}, room).ok).toBe(false);
    expect(checkRoomTool('apply_mood', 'storm', room).ok).toBe(false);
    expect(checkRoomTool('set_light', { light_id: 'chandelier' }, room).ok).toBe(false);
  });
});

describe('ROOM_TOOLS', () => {
  it("are the four, with Lowlight's text, and go_to's text doesn't send her to a list_scenes she hasn't got", () => {
    expect(ROOM_TOOLS.map((t) => t.name)).toEqual(['apply_mood', 'set_atmosphere', 'set_light', 'go_to']);
    expect(ROOM_TOOLS.find((t) => t.name === 'go_to')!.description).not.toContain('list_scenes');
    expect(ROOM_TOOLS.find((t) => t.name === 'apply_mood')!.parameters.required).toEqual(['name']);
  });

  it('appliedText', () => {
    expect(appliedText('[room: x]')).toBe('applied: [room: x]');
  });
});

describe('isRoomToolMessage', () => {
  it('only a message whose every tool call is one of hers', async () => {
    const { isRoomToolMessage } = await import('./room-tools');
    expect(isRoomToolMessage({ extra: { tool_invocations: [{ name: 'apply_mood' }, { name: 'go_to' }] } })).toBe(true);
    expect(isRoomToolMessage({ extra: { tool_invocations: [{ name: 'apply_mood' }, { name: 'web_search' }] } })).toBe(false);
    expect(isRoomToolMessage({ extra: { tool_invocations: [] } })).toBe(false);
    expect(isRoomToolMessage({ extra: {} })).toBe(false);
    expect(isRoomToolMessage(undefined)).toBe(false);
  });
});

describe('preToolMessage', () => {
  it("finds her own reply just before a tool-call message made of her tools: empty or with text, it's superseded", async () => {
    const { preToolMessage } = await import('./room-tools');
    const tool = { is_system: true, extra: { tool_invocations: [{ name: 'apply_mood' }] } };
    expect(preToolMessage([{ is_user: true }, { mes: '' }, tool], 2)).toBe(1);
    expect(preToolMessage([{ is_user: true }, { mes: '*She kills the lamp.*' }, tool], 2)).toBe(1);
  });

  it("leaves the user's message, a system message, and anyone else's tools alone", async () => {
    const { preToolMessage } = await import('./room-tools');
    const tool = { is_system: true, extra: { tool_invocations: [{ name: 'apply_mood' }] } };
    expect(preToolMessage([{ is_user: true }, tool], 1)).toBeNull();
    expect(preToolMessage([{ is_system: true }, tool], 1)).toBeNull();
    expect(preToolMessage([{ mes: 'x' }, { is_system: true, extra: { tool_invocations: [{ name: 'web_search' }] } }], 1)).toBeNull();
    expect(preToolMessage([tool], 0)).toBeNull();
  });
});
