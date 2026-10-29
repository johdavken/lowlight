import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIRECT_TOOL_ROUNDS, runToolCall, ToolCallAssembler, toolDefinitions } from '../src/direct-tools';
import { openDb } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { dispatchTool, SCRIBE_TOOLS, TOOLS, toolsFor } from '../src/tools';
import { generateScenes } from '../../tools/gen-placeholders';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-tools-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const ctx = () => ({ room: new Room(registry), journal: new Journal(openDb(':memory:', { defaultPlayer: 'hicks' })), player: () => 'hicks', expressions: null });

describe('toolDefinitions', () => {
  it('without expressions: one function per room tool (the journal is the scribe\'s), with its description and a JSON schema', () => {
    const defs = toolDefinitions(ctx());
    expect(DIRECT_TOOL_ROUNDS).toBe(4);
    expect(defs.map((d) => d.function.name)).toEqual(
      TOOLS.map((t) => t.name).filter((n) => n !== 'set_expression' && n !== 'share_contact' && n !== 'play_sound' && n !== 'pass_time' && n !== 'give_lead' && !SCRIBE_TOOLS.includes(n)),
    );
    expect(defs).toHaveLength(7);
    const setLight = defs.find((d) => d.function.name === 'set_light')!;
    expect(setLight.type).toBe('function');
    expect(setLight.function.description).toBe(TOOLS.find((t) => t.name === 'set_light')!.description);
    expect(setLight.function.parameters).toMatchObject({ type: 'object', required: ['light_id'] });
  });

  it('shift_standing is never hers, even where standing applies (the scribe moves it)', () => {
    const standing = { applies: () => true, player: () => 'hicks', move: () => 'already' as const, repliesSinceMove: () => null };
    expect(toolDefinitions({ ...ctx(), standing }).map((d) => d.function.name)).not.toContain('shift_standing');
  });

  it('pass_time only with a story clock, minutes and until both optional', () => {
    const defs = toolDefinitions({ ...ctx(), clock: { now: () => 1205, pass: () => 1210 } });
    const pt = defs.find((d) => d.function.name === 'pass_time')!;
    expect(pt.function.parameters).toMatchObject({ type: 'object', properties: { minutes: { type: 'integer' }, until: { type: 'string' } } });
    expect((pt.function.parameters as { required?: string[] }).required ?? []).toEqual([]);
  });

  it('mirrors toolsFor(ctx, { agent: true })', () => {
    const plain = ctx();
    expect(toolDefinitions(plain).map((d) => d.function.name)).toEqual(toolsFor(plain, { agent: true }).map((t) => t.name));
    const withFaces = { ...ctx(), expressions: { names: () => ['happy'], set: () => ({ ok: true as const, text: 'expression: happy' }) } };
    expect(toolDefinitions(withFaces).map((d) => [d.function.name, d.function.description])).toEqual(toolsFor(withFaces, { agent: true }).map((t) => [t.name, t.description]));
  });

  it("a misnamed call's error lists only her tools, never set_expression or the scribe's", () => {
    const withFaces = { ...ctx(), expressions: { names: () => ['happy'], set: () => ({ ok: true as const, text: 'expression: happy' }) } };
    const out = runToolCall(withFaces, { name: 'set_face', args: '{"name":"happy"}' });
    expect(out).toMatch(/^error: unknown tool 'set_face'; available: /);
    expect(out).not.toContain('set_expression');
    expect(out).not.toContain('note');
    expect(out).toContain('set_light');
  });

  it('set_expression is never hers, even with faces (faces come from her *actions*); a call answers as unknown', () => {
    const withFaces = { ...ctx(), expressions: { names: () => ['happy'], set: () => ({ ok: true as const, text: 'expression: happy' }) } };
    expect(toolDefinitions(withFaces).map((d) => d.function.name)).not.toContain('set_expression');
    expect(runToolCall(withFaces, { name: 'set_expression', args: '{"name":"happy"}' })).toMatch(/^error: unknown tool 'set_expression'/);
    // The dev panel's face buttons still reach it.
    expect(dispatchTool(withFaces, 'set_expression', { name: 'happy' }, 'dev')).toEqual({ ok: true, text: 'expression: happy' });
  });
});

describe('ToolCallAssembler', () => {
  it('joins id, name and argument fragments split across chunks by index', () => {
    const a = new ToolCallAssembler();
    a.add([{ index: 0, id: 'c1', type: 'function', function: { name: 'set_light', arguments: '{"light_' } }]);
    a.add([{ index: 1, id: 'c2', function: { name: 'note', arguments: '{"text":' } }]);
    a.add([{ index: 0, function: { arguments: 'id":"lamp"}' } }]);
    a.add([{ index: 1, function: { arguments: '"hi"}' } }]);
    a.add(undefined);
    expect(a.calls()).toEqual([
      { id: 'c1', name: 'set_light', args: '{"light_id":"lamp"}' },
      { id: 'c2', name: 'note', args: '{"text":"hi"}' },
    ]);
  });
});

describe('dispatchTool player binding', () => {
  it("a ctx whose player() returns 'cass' writes Cass's dossier, not the default's (the dev-panel path, Review Focus 1)", () => {
    const c = ctx();
    const cassCtx = { ...c, player: () => 'cass' };
    const result = dispatchTool(cassCtx, 'note', { text: 'cass dossier note' }, 'dev');
    expect(result).toMatchObject({ ok: true });
    expect(c.journal.notes('cass').map((n) => n.text)).toContain('cass dossier note');
    expect(c.journal.notes('hicks').map((n) => n.text)).not.toContain('cass dossier note');
  });

  it("update_dossier from a ctx whose player() returns 'cass' writes Cass's page (the dev-panel path)", () => {
    const c = ctx();
    const result = dispatchTool({ ...c, player: () => 'cass' }, 'update_dossier', { text: 'Cass: hard to rattle' }, 'dev');
    expect(result).toMatchObject({ ok: true, text: 'dossier updated (20/1375)' });
    expect(c.journal.page('cass').text).toBe('Cass: hard to rattle');
    expect(c.journal.page('hicks').text).toBeNull();
  });
});

describe('runToolCall', () => {
  it("unparseable args ('', truncated, 'null') return an error text and don't throw (Review Focus 1)", () => {
    for (const args of ['', '{"light_id":', 'null']) {
      const out = runToolCall(ctx(), { name: 'set_light', args });
      expect(out).toMatch(/^error: /);
    }
  });

  it('empty args for a tool without arguments are fine', () => {
    expect(runToolCall(ctx(), { name: 'get_room', args: '' })).toMatch(/^Scene: /);
  });

  it('with NIX_TOOL_TRACE set, each call is appended to that file as a JSON line (the chat stress test reads it)', () => {
    const file = path.join(tmpDir, 'trace.jsonl');
    process.env.NIX_TOOL_TRACE = file;
    try {
      const c = { ...ctx(), self: ['cass', 'Cass'] };
      runToolCall(c, { name: 'launch_rocket', args: '{}' });
      runToolCall(c, { name: 'get_room', args: '' });
    } finally {
      delete process.env.NIX_TOOL_TRACE;
    }
    runToolCall(ctx(), { name: 'get_room', args: '' });
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ self: 'cass', name: 'launch_rocket', args: '{}' });
    expect(lines[0].out).toMatch(/^error: unknown tool/);
    expect(typeof lines[0].at).toBe('number');
  });

  it('an unknown tool → error text listing the tools', () => {
    expect(runToolCall(ctx(), { name: 'launch_rocket', args: '{}' })).toMatch(/^error: unknown tool 'launch_rocket'.*set_light/);
  });

  it('a valid call changes the room', () => {
    const c = ctx();
    const id = c.room.state.lights[0].id;
    const out = runToolCall(c, { name: 'set_light', args: JSON.stringify({ light_id: id, intensity: 0 }) });
    expect(out).toMatch(/^applied: /);
    expect(c.room.state.lights[0].intensity).toBe(0);
  });
});
