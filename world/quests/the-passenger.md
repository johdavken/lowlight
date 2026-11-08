---
title: The Passenger
art: the-passenger.webp
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
pitch: A house wants its runaway back. The fixer pays finder's rates, and the photo's on paper.
posted-by: Lusk, under the Cat. A finder's card off Second Socket's board.
brief: "A placement house wants a nineteen-year-old back. Lusk is paying finder's rates and a retainer up front. Ember's on Hicks's ear, whether he asked or not."
pay: 90-110
loot: Lusk's retainer
---

# ask

*Silas lays the card on the workbench like it might go off. Lusk's card, off the board at Second Socket: finder's work, a retainer folded inside it, more than finder's work pays. A placement house wants a girl back. She walked off her contract eleven days ago.*

*There's a photograph clipped to it, on paper, which is how you know the house is worried. House ID, grey wall. Nineteen, brown, hair cut short by somebody paid by the head. At the edge of the frame, behind her left ear, the steel lip of a cart slot. A serial number in pencil on the back.*

*Ember has read all of it over your shoulder, because she always does. She's already digging a bead and a pinhead camera out of the junk bowl. "You're going to find a kid in this city with nobody on your ear," she says. "No. I'm on your ear. Don't make the face."*

view ember: Hicks has a finder's job: a house runaway, nineteen, a cart slot behind her ear. He's run with nobody on his ear since his operator, and you think that's stupid and you've never said so. You're not asking. Joke about it if he pushes back, but you're coming on the line. The photo bothers you a little and you can't say why yet.

- yes: Take the bead. → bead [set ear1=chose]
- no: Tell her you work alone now. → alone [set ear1=allowed]

## bead
*You put it in. It's warm from her hand. She grins like she's won something, and you suppose she has.*
→ trail

## alone
*"Sure," she says, and clips the camera to your collar while you're doing up your coat, and drops the bead in your pocket. You find it at the foot of the stairs. You put it in.*
→ trail

# trail
room: karasu/ripper-clinic

*The serial is a cart's, and carts get serviced. It takes you to the Open Hand, low on the Ribbon, behind the shutter that never goes all the way up. The ripper is wiping down the chair that's already clean. She cooled a girl's slot two nights ago. She hasn't slept right since.*

*{{"She's scared,"}} Ember says. {{"The doc, I mean. Look at her hands."}}*

view ember: You're on his ear and the collar camera shows you a ripper's back room. The ripper's frightened of something that isn't Hicks. You'd like to know what. One question at a time.

view ember if ear1=allowed: He didn't want you here. You're here. Be useful, quietly, and see if he notices.

- grid: Jack her service log and pull the job by its serial. → read / rough [check tech 50 grid]
- lean: Sit in the chair. Tell her you're not a house finder, and wait. → read / rough [check cool 50]

## read
*She paid in paper and went toward Old Town. And the serial's wrong. A house cart carries the house's number. This one carries a contract's, and the contract is Aegis Solutions'. The ripper says the slot ran so hot it scorched her glove.*
→ wall

## rough
*It takes too long, and the ripper says things to you she'll wish she hadn't. She paid in paper and went toward Old Town. And the serial's wrong. A house cart carries the house's number. This one carries a contract's, and the contract is Aegis Solutions'. The ripper says the slot ran so hot it scorched her glove.*
→ wall

# wall
room: karasu/dead-blocks

*Old Town, the back end of the night. The paying block's windows are warm behind their blinds. Across the broken wall the tower is dark except for one lantern on the sixth floor. Pell's. You carried bread up those stairs when you were twelve. Nobody with a record goes past the wall. Nobody with a record knows to.*

*There's a drum fire at the foot of the stairwell, and three people round it who stopped talking when you came round the corner.*

*{{"Is that where she went?"}} Ember says. {{"Oh. That's the point, isn't it. Nobody's on file there."}}*

view ember: You've never been past the dead blocks' wall. You can hear the fire and nobody talking. Hicks grew up here and he's gone quiet about it. Ask one thing, and listen for whether he answers you more than for what he says.

- fire: Walk up to the fire and give them the name they knew you by as a kid. → past / doubted [check cool 50]
- over: Skip the fire. Up the rubble and in through the gap under the hanging sheet. → past / doubted [check body 50]

## past
*An old man at the fire looks at you for a long time, then nods at the stairwell. Nobody says anything. In the dead blocks that's a door held open.*
→ sixth

## doubted
*Somebody at the fire calls your kid's name after you, and laughs, and doesn't mean it kindly. You climb with three sets of eyes on your back.*
→ sixth

# sixth
room: karasu/sixth-floor

*Pell's armchair has someone in it. The girl from the photo, in a man's wool coat two sizes too big, blood dried at one nostril. Pell stands behind the chair with a hand on its back, and doesn't look surprised to see you. She never has.*

*The girl looks at you. Then her face goes still, all of it at once, and the voice that comes out of her is hers with the breath taken out. "You're the finder. Lusk's. We'd hoped for someone worse at it."*

*Pell says her name is Noa. The other one, she says, doesn't have one it'll give a stranger.*

*Then boots on the stair, three floors down and coming. A lamp swinging. Lusk hired two finders. Fixers do, when a job's worth it.*

*In your ear, Ember has stopped breathing. Then the girl's mouth says, quite gently, to nobody in the room: "Hello, Spark. You have a pleasant voice."*

view ember: Something just spoke to you through Hicks's bead, by your handle, from a girl's mouth. Nothing has ever done that. You're frightened and you're fascinated, and there are boots on the stair. Get his attention. Don't joke now.

- roof: Up through the hole in the ceiling with her before the lamp reaches you. → hid / held [check reflex 50, set passenger_one=yes]
- curtain: Put her behind you and hold the curtain while the other finder climbs. → hid / held [check body 50, set passenger_one=yes]

## hid
*The other finder's lamp goes through Pell's flat and finds an old woman and an oil lamp. He goes back down swearing. On the roof in the rain, the girl's hand is very cold in yours, and she says, in her own voice this time, that she's sorry about his job. Then the other one says it isn't sorry at all.*
pay: full
→ home

## held
*He gets the lamp past your shoulder. He gets a good look at her, and a better one at you, before you put him on the landing. He doesn't come back up. He doesn't have to. Lusk will know by morning what his other finder found, and who was in the way.*
take: none
→ seen

# home

*Back at the Zhous' you stand on the landing with the handset and call Lusk under the Cat. "Trail's warm," you tell him. "Give me a few nights." He says the house is patient. He says it in a voice that isn't.*

*You've never lied to a client. Not once. Ember heard every word. She's sitting on the workbench with her boots swinging and the bead in her lap, and she doesn't say any of the things she could.*

*"You talked to me," she says instead. "Twice. I counted. And then something else did."*

view ember: He just lied to his own client for a girl he met an hour ago, and you heard him do it. You've never heard him do that. Something in that girl's head called you by your handle. You'd like to keep doing this, being on his ear. Say so plainly, once. If he gives the bead back, take it, and don't let him see it matters.

view ember if ear1=allowed: He only let you in because you didn't give him a choice. You noticed. You won't say it tonight.

- keep: Tell her to keep a bead on the bench for you. → kept [set ember_ear=yes]
- back: Hand it back. Say it was a one-time thing. → returned [set ember_ear=no]

## kept
*She puts it in the bowl on the bench, on its own, away from the junk. Out on the landing the dead-blocks kid who walked you down Pell's stair is waiting. Pell sent the kid after you to see you home, and now the kid gives a name for the first time: {hire}. The dead blocks hear everything, and nobody's paying for it.*
gives: recruit ears green
hire-pitch: Pell says you look after your people. I hear everything in the dead blocks, and nobody's paying me for it.
→ end

## returned
*She takes it back without a word and drops it in the junk bowl with the rest. Out on the landing the dead-blocks kid who walked you down Pell's stair is waiting. Pell sent the kid after you to see you home, and now the kid gives a name for the first time: {hire}. The dead blocks hear everything, and nobody's paying for it.*
gives: recruit ears green
hire-pitch: Pell says you look after your people. I hear everything in the dead blocks, and nobody's paying me for it.
→ end

# seen

*Back at the Zhous' you sit on the couch where you used to sleep and don't take your coat off. Lusk's other finder has the girl's face and yours. Pell has moved her somewhere even you don't know. You call Lusk and tell him the trail's warm. He says he's heard.*

*Ember sits next to you. "You talked to me," she says. "Right up until you didn't."*

view ember: It went wrong. The other finder saw the girl, and saw him. He lied to his client anyway, and you heard. He's on your couch in his coat. You're not going to tell him it's fine. Stay close. If he gives the bead back, take it.

- keep: Tell her to keep a bead on the bench for you anyway. → kept-low [set passenger_one=yes, set noa=seen, set ember_ear=yes]
- back: Hand her the bead and go home. → returned-low [set passenger_one=yes, set noa=seen, set ember_ear=no]

## kept-low
*She puts it in the bowl on the bench, on its own. Neither of you says anything for a long time.*
→ end

## returned-low
*She takes it. She doesn't drop it in the junk bowl. She's still holding it when you shut the door.*
→ end

# getaway
room: karasu/dead-blocks

*The stairwell's full of lamp and somebody at the drum fire is shouting. You've got the girl by the coat sleeve, and she's bleeding again. The other finder's at the top of the stair behind you.*

*{{"Left, left, there's a gap by the wall,"}} Ember says. {{"Go."}}*

view ember: He's running with the girl. The collar camera's all jolts and lamps. Tell him what you can see and hear, short. Don't ask him anything until he's out.

- gap: Go where she says, through the gap by the wall. → clear / stuck [check reflex 50, set passenger_one=yes, set noa=seen]
- dark: Pull her into the dark of the next block. You know its stairs. → clear / stuck [check wits 50, set passenger_one=yes, set noa=seen]

## clear
*You come out the far side of the wall into the paying block's light, the girl's breath and Ember's voice in your ear the whole way. You leave her at a door Pell will know. Behind you, the other finder has a face to give Lusk.*
→ end

## stuck
*He gets a good look at both of you under the lamp before you're through the wall. You leave the girl at a door Pell will know, and walk home slow, and wonder what Lusk will pay for that.*
take: none
→ end
