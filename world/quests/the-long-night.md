---
title: The Long Night
art: the-long-night.webp
kind: mission
tier: 2
template: true
starts: the-tilt
after: null
pitch: A high roller owes the Tilt more than he has. Collect before he's on the dawn train.
pay: 360-440
draw complication: none | bodyguard | already-packing
draw roller: easy | hard
---

# bar if heat>=4

*He's at the end of the Tilt's bar in a good coat, drinking slowly. When he sees you he puts money on the counter, enough for the drink and a little more. The barman pockets it and starts looking the other way.*

[complication=bodyguard] *The man two stools down hasn't touched his drink. He's watching the mirror, not the room.*

- sit: Sit next to him and buy the next one before he can go. → close / spooked [check cool 50 · cass +10, set bought=yes]
- wait: Let him go and follow him out. → close / spooked [check reflex 50, set followed=yes]

# bar

*He's at the end of the Tilt's bar in a good coat, drinking slowly, a train ticket for 05:40 sticking out of his breast pocket.*

[complication=bodyguard] *The man two stools down hasn't touched his drink. He's watching the mirror, not the room.*
[wits 7] *The ticket's for the Spine line, not the coast. He's not running far. He's running to someone.*

- sit: Sit next to him and buy the next one. → close / spooked [check cool 55 · cass +10, set bought=yes]
- wait: Let him go and follow him out. → close / spooked [check reflex 55, set followed=yes]

## close
*He knows what you are before you say a word. He finishes his drink, takes his coat and goes out the side door without hurrying. He wants this done somewhere else.*
→ street

## spooked
*He's up and out the side door with his coat over his arm, and he's moving fast.*
→ street

# street

*He takes the alley behind the Tilt, the one with no cameras, and keeps walking, down towards the station. He knows the way. So do you.*

[complication=bodyguard] *The man from the bar is a few doors back, matching him step for step.*
[complication=already-packing] *He's got a cab waiting at the far end, engine running.*

- cut: Cut through the kitchens and meet him at the arcade. → alone / company [check wits 55 · nix-direct +10]
- block: Step into the doorway ahead of him and stay there. → alone / company [check body 55 · ines +10]

## alone
*He stops. He doesn't run. He looks tired.*
→ talk

## company
*He stops, and he's not alone now. Somebody he's paying stands at his shoulder and looks at your hands.*
→ talk

# talk if alarm>=1

stranger: The roller — a good coat, a bad night, a man who used to be lucky
face: local-04
temper: roller

*He's angry, and he's frightened, and there's a lot of street around you both. "I can't," he says. "Not tonight."*

- press: Press him. Tonight or never. → paid / part [check cool 50 · mother-rot +15]
- read: Find out who he's running to. → leverage / part [check wits 50 · nix-direct +15 · soren +15]

# talk

stranger: The roller — a good coat, a bad night, a man who used to be lucky
face: local-04
temper: roller

*"I can't," he says. "Not all of it." He means it.*

- press: Press him for all of it. → paid / part [check cool 55 · mother-rot +15 · if bought +10 "you bought him a drink"]
- read: Find out who he's running to. → leverage / part [check wits 55 · nix-direct +15 · soren +15 · if followed +10 "you followed him"]

## paid
*He empties his wallet and both coat pockets, and then his watch. It comes out right.*
→ count

## leverage
*A sister in the Spine, with a shop he paid for. He goes white when you say her name. He pays.*
→ count

## part
*He pays what he has and swears to the rest. The pit boss won't like it.*
take: part
→ count

# count

*Half of what he gave you is a bearer card still tied to his thumb, and it times out at dawn. The rest is in your coat, in a street where people count coats.*

- clear: Clear the card now, on the kerb, while it still knows him. → counted / short [check tech 50 · rue +10 · silas +10]
- move: Get it off the street before his friends hear what he paid. → counted / short [check reflex 50 · hicks +10]

## counted
*Nobody follows. The card clears, and what he gave you is all there. An hour to get it back to the Tilt.*
→ station

## short
*You don't get clear. Two men on the corner watch you go, and one of them takes out a phone.*
→ station

# station

*The 05:40 for the Spine is boarding. He's at the barrier with one bag, not looking back. The way back to the Tilt runs through the concourse, and two men in station grey are asking the ticket clerk about a man in a good coat, and whoever he paid tonight.*

- walk: Walk past them with a ticket in your hand. → home / rolled [check cool 50 · cass +10]
- freight: Go over the barrier at the freight end. → home / rolled [check body 50 · ines +10]

## home
*The Tilt's pit boss counts it twice. "Long night," he says.*
pay: full
→ end

## rolled
*They aren't station. They take everything he gave you, and they're polite about it. You tell the pit boss the truth, which is worse.*
take: none
→ end
