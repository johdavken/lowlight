/** Deck catalog samples for tests (missions spec §1). */
export const SAMPLE = `---
id: meridian
name: Cortex Meridian
bonus: 20
heat: 2
traits: []
---
---
id: stall-build
name: Stall build
bonus: 15
heat: 0
traits: [fragile]
---
---
id: pocket-deck
name: Pocket deck
bonus: 5
heat: 0
traits: [hidden]
---
`;

export const block = (over: Record<string, string>) => {
  const f = { id: 'x', name: 'X', bonus: '5', heat: '0', traits: '[]', ...over };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
};
