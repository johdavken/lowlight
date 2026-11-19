---
title: Crew Fixture
kind: mission
rules: crew
tier: 1
with: [nix-direct]
starts: haes-noodles
after: null
pitch: A yard, a hut and a gate, on crew rules.
pay: 400
clock seen: SEEN · 3
---

# yard

*The yard at night: a gate man, a fence, a dog somewhere.*

- badge: Show the badge at the gate. [short THE BADGE]
  · you scheduler: Show it the way a scheduler would. → in [take 1, alarm 1]
  · you branch: Show it the way they taught you. → in [take 2, seen 1]
  · runner: Over the fence while the gate man looks at you. → in [take 2, heat 1]
- round: Go round the back.
  · you: Walk round by the rigs. → in [take 1, heat 1]
  · face: Talk to the dog man. → in [take 1, cut 10]

## in

*You're in.*

→ hut

# hut

*The hut, the terminal, the night man asleep.*

view nix-direct: You're on his ear for the hut.

- terminal: Go in through the terminal. [short THE TERMINAL]
  · you: Hunt and peck. → found [take 1, alarm 1]
  · program: Let the deck do it. → found [take 2, seen 1]
  · contact: Ask her to take the lacquer off. → found [take 1, set asked=yes]
  · runner: Lift his whole session. → found [take 3, alarm 1]
- press: Lean on the night man.
  · you: Lean on him. → found [take 2, alarm 2]

## found

*The sheet is there.*

→ out

# out

*The gate again, from the inside.*

- gate: Go out the gate. [short THE GATE]
  · you: Walk out past the lights. → home [take 1, lose 1] if alarm>=2
  · you: Walk out easy. → home [take 1, alarm 1]
  · face: Walk out on the badge they held for you. → home [take 1] if door=held
- fence: Back over the fence.
  · you: Over the wire with the sheet. → home [heat 1]

## home

*Home with the sheet.*

pay: full
→ end

# getaway

*The horn goes.*

- run: Run for it.
  · you: Over the rigs on foot. → stuck [heat 1]
- hide: Hide in a rig until it quiets.
  · you: Wait it out in the dark. → stuck [alarm 1]

## stuck

*Stuck on the rigs with nothing.*

take: none
→ end
