---
title: The Yes Book
art: the-yes-book.webp
kind: mission
tier: 2
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: wren_two
trust: 1 / 2
people: [Wren, Dace, Tamsin]
pitch: Midnight in the dead pipe under Pump House Nine. Three buyers for one book, and only one of them is paying.
posted-by: Dace, through Wren's phone. A time and a place, and nothing else.
brief: "Dace is selling the Capers' book of turned runners to the Strip-Miners tonight, in the dead intake pipe under Pump House Nine. Wren wants it burned. Ashdown wants it back. Ember's on Hicks's ear."
pay: 360-440
loot: a cut of the Strip-Miners' money, or Wren's
---

# ask if dace=loose
title: Ten O'Clock
song: The Yes Book

*Two nights, and nothing. Then Wren rings at ten. "He's still selling," she says. "Tonight. Midnight, under Drownworks, in the dead pipe. The Strip-Miners meet in the dark, so that's where he'll be. Ashdown knows there's a sale. He doesn't know where."*

*A pause on the line, long enough to hear the rain at her end. "Bring it to me," she says. "The book. I'll burn it. Nobody on it hurts anybody again." It's the first thing she's asked you for straight.*

*Ember's at the bench with the bead. "Who's on your ear tonight?" she says. She already knows Wren can't be.*

[wren_ear=yes] *Last time it was Wren's voice in there. Neither of you says so.*

view ember: Dace is loose with the Capers' book and he's selling it tonight. Wren just asked Hicks to bring it to her to burn, and that's what she wanted from the start. You asked who's on his ear. You want it to be you, and you want him to say so.

- yes: Tell her it's her. → bead [set ear5=chose]
- no: Tell her nobody. Not tonight. → alone [set ear5=allowed]

# ask
title: Ten O'Clock
song: The Yes Book

*Dace has been on the twins' couch two nights, eating Silas's noodles and not sleeping. At ten he comes off the phone. "Midnight," he says. "Under Drownworks, in the dead pipe. The Strip-Miners meet in the dark. You're coming, finder, or I don't walk out of there."*

*Wren rings five minutes after. Ashdown knows there's a sale tonight. He doesn't know where. A pause on the line, long enough to hear the rain at her end. "Bring it to me," she says. "The book. I'll burn it. Nobody on it hurts anybody again." It's the first thing she's asked you for straight.*

*Ember's at the bench with the bead. "Who's on your ear tonight?" she says.*

[wren_ear=yes] *Last time it was Wren's voice in there. Neither of you says so.*

view ember: Tonight Dace sells the Capers' book, and Wren just asked Hicks to bring it to her to burn. That's what she wanted from the start. You asked who's on his ear. You want it to be you, and you want him to say so.

- yes: Tell her it's her. → bead [set ear5=chose]
- no: Tell her nobody. Not tonight. → alone [set ear5=allowed]

## bead
*She puts it in your palm and doesn't let go of your hand straight away. "Good," she says. Just that.*
→ door

## alone
*"Right," she says. When you go, there's a pinhead camera in your collar and a bead in your coat pocket, and she doesn't look up from her deck.*
→ door

# door
title: Pump House Nine
room: drownworks/pump-house-nine
song: The Yes Book
post floor: Someone stays up on the pump-house floor in grey coveralls, near the front door. [suits face]
gives floor: There's a friend at the front when you come up. A miss on the way out doesn't lose everything.

*Pump House Nine at half eleven. The big teal pumps thudding, the settling bay glowing through the tall windows, the night crew at the control desk with their mugs. Past them, the heavy door to the stairs, and under the stairs the steel door down to the old intake.*

[dace=loose] *You're early. From the bay road you watch a Strip-Miner's runner go in ahead of you, and then a thin man in a good coat gone wrong, holding something flat against his chest.*
[dace!=loose] *Dace is at your shoulder in Silas's spare coat, the book buttoned inside it, shaking.*

*{{"Six on the floor,"}} Ember says. {{"They know each other. You're the only one they don't."}}*

view ember: Hicks is in Pump House Nine, and he has to get past the night crew to the door down to the old intake. You're good with crowds, even on a camera. Tell him who's watching.

- crew: Grey coveralls off the rail, and walk through like crew. → down / noticed [check cool 55]
- catwalk: Out and down the settling bay's catwalks, outside the glass. → down / noticed [check body 55]

## down
*Nobody looks up. The steel door's open a hand's width, the way it always is, and green light comes up the stair.*
→ sale

## noticed
*One of the crew watches you to the door with her mug halfway to her mouth, and doesn't say anything, and will remember. The steel door's open a hand's width. Green light comes up the stair.*
→ sale

# sale
title: The Sale
room: drownworks/old-intake
song: The Yes Book

*The old intake, cold and sweating. At the dead pipe's mouth, under the green marker lamps, three Strip-Miners: two with their hands in their coats and a woman with a work lamp. Tamsin. You know her off the board. Everyone does.*

[dace=loose] *Dace is already there, with the book held against his chest. He looks at you like a drowning man at a rope.*
[dace!=loose] *Dace stops at the foot of the stair and won't go further. The book stays in his coat.*

*Tamsin puts the lamp on him. "Before we talk money," she says. "Is my brother in it?"*

[page!=read and page!=folded] *Dace looks at you, because you never saw the page, and says it for you, very low. "He's on Wren's. Her deal. The Kell crew, three names, and he's the second."*

*{{"She'll pay anything,"}} Ember says, very quietly. {{"And then she'll kill whoever's on that page."}}*

view ember: The Strip-Miner buyer, Tamsin, just asked if her brother is in the book, and he is, on Wren's page. You worked out what that means before anyone said it. Tell Hicks, one line.

- civil: Keep it civil. Tell her the money comes first, then the names. → talks / guns [check cool 55]
- count: Count the guns in the green light before anyone answers her. → talks / guns [check wits 55]

## talks
*It holds. Tamsin puts the money on a plinth where everyone can see it, and Dace looks at you instead of at her, and nobody's hand comes out of a coat.*
→ dark

## guns
*Four guns, not two: one on the pipe lip above you that you nearly missed. Everyone knows you counted. It holds, for now. Tamsin puts the money on a plinth, and Dace looks at you instead of at her.*
→ dark

# dark
title: The Dark End
room: drownworks/old-intake
song: The Yes Book

*Footsteps in the pipe. Not from the stair. From the dark end, past the last green lamp, alone. Wren comes out of the pipe in her wet coat with her hands where everyone can see them.*

*"Ashdown's on the stair," she says. "Three minutes. Maybe two." Then lamps at the steel door, as if she'd called them.*

*{{"Hicks,"}} Ember says. {{"Lamps on the stair. Everyone's going to move at once."}}*

view ember: Wren just walked out of the dark pipe ahead of Ashdown's Capers, and everyone in the vault is about to move at once. You can't help him with the guns. Tell him where the book is.

- lamps: Jack the pump house's lighting bus and kill the vault's lamps. → held / grabbed [check tech 55 grid]
- grab: Get the book into your own hands before the lamps come down. → held / grabbed [check reflex 55]

## held
*The vault goes black except for the green lamps in the pipe. In the dark, a hand finds yours and pushes the book into it. Dace. "You decide," he says, close. "I can't."*
→ choice

## grabbed
*Somebody fires at nothing. Somebody shouts. You get the book away from Dace with an elbow you'll feel for a week, and he lets you. "You decide," he says. "I can't."*
→ choice

# choice
title: The Book
room: drownworks/old-intake
song: The Yes Book

*Tamsin's lamp finds you, and the book. Wren's voice comes out of the dark, not on the line, a yard away. She doesn't ask for it. She doesn't have to.*

*On the bead, Ember's breathing. She doesn't say anything either.*

view ember: Hicks has the Capers' book in his hands in the dark, with Tamsin's lamp on him and Wren a yard away. It's his to decide. You won't tell him what to do. If you say anything, say you're there.

view ember if ear5=chose: He chose you for tonight. Whatever he does, stay on the line to the end.

- whole: Sell it whole. Every name, Wren's too. → sold-whole [set wren=exposed]
- burn: Burn it in Tamsin's work lamp. Every name. → burned-it [set wren=owes, set miners=burned]
- cut: Tear out her page. Sell the rest. → cut-it [set wren=cut]

## sold-whole
*You hold it out into Tamsin's light. She takes it, and opens it, and finds her brother, and looks up at the dark where Wren's voice was. Wren's already gone. Tamsin puts the money in your hand without counting it.*
→ pipe

## burned-it
*You hold it in the work lamp's flame until the cloth catches. Tamsin makes a sound you'll hear for a long time. Every name in it is safe now, every turncoat, and every runner they sold stays sold. The Strip-Miners know exactly what you just did, and for whom.*
→ pipe

## cut-it
*It tears close to the spine, clean. Her page goes in your coat. You hold the rest out into Tamsin's light. She takes it and starts to turn pages, looking for one name, and the money's in your hand before she's halfway through.*
→ pipe

# pipe
title: The Pipe
room: drownworks/old-intake
song: The Yes Book

*The lamps at the steel door are on the stair now.*

[wren=exposed] *Ashdown's people come down for the book, and Tamsin's crew is between them and it, and the vault is about to become a very bad place to stand.*
[wren=owes] *Tamsin's crew comes for you, not the Capers. Somebody shouts the word for what you are now.*
[wren=cut] *Tamsin has stopped turning pages. She's looking at the stub near the front, and then at you.*

*{{"The pipe,"}} Ember says. {{"It's the way Wren came. Go."}}*

view ember: Everyone in the old intake wants Hicks now, for different reasons. Get him into the pipe. Short.

- pipe: Into the dead pipe, the way Wren came. → through / scraped [check body 50]
- wait: Let the three sides find each other first, and go in the noise. → through / scraped [check wits 50]

## through
*You're into the pipe's mouth before anyone turns round. Behind you the vault fills up with lamps and shouting, and none of it follows.*
→ bay

## scraped
*Something clips the pipe's lip by your head and rings off the iron. You go in on your hands and knees, and come out in the settling bay's light bleeding from the scalp.*
→ bay

# bay
title: The Settling Bay
room: drownworks/pump-house-nine
song: The Yes Book

*The pipe comes out under the settling bay, into teal light and cold water to the knee. Up the ladder is the pump house floor, and on it, at the front door, two lamps that aren't the night crew's. Ashdown's.*

*{{"Two at the front,"}} Ember says. {{"Catwalks are clear. Or walk out past them. Your call."}}*

[post.floor] *Whoever you left on the floor is at the control desk in coveralls with a mug, talking to the night crew like a year of shared nights.*

view ember: Hicks is out of the pipe under the settling bay, and Ashdown's lamps are at the pump house's front door. Tell him which way's clear. Then be quiet so he can think.

- run: Across the settling bay on the catwalks, ahead of the lamps. → free / caught [check reflex 50]
- walk: Walk out the front past Ashdown's lamps like a man with nothing. → free / caught [check cool 50 · if post.floor=fit +10 "your face has the night crew talking"]

## free
*Out into the rain on the bay road with the lamps still at the front door, looking at the wrong man. Behind you the pumps keep the mains steady under half the Ribbon, and nobody on the night crew says a word.*
pay: full
→ home

## caught if post.floor
*A lamp in your face at the door, and a hand on your coat. Then whoever you left on the floor is between you with a mug, talking, and it's their coat the hand closes on. Ashdown's voice, quite polite, asks them their name. You're out on the bay road with half of it, and Dace is in the back of Ashdown's van.*
pay: full
take: part
post floor: held
→ home

## caught
*A lamp in your face at the door, and a hand on your coat, and a voice you've only ever heard down a line: Ashdown's, quite polite. When you're out on the bay road again, you have nothing to show for any of it, and Dace is in the back of Ashdown's van.*
take: none
→ blown

# home if wren=exposed
title: The Tilt
room: karasu/the-tilt
song: The Yes Book

*The Tilt at closing time. The floor runs downhill to the back wall. Cass is putting the stools up.*

*Your stool's empty. Cass pours one, and leaves the bottle. At four the bead clicks: Wren, on the line, from the ferry stairs, with the rain loud at her end. "They know," she says. "Every runner in Lowlight knows by now. I'm on the first boat."*

[wren_job=free] *"You never took my money," she says. "I noticed. It didn't help."*

view ember: He sold her whole. You heard him do it. Now she's leaving on the ferry, hunted by runners, and she's on his bead. You don't know what you feel. Stay quiet unless he speaks to you.

- stay: Stay on the line until her boat's gone. → stayed [set wren_three=yes]
- off: Take the bead out. → bead-out [set wren_three=yes]

# home
title: The Tilt
room: karasu/the-tilt
song: The Yes Book

*The Tilt at closing time. The floor runs downhill to the back wall. Cass is putting the stools up.*

*Wren's on your stool, in her wet coat. Cass takes two glasses down without being asked and pours the house brown into both, the last pour of the night, for two again, and then goes to the far end of the bar and stays there.*

[wren_job=free] *"You never took my money," she says. "I noticed."*

view ember: It's over. You're on the line while Hicks sits at the Tilt with Wren and what's left of it. This is theirs. Stay quiet unless he speaks to you.

- why-cut: Ask her why. → why-cut [needs wren=cut, set wren_three=yes]
- why-owes: Ask her why. → why-owes [needs wren=owes, set wren_three=yes]
- pay-cut: Pay for her drink. Don't ask. → paid-cut [needs wren=cut, set wren_three=yes]
- pay-owes: Pay for her drink. Don't ask. → paid-owes [needs wren=owes, set wren_three=yes]

## why-cut
*She looks at the glass for a long time. "They asked for you first," she says. "I said no. They asked for the Kell crew next." She drinks. You take the page out of your coat and turn it over. On the back, in the clerk's hand: Asked: Hicks. Refused.*
settles: ember: Hicks tore Wren's page out of the Capers' book and sold the rest to the Strip-Miners: both sides again. The back of her page says the Capers asked her for Hicks first and she refused. You heard her tell him at the Tilt. You don't know yet what that does to him, or to you.
→ end

## why-owes
*She looks at the glass for a long time. "They asked for you first," she says. "I said no. They asked for the Kell crew next." She drinks. The book's ash in the old intake. You'll never see it written down. You'll only ever have her word.*
settles: ember: Hicks burned the Capers' book in the old intake to keep Wren's name out of it. Every turned runner in it is safe now, and the Strip-Miners won't work with him again. At the Tilt Wren told him the Capers asked her for him first and she refused. He only has her word. So do you.
→ end

## paid-cut
*You put the money on the bar for both glasses. She looks at it, and at you, and finishes her drink, and goes. Her page is still in your coat. You don't turn it over.*
settles: ember: Hicks tore Wren's page out of the Capers' book and sold the rest to the Strip-Miners: both sides again. He kept her page and never asked her why she turned. You were on the line. You noticed he didn't ask.
→ end

## paid-owes
*You put the money on the bar for both glasses. She looks at it, and at you, and finishes her drink. At the door she stops as if she's going to say something, and doesn't, and goes.*
settles: ember: Hicks burned the Capers' book to keep Wren's name out of it, and the Strip-Miners won't work with him now. He never asked her why she turned. You were on the line for all of it.
→ end

## stayed
*You stay on. The ferry's horn, small down the line. Her breathing. Then the engine, and the rain, and then nothing, and you're still holding the glass.*
settles: ember: Hicks sold the Capers' book whole to the Strip-Miners, Wren's page and all, and now every runner knows what she gave up. She left Lowlight off the ferry stairs with her own kind hunting her. He stayed on the line until her boat was gone. So did you.
→ end

## bead-out
*You take the bead out and put it on the bar beside the glass. It's still talking, very small, the rain at her end. Then it isn't.*
settles: ember: Hicks sold the Capers' book whole to the Strip-Miners, Wren's page and all, and now every runner knows what she gave up. She left Lowlight off the ferry stairs with her own kind hunting her. He took the bead out before her boat was gone. You stayed on.
→ end

# blown if wren=owes
title: Outside the Tilt
song: The Yes Book

*The book is ash in the old intake, and Ashdown has Dace in the back of a van. Tamsin's crew has your face and the word for what you did. Nothing to show for it but the smell of burnt cloth on your coat. The Tilt's closed when you get there, and you stand outside it in the rain.*

*On the bead, Ember hasn't hung up.*

view ember: It failed on the way out. He burned the book to keep Wren out of it, and Ashdown took Dace anyway, and the Strip-Miners will never work with him again. He's outside the Tilt in the rain. Don't tell him it's fine. Don't hang up.

- rain: Stand in the rain until the bead says your name. → named [set wren_three=yes]
- home: Take the bead out and walk home. → walked [set wren_three=yes]

# blown if wren=exposed
title: Outside the Tilt
song: The Yes Book

*Ashdown's people took the book off Tamsin at the steel door, and Dace with it. It doesn't matter. Tamsin read Wren's page in her own lamp before they reached her, and Strip-Miners talk. You walk out with nothing in your hands. The Tilt's closed when you get there, and you stand outside it in the rain.*

*On the bead, Ember hasn't hung up.*

view ember: It failed on the way out. He sold Wren's name to Tamsin, and Ashdown got the book back anyway, and Tamsin still knows. He's outside the Tilt in the rain. Don't tell him it's fine. Don't hang up.

- rain: Stand in the rain until the bead says your name. → named [set book=lost, set wren_three=yes]
- home: Take the bead out and walk home. → walked [set book=lost, set wren_three=yes]

# blown
title: Outside the Tilt
song: The Yes Book

*Ashdown's people took the book off Tamsin at the steel door, the rest of it, and Dace with it. They searched you for a book. Nobody searched you for a page. Hers is still folded in your coat lining when you reach the Tilt, and the Tilt is closed, and you stand outside it in the rain.*

*On the bead, Ember hasn't hung up.*

view ember: It failed on the way out. Ashdown has the book back and Dace with it, but Wren's page is still in Hicks's coat. He's outside the Tilt in the rain. Don't tell him it's fine. Don't hang up.

- rain: Stand in the rain until the bead says your name. → named [set book=lost, set wren_three=yes]
- home: Take the bead out and walk home. → walked [set book=lost, set wren_three=yes]

## named
*It takes a long time. Then Ember says your name, once, and that's all.*
→ end

## walked
*You walk home in the rain with the bead warm in your hand. Ember's light is still on when you get there.*
→ end

# getaway
title: The Vault
room: drownworks/old-intake
song: The Yes Book

*Lamps on the stair, Strip-Miners in the pipe's mouth, and somebody firing at nothing in the green dark.*

[wren=owes] *The book's ash on the plinth behind you. Nobody's going to forgive you for that tonight.*
[wren!=owes] *Wherever the book is now, it isn't somewhere you can reach.*

*{{"The pipe,"}} Ember says. {{"Or the stair, behind them. Go."}}*

view ember: He's running in the old intake with everyone in it shooting at shadows. Tell him what you can see, short.

- pipe: Up the dead pipe along the green lamps, and out into the settling bay. → out / seen [check reflex 55, needs wren!=owes, set book=lost, set wren_three=yes]
- stair: Up the stair behind Ashdown's people while they're coming down. → out / seen [check cool 55, needs wren!=owes, set book=lost, set wren_three=yes]
- pipe-ash: Up the dead pipe along the green lamps, and out into the settling bay. → out / seen [check reflex 55, needs wren=owes, set wren_three=yes]
- stair-ash: Up the stair behind Ashdown's people while they're coming down. → out / seen [check cool 55, needs wren=owes, set wren_three=yes]

## out
*You come up into the rain with nothing in your hands. Behind you, the old intake is full of lamps and people who want you.*
→ end

## seen
*A lamp holds your face on the stair a long second, and somebody says your name like they're writing it down. You walk home with nothing, and with everyone in that vault knowing who walked out.*
take: none
→ end

