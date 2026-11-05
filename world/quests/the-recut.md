---
title: The Recut
art: the-recut.webp
kind: contract
tier: 3
with: [silas]
starts: zhou-flat
after: null
pitch: One episode of an old detective show, and the ninety seconds after the director yelled cut. Somebody will pay for the reel. Somebody else already has a flag on the man who found it.
pay: 1000-1200
night: +72h
fallout: +48h
groundwork: pass face, clerk ears, lift muscle
piece pass: A catering contract at Spectra's archive floors. Someone has to talk their way onto the list as the new night supervisor's nephew.
piece clerk: The archive's night clerk, the only soul on those floors after ten. Someone has to sit in the noodle bar he uses and learn what he does and when.
piece lift: The freight lift at the loading dock, the one that doesn't log. Someone has to get a shoulder under the governor and make sure it still doesn't.
lead: silas-strike-footage
guest: ember VET
posts-at: 45
rumor: Silas Zhou has stopped answering his messages. Ember says to come anyway.
---

# offer if met=yes

*Ember opens the door before you knock. "He's eating standing up," she says. "Good luck." She doesn't go anywhere. She leans in the frame with her arms folded, where she can hear.*

*Silas's deck is open. In a week of her walking in, it hasn't been. He pushes his glasses up and turns the old CRT toward you, and it's a bar, and rain on a window, and a man in a long coat.*

*"You know this one," he says. "Everyone knows this one. Now watch the bottom corner of the frame."*

*A flag, sitting on his own trail, a little Spectra watermark in the log with today's date on it.*

view silas: You haven't slept in a week and you're relieved to have someone in the room. You're frightened and you're still being exact about it: what you know, what you've worked out, what you're only guessing. You keep your voice down because Ember's at the door.

- take: Tell him to start at the beginning. → told
- ask: Ask who else has seen it. → told

# offer

*Ember opens the door before you knock. "He's eating standing up," she says. "He'll tell you he isn't. Good luck." She doesn't go anywhere. She leans in the frame with her arms folded, where she can hear.*

*You've never really sat down with her brother. He pushes his glasses up, and he hasn't slept, and his deck's open for once. He turns an old CRT toward you, and it's a bar, and rain on a window, and a man in a long coat.*

*"You know this one," he says. "Everyone knows this one. Now watch the bottom corner of the frame."*

*A flag, sitting on his own trail, a little Spectra watermark in the log with today's date on it.*

view silas: You haven't slept in a week and you're relieved to have someone in the room, even someone you barely know. Ember sent them. You're frightened and you're still being exact about it: what you know, what you've worked out, what you're only guessing. You keep your voice down because she's at the door.

- take: Tell him to start at the beginning. → told
- ask: Ask who else has seen it. → told

## told
*Halloran, the bar episode. Spectra owned the show by then. What he has is raw: a few seconds of a take, pulled out of a dead contractor's backup. Not the cut anyone streams. The camera keeps running past the end of it, and that's where his copy stops being readable.*

*"The original reel's in Spectra's archive," he says. "The archive's in Nexus. True-North will pay for it. I've spoken to someone who says they speak for True-North, which isn't the same thing, and I want that noted."*
→ opened

# opened

*He gives you the number. It's more than he's ever seen in one place, and he says so, and then he explains why he doesn't trust it, at length.*

*"If they have the reel, I'm not the only one holding it. Then there's no point in finding me." He pushes his glasses up. "That part's a guess. Three things would get you in. A name on the catering list. The night clerk's habits. The freight lift. Two of the three would do it. Three nights, and then it's whenever you're ready. I don't know how long I've got. I'd rather not find out."*

*Behind you, from the door: "Tell them about the band."*

*"There's no band."*

*"Silas."*

*"I haven't confirmed the band."*

view silas: You are, in fact, almost sure about the band. You will not say so until you've seen the original. You'd sooner be flagged twice than call a thing a fact before you've checked it. Don't mention what's past the end of the take beyond saying your copy cuts out.

- yes: Say you'll see to it. → set
- band: Ask what band. → set-band

## set
*He writes it down on paper, which is how you know he means it.*
→ back

## set-band
*Ember says it all in one breath: the bar episode, Fairy Dust, a whole song, she was nine, every copy has some other band in it now and everyone's a liar. Silas looks at the ceiling. It has clearly been a long fifteen years.*
→ back

# report-pass if pass=blown

*The list had a real nephew on it. He turned up. Your recruit was shown the service door by two men in very good suits, and now someone in Facilities has a face and a question.*

- drop: Let the name go. → pass-dropped
- pay: Pay the real nephew to say it was a joke. → pass-paid [set nephew=paid]

# report-pass if pass=messy

*The name's on the list. It cost a promise to someone in Facilities: a shift, on the night, with a tray. There's a lanyard in the post and a rota with a mistake on it.*

- keep: Keep the lanyard. → pass-kept [set lanyard=yes]
- burn: Burn the rota. Nobody's coming back to that job. → pass-burned

# report-pass

*The name's on the list. Nobody checked. There's a lanyard in the post, and the Facilities manager thinks your recruit is a nice young person who ought to call their mother.*

- keep: Keep the lanyard. → pass-kept [set lanyard=yes]
- burn: Burn the rota. Nobody's coming back to that job. → pass-burned

## pass-dropped
*The name goes in a drawer somewhere with a note on it.*
→ back

## pass-paid
*He takes it. He says he never wanted the job, and it's the first true thing anyone's said all week.*
→ back

## pass-kept
*It's a very good lanyard. It has somebody's name on it.*
→ back

## pass-burned
*One less thing with your name near it.*
→ back

# report-clerk if clerk=blown

*The old man noticed. He didn't say so. He finished his noodles, paid, and left a tip with a note under it for the stranger at the next stool. Your recruit brought it back. It says: "You're holding your chopsticks like you've read about it."*

- keep: Keep the note. → clerk-kept
- leave: Stop asking about him. → clerk-left

# report-clerk if clerk=messy

*Ten o'clock in, half past six out, one bowl at eleven at the same stool. He talks to nobody. He does his own lines under his breath, your recruit says, or something like lines. The owner got curious about who was asking.*

- pay: Pay the owner to forget it. → clerk-paid
- leave: Let it lie. → clerk-left

# report-clerk

*Ten o'clock in, half past six out, one bowl at eleven at the same stool. He talks to nobody. He does something under his breath that sounds like lines. And there's a voice on him: your recruit has heard it somewhere, and can't think where. It's driving them mad.*

- pay: Ask them to keep thinking. → clerk-paid
- leave: Tell them to let it go. → clerk-left

## clerk-kept
*It goes in your coat. It's good handwriting. Nobody has handwriting like that any more.*
→ back

## clerk-paid
*Sol changes hands. A habit's a useful thing to know, and now it's yours.*
→ back

## clerk-left
*Some things you leave where they are.*
→ back

# report-lift if lift=blown

*The governor was fine. The man from Aegis standing next to it wasn't expecting anyone. Your recruit came home with a split lip and a story, and the dock's got a new padlock.*

- pay: Pay a doctor and say nothing. → lift-quiet
- leave: Leave it. → lift-left

# report-lift if lift=messy

*The lift still doesn't log. It also makes a noise now, somewhere between the fourth floor and the fifth, like a large animal thinking about something. It'll go. It won't go quietly.*

- keep: Leave it as it is. → lift-left
- oil: Send someone back with oil. → lift-oiled

# report-lift

*The lift doesn't log. It never did: the contractor who built it was paid by the floor and didn't care who rode. Your recruit had a sandwich on top of the car and nobody came.*

- keep: Leave it as it is. → lift-left
- oil: Send someone back with oil anyway. → lift-oiled

## lift-quiet
*The doctor doesn't ask. The story gets better every time.*
→ back

## lift-left
*It'll hold or it won't.*
→ back

## lift-oiled
*A can of oil, a long way up. It's the cheapest thing you'll buy all week.*
→ back

# night

*Nexus, late, and the signs on the towers don't go off for anyone. Spectra's archive sits on six floors nobody's ever been sent a brochure for. Silas is in your ear. He has the building's plans on paper, and he's reading them to you whether you asked or not.*

[guest.ember=yes] *Ember's beside you with a deck on her hip and pink in her hair under a borrowed hood. "If he says 'technically' I'm pulling the cable," she says, and he hears her.*
[seen=yes] *Someone's been told to look for someone. The doorman's looking at everybody's shoes.*
[nephew=paid] *There's a real nephew on the list tonight, and he's sick, and nobody's going to check why.*
[lanyard=yes] *The lanyard's on your neck, and it's the most honest-looking thing you've ever worn.*

view silas: You're on the line from the twins' place with paper plans and a cold cup of something. You can't help yourself: you read out every door. You're frightened and it comes out as detail.

- dock: Come in through the dock with the night's bins. → in / noticed [check reflex 55]
- front: Walk in the front like you've got a meeting. → in / noticed [check cool 55]
- badge: Carry a tray, be somebody's nephew. Your name's on the list. → in / noticed [check cool 55 angle, needs angle.pass=yes]

## in
*Nobody in Nexus looks at anyone carrying something. The doors close behind you with the soft sound of money.*
→ lift

## noticed
*You're in. A man in a very good suit watched you go, and he's reaching for something that isn't a gun, which in this building is worse.*
→ lift

# lift

*The freight lift's at the end of a corridor that smells of carpet. The archive is the thirty-first floor to the thirty-sixth. Silas says it's rated for four tonnes and hasn't been inspected since before you were born, and that this isn't relevant, and then he says it again.*

view silas: You've only just realised you're reading a lift's load rating to someone standing in it. You don't stop.

- shaft: Ride the car's roof and drop in above the floor. → up / stuck [check body 55]
- panel: Open the panel and talk to it. → up / stuck [check tech 55]
- freight: Take the lift. Someone saw to it. → up / stuck [check body 55 angle, needs angle.lift=yes]

## up
*Thirty-four. The door opens on the dark and the cold, and the sound of a great many machines keeping a great many things the same.*
→ stacks

## stuck
*It sticks between floors for eleven minutes, while Silas tells you it won't. When it moves it moves loudly, and somewhere below you a door opens.*
→ stacks

# stacks
room: nexus/spectra-archive

*Aisles of cold metal to the end of the light. Everything Spectra ever said, and everything it said instead. There are no people on this floor: there's a lamp on a track that goes up and down the aisles, patient as a nurse.*

[guest.ember=yes] *Ember's already gone quiet, which you have never once heard her do. She's reading the spines.*

view silas: You've wanted to see this room your whole life and you're seeing it through someone else's breathing. Ask them what it looks like. You can't help it.

- time: Count the lamp and move between its passes. → aisle / lit [check wits 55]
- run: Go the length of the aisle while it's turned away. → aisle / lit [check reflex 55]
- ember: Let Ember take the lamp offline. Ninety seconds, she says. Plenty. → aisle / lit [check tech 55 angle, needs guest.ember=yes]

## aisle
*H. Halloran has its own bay, floor to ceiling, more seasons than you knew there were.*
→ vault

## lit
*The lamp finds your hand, and stays on it, and then moves on. Whatever it does with that, it does somewhere else.*
take: part
→ vault

# vault
room: nexus/spectra-archive

*The raw reels aren't with the rest. There's a cage at the end of the bay, and a card reader, and a brass lock some sensible person left in place when the card reader went in. The bar episode's in there. You can read the tin.*

view silas: Tell them the tin's number. You've had it memorised for a week. Your voice goes up on it, and you hear it, and you hate that.

- lock: Pick the brass. → open / jammed [check reflex 50]
- reader: Lie to the card reader. → open / jammed [check tech 50]
- hours: He's here till half past six and he takes his bowl at eleven. Go in at eleven. → open / jammed [check wits 50 angle, needs angle.clerk=yes]

## open
*The cage swings. The tin's lighter than you'd think, for what it costs.*
→ reel

## jammed
*It opens at last with a sound that goes down the whole aisle and comes back.*
take: part
→ reel

# reel
room: nexus/spectra-archive
song: Fairy Dust

*There's a viewer on the bench for checking stock. You have to know it's the right one. You thread it, and the bar comes up, rain on the window and the man in the long coat, and behind him on a stage the size of a door there are four kids with broken amps and glitter on them, and the singer's screaming half the words.*

[guest.ember=yes] *Ember doesn't say anything. She's got both hands over her mouth. She was right, for fifteen years, and there's nobody up here to tell.*

*On the line, very quietly, Silas says, {{"Oh."}}*

*Then the director yells cut, and the band stops, and the man in the coat lights a cigarette and laughs at something. And the camera keeps running.*

*Two Sentinels come in from the street. They aren't extras. They walk him off his own set with a hand on each arm, in the coat, and he's still got the cigarette, and nobody on the crew looks at him. It runs ninety seconds. Spectra told the city Anton Greer retired to the coast.*

view silas: You've just heard the song and then you've just seen what you got flagged for, and you worked it out a week ago but you've never seen it clearly. Your voice has gone flat. "I'd like it noted that I was right about the frame." Nobody laughs. Then you tell them to take the reel and go.

- tin: Close the tin. → stopped
- ember: Let the song play out. She waited long enough. It's loud. → stopped [alarm +1, set played=yes, needs guest.ember=yes]

## stopped
*The viewer ticks down.*

*"You'll want to put that back," someone says.*
→ turn

# turn

stranger: The night clerk — old, a cardigan over a shirt and tie, a lanyard that says M. Reyes
face: local-nexus-03
song: Fairy Dust if played=yes
room: nexus/spectra-archive

*He's standing at the end of the aisle with a flask of tea. You have never seen his face. Everyone in Lowlight knows the voice. They've had it in their homes for thirty years, tired and kind and owing money to the wrong people.*

*"They didn't kill me," he says. "They're not fools. They gave me a job."*

*He's been here twenty years. He's the one who runs the recuts. It's his hand on every tape, and he's the one who took Fairy Dust out of that bar. They've got his daughter's address in a drawer and they've never once had to mention it.*

*"Take the band, if you want the band. Leave my ninety seconds where they are. Or take it all, and I expect I'll hear how it comes out."*

*He has a sip of tea. On the line, Silas has stopped breathing.*

view silas: You are hearing Anton Greer's voice in your ear, the real one, and you own every season. You can't speak for a moment. When you can, you tell them what True-North paid for: all of it. You won't tell them what to do. You're the one who keeps things apart: what's true, what's owed, what you'd only be guessing.

- whole: Take the whole reel. It's what you were paid for. → took-whole [set turn=whole]
- cut: Cut the last ninety seconds. He does it in four, without looking. → took-cut [set turn=cut]
- out: Take the reel, and take him with you. → took-out [set turn=out]

## took-whole
*He nods as if you'd said something about the weather. He goes back to his bench, and he sits down, and he doesn't press anything. He could.*
→ down

## took-cut
*He's very good. The join doesn't show. He hands you the tin, and the little curl of film, and then takes the film back and puts it in his cardigan. That's what you are now, and you both know it.*
→ down

## took-out
*"Don't be stupid," he says. Then he looks at the bench for a while. He takes his cardigan off and folds it and leaves it there.*
→ down

# down

*Something on the thirty-first floor has woken up. The lift's lit, and it isn't coming for you. There's a stairwell Silas has on paper and nobody's used since it was built.*

[turn=out] *He's seventy-eight and he doesn't complain once. He does the voice, very softly, for the first two flights.*
[guest.ember=yes] *Ember's got the tin inside her jacket with both arms round it.*
[played=yes] *They heard that on every floor.*

view silas: You're reading stairs. There are three hundred and eighty of them. Count them out loud if it helps.

- stairs: Take the stairs and don't stop. → landing / winded [check body 50]
- doors: Let Silas read you the doors and go where the cameras don't. → landing / winded [check wits 50]

## landing
*Thirty-one flights of concrete, and nobody on any of them.*
→ street

## winded
*You come off the stairs slower than you went on, and you've left something up there you'd have liked to keep.*
take: part
→ street

# street

*The dock, and the rain, and the signs. Between you and the street there's a van with Spectra's eye on the side and a crew getting out of it, and they've got lights. Whatever happens next will be very well shot.*

[guest.ember=yes] *"They film me," Ember says, "I want a royalty."*

view silas: You've got a street camera feed and you wish you didn't. Tell them which way the lights are pointing.

- talk: Walk straight at the lights and ask who's in charge. → away / filmed [check cool 50]
- gone: Go under the van and away along the wall. → away / filmed [check reflex 50]

## away
*Nobody's in the shot. By the time they've found the focus you're two streets gone.*
→ last

## filmed
*You get away, but they get a second of you, and Spectra can do a great deal with a second.*
→ last

# last if turn=whole

*The Spine, and a man at the barrier who's been told to stop a tin. He doesn't know what's in it. He's got a Sentinel's shoulders and a very long shift behind him. On the line Silas says, {{"I'd like to be able to tell you that's a coincidence."}}*

view silas: You've gone quiet and exact. The reel's nearly out.

- talk: Hand him a lanyard and a tired smile. → home-whole / caught [check cool 50]
- past: Go through him. → home-whole / caught [check body 50]

# last if turn=cut

*The Spine, and a man at the barrier who's been told to stop a tin. He doesn't know what's in it. There's less in it than there was. On the line Silas says nothing for once, and you can hear what he isn't saying.*

view silas: You know what they did up there. You're not going to say anything about it yet. You keep to the facts.

- talk: Hand him a lanyard and a tired smile. → home-cut / caught [check cool 50]
- past: Go through him. → home-cut / caught [check body 50]

# last

*The Spine, and a man at the barrier who's been told to stop a tin. He doesn't know what's in it. Then he looks past you at the old man, who's taken off his glasses, and something happens in his face. He's trying to think where he's heard that cough.*

view silas: You can't see any of this. You can hear an old man breathing on your line, and he's in your head with every season you own.

- talk: Let the old man do the talking. He's done this before. → home-out / caught [check cool 50]
- past: Go through him before he works it out. → home-out / caught [check body 50]

## home-whole
*A long way round to the Ribbon. Silas meets you at the door in his socks. A courier who doesn't give a name takes the tin and leaves the money, all of it, in a paper bag, and Silas counts it twice.*
pay: full
→ end

## home-cut
*A long way round to the Ribbon. The courier opens the tin and checks the length against something, and looks at you, and leaves about half of what he came with. "They said it might be short," he says.*
pay: half
→ end

## home-out
*A long way round to the Ribbon. There's an old man on the twins' couch in his shirtsleeves, looking at a Halloran poster. The courier takes the tin and counts out what's left after a man who wasn't in the deal. It isn't all of it.*
pay: half
→ end

## caught
*Hands, a very good suit, a very tired voice saying it's nothing personal. They take the tin. They'll know whose it was by morning, and nothing you've done tonight has made that any better.*
take: none
→ end

# fallout if grade=blown

*You go up the Level 2 stairs because you owe it. The flat's half in boxes. Silas's bench is bare under the lamp, and he's coiling a cable very neatly, and he doesn't push his glasses up.*

*"I've got a place to go," he says. "I'd rather not say where. That's not about you."*

[guest.ember=yes] *Ember's sitting on a box with her chin on her knees. She doesn't look up. She was that close, and she still can't prove it, and that's worse than before.*

view silas: You're moving out tonight because of what's on your trail. You aren't angry. You keep to what you know. You thank them for trying, and you mean it, and it's awful.

- say: Say you're sorry. → done-blown
- help: Pick up a box. → done-blown

# fallout if turn=cut

*The feed in every noodle bar on the Ribbon flickers at the top of the hour and the anchor's gone, and it's Dead Air, and it's a bar in the rain with four kids and broken amps. It runs the whole song. Then the band stops, and there's a very good join, and the anchor comes back and pretends nothing happened.*

*Silas watches it at the bench with the sound down. The flag's gone off his trail. He checked. He checks again.*

[guest.ember=yes] *Ember's been in every bar on Level 5 since it aired. She's hoarse. She's got glitter in her eyebrows and she's never been so happy, and she doesn't know about the ninety seconds, or she does, and she's decided.*

view silas: The flag's gone. You're safe, and the record's wrong, and you helped. You won't reproach them. You will tell them, once, that you've written down what's on the part that was cut, on paper, and put it where you keep things.

- ask: Ask if he's going to sleep now. → done-cut
- say: Say it was the right call. → done-cut

# fallout if turn=out

*There's a smell of toast. Anton Greer's at the twins' table in one of Silas's Halloran shirts, reading the paper with a pencil, correcting it.*

*The reel ran on Dead Air, all of it. The city's been arguing for two days about whether he's alive. Spectra says he isn't. He finds this very funny. He's already told Silas, gently, that season four was never any good.*

[guest.ember=yes] *Ember's making him listen to the song again. He played a detective for thirty years and he's the first person who ever said to her face, "No, you're quite right, I was there."*

view silas: Anton Greer told you season four was never any good. You have never been so happy or so frightened. His daughter's somewhere safe, you've checked, and you'll keep checking. You'd like the player to know you're aware this isn't sustainable.

- sit: Sit down. → done-out
- ask: Ask what he's going to do now. → done-out

# fallout if turn=whole

*The reel ran on Dead Air, all of it. It's on every screen downstack that'll hold a pirate signal: four kids and broken amps, then two Sentinels and a man in a coat. The flag's gone off Silas's trail. There's no point in finding him now.*

*There's a line in Spectra's notices, down at the foot of the page, the kind nobody reads. An M. Reyes of the Archive Division, after long service, suddenly. Silas has cut it out with a very straight edge. It's on the bench under the lamp.*

[guest.ember=yes] *Ember's got the song on through the wall. She's turned it down, for once. You can still hear it.*

view silas: You've seen the notice. You keep things apart: what's known, what you've worked out, what you'd only be guessing. You know what's on that bench. You don't accuse anyone. You'd like someone to have read it with you.

- read: Read it. → done-whole
- leave: Say you've seen it. → done-whole

# fallout

*You go up the Level 2 stairs because you owe him the news. The tin's still in that building, and now somebody up there knows it was worth a try. He's reading the log with his glasses off.*

*"You got out," he says. "That's the first thing." He writes something down. "The flag hasn't moved. I'd like to say that's encouraging. It doesn't mean anything yet."*

[guest.ember=yes] *From the door, Ember says, "Tell them there's a band." Silas says he can't confirm the band. It's the most normal thing anyone's said all week.*

view silas: They came back without the reel, and they came back. You're still flagged. You're thanking them and working out where you'll sleep. You don't blame anyone. You keep to what you know.

- say: Say it won't stay this way. → done-none
- nod: Say you're glad he's still here. → done-none

## done-blown
*You carry a box down to the landing. Nobody says when they'll be back.*
guest-note: I went into Spectra's archive for the Halloran reel with the crew and it went bad. The reel's still in their vault and Silas has had to move out.
→ end

## done-none
*He's already reading the log again by the time you reach the door.*
guest-note: I went into Spectra's archive for the Halloran reel with the crew. We got out without it. It's still in their vault, Silas is still flagged, and I still can't prove the band.
→ end

## done-cut
*"Technically," he says, and stops, and shuts the deck.*
guest-note: I was right. Fairy Dust played the bar in that Halloran episode. I saw the raw reel myself and Dead Air ran the whole song. The reel that aired was cut short at the end, and Silas won't talk about that part.
→ end

## done-out
*"The trouble with the early seasons," says the man at the table, and Silas sits down to listen. There's someone waiting on the landing already, a friend of Greer's, an old set hand who can talk their way past anything and wants work.*
guest-note: I was right. Fairy Dust played the bar in that Halloran episode. I saw the raw reel myself and Dead Air ran the whole song. Anton Greer, the real one, is alive and hiding on our couch, and he remembers the band.
gives: recruit face HAND
→ end

## done-whole
*He turns the lamp off. Through the wall the song stops, and after a moment it starts again.*
guest-note: I was right. Fairy Dust played the bar in that Halloran episode. I saw the raw reel myself and Dead Air ran the whole song. The old night clerk in that archive was Anton Greer, and the notices say he's dead now.
→ end
