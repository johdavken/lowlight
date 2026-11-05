---
title: The Van
art: spring-loud.webp
kind: mission
spring: true
after: null
pitch: SDG moves {recruit} from the Tower to county intake at dawn, in a van with two guards. Their people know the route. Take the van.
minutes: 20
---

# route

stranger: The friend — twenties, shaved head, a burn scar up one forearm, talking too fast
face: local-08

*"Dawn transfer, Tower to county. Same van every time, same two guards, same route under the Spine." The friend draws it on a napkin with a borrowed pen: the ramp, the pylons, the one light that's always red.*

- light: Ask how long the red light holds and what stops beside it. → planned / rushed [check wits 45]
- guards: Ask about the two guards: who drives, who's armed, who's tired. → planned / rushed [check cool 45]

## planned
*The light holds ninety seconds. The driver smokes with the window down. The other one sleeps.*
→ stop

## rushed
*You get the route and the light. The rest you'll find out at the light.*
→ stop

# stop

*Under the Spine the light is red, like they said. The van idles at the line, grey, no markings, one window down an inch.*

[cool 6] *You know how to stand at a red light like you're waiting for a bus.*

- block: Put a car across the lane in front of it. → stopped / rolling [check body 45, alarm +1]
- jam: Jam the van's locks from the pylon box. → stopped / rolling [check tech 50 grid]
- ask: Walk up to the window and ask the driver for a light. → stopped / rolling [check cool 50, set talked=yes]

## stopped
*The van isn't going anywhere. The driver's hand goes to his radio and stays there, not sure yet.*
→ doors

## rolling
*The light changes. The van moves, slow, and the driver's looking at you now. You have one more chance before the ramp.*
heat: +1
→ doors

# doors

*The back doors are a padlock and a bar. {recruit} is behind them. You can hear someone banging on the inside, steady, like a clock.*

[talked=yes] *The driver remembers your face. He'll remember it in a statement, too.*

- cut: Cut the padlock and pull the bar. → open / radioed [check reflex 50, alarm +1]
- keys: Take the keys from the driver. → open / taken [check body 50, alarm +1]

## open
*The doors swing. {recruit} comes out low and fast, cuffs still on, and doesn't look back at the van.*
take: full
→ away

## radioed
*The doors open, but the radio's open too. Sirens start somewhere up on the Spine.*
heat: +2
take: part
→ away

## taken
*The driver's bigger than he looked. By the time you have the keys there's a second van at the light, and {recruit} is in it, and it's going.*
heat: +2
blown
→ end

# away

*Under the pylons the dark goes on for blocks. {recruit} holds the cuffs out without a word.*

- cuffs: Get the cuffs off before you go anywhere near a camera. → gone [clock +15m]
- run: Run now and deal with the cuffs later. → gone-loud [alarm +1]

## gone
*The cuffs go in the canal. {recruit} rubs their wrists and says your name once, like they're writing it down.*
→ end

## gone-loud
*You run the whole way with the cuffs clinking, and the city hears every step. Nobody stops you. Somebody will remember.*
heat: +1
→ end
