---
title: Room 412
kind: mission
tier: 1
with: [nix-direct, cass, hicks, ember, silas]
starts: under-the-cat
after: null
pitch: A guest checked out in a hurry and left a case in the room safe. Get it before the cleaners at six.
pay: 220-300
draw complication: none | cleaner-early | guest-came-back
draw cleaner: easy | hard
---

# corridor if heat>=4

*The fourth-floor corridor is all brown carpet and buzzing light. A hotel security man is walking it slowly, trying doors.*

- duck: Duck into the ice room until he passes. → door / seen [check reflex 50]
- walk: Walk past him like you've got a room. → door / seen [check cool 50 · cass +10]

# corridor

*The fourth-floor corridor is all brown carpet and buzzing light. Room 412 is at the far end, its DO NOT DISTURB sign still swinging.*

[complication=cleaner-early] *A cleaning trolley stands outside 410. Someone inside is singing along to a radio.*

- key: Use the master card you were given. → door
- lock: Work the lock yourself, quietly. → door / seen [check tech 40 · ember +10, set quiet=yes]

## door
*The lock blinks green. Inside, the bed's made and the wardrobe's open and empty.*
→ room

## seen
*A door opens behind you and closes again. Somebody saw a stranger at 412.*
heat: +1
→ room

# room

stranger: The cleaner — sixty, unhurried, and nobody's fool
temper: cleaner

*The safe's in the wardrobe, bolted to the floor. Behind you the room door opens. It's the cleaner, with an armful of towels, looking at you and the safe in that order.*

[complication=guest-came-back] *Out in the corridor a man's voice is asking the lift why it's so slow. He sounds like he's in a hurry.*
[cool 6] *She's not frightened. She's deciding how much this is worth to her.*

- talk: Tell her you're the guest's brother. → open / screams [check cool 45 · if quiet +10 "she didn't hear you come in"]
- pay: Fold a note into her hand. → open [clock +20m, set paid=yes]
- code: Ignore her and punch the default code. → open / stuck [check tech 45 grid · silas +10, alarm +1]

## open
*The safe door swings out. One hard case, heavier than it looks.*
take: full
→ out

## stuck
*The keypad beeps twice and locks for ten minutes. You lever the door with the room's coat hook, and it bends before the hinge does.*
take: part
→ out

## screams
*She doesn't scream. She just presses the call button on her belt, and keeps her eyes on you while she does it. You leave the safe shut and take the stairs, fast.*
take: none
→ end

# out if alarm>=2

*There are two security men at the lift now and one on the stairs. The window at the end of the corridor opens onto the fire escape, and the rain.*

- window: Go out the window and down the fire escape. → gone / dropped [check body 50]
- lift: Walk to the lift and bluff. → gone / dropped [check cool 50 · nix-direct +15]

# out

*The corridor's empty. The lift takes forever, the way it always does.*

- lift: Take the lift down. → gone
- stairs: Take the stairs, all twelve flights. → gone [clock +20m]

## gone
*Out under the Cat, the case cold in your hand. The fixer's waiting where he said he'd be.*
pay: full
→ end

## dropped
*You get out, but the case doesn't. It's somewhere on the fourth-floor landing with a hotel guard standing over it.*
take: none
heat: +1
→ end
