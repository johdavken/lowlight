---
title: Torn Page
art: torn-page.webp
kind: mission
tier: 2
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: wren_one
trust: 1 / 2
guest: wren HAND
people: [Wren, Dace]
pitch: Dace has a boat in three nights. Ashdown has given him to another Caper. Wren has tonight.
posted-by: Wren, at the twins' door.
brief: "Dace is waiting on a boat off Tidal Isle. Ashdown has given him to another Caper, so tonight is Wren's last night to reach him first. She offers to run Hicks's ear, the way she used to."
pay: 360-440
loot: the cash Dace was carrying for the boat
---

# ask
title: The Knock
song: The Yes Book

*Wren knocks on the twins' door at eleven. She never knocked on yours; she had a key. Ember opens it, and for a second neither of them says anything at all.*

*"Hi, Em," Wren says.*

*"Hi," Ember says, and stands aside, and then stands in the kitchen doorway with her arms folded, where she can see everything.*

*Wren doesn't sit. Ashdown pulled her off Dace this morning and gave him to someone else. Dace is on Tidal Isle, waiting on the morning boat after his sale. Tonight's the last night she gets to him first. "I'll run your ear," she says to you. "Like before." She doesn't look at Ember when she says it. Ember doesn't look at her.*

[wren_one=told] *"You told me he was selling," she says. "You could have kept that. I'd have."*
[wren_one=kept] *"Warm," she says. "That's what you gave me. He was selling, and you knew it when you rang."*

view ember: Wren is in your kitchen, the first time you've been in a room together since she left him. She just offered to run his ear tonight, and that's your seat now. You liked her. You won't give her the satisfaction. Say one light thing to Hicks, and let him choose.

- ask: Ask her what Dace is selling. → asked
- leave: Don't ask. You'll hear it from him. → left

## asked
*"Our paper," she says. "Marks. Addresses. The kind of thing a Strip-Miner pays for." It's true the way a map is true. In the doorway, Ember says nothing very loudly.*
→ arrivals

## left
*She nods, as if that's the answer she'd have given. "Ferry stairs," she says. "He likes to sleep near a way out."*
→ arrivals

# arrivals
title: The Landing
room: tidal/ferry-stairs
song: The Yes Book

*The ferry landing at the foot of Tidal Isle, two in the morning. The night boat's put forty people ashore, and the customs hall is taking its time with them. Somewhere in the queue, or watching it, is a clerk who stole from the Capers.*

[guest.wren=yes] *{{"Arrivals hall, booth nine, the gate,"}} Wren says in your ear, the old voice, unhurried, from a roof across the quay. {{"He'll watch the queue from somewhere warm. He always hated the cold."}} Ember's on the line too. She hasn't said anything yet.*
[guest.wren!=yes] *{{"Forty off the boat,"}} Ember says. {{"He won't be in the queue. He'll be watching it."}}*

view ember: Hicks is on the ferry landing looking for Dace among the night arrivals.

view ember if guest.wren=yes: Wren is running his ear and you're on the line, listening to her do it. She's good. You'd forgotten how good. Say one useful thing, so he remembers you're there.

view ember if guest.wren!=yes: He left Wren at your kitchen table and took you. You noticed. Be very good at this.

- walk: Walk the night arrivals and find the face. → found / found-late [check wits 55]
- clerk: Buy the ticket clerk's memory. → found / found-late [check cool 55]
- cams: Let her pull the customs hall's cameras, the Caper way. → found / found-late [check tech 55 grid angle, needs guest.wren=yes]

## found
*He isn't in the queue. He's in the back room of the ticket hut, behind the clerk, with a cup of something hot, watching the queue through the hut's back window. A thin man in a good coat gone wrong.*
→ hut

## found-late
*It takes too long, and the clerk will remember you. But he's there, in the ticket hut's back room, watching the queue through the back window. A thin man in a good coat gone wrong.*
→ hut

# hut
title: The Ticket Hut
room: tidal/ferry-stairs
song: The Yes Book

*The hut's back room: a kettle, a cot, the departures board's wiring. Dace sees you in the doorway and his hand goes into his coat and stays there.*

*"Finder," he says. "Whose?"*

[guest.wren=yes] *{{"Tell him mine,"}} Wren says. {{"Watch his face when you do."}}*

view ember: Dace has his hand in his coat and Hicks is in the doorway. You want Hicks's hands where Dace can see them. Say so.

view ember if guest.wren=yes: Wren's voice in his ear is calm, and you remember how much that used to help him. Say nothing unless it matters.

- sit: Sit down across from him, hands open on the table. → talks / pinned [check cool 55]
- pin: Pin his arm before he gets the knife out. → talks / pinned [check body 55]
- fear: Let her tell you what a turned man fears, and say it to him. → talks / pinned [check wits 55 angle, needs guest.wren=yes]

## talks
*His hand comes out of the coat empty. He's waited a week for somebody to talk to. He tells you what he took: the Capers' book, the paper one, of everyone they ever turned. Who flipped, and when, and what each one gave up to get their deal. He's selling it to the Strip-Miners, and then he's on the morning boat. He puts it on the table between you.*
→ page

## pinned
*It's ugly and quick, and the knife goes under the cot. When he can breathe he tells you what he took: the Capers' book, the paper one, of everyone they ever turned. Who flipped, when, what each one gave up. He's selling it to the Strip-Miners, then the morning boat. He puts it on the table because you tell him to.*
→ page

# page
title: The Book
room: tidal/ferry-stairs
song: The Yes Book

*A ledger, cloth-bound, its edges soft with handling. One page near the front is gone, torn out close to the spine. Dace touches the stub. "Mine," he says. "I'm not stupid."*

*He turns further in without being asked, as if he's been waiting a week for someone to show. Not her handwriting. A clerk's. Wren. A date in the spring. And under it: Gave: the Kell crew. Three names.*

*Dace taps the second name. "His sister's buying tonight," he says, and watches your face.*

[guest.wren=yes] *In your ear, Wren isn't saying anything at all.*

view ember: Hicks is reading Wren's page in the Capers' book: she gave up a crew, three runners, to get her deal. You heard Dace say it. You liked her. Don't be clever. If you say anything, say his name.

view ember if guest.wren=yes: Wren is on the line and she knows exactly what he's looking at. You can hear her breathing.

- read: Read it aloud, on the line. → heard [needs guest.wren=yes, set page=read]
- fold: Shut the book and say nothing. → shut [needs guest.wren=yes, set page=folded]
- read-out: Read it aloud, on the line. → read-out [needs guest.wren!=yes, set page=read]
- fold-up: Shut the book and say nothing. → folded [needs guest.wren!=yes, set page=folded]

## heard
*You read it in your own voice, every word, to the woman who used to be in your ear every night. When you're done she says, {{"Yes."}} Only that. Ember says nothing.*
→ wall

## shut
*You close the book and put your hand flat on it. Dace watches you do it and nods, as if he's seen that before. In your ear, Wren lets out a breath you weren't meant to hear.*
→ wall

## read-out
*You read it out on the line. Ember is quiet for so long you think the bead's dead. Then: {{"Three people, Hicks."}}*
→ wall

## folded
*You close the book and put your hand flat on it. Dace watches you do it and nods, as if he's seen that before.*
→ wall

# wall
title: The Sea Wall
room: tidal/ferry-stairs
song: The Yes Book

*A lamp at the top of the sea-wall steps, coming down. Not a customs lamp. Ashdown's other Caper, and he's brought two.*

[ashdown=seen] *They don't need a description. They had your face off the old intake.*

*{{"Steps,"}} Ember says. {{"Three of them. The gate's the only way up and they're on it."}}*

[guest.wren=yes] *{{"That's one of Ashdown's,"}} Wren says. {{"I still have his recall code. I'm not supposed to."}}*

view ember: Capers on the sea-wall steps, three of them, between Hicks and the only way up. You're counting them for him. Short.

- blind: Blind booth nine's cameras and go up the steps in the dark. → over / seen-wall [check tech 55 grid]
- wall: Over the sea wall at the far end, before the gate opens. → over / seen-wall [check reflex 55]
- recall: Let her put a recall in Ashdown's code on their hand channel. → over / seen-wall [check tech 55 grid angle, needs guest.wren=yes]

## over
*You're over the wall with Dace and the book while the lamps are still on the steps. Behind you, someone is shouting into a hand channel that nobody answers.*
→ bay

## seen-wall
*A lamp catches the two of you on top of the wall, Dace's coat flapping, and holds. Then you're down the other side, but somebody has a description now.*
→ bay

# bay
title: The Bay
room: strand/old-pier
song: The Yes Book
post pier: Someone goes ahead from the pier and walks your stair before you. [suits muscle]
gives pier: The way home's been walked first. A miss on the stair doesn't lose Dace.

*A skiff borrowed off the Tidal landing, and the black bay between you and the Strand's old pier. The Breakwater's windows are lit above the pier's end. Dace has the book inside his coat and both arms round it.*

*{{"There's a lamp sweeping the water,"}} Ember says. {{"Slow. Left to right. It'll come back."}}*

view ember: Hicks is crossing the bay in a skiff with Dace and the book, and a Caper's lamp is sweeping the water. Tell him when the light's away.

view ember if guest.wren=yes: Wren's calling the sweep before you can. She's faster than you at this, and you hate it, and you're glad.

- row: Row hard between sweeps, straight for the pier. → across / swept [check body 50]
- drift: Drift in under the Breakwater's windows, where nobody looks down. → across / swept [check wits 50]
- gaps: Let her read the sweep and call the gaps. → across / swept [check reflex 50 angle, needs guest.wren=yes]

## across
*You bring the skiff in under the old pier with the lamp on the far side of its sweep. The fisherman's stool is empty. Dace is sick over the side, quietly.*
→ stair

## swept
*The lamp finds the skiff halfway across and stays on it. Then it moves on, as if whoever's holding it has seen enough. You tie up under the pier with your hands shaking.*
→ stair

# stair
title: The Walk-Up
room: karasu/walk-up-landing
song: The Yes Book

*The Ribbon, Level 2, the walk-up to the twins' door. Four flights. On the second landing a lamp, and a man leaning on the rail under it who doesn't live in the building.*

*{{"One on the landing,"}} Ember says. {{"He came up ahead of you. He knew where you'd bring him."}}*

[post.pier] *Whoever you sent ahead is a flight above him, on the third landing, with the bulb out.*

[guest.wren=yes] *Wren's at the foot of the stair, there before you, her coat wet. "I'll go up first," she says. Out loud, not on the line.*

view ember: A Caper is on the stair outside your own door, and Hicks is bringing Dace home to your couch. You're frightened, and angry that it's your stair. Tell him whether the man's alone.

- up: Up the stairs past the lamp, fast, with Dace in front. → home-free / caught [check reflex 50]
- shoulder: Put your shoulder into him on the turn of the stair. → home-free / caught [check body 50 · if post.pier=fit +10 "your muscle's a flight above him"]
- first: Let her walk up and meet the lamp herself, and buy you a minute. → home-free / caught [check cool 50 angle, needs guest.wren=yes]

## home-free
*The landing's empty when you reach it, the lamp gone up or down, and you don't stop to see which. The twins' door opens before you knock.*
pay: full
→ home

## caught if post.pier
*The lamp's in Dace's face, then yours. Then whoever you sent ahead comes down off the third landing onto the man's back, and the short ugly minute is theirs. You get Dace through the twins' door with the book inside his coat. The cash he had for the boat is all down the stairs, and so is the one who bought you the door.*
pay: full
take: part
post pier: hurt
→ home

## caught
*The lamp's in Dace's face, then yours. A short, ugly minute on a landing you've climbed a thousand times. Dace pulls loose and goes down the stairs three at a time with the book under his coat, and the man with the lamp goes after him, not you.*
take: none
→ blown

# home
title: The Bench
song: The Yes Book

*The twins' place at four. Dace is asleep on the couch where you used to sleep, with his boots still on. The book's on the bench. Silas is looking at it without touching it, which for Silas is a kind of prayer.*

[guest.wren=yes] *Wren is at the kitchen table with her coat on and a cup of Silas's tea she hasn't drunk.*
[guest.wren=yes and page=read] *She heard you read it. She hasn't said a word about it since the hut.*
[guest.wren!=yes] *Wren rings at half past. "Did you find him."*

view ember: Dace is on your couch, the Capers' book is on your bench, and Wren gave up three people to get her deal. You liked her. You can say this to Hicks, once, quietly: "She gave up three people. And then she came here." Then nothing else.

view ember if guest.wren=yes: She ran his ear tonight, in your seat, and she was good. You're not going to be graceful about it yet.

- say: Say it to her: the Kell crew. → said [needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=held]
- leave: Leave it on the bench between you. → unsaid [needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=held]
- say-line: Say it down the line: the Kell crew. → said-line [needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=held]
- leave-line: Tell her he's on the couch. Nothing else. → unsaid-line [needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=held]

## said
*She doesn't look away. "Yes," she says. "Three." She doesn't explain. She looks at you as if she's waiting to see whether you'll ask her why. You don't, not tonight. Ember takes the cold tea away from her without a word, and pours her a hot one.*
→ end

## unsaid
*She looks at the book on the bench, then at you, and you both leave it there. At the door she says, "Thank you for letting me run it." Ember shuts the door behind her a little harder than it needs.*
→ end

## said-line
*A long quiet on the line. "Yes," she says. "Three." She doesn't explain. "Keep him on the couch. I'll call." The line goes dead.*
→ end

## unsaid-line
*"Good," she says. "Keep him there." You hang up with the book in your other hand. Ember's watching you from the bench. "You didn't tell her you read it," she says. It isn't a question.*
→ end

# blown
title: The Top Step
song: The Yes Book

*The twins' place at five. No Dace, no book. A Caper's lamp on a landing you've climbed since you were twenty, and a man going down your stairs three at a time with the only thing anybody wants.*

[guest.wren=yes] *Wren comes back up the stairs a while after, alone, and sits on the top step outside the twins' door in her wet coat.*
[guest.wren!=yes] *Wren rings. "He's loose," she says, before you can. "Ashdown's man lost him on the Ribbon. With it."*

view ember: It went wrong. Dace got away with the book, and a Caper had him on your own stair. You're shaking and you won't show it. Stay with Hicks. Don't talk to Wren.

- sit: Sit on the step beside her. → sat [needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=loose]
- door: Shut the door on the stair. → shut-out [needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=loose]
- loose: Tell her you'll find the sale. → find-it [needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=loose]
- off: Put the handset down. → put-down [needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=loose]

## sat
*You sit on the step beside her. Neither of you says anything. After a while she leans, very slightly, into your shoulder, and then stops herself.*
→ end

## shut-out
*You shut the door. Through it you hear her sit there a long time before she goes.*
→ end

## find-it
*"He'll still sell," she says. "He has to. Find where." She hangs up.*
→ end

## put-down
*You put the handset down on the bench. Ember sits next to you and doesn't say anything at all.*
→ end

# getaway
title: The Quay
room: tidal/ferry-stairs
song: The Yes Book

*Lamps behind you, closing, and Ashdown's other Caper on a hand channel calling your coat in.*

*{{"Left or the dark,"}} Ember says. {{"Pick."}}*

view ember: He's running with Capers behind him. Tell him what you can see on the collar camera, short.

- run: Run, and lose yourself in whoever's around. → out / taken [check reflex 55, needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=loose]
- ground: Go to ground in the nearest dark and wait them out. → out / taken [check cool 55, needs guest.wren=yes, set wren_ear=yes, set wren_two=yes, set dace=loose]
- run-alone: Run, and lose yourself in whoever's around. → out / taken [check reflex 55, needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=loose]
- ground-alone: Go to ground in the nearest dark and wait them out. → out / taken [check cool 55, needs guest.wren!=yes, set wren_ear=no, set wren_two=yes, set dace=loose]

## out
*You get clear, with nothing. Wherever Dace is tonight, he has the book and you don't.*
→ end

## taken
*A lamp gets a long look at you before you're clear. Wherever Dace is, he has the book, and you walk home with your face in someone's report.*
take: none
→ end
