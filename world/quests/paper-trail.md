---
title: Paper Trail
with: [nix-direct, hicks]
starts: lowlight-intake
after: null
pitch: An SDG Sentinel wants one page from the Intake's ledger. What that page is by morning is up to you.
---

# sentinel
stranger: Arlo Venn — an SDG Sentinel: polite, patient, never raises his voice
face: sdg-07

*Boots on the stairs: slow, unhurried, the kind that don't care who hears them. The man in the Intake doorway wears SDG grey under a clear rain shell, water beading on the shoulders. Sentinel Arlo Venn, by the badge. He wipes his feet on the mat like a guest.*

"Evening. I won't keep you." He sets a printout on the nearest table: a woman, sixty maybe, grainy off a transit cam, no name under her face. "She came up these stairs last month. The dead blocks don't keep records. You do — on paper, I'm told." A small, patient smile. "The page for the fourteenth. That's all I'm asking. One page."

*He doesn't sit. He doesn't reach for anything. He folds his hands and waits, like a man with all the time in the city.*

view nix-direct: The ledger is the Intake's whole promise: nobody who climbs these stairs ends up in an SDG file because they did. You've signed most of the pages in it yourself. One page handed over breaks that for everyone who ever trusted the door. Stalling buys time, and time is the one thing you know how to use. You don't know the woman, but she came here for help, and that's enough.
view nix-direct if trust≥mid: Lying to a Sentinel's face is a risk you'd take for someone who has your back, but you'd want to know it holds before you did.
view hicks: You know the face on that printout: Pell, from the dead blocks. She fed you when you were nine and taught you to carry paper through buildings that were supposed to be empty. SDG wanting her page means SDG wants her. You'd burn the whole ledger tonight and sleep fine: the safest thing to own is something nobody can find. You trust this Sentinel's smile about as far as you could throw the stack, and you won't say Pell's name where he can hear it.
view hicks if trust=high: Three nights ago a Sentinel — not Venn, one of his — made you the old offer again: a charge gone, for a little grid work on the side. You said no. You haven't told anyone; tell them only if they ask what you're holding back.
view any: You don't like a Sentinel in this room, and you don't like being asked for paper. Whatever they choose, you'd rather it was quick.

- hand: Hand the page over. → given [set intake_ledger=given]
- stall: Stall him till morning. → stalled
- deny: Say there's no ledger. → denied [needs trust≥mid]

## given
*The page tears out clean along the binding. Venn folds it once, twice, and slips it inside his shell without reading it, as if reading it here would be rude.*

"Thank you. Truly." He nods at the binder, at the desk, at the whole room. "You'll find we remember who helped."

*His boots go down the stairs at the same pace they came up. The ledger sits open on the desk with a soft gap in its spine where the fourteenth used to be. Nobody closes it for a long time.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

## stalled
*Venn considers it, the way a man considers weather.* "Morning, then." He taps the printout once. "Keep that. In case it helps you remember which page."

*His boots go down the stairs, unhurried. The rain swallows them by the second landing. The binder for last month is still on the shelf, its spine cracked, the month written on the label in pen.*
→ ledger

## denied
*Venn's smile doesn't move.* "No ledger. Of course." He looks at the shelf behind the desk for exactly one second longer than he needs to, then picks up his printout. "I'll let myself out."

*He goes too easily. The door clicks. On the shelf, the binder for last month hasn't moved, and now it is the only thing in the room anyone can look at.*
→ ledger

# ledger
*The binder lies open on the desk at the fourteenth. Three sessions, initials only, and a signature line for each. One line, near the bottom, is a thumbprint in blue ink instead of a name: the way people sign when they don't want a name anywhere.*

*Outside, the Ribbon's neon runs down the window in long streaks. Venn will be back. Whatever this page is when he climbs the stairs again, it has to be that by then.*

view nix-direct: You won't destroy client records. That page is somebody's proof they came here and were heard, and burning it would make the Intake a place where pages disappear. Hiding it is better than ash: the page still exists, it just isn't here for him to take. You'd carry it to the dead blocks yourself if it came to that.
view hicks: Burn it. You've seen what SDG does with a thread, and a thumbprint in blue ink is a thread. A forged page would hold if you made it, and you could make it tonight. Hiding it is fine as long as it's somewhere nobody would think to look, and you know a few of those in the dead blocks.
view any: It's their ledger and their call. You'd rather not be the one holding the page when the Sentinel comes back.

- burn: Burn the page. → burned [set intake_ledger=burned]
- forge: Have Hicks make a clean copy. → forged [set intake_ledger=forged, needs with=hicks, clock +2h]
- hide: Take it to the dead blocks and hide it. → taking-it [set intake_ledger=hidden]

## burned
*The page goes into the steel sink in the kitchenette. It takes a second match. The thumbprint curls last, blue going brown, then nothing. The smoke finds the window and the window lets it out into the rain.*

*What's left fits in a palm. Water takes it down the drain.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

## forged
*It takes two hours, a lamp turned all the way down, and a pen that matches the others. The copy has three sessions, initials only, and a signature line for each. The thumbprint is gone. In its place is a name nobody in Lowlight has ever answered to.*

*The real page goes inside a jacket lining. The forged one goes back in the binder, where it looks like it has always been.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

## taking-it
*The page comes out along the binding with a sound like a held breath. Folded twice, it fits inside a jacket, against the ribs. The binder goes back on the shelf with a soft gap in its spine.*

*The back stairs go down into the alley, and the alley goes down into Old Town, where the lights stop.*
→ hiding-place
wait: at dead-blocks · by 05:00 else still-carrying
next: Take the page down to the dead blocks.

# hiding-place
stranger: Oskar — keeps the drum fire going; says little, asks nothing
face: local-05

*The dead blocks are dark the way only empty buildings get dark. Rain ticks on the corrugated sheet across the gap in the wall. At the foot of the tower, a man in an oilskin coat feeds a pallet slat into the drum fire and doesn't look up.*

"Paper," Oskar says, to the fire. "You can smell it on people." *He jerks his chin at the tower's open stairwell, then at his own coat.* "Up there's walls nobody's opened in forty years. Or there's me. I don't read."

view nix-direct: You came down here because the Intake can't be the place the page is. Now it has to be somewhere, and you'd rather it was a wall than a person: a wall can't be asked. But you've sat with enough people from these blocks to know that being trusted with something is a kind of payment here too.
view hicks: You know this stairwell. Fourth floor, east side, the brick that rocks: you hid worse than paper in it at twelve. You also know Oskar, by sight anyway: he's been at that fire as long as anyone remembers, and nobody who's asked him to keep something has ever had it come back to them wrong.
view any: The fire's warm and the man by it isn't curious. Wherever the page goes, it goes tonight.

- brick: Hide it behind a loose brick in the tower. → hidden
- oskar: Give it to Oskar to keep. → held [set ledger_keeper=oskar]

## hidden
*Up the open stairwell, four floors, past landings where the railings went decades ago. The page goes into a wall cavity behind a loose brick on the fourth floor of a block that was condemned before anyone alive was born. Somewhere above, water drips on concrete.*

*On the way back down, Oskar doesn't ask. On the way back up, the Ribbon's lights come up out of the rain like a shoreline.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

## held
*Oskar takes the page without looking at it and puts it inside his coat, where it disappears like it was never anything at all.* "Nobody's," he says. "Same as me." *He feeds the fire another slat.*

*On the way back up, the Ribbon's lights come up out of the rain like a shoreline.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

## still-carrying
*The sky over the Ribbon goes from black to the colour of old dishwater. The page is still folded inside a jacket, against the ribs, warm from being carried all night. It never made it to the dead blocks.*

*It isn't in the binder, at least. That will have to be enough when the boots come up the stairs.*
→ return
wait: until 06:00 · at lowlight-intake · by 12:00 else venn-came
next: He'll be back by morning. Be at the Intake.

# return if intake_ledger=given
stranger: Arlo Venn — an SDG Sentinel: polite, patient, never raises his voice

*Boots on the stairs, same pace as before. Venn has the page from the fourteenth with him, folded in four, and a second printout: the same grainy woman, and under her face now, a name. PELL ODUYA.*

"I wanted you to hear it from me," he says, and sets them side by side on the table. "The thumbprint matched. We picked her up this morning, in the dead blocks, three floors above where anyone said she'd be." *He folds his hands.* "She asked who gave us the page. I told her the truth: nobody had to. It was in a binder, at a place she trusted."

view nix-direct: You handed it over, and now there's a name and an arrest on top of it. You don't hide from what that cost, and you won't let him make it sound like nothing. You want to know what happens to her, and then you want him out of your room, in that order.
view hicks: That's Pell. They have Pell, and they have her because of a page from this room. You keep your hands still and your face easy: the worst thing you could do now is show him she matters to you. You want to know where she is, and you won't ask in a way that tells him why.
view any: The page bought something, and he's here to tell you what. You'd like to know what happens to her before he goes.

- ask: Ask what happens to her now. → asked
- leave: Tell him to get out. → out-given

## asked
"Processed," Venn says, as if it were weather. "Questions, a holding room, a file with her name on it at last. After that it depends on what she says, and to whom." *He picks up the old page and leaves the new printout where it lies.* "Keep that one. You helped make it."
→ end

## out-given
*Venn nods once, as if he'd expected it, and doesn't argue.* "Of course." *He squares the two pages together, tucks them into his shell, and stops at the door.* "For what it's worth, she didn't seem surprised." *Then the stairs, same pace as always, and the rain closes behind him.*
→ end

# return
stranger: Arlo Venn — an SDG Sentinel: polite, patient, never raises his voice

*Boots on the stairs, same pace as before. Venn has a new printout this time. Under the woman's face, someone has typed a name: PELL ODUYA.*

"Funny thing about paper," he says. "It's always somewhere." He doesn't look at the shelf. He looks at each of you in turn, unhurried. "SDG would rather buy a runner than jail one. I'm told some runners haven't heard the price lately." *He sets the printout down and folds his hands.* "The fourteenth."

view nix-direct: He has a name now, which means he didn't need the page for that. He wants it for something else: proof the Intake gives way. Whatever you did with the ledger, you stand behind it in front of him. You're not handing him anything tonight, and you're not apologising.
view hicks: He said Pell's whole name in this room. That's a message, and the line about runners is one too, aimed at you. You keep your voice easy. You don't take the bait about the price, not in front of him, and you don't let him see you know her.
view any: The Sentinel is back, and he knows more than he did. Whatever they did with that page, now is when it has to hold.

- ash: Show him the sink. → ash [needs intake_ledger=burned]
- copy: Hand him the clean copy. → copy [needs intake_ledger=forged]
- empty: Tell him there's nothing here to find. → empty [needs intake_ledger=hidden]
- out: Tell him to get out. → out

## ash
*Venn looks at the sink for a long moment. There's nothing in it but a ring of grey where the water didn't quite reach.*

"Fire," he says, almost fondly. "Fire's honest." He picks up his printout. "It also means you knew what was on it." *He leaves the way he came, and he doesn't hurry, and he doesn't say goodbye.*
→ end

## copy
*Venn reads the page twice. He holds it up to the lamp, then lowers it.* "Very clean," he says. "Cleaner than the others." *He folds it into his shell anyway.* "I'll take it. I'll know what it is, and you'll know I know. That's its own kind of record."
→ end

## empty
*Venn takes the binder down himself, turns to the fourteenth, and finds the soft gap in the spine where a page used to be. He runs his thumb along it.*

"Nothing here to find," he agrees. *He puts the binder back exactly where it was.* "The dead blocks are big. I've got time." *His boots go down the stairs at the same pace as always.*
→ end

## out
*For a second Venn doesn't move. Then he picks up the printout, squares its corners against the table, and tucks it away.*

"Of course." *At the door he stops.* "Lowlight Intake. Never tells SDG who comes through the door." *It isn't a question. He goes, and the rain closes behind him.*
→ end

## venn-came
*A message lands on the nearest deck: a photo from the Intake's door cam. A card wedged in the frame at eye height, SDG grey, Arlo Venn's name and a number nobody would call. The next frame shows the back, in neat pencil:* The fourteenth. We'll talk.

*He came, and found the room empty. Whatever he wanted, he'll want it again, at a time of his choosing instead of yours.*
→ end
