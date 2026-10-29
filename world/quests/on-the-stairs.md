---
title: On the Stairs
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A collector is sitting on the Intake's stairs, waiting for a client to come out. He bought her debt this week.
pay: 60-140
minutes: 20
posts: 20:00-02:00
trust: 1 / 1
---

# stairs
stranger: Marek — a debt collector, slate in his lap, in no hurry at all

*The collector sits halfway down the Intake's stairs with his slate on his knee, so anyone going up or down has to step around him. The client he wants is upstairs in the quiet room, and she isn't coming out while he's there.*

view nix-direct: Nobody waits on your stairs. That's the one rule of the room, and he's sitting on it. Your client bought six months of script on a payment plan, and a house sold the plan on. He doesn't care who she is. He cares that she's on his slate.

- talk: Sit down next to him and talk him off the stairs. → moved / dug-in [check cool 55 · nix-direct +10]
- rule: Let Nix tell him the rule of the room. → moved / dug-in [check cool 45 · nix-direct +20, needs with=nix-direct]
- wait: Wait him out. → dug-in [clock +1h]

## moved
*He stands, takes his slate and goes down to Hae's to wait somewhere warmer. The debt goes with him.*
→ slate

## dug-in
*He stays where he is. "I've got all night," he says, "and she hasn't."*
→ slate

# slate

*The debt lives on his slate: one line, her name, the house it came from, the amount, the date it doubles. He keeps the slate on a strap around his wrist.*

- crack: Crack his slate while he eats and wipe her line. → wiped / locked [crack 6]
- buy: Make him an offer for the line. → bought / refused [check wits 50]
- leave: Leave the debt and walk her out the back. → out

## wiped
*Her line's gone. The house will find out at the end of the month, and it won't know who to blame.*
pay: full
take: full
→ end

## bought
*He sells the line for less than it's worth, because selling is quicker than waiting.*
pay: half
take: full
→ end

## refused
*He names a number twice what she owes, and goes back to his bowl.*
take: part
→ end

## locked
*The slate locks itself and starts beeping. He looks down at his wrist, then up at you, and adds a line for you under hers.*
take: none
heat: +1
blown
→ end

## out
*She goes down the back stairs past the broth pipes with her coat over her head. The debt's still on his slate, and tomorrow it's still owed.*
pay: half
take: part
→ end
