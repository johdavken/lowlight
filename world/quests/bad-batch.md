---
title: Bad Batch
kind: mission
tier: 1
with: [silas, ember, hicks, cass, nix-direct]
starts: second-socket
after: null
pitch: A crate of cracked carts still talking to Cortex. Make them quiet before the buyer comes.
pay: 400-500
art: bad-batch.webp
draw complication: none | caper-early | buyer-brought-muscle
draw buyer: easy | hard
---

# crate if complication=caper-early

*The crate sits in Second Socket's back room under a tarp: forty carts in foam, every one of them cracked, every one of them still ticking.*

*Out on the Ribbon a Caper has parked across the shutter with his lights off. He isn't here for noodles.*

- scrub: Scrub the check-in tags on your deck. → quiet / loud [check tech 50 grid · silas +15 · ember +10, set scrubbed=yes]
- trace: Have Silas find which ones are still calling home. → quiet [needs with=silas, set traced=yes]
- shield: Wrap the crate in foil and pray. → quiet / loud [check wits 40 · hicks +10]
- wait: Wait him out with the lights off. → quiet [clock +1h, alarm +1]

# crate

*The crate sits in Second Socket's back room under a tarp: forty carts in foam, every one of them cracked, every one of them still ticking. Somewhere in each is a check-in chip that thinks it works for Cortex.*

*The buyer is due at {time +40m}.*

- scrub: Scrub the check-in tags on your deck. → quiet / loud [check tech 50 grid · silas +15 · ember +10, set scrubbed=yes]
- trace: Have Silas find which ones are still calling home. → quiet [needs with=silas, set traced=yes]
- shield: Wrap the crate in foil and pray. → quiet / loud [check wits 40 · hicks +10]

## quiet
*The ticking stops, one cart at a time. The last one goes dark with a sound like a held breath let out.*
→ buyer

## loud
*Something on the grid answers. A ping, then another, closer. Somebody now knows there's a crate on the Ribbon that shouldn't be.*
heat: +2
→ buyer

# buyer if heat>=4

stranger: The buyer — thin, polite, sweating through a Voltaic lanyard
temper: buyer

*He comes in out of the rain at {time} and doesn't take his coat off. He's heard the grid's been asking about Second Socket. He opens one cart and doesn't bother with the rest.*

*He names a number well under the one you agreed. "And I'm doing you a favour."*

- hold: Hold at full price. Hot is still worth something. → paid-full / paid-short [check cool 55 · cass +10 · if traced +10 "you know which carts were hot"]
- take: Take what he offers and get the crate out of the room. → paid-short

# buyer

stranger: The buyer — thin, polite, a Voltaic lanyard turned so the name doesn't show
temper: buyer

*He comes in out of the rain at {time}. He opens three carts at random and holds each to his ear like a shell.*

[wits 6] *His left hand never leaves his coat pocket. Whatever's in there, he thinks he might need it.*
[complication=buyer-brought-muscle] *Someone big waits at the top of the stairs, not quite out of sight.*

*"The price we said," he says. "Less if they're hot."*

- hold: Hold at full price and don't blink. → paid-full / paid-short [check cool 50 · cass +10 · if traced +10 "you know which carts were hot"]
- read: Watch what he's really scared of. → paid-full / paid-short [check wits 45 · nix-direct +15 · if scrubbed +10 "you scrubbed them yourself"]
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

- go: Go out the back while he's busy. → gone
- stay: Stay and look like you live here. → gone / seen [check cool 45]

# out

*The back room is empty again except for the foam and the smell of hot plastic.*

- go: Lock up and go. → gone
- count: Count it again in the back before you go. → gone [clock +30m]

## gone
*The shutter comes down behind you. Nobody on the Ribbon looks twice.*
→ end

## seen
*He rolls past slowly and looks at you for a long second. He'll remember the face.*
heat: +1
→ end
