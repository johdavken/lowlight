---
title: The Book of Names
art: the-book-of-names.webp
kind: mission
tier: 1
starts: low-roller
after: null
pitch: A ripper under the causeway has been lending to the Low Roller's regulars against their eyes and lungs. The bar wants his book of names gone before his collectors start their rounds.
posted-by: The bartender at the Low Roller.
brief: His clinic sits under the causeway behind a dead green cross, with a nurse on the desk. Get inside and take the book, the list of what each regular put up.
pay: 90-110
once: true
---

# door

stranger: The ripper's nurse — flat voice, gloves she never takes off
face: local-01

*The clinic sits under the causeway where the rain comes through in a sheet. A green cross that hasn't worked in years. Behind the frosted door a waiting room, a desk, a nurse doing nothing very carefully.*

*Round the side, a vent grille hangs on two screws. Round the back, a loading shutter, chained.*

- desk: Walk in and give the nurse a regular's name. → inside / noticed [check cool 50]
- vent: Go in through the vent round the side. → inside / noticed [check reflex 45, set route=vent]
- shutter: Snap the chain on the loading shutter. → inside / noticed [check body 45, alarm +1, set route=shutter]

## inside
*Antiseptic and old coolant. Somewhere a pump is breathing for someone.*
→ ward

## noticed
*You get in, but not clean. A camera dome turns a few degrees to follow you and doesn't turn back.*
heat: +1
take: part
→ ward

# ward

*The ward is six beds behind plastic curtains. Four are full. The patients are sedated and tagged at the wrist, a barcode and a date. The dates are this week.*

*An orderly works his way down the row with a clipboard, checking tags against a list.*

[route=vent] *Vent dust on your knees. He hasn't looked up yet.*
[wits 6] *He's checking the dates, not the faces. Anyone in a bed is a patient to him.*

- slip: Wait for him to turn and cross behind the curtains. → past / spotted [check reflex 50]
- bluff: Tell him the doctor sent you for the list. → past / spotted [check cool 45 · cass +10 · soren +10]

## past
*The orderly finishes the row and goes out the far door, whistling. The office is at the end of the ward, its door ajar.*
→ office

## spotted
*He looks up. You keep walking like you belong, and he lets you, but he picks up the wall phone as the office door closes behind you.*
heat: +1
take: part
→ office

# office

*A desk, a kettle, a terminal older than you with a cracked screen and a sticker on the case: the clinic's name and a phone number someone has scratched out. Under the desk a fire safe, unlocked, empty but for a ledger in paper.*

*The book is both. Names on the screen, the same names in his handwriting.*

- copy: Pull the files off the terminal and wipe it behind you. → copied / locked-out [check tech 50 grid · silas +10 · rue +10]
- paper: Take the paper ledger and leave the terminal to a magnet. → copied / locked-out [check body 45]

## copied
*It's all here. Names, dates, what each one put up. Some of them you know from the bar.*
→ cold

## locked-out
*The terminal locks on the second try and starts to beep. You get the ledger and half the files before you pull the plug.*
heat: +1
take: part
→ cold

# cold

stranger: The ripper — soft voice, hands that never stop washing
face: local-05

*The back door opens before you reach it. The ripper comes in out of the rain with a cooler on a strap, early, and stops. Behind him the cold room hums, its door propped with a mop.*

*"You're not on my list," he says, and keeps washing his hands at the little sink by the door.*

[alarm>=2] *His collectors are already on the phone to him. He knows you're not a patient.*

- talk: Tell him you're here about a debt, and let him guess whose. → let-go / cornered [check cool 55 · cass +10 · adebayo +10]
- hide: Step into the cold room and pull the door to. → let-go / cornered [check reflex 50]
- lean: Put him against the sink and ask him nicely to sit down. → let-go / cornered [check body 45 · ines +10, alarm +1]

## let-go
*He dries his hands slowly and doesn't look at the bag under your arm. "Close the door on your way out," he says.*
→ out

## cornered
*He gets the cooler between you and him and shouts for the orderly. You get past him, but the book comes with you in pieces.*
heat: +1
take: part
→ out

# out if alarm>=3

*Sirens on the causeway, coming down. Not SDG. Worse: his collectors, two vans, and the side street is the only way that isn't theirs.*

- run: Run the side street in the rain. → home-late / caught [check reflex 45]
- stay: Walk out the front like a patient with an appointment. → home-late / caught [check cool 45]

# out

*Out the back, under the causeway, rain in a sheet. The Low Roller's lights are three blocks off.*

- go: Walk it back to the Low Roller. → home
- burn: Stop at a drum fire on the way and burn the paper first. → home [clock +20m]

## home
*The bartender takes the book without opening it and drops it in the ice well. The names soak. He counts you out from the till and pours you one you didn't ask for.*
pay: full
take: full
→ end

## home-late
*You make it back soaked and empty-handed apart from what's in your coat. The bartender pays you what the book's worth to him, which is less than you hoped.*
pay: half
take: part
→ end

## caught
*The collectors take the book off you in the street and take their time doing it. You walk back to the Low Roller with nothing but the rain.*
take: none
blown
→ end

# push-1

*In the cold room, on the shelf behind the door: four sealed coolers with patient barcodes. Paid-for parts, waiting to go out on the collectors' rounds.*

*The Low Roller's regulars would buy their own back. Some of them.*

- coolers: Carry two coolers out the back before anyone counts them. → coolers-out / dropped [check body 55 · ines +15 · garro +10]
- tags: Swap the barcodes so the rounds go to the wrong addresses. → coolers-out / dropped [check tech 50 grid · silas +15]

## coolers-out
*Two of the regulars cry when they see what's in the coolers. One of them pays you double.*
pay: +60
→ end

## dropped
*A cooler hits the floor and splits. The noise brings the orderly, and the way out costs you a cut of the bar's money to the man on the door.*
lost
→ end

# push-2

*The ripper's cashbox is in the kettle cupboard, where nobody would look. You saw it when he reached past it for the towel. His collectors bring the week's take back here at {time +1h}.*

- wait: Wait in the dark for the collectors and take the week's take off them. → week-take / jumped [check reflex 60 red]
- box: Take the cashbox now and be gone before they're back. → week-take / jumped [check wits 55]

## week-take
*Old notes, rubber-banded, each bundle labelled with a name from the book. You don't count it in front of anyone.*
pay: +100
→ end

## jumped
*They come back early. You get out through the vent with your coat torn and the cashbox gone, and the Low Roller hears your name from people it shouldn't.*
lost
→ end
