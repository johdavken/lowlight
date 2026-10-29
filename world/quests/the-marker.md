---
title: The Marker
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A client's son put his residency card down as a marker at the Low Roller. The house won't give it back.
pay: 50-130
posts: 20:00-02:00
trust: 1 / 1
comms: low-roller
---

# client
stranger: Otto — a client, sixty, hands that shake when he talks about his son

*Otto's son put his residency card on a table at the Low Roller as a marker, and lost the hand. Without the card he can't work, can't rent, can't leave. The house keeps markers in the cage until the debt's paid, and the debt grows by the week.*

view nix-direct: You've seen what a house does with a card it holds. You won't walk onto the Strand for it. You'll talk someone through it from here.

- go: Say you'll go to the Low Roller with Nix on the line. → sent
- read: Read Otto's papers for the debt first. → sent-ready [clock +30m]

## sent
*You head out to the Strand. Nix stays at her desk with the line open.*
→ cage
wait: at low-roller · comms · by 02:00 else missed

## sent-ready
*The marker's for nine hundred sol, and the son's name is spelled wrong on the receipt. That's something.*
→ cage
wait: at low-roller · comms · by 02:00 else missed

## missed
*By the time you'd have reached the Strand, the cage has closed for the night, and in the morning the card goes to a buyer.*
take: none
blown
→ end

# cage
stranger: The cashier — behind the mesh, counting chips into stacks of twenty

*The cage holds the night's markers in a drawer of small envelopes, each with a name on it. The cashier doesn't look up.*

view nix-direct: Through their eyes you can see the cashier's hands. She counts too carefully for someone who isn't being watched. Who's watching her?

- argue: Argue the misspelled name voids the marker. → returned / refused [check wits 50 · nix-direct +10]
- buy: Buy the marker back for less. → returned / refused [check cool 55]
- lift: Lift the envelope while Nix talks you through her blind spot. → returned / caught [check reflex 50, needs with=nix-direct]

## returned
*The envelope comes through the slot. The card's inside, bent but whole.*
pay: full
take: full
→ end

## refused
*The cashier slides the drawer shut. "Pay the marker," she says, "or don't come back."*
take: part
→ end

## caught
*A pit boss's hand lands on your wrist. The envelope goes back in the drawer, and your face goes on the house's list.*
take: none
heat: +1
blown
→ end
