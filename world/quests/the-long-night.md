---
title: The Long Night
kind: mission
tier: 2
with: [cass, hicks, ember, silas, nix-direct]
starts: the-tilt
after: null
pitch: A high roller owes the Tilt more than he has. Collect before he's on the dawn train.
pay: 400-520
draw complication: none | bodyguard | already-packing
draw roller: easy | hard
---

# bar if heat>=4

*He's at the end of the Tilt's bar in a good coat, drinking slowly. When he sees you he puts money on the counter, enough for the drink and a little more. The barman pockets it and starts looking the other way.*

- sit: Sit next to him before he can go. → close / spooked [check reflex 50]
- wait: Let him go and follow him out. → close [clock +30m, set followed=yes]

# bar

*He's at the end of the Tilt's bar in a good coat, drinking slowly, a train ticket for 05:40 sticking out of his breast pocket.*

[complication=bodyguard] *The man two stools down hasn't touched his drink. He's watching the mirror, not the room.*
[wits 7] *The ticket's for the Spine line, not the coast. He's not running far. He's running to someone.*

- sit: Sit next to him and buy the next one. → close / spooked [check cool 45 · cass +10, set bought=yes]
- wait: Let him go and follow him out. → close [clock +30m, set followed=yes]

## close
*He knows what you are before you say a word. He doesn't run. He looks tired.*
→ talk

## spooked
*He's up and out the side door with his coat over his arm. You catch him on the street, but now he's angry.*
heat: +1
→ talk

# talk if alarm>=1

stranger: The roller — a good coat, a bad night, a man who used to be lucky
temper: roller

*He's angry, and he's frightened, and there's a lot of street around you both. "I can't," he says. "Not tonight."*

- press: Press him. Tonight or never. → paid / walks [check cool 55 red]
- deal: Offer him a week, for interest. → part [set dealt=yes]

# talk

stranger: The roller — a good coat, a bad night, a man who used to be lucky
temper: roller

*"I can't," he says. "Not all of it." He means it.*

- press: Press him for all of it. → paid / walks [check cool 50 red · if bought +10 "you bought him a drink"]
- read: Find out who he's running to. → leverage / walks [check wits 45 · nix-direct +15 · if followed +10 "you followed him"]
- deal: Offer him a week, for interest. → part [set dealt=yes]

## paid
*He empties his wallet and both coat pockets onto the bar, and then his watch. It comes out right.*
take: full
→ station

## leverage
*A sister in the Spine, with a shop he paid for. He goes white when you say her name. He pays.*
take: full
→ station

## part
*He pays what he has and swears to the rest. The pit boss won't like it.*
take: part
→ station

## walks
*He walks away from you, out into the rain, and you let him. Some nights you lose.*
take: none
→ end

# station

*The 05:40 for the Spine is boarding. He's at the barrier with one bag, not looking back.*

- let: Let him go. → home
- see: Watch him onto the train to be sure. → home [clock +30m]

## home
*The Tilt's pit boss counts it twice. "Long night," he says.*
pay: full
→ end
