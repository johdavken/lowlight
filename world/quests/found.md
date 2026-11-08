---
title: Found
kind: mission
tier: 1
take-size: 4
template: true
with: [ember]
for: hicks
once: true
starts: zhou-flat
after: null
trust: 1 / 2
pitch: Somebody from the dead blocks has turned up on the grid, and she sent for you by hand.
posted-by: Pell, on the Sixth Floor. Paper, carried by hand.
brief: "A woman from the dead blocks is on a list she should never have been on. She sent for Hicks by hand, and Ember's on his ear whether he likes it or not."
pay: 90-110
loot: a demolition survey's tenant page
---

# ask

*The note comes the Old Town way: folded paper, carried up four flights by a dead-blocks runner who wouldn't come past the Zhous' door. Your name on the outside in pencil. Inside, three words: Pell says come.*

*Nobody's sent for you like that since you were twelve.*

*Ember has read it over your shoulder, because she always does. She's already pulling a bead and a pinhead camera for your collar out of the junk bowl on the workbench. "You're going into the dead blocks at night with nobody on your ear," she says. "No. I'm on your ear. Don't make the face."*

view ember: Hicks just got a paper note from Old Town and went quiet in a way you've never seen. You don't know who Pell is. You do know he's run with nobody in his ear since his operator, and you think that's stupid and you've never said so. You're not asking. Joke about it if he pushes back, but you're coming on the line.

- yes: Take the bead. → bead
- no: Tell her you work alone now. → alone

## bead
*You put it in. It's warm from her hand. She grins like she's won something, and you suppose she has.*
→ wall

## alone
*"Sure," she says, and clips the camera to your collar anyway while you're doing up your coat, and drops the bead in your pocket. You find the bead at the foot of the stairs. You put it in.*
→ wall

# wall
room: karasu/dead-blocks

*Old Town at the back end of the night. The paying block's windows are warm behind their blinds, and across the broken wall the tower is dark except for one lantern up high. There's a drum fire at the foot of the stairwell, and three people round it who stopped talking when you came round the corner.*

*{{"Is that the place? It looks like nobody lives there,"}} Ember says. {{"Oh. That's the point, isn't it."}}*

view ember: You're on his ear, and the camera on his collar shows you what he's facing. You can hear the fire crackling and nobody talking. You've never been past the dead blocks' wall and you'd like to know everything. Keep it to one question at a time. You're listening for whether he answers you, more than for what he says.

- fire: Walk up to the fire and give them your name, the one they knew you by. → past / doubted [check cool 50]
- over: Skip the fire. Up the rubble and through the gap under the hanging sheet. → past / doubted [check body 50]

## past
*An old man at the fire looks at you for a long time, then nods at the stairwell. Nobody says anything. In the dead blocks that's a door held open.*
→ sixth

## doubted
*Somebody at the fire says a name that isn't yours, a kid's name, and laughs, and doesn't mean it kindly. You climb the stairwell with three sets of eyes on your back and your face going hot.*
→ sixth

# sixth
room: karasu/sixth-floor

*Pell is smaller than she was. She sits you in the armchair, which is hers, and puts a paper in your lap. It's a page off a demolition survey: the tower, floor by floor, with a name against every flat. Hers is on the sixth. There's a photograph of her beside it.*

*"I've been nobody for forty years," she says. "Somebody wrote me down."*

*There's a survey relay bolted inside the stairwell door, new, with a blinking eye. The contractor's crew comes back up for it at six.*

view ember: You're listening to an old woman tell Hicks she's been nobody for forty years, and to him being gentler than you've ever heard him. There's a survey relay on her stairwell, and you can talk him through it if he lets you. Don't do it for him. Notice if he asks.

- relay: Jack the survey relay and go through its lacquer to her line. → read / rough [check tech 50 grid]
- page: Sit with her ledgers and the page until you see where her name came from. → traced / slow [check wits 50]

## read
*It's there. Sixth floor, one name, one face, waiting for the six o'clock upload. And the photograph was taken from inside this room, from the armchair you're sitting in.*
→ stair

## rough
*It takes too long and you have to ask Pell things she doesn't want to answer. But it's there. Sixth floor, one name, one face, waiting for the six o'clock upload. And the photograph was taken from inside this room, from the armchair you're sitting in.*
→ stair

## traced
*The photograph on the page gives it away. It was taken from inside this room, from the armchair you're sitting in. Whatever the relay on the stair is holding goes up at six, with her in it.*
→ stair

## slow
*It takes too long, and you have to ask Pell things she doesn't want to answer. But the photograph on the page gives it away: it was taken from inside this room, from the armchair you're sitting in. Whatever the relay on the stair is holding goes up at six, with her in it.*
→ stair

# stair
room: karasu/sixth-floor

*Somebody sat in that chair and took her picture, and Pell knows who sits in her chair. She's gone quiet. Down the stairwell there are boots and a work lamp swinging, an hour early.*

*{{"Hicks,"}} Ember says. {{"There's people on the stairs. Hicks, are you there?"}}*

view ember: There are boots on the stairs and he's stopped talking to you, the way he stops talking when he's hurt. You've worked out the photo was taken from inside her flat, and you think he has too. Get his attention. Don't joke now.

- roof: Tear the relay off the wall and take it up through the hole in the ceiling. → clean / taken [check reflex 50, set hicks_one=yes]
- hold: Stand in the curtain while the relay wipes, and don't let the lamp past. → clean / taken [check body 50, set hicks_one=yes]

## clean
*Her line goes out of the relay like a held breath, and the six o'clock upload goes up without a sixth floor on it. The crew finds a dead box on a wall and swears at it. Pell puts a roll of old notes in your coat pocket and won't hear about it.*
pay: full
→ home

## taken
*The lamp gets past you. A man in a contractor's vest gets a good look at your face and a better one at Pell's, and the relay goes back on its bolts, blinking. At six the survey goes up with her on it.*
take: none
→ listed

# home

*Back at the Zhous' you take the bead out and turn it over in your fingers. Ember's sitting on the workbench with her boots swinging, waiting for you to say something.*

*"You talked to me," she says. "Twice. I counted."*

view ember: He's back, he's safe, and he let you in his ear for a whole night. You don't know what that cost him and you won't ask. You'd like to keep doing it. Say so plainly, once. If he gives the bead back, take it, and don't let him see it matters.

- keep: Tell her to keep a bead on the bench for you. → kept [set ember_ear=yes]
- back: Hand it back. Say it was a one-time thing. → returned [set ember_ear=no]

## kept
*She puts it in the bowl on the bench, on its own, away from the junk. Down on the landing the runner who carried Pell's note has come up past the door at last, and gives a name for the first time: {hire}. Pell says you look after people, and the dead blocks have ears nobody's paying.*
gives: recruit ears green
hire-pitch: Pell says you look after your people. I hear everything in the dead blocks, and nobody's paying me for it.
→ end

## returned
*She takes it back without a word and drops it in the junk bowl with the rest. Down on the landing the runner who carried Pell's note has come up past the door at last, and gives a name for the first time: {hire}. Pell says you look after people, and the dead blocks have ears nobody's paying.*
gives: recruit ears green
hire-pitch: Pell says you look after your people. I hear everything in the dead blocks, and nobody's paying me for it.
→ end

# listed

*Back at the Zhous' you sit on the couch where you used to sleep and don't take your coat off. Somewhere a demolition firm has Pell's name and face, and yours beside it in a contractor's report. The dead blocks will know by tomorrow who came up the stairs.*

*Ember sits next to you. "You talked to me," she says. "Right up until you didn't."*

view ember: The job went wrong and the old woman is on the list now, and so is his face. He's sitting on your couch in his coat. You're not going to tell him it's fine. Stay close. If he wants to talk, let him. If he gives the bead back, take it.

- keep: Tell her to keep a bead on the bench for you anyway. → kept-low [set pell=listed, set ember_ear=yes]
- back: Hand her the bead and go home. → returned-low [set pell=listed, set ember_ear=no]

## kept-low
*She puts it in the bowl on the bench, on its own. Neither of you says anything for a long time.*
→ end

## returned-low
*She takes it. She doesn't drop it in the junk bowl. She's still holding it when you shut the door.*
→ end

# getaway
room: karasu/dead-blocks

*The stairwell's full of lamps and somebody at the drum fire is shouting. The dead blocks don't call SDG. They don't need to.*

*{{"Left, left, there's a gap by the wall,"}} Ember says. {{"Go."}}*

view ember: He's running; you can hear it, and his collar camera's all jolts and lamps. Tell him what you can see and hear, short. Don't ask him anything until he's out.

- gap: Go where she says, through the gap by the wall. → clear / stuck [check reflex 50, set hicks_one=yes, set pell=listed]
- lamps: Read the lamps on the stair and go wherever they aren't. → clear / stuck [check wits 50, set hicks_one=yes, set pell=listed]

## clear
*You come out the far side of the wall into the paying block's light, with her voice in your ear the whole way. You didn't hate it. Behind you, at six, the survey goes up with Pell on it.*
→ end

## stuck
*They get a good look at you first. In the dead blocks that's worse than a Sentinel. You leave Pell's page behind, and the six o'clock upload goes up with her on it.*
take: none
→ end
