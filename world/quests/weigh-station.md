---
title: Weigh Station
art: weigh-station.webp
kind: mission
tier: 1
starts: long-haul
after: null
pitch: A driver at the counter is three tonnes over and the Spine's weigh station opens at the next junction. Get her rig past the scale tonight and she'll pay out of her bonus.
pay: 90-110
---

# counter

stranger: The driver — fifties, cropped grey hair, a laugh like a gearbox
face: local-07

*She's on her third coffee and her second slice of the pie nobody trusts. Her rig is out the window, sitting low on its springs. "Scale's run by a contractor," she says. "Cortex sensors, Aegis on the barrier. Over by three and they impound the lot and me with it."*

- plan: Ask her how the scale works, every step, and listen. → planned / half-planned [check wits 45]
- ride: Climb in the cab and ride with her to the junction. → planned / half-planned [check cool 45 · garro +10]

## planned
*Weight sensors under the road, a camera on the plate, a barrier that drops if the number's red. A man in an Aegis jacket who'd rather be asleep.*
→ sensor

## half-planned
*You get the barrier and the jacket. The rest she doesn't know, and you'll find out at the scale.*
take: part
→ sensor

# sensor

*The weigh station is a lit box at the junction with a strip of plates across both lanes. The sensor cabinet is behind a mesh fence at the roadside, humming.*

[tech 6] *The cabinet's on the grid. Somebody left the service port on.*

- spoof: Jack the cabinet and feed it a lighter number. → spoofed / spotted [check tech 50 grid · silas +10 · rue +10]
- cut: Cut the fence and pull the sensor's feed by hand. → spoofed / spotted [check reflex 45, alarm +1]

## spoofed
*The number on the cabinet's little screen drops by three tonnes and sits there, steady.*
→ barrier

## spotted
*The number drops, but the Aegis man is looking at the fence now, and the camera on the plate is looking at you.*
heat: +1
take: part
→ barrier

# barrier

stranger: The Aegis man — tired, bored, a hand never far from his belt
face: local-04

*Her rig rolls onto the plates. The light on the barrier stays amber while the system thinks. The Aegis man comes out of the box with a tablet, because amber means he has to.*

- papers: Hand him her papers and talk about the weather. → through / held-up [check cool 50]
- ease: Put a fold of notes inside the papers. → through / held-up [check wits 45, set bribed=yes]
- lean: Lean on the horn and make him decide fast. → through / held-up [check body 40, alarm +1]

## through
*The light goes green. He waves her on without looking up from the tablet.*
→ wide

## held-up
*He holds her twenty minutes while the system thinks, and in the end lets her through because the queue behind is longer than his patience. He keeps her plate number.*
heat: +1
take: part
→ wide

# wide

*Past the junction the Spine runs straight and empty for a mile. In the mirror, the weigh station's lights. On the mirror, a second set: an Aegis car coming up the lane with no siren.*

[bribed=yes] *The notes in the papers bought the barrier. They didn't buy the car.*

- slow: Tell her to hold her speed and her nerve. → clear / pulled [check cool 50]
- exit: Take the next service ramp off the deck and lose it under the pylons. → clear / pulled [check reflex 50, clock +30m]

## clear
*The car pulls level, looks at the rig, and goes on past. Whoever it was looking for, it wasn't her.*
→ drop

## pulled
*They pull her over at the next junction and write her a ticket for a light that works. It's cheaper than the scale. She laughs about it most of the way back.*
heat: +1
take: part
→ drop

# drop

*Back at the Long Haul she buys you a coffee and a slice of the pie, and makes you eat the pie.*

- take: Take your pay and the pie. → paid
- tip: Tell her which nights the cabinet's port is left on. → paid-tip [clock +10m]

## paid
*She pays out of an envelope with her bonus written on it in pencil, and crosses the number out.*
pay: full
take: full
→ end

## paid-tip
*She writes the nights on the envelope under her bonus and pays you a little extra, for later.*
pay: full
take: full
gives: recruit runner green
→ end

# push-1

*Two more rigs at the counter heard her laughing. Both of them are over. Both of them have cash.*

- again: Do it again for the next driver, tonight, while the port's still on. → second-rig / caught-twice [check tech 55 grid · silas +10]
- skip: Sell the next driver the trick and let him do it himself. → second-rig / caught-twice [check cool 50]

## second-rig
*The second rig goes through green. The driver pays in cash and doesn't ask your name.*
pay: +50
→ end

## caught-twice
*The second time, the Aegis man is awake. The barrier stays down and the rig stays put, and getting yourself out of his box costs the first driver's money.*
lost
→ end
