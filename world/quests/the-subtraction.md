---
title: The Subtraction
art: the-subtraction.webp
kind: contract
tier: 3
with: [mother-rot]
starts: counting-house
after: null
pitch: One line in a ledger nobody reads. Four hundred sol, and he's paying more than that to collect it.
posted-by: Mother Rot
brief: One old debt from his ledger, and he wants it closed. Crew do the groundwork first, then comes one long night.
pay: 1000-1200
night: +72h
fallout: +48h
groundwork: boat muscle, roof ears, goodwill face
piece boat: Her skiff, at its mooring on the Bell Street cut. It goes under before light. Someone has to pull the plug with half the stretch asleep around them.
piece roof: A room in a building he controls. The landlord changes the bolt and her things go on the landing. Someone needs to be there to see what comes out.
piece goodwill: Her name on the water. A few words on her stretch, and the ferries stop carrying her. Everyone there owes him. It only needs saying.
posts-at: 45
rumor: Mother Rot has been asking after you.
---

# offer if met=yes

*The boat knocks marble where the tellers used to stand. Service stairs, wet to the third step. He has broth on the long table and a second bowl already poured, and he lets you finish it before he says anything. You've eaten here before. This is different. The ledger's on the table.*

*Nobody's seen that ledger open. He turns it round with two fingers and lays one thick nail under a line.*

*Neve Oda. Four hundred sol.*

*"It's a small debt, child. I want you to understand that before you start."*

view mother-rot: This is the only time anyone has seen that book open, and you want them to feel it. She's yours. You raised her. You will not say why it matters. Let the size of the number do the work.

- take: Take it. → taken
- ask: Ask why four hundred is worth what he's about to pay. → told

# offer

*The boat knocks marble where the tellers used to stand. Service stairs, wet to the third step. A big man at a long table, gold at his throat, an amber glass where one eye should be. He has broth poured for you already. He knows your name. He lets you finish the bowl before he says anything.*

*Then he opens a book nobody sees open. He turns it round with two fingers and lays one thick nail under a line.*

*Neve Oda. Four hundred sol.*

*"It's a small debt, child. I want you to understand that before you start."*

view mother-rot: This is the first time they've sat at your table, and nobody has ever seen that book open. She's yours. You raised her. You will not say why it matters. Let the size of the number do the work.

- take: Take it. → taken
- ask: Ask why four hundred is worth what he's about to pay. → told

## told
*He taps the glass. "Because people have noticed, and a thing that's noticed has to be seen to."*
*He names a price. It's more than twice what she owes, and then it's more than that.*
→ opened

## taken
*He names a price. It's more than twice what she owes, and then it's more than that. He watches you not ask, and it goes down somewhere behind the glass.*
→ opened

# opened

*"She came up in my house. I fed her." He closes the book. "The boat, the roof, her name on the water. Send someone. Two of the three will do. Three nights from now you go and get what's left, and you bring her up those stairs."*

*He relights the cigar. "I don't do this part myself. I never have. That's what the money's for."*

view mother-rot: You mean every word about feeding her.

- yes: Say you'll see to it. → set
- nod: Finish the bowl. → set

## set
*The boat's waiting. Nobody says goodbye in this building.*
→ back

# report-boat if boat=blown

*The skiff was already gone from the mooring. A Sump-Rat crew had it, tide lines inked to the wrist, and they walked your recruit back along the plank and asked who's paying now. Word goes up the canals by morning: someone's coming for Neve Oda.*

- pay: Pay the crew to forget it. → boat-paid [set boat-crew=paid]
- leave: Let them talk. → boat-left

# report-boat if boat=messy

*The skiff went down at its mooring with its plug out. Half the stretch watched it go, and nobody moved. There was a tin under the thwart: forty sol, and a photograph of a bank lobby with the water still low.*

- send: Send her the tin. → boat-sent [set tin=sent]
- keep: Keep it. → boat-kept [set tin=kept]

# report-boat

*The skiff went down at its mooring with its plug out, some time before light. She'd have found it at dawn with the water at the gunwales. There was a tin under the thwart: forty sol, and a photograph of a bank lobby with the water still low.*

- send: Send her the tin. → boat-sent [set tin=sent]
- keep: Keep it. → boat-kept [set tin=kept]

## boat-paid
*They take the sol. Sump-Rats keep a bargain, and they don't forget who needed one.*
→ back

## boat-left
*By noon it's in the kitchens.*
→ back

## boat-sent
*It goes to her by a boy who doesn't know what's in it. You don't hear what she said.*
→ back

## boat-kept
*The forty's nothing. The photograph goes in your coat.*
→ back

# report-roof if roof=blown

*The landlord wouldn't move. He owes Rot, and he's more afraid of her than you'd think. Your recruit came down the outside stair with a split lip and nothing else.*

- again: Tell Rot it needs his name on it. → roof-named
- drop: Let it lie. → roof-dropped

# report-roof if roof=messy

*She came home in the middle of it. She stood on the landing with her things going past her and didn't say one word. In the room: a dive lamp, old, the brass worn soft, and a tide log with a winter's dates in it, every page in the same hand.*

- bring: Bring the log to you. → roof-kept [set log=kept]
- leave: Leave it where she'll find it. → roof-left [set log=left]

# report-roof

*The landlord changed the bolt at noon. Her things are on the landing. Nothing much. A dive lamp, old, the brass worn soft. A tide log with a winter's dates in it, every page in the same hand. She dived for him once. Nobody told you that.*

- bring: Bring the log to you. → roof-kept [set log=kept]
- leave: Leave it where she'll find it. → roof-left [set log=left]

## roof-named
*You send word up the stairs. An hour later the landlord has a new bolt. Rot sends nothing back, and that's a bill.*
→ back

## roof-dropped
*She keeps the roof. It won't matter much.*
→ back

## roof-kept
*It's in your coat now. Depths, times, a pump number on most lines. It smells of canal.*
→ back

## roof-left
*Whatever it is, it stays hers.*
→ back

# report-goodwill if goodwill=blown

*It went round the wrong way. A net-mender called Bryn stood up in the Choir's kitchen and asked out loud who was paying to starve a woman Mother Rot raised. Nobody answered. Nobody forgot it either.*

- press: Lean harder. → goodwill-pressed [set bryn=leaned]
- stop: Leave it. → goodwill-stopped

# report-goodwill if goodwill=messy

*It only took a few words. The ferries stop carrying her. The kitchen runs out when she gets to the front of the line. Bryn, who mends nets on the Bell Street cut, still feeds her and doesn't care who sees. Bryn told your recruit where Neve went, and spat after.*

- press: Lean on Bryn too. → goodwill-pressed [set bryn=leaned]
- stop: Leave the old woman be. → goodwill-stopped

# report-goodwill

*It only took a few words, and most of it you didn't have to say. Everyone on her stretch owes him. The ferries stop carrying her. The kitchen runs out when she gets to the front of the line. One net-mender, Bryn, still feeds her, and says she's gone to the Works.*

- press: Lean on Bryn too. → goodwill-pressed [set bryn=leaned]
- stop: Leave the old woman be. → goodwill-stopped

## goodwill-pressed
*It's done by evening. Bryn's nets are in the water. Nobody saw anything.*
→ back

## goodwill-stopped
*One door stays open on that whole stretch.*
→ back

# night

*She's run for the Works, the one place in Lowlight his name buys nothing. He told you that at the top of the stairs, and it's why you're here and he isn't. His voice is in your ear, warm as broth. The Bell Street cut runs black ahead of you, and the Sump-Rat toll boat sits across it with its lamp hooded.*

[seen=yes] *They've been told to look for someone. The lamp swings your way before you've cleared the bridge.*
[boat-crew=paid] *The man on the toll boat looks through you. Paid is paid.*

view mother-rot: You're on the line from the Counting House, and you can't go where they're going. The Waterkeepers won't have you near the Works. You're warm and unhurried, and you want to hear how it goes.

- pole: Take the pole yourself, lights out, along the wall. → crossed / hailed [check reflex 55]
- toll: Hail the toll boat and give them his name. → crossed / hailed [check cool 55]
- canal: Take her back canals. She showed you the way when you took the boat. → crossed / hailed [check wits 55 angle, needs angle.boat=yes]

## crossed
*The cut opens onto the flats. Ahead the Works stand up out of the dark, lit like a hospital.*
→ fence

## hailed
*A lamp, a shout, somebody's boat coming round. You get through, and now someone knows which way you went.*
→ fence

# fence

*The Waterkeepers don't take bribes and they don't put up signs. Mesh, a sensor line on a brotherhood's own wire, and a shift board at the gate. The foreman's name is chalked off for the night.*

[angle.boat!=yes] *There's a skiff tied below the gate with its plug in and its oars shipped. She got here on the water. She can leave the same way.*

- wire: Splice the sensor line and walk it through. → inside / tripped [check tech 55]
- cut: Go through the mesh where the bank's slumped. → inside / tripped [check body 55]

## inside
*Inside the wire it smells of chlorine and wet iron. The whole place hums in your teeth.*
→ bays

## tripped
*A light comes on two sheds down. Nobody runs. Here they don't have to.*
→ bays

# bays

*The settling bays lie flat and black under the gantries, an acre at a time. Everything Lowlight drinks goes through this water. Your feet are loud on the grating and there's a long way to go.*

- wade: Go down into the overflow channel and wade it. → across / heard [check body 55]
- gantry: Cross on the gantry between the sweeps of the lamp. → across / heard [check reflex 55]
- weir: Go in under the weir, the way a diver would. The log has the depth. → across / heard [check body 55 angle, needs angle.roof=yes]

## across
*You come up at the foot of Pump House Nine with the cold in your knees.*
→ floor

## heard
*A voice on the gantry, then another. You stand in the dark and count, and it costs you.*
→ floor

# floor
room: drownworks/pump-house-nine

*The pump house floor is a cathedral with the sound turned up. A crew on shift, four of them, ear defenders, not looking up. They look up for one thing, and that's you.*

[log=kept] *The log is heavy in your coat. Pump Nine is in it, more than once.*

- hat: Take a hard hat off the rack and walk it like you work here. → passed / stopped [check cool 50]
- panel: Throw a fault on the far board and go while they look. → passed / stopped [check tech 50]

## passed
*Nobody looks twice. The stair goes down to the old intake, where the shift doesn't go.*
→ find

## stopped
*A man with a wrench asks you a question. You leave some of what you came with on that floor, getting past him.*
take: part
→ find

# find
room: drownworks/old-intake

*The old intake. Dead pipe, a work lamp, a bedroll. Somebody's been sleeping under the Works in a borrowed set of coveralls with another name on the pocket.*

[bryn=leaned] *She knows about the nets. It's in the way she doesn't turn round.*
[tin=sent] *The tin is on the bedroll. She's kept the photograph out.*

- read: Read the room before she reads you. Find the way she'd bolt, and stand in it. → cornered / bolted [check wits 50]
- rush: Get to her before she gets to the hatch. → cornered / bolted [check body 50]
- bryn: Say Bryn sent you. It's nearly true. → cornered / bolted [check wits 50 angle, needs angle.goodwill=yes]

## cornered
*She stops. She looks at you the way you'd look at the weather.*
→ turn

## bolted
*She gets as far as the hatch and it's rusted shut, and that's that. There's blood on her hand and she doesn't look at it.*
→ turn

# turn

stranger: Neve Oda — late thirties, a diver's shoulders, somebody else's name on her coveralls
face: neve-oda
room: drownworks/old-intake

*"Four hundred," she says. "Is that what he told you?"*

*She talks to you and past you, to whoever's in your ear. The winter they tried to drain the Marsh, the pumps went one by one. Six divers went down to see to that. He paid well. Five of them are in the canals now, one a year, and every one of them owed him something small. She came here to say it to the Waterkeepers' faces, tomorrow, at the shift change.*

*"He fed me," she says. "Ask him."*

*The line's open. For a moment there's nothing on it at all. Then you hear him relight the cigar.*

view mother-rot: They are standing in front of her and she has just said it, and you heard every word. You neither confirm nor deny anything, now or ever. You say the water always wins. You are very gentle. The price hasn't changed, and they know where you live, and you know where they live. Don't plead and don't threaten.

- finish: Tell her to get up. → brought [set turn=finish]
- go: Close the line. Tell him you lost her in the pipes. → lost [set turn=go]
- keep: Get all of it from her, names and dates, for yourself. Then decide. → kept [set turn=keep]

## brought
*She gets up. She's been expecting it for fifteen years.*
→ out

## lost
*She looks at you, and at the dead pipe behind you. She doesn't thank you. She goes into the dark and doesn't look back, and there's a work lamp, and a man on the line who'll want to know.*
→ out

## kept
*She talks for ten minutes and you take it all. Then she goes where you tell her, and she knows what that makes you.*
→ out

# out
room: drownworks/old-intake

*The horn goes for the shift change, an hour early. They've found something, or someone's said something. Boots on the iron above you.*

[turn=finish] *She walks in front of you. She doesn't need telling which way.*
[turn=go] *You're alone, and there's nothing you can do about how that looks.*
[turn=keep] *What she told you weighs nothing. It's all you're carrying out.*

- run: Run the old intake to the outfall, and don't stop. → clear / caught-out [check reflex 50]
- time: Wait for the shift to pass over you, and go in its wake. → clear / caught-out [check wits 50]

## clear
*Cold air. The outfall drops you on the flats with the Works lit up behind you.*
→ last

## caught-out
*You come out, but not clean, and not with everything. Someone back there has a good look at you.*
take: part
→ last

# last if turn=go

*The gate of the flats, and two men in brotherhood coveralls between you and the water. They don't know what you did tonight. They only know you're here. The line clicks. {{"Did you find her, child?"}}*

view mother-rot: You already know the answer, or you know enough. Ask anyway, gently.

- talk: Walk up to them with the fault report in your hand. → home-go / caught [check cool 50]
- through: Go through them. → home-go / caught [check body 50]

# last if turn=keep

*The gate of the flats, and two men in brotherhood coveralls between you and the water. The line clicks. {{"Well, child?"}}*

view mother-rot: You heard them go quiet down there. You want to know what you've bought.

- talk: Walk up to them with the fault report in your hand. → home-keep / caught [check cool 50]
- through: Go through them. → home-keep / caught [check body 50]

# last

*The gate of the flats, and two men in brotherhood coveralls between you and the water. She's stopped walking. She's looking at them, and they haven't seen her yet. All she has to do is shout. The line clicks. {{"Nearly home, child."}}*

view mother-rot: You can't see any of this. You can hear their breathing.

- talk: Walk her up to them with the fault report in your hand, and talk first. → home / caught [check cool 50]
- through: Put a hand over her mouth and go through them. → home / caught [check body 50]

## home
*A boat at the outfall, and by the time the sky goes grey the marble's knocking under the hull. She climbs the service stairs ahead of you. She knows the way.*
pay: full
→ end

## home-go
*You come in across the flats with nothing to show for it. He pays you for the night, more or less, and he doesn't ask you to sit.*
pay: half
→ end

## home-keep
*You come in across the flats alone. He hears what you have to say. He looks at you for a long time with the glass. Then he pays you. All of it.*
pay: full
→ end

## caught
*Hands, coveralls, the flat of a wrench. They throw you back out through the mesh with your teeth loose and they keep whatever you had. The Waterkeepers don't call anyone. They just know your face now.*
take: none
→ end

# fallout if grade=blown

*You go up the stairs because you owe it. There's broth. He has the ledger out, and he doesn't turn it round.*

*"It was a small debt," he says. He writes something. You can't see what.*

view mother-rot: They failed you on the Waterkeepers' ground and now the Works know a face. You're not angry. Anger is for people who can't collect.

- say: Say it won't happen again. → done-blown
- nod: Finish the bowl. → done-blown

# fallout if turn=go

*You go up the stairs because he sent the boat. Broth, poured. He turns the ledger round. There's a new line in the same thick hand.*

*Your name. Four hundred sol, and what he paid you. Nobody's said a word about what she told them, or what she didn't. The Works haven't moved. Nothing's happened at all, yet.*

*"It's a small debt, child," he says.*

view mother-rot: You know. You won't say you know. They owe you now, and that's all you ever wanted from anyone.

- pay: Ask what he'd take for it. → done-go
- nod: Finish the bowl. → done-go

# fallout if turn=keep

*The roof, on broth night. He takes you to the rail himself and you look at the canals together. He doesn't mention her. He asks if you're eating. He's put more in your bowl than anyone else's.*

*"Well played," he says, not looking at you, and he taps the glass. "Child."*

*You hold what you hold, in a place he'd have to look for it. It could be fondness. It could be the other thing. There used to be six.*

view mother-rot: They hold something over you. You like them better for it, and you will outlive it. Be warmer than you've ever been.

- eat: Eat. → done-keep
- leave: Leave the bowl where it is. → done-keep

# fallout

*She's at the long table when you come up. Her boat's back at the mooring, patched, on a new line in the book that she won't clear in the years she has left. He's given her a bowl. She's eating it.*

*She looks up when you come in. She doesn't look at anything else for a while.*

*"You see?" he says to you, pleased, and pours. "Nobody's lost."*

view mother-rot: She's home. You mean it. This is the best outcome anyone could have had, and you'd like them to agree.

- sit: Sit down. → done-finish
- stand: Stay on your feet. → done-finish

## done-blown
*He closes the book. You take the stairs down on your own. Nobody's holding the boat.*
→ end

## done-go
*He tells you. It isn't sol. It'll keep. Going down the stairs you pass a net-mender from the Bell Street cut coming up with nothing in her hands. She looks at you and says {hire} would work for you, if you're the one who lost that woman in the pipes.*
gives: recruit ears HAND
hire-pitch: The Bell Street cut talks to me. If you can lose someone in the pipes, you can use what it says.
gives: outfit hicks tie
→ end

## done-keep
*The lights of the Strand come on across the water. Neither of you says anything else, and the broth goes cold.*
gives: outfit hicks tie
→ end

## done-finish
*The ledger's shut. The money's good, and it's on time. Everything about him is on time.*
gives: outfit hicks tie
→ end
