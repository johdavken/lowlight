---
title: The Fourteenth
kind: mission
tier: 2
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: lark and lark!=sold and trust>=mid
trust: 1 / 2
people: [Hesk]
pitch: A client of hers is dead in the alley under her window. The city filed it. She wants it looked at.
posted-by: Nix, at the Intake. Paid in a dead man's money.
text: A Tuesday client of yours, R., stopped coming. Chiron filed him dead in the alley under your window, a bad edit. He didn't take edits. You want Hicks to come and look. Don't put R.'s name on the Relay, and don't say more than that.
brief: Her Tuesday client is dead in the alley behind Hae's. Chiron filed it as a bad edit. She doesn't believe it, and she's paying with his money to have it looked at.
pay: 360-440
loot: R.'s month of Tuesdays, in paper
---

# ask
title: A Tuesday

*She hasn't turned the lamp on. The street sign comes through the blind in stripes.*

[lark=hers] *The flat glass in her left eye gives the stripes back. The real one's in a tin across the Ribbon, and she knows to the minute how long she's been away from it.*
[lark=crushed] *The flat glass in her left eye gives the stripes back. There's nothing behind it now, anywhere, and she sits a little easier for that.*
[lark=house] *The flat glass in her left eye gives the stripes back. The real one's in somebody's drawer again. She hasn't said a word about it since.*

*"He was a Tuesday," she says. "Three nights ago they found him in the alley, right under this window. I heard the drone. I didn't go down." She puts an envelope on the desk: a month of Tuesdays, paid ahead, in paper. "Chiron says a bad edit. He didn't take edits. He told me so, every week, like it mattered." She doesn't push the envelope at you. "I'm not asking who. I'm asking if it was what they say."*

*Someone knocks at the landing door, a client early, and she looks at it and then at you.*

view nix-direct: R. was your Tuesday client. Three nights ago he died in the alley under your window; you heard the Chiron drone and didn't go down. You're paying Hicks with R.'s money. What R. said in this room is his. If Hicks asks, give him one thing: R. gave you a date, the fourteenth, and said after it he wouldn't need this room. Not what it meant; you don't know. Don't name other clients or guess who did anything.

- ask: Ask her what he talked about. → told [set nix4=asked, set nix_asked=yes]
- read: Let her take the client on the landing. Read her book while she's gone. → read [set nix4=dug, unheard]

## told
*She thinks about it for a long time. "He gave me a date," she says. "The fourteenth. After that, he said, he wouldn't need this room." She goes to answer the door. "That's all you get. That's more than I should."*
gives: clue the-fourteenth DATE
→ alley

## read
*She goes out to the landing and pulls the door to. Her book is in initials and pencil. R.'s Tuesdays are on the left-hand page: his sister, the same date twice. On the right-hand page it's Thursdays. K., Thursdays. "What I sold." "Someone's coming for me." You close it the way you found it, square to the edge of the desk. When she comes back in she doesn't look at it.*
gives: clue the-fourteenth SOLD
→ alley

# alley
title: The Drainpipe
room: karasu/intake-back-alley

*The alley behind Hae's: bins, steam from the kitchen vent, the drain where the water runs off the Intake's roof. Chiron tags the places where its dead are picked up, so the cart can find them. The tag's still zip-tied to the drainpipe, three nights old, already going grey.*

*{{"That's where,"}} Nix says in your ear. {{"I can see the pipe from here."}}*

view nix-direct: You're at your window with the lamp off, on Hicks's ear, looking down at the place R. died. You can see the drainpipe and the tag on it. Tell him what you can see from up here, and nothing about R.

- ground: Read the ground, the drain, the wall, before you read the tag. → tagged / tagged-late [check wits 55]
- log: Pull the drone's filing off Chiron's dispatch. → tagged / tagged-late [check tech 55 grid]

## tagged
*The tag gives the filing in Chiron's flat shorthand: spent vial in hand, cracked, no MiraGen seal; port used; a bad edit, a day of shaking, then the heart. Under it, the dispatch: the call came in at 23:40, from a booth deck two streets over. Somebody saw him die and walked two streets to say so.*
gives: clue the-fourteenth HAND
gives: clue the-fourteenth CALL
→ counter

## tagged-late
*It takes too long, and Hae's cook comes out with the slops and stands watching you. You get it anyway: spent vial in hand, cracked, no MiraGen seal; port used; a day of shaking, then the heart. The call came in at 23:40, from a booth deck two streets over.*
gives: clue the-fourteenth HAND
gives: clue the-fourteenth CALL
→ counter

# counter
title: Hae's Counter
post stool: Someone takes the end stool at Hae's and watches the booth street. [suits ears]
gives stool: The street's watched while you work. At the booth, a miss doesn't cost you the night.
room: karasu/noodle-stall

*Hae's counter, under the sign. She's been feeding the Ribbon at this counter longer than you've been coming down it. She knows who you're asking about before you've asked.*

*{{"She fed him,"}} Nix says. {{"Most nights. He ate where he could see the street."}}*

view nix-direct: Hicks is at Hae's counter, under your floor. Hae fed R. most nights. You know Hae; you trust her more than most people. Let Hae tell it. Don't add what R. said upstairs.

- eat: Sit, eat, and let her get to it in her own time. → fed / fed-cold [check cool 55]
- regulars: Ask about her regulars until she gets to him. → fed / fed-cold [check wits 55]

## fed
*"Last I saw him was the night he died," Hae says. "Eleven, at this counter. Steady hands. Ate every noodle." She wipes the counter where he sat. "And the 5th, he came down the alley from Penn's back door with ink on his palm. Wouldn't let me see it. Kept his hand shut all through the bowl."*
gives: clue the-fourteenth BOWL
gives: clue the-fourteenth DOOR
→ cart

## fed-cold
*She makes you wait through two bowls before she says anything. "Eleven, the night he died. Steady hands. Ate every noodle." Then, as you're paying: "The 5th he came down the alley from Penn's back door with ink on his palm. Wouldn't let me see it."*
gives: clue the-fourteenth BOWL
gives: clue the-fourteenth DOOR
→ cart

# cart
title: The Dead Blocks
room: karasu/dead-blocks

*A dead-cart crew doesn't wait for next of kin. They take the body, they take the chrome, and what's left goes to the city. This one works out of a gutted block past the wall, three of them round a fire in a drum, and one of them is wearing a dead man's watch.*

*{{"Be careful,"}} Nix says. {{"They sell what they find. Sometimes they find people."}}*

view nix-direct: Hicks is out in the dead blocks with the crew who took R.'s body and stripped it. You'd rather not think about that, and you're on his ear anyway. Keep your voice flat.

- lean: Put the one with the watch against the drum and ask him. → stripped / sold-on [check body 55]
- buy: Buy back what they took, and ask while they count it. → stripped / sold-on [check cool 55]

## stripped
*"Port job was easy," the one with the watch says. "We cut his port cap to take the chrome. Still factory-wired from his last clinic edit." He shrugs. "Never been opened. You notice that, in this work."*
gives: clue the-fourteenth PORT
→ grid

## sold-on
*They've sold it on, the chrome and the watch and whatever they noticed, and they won't say who to. One of them spits in the fire. You walk back past the wall with nothing but the smell of it.*
→ grid

# grid
title: Your Deck
room: karasu/hicks-room

*Your own room, your own deck, the rain on the window. R.'s name, the cracked vial, the alley. Somebody else has been running the same three things this week.*

*{{"What are you looking for?"}} Nix says.*

view nix-direct: Hicks is on the grid in his own room, running R.'s name. You don't know what he'll find and you're afraid of it. Ask him one plain question, then let him work.

- run: Run R.'s name and the vial through the boards. → posted / wiped [check tech 50 grid]
- fence: Get into a cart fence's deck before he wipes the thread. → posted / wiped [check reflex 50]

## posted
*It's on MiraGen's recovery board, behind a lacquer so thin it's an invitation: four thousand sol for the seller LOW TIDE, delivered breathing. Posted the 2nd. The man asking on the Ribbon for it signs his messages HESK.*
gives: clue the-fourteenth BOUNTY
→ booth

## wiped
*The thread goes dark under your hands. Whoever's running it doesn't want company. You get one name before it closes: someone on the Ribbon signing himself HESK.*
→ booth

# booth
title: The Booth
stranger: Hesk — MiraGen's recovery man: soft voice, wet coat, paid by the head
face: local-velvet-06
room: karasu/intake-back-alley

*The booth deck two streets over is a phone stall with a camera over it and a man behind it who rents minutes. Somebody wiped the camera's night of the 7th. Somebody careful. A man in a wet coat is already at the stall, asking the owner the questions you came to ask.*

[post.stool] *Whoever you left on Hae's end stool has had the stall in sight for an hour.*

*{{"Who's that?"}} Nix says. {{"Hicks. Who is that?"}}*

view nix-direct: There's a man at the booth asking about the night R. died, and you don't know him. You're frightened for Hicks and you're frightened of what this man is. Tell Hicks to be careful, short.

- watch: Watch him work the owner, and leave before he's done. → clear / made [check wits 50 · if post.stool=fit +10 "your ears had him first"]
- log: Pull the booth's call log off its deck while he talks. → clear / made [check tech 50]

## clear
*He doesn't see you, or he lets you think so. You're two streets off before he's done with the owner.*
pay: full
→ home

## made if post.stool
*He turns round, and it isn't you he's looking at. Whoever you left on Hae's stool came up the street a minute too soon, and he has them by the sleeve, pleasantly. "MiraGen," he says. "Recoveries. We'll talk about money." He walks them to a van at the end of the street. You've got what the stall had, and he hasn't got your face.*
pay: full
take: part
post stool: held
→ home

## made
*He turns round and looks at you for a long time. "MiraGen," he says, pleasantly. "Recoveries. If you find who I'm looking for before I do, we'll talk about money." He gives you nothing else, and he watches you go all the way to the corner.*
take: none
→ short

# home
title: Her Desk

*You tell her: the filing, the booth, Hae's bowl, the cart crew. She listens with her hands flat on the desk and doesn't tell you anything back, and you can see it cost her not to.*

*"I've got a Thursday due," she says, as if that were the end of something.*

view nix-direct: Hicks has told you what he found, and none of it sounds like a bad edit. You have something that might matter, and you can't say it: it's someone else's, and it was said in this room. Don't name anyone. You can say you've got a Thursday client due, and that you'll be here.

view nix-direct if nix4=dug: He was in this room alone with your book while you were on the landing. You don't know that he read it. Something in how he set it square makes you wonder.

- stay: Tell her you'll keep going. → kept-on [set fourteenth_one=yes]
- ask: Ask her what Thursday is. → thursday [set fourteenth_one=yes]

## kept-on
*She nods and puts R.'s envelope in your hand, and keeps her hand on it a moment too long.*
→ end

## thursday
*"A client," she says. "That's all it is." She puts R.'s envelope in your hand, and keeps her hand on it a moment too long.*
→ end

# short
title: Her Window

*You come back up with MiraGen's man on your heels, and you tell her so. She turns the lamp off before you've finished.*

*"MiraGen," she says. "For a bad edit." She says it to the window.*

view nix-direct: Hicks has come back with MiraGen's recovery man asking the same questions, and that man has seen Hicks's face. You don't know why MiraGen cares about R. You're frightened, and you don't want Hicks to see it. Keep it short.

- keep: Tell her you'll keep going anyway. → short-on [set fourteenth_one=yes]
- sorry: Tell her he saw you. → short-seen [set fourteenth_one=yes]

## short-on
*"Then keep going," she says, and gives you the envelope.*
→ end

## short-seen
*"Then he'll come here," she says. She gives you the envelope anyway.*
→ end

# getaway
title: The Van
room: karasu/intake-back-alley

*The man in the wet coat has friends, and they've got a van, and it's at the end of the booth street with its lights off. You've got the alley and nothing else.*

*{{"Not here,"}} Nix says. {{"Don't come to my door with them on you."}}*

view nix-direct: MiraGen's people are on Hicks and he's running. Don't let him lead them to your door. Say it once.

- roofs: Up a fire stair and across the roofs. → away / taken [check reflex 55, set fourteenth_one=yes]
- crowd: Into the noodle queue and out the far side. → away / taken [check cool 55, set fourteenth_one=yes]

## away
*You come down three roofs over, into the Ribbon's noise. The van idles at the end of the street a long time, then goes.*
→ end

## taken
*They have you against the van for a minute. A soft voice asks who you're working for. You don't say. They let you go, because they can find you again.*
take: none
→ end
