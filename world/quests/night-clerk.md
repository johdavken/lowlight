---
title: Night Clerk
kind: mission
tier: 2
template: true
starts: under-the-cat
after: null
pitch: Forty seconds of hotel camera somebody wants gone before morning.
posted-by: A fixer under the Cat, for a guest who won't give a name.
brief: The hotel under the Cat. Forty seconds of camera sit on a recorder in a closet upstairs. Get past the night clerk and get rid of them before morning.
pay: 360-440
art: night-clerk.webp
draw complication: none | guest-in-the-corridor | second-camera
draw clerk: easy | hard
---

# lobby if heat>=4

stranger: The night clerk — young, tired, a screen he watches more than the door
face: local-08
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass. Tonight he looks up when you come in, and then down at something on his screen, and then up again.*

*He has your face on there. Not a warrant. Just a face.*

- charm: Talk your way past the glass anyway. → upstairs / noticed [check cool 50 · adebayo +10]
- stairs: Take the service stair. → upstairs / noticed [check reflex 50 · ember +10, set quiet=yes]

# lobby

stranger: The night clerk — young, tired, a screen he watches more than the door
face: local-08
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass, with a screen he watches more than the door. Somewhere upstairs is a camera closet, and in it forty seconds of somebody's evening.*

- charm: Talk your way past the glass. → upstairs / noticed [check cool 55 · adebayo +10]
- stairs: Take the service stair. → upstairs / noticed [check reflex 55 · ember +10, set quiet=yes]

## upstairs
*The fourth floor smells of carpet cleaner. The closet door is a cheap lock and a better camera.*
→ floor

## noticed
*The clerk picks up a handset. He doesn't dial yet. He wants you to see him not dialling.*
→ floor

# floor

*The camera over the closet door sweeps the corridor, stops, sweeps back. It runs on the hotel's own line. The fire door at the far end has been painted shut since before the clerk was born.*

- blind: Splice the camera line at the junction box and feed it its last ten seconds. → unseen / swept [check tech 55 · rue +10 · silas +10]
- force: Shoulder the painted door and come at the closet from behind the lens. → unseen / swept [check body 55 · ines +10]

## unseen
*The lens goes on watching an empty corridor. The closet lock takes less time than the camera did.*
→ closet

## swept
*The lens stops on you for a moment too long before it moves on. You're in the closet, and you don't know who was watching.*
→ closet

# closet

*Racks of recorders, each with its own small green eye. The footage is on the third one down, behind a login screen older than you are.*

[complication=second-camera] *A second lens over the door, newer than the rest, pointed at whoever stands at the rack.*
[tech 7] *The login is a maintenance build. Somebody left the word list in its memory.*
[complication=guest-in-the-corridor] *Somebody's ice bucket clatters in the corridor. Footsteps stop outside, then go on.*

- crack: Crack the login and wipe it clean. → clean / locked [crack 6 · if quiet +1 "you came up quiet"]
- pull: Pull the drive and walk out with it. → taken / locked [check body 55 · ines +10, alarm +1]

## clean
*Forty seconds of nothing, stitched in so well the timestamps never stutter.*
→ corridor

## locked
*The rack goes red and stays red. Somewhere downstairs a light on the clerk's board starts blinking. You get half of it and go.*
take: part
→ corridor

## taken
*The drive is warm in your pocket. It's done, but the gap in the footage will be noticed.*
→ corridor

## caught
*The clerk is at the foot of the stair with the handset to his ear, and the blazers are behind him. You leave fast, with nothing to show for the night.*
take: none
→ end

# corridor

*The fourth floor isn't empty any more. A door opens two rooms down, and an ice machine starts up at the far end, loud enough to walk under.*

[complication=guest-in-the-corridor] *It's the guest from before, in a hotel robe, looking for the machine.*

- time: Stand in the linen cupboard and count his steps. → clear / met [check wits 50 · nix-direct +10]
- slip: Go now, along the wall, while the machine's running. → clear / met [check reflex 50 · ember +10]

## clear
*He goes by with his bucket and never turns his head.*
→ out

## met
*He looks straight at you, and then at the closet door behind you. He says goodnight. He'll remember saying it.*
→ out

# out if alarm>=2

*Two men in hotel blazers are coming up the main stair, not hurrying, talking into their collars.*

- service: Get down the service stair, now. → home / caught [check reflex 50]
- bold: Black out the stair lights from your deck and go past them in the dark. → home / caught [check tech 50 grid · cass +10 · soren +10]

# out

*The corridor's empty. The clerk is back behind his glass, watching his screen.*

- service: Take the service stair down, quietly, past the laundry. → home / caught [check reflex 50]
- front: Loop the lobby camera on the clerk's screen and walk out behind it. → home / caught [check tech 50 grid · nix-direct +10]

## home
*Under the Cat the rain's still coming down. Nobody follows you out.*
pay: full
→ end

# push-1

*Under the Cat, the service stair is still unlocked behind you. Upstairs, the recorder next to yours holds the same night, other rooms: a floor of other people's evenings, and some of them would pay to have theirs back.*

- copy: Go back up, crack the next login and copy the night. → copied / wiped [crack 7]
- swap: Go back up, pull its drive and leave a blank in the slot. → copied / wiped [check reflex 55 · ember +10 · rue +10]

## copied
*Two hours of corridor, a man going into a room that isn't his. Someone on the fifth floor will want this back by Friday.*
pay: +120
→ end

## wiped
*The recorder chirps once and eats its own drive. The clerk's board will show it by morning, and keeping him quiet about it costs a cut of your fee.*
lost
→ end

# push-2

*Back past the glass, the clerk's screen shows tonight's register. One guest checked in under a name his face doesn't match: a Cortex auditor, from the cut of his coat.*

- lean: Lean on the clerk for the real name. → named / scared-clerk [check cool 60 · adebayo +15 · soren +10 · cass +10]
- read: Read the screen over his shoulder while you ask for a map. → named / scared-clerk [check wits 60 · nix-direct +15]

## named
*The clerk mouths it without meaning to. A name like that is worth a lot to the right people.*
pay: +160
→ end

## scared-clerk
*The clerk's hand goes to the handset and this time he dials. You're out the door before it connects, and a cut of your fee buys him a bad memory.*
lost
→ end

# push-3 if alarm>=1

*The manager's office behind the lobby logs every door every keycard opens. The blazers are still somewhere on the stairs.*

- strip: Strip the log onto your deck before they come down. → door-log / blazers [check tech 70 grid · rue +15 · silas +15 · ember +10]
- grab: Take the whole logger off the wall. → door-log / blazers [check body 70 · ines +15, alarm +1]

# push-3

*The manager's office behind the lobby logs every door every keycard opens. The office is dark and the door is on a latch.*

- strip: Strip the log onto your deck. → door-log / blazers [check tech 65 grid · rue +15 · silas +15 · ember +10]
- grab: Take the whole logger off the wall. → door-log / blazers [check body 65 · ines +15, alarm +1]

## door-log
*A month of doors, every one of them with a time and a name. The Cat would pay a fortune never to see this again.*
pay: +200
→ end

## blazers
*The light comes on. Two blazers fill the doorway, and the conversation that follows costs you everything you lifted on the way out, and a cut of your fee besides.*
lost
→ end
