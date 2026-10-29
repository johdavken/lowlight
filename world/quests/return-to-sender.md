---
title: Return to Sender
kind: mission
tier: 1
with: [silas, ember, hicks, cass, nix-direct]
starts: second-socket
after: null
pitch: A repaired deck, a client in the Spine, and a market between you that wants it more than he does.
pay: 200-260
draw complication: none | tail | rain-closed-the-bridge
draw client: easy | hard
---

# market if heat>=4

*The deck's wrapped in a noodle bag and it's still warm from the bench. Between Second Socket and the Spine is the night market, and tonight every second stall has somebody leaning on it who isn't buying.*

*They're looking for faces. Yours is one of them.*

- crowd: Go through the thick of it, head down. → through / jostled [check reflex 50 · ember +10]
- roofs: Go over the stall roofs, where nobody looks. → through / jostled [check body 45, set roofs=yes]

# market

*The deck's wrapped in a noodle bag and it's still warm from the bench. Between Second Socket and the Spine is the night market: steam, wet tarps, a thousand hands.*

[complication=tail] *A kid in a yellow mac has been three stalls behind you since the shutter. Every time you stop, so does she.*
[wits 6] *The kid's mac is dry. She hasn't been out in this rain long. Somebody dropped her off.*

- crowd: Go through the thick of it, head down. → through / jostled [check reflex 45 · ember +10]
- roofs: Go over the stall roofs, where nobody looks. → through / jostled [check body 45, set roofs=yes]
- shake: Lose the tail in the fish stalls first. → through [needs complication=tail, clock +30m, set shook=yes]

## through
*You come out the far side with the bag still under your arm and nobody's eyes on it.*
→ crossing

## jostled
*A shoulder, a hand, a kid running. The bag's still there, but something in it rattles that didn't before.*
heat: +1
take: part
→ crossing

# crossing if complication=rain-closed-the-bridge

*The footbridge to the Spine is chained off, water sheeting over its rail. The only other way across is the cable gantry, forty metres up, slick as glass.*

- gantry: Cross on the gantry. → across / slipped [check body 45 · hicks +10]
- around: Go the long way round by the Strand. → across [clock +1h]

# crossing

*The footbridge to the Spine hums under your boots. Halfway over, the lights flicker, and the whole Ribbon goes dark for a second behind you.*

- keep: Keep walking. → across
- stop: Stop in the dark and watch who else stops. → across [clock +20m, set shook=yes]

## across
*The Spine's lower deck. Steam from the vents, a vending machine selling one brand of everything.*
→ handoff

## slipped
*Your foot goes and your hand catches the cable. The bag swings out over the drop and comes back. Something in it doesn't.*
take: part
→ handoff

# handoff if alarm>=1

stranger: The client — a courier with a ruined knee and a grudge against stairs
temper: client

*He's waiting on the Spine's lower deck with his collar up. He's already heard there was trouble in the market.*

*"Is it whole?" he says, before hello.*

- show: Open the bag and let him test it. → paid / short [check cool 50 · if roofs +10 "you came over the roofs"]
- lie: Tell him it's fine and hand it over. → paid / short [check cool 40]

# handoff

stranger: The client — a courier with a ruined knee and a grudge against stairs
temper: client

*He's waiting on the Spine's lower deck with his collar up. He takes the bag and weighs it in his hand before he looks inside.*

- show: Let him test it there and then. → paid / short [check tech 45 · silas +10 · if shook +10 "nobody followed you here"]
- wait: Stand in the rain while he checks every port. → paid [clock +30m]

## paid
*He boots it, listens to the fan, and nods once. The money's in a folded paper bag. It's all there.*
pay: full
→ end

## short
*He finds the fault in a minute. He pays, but he pays for what he got.*
pay: half
take: part
→ end
