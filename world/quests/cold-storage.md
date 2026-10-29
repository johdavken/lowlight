---
title: Cold Storage
kind: mission
tier: 2
with: [silas, ember, hicks, cass, nix-direct]
starts: second-socket
after: null
pitch: A dead man's freezer locker in the Spine, and a crate of chips his family doesn't know about. Yet.
pay: 380-480
draw complication: none | family-came-early | locker-rewired
draw warden: easy | hard
---

# lockers if heat>=4

stranger: The warden — night shift at the cold lockers, coat buttoned to the chin
temper: warden

*The cold lockers run under the Spine in two long rows of steel, frost on every handle. The warden doesn't get up when you come in. He's seen your face on the board by the door.*

- pay: Slip him something to forget the morning. → inside [clock +30m, set paid-off=yes]
- talk: Say you're family. → inside / suspicious [check cool 55 · cass +10]

# lockers

stranger: The warden — night shift at the cold lockers, coat buttoned to the chin
temper: warden

*The cold lockers run under the Spine in two long rows of steel, frost on every handle. Locker 61 belonged to a man who died on Tuesday. The warden keeps the keys on a nail behind him.*

[complication=family-came-early] *A woman in a black coat is arguing with the warden about locker 61. She has the death certificate in her hand.*

- talk: Say you're family. → inside / suspicious [check cool 50 · cass +10]
- keys: Lift the keys off the nail while he's busy. → inside / suspicious [check reflex 50 · if complication=family-came-early +15 "he's busy with her"]
- pay: Slip him something to forget the morning. → inside [clock +30m, set paid-off=yes]

## inside
*Locker 61 is fogged with frost. Behind the meat and the unlabelled tubs, under a false floor, a keypad glows.*
→ safe

## suspicious
*He lets you through, and then he picks up his phone and turns his back to you to use it.*
heat: +1
→ safe

# safe

*The false floor has its own lock: an old courier safe with a terminal on the lid, still running on a battery that should have died with its owner.*

[complication=locker-rewired] *Someone's spliced a second line into the safe's power. It runs off up the wall, towards the warden's desk.*
[tech 7] *The safe's a Kessler courier model. Its passwords come from a word list; its makers were lazy.*

- crack: Crack the terminal. → open / locked [crack 7 · if paid-off +1 "nobody's coming to check"]
- pry: Pry the lid with the locker bar. → open / alarm [check body 55]

## open
*Inside, in foam, twelve chips in clear cases, each one with a little paper label in a dead man's handwriting.*
take: full
→ out

## locked
*The terminal wipes its own screen. Something under the lid clicks, then hisses: a little acid, eating the top layer of chips.*
take: part
→ out

## alarm
*The lid comes up, and so does the alarm: a thin wail that goes up the whole Spine.*
take: part
heat: +1
→ out

# out if alarm>=2

*There are boots on the stairs now, and the warden's shouting up them. The service door at the back is chained, but the chain is old.*

- door: Kick the service door. → gone / cornered [check body 50 red]
- hide: Hide in an empty locker and wait it out. → gone [clock +1h]

# out

*The rows are quiet again. The warden doesn't look up as you pass.*

- walk: Walk out the front with the crate under your coat. → gone
- back: Go out the back way, through the loading bay. → gone [clock +30m]

## gone
*The Spine's lower deck is empty and wet. The chips are cold through the crate all the way home.*
pay: full
→ end

## cornered
*The door holds. The men on the stairs don't. You get out with nothing but bruises and a description.*
take: none
heat: +2
→ end
