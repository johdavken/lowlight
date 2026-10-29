---
title: Cold Script
kind: big
tier: 3
with: [nix-direct, hicks, cass, ember, silas]
starts: second-socket
after: null
pitch: A month of MiraGen script moves through Karasu tonight. Some of it never reaches a clinic, and a buyer wants to know where it goes instead.
pay: 1800-2600
go: 03:00
client: A buyer who won't give a name
target: MiraGen · the Ribbon's script van
take: the crates that never reach a clinic
stake: 15 / 25
---

# ask

*The fixer doesn't look up from the soldering. "MiraGen ships the Ribbon's script tonight. Cold crates, one van. The clinics keep saying they come up short." He blows on the joint. "My buyer wants the short part. Be at the van by three."*

- take: Take it. → taken
- terms: Ask who the buyer is, then take it anyway. → taken

## taken
*He writes three places on the back of a receipt and slides it over. The paper's warm from the iron.*
marks: the-open-hand "the clinic the script is for", ferry-stairs "where the crates come in", public-landing "the courier's drop"
→ back

# clinic at the-open-hand

stranger: The ripper on nights — gloves off, a cigarette she isn't allowed to smoke

*The Open Hand smells of iodine and wet coats. The ripper is counting script ampoules into a tray, and the tray isn't full.*

- ask: Ask her how short the order came. → order / closed [check cool 50]
- wait: Sit in the queue and watch the tray. → order [clock +30m]

## order
*"Every month it's less," she says. "Same invoice. Less in the box."*
clue: order
→ back

## closed
*She stops counting and looks at you until you leave.*
→ back

# ferry at ferry-stairs

stranger: A ferryman — rain cape, a hook on his belt for the crates

*The cold-chain crates come up the ferry stairs on a hand truck, frost smoking off their lids under the floodlights.*

- look: Read the stamps on the crates. → stamps / nothing [check wits 50]
- lean: Lean on the ferryman. → leaned [alarm +1]

## stamps
*Each crate carries the same two stamps: the clinic's, and a second one somebody scraped half off.*
clue: stamps
→ back

## nothing
*The stamps are frosted over. You'd have to touch one, and he's watching.*
→ back

## leaned
*He tells you what makes you go away.*
heat: +1
clue: drone
→ back

# landing at public-landing

*The courier van sits at the drop with its engine running. The driver leans on the door, eating out of a paper bag, the way a man does when he's done this every week for a year.*

- watch: Watch the handover from the stairs. → driver [clock +30m]
- follow: Follow him when he walks off for more food. → driver / spotted [check reflex 50]

## driver
*Same driver, same van, same bag of noodles. He eats at the stall, every time, before the second leg.*
clue: driver
reveals: haes-noodles "the driver eats here"
→ back

## spotted
*He looks back once. He's seen you now.*
heat: +1
clue: driver
reveals: haes-noodles "the driver eats here"
→ back

# stall at haes-noodles

stranger: The van driver — MiraGen jacket inside out, a phone that keeps lighting up

*The driver takes the stool at the end and talks into his phone with his mouth full. He's not careful. Nobody careful drives the same route every week.*

- sit: Take the next stool and listen. → split / nothing-heard [check cool 45]
- buy: Pay for his bowl and get him talking. → split [clock +30m]

## split
*"Half to the clinics," he says into the phone, "the rest where it always goes. Paperwork's at the Intake if they ask."*
clue: split
reveals: lowlight-intake "the manifest"
→ back

## nothing-heard
*He turns his back to you and the phone goes quiet.*
→ back

# intake at lowlight-intake

stranger: The night clerk — reading glasses on a chain, a mug that says nothing

*The Intake's night clerk keeps the shipping manifests in a binder, in date order. Tonight's is on top.*

- read: Read the manifest upside down while she talks. → manifest / caught-reading [check wits 50]
- ask: Ask to see it, and give a reason. → manifest [clock +30m, alarm +1]

## manifest
*Two stops. The first is the Open Hand. The second has no name, only an address on the Spine.*
clue: manifest
→ back

## caught-reading
*She shuts the binder on your fingers and calls you a name.*
heat: +1
→ back

# clues
- order: The Open Hand gets less script every month on the same invoice. · words: a short order
- stamps: The crates carry a second stamp, scraped half off. · words: a second stamp
- drone: The ferryman swears the script goes by drone now. · words: a drone · false
- driver: The same driver runs the van every week. · words: the driver
- split: Half the crates never reach a clinic. · words: half the crates
- manifest: The manifest lists a second stop on the Spine. · words: a stop on the Spine

# read
read: [the driver] takes [half the crates] to [a stop on the Spine].
wrong: the ferryman, the whole load, the Open Hand
→ van

# van if read=wrong

*Three o'clock. The van is parked under the Spine with its lights off. The driver's on the phone again, and he's looking up and down the street now.*

- wire: Kill the van's locks from the street. → clean / close / burned [gig hack hard · if read.1=right -1 "you know the driver"]
- ride: Ride in the back with the crates. → clean / close / burned [gig slip hard]

# van

*Three o'clock. The van is parked under the Spine with its lights off and the driver in the cab, counting crates on a tablet.*

- wire: Kill the van's locks from the street. → clean / close / burned [gig hack medium · if read.1=right -1 "you know the driver"]
- ride: Ride in the back with the crates. → clean / close / burned [gig slip hard · if read=full -1 "you know the stops"]
- paper: Meet him at the second stop as its receiver. → clean / close / burned [gig papers medium, needs read.3=right]

## clean
*The crates come off the van one at a time and nobody counts them. By morning they're somewhere else.*
pay: full
take: full
→ end

## close
*You get the crates, but the driver has your face, and he's the kind who sells it.*
pay: half
take: part
heat: +1
→ end

## burned
*The van's alarm goes, then the driver's phone, then every light on the street. You leave with nothing in your hands.*
take: none
heat: +2
→ end
