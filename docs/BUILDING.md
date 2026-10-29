# Building Lowlight

This repository is an export of Lowlight's private working repo, refreshed on every push. Bug reports and ideas are welcome as Issues. Pull requests can't be merged here.

## Requirements

- **Node.js 24 or newer** (`engines` in `package.json`). The server uses `node:sqlite`.
- An **OpenRouter key** to play. You enter it on the select screen, and it's kept in `data/settings.json`.
- **Optional:** Wine, to package the Windows build on Linux. Blender, to render the city map (see below).

## Quick start

```bash
npm ci
npm run dev
```

Then open http://localhost:5173. The game server runs on port 7700 behind Vite.

To run the built game from one server instead:

```bash
npm run build
npm start
```

## Desktop app

```bash
npm run build:desktop
npm run stage
npm run desktop
```

- `npm run stage` copies the content `release.json` names into `build/stage/content`.
- `npm run package:linux` (AppImage) and `npm run package:win` (NSIS installer and zip, through Wine) package it.

## The city map

The rendered map tiles are generated, not committed. Without them, the MAP shows the painted city instead. To render them (needs Blender; set `BLENDER` if it isn't on your PATH):

```bash
npm run map-render
```

## Tests

```bash
npm run typecheck
npm test
npm run e2e
```

`npm run e2e` starts its own game servers and needs WebGL: a GPU, or software rendering with one worker. `E2E_PORT_OFFSET=200` moves every port if something else is already using them.

## Where your saves live

- `npm run dev` and `npm start`: in `data/` (playthroughs, settings, bug reports). It's git-ignored.
- The desktop app: in the app's user data folder.

## Why some sounds are silent

The official builds on itch.io use some licensed sound effects for the menus and the minigames, whose licenses allow them inside a finished game but not as files in a public repository. This repository leaves them out, and the game skips them quietly. Every sound's source and license is listed in `sounds/CREDITS.md`.
