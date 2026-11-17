---
title: Last Call
art: last-call.webp
kind: mission
tier: 2
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: passenger
trust: 1 / 2
people: [Wren, Dace]
pitch: An old voice at your end of the bar. She's paying in sol, and she won't say why it's you.
posted-by: Wren, on Hicks's stool at the Tilt. Cass rang it through.
brief: "Hicks's old operator is at the Tilt, a Caper now. Her mark ran the night before pickup, and her handler thinks she warned him. Ember's on Hicks's ear."
pay: 360-440
loot: Wren's sol
---

# ask
title: The Handset
song: The Yes Book

*Silas has the twins' handset to his ear when you come in, and he holds it out without looking at you. "Cass," he says. "She rang here." Cass never rings the twins.*

*Cass doesn't say hello. "She's on your stool," she says. "Since nine. Drinking your brown. I'm not ringing you, Hicks. I'm ringing them." The line goes dead.*

*Ember's at the bench with a bead between finger and thumb. Nobody in this flat has said the name in four months. She says it now, once, carefully, like something that might still be hot. "Wren." Then: "You want someone on your ear for that? You can say no."*

view ember: Cass just rang: Wren is at the Tilt, on Hicks's stool, after four months. You liked Wren, and you've never once said her name around him since. You want to be on his ear for this and you're not sure you should be. Offer once. Don't joke.

- yes: Take the bead. → bead [set ear4=chose]
- no: Tell her this one's yours. → alone [set ear4=allowed]

## bead
*She seats it for you herself, which she's never done. Her fingers are cold. "I'll be quiet," she says. You both know she won't.*
→ tilt

## alone
*"Course," she says. At the door she straightens your collar, and there's a pinhead camera in it when she's done. You find the bead in your coat pocket on the Ribbon stairs. You put it in.*
→ tilt

# tilt
title: The Tilt
room: karasu/the-tilt
song: The Yes Book

*The Tilt at ten. The floor runs downhill to the back wall like it always has. At the end of the bar where it runs steepest, on your stool, a woman in a charcoal coat with her hair pulled back hard. Two glasses of the house brown in front of her. One's untouched.*

*Cass pours nothing for you. She doesn't have to.*

*Wren doesn't turn round. "Hello, Hicks." Then, to the air by your collar: {{"Hello, Ember. I know you're on. You never could leave a line alone."}}*

[switchboard=burned] *"I hear you work both sides now," she says. "Good. So do I."*
[passenger=sold and switchboard!=burned] *"I hear you hand people over now," she says. "Good. That's what I need."*

*She tells it flat, the way she used to read a lacquer map back to you. She's with the Capers. Since the spring. Her mark was a clerk of theirs gone wrong, a man called Dace, and he ran the night before she was due to pick him up. Her handler, Ashdown, thinks she warned him. "Find him before Ashdown decides I did."*

*You ask her why the Capers. She looks at the untouched glass. "Find him first."*

view ember: Wren is on Hicks's stool, and she just said hello to you by name, like nothing happened. She's a Caper now, the people who hunt runners like you. You liked her. You don't know what you feel yet. Say one thing, short, to him only. Don't answer her.

view ember if ear4=allowed: He didn't want you on this. You're on it. Be very quiet.

- paid: Take her sol. It's a job. → paid [set wren_job=paid]
- free: Push the money back. Say you'll find him anyway. → free [set wren_job=free]

## paid
*She slides it across folded once, the way she always folded money. Caper pay. Good paper. You put it in your coat without counting it.*
→ market

## free
*She looks at the money on the bar between you, and at you, and leaves it there. When you've both gone, Cass puts it behind the register under the cash tray, and doesn't count it either.*
→ market

# market
title: The Deck Market
room: spine/deck-market
song: The Yes Book

*Dace sold his deck the morning he ran. A runner who sells his deck is leaving the grid, and a man leaving the grid needs cash and a door. The market under the Spine buys decks with no questions and sells them on by noon.*

*{{"Six stalls take decks,"}} Ember says. {{"Four of them would cheat a Caper. He went to one of the four."}}*

view ember: You're on his ear at the deck market. He's hunting for Wren, which is strange, and you're good at this part, which helps. Help him find the stall. One thing at a time.

- stall: Walk the stalls and find the one that bought a Caper's deck this week. → bought / asked [check wits 55]
- log: Find the deck on a back shelf and read its last log before it's wiped. → bought / asked [check tech 55 grid]

## bought
*The deck's on a back shelf with a new price on it. Its last log is a booking: the Long Haul, the corner booth, and a handle you know from the Switchboard's dark end. A Strip-Miner broker. A man who's leaving the grid doesn't book a Strip-Miner for the eggs.*
→ haul

## asked
*It takes three stalls and too many questions, and the third stall-keeper will tell somebody you asked. But the deck's there, and its last log is a booking: the Long Haul, the corner booth, and a Strip-Miner broker's handle.*
→ haul

# haul
title: The Long Haul
room: spine/long-haul
song: The Yes Book

*The Long Haul at the back end of the night. Drivers at the counter who never look up. In the corner booth, the private one, a broker in a hauler's vest is eating eggs he isn't hungry for, with a phone face down by his plate.*

*{{"That's him,"}} Ember says. {{"He's waiting for someone who isn't coming. That's Dace's seat."}}*

view ember: The broker's in the corner booth at the Long Haul, and the seat across from him is empty. You want to know what Dace was meeting a Strip-Miner about. Keep Hicks moving. You're impatient tonight, and you know why.

- sit: Sit down in Dace's seat and order eggs. → told / guessed [check cool 55]
- phone: Lift his phone off the table while he eats. → told / guessed [check reflex 55]

## told
*Dace isn't hiding from anyone. He's selling. Something on paper, to the Strip-Miners, some night this week, and he wanted a broker who'd never worked for the Capers. The broker doesn't know what it is. He knows what it's worth: more than he's been offered for anything.*

*{{"She said he ran,"}} Ember says, quietly. {{"She didn't say he was selling."}}*
→ bath

## guessed
*Half the book, and a broker who knows his phone's been read. Enough. Dace isn't hiding. He's selling something on paper to the Strip-Miners this week, and the broker's never been offered so much for anything.*

*{{"She said he ran,"}} Ember says. {{"She didn't say he was selling."}}*
→ bath

# bath
title: The Bathhouse
room: velvet/bathhouse
song: The Yes Book

*The broker's book has one other number in it: Dace's woman, a house worker at a Velvet hotel. She washes off her shift at the bathhouse under the Cat. At this hour the hall's half empty, two women from rival houses in the same still water, not looking at each other.*

*She's in the far corner under the mural. She sees you before you're through the curtain.*

*{{"She's scared,"}} Ember says. {{"Somebody's already been. Look which door she's watching."}}*

view ember: Dace's woman is in the bath, and somebody frightened her before Hicks got here. You think Capers. Tell him to go gently. One line.

- talk: Sit on the edge by her and tell her you're not the first. → sleeps / scared [check cool 55]
- curtain: Be at the changing-room curtain before she reaches it. → sleeps / scared [check body 55]

## sleeps
*Two men came yesterday with good shoes and Caper manners. She told them nothing, because she knew nothing. She knows something now: a note under her door this morning, in his hand. He sleeps under Drownworks, where the old intake is. He says he's sorry.*
→ tail

## scared
*She tries to go past you and you don't let her, and she'll remember that. Two men with good shoes came yesterday. This morning there was a note under her door in his hand: under Drownworks, the old intake. She gives it to you so you'll go.*
→ tail

# tail
title: The Lamp
room: velvet/under-the-cat
song: The Yes Book
post lamp: Someone hangs back under the Cat and stays on the lamp, wherever it goes. [suits ears]
gives lamp: You'll know where the lamp is. A miss in the old intake doesn't lose what you found.

*Out under the Cat, in the pink rain. Across the street by the hotel's narrow door, a lamp that's been in the corner of your eye since the Long Haul.*

*{{"Lamp on the hotel door,"}} Ember says. {{"It was on the Spine too. They're watching her, Hicks. Now they're watching you."}}*

view ember: Someone's tailing Hicks through Velvet, and you think it's the Capers who watch Wren. You're angry with her, a little, for bringing this down on him. Tell him which way's clear.

- lose: Lose the lamp in the rain and the crowd at the bathhouse door. → lost / followed [check reflex 50]
- turn: Through a hotel service door you know from finder's work. → lost / followed [check wits 50]

## lost
*The lamp stops at the corner, swinging, looking for you. It doesn't find you. It'll find her, and ask her where her finder went.*
→ camp

## followed
*You lose it, nearly. On the canal stair you see it again, two streets back, not hurrying. Whoever's holding it knows your walk now.*
→ camp

# camp
title: The Old Intake
room: drownworks/old-intake
song: The Yes Book

*Under Pump House Nine, past the night crew, through the steel door nobody shuts. The old intake: a low vault of sweating mains, cold teal through the grating, the dead pipe's mouth with green lamps running off into the dark.*

*On an old pump plinth, a bedroll, boots, tins under a caged lamp. The blanket's still warm. In a tin with the cigarette ends, the stub of a page torn out of a bound book: a ragged edge of good paper, and nothing on it but a margin.*

*Then boots on the steel stair behind the door. Not hurrying.*

[post.lamp] *Whoever you left on the lamp followed it here. They're somewhere on the pump-house floor over your head.*

*{{"Two lamps on the stair,"}} Ember says. {{"Hicks. Now."}}*

view ember: Dace was here an hour ago, and someone's coming down the stair behind Hicks. You saw the torn stub on the camera and you don't know what it means yet. Get him out. No questions until he's out.

- pipe: Into the dead intake pipe, past the green lamps, and wait in the dark. → clear / caught [check body 50]
- stair: Back up the stair behind them while they come down. → clear / caught [check reflex 50 · if post.lamp=fit +10 "your ears counted them down the stair"]

## clear
*They come down with their lamps and find a warm bedroll and an empty vault. You're out of it with the stub in your pocket, listening to a Caper swear about the wet.*
pay: full
→ home

## caught if post.lamp
*Their lamp swings for you and stops short. Up on the pump-house floor somebody has kicked a mug off the control desk, on purpose, and both Capers turn for it. Whoever you left on the lamp gets the good long look that was coming to you. You're out with the stub in your pocket and half of what it was worth.*
pay: full
take: part
post lamp: held
→ home

## caught
*Their lamp finds you before you're clear. A good long look, no hurry. They don't follow. They don't need to. Whatever Wren's handler wanted to know about her finder, he knows now.*
take: none
→ blown

# home
title: Five O'Clock
song: The Yes Book

*The twins' place at five. Silas is asleep on the couch with a holovid still running. Ember's on the bench with the bead in her lap. You ring Wren from the landing.*

*She picks up before it rings. "Well?"*

view ember: He's about to tell Wren what he found, or not. Dace isn't hiding, he's selling, and she left that out. You're listening from the bench. If he lies to her, say so afterwards, once. If he doesn't, say nothing.

view ember if ear4=allowed: He didn't want you on this one. You heard all of it anyway. You won't say that tonight.

- told: Tell her Dace isn't running, he's selling something. Then listen. → told-her [set wren_one=told]
- kept: Tell her the trail's warm. Keep the rest. → kept [set wren_one=kept]

## told-her
*She goes quiet. Not the quiet of someone surprised. The quiet of someone doing sums. "Selling what," she says, and it isn't a question, and you hear her hear that. "Find him," she says. "Please." She never once said please to you on a job.*
→ end

## kept
*"Warm," she says. "All right." You hang up. Ember hasn't moved. "That's two clients this month you've lied to," she says. "Just so you know I'm counting." She doesn't sound angry. That's worse.*
→ end

# blown
title: Five O'Clock
song: The Yes Book

*The twins' place at five, and Wren's already rung twice. Ember holds the handset out to you without a word.*

*"Ashdown's people saw my finder in the old intake," Wren says. "Saw your face. I didn't send them. Did you find him?"*

view ember: It went wrong. The Capers have Hicks's face now, because of Wren's job. You're angry and you're frightened for him, and she's on the line. Don't talk to her. Stay by him.

- warm: Tell her the trail's warm. → cold [set wren_one=kept, set ashdown=seen]
- nothing: Say nothing. Put the handset down. → hung-up [set wren_one=kept, set ashdown=seen]

## cold
*"Warm," she says. "You always say warm." She hangs up first.*
→ end

## hung-up
*You put the handset down on the bench. It rings again. Nobody picks it up. Ember sits next to you and doesn't say her name.*
→ end

# getaway
title: The Lamps
room: drownworks/old-intake
song: The Yes Book

*Caper lamps behind you, two of them, not hurrying, the way men walk when they've done this before.*

*{{"Two lamps,"}} Ember says. {{"Go where they aren't."}}*

view ember: He's running with Caper lamps behind him. Tell him what you can see on the collar camera, short.

- run: Run, and keep running until the lamps give up. → out / seen-out [check reflex 55, set wren_one=kept, set ashdown=seen]
- turn: Turn into the first door that isn't lit and wait them out. → out / seen-out [check cool 55, set wren_one=kept, set ashdown=seen]

## out
*You lose them, in the end. Behind you, somebody has a face to give Ashdown.*
→ end

## seen-out
*A lamp catches you at a corner and holds you a long second. You walk home slow. Wren rings before you're through the door. She already knows.*
take: none
→ end
