---
title: Thursdays
kind: mission
tier: 2
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: fourteenth_one=yes
trust: 1 / 2
people: [Penn, Hesk]
pitch: Hae saw him come out of Penn's. Penn's who she sends people to.
posted-by: Nix, at the Intake.
text: Your Thursday client missed this week. You won't say who that is. Tell Hicks it's about Penn, and that you need him to come up before he goes anywhere near Penn's. Say nothing else.
brief: R. came out of Dr. Penn's back door with ink on his hand, a week before he died. Penn is the back-room clinic Nix sends people to when they can't pay MiraGen.
pay: 360-440
loot: what Penn keeps under the counter
---

# ask
title: Thursday's Chair

*The chair across from her is empty, and it's Thursday's chair. She's been sitting with it for an hour.*

*"My Thursday didn't come," she says. "Don't ask me who." She turns the lamp down. "Hae says he came out of Penn's back door with something on his hand. Penn's who I send people to, when they can't pay MiraGen and they can't wait. If you go in there hard, I lose him, and so do they."*

view nix-direct: Your Thursday client didn't come this week, and you won't say who that is, not even to Hicks. What you'll talk about is Penn: the back-room clinic you send people to when MiraGen prices them off their script. You need Penn. You want Hicks to go gently. If he asks you to call ahead, you will. If he just goes, you'll know about it soon enough.

- call: Ask her to call Penn first. → called [set nix5=asked, set nix_asked=yes]
- go: Tell her you'll handle it. Go without her calling. → went [set nix5=dug]

## called
*She calls him on paper terms: a friend of hers, a few questions, nothing on the grid. Penn says yes too quickly.*
→ front

## went
*"Gently," she says. You don't say yes.*
→ front

# front
title: Penn's Back Room
stranger: Dr. Penn — runs a back-room clinic for cracked edits; grey, tired, kind hands
face: local-karasu-06
room: karasu/ripper-clinic

*Penn's back room is a dentist's chair, a sink, a fridge with a padlock and a kettle. He's old and grey and his hands are kind. In the front window, behind the shutter, there's still a card in his handwriting: CLOSED, FAMILY MATTER, dated the 5th.*

*{{"Be decent to him,"}} Nix says. {{"He's been decent to people I sent."}}*

view nix-direct: Hicks is in Penn's back room. Penn has patched up people you sent him, for paper, for nothing. You don't want him frightened. Say one thing about Penn that's true and kind, and let Hicks ask the questions.

- talk: Sit in his chair and ask about the man with ink on his hand. → denied / denied-flat [check cool 55]
- look: Look round while he talks. → denied / denied-flat [check wits 55]

## denied
*"I've never laid eyes on the man," Penn says. He says it to the kettle. The card in the window says the shutter was down on the 5th, the day Hae saw R. come out of his back door.*
gives: clue the-fourteenth PENN
gives: clue the-fourteenth SHUTTER
→ book

## denied-flat
*"I've never laid eyes on the man." He says it twice, the second time before you've asked again. The card in the window says the shutter was down on the 5th, the day Hae saw R. come out of his back door.*
gives: clue the-fourteenth PENN
gives: clue the-fourteenth SHUTTER
→ book

# book
title: Penn's Book
room: karasu/ripper-clinic

*His book's on a cheap deck under the counter, the kind every clinic keeps for MiraGen's auditors and then keeps something else on. He goes in the back to fill the kettle.*

*{{"Hicks,"}} Nix says. {{"What are you doing?"}}*

view nix-direct: Hicks is reading Penn's book behind Penn's back, and you sent him there. You don't like it. You want to know what's in it. Say so in as few words as you can.

- crack: Crack the deck's login. → opened / shut [crack 6]
- lift: Lift the deck while he fills the kettle. Have it back before he's out. → opened / shut [check reflex 55]

## opened
*Initials, dates, stock. Thursdays after ten, the same line every week: stock in from LT. Someone's added a gloss in the margin, in Penn's hand: LT, the Tilt's sweeper. And one line from March, on its own: 14 March. A. Okafor. LT stock. Died on the table.*
gives: clue the-fourteenth LEDGER
gives: clue the-fourteenth ADA
→ tilt

## shut
*It locks. The kettle clicks off in the back, and you've got your hands in your pockets when he comes out. Penn's book stays shut.*
→ tilt

# tilt
title: The Tilt
post back: Someone takes a seat at the back, by the door to the alley. [suits face]
gives back: The back door's watched. If she runs, a miss doesn't lose her.
stranger: The sweeper — late twenties, thin, a parka over scrubs, a broom she never quite puts down
face: local-karasu-05
room: karasu/the-tilt

*R. ate at Hae's where he could see the Tilt's door, so you sit where he was looking. The Tilt's floor runs downhill toward the back wall. The sweeper works it from the top, slowly, and she's been watching you since you sat down. At the bar a man in a wet coat is drinking something clear and not looking at anyone.*

*{{"You're in the Tilt,"}} Nix says. Then nothing else.*

view nix-direct: Hicks is in the Tilt, sitting where R. used to look from Hae's counter. You don't talk about who drinks or works anywhere; that's other people's business. Say nothing at all if you can manage it.

- ask: Ask her where she was the night the man died behind Hae's. → swept / swept-short [check cool 55]
- crates: Carry the crates out back for her. She talks while she works. → swept / swept-short [check body 55]

## swept
*"I was on my broom at the Tilt till they shut," she says, before you've finished. "Cass will tell you." You ask her what she sells. "Sell? I sweep floors at the Tilt. I've never had anything worth selling." The till roll hangs by the register, and her tab's on it: closed 22:15, the 7th. At the bar the man in the wet coat says, to nobody, "Dead men don't pay MiraGen. I was on the SDG floor all night. Ask the desk."*
gives: clue the-fourteenth ALIBI
gives: clue the-fourteenth NEVER
gives: clue the-fourteenth TAB
gives: clue the-fourteenth HESK
→ cass

## swept-short
*She doesn't like the question. "I was on my broom till they shut. Cass will tell you." And when you push: "Sell? I sweep floors. I've never had anything worth selling." Her tab's on the till roll by the register: closed 22:15, the 7th. The man in the wet coat at the bar turns round. "Dead men don't pay MiraGen," he says. "I was on the SDG floor all night. Ask the desk."*
gives: clue the-fourteenth ALIBI
gives: clue the-fourteenth NEVER
gives: clue the-fourteenth TAB
gives: clue the-fourteenth HESK
→ cass

# cass
title: The Late Shift
room: karasu/the-tilt

*Cass has the late shift. No business settled inside: she keeps it without raising her voice. She looks after her regulars and doesn't sell them, and the sweeper is a regular.*

*{{"Cass won't tell you,"}} Nix says. {{"Not if she likes her."}}*

view nix-direct: Hicks is asking Cass about one of her regulars. You know Cass looks after her regulars and doesn't sell them. Leave it to Cass.

- straight: Ask her straight, one regular about another. → told-cass / closed-up [check cool 50]
- chairs: Stay till close and stack the chairs. → told-cass / closed-up [check wits 50]

## told-cass
*Cass stacks the last chair and doesn't look at you. "She went out the back before half ten," she says. "Left a full glass. Not like her." Then she turns the lights off over the bar, and that's all you get.*
gives: clue the-fourteenth CASS
→ out

## closed-up
*Cass laughs and pours you one on the house, and tells you nothing at all about anybody. That's what the Tilt is for.*
→ out

# out
title: The Back Door
room: karasu/the-tilt

*The sweeper leans her broom on the wall and goes out the back, quick. The man in the wet coat puts his glass down, and somebody at a back table gets up and follows her. Two of them, then, and her, and the Ribbon's alleys.*

[post.back] *Whoever you left by the back door is already on their feet.*

*{{"Hicks,"}} Nix says. {{"Don't let them."}} It's the first thing she's asked for.*

view nix-direct: Someone's gone out the back of the Tilt and MiraGen's people are after her. Whoever she is, you don't want MiraGen's hands on anyone in an alley under your city's rain, and it matters to you more than you can explain. Ask Hicks once.

- lights: Kill the alley lights from your deck and let her lose them in the dark. → between / lost-her [check tech 50]
- door: Put the follower into the door frame on his way out. → between / lost-her [check body 50 · if post.back=fit +10 "your face is in his way"]

## between
*The alley goes dark and stays dark. The sweeper's gone round the corner before the follower finds the wall. The man in the wet coat stands at the Tilt's back door and looks at you, and then he smiles, as if you've done him a favour.*
pay: full
→ home

## lost-her if post.back
*You lose them in the first turning. Whoever you left by the back door doesn't: they go out on the follower's arm, talking, and he has to put them into the bins to get it back. By then she's round the corner. You find your own sitting against the Tilt's back wall beside a broom, holding their ribs. The man in the wet coat looks at the pair of you from the door, and smiles.*
pay: full
take: part
post back: hurt
→ home

## lost-her
*You lose them both. The Ribbon's alleys go every way at once, and by the time you're out the far end there's nobody. A broom against the Tilt's back wall, and the rain.*
take: none
→ short

# home
title: Her Desk

*You tell her about Penn's book, and the Tilt, and the sweeper who left her broom. She goes very still. She doesn't say anything for a long time, and you watch her not say it.*

*"I can't," she says, finally. "You know I can't."*

view nix-direct: The sweeper Hicks is describing is your Thursday client, the one who didn't come this week. You can't say so. Everything she said in this room is hers, and so is everything R. said, and you're starting to be afraid of what the two of them make together. Don't confirm it. Don't deny it. Don't name her.

view nix-direct if nix5=dug: He went into Penn's without you calling ahead, after you asked him to be gentle. Penn will know the Intake sent him. You'll deal with that later.

- leave: Tell her you won't ask. → unasked [set fourteenth_two=yes]
- wall: Tell her you'll need her wall before the fourteenth. → wall [set fourteenth_two=yes]

## unasked
*"Thank you," she says, and means it, and it doesn't help either of you.*
→ end

## wall
*She looks at the bare wall over the daybed. "I'll clear it," she says.*
→ end

# short
title: Her Window

*You come back up wet and empty-handed. She's at the window. She saw the alleys from up here.*

*"She got away," Nix says. Not who. Just that.*

view nix-direct: Hicks lost the sweeper and MiraGen's man both. You saw the alleys from your window. You're relieved she got away, and you can't say why, and you're frightened of what that relief means.

- sorry: Tell her you lost them. → lost-said [set fourteenth_two=yes]
- wall: Tell her you'll need her wall. → lost-wall [set fourteenth_two=yes]

## lost-said
*"I know," she says. "I watched."*
→ end

## lost-wall
*"I'll clear it," she says, without turning round.*
→ end

# getaway
title: The Kitchen Door
room: karasu/the-tilt

*The man in the wet coat isn't drinking any more, and nor are his friends. Cass has gone very quiet behind the bar. You've got the kitchen door and the alley behind it.*

*{{"The kitchen,"}} Nix says. {{"Go."}}*

view nix-direct: MiraGen's people are on Hicks inside the Tilt. Tell him the way out, short.

- kitchen: Out through the Tilt's kitchen. → out-back / held [check reflex 55, set fourteenth_two=yes]
- bar: Talk your way past them to the door. → out-back / held [check cool 55, set fourteenth_two=yes]

## out-back
*Through the steam and out. Nobody follows you far.*
→ end

## held
*They hold you at the bar long enough to ask who you work for. Cass watches them do it. They let you go when she reaches under the counter.*
take: none
→ end
