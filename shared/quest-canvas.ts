/**
 * A quest as an Obsidian Canvas board (`.canvas`, JSON Canvas 1.0): a card per beat version and per
 * outcome, arrows for choices (labelled with their line and tags), waits on the arrow to the next beat,
 * and the missed path as its own arrow. Laid out left to right by distance from the first beat.
 * Pure: the `quest-canvas` tool writes it into the vault. Never for a quest the author plays blind.
 */
import { condText, tagText, waitText, type QuestEntry } from './quests';

export interface CanvasNode {
  id: string;
  type: 'text' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  label?: string;
  color?: string;
}
export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'right';
  toNode: string;
  toSide: 'left';
  label?: string;
  color?: string;
}
export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const COL = 480;
const GAP = 60;
const PAD = 30;
const BEAT_W = 400;
const OUTCOME_W = 360;
/** Canvas preset colours: 2 orange (waits), 4 green (endings), 5 cyan (beats), 6 purple (missed paths). */
const C = { wait: '2', end: '4', beat: '5', missed: '6' } as const;

/** A card's height for its text: about 48 characters a line, 24px a line. */
const heightOf = (text: string, width: number) => {
  const per = Math.floor(width / 8.3);
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
  return 40 + lines * 24;
};

export function questCanvas(q: QuestEntry): Canvas {
  const beatKey = (id: string) => (q.beats.get(id)!.length > 1 ? `group:${id}` : `beat:${id}:0`);
  const missedTargets = new Set([...q.outcomes.values()].flatMap((o) => (o.wait?.else ? [o.wait.else] : [])));

  // Distance from the first beat: a beat's choices to their outcomes, an outcome to its beat and its missed path.
  const next = (id: string): string[] => {
    const vs = q.beats.get(id);
    if (vs) return [...new Set(vs.flatMap((b) => b.choices.map((c) => c.to)))];
    const o = q.outcomes.get(id);
    if (!o) return [];
    return [...(o.to !== 'end' ? [o.to] : []), ...(o.wait?.else ? [o.wait.else] : [])];
  };
  // Columns by the longest path from the first beat, so every arrow runs left to right; capped at the
  // node count, so a loop (allowed through a choice) can't push forever.
  const depth = new Map<string, number>([[q.first, 0]]);
  const order = [q.first];
  for (let i = 0; i < order.length; i++) for (const t of next(order[i])) if (!order.includes(t)) order.push(t);
  const cap = order.length;
  for (let changed = true, pass = 0; changed && pass < cap; pass++) {
    changed = false;
    for (const id of order) {
      const d = depth.get(id);
      if (d === undefined) continue;
      for (const t of next(id)) {
        if (d + 1 > (depth.get(t) ?? -1) && d + 1 <= cap) {
          depth.set(t, d + 1);
          changed = true;
        }
      }
    }
  }
  order.sort((x, y) => depth.get(x)! - depth.get(y)!);

  const nodes: CanvasNode[] = [];
  const colY = new Map<number, number>();
  const place = (d: number, height: number) => {
    const y = colY.get(d) ?? 0;
    colY.set(d, y + height + GAP);
    return { x: d * COL, y };
  };

  for (const id of order) {
    const d = depth.get(id)!;
    const vs = q.beats.get(id);
    if (vs) {
      const cards = vs.map((b, i) => {
        const head = `### # ${b.id}${b.when ? ` if ${b.when.map(condText).join(' and ')}` : ''}`;
        const text = [head, b.stranger ? `*with ${b.stranger.name}*` : null, b.text].filter(Boolean).join('\n\n');
        return { id: `beat:${b.id}:${i}`, text, height: heightOf(text, BEAT_W) };
      });
      if (cards.length === 1) {
        const at = place(d, cards[0].height);
        nodes.push({ id: cards[0].id, type: 'text', ...at, width: BEAT_W, height: cards[0].height, text: cards[0].text, color: C.beat });
      } else {
        const h = cards.reduce((n, c) => n + c.height, 0) + GAP * (cards.length - 1) + PAD * 2;
        const at = place(d, h);
        nodes.push({ id: `group:${id}`, type: 'group', x: at.x - PAD, y: at.y, width: BEAT_W + PAD * 2, height: h, label: id });
        let y = at.y + PAD;
        for (const c of cards) {
          nodes.push({ id: c.id, type: 'text', x: at.x, y, width: BEAT_W, height: c.height, text: c.text, color: C.beat });
          y += c.height + GAP;
        }
      }
    } else {
      const o = q.outcomes.get(id)!;
      const text = [`### ## ${o.id}`, o.text, o.to === 'end' ? '→ **end**' : null, o.next ? `*next: ${o.next}*` : null].filter(Boolean).join('\n\n');
      const height = heightOf(text, OUTCOME_W);
      const at = place(d, height);
      const color = missedTargets.has(id) ? C.missed : o.to === 'end' ? C.end : undefined;
      nodes.push({ id: `outcome:${id}`, type: 'text', ...at, width: OUTCOME_W, height, text, ...(color ? { color } : {}) });
    }
  }

  const edges: CanvasEdge[] = [];
  const edge = (from: string, to: string, label?: string, color?: string) =>
    edges.push({ id: `e${edges.length}`, fromNode: from, fromSide: 'right', toNode: to, toSide: 'left', ...(label ? { label } : {}), ...(color ? { color } : {}) });
  for (const [id, vs] of q.beats)
    vs.forEach((b, i) => {
      for (const c of b.choices) edge(`beat:${id}:${i}`, `outcome:${c.to}`, [c.line, ...(c.tags.length ? [`[${c.tags.map(tagText).join(', ')}]`] : [])].join(' '));
    });
  for (const o of q.outcomes.values()) {
    const target = (id: string) => (q.beats.has(id) ? beatKey(id) : `outcome:${id}`);
    if (o.to !== 'end') o.wait ? edge(`outcome:${o.id}`, target(o.to), `wait ${waitText(o.wait).split(' → ')[0]}`, C.wait) : edge(`outcome:${o.id}`, target(o.to));
    if (o.wait?.else && o.wait.by) {
      const by = waitText({ ...o.wait, until: null, after: null, at: null, ready: false, else: null }).replace(/^by /, '');
      edge(`outcome:${o.id}`, target(o.wait.else), `missed (by ${by})`, C.missed);
    }
  }
  return { nodes, edges };
}
