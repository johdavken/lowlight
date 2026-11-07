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

*The cable stair moves under you. It's late and she's left the door open, which she never does, and there's nothing on the crate. No deck, no notice, no tea.*

*"Don't answer yet," she says. "I've already decided what you are. I've got a file, haven't I. Voltaic, the night I went in, everything you've got on me. That's what you all buy people with. So you're going to bring it to me. Not a copy, not your word. The paper and whatever's behind it."*

*You've got Adebayo's signature in your coat. Whatever you need, she said.*

*"And there was one before me," she says. "A runner. He said yes and he's in the Q. I want to know what happened to the last one. Then we'll see what you are."*

view rue: This follows from the run sheet and the arrears, and it's everything you've been working up to. You have decided to ask. You don't beg, and you don't soften it. You'd rather he said no to your face. You know this may be the stupidest thing you've ever done. Don't ask him to be on your side. Ask him for the paper.

- yes: Say you'll bring it. → promised
- kade: Say his name, once. Ari Kade. → named [set named=yes]

## promised
*She holds your eye a second too long and nods. "Three nights," she says. "I'll be on your ear. I want to hear it."*
→ opened

## named
*You've not said it aloud in two years. She doesn't move. "Three nights," she says, quietly. "I'll be on your ear. I want the rest of it."*
→ opened

# opened

*You go down the stair with the same paper in your coat that says you're doing this for the branch. Both things are true tonight. You need a crew that doesn't exist, and you have one. There's the post on the second ring, the pass for the sixty-first, and the eye in your head. Two of the three will do.*

- send: Start with who you trust least. → set
- wait: Stand at the foot of the stair a while first. → set

## set
*The haulers hit the joint overhead like a door slamming. Nobody's watching you. You'd know, except you wouldn't.*
→ back

# report-rota if rota=blown

*Your recruit sat too long at the top of the ring, and Garro came out with two coffees and gave one to him. He was very friendly. He asked who he was working for.*

- pay: Tell Garro it's a branch matter and keep your voice down. → rota-told [set garro=knows]
- leave: Say nothing and see what he writes up. → rota-left

# report-rota

*He sleeps Tuesdays and Thursdays, on the cot, with the door on the chain. The night you need he's at his kids', and the wall of paper is all on its own. Your recruit found out one more thing he didn't ask for: Garro's been keeping a copy of everything he sends upstairs, in a biscuit tin.*

- leave: Leave the tin alone. → rota-left
- mark: Note where it is. → rota-marked [set tin=known]

## rota-told
*"Sure, Xander," he says, and he's never called you that. He'll remember the night.*
→ back

## rota-left
*Garro's window stays lit. He'll be at it till morning, one way or another.*
→ back

## rota-marked
*A man keeps a tin like that for one reason. You know where it is now, and so does nobody else.*
→ back

# report-pass if pass=blown

*The clerk didn't hand it over. She went to her supervisor, crying, and by the afternoon there's a note on the desk at the sixty-first about lost passes. Nobody's connected it to anything. Yet.*

- cover: Send her enough sol to say she dropped it in the canal. → pass-paid [set clerk=paid]
- leave: Leave her to it. → pass-left

# report-pass

*She's called Imogen and she's been at the sixty-first nine years. She lent it for a sum that wouldn't cover a week's rent, and she said she didn't want to know. Her hands shook. She's got a charge of her own, it turns out, and you could find out whose.*

- leave: Don't find out. → pass-left
- look: Look her up. → pass-looked [set clerk=yours]

## pass-paid
*It goes in an envelope. She doesn't write back.*
→ back

## pass-left
*Nobody on the sixty-first ever gets asked twice.*
→ back

## pass-looked
*It's one of Adebayo's. You could have guessed that. You don't know why you wanted to see it.*
→ back

# report-glass if glass=blown

*It didn't work. Your recruit came back with a nosebleed and a Sentinel lacquer burn up one arm, and nothing on the schedule at all. You'll go in not knowing, the same as every day for four years.*

- on: Assume it's on. → glass-on
- tape: Plan to work with your left eye shut, as far as you can. → glass-shut [set shut=yes]

# report-glass

*It's on a list three sections above you, and it's less than you feared and worse than you'd like: eight hours in every forty, by no pattern. Your recruit got the night. It's dark from one till four. For that long there's nobody in your head. It's been like that the whole time, and you've never known which hours were yours.*

- thanks: Pay him and don't talk about it. → glass-paid
- sit: Sit up that night, and see what it feels like. → glass-sat [set sat=yes]

## glass-on
*You'll do it the way you've done everything since you were twenty-five.*
→ back

## glass-shut
*You practise on the stairs. It's harder than it sounds.*
→ back

## glass-paid
*He takes the money and looks at your eye the whole time.*
→ back

## glass-sat
*It's a Thursday. At one o'clock you say something out loud, in your hab, to the wall. You won't be telling anyone what it was.*
→ back

# night
room: spine/listening-post

*The second ring of Forty, behind a door that says lift maintenance. Nobody's fixed the lift in thirteen years. You've got a key, and there's no way you should be using it at this hour.*

[seen=yes] *There's a light on behind the frosted glass. There wasn't supposed to be.*

*{{"I've got your door,"}} she says. {{"Whatever's on it is old. Go."}}*

view rue: You're on the line from your hab with your deck open, running the doors for him. This is the third time you've been on his ear, and it's the file you asked for. You're fast and scared and you're talking too much.

- wait: Stand in the lift shaft's shadow and read the ring before you move. → through / heard [check wits 55]
- go: Get across the ring between the camera's sweeps. → through / heard [check reflex 55]
- rota: Go on the hour. You know his week. → through / heard [check wits 55 angle, needs angle.rota=yes]

## through
*The key turns. It smells of burned coffee and old paper.*
→ wall

## heard
*Two rings up someone drops a tool and swears. You stand there with a key in your hand and no reason for it.*
→ wall

# wall
room: spine/listening-post

*Garro's wall of paper. Twenty-three years of it, floor to ceiling, in a system that's mostly in his head. The Voltaic file came through here, and it'll have a card. It'll tell you where the rest of her went.*

[garro=knows] *There's a second coffee on the desk with your name on the cup. He's gone out. He's left it to go cold, and that's a message.*

view rue: You can hear paper. You can't see anything, and you hate it. You keep asking what he's found.

- card: Find it the way Garro would, by who he'd have gossiped to about it. → card / mess [check cool 55]
- index: Pull his index off the terminal and read it. → card / mess [check tech 55 grid]

## card
*The card's where he said he'd put it, years ago, joking. RUE, no other name, and a transfer line in Adebayo's hand. It all went up to the sixty-first a fortnight ago. Three drawers along there's another one: KADE, A. That went up too.*
→ ring

## mess
*It takes half the wall, and you can't get it back the way it was. The card says RUE, and a transfer in Adebayo's hand: it went up to the sixty-first a fortnight ago. And the one three drawers along: KADE, A. That went up too.*
→ ring

# ring
room: spine/listening-post

*You've got to get out of the post, off the ring, and to Nexus with an hour on the clock. The lift doesn't work. It's never worked. The way down is the maintenance ladder inside the pylon, in the dark, with the Spine shaking every rung.*

- ladder: Take the ladder fast, hands wet, and don't look at the drop. → down / slipped [check reflex 55]
- brace: Take it slowly, your full weight on every rung. → down / slipped [check body 55]

## down
*You come out at the foot of the pylon behind Oksana's shutter, with your hands burning.*
→ tower

## slipped
*Six rungs go by without you. You catch the seventh with an arm, and something in your shoulder gives way.*
→ tower

# tower
room: nexus/sdg-floor

*The Sentinel Tower at two in the morning. You've been up here a thousand times and never once at this hour. The floor's dim, half the glass walls are dark, and the city's down there being rained on. The night desk knows your face. That's the trouble with it.*

[shut=yes] *You keep your left eye shut, and it makes you look ill.*
[sat=yes] *It's dark from one till four. You've got until four.*

*{{"That's a lot of lacquer,"}} she says. {{"That's a lot more than anything I've ever been in."}}*

view rue: You're on the line and you're inside the edge of Sentinel's grid. Nobody at nineteen has any business here. It's the best thing you've ever done, and if it goes wrong it's the last. You're quieter now.

- lacquer: Walk her through the lacquer, gate by gate. You've read the plans. → floor / flagged [check tech 50 grid]
- gossip: Sit down with the night man and ask about his knee. → floor / flagged [check wits 50]
- pass: Use the clerk's pass at the side door, with your collar up. → floor / flagged [check wits 50 angle, needs angle.pass=yes]

## floor
*The inner door opens. Nobody looks up. Nobody's here to.*
→ drawer

## flagged
*You get through, and somewhere three floors down a line of text goes onto a screen and waits for morning.*
→ drawer

# drawer
room: nexus/sdg-floor

*Closed files are paper on the sixty-first, in a steel room behind Adebayo's desk, because paper can't be read from outside. The desk's clean. The kettle's warm. There are two cups out.*

[clerk=yours] *The clerk's name is on a list under the blotter. You knew it would be.*

view rue: You can hear him stop. He's not saying why. Ask him. Stay on the line.

- steady: Stand where she'd stand, and work out what she'd want you to see. → open / forced [check cool 50]
- force: Put your good shoulder to the steel-room door. → open / forced [check body 50]
- glass: You know when the eye's dark. Look straight at the lock and take your time. → open / forced [check cool 50 angle, needs angle.glass=yes]

## open
*It opens to you. It's possible it was left to.*
→ turn

## forced
*The door comes open with a noise that goes all the way down the floor. Nobody comes. That doesn't make you feel any better.*
take: part
→ turn

# turn
room: nexus/sdg-floor

*Two folders on a steel shelf. RUE. KADE, A. Hers is thick. His is thin, and it ends with one sheet you know: asset no longer viable, charge reinstated, recommend closure. The signature at the bottom is your own, very neat.*

*Under it is a third, and you've never seen it pulled before: 7-114. The Ninth Grant ledger, two hundred and twelve households, and a line in Adebayo's hand: suspended, at my discretion.*

*{{"Have you got it?"}} she says. {{"What's in it? Soren. What happened to the last one?"}}*

view rue: You asked him a question and it's the only one you've ever really had. You can't see what he's looking at. You'll know from what he does next whether he's what you thought. If he reads you all of it, don't let him off. If he goes quiet, say his name once and wait.

- read: Read it to her. All of it, your name too. → read [set turn=truth]
- hers: Send her hers. Put Kade's back on the shelf. → hers [set turn=hers]
- close: Close the line. Take her file to Adebayo's desk and sit down. → closed [set turn=close]

## read
*It doesn't take long to read. You hear her not say anything. Then you take the folders, and you leave the kettle, and the second cup.*
→ out

## hers
*"It's just you," you tell her. "That's all that's in it." You put Kade back. You've got a good voice for it.*
→ out

## closed
*The bead goes dark in your palm. You sit in the chair across from hers, the one you sat in at nineteen. Ten minutes later you hear her shoes.*
→ out

# out if turn=close
room: nexus/sdg-floor

*"Xander," she says, as if it's a Tuesday. She fills the kettle. She looks at the file, and at you, and at your shoulder. You'd have to get up to leave, and she's the only one who could make that easy.*

view rue: The line went dead in the middle of your question. You don't know why. You keep saying his name and nothing's coming back. You're not going to cry. You start shutting your deck down, in order, the way your father taught you to shut a rig.

- tell: Tell her you've closed it. You have what you need to sign the runner. → settled-up / doubted [check cool 50]
- stay: Say nothing, and let her pour. → settled-up / doubted [check wits 50]

# out
room: nexus/sdg-floor

*Doors. The service stair goes down sixty-one floors and there's a shift change at four. There's a hand mark on the steel-room door and a kettle going cold, and somebody's going to sit at that desk in the morning.*

[turn=truth] *She's still on the line. She hasn't said one word.*
[turn=hers] *{{"Is that all?"}} she says. {{"That's all of it?"}}*

view rue: You've got what you asked for, or you've got what he says it is. He's still got to get out. You're running his doors, and your hands are steady now.

- stair: Go down the service stair with the file under your coat, past the shift. → stairs / seen-out [check wits 50]
- lift: Take the freight lift, and hang on the cable when it stops. → stairs / seen-out [check reflex 50]

## settled-up
*She nods and pours the second cup. She doesn't say thank you. She's never needed to.*
→ last

## doubted
*She pours it and looks at you a little too long. Something goes into a place she keeps for it.*
take: part
→ last

## stairs
*The street, and the rain. Nobody's come after you yet.*
→ last

## seen-out
*You get out with what you came for, but someone in grey has seen a man in Kestrel's jacket leaving the tower at four with his arm held wrong.*
take: part
→ last

# last if turn=close
room: nexus/sdg-floor

*The sky's going grey over Nexus. She hands you a pen. Her name's already at the bottom of it, and there's a line for yours. The paper on the runner, ready for the morning, with the arrears as the offer. You wrote that offer. It's a good one.*

view rue: You're not on the line. You don't know any of this. You've shut your door.

- sign: Sign it, in the hand that signed Kade's. → home-close / burned [check cool 50]
- hold: Carry it down to the Spine yourself, and say it to her face. → home-close / burned [check body 50]

# last
room: spine/deck-market

*The deck market, shut, the tarps dripping. A grey car idles at the head of the row with its lights off. They haven't got a name yet. They've got a jacket and a shoulder, and the Spine's only got so many ways up.*

*{{"Left,"}} she says. {{"Left, and I'll take the cameras. Don't stop."}}*

view rue: He's on the deck and they're close. You know every camera on this row, and you've lived under it your whole life. You're on his side for the next four minutes, whatever he is, and you'll think about that later.

- face: Stop, turn round and show them a Kestrel badge. → home / burned [check cool 50]
- shove: Put your good shoulder through the tarp and go under the stalls. → home / burned [check body 50]

## home
*The foot of the pylon. Oksana's shutter's coming up, the urn's already going, and she doesn't look at your arm. She puts a glass of tea on the zinc, and she goes on not looking at it.*
pay: half
→ end

## home-close
*It's done by the time the haulers thin out. She pays you by the clean end of the morning, in full, through three different hands. The money's very good.*
pay: full
→ end

## burned
*It comes apart at the last. A hand, a car door, a floor you know. The file goes one way, and you go another, and nobody's going to bring you tea.*
take: none
→ end

# fallout if grade=blown

*The hab's shut. The door's chained from outside, there's a new notice on it, and the stair doesn't sway because there's nobody on it. Your deck's gone dark. There's a text from a number you know.*

*Tea?*

view rue: He failed, and the file's gone back. You can't know what he's told them. You will not see him. You're moving tonight, and you're not saying where. If he reaches you, you say no, and you mean it, and there's nothing left to talk about.

- go: Go up to the sixty-first. → done-blown
- stay: Stand on the stair a while. → done-blown

# fallout if turn=truth

*She's on the crate with both folders in her lap when you come up. She's read them. She's had two days. Hers is stacked and squared. His isn't. She's put the sheet with your name on it on top.*

*"That's your signature," she says. "You did it neatly." She looks at you, and for once she's not talking fast. "That's the worst thing I've ever read, and you read it to me."*

*Your phone's been going since the morning. The Ninth Grant has a line in someone else's hand, and you've left it on a steel shelf.*

view rue: Two days ago he read you all of it, with his name on it, down the line, when he could have said nothing. There's no offer any more: you have the file. You don't forgive him for Kade. You might not ever. But you believe him now, and you weren't ready for that. Nothing happens today. Let him see that this is the first true thing, and that it doesn't buy him anything.

- stay: Stay until she tells you to go. → done-truth
- go: Tell her you're going up to see Adebayo. → done-truth

# fallout if turn=hers

*She's on the crate with the folder in her lap. She's read it, and it's yours, and it's out of their hands. She's put the kettle on. It's the first time she's done that for you.*

*"So that's it," she says. "I'm nobody's." She smiles, a bit, and you've not seen that before. "And the last one?"*

*Kade's on a steel shelf, and you've got a good voice.*

view rue: The file's yours and there's no offer any more. He told you the file was all there was. You half believe him. You're as near to happy as you've been since your father, and you don't trust it. You ask about the last one one more time, lightly, and you're listening hard.

- lie: Tell her he got unlucky, and leave it there. → done-hers
- nothing: Drink the tea. → done-hers

# fallout

*Her door's open and nothing's on the crate but a pen. Your paper's in front of her. She's read every line, and she doesn't look up.*

*"You closed the line," she says. "I was still talking." She signs with her handle, and then she has to write the other one, the real one, and she covers it with her hand while she does it. "That's what you wanted. Nine thousand and a charge. I'd like you to leave now, sir."*

view rue: You signed. He closed the line on you in the middle of your question, then came up your stair with the paper. It's the arrears or the Q, and you know exactly what you're worth now. You call him sir. You will never be anything else to him. There's nothing left to talk about but the work.

- go: Take the paper and go down the stair. → done-close
- wait: Stand there a moment longer. → done-close

## done-blown
*The freight goes over. She's somewhere you won't find, and you know how to find anyone.*
settles: rue: Soren failed. The file went back to the branch, you moved and cut every line to him, and there will never be anything between you. If he finds you, it's no.
settles: adebayo: Xander went into your steel room for that runner and failed, and you've got him back on your own terms. You don't know what else he wanted. The second cup has gone away for good, and he knows why.
→ end

## done-truth
*The road hits the joint. She doesn't look up, and she doesn't tell you to go. It's a start, and it's cost you everything you ever had.*
settles: rue: The offer is off the table for good: you hold your own file, and Soren read you the truth about Ari Kade with his own name on it. You believe him now. That doesn't forgive him, and what's between you is still yours to decide, slowly.
settles: adebayo: Xander took the runner's file and Kade's out of your steel room and left you sitting with the kettle. He's betrayed you, you know it, and he hasn't said so. Whatever was between you is over, and it isn't a thing you'd ever take back. The Ninth Grant's charge is in your hand.
→ end

## done-hers
*She pours you another. You've done it again, then, in the neatest hand you've got.*
settles: rue: The offer is off the table for good: you hold your own file. Soren told you there was nothing else in it, and you've almost stopped checking. What's between you is yours to decide, slowly. If you ever learn what he left on that shelf, it will count as the worst lie you've been told.
settles: adebayo: Xander took the runner's file out of your steel room, and left Kade's where it was so you'd know he'd seen it. He's betrayed you, you know it, and he hasn't said so. Whatever was between you is over. The Ninth Grant's charge is in your hand.
→ end

## done-close
*Down the stair, with the paper. Her name's on it now. Both of them. You don't read the second one. There's a text when you reach the bottom. Tea?*
settles: rue: You signed. You're the branch's asset now, Soren is your handler, and you call him sir. There will never be anything between you, and you don't want there to be. It's work.
settles: adebayo: Xander brought you the runner, signed, when you half thought he wouldn't. His loyalty has been tested and it held, and that's the one thing you never wanted to find out. What's between you stays where it was, but it stays. If it ever moves, you still decide when.
→ end
