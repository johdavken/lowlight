---
title: First Cut
kind: big
tier: 4
with: [nix-direct, hicks, cass, ember, silas]
starts: the-tilt
after: null
pitch: An original Spectra broadcast, the one from before the archive rewrote it, changes hands on the Strand tonight. A buyer at the Tilt wants it first.
pay: 3500-5000
go: 04:00
client: The woman in the good coat
target: The Low Roller · the cashier's cage
take: the first cut of a Spectra broadcast
stake: 20 / 30
---

# ask

*The buyer doesn't sit. She stands at the end of the bar in a coat too good for the Tilt, and puts a photo face down by your glass. "A tape. The first cut of a broadcast Spectra spent ten years burying. It's being sold tonight, on the Strand. I want it before the archive does." She turns the photo over: a date, and a channel number. "Four o'clock. After that it's gone."*

- take: Take it. → taken
- price: Tell her it costs more than that, and take it. → taken [alarm +1]

## taken
*She leaves a number for the bar to give you, and no name.*
marks: under-the-cat "who's selling", glass-orchid "people talk about the tape here", counting-house "someone's being paid for it"
→ back

# cat at under-the-cat

stranger: A night editor — Spectra lanyard tucked in his shirt, three empty glasses lined up

*Under the Cat is half empty, and the man at the end of the bar is drinking like he's already been paid. He keeps touching his coat pocket.*

- drink: Buy the next round and let him talk. → editor [clock +30m]
- pocket: Lift what's in his pocket. → editor-lifted / noticed [check reflex 55]

## editor
*He works nights at Spectra, cutting the news to length. He's selling something, he says, to people who'll pay twice: once to have it, once to keep it quiet. He's meeting them on the Strand.*
clue: editor
reveals: low-roller "the sale"
→ back

## editor-lifted
*A claim ticket: the Low Roller's cage, tonight's date. He doesn't feel it go.*
clue: ticket
reveals: low-roller "the sale"
→ back

## noticed
*He catches your wrist and holds it a second too long. Then he laughs and lets go, and leaves.*
heat: +1
reveals: low-roller "the sale"
→ back

# orchid at glass-orchid

stranger: A regular — silver rings, an opinion on everything

*The Glass Orchid is loud and warm and everyone in it knows the tape, or says they do.*

- listen: Let the room tell you about it. → burned-copy [clock +30m]
- ask: Ask who's buying. → burned-copy / clammed [check cool 55]

## burned-copy
*"There's no tape," the regular says. "Spectra burned every copy years ago. Anyone selling one is selling a fake."*
clue: fake
→ back

## clammed
*The room gets quieter around you. Asking about it was the wrong thing to do here.*
heat: +1
→ back

# ledger at counting-house

stranger: A bookkeeper — sleeve garters, a green visor, wet boots

*The Counting House keeps books for anyone who pays. Tonight's ledger is open on the stand, the ink still wet on the last line.*

- read: Read the last line over his shoulder. → payment / shoved [check wits 55]
- pay: Pay him to read it to you. → payment [clock +30m]

## payment
*A payment from Spectra's archive division, booked tonight, to a runner. The runner's table: the Breakwater.*
clue: archive
reveals: breakwater "the archive's runner"
→ back

## shoved
*He shuts the book and has you shown out into the wet.*
heat: +1
→ back

# breakwater at breakwater

stranger: The archive runner — a grey suit with no labels, a case chained to the wrist

*The archive runner eats alone by the window at the Breakwater, slowly, the case on the seat beside him. He checks the time twice while you watch.*

- watch: Watch him from the counter. → runner [clock +30m]
- sit: Sit down at his table. → runner / made [check cool 60]

## runner
*He's waiting for a call. When it comes he says one word, "four," and pays.*
clue: runner
→ back

## made
*He looks at you the way a man looks at a stain. When you leave he's on his phone, and he's describing you.*
heat: +2
clue: runner
→ back

# low-roller at low-roller

stranger: The cashier — behind the cage's mesh, counting chips into stacks of twenty

*The Low Roller's cage holds anything for a cut: jewels, guns, a man's last good suit. Behind the mesh there's a shelf of claim bags.*

- look: Read the claim tags from the floor. → cage / nothing-seen [check wits 55]
- tip: Tip the cashier to tell you what came in tonight. → cage [clock +30m, alarm +1]

## cage
*One bag on the shelf is the size of a tape, with tonight's date and a claim ticket stapled to it.*
clue: cage
→ back

## nothing-seen
*A pit boss steps between you and the cage, smiling.*
→ back

# clues
- editor: A Spectra night editor is selling something tonight. · words: a night editor
- ticket: A Spectra night editor has a claim ticket for the Low Roller's cage. · words: a night editor, a claim ticket
- fake: The Orchid says every copy was burned, and any tape is a fake. · words: a fake · false
- archive: Spectra's archive paid a runner tonight. · words: Spectra's archive
- runner: The archive's runner is waiting for a call at four. · words: the archive runner
- cage: A tape-sized bag sits in the Low Roller's cage. · words: the cashier's cage

# read
read: [a night editor] left the tape in [the cashier's cage] for [the archive runner].
wrong: a collector, the coat check, the buyer
→ approach

# approach if read=wrong

*Ten to four. The Low Roller is full and loud, and two men in grey suits are already at the cage, talking to the cashier.*

- cage: Crack the cage's lock from the back office. → clean / close / burned [gig hack hard]
- floor: Cross the floor to the cage as staff. → clean / close / burned [gig slip hard]

# approach

*Ten to four. The Low Roller is full and loud, and the cage is busy. The tape's on the shelf, still in its bag.*

- cage: Crack the cage's lock from the back office. → clean / close / burned [gig hack hard · if read.2=right -1 "you know where it is" · hicks -1]
- floor: Cross the floor to the cage as staff. → clean / close / burned [gig slip hard · if read=full -1 "you know who's watching"]
- claim: Claim the bag as the archive's runner. → clean / close / burned [gig papers hard, needs read.3=right]

## clean
*The bag comes off the shelf and goes out under your coat, and by the time anyone looks, the shelf's just a shelf.*
pay: full
take: full
→ end

## close
*You get the tape, but the cashier's seen your face, and the archive will be asking her about it by morning.*
pay: half
take: part
heat: +1
→ end

## burned
*The cage locks down with you on the wrong side of the floor. You leave the Strand with nothing but a description going round.*
take: none
heat: +2
→ end
