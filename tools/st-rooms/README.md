# Lowlight Rooms for SillyTavern

A SillyTavern extension that draws Lowlight's live rooms (lights, glow, glass rain, dust, passing light) behind the chat. It was built as a test on 2026-10-22 to compare Lowlight with SillyTavern; it isn't part of the game.

```bash
npm run st-rooms                         # Intake + noodle stall
npm run st-rooms -- --rooms all          # every room in scenes/
npm run st-rooms -- --rooms the-tilt,noodle-stall --out <SillyTavern>/data/default-user/extensions/lowlight-rooms
```

Studio's PREVIEW tab runs the same build from **REBUILD SILLYTAVERN** in its Install group, under RESTART LOWLIGHT. The button shows only when the extension folder exists, so install a room, then click it.

The default `--out` is `~/Projects/SillyTavern/data/default-user/extensions/lowlight-rooms`. Reload SillyTavern after a build.

In the chat box:
- `/room <folder>` fades to another room.
- `/mood <name>` tweens to one of the room's moods, and `/mood default` goes back to the room as painted.
- `/map` or **Alt+M** (or the map icon in the top bar) opens Lowlight's city map. GO fades to that place's room, adds a one-time `[travel: …]` note to her prompt (cleared once she answers), and triggers her arrival beat, as Lowlight's travel does. Only places whose room is in the extension can be gone to. Gigs, comms, side rooms, job marks and who's where don't come along.
- **Sound** is Lowlight's room sound: the room's songs (shuffled, with pauses), its bed and timed sounds, rain following the weather, light hums, and thunder after lightning. It starts on your first click or key, because browsers block sound before a gesture. The speaker icon in the top bar mutes on click and sets the volume on scroll. `/music <0-100>` and `/ambient <0-100>` set the two levels from SYS. Levels are remembered per browser.
- **The Keys bar** (with `/lowchat` on) replaces SillyTavern's top bar, like Lowlight's HUD:
  - Left: the place, the clock and the weather.
  - Right: **YOU** (Alt+Y) opens persona management, **PEOPLE** (Alt+P) opens the characters, and **MAP** (Alt+M) opens the map. A word lights while its panel is open.
  - **SYS** holds the sound levels, every other SillyTavern panel (connection, AI settings, formatting, lore, settings, backgrounds, extensions) and the switch back to SillyTavern's look. Its light turns red when the API isn't connected.
  - SillyTavern's panels open below the bar, restyled in Lowlight's look (`panels.css`): the SYS menu's dark glass and cyan hairline, VT323 headings in spaced capitals, Plex Mono text, underlined fields, outlined buttons, pink square slider thumbs, and square corners everywhere.
- **Character select** (`/select`, SYS → SELECT, and on its own whenever no chat is open with the Lowlight look on) is Lowlight's select screen. 1P picks who you are from your personas and CPU picks your contact from the Lowlight cast (**A** switches to every SillyTavern character and back, remembered per browser), each with their file, facts and figure. //JACK IN switches persona and opens that chat. The room behind shows the skyline, then each contact's own room once the cursor rests on them, with Lowlight's menu cues. Esc steps back, and closing without jacking in puts the room back.
- `/lowchat` switches Lowlight's subtitle chat look on or off. It's on by default, and each browser remembers the choice. The look shows no frame, only the newest line over a dark scrim, Plex Mono text, pink actions and a purple underline for typing. Switch it off to see the whole log.

## The cast

```bash
npm run st-cast                 # every character, skipping cards SillyTavern already has
npm run st-cast -- --replace    # rewrite those too (your chats stay; edits to those cards don't)
```

It exports every character in `characters/` except `nix`, the old base that `nix-direct` extends:
- **Card:** their `identity.md` (or a resident's `voice.md`), one of their real greetings from your newest playthrough, Lowlight's roleplay guide as the system prompt, and the `Lowlight` lore book.
- **Avatar:** their face, cropped on the Intake's violet.
- **Expression sprites:** their faces laid onto their sprite as whole figures, mapped to SillyTavern's labels.

`cast.json` also carries each character's tagline, facts, accent and home room for the select screen (a resident's home is the scene that names them, and `nix-direct` takes these from `nix`). Everyone with a `bio.md` also becomes a persona. Their sprite goes into `User Avatars/`, and the extension adds their name and bio on its next load (`cast.json`). It never overwrites a persona you've named or edited.

## How it fits together

- **`entry.ts`:** bundles `web/src/renderer` with PixiJS into one `lowlight-room.js`, with `mountRoom(host, roomsBase)` → `load(folder)`, `mood(name)` and `moods()`.
- **`extension/`:** SillyTavern's side.
  - `manifest.json`
  - `hud.js`: the Keys bar.
  - `select.js`, `select.css`: the character select, on a 1600×900 stage scaled to the window.
  - `panels.css`: SillyTavern's panels in Lowlight's look. It's mostly SillyTavern's theme variables set inside the panels, plus its shared classes (`.menu_button`, `.text_pole`, sliders, the character and persona lists). Every rule is scoped to `body.lowlight-chat`, so `/lowchat` off gives SillyTavern's own panels back.
  - `index.js`: mounts the canvas behind the chat, stands your persona's picture on the left (`#lowlight-persona`; with `/lowchat` on, she moves to the right at Lowlight's stage positions), lights both sprites with Lowlight's figure lighting (`web/src/ui/stage-light.ts`), and registers the slash commands.
  - `style.css`
- **`build.ts`:** builds the bundle (`lowlight-room.js` and `lowlight-room.css`, with the map and its fonts), copies `extension/`, copies each room's folder (sounds included) into `rooms/` with the list in `rooms.json`, every district's songs flat into `rooms/_music/`, the rain and thunder recordings into `sound/`, and copies `map/lowlight.json` and its picture into `map/`.
- **`cast.ts`, `export-cast.ts`:** the cast export (`npm run st-cast`).
- **`map-rules.ts`:** the map's rules from the game's `web/src/ui/style.css` (its Map section), written as `map-game.css` on every build so they can't drift.

## Gotchas

- **Specificity:** the panel glass rule lists `#character_popup` inside its `:is()`, so it counts as an id. Rules meant to beat it need an id too (the side panels use `#top-settings-holder`).
- **Icon buttons:** many of SillyTavern's buttons carry the icon's `fa-*` class on the button itself. A font set on `.menu_button` turns those icons into empty boxes, so only `:not([class*='fa-'])` buttons get VT323.

- **Class names:** SillyTavern's expressions code takes over every element classed `expression-holder`, and it emptied the persona figure. The persona figure has its own class.

- **Mobile layout:** SillyTavern's mobile CSS (under 1000 px wide) puts `perspective` on `<html>`. That makes a fixed `inset: 0` box measure against a 0 px tall element, so the room's host is sized `100vw × 100dvh` instead.
- **Testing:** test in a real browser or headless Playwright. In the app's collapsed browser pane, the window is 0×0 and image decoding stalls, so rooms never load there.

## Not done

- Room state per message, so swipes and rewinds would roll the room back
- Tools for her: `apply_mood`, `set_atmosphere`, `go_to` via `registerFunctionTool`
- A `[room: …]` line in her prompt
