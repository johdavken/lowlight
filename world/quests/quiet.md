---
title: Quiet
kind: mission
tier: 2
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: fourteenth_two=yes
trust: 1 / 2
people: [Penn, Hesk]
pitch: Everything he's got goes on her wall. The date is tonight.
posted-by: Nix, at the Intake. Her wall, cleared.
text: Tonight's the fourteenth. Tell Hicks to come up, and to bring everything he's got. You've cleared the wall.
brief: Tonight is the date R. gave her. Everything Hicks has found goes on her wall. Name who, and get there before the night's out.
pay: 360-440
loot: what's owed
---

# ask
title: Her Wall

*After hours, and the Intake has stopped pretending to be anything but a room. She's taken her wall down to the plaster for you: the pins still in it, each in its pale square where a picture kept the light off for years. The lamp's at its lowest notch, a coin of yellow on the desk, and the daybed's in the dark beyond it. You take the cards out of your coat, one damp edge at a time.*

*"Tonight," she says. "That was his date."*

view nix-direct: It's the fourteenth, the date R. gave you, and Hicks is putting everything he's found on your wall. Your Thursday client and your Tuesday client may both be on it. You've been afraid of this for a week. You'll sit and watch him work. Don't help him, and don't stop him.

view nix-direct if nix4=dug: One of the cards he's carrying is in your own handwriting, out of your book. You'll see it when it goes up. Don't say anything about it yet.

view nix-direct if nix4=asked: Back at the start he asked you about R., and you gave him the date yourself. He has never been through your things or your book, and nothing on this wall came out of it. Don't say otherwise.

- pin: Start pinning them up. → pinned
- ask: Ask her if she wants to leave the room while you do it. → pinned [set wall=asked]

## pinned
*"It's my wall," she says. The first pin goes in with a sound like a knuckle, and the card hangs there under the lamp: somebody else's words, in somebody else's light.*
→ board

# board
title: The Wall
board: the-fourteenth

*Her wall, your cards, the lamp down to almost nothing. Plaster and pinholes and a district's worth of small lies, laid out in rows. Two of her clients are up there somewhere, in other people's words.*

[wall=asked] *You offered her the door. She's on the daybed instead, out of the lamp, and she hasn't looked away once.*

view nix-direct: Hicks is working the case on your wall: pairing what he's found, filing what holds, naming who. Two of your clients may be up there. Don't name anyone, and don't say which cards fit; you'd only be guessing too. Say what you'd watch for, and wait.

view nix-direct if nix4=dug: Your own handwriting is on your wall: a page out of your book, about your Thursday client. He read it while you were on the landing. You know now. If he points at it, say it's yours, and that you know when he read it. Don't make a speech about it, and don't pretend you haven't seen it.

view nix-direct if nix4=asked: Back at the start he asked you about R., and you gave him the date yourself. He has never been through your things or your book, and nothing on this wall came out of it. Don't say otherwise.

## holds
*It holds. Every card on the wall agrees with every other, the way a lock agrees with its key, and every line of it runs to the same place: the sweeper. "Go," Nix says. "It's tonight. She'll be gone by morning."*
→ deck

## thin
*It's the sweeper, and it's thin: the cards lean her way the way a crowd leans toward a sound, without ever pinning her. Nix looks at the wall and then at you. "Go anyway," she says. "It's tonight."*
→ deck

## hunch
*You name the sweeper, and the wall gives you nothing back: plaster, pinholes, other people's words. It's a hunch, and you both know it. "Go anyway," she says. "If it's wrong, you'll know when you see her."*
→ deck

## wrong-dr-penn
*You give SDG Penn. A man who sold a dead man a name is enough for them; they like a tidy story the way they like clean boots. They take him at dawn, in his slippers, the kettle still ticking on its ring. By noon the back room's shuttered and an SDG seal is curling in the damp across the door. The people Nix used to send there will find out one at a time, on the step. The sweeper doesn't come back to the Tilt, and nobody knows where she went.*
take: part
settles: nix-direct: Hicks put the case on your wall and named Penn for R.'s death. SDG took Penn, and his back room is shut; the people you used to send there have nowhere to go. Your Thursday client never came back.
→ end

## wrong-hesk
*You name MiraGen's man to anyone who'll stand still for it. Nobody files it. A recovery man paid by the head has no reason to kill a man who owes nothing, and every desk you try knows that before you've finished. Two nights later there's a wet coat in the doorway across from Hae's, the same one every night, its owner never quite looking up at Nix's window, and never quite not.*
take: part
settles: nix-direct: Hicks put the case on your wall and named MiraGen's recovery man for R.'s death. Nobody listened. Now MiraGen has noticed Hicks, and your window. Your Thursday client never came back.
→ end

# deck
title: The Booking Stall
room: spine/deck-market

*The Spine's long-haulers book their riders on paper, at a stall wedged between two pylon feet under corrugated plastic gone the colour of weak tea. It sells coffee that tastes of the urn and maps of roads rerouted years ago. Six rigs out tonight, their manifests clipped to a board in grease pencil and thumbprints, the hauliers' own little grid humming behind the stall under lacquer nobody's touched since it went in. One of those rigs has a sweeper on it.*

*{{"Which one?"}} Nix says.*

view nix-direct: Hicks is at the deck market finding which long-haul rig the sweeper is leaving on. You're on his ear from the Intake, with the case still on your wall behind you. Keep it short.

- book: Read the booking stall's paper upside down. → booked / booked [check wits 55]
- manifest: Pull the rigs' manifests off the hauliers' board. → booked / booked [check tech 55 grid]

## booked
*A driver called Osk, out at two from the Long Haul. One rider, paid in cash, no name, in a hand that leaned hard on the pencil. It's gone one already.*
→ ramp

# ramp
title: The Ramp
stranger: Hesk — MiraGen's recovery man: soft voice, wet coat, paid by the head
face: local-velvet-06
room: spine/catwalk

*The drivers' ramp climbs the pylon in switchbacks of wet grating, sodium light coming up through the mesh so you walk on your own shadow. Halfway up, three men in rain gear that cost more than a driver clears in a month, and the one in front is wearing a wet coat. They're going the same way you are.*

*{{"That's him,"}} Nix says. {{"From the booth."}}*

view nix-direct: MiraGen's man is on the ramp ahead of Hicks, going the same way. He wants the sweeper too. You're frightened of what he'll do to her and to Hicks. Say so once.

- ahead: Get past them on the service ladder. → up / up [check reflex 55]
- walk: Walk past them like a driver late for his rig. → up / up [check cool 55]

## up
*You come off the top of the ramp into the lot, a plain of oil-dark asphalt where the haulers sleep nose to tail, marker lights banked to a low red. The Long Haul's pink neon cup burns in its window like a promise somebody stopped keeping. They're right behind you.*
→ booth

# booth if case.the-fourteenth=holds
title: The Long Haul
stranger: K. — the Tilt's sweeper, one bag, waiting for a driver
face: local-karasu-05
room: spine/long-haul

*The Long Haul: a cream counter worn grey where twenty years of elbows have leaned, chrome stools, two steel urns sweating, the jukebox glowing amber by the door with nothing on. Drivers who don't look up. She's in the corner booth with one bag and a coffee she hasn't touched, a skin already on it. She knows you from the Tilt.*

*You tell her what you've got. All of it: the port that was never opened, the bowl, the glass she left full, Penn's book. She doesn't argue. She sits with her hands round the cold cup and lets you finish, and when you have, she says, "He was going to kill me. On the fourteenth. For Ada." Then nothing, and the jukebox doesn't fill it.*

view nix-direct: Hicks has the sweeper in the corner booth of the Long Haul, and the case on your wall holds. She's your Thursday client. Over his bead you heard him lay it out, and you heard her answer, quietly: R. was going to kill her on the fourteenth, for his sister. Don't say anything to her. Say one thing to him, if anything.

- talk: Sit down across from her and let her talk. → stays / bolts [check cool 55]
- read: Watch her hands and the door, and say nothing. → stays / bolts [check wits 55]

# booth if case.the-fourteenth=thin
title: The Long Haul
stranger: K. — the Tilt's sweeper, one bag, waiting for a driver
face: local-karasu-05
room: spine/long-haul

*The Long Haul: a cream counter worn grey where twenty years of elbows have leaned, chrome stools, two steel urns sweating, the jukebox glowing amber by the door with nothing on. Drivers who don't look up. She's in the corner booth with one bag and a coffee she hasn't touched, a skin already on it. She knows you from the Tilt.*

*You tell her what you've got. She has an answer for most of it, quick and quiet and not bad, the way people answer who've rehearsed it in the dark. "I left early. So what. Lots of people leave early." Her eyes are on the door the whole time she says it.*

view nix-direct: Hicks has the sweeper in the corner booth of the Long Haul, and the case on your wall is thin. She's your Thursday client. Over his bead you heard her answer him, quick and quiet: she left early, lots of people leave early. You know her lying voice, and you're not sure this is it. Don't say anything to her.

- talk: Sit down across from her and let her talk. → stays / bolts [check cool 55]
- read: Watch her hands and the door, and say nothing. → stays / bolts [check wits 55]

# booth
title: The Long Haul
stranger: K. — the Tilt's sweeper, one bag, waiting for a driver
face: local-karasu-05
room: spine/long-haul

*The Long Haul: a cream counter worn grey where twenty years of elbows have leaned, chrome stools, two steel urns sweating, the jukebox glowing amber by the door with nothing on. Drivers who don't look up. She's in the corner booth with one bag and a coffee she hasn't touched, a skin already on it. She knows you from the Tilt.*

*You tell her what you think. She laughs at you, not unkindly: the laugh of someone who's been accused of worse, by better. "You've got a sweeper leaving town," she says. "That's what you've got."*

view nix-direct: Hicks has the sweeper in the corner booth of the Long Haul, on a hunch. She's your Thursday client. Over his bead you heard her laugh at him: a sweeper leaving town, that's all he's got. You can't tell if she's right. Don't say anything to her.

- talk: Sit down across from her and let her talk. → stays / bolts [check cool 55]
- read: Watch her hands and the door, and say nothing. → stays / bolts [check wits 55]

## stays
*She stays in the booth. Whatever else she is, she's tired of running, and it sits in her shoulders like weather.*
→ door

## bolts
*She's half out of the booth before you've finished. You get a hand on the strap of the bag and she sits back down, slowly, but she's measuring the distance to the kitchen door now, the way you'd measure a drop.*
→ door

# door
title: The Door
post rig: Someone goes out by the kitchen and stands at Osk's rig. [suits muscle]
gives rig: The cab's watched. If she runs for it, a miss doesn't put her on the road.
room: spine/long-haul

*The door bangs open on the rain and lets the lot's diesel cold in. The man in the wet coat comes in with his two friends behind him, shakes the water off his sleeves, and smiles at you the way a man smiles at someone who's done his work for him. "Four thousand," he says to the room, pleasantly. "Breathing."*

*{{"Hicks,"}} Nix says. {{"Don't let him have her."}}*

view nix-direct: MiraGen's man has walked into the Long Haul for the sweeper. He wants her alive, for money. You don't know what's owed to her, but it isn't that, not like this. Ask Hicks once.

- aisle: Stand up in the aisle between him and the booth. → held-off / held-off [check body 50]
- kitchen: Get her into the kitchen before he's past the counter. → held-off / held-off [check reflex 50]

## held-off
*He stops. He's paid by the head, not by the fight, and a fight in a diner full of witnesses is the kind of expense MiraGen asks questions about. "Outside," he says. "When you're done." He goes back out into the rain to wait, and across the table she's shaking, a fine steady tremor you can see in the skin on her coffee.*
→ lot

# lot
title: The Lot
room: spine/long-haul

*Two o'clock. Out in the lot a rig wakes, its marker lights coming on one after another down its length like a slow decision. Osk. She's up and out of the booth before the last one lights, running for the cab through the rain.*

[post.rig] *Whoever you sent out is at the cab steps already, a shape under the marker lights.*

*{{"She's going,"}} Nix says. {{"Hicks."}}*

view nix-direct: The sweeper is running for her rig and Hicks has seconds. You don't know what you want him to do. Don't tell him what to do. Say his name if you have to.

- run: Run her down before she's in the cab. → caught / pulled-out [check body 50 · if post.rig=fit +10 "your muscle's at the cab"]
- kill: Kill the rig's ignition from your deck. → caught / pulled-out [check tech 50]

## caught
*You've got her at the cab steps, one hand on the rail, rain running off the pair of you. Osk looks down from the window, takes it in, and decides it isn't his business; the engine idles on, patient as money. Hesk is under the diner's awning, waiting, smoking. She doesn't try to run again.*
→ home

## pulled-out if post.rig
*She beats you to the cab, and whoever you left there has the door. She stops. Hesk's two come off the awning at a walk, because now there's a body between them and four thousand, and they take it out of your one on the wet asphalt, without hurry, until Osk leans on his horn. She hasn't moved from the steps. She doesn't try to run again.*
take: part
post rig: hurt
→ home

## pulled-out
*She's in the cab, and the rig pulls out down the ramp with its markers going one by one into the rain, a red stitch unpicking itself from the dark. Hesk watches it go from under the awning, shrugs, and goes back in for a coffee.*
take: none
→ left

# home if case.the-fourteenth=holds and nix4=dug
title: The Cab Steps
room: spine/long-haul

*The cab steps, the rain, the rig idling its warm diesel breath into the lot. Hesk under the awning, a coal at his lip. She's holding her bag in both hands, the way you'd hold something you were about to be asked to give up.*

*{{"It's yours,"}} Nix says. {{"I don't know what's owed. It's yours."}}*

view nix-direct: The case held. Your Thursday client is standing at a rig's steps with Hicks, and MiraGen's man is waiting under the awning. She's the reason R. is dead, and R. meant to kill her for his sister. You can't decide what she's owed, so you've given it to Hicks. He read your book to get here. You haven't said so yet.

- hesk: Walk her over to Hesk. → sold-dug [set fourteenth=sold]
- rig: Let her get in the cab. → gone-dug [set fourteenth=gone]
- nix: Take her to Nix. → nix-dug [set fourteenth=nix]
- sdg: Call SDG and file it. → filed-dug [set fourteenth=filed]

# home if case.the-fourteenth=holds
title: The Cab Steps
room: spine/long-haul

*The cab steps, the rain, the rig idling its warm diesel breath into the lot. Hesk under the awning, a coal at his lip. She's holding her bag in both hands, the way you'd hold something you were about to be asked to give up.*

*{{"It's yours,"}} Nix says. {{"I don't know what's owed. It's yours."}}*

view nix-direct: The case held. Your Thursday client is standing at a rig's steps with Hicks, and MiraGen's man is waiting under the awning. She's the reason R. is dead, and R. meant to kill her for his sister. You can't decide what she's owed, so you've given it to Hicks.

view nix-direct if nix4=asked: He asked you about R. from the start, and never went through your things or your book. Whatever you think of what he does now, don't say he read it.

- hesk: Walk her over to Hesk. → sold [set fourteenth=sold]
- rig: Let her get in the cab. → gone [set fourteenth=gone]
- nix: Take her to Nix. → nix [set fourteenth=nix]
- sdg: Call SDG and file it. → filed [set fourteenth=filed]

# home if nix4=dug
title: The Cab Steps
room: spine/long-haul

*The cab steps, the rain, the rig idling its warm diesel breath into the lot. Hesk under the awning, a coal at his lip. She's holding her bag in both hands, the way you'd hold something you were about to be asked to give up. Nothing you've got would hold in front of SDG.*

*{{"It's yours,"}} Nix says. {{"I don't know what's owed. It's yours."}}*

view nix-direct: Your Thursday client is standing at a rig's steps with Hicks, and MiraGen's man is waiting under the awning. Hicks thinks she's the reason R. is dead, and he can't prove it. You can't decide what she's owed, so you've given it to Hicks. He read your book to get here. You haven't said so yet.

- hesk: Walk her over to Hesk. → sold-dug [set fourteenth=sold]
- rig: Let her get in the cab. → gone-dug [set fourteenth=gone]
- nix: Take her to Nix. → nix-dug [set fourteenth=nix]

# home
title: The Cab Steps
room: spine/long-haul

*The cab steps, the rain, the rig idling its warm diesel breath into the lot. Hesk under the awning, a coal at his lip. She's holding her bag in both hands, the way you'd hold something you were about to be asked to give up. Nothing you've got would hold in front of SDG.*

*{{"It's yours,"}} Nix says. {{"I don't know what's owed. It's yours."}}*

view nix-direct: Your Thursday client is standing at a rig's steps with Hicks, and MiraGen's man is waiting under the awning. Hicks thinks she's the reason R. is dead, and he can't prove it. You can't decide what she's owed, so you've given it to Hicks.

view nix-direct if nix4=asked: He asked you about R. from the start, and never went through your things or your book. Whatever you think of what he does now, don't say he read it.

- hesk: Walk her over to Hesk. → sold [set fourteenth=sold]
- rig: Let her get in the cab. → gone [set fourteenth=gone]
- nix: Take her to Nix. → nix [set fourteenth=nix]

## sold
*Hesk counts a finder's cut into your hand under the awning, crisp MiraGen scrip, and doesn't thank you. He puts her in the back of the van gently, like something he's paid for and means to deliver unbruised. She doesn't look at you. The van door shuts with the soft, expensive sound of a good seal.*
pay: full
settles: nix-direct: Hicks gave your Thursday client to MiraGen's recovery man for a finder's cut. She's alive, in MiraGen's hands. One of your clients is dead and the other's sold, and you gave him the choice.
→ end

## sold-dug
*Hesk counts a finder's cut into your hand under the awning, crisp MiraGen scrip, and doesn't thank you. He puts her in the back of the van gently, like something he's paid for and means to deliver unbruised. She doesn't look at you. The van door shuts with the soft, expensive sound of a good seal.*
pay: full
settles: nix-direct: Hicks gave your Thursday client to MiraGen's recovery man for a finder's cut. She's alive, in MiraGen's hands. One of your clients is dead and the other's sold, and you gave him the choice. And he read your book to do it: her page was on your wall, in your hand.
→ end

## gone
*You step back from the cab. She climbs up without a word and the door shuts on her. The rig pulls out down the ramp, red lights dwindling into the Spine's wet throat, and Hesk watches it go and doesn't follow. In Chiron's files R. stays what they filed him as: a bad edit, a day of shaking, then the heart.*
pay: half
settles: nix-direct: Hicks let your Thursday client get on a long-haul rig and leave the city. R. stays a bad edit in Chiron's files. Nobody will ever answer for him, and she'll carry it wherever she's gone.
→ end

## gone-dug
*You step back from the cab. She climbs up without a word and the door shuts on her. The rig pulls out down the ramp, red lights dwindling into the Spine's wet throat, and Hesk watches it go and doesn't follow. In Chiron's files R. stays what they filed him as: a bad edit, a day of shaking, then the heart.*
pay: half
settles: nix-direct: Hicks let your Thursday client get on a long-haul rig and leave the city. R. stays a bad edit in Chiron's files. And he read your book to find her: her page was on your wall, in your hand.
→ end

## nix
*You walk her back through the rain, past Hesk, who lets you, the coal of his cigarette tracking you to the corner. At dawn, at the Intake, with the window going grey, she sits in her own chair and writes it down on Nix's paper, all of it, in a hand that shakes and then doesn't. Nix keeps the page. It's the only thing between her and MiraGen, and the only thing that says R. didn't die of an edit.*
pay: half
settles: nix-direct: Hicks brought your Thursday client back to the Intake at dawn, and she wrote it all down on your paper: R., the alley, his sister. You keep the page. It's the only thing between her and MiraGen, and the only thing that says R. didn't die of an edit.
→ end

## nix-dug
*You walk her back through the rain, past Hesk, who lets you, the coal of his cigarette tracking you to the corner. At dawn, at the Intake, with the window going grey, she sits in her own chair and writes it down on Nix's paper, all of it, in a hand that shakes and then doesn't. Nix keeps the page. It's the only thing between her and MiraGen, and the only thing that says R. didn't die of an edit.*
pay: half
settles: nix-direct: Hicks brought your Thursday client back to the Intake at dawn, and she wrote it all down on your paper. You keep the page. He'd read your book to find her, and he brought her to you anyway, to decide. You haven't decided what that makes him.
→ end

## filed
*SDG takes her from the cab steps at half two: two Sentinels in grey, with the patience of men paid by the hour. Hesk watches from under the awning, lights another cigarette off the last, and leaves. In a room somewhere in the Nexus a Sentinel types R.'s real name into a form, and beside it, at last, a cause of death that isn't an edit.*
pay: full
settles: nix-direct: Hicks gave your Thursday client to SDG for R.'s death, and it held. R. has a cause of death now that isn't an edit. Your Thursday chair will stay empty.
→ end

## filed-dug
*SDG takes her from the cab steps at half two: two Sentinels in grey, with the patience of men paid by the hour. Hesk watches from under the awning, lights another cigarette off the last, and leaves. In a room somewhere in the Nexus a Sentinel types R.'s real name into a form, and beside it, at last, a cause of death that isn't an edit.*
pay: full
settles: nix-direct: Hicks gave your Thursday client to SDG for R.'s death, and it held. R. has a cause of death now that isn't an edit. He read your book to get there: her page was on your wall, in your hand.
→ end

# left
title: The Empty Lot
room: spine/long-haul

*The rig's markers go down the ramp into the rain one at a time, a red string drawn out into the dark, until there's nothing left of them but the hiss of the lot. Hesk's gone back inside for a coffee.*

*{{"She's gone,"}} Nix says. It isn't a question.*

view nix-direct: Your Thursday client got away on her rig. R. stays a bad edit. You're relieved, and ashamed of being relieved, and you're not going to say either.

- call: Tell her she's gone. → left-said [set fourteenth=gone]
- stay: Stand in the rain until the lot's empty. → left-said [set fourteenth=gone]

## left-said
*"I heard," Nix says. Then nothing for a long time, the line open between you, full of rain and the small electric breath of her room, and neither of you hangs up. The lot empties.*
settles: nix-direct: Your Thursday client got away on a long-haul rig before Hicks could stop her. R. stays a bad edit. You stayed on the line with Hicks a long time after, and neither of you said anything.
→ end

# getaway
title: The Ramp Down
room: spine/catwalk

*Hesk's friends aren't waiting under any awning now. They're on the ramp, rain gear shining, and they've stopped being polite. Below you the rig goes past down the ramp with her in it, its lights slurring in the wet.*

*{{"Get out of there,"}} Nix says.*

view nix-direct: MiraGen's people are after Hicks on the ramp, and the sweeper's rig is already leaving. Tell him to get out, short.

- ladder: Down the service ladder. → clear-out / beaten [check reflex 55, set fourteenth=gone]
- face: Face them and walk through. → clear-out / beaten [check cool 55, set fourteenth=gone]

## clear-out
*You come down the service ladder rung by cold rung into the Spine's undercroft, where the pylons stand in their own runoff and nobody asks. By the time you look back up, the rig's lights are gone.*
→ end

## beaten
*They take it out of you on the ramp, slowly, with the professional lack of interest of men who are paid either way, and leave you there on the grating. By the time you can lift your head, the rig's lights are gone.*
take: none
→ end
