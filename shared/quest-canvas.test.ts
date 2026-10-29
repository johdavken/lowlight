import { describe, expect, it } from 'vitest';
import { parseQuestFile } from './quests';
import { WAITS } from './quests.fixture';
import { questCanvas, type Canvas } from './quest-canvas';

const parsed = parseQuestFile('paper-trail', WAITS, { roster: null, places: null });
if (!parsed.ok) throw new Error('fixture');
const c: Canvas = questCanvas(parsed.entry);
const node = (id: string) => c.nodes.find((n) => n.id === id)!;
const inside = (a: { x: number; y: number; width: number; height: number }, g: typeof a) => a.x >= g.x && a.y >= g.y && a.x + a.width <= g.x + g.width && a.y + a.height <= g.y + g.height;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('questCanvas (an Obsidian board of a quest)', () => {
  it('a card per beat version and per outcome, holding its words', () => {
    expect(node('beat:sentinel:0').text).toContain('# sentinel');
    expect(node('beat:sentinel:0').text).toContain('*Boots on the stairs.*');
    expect(node('beat:sentinel:0').text).toContain('Arlo Venn');
    expect(node('outcome:given').text).toContain('He thanks you like he means it.');
    expect(node('beat:return:0').text).toContain('# return if ledger=given');
  });
  it("a beat's versions sit in a group named for it", () => {
    const g = node('group:return');
    expect(g).toMatchObject({ type: 'group', label: 'return' });
    expect(inside(node('beat:return:0'), g)).toBe(true);
    expect(inside(node('beat:return:1'), g)).toBe(true);
  });
  it('choices are arrows labelled with their line and tags', () => {
    const e = c.edges.find((x) => x.fromNode === 'beat:sentinel:0' && x.toNode === 'outcome:given')!;
    expect(e.label).toBe('Hand it over. [set ledger=given]');
  });
  it('a wait labels the arrow on to its beat; the missed path is its own coloured arrow', () => {
    const w = c.edges.find((x) => x.fromNode === 'outcome:given' && x.toNode === 'group:return')!;
    expect(w.label).toBe('wait until 06:00 · at lowlight-intake · by 12:00');
    expect(w.color).toBe('2');
    const m = c.edges.find((x) => x.fromNode === 'outcome:given' && x.toNode === 'outcome:gone')!;
    expect(m).toMatchObject({ label: 'missed (by 12:00)', color: '6' });
  });
  it('endings are green, beats cyan; nothing overlaps; ids are unique', () => {
    expect(node('outcome:faced').color).toBe('4');
    expect(node('beat:sentinel:0').color).toBe('5');
    const cards = c.nodes.filter((n) => n.type !== 'group');
    for (const a of cards) for (const b of cards) if (a !== b) expect(overlap(a, b), `${a.id} / ${b.id}`).toBe(false);
    expect(new Set(c.nodes.map((n) => n.id)).size).toBe(c.nodes.length);
    expect(new Set(c.edges.map((e) => e.id)).size).toBe(c.edges.length);
  });
  it('reads left to right: the first beat first, the story after it', () => {
    expect(node('beat:sentinel:0').x).toBeLessThan(node('outcome:given').x);
    expect(node('outcome:given').x).toBeLessThan(node('group:return').x);
  });
  it('every arrow runs left to right: a beat comes after everything that leads to it, even reached by a longer path', () => {
    const LONG = `---
title: Long
starts: x
---

# a
*A.*

view any: v

- short: Short. → s
- long: Long. → l

## s
*S.*
→ c

## l
*L.*
→ b

# b
*B.*

view any: v

- on: On. → o
- off: Off. → o

## o
*O.*
→ c

# c
*C.*

view any: v

- end: End. → e
- end2: End too. → e

## e
*E.*
→ end
`;
    const r = parseQuestFile('long', LONG, { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const k = questCanvas(r.entry);
    const at = (id: string) => k.nodes.find((n) => n.id === id)!.x;
    for (const e of k.edges) expect(at(e.toNode), `${e.fromNode} → ${e.toNode}`).toBeGreaterThan(at(e.fromNode));
  });
});
