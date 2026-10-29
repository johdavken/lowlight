# Licensing audit

An audit of everything Lowlight ships, made on 2026-10-23 before the SillyTavern package goes public and before Lowlight itself is open-sourced. Updated 2026-10-29: ElevenLabs takes and CC0 Glitch Noises files replaced every Sonniss, Bleeoop and JDSherbert sound (8b937cff to 9257d3af), so nothing restricted ships any more, and the public repo is exported from the private one. The sources are `sounds/CREDITS.md`, the image masters in `art/`, `node_modules`, and the git history.

## Decisions (Farban, 2026-10-23)

- **Code: GPL-3.0.** This includes the renderer, map and audio code bundled into the SillyTavern extension. The license has to be in place before that package goes public.
- **Farban's own content: CC BY-NC-SA 4.0.** That's the writing (identities, bios, lore, quests, gigs), the art and the Suno songs.
- **Restricted third-party assets ship only inside official builds** (itch.io, Patreon). Public repos never carry their raw files, and those files are not offered as a separate pack, paid or free. The licenses allow shipping inside a finished game and forbid redistributing the raw files. Since 2026-10-28 no shipped file is restricted; the rule stands for anything added later.

## Summary

| What | Status | Public repo? | Notes |
|---|---|---|---|
| Code (914 `.ts` files and the rest) | Farban's | Yes, GPL-3.0 | All 125 production npm packages are GPL-3.0-compatible: MIT 84, ISC 13, OFL-1.1 11 (fonts), BlueOak 8, BSD 8, Apache-2.0 1 |
| Writing (identities, bios, voice sheets, lore, quests, gigs, briefs) | Farban's (drafts made with Claude, edited by Farban) | Yes, CC BY-NC-SA 4.0 | Anthropic's terms give the output to the user. As with the art, copyright in machine-made text isn't guaranteed. |
| Songs: 11 files from Suno | Farban's | Yes, CC BY-NC-SA 4.0 | All made on Suno's **Pro** plan, which gives commercial rights (checked 2026-10-10). Suno makes no promise that copyright vests. |
| Images: rooms, characters, map, splash, districts, papers, extras, quests | Farban's (ChatGPT) | Yes, CC BY-NC-SA 4.0 | OpenAI's terms give the output to the user, commercial use included. The shipped images have had their C2PA signature stripped by cropping and processing; the masters in `art/` mostly keep it (see below). |
| Fonts (IBM Plex Mono, VT323, Teko, Chakra Petch, Courier Prime and the rest, via `@fontsource`; Special Elite) | Free | Yes | SIL OFL 1.1; Special Elite is Apache-2.0. They're bundled from npm. |
| Sounds: 20 files from Glitch Noises (Vladislav Zharkov) | Free (CC0) | Yes | Public domain. They're credited anyway. |
| Sounds: 76 files from ElevenLabs (room beds, doors, rain, thunder, and every menu and minigame cue) | Farban's (generated) | Yes, CC BY-NC-SA 4.0 | Generated on a paid ElevenLabs Starter plan, whose terms give a commercial licence for audio made while subscribed; no third-party recording is in them. They replaced the Sonniss, Bleeoop and JDSherbert versions on 2026-10-28. |
| Sounds: restricted | None | — | Nothing shipped uses Sonniss, Bleeoop or JDSherbert since 2026-10-28. The export still holds back any restricted row added later, such as a Studio library pick. |

## Images: masters without a ChatGPT signature (confirmed ChatGPT, 2026-10-23)

Most masters in `art/` carry ChatGPT's C2PA signature: all of the room masters except the seven below, and most character sheets. These have none, so their source isn't on file:

- **Rooms:** `art/glass-orchid`, `art/low-roller`, `art/old-pier`, `art/public-landing`, `art/ribbon-rooftop`, `art/second-socket`, `art/walk-up-landing`. Several are the 2026-10-20 re-arts.
- **Characters:** `art/hae` (all 6 files). Also the unsigned files among `art/cass`, `art/ember`, `art/nix` and `art/crew`, which are probably Krita exports of signed originals.
- **Other:** `art/lowlight` (2), `art/patreon` (39, the Patreon page art), `scenes/default/{rooftop,workspace}` (the old default rooms), and `web/public/lowlight-logo.svg`.

If they're all ChatGPT, nothing changes; they just need lines in `sounds/CREDITS.md`. An image from another generator needs that service's terms checked.

## Gaps in `sounds/CREDITS.md`

- **The image table is stale.** It was last updated on 2026-10-12, when there were 11 rooms and 6 characters. Now there are 29 rooms; Ines, Mother Rot, Tilly, Vesna and `nix-direct`; 80 extras faces; 3 quest pictures; and the re-arts.
- **The audio is complete.** Every tracked sound file has a credit line, except one Studio backup of a song in `world/splash/history/`, which the export holds back. The two old Sonniss library picks (the Tilt, Pump House Nine) were replaced by ElevenLabs takes and are plain rows now.

## Git history (matters for opening this repo)

- **No secrets.** There are no OpenRouter, Resend, Cloudflare, GitHub or AWS keys, private keys, `.env` or settings files, or `data/` (play) files anywhere in the 2,092 commits.
- **Restricted sounds are in the history.** 125 audio files have been committed over time, including deleted ones. Publishing this repo as it stands would publish them, so the public repo needs either a rewritten history (`git filter-repo` dropping the restricted paths) or a fresh start from a clean tree.
- **Size.** `.git` is 704 MB, mostly Krita and Photoshop masters (`art/**/*.kra`, up to 19 MB each). Decide whether the masters go public, move to Git LFS, or stay private.
- **Author email.** The author's personal email is on every commit. A rewrite could switch it to the GitHub noreply address.

## The public versions have every sound

Since 2026-10-28 every shipped sound is CC0, generated on ElevenLabs, or a Suno song, so the public repo, the builds and the SillyTavern package carry the same set. The game's sound list (`/api/sound-present`) still skips any file that's missing, so a restricted sound added later would play silent in the public repo rather than break it.

## The author's answers (2026-10-23)

1. **Unsigned images:** all ChatGPT, the same terms as the rest, and now credited in `sounds/CREDITS.md`.
2. **Songs:** public, under CC BY-NC-SA 4.0.
3. **Art masters** (`art/`: `.kra`, `.psd`, masters): **private**. They stay out of the public repo.
4. **Public repo:** **a fresh start** from a clean tree, with no history. Its commits use the GitHub noreply address.

## Appendix: every audio file

Regenerated 2026-10-28 from `sounds/CREDITS.md` and the export's `audioStatus`, after the last restricted sounds were replaced (9257d3af).

| Status | Files |
|---|---|
| FREE (CC0) | 20 |
| YOURS (ElevenLabs) | 76 |
| YOURS (Suno Pro) | 11 |
| NOT CREDITED (held back) | 1 |

| File | Source | Status |
|---|---|---|
| `web/public/sound/crack/dud.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/crack/open.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/crack/reset.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/gig/enter.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/gig/probe.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/gig/select.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/alarm.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/beat.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/edge.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/fail.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/heat.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/messy.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/pass.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/quip.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/red.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/reroll.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/sol.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/mission/tick.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/ui/confirm.ogg` | CC0 | FREE (CC0) |
| `web/public/sound/ui/page-swap.ogg` | CC0 | FREE (CC0) |
| `scenes/default/rooftop/sound/industry-night.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/default/workspace/sound/overhead-fan.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/drownworks/pump-house-nine/sound/29_Industrial_Gas_Boiler_room_pipes_instalations_room_in_front_near.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/hicks-room/sound/keep/door.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/lowlight-intake/sound/office-heater.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/noodle-stall/sound/street-crowd-sizzle.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/ribbon-rooftop/sound/industry-night.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/ripper-clinic/sound/keep/door.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/the-tilt/sound/AMBIENT_-_Small_Cafe_Interior_-_01.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/karasu/zhou-flat/sound/keep/door.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/tidal/ferry-stairs/sound/dock-berth.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/velvet/bathhouse/sound/hall-faucets.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/velvet/under-the-cat/sound/quiet-street.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/granted.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/guess.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/hover.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/last.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/leave.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/crack/wrong.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/bid.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/liar.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/lose-die.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/lose.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/reveal.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/roll.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/dice/win.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/breach.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/cache.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/clean.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/close.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/jack-in.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/jack-out.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/key.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/pull.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/traced.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/trap.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/gig/watch.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/mission/deck.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/mission/dies.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/mission/read-ok.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/mission/start.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/back.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/blind.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/check.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/clean.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/close.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/fail.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/note.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/paper.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/pick.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/refuse.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/slide.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/papers/stamp.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/rain-heavy.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/rain-light.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/caught.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/clean.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/close.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/hide.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/jam.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/lift.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/noise.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/spotted.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/step.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/slip/wait.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/far-1.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/far-2.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/mid-1.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/mid-2.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/near-1.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/near-2.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/thunder/near-3.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/ui/lock.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/ui/move.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/ui/save.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `web/public/sound/ui/vs.ogg` | ElevenLabs | YOURS (ElevenLabs) |
| `scenes/drownworks/_music/Clean Water.ogg` | Suno | YOURS (Suno Pro) |
| `scenes/karasu/_music/Fast Drying Lacquer.ogg` | Suno | YOURS (Suno Pro) |
| `scenes/karasu/_music/Nix.ogg` | Suno | YOURS (Suno Pro) |
| `scenes/karasu/_music/No Light in Lowlight.ogg` | Suno | YOURS (Suno Pro) |
| `scenes/karasu/_music/What Hae Serves.ogg` | Suno | YOURS (Suno Pro) |
| `scenes/marsh/_music/Drowned.ogg` | Suno | YOURS (Suno Pro) |
| `web/public/sound/gig/fast-drying-lacquer.ogg` | Suno | YOURS (Suno Pro) |
| `web/public/sound/music/Lost in Lowlight.ogg` | Suno | YOURS (Suno Pro) |
| `web/public/sound/slip/glass-floor.ogg` | Suno | YOURS (Suno Pro) |
| `world/splash/music/Glass Floor (Glass Door Remix).ogg` | Suno | YOURS (Suno Pro) |
| `world/splash/music/Lowlight - Lost in Lowlight-uwarp.design.ogg` | Suno | YOURS (Suno Pro) |
| `world/splash/history/2026-10-25T03-10-43-362Z-No Light in Lowlight.ogg` | not credited | NOT CREDITED (held back) |
