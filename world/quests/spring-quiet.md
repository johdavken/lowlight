---
title: Paper Out
art: spring-quiet.webp
kind: mission
spring: true
after: null
pitch: SDG has {recruit} on a holding floor in the Sentinel Tower. Their people know a clerk, a door and a shift change. Walk them out on paper.
minutes: 20
---

# word

stranger: The cousin — thirties, a dock jacket, a phone with a cracked screen held like it might ring
face: local-06

*{recruit}'s cousin doesn't sit. "Holding floor nine. They process at four. After four it's a court number and nobody gets a court number back." A slip of paper goes across the table: a clerk's name, a shift, a door.*

- clerk: Ask what the clerk wants, and what she's afraid of. → read / half-read [check wits 45]
- shift: Ask when the floor changes hands and who walks it. → read / half-read [check cool 45]

## read
*The clerk owes money to the wrong people and hates the night sergeant. The floor changes hands at two. For ten minutes nobody owns it.*
→ desk

## half-read
*You get the clerk's name and the shift. You don't get why she'd help.*
→ desk

# desk

stranger: The clerk — sixties, reading glasses on a chain, nails bitten to nothing
face: local-07

*The intake desk on nine is a counter behind glass with a slot in it. The clerk looks at you over her glasses and keeps typing.*

[tech 6] *Her terminal's on SDG's own grid, and somebody's left a release form open in another window.*

- forms: Fill in a transfer order and slide it through the slot. → released / queried [check tech 50 grid]
- favour: Tell her who she owes, and that you could make that go away. → released / queried [check cool 50, set leaned=yes]
- wait: Wait for the shift change and the ten minutes nobody owns. → released / queried [check reflex 45, clock +40m]

## released
*She stamps it without reading it. Somewhere down the corridor a door buzzes.*
→ corridor

## queried
*She reads it twice. She picks up the phone, and puts it down, and stamps it. Her hand isn't steady.*
heat: +1
→ corridor

# corridor

*{recruit} comes down the corridor with a guard on each side, in a paper shirt, a bruise going yellow under one eye. They see you and keep their face still. Good.*

[leaned=yes] *The clerk is watching you through the glass. She won't forget your face.*

- sign: Sign for them like it's routine and walk. → out / stopped [check cool 50]
- hurry: Take their arm and move before anyone reads the order. → out / caught [check reflex 50, alarm +1]

## out
*The lift doors close on floor nine. {recruit} lets out a breath they've been holding for two days.*
take: full
→ street

## stopped
*The night sergeant comes out of an office with the transfer order in his hand. It takes a long time and a short lie to get past him. He takes your name.*
heat: +2
take: part
→ street

## caught
*The guard on the left gets a hand on your collar and the one on the right gets {recruit} back through the door. The last thing you see is the paper shirt going the wrong way down the corridor.*
heat: +2
blown
→ end

# street

*Outside, the Tower's lights go all the way up into the cloud. {recruit} stands in the rain and doesn't say anything for a while.*

- home: Get them home before anyone checks the order. → home
- talk: Ask what they told SDG. → home-told [clock +10m]

## home
*The cousin is waiting with a coat. Nobody says thank you. Nobody needs to.*
→ end

## home-told
*"Nothing," {recruit} says. "Name, district, nothing." Then, after a block: "They asked about you."*
→ end
