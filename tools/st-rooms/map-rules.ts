// The map's rules from the game's stylesheet, for the extension (tools/st-rooms/build.ts).

/** The game stylesheet's Map section (to the next section heading), with the game's variables it reads. */
export function mapRules(css: string): string {
  const start = css.indexOf('/* ───────────────────────── Map ');
  if (start < 0) throw new Error("style.css has no Map section");
  const next = css.indexOf('/* ─────────────────────────', start + 10);
  const vars = ".map-root {\n  --agent: #ff4f8b;\n  --alert: #ff3b5c;\n  --edge-x: 64px;\n  --mono: 'IBM Plex Mono', ui-monospace, monospace;\n  --pixel: 'VT323', ui-monospace, monospace;\n}\n";
  return `/* Copied from web/src/ui/style.css by tools/st-rooms/build.ts. */\n${vars}\n${css.slice(start, next < 0 ? undefined : next)}`;
}
