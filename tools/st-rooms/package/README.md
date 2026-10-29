<p align="center">
  <img src="https://raw.githubusercontent.com/johdavken/lowlight/main/docs/readme/banner.jpg" alt="Lowlight: Nix leaning on a wet alley wall above the harbour" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/SillyTavern-extension-6fe7ef?style=for-the-badge&labelColor=0b0614" alt="SillyTavern extension">
  <img src="https://img.shields.io/badge/models-OpenRouter-ffb347?style=for-the-badge&labelColor=0b0614" alt="models via OpenRouter">
  <img src="https://img.shields.io/badge/tool%20calling-recommended-b48cff?style=for-the-badge&labelColor=0b0614" alt="tool calling recommended">
  <img src="https://img.shields.io/badge/code-GPL--3.0-ff2d75?style=for-the-badge&labelColor=0b0614" alt="code GPL-3.0">
</p>

<p align="center"><b>Lowlight for SillyTavern: a roleplaying cyberpunk city, in your chat.</b></p>

**Lowlight** is a rain-soaked port city of wet streets, neon, and people with lives of their own. This
extension brings its world into SillyTavern:

- **The live rooms** behind your chat: lights, glow, rain on the glass, steam, passing cars, and lightning.
- **The cast:** characters and personas, each with their own sprites, and the city's lore book.
- **The city map.**
- **The rooms' songs.**
- **Lowlight's look.**

Your contact can change the room as you talk: the mood, the weather, the lights, or walking you both somewhere else.

<p align="center">
  <img src="https://raw.githubusercontent.com/johdavken/lowlight/main/docs/readme/st-select.webp" alt="The select screen in SillyTavern: you play Hicks, you call Nix, each with their file" width="100%">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/johdavken/lowlight/main/docs/readme/st-room.webp" alt="The Lowlight Intake behind the chat, rain on the window, Nix's greeting" width="49%">
  <img src="https://raw.githubusercontent.com/johdavken/lowlight/main/docs/readme/st-map.webp" alt="The rendered city map at night, open on Karasu" width="49%">
</p>

## What's in it

**15 characters.** Ten you can talk to or play as, each also a persona: Nix, Cass, Ember, Silas, Hicks, Ines,
Mother Rot, Soren, Adebayo and Rue. Five more to talk to: Hae, Tilly, Vesna, Garro and Oksana.

**34 rooms,** district by district:

| District | Rooms |
| --- | --- |
| Karasu (Old Town and the Ribbon) | Lowlight Intake, the Intake Back Alley, Nix's Apartment, Nix's Walk-up, the Noodle Stall, the Tilt, Second Socket, Public Landing, Ribbon Rooftop, the Sixth Floor, the Dead Blocks, the Open Hand, Cass's Apartment, Hicks's room, Hicks's walkway, the twins' place |
| The Spine | Oksana's, Rue's hab, Soren's hab, the Long Haul, the catwalk, the deck market, the listening post |
| Nexus | The sixty-first floor |
| Velvet | Glass Orchid, an Orchid Room, the Bathhouse, Under the Cat |
| The Strand | The Breakwater, the Low Roller, the Old Pier |
| Tidal Isle | The Ferry Stairs |
| The Marsh | The Counting House |
| Drownworks | Pump House Nine |

**The city map:** Lowlight rendered at night, every district named, with GO to walk you both there.

**The lore book:** 93 entries on the city, its districts and its people.

## The full game

This extension is the city and its people. **[Lowlight](https://github.com/johdavken/lowlight)** itself
adds the rest: missions, jobs, quests, a crew and the city's clock. Download the builds
for Windows and Linux from [itch.io](https://lowlightgame.itch.io/lowlight) or
[GitHub Releases](https://github.com/johdavken/lowlight/releases), or run it from its open-source repository.

## Install

1. In SillyTavern, open **Extensions → Install extension**.
2. Paste `https://github.com/johdavken/lowlight-sillytavern` and install.
3. Reload. Lowlight asks once whether to install its cast (characters, personas and the lore book). Say **Y**.

To update, use **Extensions → Manage extensions → Update**. New characters install by themselves.

## Settings it needs

- **API:** Chat Completion → OpenRouter, with a model that supports tool calling. GLM (`z-ai/glm-5.2`) is what Lowlight is tuned on. On a Text Completion backend the rooms, sound and cast all work, but your contact can't change the room.
- **Enable function calling** (AI Response Configuration). The welcome switches it on for you. Without it the rooms still render, but your contact can't change them.
- **Context size of 16k tokens or more; 32k is better** (same panel). SillyTavern's default of 4,095 leaves no room for the conversation once the card and lore are in, so your contact would answer with no memory of the chat. If yours is still at that default, the welcome raises it to 32k; a size you set yourself is left alone. Both settings are SillyTavern's own, so they apply to all your chats.

## Keys

- **Alt+M** opens the city map; GO walks you both there.
- **Alt+Y** opens your persona, **Alt+P** the characters.
- **SYS** (top right): sound levels, every SillyTavern panel, CAST, HER ROOM TOOLS, and LOOK.
- `/select` opens the character select, `/room <name>` and `/mood <name>` change the room, and `/lowchat` switches between Lowlight's look and SillyTavern's own.

## Licenses

- **Code:** GPL-3.0-or-later (`LICENSE`). The source is Lowlight's open-source repository: https://github.com/johdavken/lowlight
- **Lowlight's writing, art and songs:** CC BY-NC-SA 4.0 (`CONTENT-LICENSE`). Share and remix them for free, with credit, but not commercially.
- **Third-party parts:** see `CREDITS.md` and `THIRD-PARTY-LICENSES.md`.

The lore book (`Lowlight`) is replaced on updates, so copy it if you want to edit it.
