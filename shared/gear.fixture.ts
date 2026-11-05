/** Deck catalog samples for tests (missions spec §1). */
export const SAMPLE = `---
id: meridian
name: Cortex Meridian
quality: 3
heat: 2
traits: []
---
---
id: stall-build
name: Stall build
quality: 2
heat: 0
traits: [fragile]
---
---
id: pocket-deck
name: Pocket deck
quality: 1
heat: 0
traits: [hidden]
---
`;

export const block = (over: Record<string, string>) => {
  const f = { id: 'x', name: 'X', quality: '1', heat: '0', traits: '[]', ...over };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
};
