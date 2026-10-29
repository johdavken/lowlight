/** Spec §2's example, made whole: two beats, an outcome to the second, outcomes that end it. */
export const TRAIL = `---
title: Paper Trail
with: [nix-direct, hicks]
starts: lowlight-intake
after: null
---

# sentinel
stranger: Arlo Venn — an SDG Sentinel: polite, patient, never raises his voice

*Boots on the stairs.*

"Evening," he says.

view nix-direct: The ledger is the Intake's whole promise.
view hicks: Paper burns.
view hicks if trust=high: A Sentinel made you the old offer again this week.
view any: You don't like a Sentinel in this room.

- hand: Hand it over. → given [set ledger=given]
- stall: Stall him till morning. → stalled [clock +6h]
- deny: Say there's no ledger. → denied [needs trust≥mid]

## given
*He thanks you like he means it.*
→ return

## stalled
*He nods and goes.*
→ return

## denied
*He smiles and leaves too easily.*
→ return

# return
*Venn is back.*

view any: Here he is again.

- face: Face him. → faced [set intake_ledger=faced, clock +30m]
- run: Run. → ran

## faced
*It's over.*
→ end

## ran
*You run.*
→ end
`;

/** TRAIL with a variant of `return` for those who handed the page over. */
export const VARIANTS = TRAIL.replace(
  '# return\n',
  `# return if ledger=given
*Venn is back, with the page.*

view any: He has what he came for.

- ask: Ask what happens to her. → asked
- out2: Tell him to get out. → ran

## asked
*He doesn't answer.*
→ end

# return
`,
);

/** VARIANTS whose `given` waits for morning at the Intake, with a missed-it outcome. */
export const WAITS = VARIANTS.replace(
  '## given\n*He thanks you like he means it.*\n→ return\n',
  '## given\n*He thanks you like he means it.*\n→ return\nwait: until 06:00 · at lowlight-intake · by 12:00 else gone\nnext: The Sentinel said morning. Be at the Intake.\n\n## gone\n*A card in the door.*\n→ end\n',
);

/** A quest whose second beat waits for the player (CONTINUE), at the Intake, for Nix. */
export const READY = `---
title: Ready Test
with: [nix-direct]
starts: lowlight-intake
---

# one
*The first beat.*

view any: You think about it.

- go: Go. → went
- stay: Stay. → went

## went
*Something is set in motion.*
→ two
wait: ready
next: Take your time. Continue when you're ready.

# two
*The second beat.*

view any: Here it is.

- done: Done. → finished
- also: Also done. → finished

## finished
*The end.*
→ end
`;

/** Missions spec §2's example, made whole: a checked grid choice with a crew bonus, a crew-only route, effects, two beats. */
export const MISSION = `---
title: Night Shift
kind: mission
with: [hicks, ember, nix-direct]
starts: haes-noodles
after: null
pitch: A freight office in the Spine needs its manifest cleaned before the auditors land.
pay: 400
---

# door

*The office is two floors up a Voltaic depot. One guard, one camera, one door.*

- roof: Loop the cameras from the roof. → inside / spotted [check tech 45 grid · ember +15]
- ride: Ride up in the freight lift with Ember. → inside [needs with=ember]
- walk: Walk in with a forged work order. → inside / turned-back [check cool 50 · hicks +10]

## inside
*You're in.*
→ desk

## spotted
*The camera turns.*
heat: +2
→ desk

## turned-back
*The guard reads the order twice and hands it back.*
→ end

# desk

*The manifest is on the screen.*

- wipe: Wipe the manifest. → paid / burned [check tech 50 grid]
- copy: Copy it and walk. → kept

## paid
*Clean.*
pay: 400
gives: deck deaf-meridian
→ end

## burned
*The deck smokes.*
takes: deck
heat: +1
→ end

## kept
*You keep a copy.*
→ end
`;

/** Small jobs spec §1–§3 made whole: a tiered job with draws, a temper stranger, a pay range, step minutes, take lines. */
export const JOB = `---
title: Back Door
kind: mission
tier: 2
with: [hicks, ember, nix-direct]
starts: haes-noodles
pay: 350-450
minutes: 30
draw complication: none | buyer-brought-a-friend | caper-watching
draw door: easy | hard
---

# door if complication=caper-watching
*A steel door behind the stall. One man on it, and someone across the street who isn't eating.*

- talk: Talk your way in. → inside / turned [check cool 50]
- wait: Wait for the shift change. → inside [clock +1h]

# door
stranger: The doorman — bored, big, watching the street
temper: door

*A steel door behind the stall. One man on it.*

- talk: Talk your way in. → inside / turned [check cool 50]
- wait: Wait for the shift change. → inside [clock +1h]

## inside
*You're in.*
→ desk

## turned
*He turns you round.*
take: none
blown
→ end

# desk
*The ledger.*

- grab: Take it all. → paid / part [check reflex 50]
- skim: Take what fits in a pocket. → part

## paid
*All of it.*
pay: full
take: full
→ end

## part
*Some of it.*
pay: half
take: part
→ end
`;

/**
 * A big job (big jobs spec): legwork scenes at places, clues, a three-blank read, routes into gigs.
 * The ask marks the ferry and the Intake; the Intake's log reveals the Tilt.
 */
export const BIG = `---
title: North Gate
kind: big
tier: 3
with: [hicks, ember, nix-direct]
starts: haes-noodles
pitch: A courier keeps getting through the north gate. Someone wants to know how, and wants in.
pay: 1500-3000
go: 03:00
stake: 15 / 25
---

# ask
*The fixer slides a photo across the counter: a courier at the north gate, waved through.*

- take: Take the job. → taken
- think: Say you'll think about it, and take it anyway. → taken

## taken
*You have until three.*
marks: ferry-stairs "the courier came through here", lowlight-intake "the gate's paperwork"
→ back

# ferry at ferry-stairs
*The last ferry noses in under the floodlights.*

- look: Check the railing. → strap / nothing [check wits 50]
- lean: Lean on the deckhand. → leaned [alarm +1]

## strap
*A strap snagged on the railing.*
clue: strap
→ back

## nothing
*Nothing on the railing but rust.*
→ back

## leaned
*He talks to make you go away.*
heat: +1
clue: rumour
→ back

# intake at lowlight-intake if time>=02:00
*The night clerk is asleep over the log.*

- log: Read the log over his shoulder. → logged
- wait: Wait for him to wake. → logged [clock +30m]

# intake at lowlight-intake
*The night clerk watches you over the log.*

- log: Ask to see the log. → logged
- leave: Leave him be. → nothing

## logged
*The gate's shift change is written in the margin.*
clue: schedule
reveals: the-tilt "the guard drinks here"
→ back

# bar at the-tilt
*The guard's off shift, at the end of the bar.*

- buy: Buy him a drink. → paid-off
- watch: Watch who pays his tab. → paid-off [clock +30m]

## paid-off
*Someone else is paying his tab, and has been for weeks.*
clue: paid
→ back

# clues
- strap: A courier's strap snagged on the ferry railing. · words: the courier, the ferry
- schedule: The north gate's guard changes at 04:00. · words: the north gate
- rumour: The deckhand swears the guard's on SDG pay. · words: SDG pay · false
- paid: Someone pays the guard's bar tab. · words: the guard is paid

# read
read: [the courier] gets through [the north gate] because [the guard is paid].
wrong: the dock, the river, the night shift
→ gate

# gate
*The north gate, a little before three.*

- wire: Loop the gate's cameras from the substation. → in-clean / in-close / burned [gig hack medium · if read.2=right -1 "you know the gate" · hicks -1]
- walk: Walk in with the shift change. → in-clean / in-close / burned [gig slip hard · if read=full -1 "you know the timing"]
- paper: Hand the gate a courier's papers. → in-clean / in-close / burned [gig papers medium, needs read.1=right]

## in-clean
*In and out, and nobody the wiser.*
pay: full
take: full
→ end

## in-close
*In and out, with a close call at the gate.*
pay: half
take: part
→ end

## burned
*The gate goes up in alarms. You get out with nothing.*
heat: +2
take: none
→ end
`;

/** The arrangement's Chair (spec 2026-10-20), cut down: Nix names her price; the deal strikes 150 a night, one job. */
export const CHAIR = `---
title: The Chair
with: [nix-direct]
starts: lowlight-intake
---

# offer
*She waits for the number.*

view any: You know what you're worth.

- deal: Name it. → struck [set chair=yes]
- not: Not tonight. → passed

## struck
*She writes it in the ledger.*
arrangement: chair 150 / 1
→ end

## passed
*She shrugs.*
→ end
`;

/** A desk job (comms spec §3): Nix's client at the Intake, played at the Ferry Stairs on comms. */
export const DESK = `---
title: Out by Water
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
pay: 50-120
posts: 20:00-02:00
trust: 1 / 1
comms: ferry-stairs
pitch: A man needs the night ferry.
---

# client
*He's packed, and he keeps checking the ticket.*

- send: Tell him you'll meet him at the stairs. → sent
- walk: Walk him down yourself. → sent

## sent
*He goes ahead. Nix stays at her desk.*
→ stairs
wait: at ferry-stairs · comms · by 02:00 else missed

## missed
*The ferry goes without him.*
take: none
blown
→ end

# stairs
*The Sentinel reads every face.*

- through: Walk him through. → aboard
- back: Turn back. → missed

## aboard
*He's on the boat.*
pay: full
take: full
→ end
`;
