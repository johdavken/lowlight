---
title: Night Clerk
kind: mission
tier: 2
with: [nix-direct, cass, hicks, ember, silas]
starts: under-the-cat
after: null
pitch: Forty seconds of hotel camera somebody wants gone before morning.
pay: 450-550
art: night-clerk.webp
draw complication: none | guest-in-the-corridor | second-camera
draw clerk: easy | hard
---

# lobby if heat>=4

stranger: The night clerk — young, tired, a screen he watches more than the door
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass. Tonight he looks up when you come in, and then down at something on his screen, and then up again.*

*He has your face on there. Not a warrant. Just a face.*

- charm: Talk your way past the glass anyway. → upstairs / noticed [check cool 50 red]
- stairs: Take the service stair. → upstairs / noticed [check reflex 45 · ember +10, set quiet=yes]

# lobby

stranger: The night clerk — young, tired, a screen he watches more than the door
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass, with a screen he watches more than the door. Somewhere upstairs is a camera closet, and in it forty seconds of somebody's evening.*

- charm: Talk your way past the glass. → upstairs / noticed [check cool 55 red]
- stairs: Take the service stair. → upstairs / noticed [check reflex 45 · ember +10, set quiet=yes]
- known: Let Nix ask the clerk. He owes her. → upstairs [needs with=nix-direct]

## upstairs
*The fourth floor smells of carpet cleaner. The closet door is a cheap lock and a better camera.*
→ closet

## noticed
*The clerk picks up a handset. He doesn't dial yet. He wants you to see him not dialling.*
heat: +1
→ closet

# closet

*Racks of recorders, each with its own small green eye. The footage is on the third one down, behind a login screen older than you are.*

[complication=second-camera] *A second lens over the door, newer than the rest, pointed at whoever stands at the rack.*
[tech 7] *The login is a maintenance build. Somebody left the word list in its memory.*
[complication=guest-in-the-corridor] *Somebody's ice bucket clatters in the corridor. Footsteps stop outside, then go on.*

- crack: Crack the login and wipe it clean. → clean / locked [crack 6 · if quiet +1 "you came up quiet"]
- pull: Pull the drive and walk out with it. → taken / caught [check body 45]
- loop: Slip a pocket loop onto the line. → clean [needs deck:hidden]

## clean
*Forty seconds of nothing, stitched in so well the timestamps never stutter.*
heat: -1
take: full
→ out

## locked
*The screen goes red and stays red. Somewhere downstairs a light on the clerk's board starts blinking.*
heat: +1
→ pull-anyway

## taken
*The drive is warm in your pocket. It's done, but the gap in the footage will be noticed.*
heat: +2
take: part
→ out

## caught
*The clerk is at the end of the corridor with the handset to his ear. You leave the drive where it is and leave fast.*
heat: +3
take: none
→ end

# pull-anyway

*The terminal's locked you out, but the drive is still in the rack. The light downstairs is still blinking.*

- pull: Pull the drive and run. → taken / caught [check body 45]
- leave: Leave it and get out clean. → walked-away

## walked-away
*You go down the service stair with nothing in your hands. Somebody's evening stays on the tape.*
take: none
→ end

# out if alarm>=2

*Two men in hotel blazers are coming up the main stair, not hurrying, talking into their collars.*

- service: Get down the service stair, now. → home / spotted [check reflex 50]
- bold: Walk straight past them like a guest. → home / spotted [check cool 45 · cass +10]

# out

*The corridor's empty. The clerk is back behind his glass, watching his screen.*

- service: Take the service stair down. → home
- front: Walk out through the lobby, nodding to the clerk. → home [needs with=nix-direct]

## home
*Under the Cat the rain's still coming down. Nobody follows you out.*
pay: full
→ end

## spotted
*One of them gets a look at you. You're out, but you'll be on somebody's list by morning.*
pay: full
heat: +1
→ end
