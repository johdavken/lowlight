---
title: Arrears
art: arrears.webp
kind: mission
tier: 2
template: true
with: [rue]
for: soren
bars: field-deck
once: true
starts: rue-hab
after: rue_one and trust>=mid
trust: 1 / 2
pitch: Nine thousand sol of a dead man's rent has a new owner. She wants to see the paper.
pay: 360-440
loot: what's in the broker's cash box
---

# notice if cover=cracked

*She doesn't let you past the top of the stair. There's a printed notice taped to the door, and she pulls it off and holds it out at arm's length.*

*"You," she says. "I know what you are, so don't. The landlord's sold my father's arrears. Nine thousand, to something called Graymark Receivables, off a stall on the deck market. Is that you people? I'm going to find out either way. You can come and help me do it, and I'll listen to you lie the whole way down."*

view rue: This follows from the night at Kestrel's yard, when you heard him call the branch. You know what he is. You came to him because he's the only way to see inside it, and you hate that. He doesn't get to be kind to you. Ask him one thing at a time.

- come: Say you'll go. → going
- ask: Ask what she'd do with the paper. → asked

# notice if stamp=told

*She lets you in. There's a printed notice on the crate, weighted with a dead cart, and the run sheet's folded beside it.*

*"You told me what that stamp was," she says, "so here's the next one. The landlord's sold my father's arrears. Nine thousand, to something called Graymark Receivables, off a stall on the deck market. Is that you people?"*

view rue: This follows from Kestrel's yard: you asked for a sheet, he got it, and he told you the truth about the stamp when he didn't have to. You don't like how much that counted. You still think he might own your debt.

- come: Say you don't know, and you'll find out. → going
- ask: Ask what she'd do with the paper. → asked

# notice

*She lets you in. There's a printed notice on the crate, weighted with a dead cart.*

*"Audit," she says. "That's what you told me. Here's another one for you to audit. The landlord's sold my father's arrears. Nine thousand, to something called Graymark Receivables, off a stall on the deck market. Does Kestrel do debt now?"*

view rue: This follows from Kestrel's yard: he got you the sheet and told you the stamp was an audit mark, and you didn't believe him. You're giving him another chance to lie to you, and you'll keep count.

- come: Say you'll find out who they are. → going
- ask: Ask what she'd do with the paper. → asked

## going
*She's already got the jacket on. "Not with me," she says. "On your ear. I'll take the stall's lacquer and you take the stall."*
→ market

## asked
*"Hold it," she says. "That's all. Nobody's ever let me see one thing I owe." She picks up her deck. "On your ear. I'll take the stall's lacquer and you take the stall."*
→ market

# market
room: spine/deck-market

*The deck market runs between the pylons on a floor of welded plate, a mile of tarps and wet light with the Spine going over like weather. Graymark Receivables is a card taped to a stall that sells phone screens. The man behind it has a good coat and doesn't sell any phone screens.*

view rue: You're on the line, and in the stall's little grid, which is badly kept. This is the same trouble as the notice on your door. You're quick when you're scared, so you talk more than you mean to.

- watch: Buy a screen and watch who comes to him. → placed / marked [check wits 55]
- tail: Lose yourself in the crowd and follow his runner down the row. → placed / marked [check reflex 55]

## placed
*Two people bring him envelopes and nobody takes one away. Behind the tarp there's a shipping box with a door in it, and that's where the paper goes.*
→ tarp

## marked
*You get the box, the door and the envelopes. You also get a long look from the man in the coat, who's seen a lot of people pretending to buy phone screens.*
→ tarp

# tarp
room: spine/deck-market

*Between the stall and the box stands a big woman on a folding chair, eating noodles out of a tin. She's the reason nobody's robbed it.*

- talk: Sit down beside her and tell her you've come about a debt. → past / shoved [check cool 55]
- move: Put her in the tarp and be through the door before she's up. → past / shoved [check body 55]

## past
*She looks you over and goes back to the tin. You've got four minutes, and she's counting them.*
→ box

## shoved
*You get through. The noodles go across the plate and half the row looks round.*
→ box

# box
room: spine/deck-market

*Inside: a folding table, a cash box, two steel drawers of paper and one old grey terminal. Two thousand debts, maybe. Every one's a person.*

*{{"I've got the terminal open,"}} she says, {{"and I can't read it. It's indexed by something that isn't names."}}*

view rue: You're in Graymark's terminal and it's indexed by case number, not name. You've never seen numbers like these, and he might have. If he reads them easily, you notice.

- index: Read the index. You know this numbering. It's the branch's. → drawer / lost-time [check tech 55 grid]
- think: Work out how a debt man files, and go to the drawer by hand. → drawer / lost-time [check wits 55]

## drawer
*Lysenko's in the second drawer, nine thousand two hundred and six, and clipped to it a slip with a case number you assigned yourself. Graymark bought her father's rent because you asked for a read on what she owes. You remember signing the request. It took about a minute.*
→ stair

## lost-time
*It takes too long, and it's in the second drawer. Nine thousand two hundred and six, and clipped to it a slip with a case number you assigned yourself. Graymark bought her father's rent because you asked for a read on what she owes. You remember signing the request. It took about a minute.*
→ stair

# stair
room: spine/catwalk

*Out by the back of the box and up the service catwalk, cash tin under your arm, the note inside your shirt. The man in the good coat is on the plate below you with a phone at his ear, and he's stopped pretending.*

- run: Run the catwalk to Forty-One and drop onto the stair. → above / spotted [check reflex 50]
- stand: Stand still against the girders in the wet and let him look past you. → above / spotted [check body 50]

## above
*He looks the wrong way for just long enough.*
→ line

## spotted
*He sees you, and he's got a phone, and now it's a race to the pylon.*
→ line

# line
room: spine/catwalk

*The stair's in sight. So is the second man, coming along the catwalk from Forty-One with his hands out of his coat. The note's against your skin. The whole of her father's rent weighs about what a letter weighs.*

*{{"Have you got it?"}} she says. {{"Tell me you've got it."}}*

view rue: You can hear the catwalk ringing under him, and you can't help him from here. You want that paper more than you've ever let anyone hear you want anything.

- talk: Hold up a Kestrel badge and ask him for directions, tired, and keep walking. → through / taken-off [check cool 50, set rue_two=yes]
- wipe: Put his phone to sleep with your deck and go past him in the dark. → through / taken-off [check tech 50 grid, set rue_two=yes]

## through
*He goes past you. The stair moves under your feet like it always does.*
pay: full
→ hand

## taken-off
*He's stronger than he looks. The cash goes, and the note with it, all but the slip that came away in your fist. The stair moves under your feet. You've got a case number in your hand, and it's yours.*
take: none
→ short

# hand

*She's standing at the top of the stair. You've wiped ledgers before. You did it at nineteen, for two hundred and twelve households, and you could do this one on her crate in ten minutes. You know what it cost you to be given that.*

*You take out the note. The slip's still clipped to it.*

view rue: He has the paper in his hand and you haven't seen what's on it. You're frightened of what he's about to offer. If he gives it to you to hold, that's the first thing anyone's ever given you without a price on it, and you'd check it twice. If he makes it go away for you, you've been bought, however kind it is.

- give: Put it in her hand, with the slip, and tell her whose number that is. → hers [set note=truth]
- slip: Take off the slip. Then give it to her. → slip [set note=hers]
- wipe: Tell her you can make it go away, tonight. → gone [set note=wiped]

## hers
*She reads it standing up. Then the slip. She doesn't look at you for a long time. "You asked for this," she says. "You." She holds onto it with both hands. There's someone waiting on the stair, someone who works the market, who saw you in the box and has been looking for someone to work for. You've got two now.*
gives: recruit ears hand
→ end

## slip
*She reads it standing up, and she holds onto it with both hands. The slip's in your pocket, about the size of a tram ticket. There's someone waiting on the stair, who saw you in the box and has been looking for someone to work for. You've got two now.*
gives: recruit ears hand
→ end

## gone
*She looks at you as if you've hit her. "That's it, then," she says. "That's what it is. That's how it starts." She takes the note out of your hand and goes inside. There's someone on the stair, who saw you in the box and has been looking for someone to work for. You've got two now.*
gives: recruit ears hand
→ end

# short

*She's standing at the top of the stair, and you've got nothing to give her but a slip with a number on it.*

view rue: He went for the paper and came back without it. Whatever he tells you now, the debt's still out there with someone else's name on it. You don't know yet what he's holding.

- show: Put the slip in her hand and tell her whose number that is. → shown [set note=truth]
- pocket: Say you lost it. Keep the slip. → pocketed [set note=lost]

## shown
*She reads it. It's a small thing to be that heavy. She shuts the door without slamming it, and that's worse.*
→ end

## pocketed
*She says nothing. She goes in. The slip stays where it is, and you go on knowing what's on it.*
→ end

# getaway
room: spine/catwalk

*Both of them now, and a third on the plate. There's no talking this one down. The note's in your shirt and the catwalk's running out.*

- drop: Go over the rail and drop to the cable stair. → away / dropped [check reflex 55, set rue_two=yes]
- call: Call Garro and get the catwalk closed. → away / dropped [check cool 55, set rue_two=yes, set cover=cracked]

## away
*You get clear, and you hurt, and it's your own stair. The note's torn across, but it's all there.*
→ end

## dropped
*You come down hard, without the paper, and they keep it. It's still out there, and now they know someone wanted it.*
take: none
→ end
