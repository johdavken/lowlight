---
title: Marked Cards
kind: mission
tier: 1
with: [cass, hicks, ember, silas, nix-direct]
starts: the-tilt
after: null
pitch: A rival game two doors down is taking the Tilt's regulars. Put a marked deck on its table and let it sink itself.
pay: 200-280
draw complication: none | doorman-knows-you | game-moved-upstairs
draw doorman: easy | hard
---

# door if heat>=4

stranger: The doorman — rings on every finger, a voice like gravel in a can
temper: doorman

*The rival game runs behind a laundrette two doors down from the Tilt. The doorman looks at you for a long time. He's heard your name this week, and not from friends.*

- talk: Talk your way in anyway. → in / turned-away [check cool 55 · cass +10]
- pay: Pay him double to forget your face. → in [clock +20m, set paid=yes]

# door

stranger: The doorman — rings on every finger, a voice like gravel in a can
temper: doorman

*The rival game runs behind a laundrette two doors down from the Tilt. The machines are all running and none of them have anything in them.*

[complication=doorman-knows-you] *He's worked a door you've been through before. He's trying to remember where.*

- talk: Talk your way in. → in / turned-away [check cool 45 · cass +10]
- back: Go in through the back, over the bins. → in / turned-away [check reflex 45, alarm +1]
- pay: Pay him to look at his phone. → in [clock +20m, set paid=yes]

## in
*Smoke, one bulb, eight men and a table that wants to be the Tilt's and isn't.*
→ table

## turned-away
*He shakes his head once. You go round the back and find another way in, and somebody sees you do it.*
heat: +1
→ table

# table

*The house deck sits by the dealer's elbow in its box. Yours is in your sleeve, warm, every card nicked at the corner where only a cart can feel it.*

[complication=game-moved-upstairs] *The real table's upstairs. This one's for show. You'll have to swap it on the way past.*
[wits 6] *The dealer counts the deck before every shuffle. He'll count yours too. Fifty-two, so that's fine.*

- swap: Swap the decks when the dealer turns for the drinks. → swapped / caught [check reflex 50 · if paid +10 "the doorman's looking at his phone"]
- sit: Sit in, lose a little, and swap it on the deal. → swapped / caught [check cool 45 · hicks +10]

## swapped
*The dealer opens your deck without looking at it. By the third hand the cart behind somebody's ear is already lying to him.*
take: full
→ out

## caught
*His hand closes on your wrist with the house deck still in it. "That's ours," he says. "Get out." You go, and the Tilt hears about it before you're back.*
take: none
→ end

# out if alarm>=1

*The doorman's moved. He's standing in the laundrette between you and the street, cracking his knuckles one at a time.*

- shove: Shove past him. → home / beaten [check body 50]
- talk: Tell him the Tilt sends its regards. → home / beaten [check cool 50 · cass +15]

# out

*Out through the laundrette, past the empty machines, into the rain.*

- go: Go back to the Tilt to tell them. → home
- watch: Wait across the street to watch it fall apart. → home [clock +1h]

## home
*At the Tilt the pit boss hears it out and pays you from his own pocket.*
pay: full
→ end

## beaten
*It doesn't last long. You leave with a split lip and nothing to show for it but a story.*
take: part
heat: +1
→ end
