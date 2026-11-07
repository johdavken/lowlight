---
title: Cold Storage
art: cold-storage.webp
kind: mission
tier: 2
template: true
starts: second-socket
after: null
pitch: A dead man's freezer locker in the Spine, and a crate of chips his family doesn't know about. Yet.
posted-by: A go-between at Second Socket, for someone who knew what the dead man kept.
brief: The cold lockers under the Spine. The dead man's locker hides a crate of chips. Get past the warden, open it and carry the crate out before the family clears it.
known-by: [silas]
pay: 360-440
draw complication: none | family-came-early | locker-rewired
draw warden: easy | hard
---

# lockers if heat>=4

stranger: The warden — night shift at the cold lockers, coat buttoned to the chin
face: local-02
temper: warden

*The cold lockers run under the Spine in two long rows of steel, frost on every handle. The warden doesn't get up when you come in. He's seen your face on the board by the door.*

[complication=family-came-early] *A woman in a black coat is arguing with the warden about locker 61. She has the death certificate in her hand.*

- talk: Say you're family. → inside / suspicious [check cool 50 · cass +10 · adebayo +10]
- keys: Lift the keys off the nail while he reads the board. → inside / suspicious [check reflex 50 · if complication=family-came-early +15 "he's busy with her"]

# lockers

stranger: The warden — night shift at the cold lockers, coat buttoned to the chin
face: local-02
temper: warden

*The cold lockers run under the Spine in two long rows of steel, frost on every handle. Locker 61 belonged to a man who died on Tuesday. The warden keeps the keys on a nail behind him.*

[complication=family-came-early] *A woman in a black coat is arguing with the warden about locker 61. She has the death certificate in her hand.*

- talk: Say you're family. → inside / suspicious [check cool 55 · cass +10 · adebayo +10]
- keys: Lift the keys off the nail while he's busy. → inside / suspicious [check reflex 55 · if complication=family-came-early +15 "he's busy with her"]

## inside
*The warden doesn't look up. The rows run off into the cold ahead of you.*
→ row

## suspicious
*He watches you go down the row, and then he picks up his phone and turns his back to you to use it.*
→ row

# row

*The numbers on the row wore off years ago, and the frost has eaten the stencils. Somewhere behind you a compressor kicks in and the lights drop to half.*

[complication=family-came-early] *She's followed you in. You can hear her heels on the grating, two rows over.*

- count: Count the doors off the plan on the wall. → found / slow [check wits 55 · nix-direct +10]
- force: Break the frost off the handles, one by one. → found / slow [check body 55 · ines +10]

## found
*Locker 61 is fogged with frost. Behind the meat and the unlabelled tubs, under a false floor, a keypad glows.*
→ safe

## slow
*You find it, but the compressor's cycle has run out and the lights come back up. Locker 61: behind the meat and the unlabelled tubs, under a false floor, a keypad glows.*
→ safe

# safe

*The false floor has its own lock: an old courier safe with a terminal on the lid, still running on a battery that should have died with its owner.*

[complication=locker-rewired] *Someone's spliced a second line into the safe's power. It runs off up the wall, back the way you came.*
[tech 7] *The safe's a Kessler courier model. Its passwords come from a word list; its makers were lazy.*

- crack: Crack the terminal. → open / locked [crack 7]
- pry: Pry the lid with the locker bar. → open / alarm [check body 55 · ines +15]

## open
*Inside, a flat crate packed with foam: twelve chips in clear cases, each one with a little paper label in a dead man's handwriting.*
→ plant

## locked
*The terminal wipes its own screen. Something under the lid clicks, then hisses: a little acid, eating the top layer of chips.*
take: part
→ plant

## alarm
*The lid comes up with a crack you feel in your teeth. Three of the cases go with it. The rest lie in the foam, each with a little paper label in a dead man's handwriting.*
take: part
→ plant

# plant

*The way back runs past the plant room. Something in there is ticking, and a cable from the ceiling runs straight to the row's one working door.*

[complication=locker-rewired] *It's the second line from the safe. It ends here, in a box with a fresh seal on it.*

- relay: Pull the door's relay before it locks. → through / shut [check tech 50 · rue +10 · silas +10]
- swing: Get through on the swing, before the bolt drops. → through / shut [check reflex 50 · ember +10]

## through
*The door sighs open. Cold air follows you through.*
→ out

## shut
*The bolt drops a second after you're through, loud enough to hear on the deck above.*
→ out

# out if alarm>=2

*There are boots on the stairs now, and the warden's shouting up them. The service door at the back is chained, but the chain is old.*

- door: Kick the service door. → gone / cornered [check body 50 · ines +10]
- bluff: Drop over the stair rail behind them, crate on your shoulder, and run. → gone / cornered [check reflex 50 · cass +10]

# out

*The rows are quiet again. The warden doesn't look up as you pass.*

- walk: Wait for the warden's eyes to drop and slip out the front with the crate. → gone / cornered [check reflex 50 · cass +10]
- back: Haul the crate out through the loading bay. → gone / cornered [check body 50 · ines +10]

## gone
*The Spine's lower deck is empty and wet. The chips are cold through the crate all the way home.*
pay: full
→ end

## cornered
*Two men are waiting where the way out should be. The crate stays with them. You get out with bruises and a description.*
take: none
→ end
