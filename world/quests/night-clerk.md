---
title: Night Clerk
kind: mission
tier: 2
template: true
starts: under-the-cat
after: null
pitch: Forty seconds of hotel camera somebody wants gone before morning.
posted-by: A fixer under the Cat, for a guest who won't give a name.
brief: The hotel under the Cat. Forty seconds of camera sit on a recorder in a closet upstairs. Go in the front past the night clerk, or up the back where nobody looks, and get rid of them before morning.
pay: 360-440
art: night-clerk.webp
draw complication: none | guest-in-the-corridor | second-camera
draw clerk: easy | hard
---

# lobby if heat>=4

title: The Lobby
stranger: The night clerk — young, tired, a screen he watches more than the door
face: local-08
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass. Tonight he looks up when you come in, and then down at something on his screen, and then up again.*

*He has your face on there. Not a warrant. Just a face. The service stair is round the side, past the bins.*

- charm: Go to the glass anyway and be a guest. → walked-up / noticed [check cool 55 · adebayo +10, set route=front]
- stairs: Go round the side and take the service stair. → upstairs / heard [check reflex 55 · ember +10, set route=back, set quiet=yes]

# lobby

title: The Lobby
stranger: The night clerk — young, tired, a screen he watches more than the door
face: local-08
temper: clerk

*The hotel under the Cat keeps one clerk on at night, behind glass, with a screen he watches more than the door. Somewhere upstairs is a camera closet, and in it forty seconds of somebody's evening.*

*The front way is through him. The service stair is round the side, past the bins.*

- charm: Go to the glass and be a guest. → walked-up / noticed [check cool 55 · adebayo +10, set route=front]
- stairs: Go round the side and take the service stair. → upstairs / heard [check reflex 55 · ember +10, set route=back, set quiet=yes]

## walked-up
*He slides a card across and doesn't look at it again. You're a guest. Guests get signed in.*
→ desk

## noticed
*He takes the name you give him and holds it a second too long. You're a guest, and he'll know this one again.*
→ desk

## upstairs
*The stair door gives without a sound. Concrete, a mop bucket, a bulb in a cage.*
→ stairwell

## heard
*The stair door bangs once behind you. Up top, someone stops walking, and then starts again.*
→ stairwell

# desk

title: The Desk
post desk: Someone stays at the glass and keeps him talking. [suits face]
gives desk: He watches them, not the stairs. A miss on the way out doesn't lose the take.

*He turns the register round to you. His screen is angled away, but the glass behind him isn't. The key board hangs at his shoulder, fourth floor along the top.*

- read: Read his log-in off the glass while you sign. → signed / fumbled [check wits 55 · nix-direct +10, set login=yes]
- palm: Lift the fourth-floor pass off the board as he turns. → signed / fumbled [check reflex 55 · ember +10]

## signed
*He stamps it. The lift is already open.*
→ floor-front

## fumbled
*He looks at your hands, and then at the board, and then says the lift's on the left.*
→ floor-front

# floor-front

title: The Floor

*The lift opens straight into the lens. The camera over the closet door sweeps the corridor, stops on the lift, sweeps back. You are a guest on the fourth floor, and it has seen guests before.*

[complication=guest-in-the-corridor] *A man in a hotel robe is at the ice machine, in no hurry.*

- stroll: Walk it like a guest who can't find his room. → passed / stared [check reflex 55 · ember +10]
- cart: Put your shoulder to the linen cart and work behind it. → passed / stared [check body 55 · ines +10]

## passed
*The lens goes over you and on. The closet lock takes less time than the walk did.*
→ closet

## stared
*The lens stops on you for a moment too long before it moves on. You're in the closet, and you don't know who was watching.*
→ closet

# stairwell

title: The Stairwell
post door: Someone holds the service door at the bottom. [suits muscle]
gives door: The way out stays open. A miss on the way out doesn't lose the take.

*Four flights of concrete. The door at the bottom locks itself from the street side. The fire door on four has been painted shut since before the clerk was born, and the laundry comes up at ten past.*

- force: Put your shoulder through the paint on four. → up-clean / up-loud [check body 55 · ines +10]
- wait: Wait out the laundry and go up behind the cart. → up-clean / up-loud [check wits 55 · nix-direct +10]

## up-clean
*Fourth floor. Carpet cleaner, and nobody.*
→ floor-back

## up-loud
*Fourth floor. Carpet cleaner, and a door closing somewhere that was open a second ago.*
→ floor-back

# floor-back

title: The Floor

*You come out behind the lens. The camera over the closet door sweeps the corridor, stops, sweeps back. It runs on the hotel's own line, and the junction box is on your side of it.*

[complication=guest-in-the-corridor] *Somebody's ice bucket clatters at the far end. Footsteps stop, then go on.*

- blind: Splice the camera line at the junction box and feed it its last ten seconds. → unseen / swept [check tech 55 grid · rue +10 · silas +10]
- slip: Go under the sweep, on the count. → unseen / swept [check reflex 55 · ember +10]

## unseen
*The lens goes on watching an empty corridor. The closet lock takes less time than the camera did.*
→ closet

## swept
*The lens stops on you for a moment too long before it moves on. You're in the closet, and you don't know who was watching.*
→ closet

# closet

title: The Closet

*Racks of recorders, each with its own small green eye. The footage is on the third one down, behind a login screen older than you are.*

[complication=second-camera] *A second lens over the door, newer than the rest, pointed at whoever stands at the rack.*
[tech 7] *The login is a maintenance build. Somebody left the word list in its memory.*

- crack: Crack the login and wipe it clean. → clean / locked [crack 6 · if quiet +1 "you came up quiet" · if login +1 "you read his log-in"]
- pull: Pull the drive and walk out with it. → taken / locked [check body 50 · ines +10, alarm +1]

## clean
*Forty seconds of nothing, stitched in so well the timestamps never stutter.*
→ out

## locked
*The rack goes red and stays red. Somewhere downstairs a light on the clerk's board starts blinking. You get half of it and go.*
take: part
→ out

## taken
*The drive is warm in your pocket. It's done, but the gap in the footage will be noticed.*
→ out

# out if route=front and alarm>=2

title: The Way Out

*The lift lets you out into the lobby. Two men in hotel blazers are at the glass with the clerk, not hurrying, talking into their collars. The street door is past all three.*

- walk: Walk out past them like a man who's paid. → home / caught [check cool 50 · adebayo +10 · if post.desk=fit +10 "your face has the glass"]
- loop: Loop the lobby camera on his screen and go behind it. → home / caught [check tech 50 · nix-direct +10]

# out if route=front

title: The Way Out

*The lift lets you out into the lobby. The clerk is back behind his glass, and he signed you in: your name, the time, his own initials. The street door is past him.*

- walk: Walk out past him like a man who's paid. → home / caught [check cool 50 · adebayo +10 · if post.desk=fit +10 "your face has the glass"]
- loop: Loop the lobby camera on his screen and go behind it. → home / caught [check tech 50 · nix-direct +10]

# out if alarm>=2

title: The Way Out

*Back at the head of the stair. Two men in hotel blazers are coming up the main flight, not hurrying, talking into their collars. The service door at the bottom is the only way that isn't through them.*

[post.door] *It's open, because someone you brought is standing in it.*

- drop: Go down the service stair three steps at a time. → home / caught [check reflex 50 · ember +10]
- door: Hit the bottom door before it knows you're coming. → home / caught [check body 50 · ines +10 · if post.door=fit +10 "your muscle has the door"]

# out

title: The Way Out

*Back at the head of the stair. Four flights down is the service door, the kind that locks itself from the street side.*

[post.door] *Tonight it's open, because someone you brought is standing in it.*

- drop: Go down quiet and work the latch. → home / caught [check reflex 50 · ember +10]
- door: Put your shoulder to it and be gone. → home / caught [check body 50 · ines +10 · if post.door=fit +10 "your muscle has the door"]

## home
*Under the Cat the rain's still coming down. Nobody follows you out.*
pay: full
→ end

## caught if post.desk
*His hand finds the handset, and it's the glass he's looking at, not you: whoever you left there, still talking. The blazers come for them. You're through the street door with half of what you came for, and one fewer.*
pay: full
take: part
post desk: held
→ end

## caught if post.door
*The door at the bottom is open, because someone is standing in it. They take what was coming down the stair after you. You're in the alley with half of what you came for.*
pay: full
take: part
post door: hurt
→ end

## caught
*The clerk has the handset to his ear, and the blazers are between you and the street. You leave fast, with nothing to show for the night.*
take: none
→ end

# push-1

*Under the Cat, the service stair round the side is still unlocked. Upstairs, the recorder next to yours holds the same night, other rooms: a floor of other people's evenings, and some of them would pay to have theirs back.*

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
