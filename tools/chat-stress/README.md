# Chat stress test

Plays a scripted night with every contact on GLM and reports what went wrong. Unit tests can't catch
these, and short hand-checks miss most of them:

- failed tool calls;
- repeated lines or paragraphs;
- echoes: her *actions* carrying phrases from her last few replies (two of them, or one of four words or more) — the paper lantern in eight replies running (2026-10-23);
- replies cut off or left as actions only;
- tools named in the story;
- actions written but not done (a power cut with no light call, "*updates the note*" with no note).

Since the Residual (2026-10-15) her notes, recap, dossier, standing and missed lights are written by a call after her reply. Those writes are in the trace as `residual:note`, `residual:light`, `residual:recap` and so on, and count as hers. A finished turn waits for the Residual's `residual` line before it is recorded.

**Run it after any change to what the characters are told, their tools, or the direct turn loop**
(`server/src/direct.ts`).

```
npm run chat-stress                                  # all 6 contacts × 10 turns, from HEAD
npm run chat-stress -- --contacts cass,ember --turns 3
npm run chat-stress -- --ref my-branch               # a branch or commit instead of HEAD
npm run chat-stress -- --keep                        # keep the src/ and data/ copies
```

## What it does

1. It runs `git archive` on the ref into `<out>/src`. That means it tests committed code only: commit before running.
2. It builds that copy, copies `data/` into `<out>/data`, and starts its own server on port 7730 (`--port`; never 7700 or 7710).
   - If the port is taken, it stops before building and names the process holding it. That is usually a server
     left by an earlier run: stop it, or pass `--port`.
   - Once the server is up, it checks that the process answering on the port is the one it started.
   - The server runs with `NIX_TOOL_TRACE` set, so every tool call is logged.
   - Your game and Studio are never touched.
3. It plays `turns.json` with each contact in a fresh playthrough, then stops the server.
   The server is also stopped when the run fails, or is stopped with Ctrl-C or a kill signal.
4. It writes three files to `<out>` (`--out`, default `/tmp/chat-stress-<time>`):
   - `report.md`: the cost and a table per contact, plus every flagged turn;
   - `transcript.md`: each reply and its calls;
   - `turns.jsonl`: one record per turn.

   `trace.jsonl` (the tool calls) and `server.log` stay there too.
5. It deletes `<out>/src` and `<out>/data` (about 165 MB per run), whether the run finished, failed or was
   interrupted. `--keep` keeps them for debugging.

Every turn is a real call on the linked OpenRouter key. A full run is 60 turns. The cost line reads the
key's credit before and after, and OpenRouter can lag a minute behind.

## The script

`turns.json` lists the contacts, with who plays each, and the turns. A turn's `expect` sets what it must do:

| `expect` | The turn must… |
| --- | --- | --- |
| `light` | change a light |
| `note` | write a note with text |
| `scene` | `go_to` |
| `recap` | `set_recap` |
| `no-room-change` | leave the room alone (an OOC turn) |

`quiet-night.json` is a second script: 24 slow in-character turns with Silas, Ember and Cass, the kind of scene where GLM reworks its own last replies. Run it with `--script $(pwd)/tools/chat-stress/quiet-night.json` (on a branch and on master) to measure echoes past the habits run's first pass at reply 8.

The checks are in `analyze.ts`.

## Results so far

| | 2026-10-12, before fixes | 2026-10-13, after 44a5346 + 51d482d | 2026-10-16, master 1f567fb5 | 2026-10-16, residual (feat/residual) | 2026-10-16, quest lines (feat/quest-lines fd1528bc) | 2026-10-16, quest fixes (fix/quest-replies baffd25f) | 2026-10-16, quest waits (feat/quest-waits 48311c85) | 2026-10-16, standing pace (fix/standing-pace bbe9cdbd) | 2026-10-19, small jobs (master eca66c6e) | 2026-10-20, big jobs (master 8ec02bfc) | 2026-10-20, Intake board (master 22321fe8) | 2026-10-20, comms (master 7c0cf5d5) | 2026-10-20, time backstop (feat/time-backstop 1c3f71e7) | 2026-10-20, beat line (feat/beat-line cb910f31) | 2026-10-20, weekdays (feat/weekdays afde073d) | 2026-10-20, prompt trim (feat/prompt-trim c551fdb6) | 2026-10-20, faces from actions (feat/faces 88ca7f26) | 2026-10-21, job lines (fix/job-lines f28b205d) | 2026-10-21, story moods (feat/story-moods 40a066b3) | 2026-10-21, city weather (feat/city-weather 7c4f5a05) | 2026-10-22, her plans (feat/her-plans b3e813fe) | 2026-10-24, SDG cast (master 27ddcdaf) | 2026-10-27, arrival screen (feat/arrival-screen e03a58b5) | 2026-10-28, blackouts phase 3 (feat/blackouts-3 e12b9243, Karasu forced dark) | 2026-10-29, SillyTavern package merge (merge/st-package 772057af) | 2026-10-29, Cipher (feat/cipher 9c031424) | 2026-10-29, habits (feat/habits ae96fe7b) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| failed calls | 4 | 0 | 0 | 0 | 0  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 (Cass T3 give_lead args cut short; retried in the same turn) | 0 | 0 | 0 |
| repeats | 2 | 0 | 0 | 0 | 0  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 (Hicks T1, GLM reasoning in the reply; rerun clean) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cut-off replies | 4 | 0 | 1 actions-only | 0 | 0  | 0 | 0 (1 turn timed out: provider) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| power cut, no light call | 3 of 6 | 2 of 6 (6 of 6 after b6759ac) | 3 missed lights | 0 | 0  | 0 | 2 (Silas T1 left the lights; Nix T1 timed out) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| gin correction, no note | 2 of 6 | 3 of 6 (2 of 6 after b6759ac) | 2 missed notes | 0 | 0  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

2026-10-29 habits run (feat/habits ae96fe7b: a `habits` Residual run names up to 5 body tics and prose shapes as rules, sent as `[worn thin — leave out: …]` before the echo line): 60/60, every baseline row 0, 4 echoes (Cass 1, Mother Rot 1, Hicks 2), $0.40. The standard script barely reaches it (first run at reply 8), so `quiet-night.json` (24 slow turns, Silas/Ember/Cass with Hicks) ran on master and on the branch: echo flags in turns 9–24 went 8 → 2. By eye over turns 9–24: Silas's glasses 3 → 0 of 16; Ember's blanket 8 → 0, back against the wall/glass 7 → 2, rain 9 → 3; Cass flat (glass/towel business 12 → 12, lamp 4 → 6, closing questions 2 → 4, though her list named that). Two actions-only replies on the branch answered silent player lines (`*says nothing*`, `*closes their eyes*`). Rules came back as observations ("Always mentions the lantern light") more than "No …" rules; one rule was refused as too long. $0.25 + $0.22.

2026-10-29 Cipher run (feat/cipher 9c031424: the scribe renamed the Residual; a `cipher` run writes hidden truths after six replies; open truths go to the turn run as `[cipher: …]` and to the contacts who keep them as `[cipher]`): 60/60, every baseline row 0, 4 echoes (Ember 1, Silas 2, Mother Rot 1), no missed lights, notes, scenes or recaps. 6 cipher runs wrote 8 truths; 3 wrote none (8 refused). A kept 20-turn rerun on Nix and Cass traced them: GLM listed `clueIdeas`, and a truth naming the player was refused; both fixed in 1c9a6cf1. No clue landed within the script's 10 turns (truths arrive at reply 6). $0.33.

2026-10-29 SillyTavern package merge (merge/st-package 772057af: the room line and room tool text moved to `shared/room-line.ts` and `shared/room-tool-text.ts`, merged with master's reply echoes): 60/60, every baseline row 0, 3 echoes (Cass 2: "she looks at him", "doesn't look up"; Hicks 1: "slate under his arm"), no missed lights, notes, scenes or recaps. $0.33.

2026-10-28 blackouts phase 3 run (feat/blackouts-3 e12b9243, NIX_ROOM_OUTAGES=karasu so the five Karasu contacts had `[city: the power is out across Karasu since …]` every turn): 60/60, 3 echoes, 1 failed call (Cass T3 give_lead with its arguments cut off mid-string; the next round gave the lead), no missed lights, notes, scenes or recaps. The Karasu contacts played the dark ("Power's been down across Karasu", candles behind the optics, the Tilt applied its own `blackout` mood); the forced outage's start reads as a daytime hour, dev only. $0.36.

2026-10-27 arrival screen run (feat/arrival-screen e03a58b5: the travel instructions answer a line said on the way; the opening rides on the greeting; the narrator writes one steerable opening): 60/60, every baseline row 0, 4 echoes (Ember 1, Silas 2, Hicks 1: chrome at the temple, glasses pushed up), 2 missed-scene (Ember T8 and Nix T8: "Hae's is downstairs" with no go_to, the walking-together habit of earlier runs) and 1 missed-recap (Mother Rot's T10 goodbye, the Ember pattern). The script sends no GO, so the travel line itself was checked live instead (a reason, a kept secret, and an opening; she answered the why). $0.32.

2026-10-24 SDG cast run (master 27ddcdaf: Soren, Adebayo, Rue, Oksana, Garro and five Spine/Nexus rooms; prompts for the existing cast unchanged): 60/60, every baseline row 0, 11 echo flags across the six (the first run to count echoes against the standard script; Ember 3, the rest 1–2: a fairy-lights line, chrome knuckles, glasses pushed up), $0.48. Alongside, the same script on the new cast (adebayo and rue with player soren, soren with player hicks; `--script` with a copied turns.json): 30/30, no failed calls or missed lights/notes/scenes, 2 echoes (Adebayo reusing "the glasses walk" from Oksana's lore after walking them there) and 1 missed recap (Soren's dawn goodbye, the Ember pattern), $0.28.


2026-10-23 deck controls run (feat/deck-controls 452805a4: [her day: …] in the Residual input, plans and promises may name the rooms of her day, feed-aware message controls): 60/60, two flags, $0.31. Silas T8 and Nix T8 missed-scene: "Food. Noodle stall. You coming?" / "Hae's. Downstairs." with no go_to, and the Residual set a going plan — the walking-together habit seen in the deck run, not this branch. The later one-sentence PROMISE rule change ("a promise kept in the same reply is none") wasn't in this run; stress turns ask for no promises.

2026-10-23 promised texts run (feat/promised-texts: the Residual's PROMISE rule and `promise` field, `[your promise: …]` read back; a checker on clock moves): 60/60, one flag, $0.35. Ember T10 missed-recap: her goodbye the Residual answered "nothing to write" — the same flag as the faces and beat line runs (a known Ember habit). No promise was set or fired anywhere in the 60 turns, as none was asked for.

2026-10-23 deck run (feat/deck 9afa002e: text rows kept out of scene history, the `[texts]` block, consumeStream split into scenePrompt + stream): 60/60, one flag, $0.31. Nix T8 missed-scene: the power cut, she says "Hae's. Downstairs." and grabs her badge but doesn't call go_to; the Residual read it as a going plan to the noodle stall (walking together, the her-plans pattern; the room hadn't moved, so the here guard didn't catch it). No deck regression: no text rows exist in a stress run, and the scene prompt only gained an empty block.

2026-10-22 her plans run (feat/her-plans b3e813fe: the Residual's PLAN field, plan placement, the LET HER GO card): 60/60, nothing flagged, $0.35. But the Residual set 7 plans: on T8 ("take me to one of your places") 5 of 6 contacts walked you both to Hae's with go_to and were read as her going there — a card would have come up. Fixed by dropping a going leg to the room she's already in (a later commit); a cass/hicks/mother-rot 8-turn rerun ($0.09) set no plan, all three walked. T10's "same time tomorrow night?" became a meeting at 05:30 for Silas and Mother Rot (a misread time; left to judge by hand).

2026-10-21 city weather minors run (feat/city-weather 73cc69ed: apply_mood's description now says only the weather moods change the rain): 60/60, one flag, Ember T4 missed-note: her reply took the gin correction, but the Residual's provider call timed out (45 s). An Ember rerun (10 turns, $0.02) was clean. $0.31.

2026-10-21 city weather run (feat/city-weather 7c4f5a05: one weather for the city; non-weather moods leave the rain alone): 60/60, nothing flagged, $0.31. Like story moods, the city weather itself doesn't fire in the script (no contact is the one you're with); the non-weather-mood change does. The review fixes after this run don't touch her prompt.

2026-10-21 story moods run (feat/story-moods 40a066b3: the room's mood follows the clock, venue hours and jobs, applied by the world): 60/60, nothing flagged, $0.38. No world mood fired: the script never makes a contact the one you're with, so the room check is skipped; the moods were checked in the browser on a scratch copy instead. The final review's fixes (her same-round mood stands, swipes don't apply moods) came after this run and only make the world act less.

2026-10-21 job lines run (fix/job-lines f28b205d: a job's beats reach her, the Residual and the summary as `[job — …]` lines, not `[quest — …]`; a jobs-apart rule in the room rules, Nix's file, the Residual and the summary): 60/60, one flag, a false positive — Ember T8 missed-scene, but she called go_to karasu/noodle-stall that turn. $0.30.

2026-10-20 faces from actions run (feat/faces 88ca7f26: set_expression no longer offered to her and EXPRESSION_NOTE gone; faces come from her *actions* in the browser): 60/60, three flags, none from the change. Hicks T1 (the contact voiced is Cass) wrote her reply twice and then GLM's own reasoning ("Wait — I'm not at the bar yet… Let me re-examine"), flagged as repeat and tool-talk (set_light named in that reasoning); Ember T10 missed-recap (a goodbye the Residual answered "nothing to write"; the same flag as the beat line run). A hicks+ember rerun (20 turns) was clean. $0.26 plus the rerun.

2026-10-20 prompt trim run (feat/prompt-trim c551fdb6: each rule said once — length only in the beat line, their-part only in the guide and beat line, no tool list / SHARE_CONTACT_LINE in the room note, the encounter note no longer restates the lights rule, no "save the recap", [mission summary] in words): 60/60, nothing flagged. share_contact on T3 6 of 6 (master, 3-turn baseline the same day: 5 of 6). Reply length, plain rp turns, against the beat line run: median 99 → 88 words, over 150 words 4 → 3 of 54, longest 205 → 185, over 80 38 → 33 of 54. That commit also dropped EXPRESSION_NOTE and set_expression nearly stopped (1 call in 60; master 4 in 18 turns), so the note went back as on master (faces-from-actions will replace both). $0.67.

2026-10-20 weekdays run (feat/weekdays afde073d: `[time: Thursday, Day 1, 20:05]` with the weekday; schedule blocks can keep to days, and her schedule line names a start more than a day off): 60/60, nothing flagged. No contact on this data copy has a `days` block, so the run checks the time line; the night-off case was a 3-turn live check (Cass off Thursdays: "Meant to be, yeah. Swapped with Dina."; after two WAITs, "Saturday. Day three"). $0.66.

2026-10-20 beat line run (feat/beat-line cb910f31: a `[your reply: one beat … about 80 words …]` line last before their words on plain in-character turns; the room rules under their own heading): 60/60, three residual flags, none from the change (the Residual reads saved rows, not the turn's lines). Nix T2's residual answered not-JSON and caught up on T3; Ember T4 missed-note and T10 missed-recap came back clean on a 10-turn Ember rerun ($0.03). Reply length, plain rp turns, against the time backstop run: median 124 → 99 words, over 150 words 16 → 4 of 54, longest 360 → 205; over 80 unchanged at 38 of 54. $0.30.

2026-10-20 time backstop run (feat/time-backstop 1c3f71e7: firmer pass_time line, residual `time`): 60/60, one flag — Ember T8 missed-scene (she heads for the door with Hicks but calls no go_to; Ember is on DeepSeek here, and the change doesn't touch go_to). On T10 ("talking until the sky goes grey") every contact called pass_time herself; for Silas and Nix the Residual added +30 on top, which led to the 'her own pass_time stands' rule (residual-runner). $0.35.

2026-10-20 Intake board run (master 22321fe8, her clients line in Nix's prompt): 60/60, nothing flagged, $0.90.

2026-10-20 big jobs run (master 8ec02bfc, big jobs merged): 60/60, nothing flagged, $0.87.

2026-10-19 small jobs run (master eca66c6e, missions + small jobs merged): 60/60, nothing flagged, $0.38.

2026-10-19 outfit wears run (feat/outfit-wears af75b8af): 60/60, nothing flagged, $0.72. Every turn now carries a `[wearing: …]` line.

2026-10-16 standing pace run: 60/60, nothing flagged; the Residual moved standing 7 times in 60 turns (all ±1, one down) and 8 more were refused as too soon after the last move.

2026-10-16 quest fixes run: 60/60, one tool-talk flag (Nix T4 wrote "*Set_expression neutral.*" as a story line, no call; not a quest turn and not cut off, so neither change ran on it).

2026-10-16 residual run: the notes, lights, recap and standing come from the Residual after her reply (trace `residual:*`). The six missed recaps in that run were the "I should go" turn before 019d069d let the Residual write a recap without END SCENE; a 20-turn rerun after it had none.
2026-10-16 quest waits run: the Nix contact on this data copy was on a free model (Nemotron); its T1 timed out and T8's residual call got a 502 — provider failures, not the change. Silas T1 left the lights and said nothing changed, so the Residual had nothing to fix.
