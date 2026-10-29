import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMessage, ServerEvent } from '../../shared/types';
import { openDb, type Db } from '../src/db';
import { createExpressionControl } from '../src/expressions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { dispatchTool, toolsFor, type ToolContext } from '../src/tools';
import { generateScenes } from '../../tools/gen-placeholders';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expressions-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Every DB a test opens this run, closed after it so no file-backed handle outlives the test. */
const openDbs: Db[] = [];
afterEach(() => {
  while (openDbs.length) openDbs.pop()!.close();
});

const msg = (id: string, role: 'user' | 'agent', ts: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role,
  text: `${id} text`,
  toolLines: [],
  ts,
  status: 'ok',
  ...extra,
});

let n = 0;
function setup(state: { busy: boolean; activeMessageId: string | null }) {
  const relay = { activePlayer: 'hicks', ...state };
  const db: Db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
  openDbs.push(db);
  db.insertMessage('hicks', msg('u1', 'user', 1));
  db.insertMessage('hicks', msg('r1', 'agent', 2));
  db.insertMessage('hicks', msg('u2', 'user', 3));
  db.insertMessage('hicks', msg('r2', 'agent', 4, { status: 'streaming' }));
  const events: ServerEvent[] = [];
  const control = createExpressionControl({ names: ['happy', 'annoyed'], db, relay: () => relay, emit: (e) => events.push(e) });
  return { db, events, control };
}

describe('createExpressionControl', () => {
  it('during a turn: sets the expression on the reply in progress and broadcasts it once', () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: 'r2' });
    expect(control.names()).toEqual(['happy', 'annoyed']);
    expect(control.set('happy', 'hicks', 'agent')).toEqual({ ok: true, text: 'expression: happy' });
    expect(db.getMessage('hicks', 'r2')!.expression).toBe('happy');
    expect(db.getMessage('hicks', 'r1')!.expression).toBeUndefined();
    expect(events).toEqual([{ type: 'message', message: db.getMessage('hicks', 'r2')! }]);
    expect(events.some((e) => e.type === 'tool_line')).toBe(false);
  });

  it('idle, a reply with takes: the shown take keeps the expression too, so a swipe back shows it', () => {
    const { db, control } = setup({ busy: false, activeMessageId: null });
    db.updateMessage('hicks', 'r2', { status: 'ok' });
    db.setTakes('hicks', 'r2', [{ text: 'first', toolLines: [], ts: 4 }, { text: 'second', toolLines: [], ts: 5 }], 1);
    control.set('happy', 'hicks', 'dev');
    const takes = db.getTakes('hicks', 'r2')!;
    expect(takes.index).toBe(1);
    expect(takes.takes[1].expression).toBe('happy');
    expect(takes.takes[0].expression).toBeUndefined();
    expect(db.getMessage('hicks', 'r2')).toMatchObject({ text: 'second', expression: 'happy' });
    db.setTakes('hicks', 'r2', takes.takes, 0);
    expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
    db.setTakes('hicks', 'r2', takes.takes, 1);
    expect(db.getMessage('hicks', 'r2')!.expression).toBe('happy');
  });

  it('busy on a new take: only the reply in progress changes; its old takes and streaming text are left alone', () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: 'r2' });
    db.setTakes('hicks', 'r2', [{ text: 'first', toolLines: [], ts: 4, expression: 'annoyed' }], 0);
    // What the relay's openExisting leaves for a new take: an emptied, streaming reply.
    db.updateMessage('hicks', 'r2', { text: '', toolLines: [], status: 'streaming', expression: undefined });
    control.set('happy', 'hicks', 'agent');
    expect(db.getMessage('hicks', 'r2')).toMatchObject({ text: '', status: 'streaming', expression: 'happy' });
    expect(db.getTakes('hicks', 'r2')!.takes).toEqual([{ text: 'first', toolLines: [], ts: 4, expression: 'annoyed' }]);
    expect(events).toEqual([{ type: 'message', message: db.getMessage('hicks', 'r2')! }]);
  });

  it('a second call wins; neutral clears it', () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: 'r2' });
    control.set('happy', 'hicks', 'agent');
    expect(control.set('annoyed', 'hicks', 'agent')).toEqual({ ok: true, text: 'expression: annoyed' });
    expect(db.getMessage('hicks', 'r2')!.expression).toBe('annoyed');
    expect(control.set('neutral', 'hicks', 'agent')).toEqual({ ok: true, text: 'expression: neutral' });
    expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
    expect('expression' in db.getMessage('hicks', 'r2')!).toBe(false);
    expect(events).toHaveLength(3);
  });

  it('idle, neutral on a reply with takes clears the shown take too', () => {
    const { db, control } = setup({ busy: false, activeMessageId: null });
    db.setTakes('hicks', 'r2', [{ text: 'first', toolLines: [], ts: 4 }, { text: 'second', toolLines: [], ts: 5 }], 1);
    control.set('happy', 'hicks', 'dev');
    control.set('neutral', 'hicks', 'dev');
    expect(db.getTakes('hicks', 'r2')!.takes[1]).toEqual({ text: 'second', toolLines: [], ts: 5 });
    expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
  });

  it('idle: sets her latest reply', () => {
    const { db, events, control } = setup({ busy: false, activeMessageId: null });
    db.insertMessage('hicks', msg('u3', 'user', 5));
    expect(control.set('annoyed', 'hicks', 'dev')).toEqual({ ok: true, text: 'expression: annoyed' });
    expect(db.getMessage('hicks', 'r2')!.expression).toBe('annoyed');
    expect(db.getMessage('hicks', 'r1')!.expression).toBeUndefined();
    expect(events).toEqual([{ type: 'message', message: db.getMessage('hicks', 'r2')! }]);
  });

  it("set_expression from her turn (ctx.player() is the active pair) applies to that pair's latest reply", () => {
    const db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
    openDbs.push(db);
    db.insertMessage('hicks', msg('h1', 'agent', 1));
    db.insertMessage('cass', msg('c1', 'agent', 2));
    db.insertMessage('hicks', msg('h2', 'agent', 3));
    const events: { e: ServerEvent; player?: string }[] = [];
    let activePlayer = 'cass';
    const control = createExpressionControl({
      names: ['happy'],
      db,
      relay: () => ({ busy: false, activeMessageId: null, activePlayer }),
      emit: (e, player) => events.push({ e, player }),
    });
    expect(control.set('happy', activePlayer, 'agent')).toEqual({ ok: true, text: 'expression: happy' });
    expect(db.getMessage('cass', 'c1')!.expression).toBe('happy');
    expect(db.getMessage('hicks', 'h2')!.expression).toBeUndefined();
    expect(events).toEqual([{ e: { type: 'message', message: db.getMessage('cass', 'c1')! }, player: 'cass' }]);
    activePlayer = 'hicks';
    control.set('happy', activePlayer, 'agent');
    expect(db.getMessage('hicks', 'h2')!.expression).toBe('happy');
    expect(db.getMessage('hicks', 'h1')!.expression).toBeUndefined();
  });

  it('during a turn: the reply in progress belongs to the active pair', () => {
    const db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
    openDbs.push(db);
    db.insertMessage('cass', msg('c1', 'agent', 2, { status: 'streaming' }));
    const control = createExpressionControl({ names: ['happy'], db, relay: () => ({ busy: true, activeMessageId: 'c1', activePlayer: 'cass' }), emit: () => {} });
    expect(control.set('happy', 'cass', 'agent')).toEqual({ ok: true, text: 'expression: happy' });
    expect(db.getMessage('cass', 'c1')!.expression).toBe('happy');
  });

  it("the dev panel's set_expression uses the tab's player (ctx.player()), not the relay's last pair", () => {
    const db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
    openDbs.push(db);
    db.insertMessage('hicks', msg('h1', 'agent', 1));
    db.insertMessage('cass', msg('c1', 'agent', 2)); // Cass has the latest reply, and was the last turn
    const events: { e: ServerEvent; player?: string }[] = [];
    const control = createExpressionControl({
      names: ['happy'],
      db,
      relay: () => ({ busy: false, activeMessageId: null, activePlayer: 'cass' }),
      emit: (e, player) => events.push({ e, player }),
    });
    const ctx: ToolContext = { room: new Room(registry), journal: new Journal(db), player: () => 'hicks', expressions: control };
    expect(dispatchTool(ctx, 'set_expression', { name: 'happy' }, 'dev')).toEqual({ ok: true, text: 'expression: happy' });
    expect(db.getMessage('hicks', 'h1')!.expression).toBe('happy');
    expect(db.getMessage('cass', 'c1')!.expression).toBeUndefined();
    expect(events).toEqual([{ e: { type: 'message', message: db.getMessage('hicks', 'h1')! }, player: 'hicks' }]);
  });

  it("while another pair's turn runs, the dev panel's set_expression is refused and nothing changes", () => {
    const db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
    openDbs.push(db);
    db.insertMessage('hicks', msg('h1', 'agent', 1));
    db.insertMessage('cass', msg('c1', 'agent', 2, { status: 'streaming' }));
    const events: ServerEvent[] = [];
    const control = createExpressionControl({ names: ['happy'], db, relay: () => ({ busy: true, activeMessageId: 'c1', activePlayer: 'cass' }), emit: (e) => events.push(e) });
    expect(control.set('happy', 'hicks', 'dev')).toEqual({ ok: false, error: "your reply hasn't started yet" });
    expect(db.getMessage('hicks', 'h1')!.expression).toBeUndefined();
    expect(db.getMessage('cass', 'c1')!.expression).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('idle with no reply of hers yet → error, nothing emitted', () => {
    const db = openDb(path.join(tmpDir, `room-${n++}.db`), { defaultPlayer: 'hicks' });
    openDbs.push(db);
    db.insertMessage('hicks', msg('u1', 'user', 1));
    const events: ServerEvent[] = [];
    const control = createExpressionControl({ names: ['happy'], db, relay: () => ({ busy: false, activeMessageId: null, activePlayer: 'hicks' }), emit: (e) => events.push(e) });
    expect(control.set('happy', 'hicks', 'dev')).toEqual({ ok: false, error: 'you have no reply to change yet' });
    expect(events).toEqual([]);
  });

  it("busy before her reply has opened → error, her previous reply untouched (Review Focus 1)", () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: null });
    expect(control.set('happy', 'hicks', 'agent')).toEqual({ ok: false, error: "your reply hasn't started yet" });
    for (const m of db.allMessages('hicks')) expect(m.expression).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('an unknown name → error listing neutral and hers, in order', () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: 'r2' });
    expect(control.set('smug', 'hicks', 'agent')).toEqual({ ok: false, error: "no expression 'smug'; yours are: neutral, happy, annoyed" });
    expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
    expect(events).toEqual([]);
  });
});

describe('a resident face control', () => {
  function residentSetup(state: { busy: boolean; activeMessageId: string | null }) {
    const base = setup(state);
    const control = createExpressionControl({
      names: ['happy', 'concerned'],
      db: base.db,
      relay: () => ({ activePlayer: 'hicks', ...state }),
      emit: (e) => base.events.push(e),
      field: { other: 'hae' },
    });
    return { ...base, control };
  }

  it('during a turn sets only her entry in othersExpressions on the reply in progress', () => {
    const { db, control } = residentSetup({ busy: true, activeMessageId: 'r2' });
    expect(control.set('concerned', 'hicks', 'agent')).toEqual({ ok: true, text: 'expression: concerned' });
    expect(db.getMessage('hicks', 'r2')).toMatchObject({ othersExpressions: { hae: 'concerned' } });
    expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
  });

  it("idle, the shown take keeps her face too; neutral clears it", () => {
    const { db, control } = residentSetup({ busy: false, activeMessageId: null });
    db.updateMessage('hicks', 'r2', { status: 'ok' });
    db.setTakes('hicks', 'r2', [{ text: 'first', toolLines: [], ts: 4 }, { text: 'second', toolLines: [], ts: 5 }], 1);
    control.set('happy', 'hicks', 'dev');
    expect(db.getTakes('hicks', 'r2')!.takes[1].othersExpressions?.hae).toBe('happy');
    expect(db.getTakes('hicks', 'r2')!.takes[0].othersExpressions).toBeUndefined();
    control.set('neutral', 'hicks', 'dev');
    expect(db.getMessage('hicks', 'r2')!.othersExpressions).toBeUndefined();
    expect(db.getTakes('hicks', 'r2')!.takes[1].othersExpressions).toBeUndefined();
  });

  it("sets one person's face and leaves the others' and the contact's alone", () => {
    const { db, control } = residentSetup({ busy: true, activeMessageId: 'r2' });
    db.updateMessage('hicks', 'r2', { expression: 'happy', othersExpressions: { silas: 'annoyed' } });
    control.set('concerned', 'hicks', 'agent');
    expect(db.getMessage('hicks', 'r2')).toMatchObject({ expression: 'happy', othersExpressions: { silas: 'annoyed', hae: 'concerned' } });
    control.set('neutral', 'hicks', 'agent');
    expect(db.getMessage('hicks', 'r2')!.othersExpressions).toEqual({ silas: 'annoyed' });
  });

  it('the last face cleared leaves no map at all', () => {
    const { db, control } = residentSetup({ busy: true, activeMessageId: 'r2' });
    control.set('happy', 'hicks', 'agent');
    control.set('neutral', 'hicks', 'agent');
    expect('othersExpressions' in db.getMessage('hicks', 'r2')!).toBe(false);
  });

  it('an unknown name lists hers', () => {
    const { control } = residentSetup({ busy: true, activeMessageId: 'r2' });
    expect(control.set('angry', 'hicks', 'agent')).toEqual({ ok: false, error: "no expression 'angry'; yours are: neutral, happy, concerned" });
  });
});

describe('set_expression tool', () => {
  const baseCtx = (expressions: ToolContext['expressions']): ToolContext => ({
    room: new Room(registry),
    journal: new Journal(openDb(':memory:', { defaultPlayer: 'hicks' })),
    player: () => 'hicks',
    expressions,
  });

  it('is offered only to a character with expressions, described with her names', () => {
    expect(toolsFor(baseCtx(null)).map((t) => t.name)).not.toContain('set_expression');
    const { control } = setup({ busy: true, activeMessageId: 'r2' });
    const tool = toolsFor(baseCtx(control)).find((t) => t.name === 'set_expression')!;
    expect(tool).toBeDefined();
    expect(tool.readOnly).toBe(false);
    expect(tool.description).toBe('Change your facial expression on the stage for this reply. Names: neutral, happy, annoyed. It lasts until your next reply, which starts neutral.');
  });

  it('without expressions, dispatching it answers as an unknown tool', () => {
    const ctx = baseCtx(null);
    const result = dispatchTool(ctx, 'set_expression', { name: 'happy' }, 'agent');
    const names = toolsFor(ctx, { agent: true }).map((t) => t.name).join(', ');
    expect(result).toEqual({ ok: false, error: `unknown tool 'set_expression'; available: ${names}` });
    expect(names).not.toContain('set_expression');
  });

  describe('with a resident at the place', () => {
    const withResident = (contact: ToolContext['expressions']) => {
      const { db, events } = setup({ busy: true, activeMessageId: 'r2' });
      const hae = createExpressionControl({ names: ['happy'], db, relay: () => ({ activePlayer: 'hicks', busy: true, activeMessageId: 'r2' }), emit: (e) => events.push(e), field: { other: 'hae' } });
      const ctx: ToolContext = { ...baseCtx(contact), others: () => [{ id: 'hae', name: 'Hae', expressions: hae }] };
      return { db, ctx };
    };

    it('a contact without faces is still offered set_expression, for hers', () => {
      const { ctx } = withResident(null);
      const tool = toolsFor(ctx).find((t) => t.name === 'set_expression')!;
      expect(tool).toBeDefined();
      expect(tool.description).toContain('who: "hae"');
      expect(tool.description).toContain('happy');
    });

    it('who: "hae" sets her face, not the contact\'s', () => {
      const { db, ctx } = withResident(null);
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'hae' }, 'agent')).toEqual({ ok: true, text: 'expression: happy' });
      expect(db.getMessage('hicks', 'r2')).toMatchObject({ othersExpressions: { hae: 'happy' } });
      expect(db.getMessage('hicks', 'r2')!.expression).toBeUndefined();
    });

    it('someone else as who, or no who for a contact without faces, is an error', () => {
      const { ctx } = withResident(null);
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'cass' }, 'agent')).toMatchObject({ ok: false });
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy' }, 'agent')).toEqual({ ok: false, error: 'you have no expressions of your own' });
    });

    it('who is matched without case, and the contact naming herself sets her own face', () => {
      const { db, events } = setup({ busy: true, activeMessageId: 'r2' });
      const relay = () => ({ activePlayer: 'hicks', busy: true, activeMessageId: 'r2' });
      const own = createExpressionControl({ names: ['happy'], db, relay, emit: (e) => events.push(e) });
      const hae = createExpressionControl({ names: ['happy'], db, relay, emit: (e) => events.push(e), field: { other: 'hae' } });
      const ctx: ToolContext = { ...baseCtx(own), self: ['nix', 'Nix'], others: () => [{ id: 'hae', name: 'Hae', expressions: hae }] };
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'Hae' }, 'agent')).toMatchObject({ ok: true });
      expect(db.getMessage('hicks', 'r2')!.othersExpressions?.hae).toBe('happy');
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'NIX' }, 'agent')).toMatchObject({ ok: true });
      expect(db.getMessage('hicks', 'r2')!.expression).toBe('happy');
    });

    it('someone not here gets told who is', () => {
      const { ctx } = withResident(null);
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'cass' }, 'agent')).toEqual({
        ok: false,
        error: "no one called 'cass' is here; who: \"hae\" is for Hae's face, and leaving who out is for yours",
      });
    });

    it('two people here: each by id, both listed in the description and in the error', () => {
      const { db, events } = setup({ busy: true, activeMessageId: 'r2' });
      const relay = () => ({ activePlayer: 'hicks', busy: true, activeMessageId: 'r2' });
      const hae = createExpressionControl({ names: ['happy'], db, relay, emit: (e) => events.push(e), field: { other: 'hae' } });
      const silas = createExpressionControl({ names: ['annoyed'], db, relay, emit: (e) => events.push(e), field: { other: 'silas' } });
      const ctx: ToolContext = { ...baseCtx(null), others: () => [{ id: 'hae', name: 'Hae', expressions: hae }, { id: 'silas', name: 'Silas', expressions: silas }] };
      const tool = toolsFor(ctx).find((t) => t.name === 'set_expression')!;
      expect(tool.description).toContain('who: "hae"');
      expect(tool.description).toContain('who: "silas"');
      expect(tool.description).toContain('annoyed');
      expect(dispatchTool(ctx, 'set_expression', { name: 'annoyed', who: 'silas' }, 'agent')).toMatchObject({ ok: true });
      expect(db.getMessage('hicks', 'r2')!.othersExpressions).toEqual({ silas: 'annoyed' });
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'nobody' }, 'agent')).toEqual({
        ok: false,
        error: "no one called 'nobody' is here; who: \"hae\" is for Hae's face, who: \"silas\" is for Silas's face, and leaving who out is for yours",
      });
    });

    it('with no one else here, who is an error', () => {
      const { control } = setup({ busy: true, activeMessageId: 'r2' });
      const ctx: ToolContext = { ...baseCtx(control), others: () => [] };
      expect(dispatchTool(ctx, 'set_expression', { name: 'happy', who: 'hae' }, 'agent')).toEqual({ ok: false, error: "no one called 'hae' is here" });
    });
  });

  it('with expressions, dispatching it sets her face and emits no tool line', () => {
    const { db, events, control } = setup({ busy: true, activeMessageId: 'r2' });
    const result = dispatchTool(baseCtx(control), 'set_expression', { name: 'happy' }, 'agent');
    expect(result).toEqual({ ok: true, text: 'expression: happy' });
    expect(db.getMessage('hicks', 'r2')!.expression).toBe('happy');
    expect(events.map((e) => e.type)).toEqual(['message']);
    expect(dispatchTool(baseCtx(control), 'set_expression', {}, 'agent')).toMatchObject({ ok: false });
  });
});
