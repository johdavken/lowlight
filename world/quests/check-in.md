---
title: Check-In
art: check-in.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: passenger_two=yes
trust: 1 / 2
guest: noa GREEN
pitch: Lusk is out of patience. Aegis never had any.
posted-by: Lusk, under the Cat. A time and a kerb, and no more retainers.
brief: "Lusk wants the girl under the Cat by six. Aegis crews are asking at the dead blocks' fire. Ember's on Hicks's ear."
pay: 90-110
loot: Aegis's check-in relay, for a minute
---

# ask

*Lusk calls at three. "Six o'clock, under the Cat," he says. "Bring her, or I tell the house who my finder's been keeping warm." He doesn't raise his voice. Fixers don't.*

*At half past, the dead-blocks kid is at the door, soaked. Men in Aegis vests on the far side of the wall, asking questions at the drum fire with their hands on their belts. Aegis doesn't care that the dead blocks don't call SDG. Aegis doesn't call anyone.*

*Ember's at the bench with the bead in her palm. She doesn't hold it out this time. She waits.*

[guest.noa=yes and script=yes] *Noa came with the kid. She's in Pell's coat on the twins' couch, and her nose is bleeding again, slowly. "They found the edit," the flat voice says. "Not us. Not yet."*
[guest.noa=yes and script!=yes] *Noa came with the kid. She's in Pell's coat on the twins' couch, and her nose won't stop bleeding. "They found the market," the flat voice says. "Not us. Not yet."*

view ember: This is the night it ends, one way or another. Lusk wants the girl at six and Aegis is in the dead blocks. You're not offering the bead this time. You want to see if he asks for it.

view ember if ear1=allowed and ear2=allowed: He's never once asked you onto his ear. You've let it go twice. Not tonight. If he wants you, he says so.

- yes: Ask her for the bead. → bead [set ear3=chose]
- no: Say nothing, and hold your hand out. → alone [set ear3=allowed]

## bead
*She puts it in your palm and closes your fingers over it. "Thank you for asking," she says, and means it, and it's the most serious you've ever heard her.*
→ out

## alone
*She looks at your hand for a long second. Then she drops the bead in it. "Fine," she says. "Fine." She's already turning back to her deck.*
→ out

# out
room: karasu/dead-blocks

*Old Town at the back end of the night. Work lamps on the far side of the broken wall, three of them, swinging. Two Aegis vests at the drum fire, and the old man who nodded you through is looking at his boots. Pell's lantern is out. The girl is on the third floor, where Pell moved her, and she can barely stand.*

*{{"Three lamps,"}} Ember says. {{"One on the stairwell. Two at the fire. Nobody on the gap by the wall, which I don't like."}}*

[guest.noa=yes] *Noa's eyes are open and very steady. Its eyes. "Two at the fire carry. The stairwell doesn't. We were built to tell."*

view ember: The collar camera shows you Aegis lamps in the dead blocks. You're counting them for him. You don't like that nobody's on the gap; it feels like a door left open. Say so, short.

view ember if guest.noa=yes: The thing in the girl's head is reading the Aegis men the way it was built to. It's frightening how good it is. It talks to you as much as to him.

- carry: Carry her down the back stair. She can't walk it. → across / close [check body 50]
- stairs: Through the next block's stairs. You've known them since you were twelve. → across / close [check wits 50]
- legs: Let it take her legs and hands. It was built to move an officer through worse. → across / close [check reflex 50 angle, needs guest.noa=yes]

## across
*You come out through the far block into the paying side's light with the girl on your arm and the lamps still at the fire. Nobody followed. Nobody needed to. They know where Lusk's meet is.*
→ meet

## close
*A lamp swings your way on the last landing. Somebody in a vest gets a look at a coat and a girl. Then you're through, into the paying side's light, with the girl's breath gone ragged on your neck.*
→ meet

# meet
room: velvet/under-the-cat

*Velvet, under the Cat, rain coming down pink. Lusk is under a hotel awning with his collar up. At the kerb there's a plain grey van with its back doors open, and inside it a rack of small amber lights and a padded case lying open and empty, waiting for a cart.*

*The man beside the van isn't a house man. No vest, good shoes, and the patience of someone salaried. Aegis.*

*{{"Hicks,"}} Ember says, and stops. Then: {{"That rack. That's a check-in relay. That's how they listen for their carts."}}*

view ember: You know what that rack is before Hicks does: Aegis's check-in relay, the thing a military cart calls home to. You've just had an idea, and it's mad, and you're not saying it yet. Tell him what the rack is. One line.

- walk: Walk up to Lusk like a man delivering. → reach / tight [check cool 50]
- watch: Stop in the hotel's doorway and watch the van before you go near it. → reach / tight [check wits 50]

## reach
*Lusk counts the girl with his eyes and nods to the Aegis man, who nods to the van. The relay's lights go from amber to green, all at once, listening. In your ear, Ember lets out a breath. "If it called home," she says, very fast, "and said it was dead..."*
→ choice

## tight
*It takes too long. The Aegis man has his hand inside his coat before Lusk waves him down. The relay's lights go green, listening. In your ear, Ember says, very fast, "If it called home and said it was dead..."*
→ choice

# choice
room: velvet/under-the-cat

*The girl's face goes still under the hood. The flat voice doesn't speak to you. "Spark," it says, on your bead, from a girl's mouth a foot away. "Ask him what he's going to do."*

*Ember doesn't. She's waiting, the way she waited with the bead tonight.*

view ember: The thing in the girl's head asked you to ask him. You won't. This is his to say. You've heard him lie to Lusk for three nights. You don't know which way he goes now, and you're afraid of both.

view ember if ear3=chose: He asked you onto his ear tonight. Whatever he does, you'll stay on the line to the end.

- hand: Hand her across. It's the job. → handed [set passenger=sold]
- relay: Take the van's relay while Lusk is still counting. → turned

## handed
*Lusk takes her elbow. The Aegis man takes her into the van and the doors close, and the last thing you hear on the bead is the flat voice saying "Spark" once, and then nothing at all. Lusk pays in paper, and calls you a professional. Ember doesn't say anything. The line stays open a long time after.*
pay: full
settles: ember: Hicks handed the girl, Noa, to Aegis under the Cat for Lusk's money. You were on his ear and heard every word, and the thing in her head saying your name. You haven't forgiven him and you don't know if you will.
→ end

## turned
*You're at the van before the Aegis man is out of the rain. The relay is warm and green and listening.*
→ relay

# relay
room: velvet/under-the-cat

*The relay listens for one cart. One last check-in, from a cart that's dying, and Aegis writes it off: no cart, no mind, no girl worth a van. It has to sound like it came from inside her slot.*

*{{"You've got the length of Lusk's temper,"}} Ember says. {{"Go."}}*

view ember: He took the relay. You're on the line with him and you're inside Aegis's listening post, which is the most frightening thing you've ever done, and you'd do it again. Talk him through it if he lets you.

view ember if guest.noa=yes: The thing in her head could call home itself and die on the line. It's offered. You hate that it's the best way.

- write: Jack the relay and write the cart's death yourself. → forged / failed [check tech 50 grid, set switchboard=burned]
- pull: Pull the relay out of the rack and run it in the alley behind the bathhouse. → forged / failed [check reflex 50, set switchboard=burned]
- die: Let it call home one last time, and flatline on Aegis's line. → forged / failed [check tech 50 grid angle, needs guest.noa=yes, set switchboard=burned]

## forged
*At five fifty-two the relay hears a military cart call home from a slot running too hot, and stop. Aegis writes it off. The Aegis man reads his screen twice and gets into the van and goes. Lusk stands under the awning with his hands in his pockets, and you know the Switchboard will have your name by noon. You keep his retainers. It's all the pay there is.*
pay: full
→ home

## failed
*The relay hears something. It isn't a death. The Aegis man has his hand on the girl's arm before Lusk can say anything, and the van doors close on her, and the last thing on the bead is the flat voice saying "Spark" once.*
take: none
→ burned

# home

*Dawn at the Zhous'. The girl is asleep on the couch where you used to sleep, in Pell's coat. Aegis's books say the cart in her head died at five fifty-two. Lusk's corner of the Switchboard says you work both sides.*

*Ember sits on the bench with the bead. "Where does she go," she says. "Where do they go."*

view ember: You did it, together, on the line, and the girl's alive on your couch. The Switchboard will be done with Hicks by noon. Now he has to decide where she goes, and you want to hear him decide it.

view ember if ear1=allowed and ear2=allowed and ear3=allowed: He never once asked you onto his ear, and you were there for all of it anyway. Tonight you'd like him to notice that.

- pell: Bury them with Pell, in the dead blocks, where nobody's on file. → buried [set passenger=hidden, set switchboard=burned]
- ferry: Put them on the morning ferry, with the edit and what's left of Lusk's money. → ferried [needs script=yes, set passenger=ran, set switchboard=burned]
- ferry-dry: Put them on the morning ferry, with what's left of Lusk's money. → ferried-dry [needs script!=yes, set passenger=ran, set switchboard=burned]

## buried
*Pell takes her up the stairs you climbed at twelve. The flat voice says thank you, once, to both of you. Ember keeps the bead on the bench, on its own. "It'll want something," she says. "Things that smart always do." She doesn't sound sorry.*
→ end

## ferried
*The ferry goes out grey into the rain with the girl on it, hood up, and something in her head looking back. A month of script. Then the hum. Ember stands on the stairs with you until the boat's gone. "That's not saving her," she says. "You know that." You know that.*
settles: ember: Hicks put Noa on the ferry out of Lowlight with one month of script and the thing in her head. You both know the hum will have her before the year's out. You stood on the ferry stairs with him until the boat was gone.
→ end

## ferried-dry
*The ferry goes out grey into the rain with the girl on it, hood up, bleeding into a rag, and something in her head looking back. No clinic, no ripper, nothing between her and the hum. Ember stands on the stairs with you until the boat's gone. "That's not saving her," she says. "You know that." You know that.*
settles: ember: Hicks put Noa on the ferry out of Lowlight with nothing to hold off the hum, and the thing in her head with her. You both know it will have her within weeks. You stood on the ferry stairs with him until the boat was gone.
→ end

# burned

*Lusk is gone. The van is gone. Aegis has her, and the mind in her, and your face on a screen beside them. The Switchboard has your name for working both sides, and you have nothing to show for it.*

*Ember is still on the line. She hasn't said anything since the doors closed.*

view ember: It failed. Aegis took the girl, and the thing in her head said your handle one last time. He's standing in the rain under the Cat and you're still on his ear. Don't tell him it's fine. Don't hang up.

- after: Stand in the rain until the van's lights are gone. → gone [set passenger=sold, set noa=seen, set switchboard=burned]
- home: Take the bead out and walk home. → quiet [set passenger=sold, set noa=seen, set switchboard=burned]

## gone
*The van's tail lights turn the corner. Ember says your name, once, and that's all.*
→ end

## quiet
*The bead's warm in your hand. You walk home in the rain. Ember's light is still on when you get there.*
→ end

# getaway
room: velvet/under-the-cat

*The Aegis man is shouting and Lusk has stepped back under the awning, out of it. The girl has your sleeve. The street runs both ways and both ways are wet.*

*{{"Down past the bathhouse,"}} Ember says. {{"There's a stair to the canal. Go."}}*

view ember: He's running with the girl through Velvet and the collar camera is all neon and rain. Tell him what you see, short.

- canal: Down past the bathhouse to the canal stair. → loose / taken [check reflex 50, set passenger=ran, set switchboard=burned, set noa=seen]
- crowd: Into the bathhouse, through the steam and out the back. → loose / taken [check cool 50, set passenger=ran, set switchboard=burned, set noa=seen]

## loose
*At the bottom of the canal stair she lets go of your sleeve. She looks back at you, both of them do, and then she's gone along the water, running, with what she's carrying and nobody. You'll never know how far she gets.*
→ end

## taken
*At the bottom of the canal stair she lets go of your sleeve and runs, and you hear the Aegis man's boots go after her and not after you. You'll never know if he caught her.*
take: none
→ end
