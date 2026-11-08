---
title: Off Script
art: off-script.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: passenger_one=yes
trust: 1 / 2
guest: noa GREEN
pitch: The thing in her head is bleeding her out. A month of script would buy her time, if it isn't poison.
posted-by: Pell, by hand, through the dead-blocks kid.
brief: "Noa's off script and the hum is winning. The Lazarus Net has a military-slot edit for sale at the deck market under the Spine. Ember's on Hicks's ear."
pay: 90-110
loot: a cracked MiraGen edit, keyed to a military slot
---

# ask

*Pell's note comes by the dead-blocks kid, on the back of a seed packet. The girl lost most of yesterday. She bled through two towels and didn't know it was happening. Under Pell's writing, in a different hand, very neat: script. a military edit. not the Open Hand, they log names.*

*It's right about the Open Hand. MiraGen sells its logs to whoever asks politely, and Aegis is very polite.*

*Ember's already on the Lazarus Net with her boots on the bench. "There's a seller with a military-slot edit," she says. "Deck market, under the Spine, tonight. It could be a perfect copy. It could be poison. The Net's like that." She holds up the bead.*

[guest.noa=yes] *Noa is at the twins' table in Pell's coat, holding a mug of Silas's tea she hasn't drunk. "We're coming," she says, in the flat voice. Then, in her own: "It knows what the edit should look like. I don't."*

view ember: The girl is off script and the thing in her head is killing her. You found the edit on the Lazarus Net yourself and you're proud of it and scared of it. Last time the thing in her head called you Spark through Hicks's bead. You've thought about that more than you'd admit. Offer him the bead.

view ember if ear1=allowed: Last time he only let you in because you didn't ask. You're asking this time, properly. See what he does.

- yes: Take the bead. → bead [set ear2=chose]
- no: Tell her you'll manage. → alone [set ear2=allowed]

## bead
*You put it in. "Twice," she says, under her breath, and you pretend you didn't hear.*
→ stalls

## alone
*She doesn't argue. The bead's on your collar by the time you're down the stairs, clipped there with the camera, and you didn't feel her do it. You put it in on the freight lift.*
→ stalls

# stalls
room: spine/deck-market

*The deck market, in the shadow between Pylon Forty and the next one, under the Spine's road. Bulbs strung between the pylons, a wok spitting, a pirate radio stall playing something nobody's licensed. The Net's sellers rotate. Tonight it's one of these stalls, and not the one with the sign.*

*{{"Two people by the shrine aren't buying candles,"}} Ember says. {{"I'm not saying anything. I'm saying."}}*

[guest.noa=yes] *Noa stays at your shoulder with her hood up. Every so often her head tilts, as if somebody's talking to her in another room.*

view ember: You're on the line, and the collar camera shows you a crowded night market. You know how the Lazarus Net works better than Hicks does, and you'd like him to notice. Two people by the shrine look wrong to you. Say so once, and leave it.

view ember if guest.noa=yes: The girl is there with him. Sometimes the thing in her head hums along to the radio stall. It's on key.

- coat: Buy a rain shell at the coat rail and ask the man for the Net the right way. → found / slow [check cool 50]
- watch: Eat a skewer on a stool and watch which stall the runners drift to. → found / slow [check wits 50]

## found
*The pirate radio stall. The man behind the receiver has a tin under the counter and a chip in the tin, and he wants to see the colour of your money before you see the colour of his edit.*
→ edit

## slow
*It takes too long, and the two by the shrine have moved to the noodle stall. But it's the pirate radio stall. The man behind the receiver has a tin under the counter and a chip in the tin, and he wants to see your money first.*
→ edit

# edit
room: spine/deck-market

*The chip is a cracked MiraGen edit, keyed to a military slot. The seller says it's a perfect copy. Everyone on the Net says that.*

*The seller has a paper book, because he's careful, and the book has a page for this edit. He's sold it four times this month. Once a week, to the same buyer, under a name that belongs to someone who died in the Drownworks last year. Nobody's ever applied one at a clinic he knows.*

*{{"Somebody's laying script along her road,"}} Ember says, very quietly. {{"To see where it gets picked up."}}*

view ember: The seller's book says someone has bought this exact edit every week, under a dead name, and never had it applied. You worked out what that means before Hicks did and said it out loud. Now you need to know if the chip in front of him is clean or a trap. Talk him through it if he lets you.

view ember if guest.noa=yes: The thing in the girl's head could read the chip from inside. You want to see it do that more than you should.

- read: Jack the chip on his own receiver and read the edit before you pay. → clean / dirty [check tech 50 grid]
- take: Put the money on the counter and take the tin, whatever he says about it. → clean / dirty [check body 50]
- hush: Let Noa hold it. The thing in her head can open the file from inside. → clean / dirty [check tech 50 grid angle, needs guest.noa=yes]

## clean
*It's a good copy, nearly. Coiled in the back of it is one extra line: a whisper that would call home the first time the edit touched a slot. Ember takes it out on the line in about the time it takes you to breathe. "Rude," she says.*
→ out

## dirty
*It takes too long, and the seller sees your face change. It's a good copy, nearly. Coiled in the back of it is a whisper that would call home the first time the edit touched a slot. Ember takes it out on the line. The seller watches you do it and starts packing up his radio.*
→ out

# out
room: spine/deck-market

*The two from the shrine aren't at the noodle stall any more. They're either side of the radio stall, and neither of them is pretending to shop. Capers. MiraGen pays them to hunt the Net, and tonight the Net is you.*

*{{"Out. Out, out, out,"}} Ember says. {{"Coat rail's on your left."}}*

[guest.noa=yes] *Noa's face goes still. The other voice, close and flat, to Ember, not you: "They're on a hand channel. We can hear it. Do you want to?"*

view ember: Two Capers are closing on the stall and Hicks has the chip. Tell him where to go, short. Don't ask him anything until he's out.

view ember if guest.noa=yes: The thing in the girl's head just asked you, not him, if you want to hear the Capers' channel. You do. Say so if he lets her.

- rail: Through the coat rail and out under the tarps. → clear / caught [check reflex 50, set passenger_two=yes]
- wok: Put the wok stall's grill over between you and them, and go. → clear / caught [check body 50, set passenger_two=yes]
- channel: Let it call the turns. It can hear their hand channel. → clear / caught [check wits 50 angle, needs guest.noa=yes, set passenger_two=yes]

## clear
*You come out on the far side of Pylon Forty with the tin in your coat, and nobody behind you but rain. Lusk calls on the walk home. The house has raised the fee, he says. And someone else is asking after the girl, someone who doesn't use fixers. He sends a second retainer anyway. You take it.*
pay: full
→ home

## caught
*A Caper gets a hand on the tin and doesn't let go, and you leave it with him rather than your fingers. You come out on the far side of Pylon Forty with nothing. Lusk calls on the walk home and says someone else is asking after the girl. He sends a second retainer anyway. You take it.*
take: none
→ burned

# home

*The ripper at the Open Hand puts the edit in without writing anything down, for what you pay her. Noa sleeps at Pell's that night without bleeding.*

*Late, at the Zhous', the bead clicks. It isn't Ember. It's the flat voice, from a dead tower across the wall, on a line it shouldn't be able to reach. "Spark," it says. "What is it like? Being only one person."*

*Ember is on the same line. She's quiet for a long time. Then she answers it, properly, and she doesn't make a joke. You hear all of it.*

view ember: The thing in the girl's head reached the bead from across the city and asked what it's like to be one person. You answered it honestly and Hicks heard every word. You don't know if that was a mistake. You'd like him to say something. If he gives the bead back, take it, and keep your face still.

view ember if ear1=allowed and ear2=allowed: Twice now he's only let you in. Tonight something else asked for you, and meant it. You noticed the difference.

- keep: Tell her to keep the bead on the bench. → kept [set ember_ear=yes, set script=yes]
- back: Give her the bead. Tell her it's getting crowded on that line. → returned [set ember_ear=no, set script=yes]

## kept
*She puts it back in the bowl, on its own. "It asked nicely," she says. "You never ask nicely." She's smiling, mostly.*
→ end

## returned
*She takes it. She turns it over. "It's not the line that's crowded," she says, and goes to bed.*
→ end

# burned

*No edit. Noa will bleed again tomorrow, and the Capers have Hicks's face in a market MiraGen watches. You sit on the twins' couch with Lusk's second retainer in your pocket and the taste of it in your mouth.*

*"Next time," Ember says. She doesn't sound like she believes it either.*

view ember: It went wrong. No edit, and the Capers saw him. He took Lusk's money again anyway, and you watched him do it. Stay close. Don't tell him it's fine.

- keep: Tell her to keep the bead on the bench. → kept-low [needs guest.noa!=yes, set passenger_two=yes, set ember_ear=yes]
- back: Hand her the bead and go home. → returned-low [needs guest.noa!=yes, set passenger_two=yes, set ember_ear=no]
- keep-seen: Tell her to keep the bead. They saw Noa too. → kept-low [needs guest.noa=yes, set passenger_two=yes, set noa=seen, set ember_ear=yes]
- back-seen: Hand her the bead. They saw Noa too. → returned-low [needs guest.noa=yes, set passenger_two=yes, set noa=seen, set ember_ear=no]

## kept-low
*She puts it in the bowl, on its own. Neither of you says anything for a long time.*
→ end

## returned-low
*She takes it, and doesn't drop it in the junk bowl. She's still holding it when you shut the door.*
→ end

# getaway
room: spine/deck-market

*The market's turned over. Somebody's shouting about the wok. The Capers are behind you and the crowd is in front.*

*{{"Left of the shrine, there's a gap between the pallets,"}} Ember says. {{"Go."}}*

view ember: He's running through the deck market and the collar camera is all lanterns and elbows. Tell him what you see, short. Nothing else until he's out.

- gap: Go where she says, between the pallets. → clear-run / stuck [check reflex 50, needs guest.noa!=yes, set passenger_two=yes]
- crowd: Lose them in the crowd. It's the easiest place on the Spine to do it. → clear-run / stuck [check cool 50, needs guest.noa!=yes, set passenger_two=yes]
- gap-noa: Go where she says, between the pallets, with Noa's hand in yours. → clear-run / stuck [check reflex 50, needs guest.noa=yes, set passenger_two=yes, set noa=seen]
- crowd-noa: Lose them in the crowd, Noa's hood up beside you. → clear-run / stuck [check cool 50, needs guest.noa=yes, set passenger_two=yes, set noa=seen]

## clear-run
*You come out under the next pylon with your hood up and Ember's voice in your ear. The Capers lost you. The Net will remember you anyway.*
→ end

## stuck
*They get a good look at you under the lanterns before the crowd closes. You walk home slow, and wonder who MiraGen sells Caper photographs to.*
take: none
→ end
