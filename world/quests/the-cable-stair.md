---
title: The Cable Stair
art: the-cable-stair.webp
kind: mission
tier: 1
starts: long-haul
after: null
pitch: A hanger family's rent went up the cable stair under Pylon Forty and never reached the landlord. The family says someone on the stair took it. Oksana wants it found first.
pay: 90-110
once: true
---

# counter

stranger: The hanger's daughter — fourteen, a voice that won't shake in front of you
face: local-06

*Word came up from Oksana's: a kid from the hangers is waiting at the Long Haul's counter with a mug of tea she can't afford, watching the door. When you sit down she puts a rent book on the counter between you. The last page is torn out.*

*"Dad paid it. On the stair. To the landlord's man. He came back without the receipt and now they're saying he never paid."*

- listen: Let her tell it all the way through, and ask nothing until she's done. → story / story-thin [check wits 45 · rue +10 · oksana +15]
- push: Ask her straight who was on the stair that night. → story / story-thin [check cool 50]

## story
*She tells it plain. Her dad climbed the cable stair at midnight with the money in his shirt. Halfway down, between Forty and Forty-One, the stair lights went out, and when they came back he was sitting on the grating and the money wasn't in his shirt any more.*
→ stair

## story-thin
*She gives you the stair and the time, and then she stops trusting you, and you get nothing else.*
take: part
→ stair

# stair

*The cable stair hangs from the deck girders between Forty and Forty-One and sways when anyone uses it. Under the grating is a long way down. Halfway along, the junction box for the stair lights hangs open, and somebody's spliced a switch into it.*

- box: Trace where the spliced switch runs to. → traced / lost-the-wire [check tech 50 · silas +10]
- walk: Walk the stair at midnight the way he did and watch who watches you. → traced / lost-the-wire [check wits 50, clock +40m]
- climb: Climb out under the stair along the girder and look from below. → traced / lost-the-wire [check reflex 40, alarm +1]

## traced
*The switch runs to a hanger at the far end. The window's taped over from inside. Somebody in there turns the stair dark when they want to.*
→ neighbours

## lost-the-wire
*You lose the wire where it goes under the deck plate, but you don't need it: a hanger at the far end has its window taped over from inside, and the tape is new.*
heat: +1
→ neighbours

# neighbours

*Between you and the taped window, four hangers hang off the same girder, close enough to hear each other cough. Doors open a crack when you pass and close again. Everyone on this stretch owes somebody.*

- ask: Ask at each door who's been short on rent and suddenly isn't. → named / doors-shut [check wits 50 · oksana +10]
- wait: Sit on the stair with a flask and let them come to you. → named / doors-shut [check cool 45 · garro +10, clock +30m]

## named
*An old woman two doors down says it without being asked: he hasn't paid in three weeks, and last night he bought her a bag of dumplings from Oksana's. She didn't ask where from.*
→ hanger

## doors-shut
*Nobody says anything. Somebody on the stretch goes down the stair while you're asking, fast, to tell somebody you're here.*
heat: +1
→ hanger

# hanger

stranger: The man in the hanger — older, soft-spoken, three weeks behind on his own rent
face: local-02

*He opens the door before you knock. He's thinner than his voice. Behind him, a cot, a hotplate, the switch's other end screwed to the wall beside a coffee tin.*

*"I didn't hurt anybody," he says. "I turned the lights off. That's all I did."*

[alarm>=2] *Down the stair, a torch is coming up. The landlord's man, early.*

- talk: Tell him the landlord's man is on his way, and see what he does with that. → owned-up / bolted [check cool 45 · oksana +10 · garro +10]
- tin: Take the coffee tin off the wall before he can. → owned-up / bolted [check reflex 50]
- block: Stand in the door so he has nowhere to go but the truth. → owned-up / bolted [check body 45, alarm +1]

## owned-up
*He sits down on the cot and hands you the tin. The money's in it, every note, and the receipt torn out of a rent book, folded small. He never spent any of it.*
→ down

## bolted
*He goes out the back window onto the girder with the tin, and halfway along he stops, and he throws you the tin rather than drop it. Some of it falls anyway, a long way down into the dark.*
take: part
→ down

# down

*Down the cable stair, swaying, with a coffee tin of somebody else's rent under your coat. The landlord's man is at the foot of the stair, waiting for anyone coming down.*

- past: Walk past him like you live here. → home / stopped [check cool 50]
- round: Go round by the girders and come out by Oksana's instead. → home / stopped [check reflex 45, clock +20m]

## home
*The kid counts it twice on Oksana's counter, then takes it up the stair herself. Oksana puts a glass of tea in front of you and a fold of notes under it from the hangers' tab.*
pay: full
take: full
gives: recruit runner hand
→ end

## stopped
*The landlord's man takes the tin off you for "safekeeping" and counts it in front of you, slowly. He gives the family a receipt. He keeps a cut. Oksana pays you what's left of what she promised, and doesn't say what she thinks of it.*
pay: half
take: part
heat: +1
→ end
