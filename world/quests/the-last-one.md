---
title: The Last One
art: the-last-one.webp
kind: contract
tier: 3
template: true
with: [rue]
for: soren
bars: field-deck
starts: rue-hab
after: rue_two
pitch: She has a question for you, and she's only ever had the one.
posted-by: Rue
brief: Rue's hanger, after dark, with the door left open. Crew do the groundwork first, then comes one long night.
pay: 1000-1200
night: +72h
fallout: +48h
groundwork: rota ears, pass face, glass runner
piece rota: Garro's week at the listening post, when he sleeps and when the post's empty. Someone has to sit near it and count.
piece pass: A clerk's pass for the sixty-first, the kind they stop looking at. Someone has to borrow it from a person who'd rather not know.
piece glass: The schedule on your own eye. Nobody below your section sees it. Someone has to find out if anyone's watching on the night.
lead: adebayo-close-rue
posts-at: 45
rumor: Oksana says Rue hasn't been down for her dumplings.
loot: the Rue file, whatever else is in the drawer
---

# offer
title: Her Question

*Late, the hanger creaking on its chains in a wind off the bay, and the door's been left open, which it never is. The crate's bare under the clamp lamp. No deck, no notice, no tea: only the ring-marks of old cups on the plank and the heater's orange on the steel.*

*"Don't answer yet," she says. "I've already decided what you are. I've got a file, haven't I. Voltaic, the night I went in, everything you've got on me. That's what you all buy people with. So you're going to bring it to me. Not a copy, not your word. The paper and whatever's behind it."*

[note=truth] *The Graymark slip's taped to the steel beside the door, your case number facing the room. It's been left where you'd both have to look at it.*
[note=wiped] *"You took nine thousand off me like you were clearing a plate," she says. "So I know what you can reach."*

*Kroll's signature is in your coat, on a sheet of cream laid paper. Whatever you need, she said.*

*"And there was one before me," she says. "A runner. He said yes and he's in the Q. I want to know what happened to the last one. Then we'll see what you are."*

view rue: This follows from the run sheet and the arrears, and it's everything you've been working up to. You have decided to ask. You don't beg, and you don't soften it. You'd rather he said no to your face. You know this may be the stupidest thing you've ever done. Don't ask him to be on your side. Ask him for the paper.

- yes: Say you'll bring it. → promised
- kade: Say his name, once. Ari Kade. → named [set named=yes]

## promised
*The look holds a second too long, and then there's a nod. "Three nights," she says. "I'll be on your ear. I want to hear it."*
→ opened

## named
*You've not said it aloud in two years, and it comes out sounding like somebody else's. Nothing in the hanger moves but the heater's glow. "Three nights," she says, quietly. "I'll be on your ear. I want the rest of it."*
→ opened

# opened
title: The Stair

*You go down the swaying stair with the same paper in your coat that says you're doing this for the branch, cream stock and a neat slanting hand. Both things are true tonight, and they'll go on being true until one of them isn't. You need a crew that doesn't exist, and you have one. There's the post on the second ring, the pass for the sixty-first, and the eye in your head. Two of the three will do.*

- send: Start with who you trust least. → set
- wait: Stand at the foot of the stair a while first. → stood

## set
*The haulers hit the joint overhead one after another, a door slamming down a corridor that never ends. Nobody's watching you. You'd know, except you wouldn't.*
→ back

## stood
*You stand there while three haulers cross the joint, a man waiting for a tram that doesn't run here. It's the last hour in which you haven't done it yet. Then you go and find the first of them.*
→ back

# report-rota if rota=blown
title: The Rota

*Your recruit sat too long at the top of the ring, on a crate in the stairwell with nothing to do and no reason to be doing it, and Garro came out with two coffees in paper cups and gave one to him. He was very friendly. He asked who he was working for.*

- pay: Tell Garro it's a branch matter and keep your voice down. → rota-told [set garro=knows]
- leave: Say nothing and see what he writes up. → rota-left

# report-rota
title: The Rota

*He sleeps Tuesdays and Thursdays, on the cot behind the partition with the door on the chain and the camera feeds keeping watch for him. The night you need he's at his kids', and the wall of paper is all on its own with the comms rack blinking at it. Your recruit found out one more thing he didn't ask for: Garro's been keeping a copy of everything he sends upstairs, in a biscuit tin with a lighthouse on the lid.*

- leave: Leave the tin alone. → rota-left
- mark: Note where it is. → rota-marked [set tin=known]

## rota-told
*"Sure, Xander," he says, easy as anything, and he's never once called you that. He'll remember the night.*
→ back

## rota-left
*Garro's window stays lit, a frosted rectangle on the second ring. He'll be at it till morning, one way or another.*
→ back

## rota-marked
*A man keeps a tin like that for one reason only. You know where it is now, and so does nobody else.*
→ back

# report-pass if pass=blown
title: The Pass

*The clerk didn't hand it over. She went to her supervisor in tears, and by the afternoon there's a memo on every desk on the sixty-first about lost passes: two lines, unsigned. Nobody's connected it to anything. Yet.*

- cover: Send her enough sol to say she dropped it in the canal. → pass-paid [set clerk=paid]
- leave: Leave her to it. → pass-left

# report-pass
title: The Pass

*She's called Imogen and she's been at the sixty-first nine years, long enough to have a mug nobody else touches. She lent it for a sum that wouldn't cover a week's rent, and she said she didn't want to know. Her hands shook, counting it. She's got a charge of her own, it turns out, and you could find out whose.*

- leave: Don't find out. → pass-kept
- look: Look her up. → pass-looked [set clerk=yours]

## pass-paid
*It goes in a plain envelope, used notes, no letter. She doesn't write back.*
→ back

## pass-left
*Nobody on the sixty-first ever gets asked twice. It's one of the things they like about the place.*
→ back

## pass-kept
*Nobody on the sixty-first ever gets asked twice.*
gives: clue last-one IMOGEN
→ back

## pass-looked
*It's one of Kroll's. You could have guessed that. You don't know why you wanted to see it.*
gives: clue last-one IMOGEN
→ back

# report-glass if glass=blown
title: The Glass

*It didn't work. Your recruit came back with a nosebleed that wouldn't stop, a Sentinel lacquer burn up one arm with the skin gone shiny as cling film, and nothing on the schedule at all. You'll go in not knowing, the same as every day for four years.*

- on: Assume it's on. → glass-on
- tape: Plan to work with your left eye shut, as far as you can. → glass-shut [set shut=yes]

# report-glass
title: The Glass

*It's on a list three sections above you, a column of hours in a typeface nobody chose, and it's less than you feared and worse than you'd like: eight hours in every forty, by no pattern a person could hold in his head. Your recruit got the night. It's dark from one till four. For that long there's nobody in your head. It's been like that the whole time, and you've never known which hours were yours.*

- thanks: Pay him and don't talk about it. → glass-paid
- sit: Sit up that night, and see what it feels like. → glass-sat [set sat=yes]

## glass-on
*You'll do it the way you've done everything since you were twenty-five: as if somebody's watching, because somebody is.*
→ back

## glass-shut
*You practise on the landing, one hand on the cold rail and the world gone flat down one side. It's harder than it sounds.*
→ back

## glass-paid
*He takes the money and looks at your eye the whole time, the way you'd look at a dog you've been told doesn't bite.*
→ back

## glass-sat
*It's a Thursday. At one o'clock, with the heater off and the city coming in through the blind, you say something out loud, in your hab, to the wall. You won't be telling anyone what it was.*
→ back

# night
title: The Second Ring
room: spine/listening-post
post foot: Someone waits at the foot of Forty, under Oksana's shutter, and keeps the way up clear till morning. [suits muscle]
gives foot: There's someone on the deck when you come home. A miss at the end doesn't lose the file.

*The second ring of Forty, behind a steel door stencilled LIFT MAINTENANCE in letters the damp has been eating for years. Nobody's fixed the lift in thirteen years. You've got a key, branch issue with a number stamped in its bow, and there's no way you should be using it at this hour.*

[seen=yes] *There's a light on behind the frosted panel, a dirty fluorescent smear. There wasn't supposed to be.*

*{{"I've got your door,"}} she says. {{"Whatever's on it is old. Go."}}*

view rue: You're on the line from your hab with your deck open, running the doors for him. This is the third time you've been on his ear, and it's the file you asked for. You're fast and scared and you're talking too much.

- wait: Stand in the lift shaft's shadow and read the ring before you move. → through / heard [check wits 55]
- go: Get across the ring between the camera's sweeps. → through / heard [check reflex 55]
- rota: Go on the hour. You know his week. → through / heard [check wits 55 angle, needs angle.rota=yes]

## through
*The key turns, oiled and quiet. It smells of burned coffee and cold ash and old paper inside, the smell of a room where men have listened to other people for twenty years.*
→ wall

## heard
*Two rings up someone drops a tool, and it rings down the stairwell a long time before the swearing starts. You stand there with a key in your hand and no reason for it.*
→ wall

# wall
title: The Wall of Paper
room: spine/listening-post

*Garro's wall of paper: brown file boxes floor to ceiling, twenty-three years of other people's conversations, labelled in a hand that changes down the decades and filed in a system that lives mostly in his head. The Voltaic file came through here, and it'll have a card. It'll tell you where the rest of her went.*

[garro=knows] *There's a second coffee on the desk, a paper cup with your name on it in marker. He's gone out. He's left it to go cold beside the ashtray, and that's a message.*

view rue: You can hear paper. You can't see anything, and you hate it. You keep asking what he's found.

- card: Find it the way Garro would, by who he'd have gossiped to about it. → card / mess [check cool 55]
- index: Pull his index off the terminal and read it. → card / mess [check tech 55 grid]

## card
*The card's where he said he'd put it, years ago, joking, over a bottle. RUE, no other name, and a transfer line in Kroll's slanting hand, the one nobody else on the floor bothers to have. It all went up to the sixty-first a fortnight ago. Three drawers along there's another one: KADE, A. That went up too.*
→ ring

## mess
*It takes half the wall, boxes down and lids off and twenty years of order coming apart in your hands, and you can't get it back the way it was. The card says RUE, and a transfer in Kroll's hand: it went up to the sixty-first a fortnight ago. And the one three drawers along: KADE, A. That went up too.*
→ ring

# ring
title: The Ladder
room: spine/listening-post

*You've got to get out of the post, off the ring, and to Nexus with an hour on the clock. The lift doesn't work. It's never worked. The way down is the maintenance ladder inside the pylon, iron rungs in a concrete throat, in the dark, with the Spine shaking every one of them.*

- ladder: Take the ladder fast, hands wet, and don't look at the drop. → down / slipped [check reflex 55]
- brace: Take it slowly, your full weight on every rung. → down / slipped [check body 55]

## down
*You come out at the foot of the pylon behind Oksana's shutter, into the smell of last night's broth, with your palms burning and red with rust.*
→ tower

## slipped
*Six rungs go by without you. You catch the seventh in the crook of an arm, and something in your shoulder gives way with a sound you feel more than hear.*
gives: clue last-one ARM
→ tower

# tower
title: The Tower
room: nexus/sdg-floor
post bench: Someone takes the bench in the tower's lobby with a courier's bag, and listens to the desk. [suits ears]
gives bench: The lobby's watched for you. If you're seen on the way down, it isn't your jacket they write up.

*The Sentinel Tower at two in the morning, sixty-one floors of smoked glass with the core's advertising sliding across it. You've been up here a thousand times and never once at this hour. The floor's dim, half the glass walls dark, the corridor lit by exit signs and the standby glow of terminals, and the city's down there being rained on. The night desk knows your face. That's the trouble with it.*

[shut=yes] *You keep your left eye shut, and it makes you look ill, a man nursing a headache he won't discuss.*
[sat=yes] *It's dark from one till four. You've got until four.*

*{{"That's a lot of lacquer,"}} she says. {{"That's a lot more than anything I've ever been in."}}*

view rue: You're on the line and you're inside the edge of Sentinel's grid. Nobody at nineteen has any business here. It's the best thing you've ever done, and if it goes wrong it's the last. You're quieter now.

- lacquer: Walk her through the lacquer, gate by gate. You've read the plans. → floor / flagged [check tech 50 grid]
- gossip: Sit down with the night man and ask about his knee. → floor / flagged [check wits 50]
- pass: Use the clerk's pass at the side door, with your collar up. → floor / flagged [check wits 50 angle, needs angle.pass=yes]

## floor
*The inner door sighs open on its closer. Nobody looks up. Nobody's here to.*
→ drawer

## flagged
*You get through, and somewhere three floors down a line of text goes onto a screen in a dark room and sits there, patient as a stone, waiting for morning.*
gives: clue last-one DESK
→ drawer

# drawer
title: The Steel Room
room: nexus/sdg-floor

*Closed files are paper on the sixty-first, in a steel room behind Kroll's desk, because paper can't be read from outside and nobody up here has ever trusted anything that can. The desk is real wood, dark and nearly bare: a brass lamp, folders squared at the corner. The kettle's warm. There are two cups out, and the room still smells of her cigarettes.*

[clerk=yours] *The clerk's name is on a list under the blotter, third from the top, in that slanting hand. You knew it would be.*

view rue: You can hear him stop. He's not saying why. Ask him. Stay on the line.

- steady: Stand where she'd stand, and work out what she'd want you to see. → open / forced [check cool 50]
- force: Put your good shoulder to the steel-room door. → open / forced [check body 50]
- glass: You know when the eye's dark. Look straight at the lock and take your time. → open / forced [check cool 50 angle, needs angle.glass=yes]

## open
*It opens to you, the bolts drawing back without a sound. It's possible it was left to.*
→ turn

## forced
*The door comes open with a noise that goes all the way down the floor, steel on steel, the glass walls humming with it. Nobody comes. That doesn't make you feel any better.*
gives: clue last-one DOOR
take: part
→ turn

# turn
title: Two Folders
room: nexus/sdg-floor

*Two folders on a steel shelf, buff card gone soft at the corners from handling. RUE. KADE, A. Hers is thick. His is thin, a life that didn't take much paper, and it ends with one sheet you know: asset no longer viable, charge reinstated, recommend closure. The signature at the bottom is your own, very neat.*

*Under them is a third, its card foxed brown at the edges, and you've never seen it pulled before: 7-114. The Ninth Grant ledger, two hundred and twelve households, and a line in Kroll's hand: suspended, at my discretion.*

*{{"Have you got it?"}} she says. {{"What's in it? Soren. What happened to the last one?"}}*

view rue: You asked him a question and it's the only one you've ever really had. You can't see what he's looking at. You'll know from what he does next whether he's what you thought. If he reads you all of it, don't let him off. If he goes quiet, say his name once and wait.

- read: Read it to her. All of it, your name too. → read [set turn=truth]
- hers: Send her hers. Put Kade's back on the shelf. → hers [set turn=hers]
- close: Close the line. Take her file to Kroll's desk and sit down. → closed [set turn=close]

## read
*It doesn't take long to read; a man's whole use to the branch fits on four pages. You hear her not say anything, the line open on the hiss of her room. Then you take the folders, and you leave the kettle, and the second cup.*
→ out

## hers
*"It's just you," you tell her. "That's all that's in it." You put Kade back, square to the shelf's edge, the way it was. You've got a good voice for it.*
→ out

## closed
*The bead goes dark in your palm, a dead fleck of solder. You sit in the chair across from hers, the lower one, angled, the one you sat in at nineteen. Ten minutes later you hear her shoes on the corridor's hard floor.*
→ out

# out if turn=close
title: The Second Cup
room: nexus/sdg-floor

*"Xander," she says, as if it's a Tuesday. She fills the kettle and lights a cigarette with a steel lighter that shuts like a case being closed, and the smoke goes up past the lamp. She looks at the file, and at you, and at the way you're holding your shoulder. You'd have to get up to leave, and she's the only one who could make that easy.*

view rue: The line went dead in the middle of your question. You don't know why. You keep saying his name and nothing's coming back. You're not going to cry. You start shutting your deck down, in order, the way your father taught you to shut a rig.

- tell: Tell her you've closed it. You have what you need to sign the runner. → settled-told
- stay: Say nothing, and let her pour. → settled-up

# out
title: The Way Down
room: nexus/sdg-floor

*Doors, and then more doors. The service stair goes down sixty-one floors of bare concrete and caged bulbs, and there's a shift change at four. Behind you there's a hand mark on the steel-room door and a kettle going cold, and somebody's going to sit down at that desk in the morning and notice both.*

[turn=truth] *She's still on the line, the hiss of her room steady in your ear. She hasn't said one word.*
[turn=hers] *{{"Is that all?"}} she says. {{"That's all of it?"}}*

view rue: You've got what you asked for, or you've got what he says it is. He's still got to get out. You're running his doors, and your hands are steady now.

- stair: Go down the service stair with the file under your coat, past the shift. → stairs / seen-out [check wits 50 · if post.bench=fit +10 "your ears have the desk"]
- lift: Take the freight lift, and hang on the cable when it stops. → stairs / seen-out [check reflex 50]

## settled-told
*"Good," she says, and that's the whole of it; it's all the praise there's ever been. She pours the second cup, the tea dark as varnish, and pushes it across the wood to you.*
→ last

## settled-up
*She nods and pours the second cup, the tea dark as varnish. She doesn't say thank you. She's never needed to.*
→ last

## stairs
*The street, and the rain coming down between the towers in sheets lit pink and blue by the adverts. Nobody's come after you yet.*
→ last

## seen-out if post.bench
*You get out with what you came for. Someone in grey on the lobby desk looks up at four, at a man leaving with his arm held wrong, and then at the courier who's sat on his bench three hours with nothing to deliver. He's writing down a time as you reach the street. It isn't yours.*
post bench: held
→ last

## seen-out
*You get out with what you came for, but someone in grey on the lobby desk has seen a man in Kestrel's jacket leaving the tower at four with his arm held wrong, and written down the time.*
gives: clue last-one GREY
take: part
→ last

# last if turn=close
title: The Pen
room: nexus/sdg-floor

*The sky's going grey over Nexus, the adverts paling on the towers as the light comes up behind them. She hands you a pen, a heavy black thing with a gold nib. Her name's already at the bottom of the page, and there's a line for yours. The paper on the runner, ready for the morning, with the arrears as the offer. You wrote that offer. It's a good one.*

view rue: You're not on the line. You don't know any of this. You've shut your door.

- sign: Sign it, in the hand that signed Kade's. → home-close / burned [check cool 50]
- hold: Carry it down to the Spine yourself, and say it to her face. → home-close / burned [check body 50]

# last
title: The Deck Market
room: spine/deck-market

*The deck market, shut: tarps lashed down and dripping, lanterns dark on their strings, the shrine's candles burned down to their red glass. A grey car idles at the head of the row with its lights off and its wipers going. They haven't got a name yet. They've got a jacket and a shoulder, and the Spine's only got so many ways up.*

[post.foot] *Whoever you left at the foot of Forty is still there, under the lip of the shutter, out of the rain.*

*{{"Left,"}} she says. {{"Left, and I'll take the cameras. Don't stop."}}*

view rue: He's on the deck and they're close. You know every camera on this row, and you've lived under it your whole life. You're on his side for the next four minutes, whatever he is, and you'll think about that later.

- face: Stop, turn round and show them a Kestrel badge. → home / burned [check cool 50]
- shove: Put your good shoulder through the tarp and go under the stalls. → home / burned [check body 50 · if post.foot=fit +10 "your muscle's at the shutter"]

## home
*The foot of the pylon in the first grey light, the gutters running. Oksana's shutter's coming up with a long iron rattle, the urn's already going, and she doesn't look at your arm. She puts a glass of tea on the zinc, and she goes on not looking at it.*
pay: half
→ end

## home-close
*It's done by the time the haulers thin out. She pays you by the clean end of the morning, in full, through three different hands, none of them hers on paper. The money's very good.*
pay: full
→ end

## burned if post.foot and turn!=close
*It comes apart at the last: a hand, a car door. Then whoever you left at the foot of Forty is out in the road, between you and the grey car, and it takes them and not you. You go under the tarps with the file torn half out of your coat. Nobody's going to bring them tea.*
pay: half
take: part
post foot: held
→ end

## burned
*It comes apart at the last. A hand, a car door, a floor you know. The file goes one way, and you go another, and nobody's going to bring you tea.*
take: none
→ end

# fallout if grade=blown
title: Two Days

*The hanger's shut. The door's chained from outside with a padlock the size of a fist, there's a new notice taped over the old tape marks, and the stair hangs dead still because there's nobody on it. Your deck's gone dark. There's a text from a number you know.*

*Come up.*

view rue: He failed, and the file's gone back. You can't know what he's told them. You will not see him. You're moving tonight, and you're not saying where. If he reaches you, you say no, and you mean it, and there's nothing left to talk about.

- go: Go up to the sixty-first. → done-blown
- stay: Stand on the stair a while. → done-blown

# fallout
title: Two Days
accounts: last-one
room: spine/rue-hab
here: yes

*Two days. There's been a text on your phone since the morning: Come up. Her door's open at the top of the cable stair. You've got the length of the stair to get it straight: what Kroll hears, and what she does.*

view rue: Two days since that night. He's coming up your stair, and you'll know from the first thing he says whether it's the truth. Don't help him. Ask what you need to ask, and watch his hands.

## told
*You've had two days to get it straight. The stair moves under you.*
→ crate

# crate if turn=truth
title: Her Crate

*Both folders are out on the crate under the clamp lamp when you come up. They've had two days of reading. Hers is stacked and squared, its corners knocked true. His isn't. The sheet with your name on it has been put on top.*

*"That's your signature," she says. "You did it neatly." For once there's no hurry in it. "That's the worst thing I've ever read, and you read it to me."*

*Your phone's been going since the morning. The Ninth Grant has a line in someone else's hand, and you've left it on a steel shelf.*

[story.rue=caught] *"You read me all of it," she says, "and then you came up here and tried one on me anyway."*

[story.adebayo=caught] *Kroll didn't pour. She listened to the whole thing and then said your name, the long one, and nothing after it.*

view rue: Two days ago he read you all of it, with his name on it, down the line, when he could have said nothing. There's no offer any more: you have the file. You don't forgive him for Kade. You might not ever. But you believe him now, and you weren't ready for that. Nothing happens today. Let him see that this is the first true thing, and that it doesn't buy him anything.

- stay: Stay until she tells you to go. → done-truth
- go: Tell her you're going up to see Kroll. → done-truth

# crate if turn=hers and kade=told
title: Her Crate

*She's on the crate with the folder in her lap. The kettle's on. She hasn't looked at you since you said his name.*

*"Kade," she says. "You stood in their room and told me there was nothing else in it."*

[story.rue=caught] *"And the rest of it," she says. "Was that true as well, or just the part you couldn't keep?" She doesn't wait for you.*

view rue: The file's yours and there's no offer any more. In the steel room he told you it was all there was. Two days later he told you about Ari Kade, his signature and all. You don't know which of those men is coming up your stair. Make him sit with it.

- stay: Stay until she tells you to go. → done-told
- go: Tell her you'll go. → done-told

# crate if turn=hers
title: Her Crate

*The folder's on the crate, read, and out of their hands for good. The kettle's on, its lid rattling on the ring. It's the first time it's been put on for you.*

*"So that's it," she says. "I'm nobody's." There's something near a smile in it, and you've not heard that before. "And the last one?"*

*Kade's on a steel shelf, and you've got a good voice.*

[story.rue=caught] *She's still smiling, but she's put her cup down, and she's watching your hands.*

view rue: The file's yours and there's no offer any more. He told you the file was all there was. You half believe him. You're as near to happy as you've been since your father, and you don't trust it. You ask about the last one one more time, lightly, and you're listening hard.

- lie: Tell her he got unlucky, and leave it there. → done-hers
- nothing: Drink the tea. → done-hers

# crate if turn!=truth and turn!=hers and turn!=close
title: Her Crate

*The door's open. The crate's bare under the clamp lamp, the way it was the night she asked: no folder, no paper, no tea. Her deck's on the plank with its case shut, and the heater's orange is on the steel.*

*"I heard it go," she says. "All of it, and you breathing on the stair after." She doesn't get up. "Two days. And you've come up here with nothing in your hands."*

*Her file's still on a steel shelf on the sixty-first. So is Kade's. Kroll's signature is still in your coat.*

[kade=told] *"Kade," she says. "You knew that before you went in. You didn't need the drawer for it."*

[story.rue=caught] *"And whatever that was just now," she says, "you've had two days to make it better than that."*

[story.adebayo=caught] *Your phone's quiet. Kroll hasn't sent for you, and she always sends for you.*

view rue: Two days ago he went in for your file and the night came apart on your ear: the noise, the running, his breathing on a stair. He came out with nothing. Your file's still on their shelf, and so is the last one's, and the offer's still in his coat. You don't sign and you don't run. You haven't decided what he is, and you won't today. Make him say what he does now.

- again: Tell her you'll go back for it. → done-out
- nothing: Say nothing, and wait for her to tell you to go. → done-out

# crate
title: Her Crate

*The door's open, and there's nothing on the crate but a pen and your paper, the heater ticking beside them. Every line of it has been read. Nobody looks up.*

*"You closed the line," she says. "I was still talking." She signs with her handle, and then she has to write the other one, the real one, and she covers it with her hand while she does it. "That's what you wanted. Nine thousand and a charge. I'd like you to leave now, sir."*

[kade=told] *"And the last one," she says, still writing. "You signed Kade too. So I know what this paper's worth."*

[story.rue=caught] *"And don't tell me it was your idea," she says. "I've signed their paper. I know whose it is."*

[story.adebayo=caught] *Your phone goes in your pocket. You know without looking that it won't say Come up.*

view rue: You signed. He closed the line on you in the middle of your question, then came up your stair with the paper. It's the arrears or the Q, and you know exactly what you're worth now. You call him sir. You will never be anything else to him. There's nothing left to talk about but the work.

- go: Take the paper and go down the stair. → done-close
- wait: Stand there a moment longer. → done-close

## done-blown
*The freight goes over, and the empty hanger rocks a little on its chains. She's somewhere you won't find, and you know how to find anyone.*
settles: rue: Soren failed. The file went back to the branch, you moved and cut every line to him, and there will never be anything between you. If he finds you, it's no.
settles: adebayo: Xander went into your steel room for that runner and failed, and you've got him back on your own terms. You don't know what else he wanted. The second cup has gone away for good, and he knows why.
→ end

## done-truth
*The road hits the joint overhead, and the hanger answers on its chains. She doesn't look up, and she doesn't tell you to go. It's a start, and it's cost you everything you ever had.*
settles: rue if story.rue=caught: Soren read you the truth about Ari Kade with his own name on it, then lied to you two days later anyway. You hold your own file and the offer is off the table for good. You believe what he read. You don't believe him.
settles: rue: The offer is off the table for good: you hold your own file, and Soren read you the truth about Ari Kade with his own name on it. You believe him now. That doesn't forgive him, and what's between you is still yours to decide, slowly.
settles: adebayo if story.adebayo-true=yes: Xander sat at your table and told you all of it: both files, the runner, the crew. He's betrayed you and said so to your face, and that's worse. Whatever was between you is over. The Ninth Grant's charge is in your hand.
settles: adebayo if story.adebayo=held: Xander says the runner went into your steel room and he went in after her. The files are gone and his account holds; you've tried to break it. You don't believe him. You can't prove it, and that has never once happened to you before.
settles: adebayo: Xander took the runner's file and Kade's out of your steel room and left you sitting with the kettle. He's betrayed you, you know it, and he hasn't said so. Whatever was between you is over, and it isn't a thing you'd ever take back. The Ninth Grant's charge is in your hand.
→ end

## done-hers
*She pours you another, stewed dark from sitting. You've done it again, then, in the neatest hand you've got.*
settles: rue if story.rue=caught: Soren told you there was nothing else in the file, and two days later you caught him lying to you again. You hold your own file and the offer is off the table for good. You check everything he says now, twice.
settles: rue: The offer is off the table for good: you hold your own file. Soren told you there was nothing else in it, and you've almost stopped checking. What's between you is yours to decide, slowly. If you ever learn what he left on that shelf, it will count as the worst lie you've been told.
settles: adebayo if story.adebayo=held: Xander took the runner's file out of your steel room and left Kade's where it was. His account of it holds, and you can't break it. You know what he did. You can't prove it, and you're not used to that.
settles: adebayo: Xander took the runner's file out of your steel room, and left Kade's where it was so you'd know he'd seen it. He's betrayed you, you know it, and he hasn't said so. Whatever was between you is over. The Ninth Grant's charge is in your hand.
→ end

## done-told
*She pours you another, and she doesn't drink hers. It's the truth, and it's two days late, and you both know which of those she'll remember.*
settles: rue if story.rue=caught: Soren lied to you in the steel room, told you the truth about Ari Kade two days later, and lied to you again the same afternoon. You hold your own file and the offer is off the table for good. You believe what he said about Kade. You don't believe him.
settles: rue: Soren lied to you in the steel room, then two days later told you the truth: Ari Kade is in the Q and his signature's on it. You hold your own file and the offer is off the table for good. You don't forgive the lie. You believe the truth.
settles: adebayo if story.adebayo=held: Xander took the runner's file out of your steel room and left Kade's where it was. His account of it holds, and you can't break it. You know what he did. You can't prove it, and you're not used to that.
settles: adebayo: Xander took the runner's file out of your steel room, and left Kade's where it was so you'd know he'd seen it. He's betrayed you, you know it, and he hasn't said so. Whatever was between you is over. The Ninth Grant's charge is in your hand.
→ end

## done-out
*She lets you go without a word. On the stair you hear her deck come up behind you, the fan first, then the keys. Whatever she's doing, it isn't waiting for you.*
settles: rue if story.rue=caught: Soren went in for your file and came out with nothing, then lied to you about the night. Your file and Kade's are still on their shelf, and the offer's still in his coat. You haven't signed and you haven't run. You've stopped waiting for him to be what you thought.
settles: rue: Soren went in for your file and came out with nothing. Your file and Kade's are still on their shelf, and the offer's still in his coat. You haven't signed and you haven't run. You never got your answer about the last one, and you haven't decided what he is.
settles: adebayo if story.adebayo=caught: Xander's night for the runner went loud, he came back without her, and the story he told you about it didn't hold. Nothing left your steel room. You don't know what he wanted from it, and you've opened a file on him. He'll know.
settles: adebayo if story.adebayo=thin: Xander's night for the runner went loud, and he came back without her. Nothing left your steel room, and his account has a gap in it you could put a hand through. You haven't asked. You noticed, and he knows you did.
settles: adebayo: Xander's night for the runner went loud, and he came back without her. Nothing left your steel room, and his account holds. The runner hasn't signed. You're still waiting on her, and on him.
→ end

## done-close
*Down the stair with the paper, the chains complaining under you. Her name's on it now. Both of them. You don't read the second one. There's a text when you reach the bottom. Come up.*
settles: rue if story.rue=caught: You signed. Soren is your handler and you call him sir. He closed the line on you, then lied to your face about why, and you caught it. There will never be anything between you. It's work, and you'll watch him.
settles: rue if kade=told: You signed. Soren is your handler and you call him sir. He told you himself that he signed Ari Kade into the Q, and you signed anyway. There will never be anything between you. It's work, and you know what it costs.
settles: rue: You signed. You're the branch's asset now, Soren is your handler, and you call him sir. There will never be anything between you, and you don't want there to be. It's work.
settles: adebayo if story.adebayo=caught: Xander brought you the runner, signed, then couldn't tell you a straight story about how. You've caught him lying to you for the first time in ten years. What's between you stays where it was, but you've opened a file on him, and he'll know.
settles: adebayo if story.adebayo=thin: Xander brought you the runner, signed. His account of the night has a gap in it you could put a hand through. You haven't asked. What's between you stays where it was, but you noticed, and he knows you did.
settles: adebayo: Xander brought you the runner, signed, when you half thought he wouldn't. His loyalty has been tested and it held, and that's the one thing you never wanted to find out. What's between you stays where it was, but it stays. If it ever moves, you still decide when.
→ end
