---
title: Dead Air
kind: mission
tier: 1
with: [silas, ember, hicks, cass, nix-direct]
starts: second-socket
after: null
pitch: Something on Second Socket's roof is broadcasting a tracking tone. Find it and kill it before the wrong people listen.
pay: 180-240
draw complication: none | bird-nest | someone-on-the-roof
draw squatter: easy | hard
---

# roof if heat>=4

*The roof hatch sticks, then gives. Up here the rain comes sideways and the Ribbon's lights smear across the wet tar.*

*There's a drone sitting on the next roof over with its lens turned this way. It hasn't moved in a minute.*

- low: Stay low and work along the parapet. → found / seen [check reflex 50]
- jam: Blind the drone first. → found / seen [check tech 45 grid · ember +15, alarm +1]

# roof

*The roof hatch sticks, then gives. Up here the rain comes sideways, and somewhere in the forest of dishes and dead aerials something is chirping, very quietly, every eleven seconds.*

[complication=bird-nest] *Gulls have nested in the old satellite dish. They don't like you.*
[tech 6] *Eleven seconds is a beacon's interval. Cheap, and old, and somebody's.*

- listen: Find it by ear, aerial by aerial. → found / seen [check wits 45 · hicks +10, set listened=yes]
- scan: Sweep for it on your deck. → found / seen [check tech 45 grid · silas +10]

## found
*It's taped inside a dead aerial's junction box: a beacon the size of a matchbox, with a fresh battery.*
→ beacon

## seen
*You find it, but a hatch bangs open across the roof and a face looks out at you, then ducks back in.*
heat: +1
→ beacon

# beacon if alarm>=1

stranger: The squatter — an old wireman who lives in the stair tower and thinks the roof is his
temper: squatter

*He's out on the roof in his slippers now, with a torch. "That's mine," he says. "Somebody pays me to keep it ticking."*

- talk: Tell him who's listening to it. → killed / argued [check cool 45 · cass +10 · if listened +10 "you know what it is"]
- take: Take it off him. → killed / argued [check body 45]

# beacon

*The beacon chirps in your hand. Smash it and whoever's listening knows it's gone. Leave it chirping somewhere else and they follow it there.*

- smash: Smash it. → killed
- move: Tape it to a delivery drone headed for the Strand. → moved / killed [check tech 45 · ember +10 · if listened +10 "you know its interval"]

## killed
*It stops. The roof's just rain again.*
pay: full
take: full
→ down

## argued
*He wins the argument the only way he can: he shouts until half the block's windows are lit. You get the beacon, and an audience.*
heat: +1
pay: half
take: part
→ down

## moved
*It chirps away south over the rooftops. Somebody's going to spend a long night on the Strand.*
pay: full
take: full
heat: -1
→ down

# down if alarm>=2

*At the foot of the stair tower a van is idling with its lights off. Somebody heard the beacon stop.*

- ladder: Climb down the fire ladder into the alley instead. → home / seen-leaving [check reflex 45]
- wait: Wait on the roof until it goes. → home [clock +1h]

# down

*The hatch, the stair tower, the smell of somebody's dinner on the third floor.*

- stairs: Take the stairs down and out. → home
- ladder: Take the fire ladder down, just in case. → home [clock +20m]

## home
*Back in Second Socket the bench light's still on. Nobody followed you down.*
→ end

## seen-leaving
*Your foot slips on the last rung. The van's lights come on, and stay on you all the way to the corner.*
heat: +1
→ end
