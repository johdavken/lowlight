---
title: Signed
kind: mission
tier: 1
take-size: 4
template: true
with: [hicks]
for: ember
once: true
starts: the-tilt
after: null
trust: 1 / 2
pitch: A hotel in Velvet, a night's lock log, and a porter who's about to carry the blame for it. Silas found it. You want to see it yourself.
posted-by: A card on Second Socket's board. A night porter in Velvet, paying what he has.
brief: "A Velvet hotel's lock log from the night a room safe was opened, before the house hands its porter to SDG. Hicks is on Ember's ear, and he doesn't know why she wanted him there."
pay: 90-110
loot: a hotel lock server's log card
---

# ask

*Silas found it on the Second Socket board and brought it home without a word, and put it on your milk crates where you'd see it. A hotel under the Cat, a room safe opened at ten past three, and a porter the house means to hand over. The card doesn't say what Silas saw in the hotel's log. He told you that part to your face, and then he went to bed without looking at you.*

*Hicks is at the end of the Tilt's bar, where he always is at this hour, with something brown he isn't drinking.*

*"Sit on my ear tonight," you tell him. "Hotel's books in Velvet. Nothing job."*

*He looks at you for a long moment. You have never once asked him to sit on your ear.*

view hicks: Ember has never asked you to be her operator. Not once in three years. She says it's a nothing job and she's smiling too much. You don't run with anyone in your own ear and you don't love being in anyone else's, but you won't say no to her. Ask one question. Don't push past the answer.

- favour: Tell him it's a favour for Silas. → yes
- company: Tell him you just fancied the company. → yes

## yes
*He smiles before he answers, the way he does when he's already worked something out. "Fine," he says, and holds out his hand for a bead.*
→ street

# street
room: velvet/under-the-cat

*Velvet at the foot of the cliffs, quieter and cleaner than anywhere you live. The Cat watches the street from the cliff face in pink and violet tube. The hotel is narrow and old, with a violet strip over a glass door and a lit lobby behind it. There's a clerk at the desk, and an office behind her with a key on a nail.*

*{{"Lobby's got one camera and it's pointed at the till,"}} Hicks says in your ear. {{"Somebody here knows what matters to them."}}*

view hicks: You're on her ear and you can see the street through the camera on her collar. She's chatting to herself the way she does, and it's thinner than usual. Give her what's useful about the hotel. Notice that she hasn't told you what she's looking for.

- desk: Read the lobby. When the clerk turns for the kettle, walk into the office. → inside / marked [check wits 50]
- escape: Round the back and up the fire escape to the office window. → inside / marked [check body 50]

## inside
*Nobody looks up. The office is a desk, a ledger, a calendar from a laundry, and a lock server under the desk with its lid off.*
→ office

## marked
*The clerk turns back too soon and sees the pink in your hair go past the office door. She doesn't shout. She picks up the house phone instead, which is worse.*
→ office

# office
room: velvet/under-the-cat

*The lock server runs the whole hotel's doors, and it keeps a log because somebody's insurer made it. Last Thursday, ten past three, room nine: safe opened, door logged. The log's behind the plainest lacquer you've seen in a month.*

*{{"You're humming,"}} Hicks says. {{"You only hum when you're scared."}}*

view hicks: She's in the lock server. You've heard her work a hundred times and she's never hummed like this. If she goes quiet when she gets to the log, ask what she's seeing. Ask once. If she says nothing, let it sit, and stay on the line.

- jack: Jack the lock server and pull the night's log. → read / rough [check tech 50 grid]
- card: Pop the log card out of the server while the clerk's on the stairs. → read / rough [check reflex 50]

## read
*Ten past three. Room nine. And there in the log, small and neat, your sparkle. Not the one you leave now. The one you used to leave, three years ago, before you changed the tail. Somebody kept it.*
→ porter

## rough
*You have to start the server over and it comes up slow. But it's there. Ten past three, room nine, and small and neat in the log, your sparkle. Not the one you leave now. The one you used to leave, three years ago, before you changed the tail. Somebody kept it.*
→ porter

# porter
room: velvet/under-the-cat

*Out in the lobby there's a man in a good coat from one of the houses, with the porter beside him and a hand on the porter's shoulder. The porter's grey to the lips. Somebody's called it in already.*

*{{"Ember,"}} Hicks says. {{"What did you see. Ember."}}*

view hicks: She stopped talking when she reached the log and she hasn't started again. There's a house's man in the lobby, and the porter is about to be handed over. Get her moving first. Then ask what she saw, plainly, once. You're worried, and for once you'll let it show.

- watch: Wait for the house's man to look at the porter, then walk out past him. → clean / caught [check wits 50, set ember_one=yes]
- alley: Out through the office window to the alley with the card, whatever's below. → clean / caught [check body 50, set ember_one=yes]

## clean
*You're on the street with the log card in your boot. Without the log there's nothing to hang on the porter but a house's say-so, and in Velvet a house wants paper. He'll keep his job, or keep his name, which matters more. He finds you at the tea counter later and pays you what he has.*
pay: full
→ home

## caught
*The house's man has your wrist before you've got the card out. He looks at the log on the screen, and then he looks at your hair, and he smiles at you. The porter goes home. The house has a name now, and it's yours.*
take: none
→ signed

# home

*Back at the Tilt he's kept your stool, and pushed his glass away, which he never does. He's waiting for you to say it.*

*"Silas found it," he says. "Didn't he. And you went to look."*

view hicks: She's back. She saw something in that log that took her voice away, and you've worked out she wanted you on the line because of it, without telling you why. You don't push. You say you're here. Whatever she tells you now, you'll take it like crew.

- tell: Tell him. The copy, the first one last month, all of it. → told [set told_hicks=yes]
- laugh: Laugh it off. Some fan of yours with a long memory. → laughed [set told_hicks=no]

## told
*He listens to all of it without smiling once. Then he says, "Right," the way he says it before a job, and that's all you needed. The porter from the hotel is on the landing when you leave, and gives his name: {hire}. Velvet's done with him, and he has a face that can talk a house down.*
gives: recruit face green man
hire-pitch: Velvet's done with me. I can talk a house out of anything it hasn't written down.
→ end

## laughed
*He laughs with you, a beat late. He doesn't believe you, and he lets you have it. The porter from the hotel is on the landing when you leave, and gives his name: {hire}. Velvet's done with him, and he has a face that can talk a house down.*
gives: recruit face green man
hire-pitch: Velvet's done with me. I can talk a house out of anything it hasn't written down.
→ end

# signed

*Back at the Tilt you take the stool next to his. A house in Velvet has your sparkle on a theft you never did, and now it has your face to go with it.*

*"I heard all of that," Hicks says. "Except the part you didn't say."*

view hicks: It went wrong. A Velvet house has her face now, beside something in a log she won't name. She's on the stool next to yours and not joking. You're angry, and not at her. Ask what was in the log, once. Then let her decide.

- tell: Tell him. The copy, the first one last month, all of it. → told-low [set spark=seen, set told_hicks=yes]
- laugh: Laugh it off. Some fan with a long memory. → laughed-low [set spark=seen, set told_hicks=no]

## told-low
*He listens to all of it. When you're done he puts his coat on and sits back down, because there's nowhere to go tonight and he'd like you to know he would.*
→ end

## laughed-low
*He doesn't laugh. He lets you sit there until the jukebox is the only thing talking.*
→ end

# getaway
room: velvet/under-the-cat

*The house phone's going off in the lobby, and in Velvet that's worse than a Sentinel's whistle. There's a man in a good coat at the front door, and the alley's dark.*

*{{"Alley,"}} Hicks says. {{"Don't run till you're round the corner."}}*

view hicks: She's getting out and you can see the street. Short instructions, no questions. You can ask her later.

- crowd: Read the street, and leave with the bathhouse crowd. → clear / stuck [check wits 50, set ember_one=yes, set spark=left]
- roofs: Up the fire escape and over the bathhouse roof. → clear / stuck [check reflex 50, set ember_one=yes, set spark=left]

## clear
*Round the corner, down the steps, and under the Cat's light, and nobody's behind you. The log stayed in the server. So did your sparkle.*
→ end

## stuck
*The house's man is a step too slow, and gets your hair going round the corner and not your face. The porter goes to SDG in the morning with the log against him, and your sparkle in it.*
take: none
→ end
