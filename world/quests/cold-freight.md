---
title: Cold Freight
art: cold-freight.webp
kind: mission
tier: 1
starts: long-haul
after: null
pitch: A man in a grey coat in the corner booth wants a look inside a hauler's trailer before it crosses into Nexus at dawn. He doesn't say who he works for. He doesn't have to.
pay: 90-110
---

# booth

stranger: The man in the grey coat — quiet, polite, a voice that never needs to go up
face: local-05

*The corner booth at the far end of the Long Haul. He has a coffee he hasn't touched and a photo of a trailer number on the table, face up. Outside the window the haulers sit in a row with their marker lights on.*

*"The fourth rig. The driver eats here at one and sleeps in the cab until four. I want to know what's under the false floor. I don't want anything moved."*

- wait: Wait for the driver to eat and walk out to the rig behind him. → yard / yard-seen [check reflex 50]
- driver: Sit at the counter next to the driver and get talking. → yard / yard-seen [check cool 45 · rue +10 · adebayo +10]

## yard
*Nobody looks at you twice. The rigs tick in the cold, and the fourth one's cab curtains are already drawn.*
→ trailer

## yard-seen
*The driver clocks you on the ramp and looks a second too long. He goes to sleep anyway, but he goes to sleep facing the mirror.*
heat: +1
take: part
→ trailer

# trailer

*The trailer is sealed with a customs tag and a cheap lock under it. The floor sits a hand's width too high. Somewhere in the cab the driver's radio plays the freight report low.*

[wits 6] *The customs tag's been cut and glued. Somebody's been in before you.*

- lock: Work the lock without touching the tag. → open / scratched [check reflex 45]
- scan: Read the trailer's manifest chip off its frame with your deck. → open / scratched [check tech 50 grid · silas +10]
- under: Slide under the trailer and come up through the floor panel. → open / scratched [check body 50, alarm +1]

## open
*The panel comes up. Under it, in foam, rows of grey cylinders the size of a forearm, each with a frost line and a lot number. Cold to touch. Nothing on them says what they are.*
→ count

## scratched
*You get in, but you leave marks: a scratch on the lock, a lifted corner on the tag. Anyone who looks will know.*
heat: +1
take: part
→ count

# count

*Forty-two cylinders. The man in the booth wanted to know what's under the floor, and you can't tell him that by looking.*

- photo: Photograph the lot numbers, every one. → counted / counted-badly [check wits 50 · adebayo +10]
- one: Open one cylinder, just enough to see. → counted / counted-badly [check tech 45 · rue +10, alarm +1]

## counted
*You have what's under the floor: forty-two lot numbers and the inside of one cylinder, which is something you'll be trying not to think about on the way back.*
→ cab

## counted-badly
*Half the photos are blurred with frost. The rest will have to do.*
take: part
→ cab

# cab

*The cab door opens behind you. The driver's awake, in his socks, with a tyre iron he's not sure he wants to use.*

*"That's not my load," he says. "That's not my load and I don't want to know."*

[alarm>=2] *He's already on the radio to somebody, and somebody's answering.*

- talk: Tell him you were never here, and neither was his load. → let-be / shouted [check cool 50 · garro +10 · oksana +10]
- go: Close the panel and walk away from him without running. → let-be / shouted [check reflex 50]

## let-be
*He looks at you for a long time and goes back to bed. He'll drive it into Nexus at four, and he'll never mention it to anyone.*
→ out

## shouted
*He shouts. Other cabs light up along the row. You're off the ramp before the first driver's boots hit the deck.*
heat: +1
take: part
→ out

# out

*Back up the service ramp, into the pink light of the Long Haul. The man in the grey coat hasn't moved. His coffee's still full.*

- give: Slide the photos across the table. → paid
- keep: Keep one photo back for yourself before you hand them over. → paid-kept [clock +10m]

## paid
*He looks at every one, nods once, and leaves an envelope under the saucer. When you look up the booth is empty and the coffee's still warm.*
pay: full
take: full
→ end

## paid-kept
*He counts the photos twice and says nothing about the one that isn't there. He pays anyway. Somebody on the sixty-first floor will want to know why it's forty-one.*
pay: full
take: full
heat: +1
→ end
