---
title: The Field Deck
art: the-field-deck.webp
kind: mission
tier: 2
template: true
starts: long-haul
after: null
pitch: A Sentinel field deck went missing off a depot truck on the Spine. SDG counts its decks and is offering to pay for this one back. A stall at the deck market is offering more to sell it. Find it first.
posted-by: SDG's reward notice, with a deck market stall bidding against it.
brief: A hauler at the Long Haul saw a crate come off a depot truck and go down the service ramp toward Pylon Forty. Track it into the deck market and get to the deck first.
pay: 360-440
once: true
---

# word

stranger: A hauler at the counter — young, scared, talking too fast
face: local-08

*A hauler at the Long Haul's counter is telling anyone who'll listen that he saw it happen: a depot truck stopped on the deck behind his rig, a crate came off the tail, and two kids carried it down the service ramp toward Pylon Forty. He doesn't want the reward. He wants SDG to stop asking him about it.*

- question: Get the kids' faces out of him, slowly. → lead / thin-lead [check wits 55 · adebayo +10 · rue +10]
- calm: Buy him a coffee and calm him down until he remembers. → lead / thin-lead [check cool 55 · oksana +10]

## lead
*Two kids, a boy with a bleached fringe and a girl in a hanger's jacket. They went down the ramp and turned under the deck toward the market.*
→ market

## thin-lead
*Two kids, under the deck, toward the market. That's all he has, and he's already looking at the door.*
→ market

# market

*The deck market under Pylon Forty, loud and lantern-lit, freight thundering overhead. The stalls that buy hardware are at the back by the shrine. A boy with a bleached fringe is leaning on one of them, waiting for somebody.*

[wits 6] *He keeps looking at the glass-repair booth. Whatever he's waiting for is behind it.*

- watch: Watch the boy until whoever he's waiting for shows. → found-it / spooked [check wits 55]
- booth: Go round behind the glass-repair booth yourself. → found-it / spooked [check reflex 55 · rue +10]

## found-it
*Behind the glass-repair booth, under a tarp: the crate. The lid's been cracked.*
→ crate

## spooked
*The boy sees you and runs. The girl in the hanger's jacket doesn't run fast enough. She takes you to the crate because she'd rather that than SDG.*
→ crate

# crate

*The crate is depot steel, heavier than two kids should have been able to carry, wedged under the booth's counter where the floor slopes. The glass-repair man is working three feet away with his back to it and a magnifier over one eye.*

- haul: Drag the crate out from under the counter in one go. → out-from-under / knocked [check body 55 · garro +10]
- trade: Pay the glass-repair man to take a long break. → out-from-under / knocked [check cool 55]

## out-from-under
*It comes out. The field deck is inside, armoured, black, a lacquer breaker wired into the board, and a tracker pinned under the case that the kids missed.*
→ tracker

## knocked
*It doesn't go quietly. Half the booth's glass ends up on the floor and everyone in the back of the market turns round. Inside the crate, the field deck, and a tracker pinned under the case that the kids missed.*
→ tracker

# tracker

*The tracker under the case is blinking. Whoever's watching it already knows the deck is under the Spine. They'll know which stall in a few minutes.*

- kill: Kill the tracker without waking the deck. → dark / pinged [check tech 50 · silas +15]
- move: Get the deck across the market before the tracker's worth anything. → moved / pinged [check reflex 50, alarm +1]

## dark
*The light under the case stops blinking. Somewhere on the sixty-first floor, a dot goes out.*
→ choice

## moved
*The dot's still blinking, but it's blinking at a stall you've left. Somewhere on the sixty-first floor, someone's watching the wrong place.*
→ choice

## pinged
*You get it moving, but not before the tracker has said where it's been. Sentinels will walk the market tonight. The stalls are already packing.*
→ choice

# choice

stranger: The stall-keeper — sharp-eyed, a jeweller's loupe on a cord
face: local-03

*The stall-keeper from the back of the market is waiting by the shrine with an envelope, and she's seen the deck under your coat. "SDG pays you a reward and a file with your name in it," she says. "I pay you more and nobody pays you anything."*

[alarm>=2] *Two Sentinels have just walked into the far end of the market.*

- sell: Sell her the deck. → sold / turned-over [check cool 50 · garro +10]
- return: Take it to the Sentinel on the market's edge and claim the reward. → returned / turned-over [check wits 50 · adebayo +15 · soren +10]
- keep: Keep it. → kept [alarm +1, needs alarm<=2]

## sold
*She pays in old notes and the deck goes under her counter. By morning it's somewhere you'll never find. So is she.*
pay: full
→ end

## returned
*The Sentinel takes the deck, checks the case number against his tablet, and pays the reward from a card. He takes your name too, politely. It goes in a file.*
pay: half
→ end

## kept
*Nobody gets it. You walk out of the market with a Sentinel field deck under your coat and nobody's money. SDG counts its decks.*
gives: deck field-deck
take: part
→ end

## turned-over
*The Sentinels get there before any money moves. They take the deck, and they take their time about where you got it. You walk away, eventually. With nothing.*
take: none
blown
→ end
