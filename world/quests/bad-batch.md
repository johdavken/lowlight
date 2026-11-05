---
title: Bad Batch
kind: mission
tier: 1
take-size: 4
template: true
starts: second-socket
after: null
pitch: A crate of cracked carts still talking to Cortex. Make them quiet before the buyer comes.
pay: 90-110
art: bad-batch.webp
draw complication: none | caper-early | buyer-brought-muscle
draw buyer: easy | hard
---

# crate if complication=caper-early

*The crate sits in Second Socket's back room under a tarp: forty carts in foam, every one of them cracked, every one of them still ticking.*

*Out on the Ribbon a Caper has parked across the shutter with his lights off. He isn't here for noodles.*

- scrub: Scrub the check-in tags on your deck. → quiet / loud [check tech 50 grid · silas +15 · ember +10 · rue +10, set scrubbed=yes]
- shield: Wrap the crate in foil and pray. → quiet / loud [check wits 50 · hicks +10]

# crate

*The crate sits in Second Socket's back room under a tarp: forty carts in foam, every one of them cracked, every one of them still ticking. Somewhere in each is a check-in chip that thinks it works for Cortex.*

*The buyer is due at {time +40m}.*

- scrub: Scrub the check-in tags on your deck. → quiet / loud [check tech 50 grid · silas +15 · ember +10 · rue +10, set scrubbed=yes]
- shield: Wrap the crate in foil and pray. → quiet / loud [check wits 50 · hicks +10]

## quiet
*The ticking stops, one cart at a time. The last one goes dark with a sound like a held breath let out.*
→ buyer

## loud
*Something on the grid answers. A ping, then another, closer. Somebody now knows there's a crate on the Ribbon that shouldn't be.*
→ buyer

# buyer if heat>=4

stranger: The buyer — thin, polite, sweating through a Voltaic lanyard
face: local-04
temper: buyer

*He comes in out of the rain at {time} and doesn't take his coat off. He's heard the grid's been asking about Second Socket. He opens one cart and doesn't bother with the rest.*

*He names a number well under the one you agreed. "And I'm doing you a favour."*

- hold: Hold at full price. Hot is still worth something. → paid-full / paid-short [check cool 50 · cass +10 · mother-rot +15]
- read: Find out who told him it was hot. → paid-full / paid-short [check wits 50 · nix-direct +15 · adebayo +10]
- take: Take what he offers and get the crate out of the room. → paid-short

# buyer

stranger: The buyer — thin, polite, a Voltaic lanyard turned so the name doesn't show
face: local-04
temper: buyer

*He comes in out of the rain at {time}. He opens three carts at random and holds each to his ear like a shell.*

[wits 6] *His left hand never leaves his coat pocket. Whatever's in there, he thinks he might need it.*
[complication=buyer-brought-muscle] *Someone big waits at the top of the stairs, not quite out of sight.*

*"The price we said," he says. "Less if they're hot."*

- hold: Hold at full price and don't blink. → paid-full / paid-short [check cool 50 · cass +10 · mother-rot +15]
- read: Watch what he's really scared of. → paid-full / paid-short [check wits 50 · nix-direct +15 · adebayo +10 · if scrubbed +10 "you scrubbed them yourself"]
- take: Take what he offers. → paid-short

## paid-full
*He counts it out twice in old notes and carries the crate to the stairs himself.*
pay: full
take: full
→ out

## paid-short
*He pays what he pays, and you let him think he won.*
pay: half
take: part
→ out

# out if alarm>=2

*The Caper's lights come on as the buyer's van pulls away. He follows it, not you. This time.*

- go: Go out the back and over the wall while he's busy. → gone / seen [check reflex 50 · hicks +10 · ines +10]
- carry: Carry the foam out to the bins with the money under it. → gone / seen [check body 50 · ines +10]

# out

*The back room is empty again except for the foam and the smell of hot plastic. The money still has to get off the Ribbon.*

- go: Out the back and over the wall before the street wakes up. → gone / seen [check reflex 50 · hicks +10 · ines +10]
- carry: Carry the foam out to the bins with the money under it. → gone / seen [check body 50 · ines +10]

## gone
*The back room is behind you. Nobody on the Ribbon looks twice.*
→ end

## seen
*A Caper on his rounds rolls past slowly and looks at you for a long second. He'll remember the face.*
→ end

# push-1

*In your coat pocket, where it went while the buyer was counting, one cart is still in its sleeve. Forty in his count, forty-one in the crate.*

*The stalls on the Ribbon pay cash for a quiet cart and don't ask whose it was.*

- scrub: Scrub its tag yourself and sell it at the stalls. → sold-one / still-ticking [check tech 55 grid · silas +15 · rue +15 · ember +10]
- shop: Walk it down the Ribbon and let a stall-keeper name a price. → sold-one / still-ticking [check cool 50 · mother-rot +15 · cass +10]

## sold-one
*A stall-keeper three doors down weighs it in his palm and pays without haggling. That's how you know it was worth more.*
pay: +60
→ end

## still-ticking
*Halfway down the Ribbon it starts ticking again. A Caper two stalls down turns his head, and forgetting your face costs a cut of what the buyer paid.*
lost
→ end

# push-2

*The buyer left his manifest on the bench, folded once, and it came away in your pocket. A second crate from the same lot sits in a Voltaic depot two streets down, to be signed for at {time +1h}.*

*Nobody's guarding it yet. Nobody's scrubbed it either.*

- lift: Get there first and walk out with it on a hand truck. → second-crate / caught-at-depot [check reflex 60 red · hicks +10 · ines +10]
- sign: Sign for it under the buyer's name. → second-crate / caught-at-depot [check cool 60 · soren +15 · adebayo +10, clock +30m]

## second-crate
*The depot clerk doesn't look up. By morning there are forty more carts ticking under a tarp in Second Socket's back room, and a buyer who doesn't know he's been beaten to his own order.*
pay: +100
→ end

## caught-at-depot
*The clerk looks up. Behind him a Voltaic security cart is already rolling. The way out is the loading door, and the buyer's money is what gets it opened.*
lost
→ end
