/**
 * The Residual owns her bookkeeping (scribe spec §1): none of the six tools is offered to her, none runs
 * when she calls it anyway, and no prompt she reads names one. The dev panel can still fire them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { dispatchTool, RESIDUAL_TOOLS, toolsFor, type ToolContext } from '../src/tools';
import { runToolCall } from '../src/direct-tools';
import { END_SCENE_INSTRUCTIONS, GREET_INSTRUCTIONS, LEAVE_INSTRUCTIONS, ROOM_INSTRUCTIONS, SCENE_GREET_INSTRUCTIONS, roomInstructions } from '../src/instructions';
import { DEFAULT_SHARED_STANDING, standingBlock } from '../../shared/standing';
import { pageLine } from '../src/journal';

const SIX = ['note', 'forget', 'read_notes', 'update_dossier', 'set_recap', 'shift_standing'];

function ctx(): ToolContext {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  db.insertMessage('hicks', { id: 'r1', role: 'agent', text: 'x', toolLines: [], ts: 1, status: 'ok' });
  return { room: {} as Room, journal: new Journal(db), player: () => 'hicks', expressions: null, replyId: () => 'r1' } as unknown as ToolContext;
}

describe('her bookkeeping belongs to the Residual', () => {
  it('RESIDUAL_TOOLS names the six', () => {
    expect([...RESIDUAL_TOOLS].sort()).toEqual([...SIX].sort());
  });

  it('her toolset has none of the six', () => {
    const names = toolsFor(ctx(), { agent: true }).map((t) => t.name);
    for (const t of SIX) expect(names).not.toContain(t);
    expect(names).toContain('set_light');
  });

  it('her model calling one anyway is refused; the dev panel (also acting as her) still runs it', () => {
    const c = ctx();
    expect(runToolCall(c, { name: 'note', args: '{"text":"x"}' })).toMatch(/^error: unknown tool 'note'/);
    expect(c.journal.notes('hicks')).toEqual([]);
    expect(dispatchTool(c, 'note', { text: 'x' }, 'agent').ok).toBe(true);
    expect(dispatchTool(c, 'note', { text: 'y' }, 'dev').ok).toBe(true);
  });

  it('the room note no longer says the message begins with the room line (blocks come first now; final review M5)', () => {
    const nixFile = fs.readFileSync(path.join(__dirname, '../../characters/nix/instructions.md'), 'utf8');
    for (const t of [ROOM_INSTRUCTIONS, roomInstructions('Cass'), nixFile]) expect(t).not.toMatch(/begins with a \[room/);
  });

  it('no prompt she reads names one', () => {
    const nixFile = fs.readFileSync(path.join(__dirname, '../../characters/nix/instructions.md'), 'utf8');
    const texts = [
      ROOM_INSTRUCTIONS,
      roomInstructions('Cass'),
      END_SCENE_INSTRUCTIONS,
      LEAVE_INSTRUCTIONS,
      GREET_INSTRUCTIONS,
      SCENE_GREET_INSTRUCTIONS,
      nixFile,
      pageLine('Hicks', null),
      standingBlock({ player: 'Hicks', values: { trust: 0, warmth: 0 }, cfg: null, shared: DEFAULT_SHARED_STANDING }),
    ];
    // `note` is also a plain word: only its tool uses count.
    for (const text of texts) for (const t of SIX.filter((x) => x !== 'note')) expect(text).not.toMatch(new RegExp(`\\b${t}\\b`));
    for (const text of texts) expect(text).not.toMatch(/\b(with|call|use) note\b|\bnote \(about|\bnote with id\b/);
  });
});
