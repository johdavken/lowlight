---
title: Run Sheet
art: run-sheet.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [rue]
for: soren
bars: field-deck
once: true
starts: rue-hab
after: null
trust: 1 / 2
pitch: You schedule freight for Kestrel. She'd like to see you do it.
pay: 90-110
loot: a Kestrel run sheet, three years old
---

# ask

*The cable stair moves under you the whole way across. She doesn't get up. Her father's jacket is over the back of the crate, and there's a hundred sol on the lid, counted, squared off, and pushed to your side.*

*"You schedule freight for Kestrel," she says. "Say it again if you like. The night my father died there was a rig ahead of him above Forty-Three, and it dropped its load. Kestrel ran that rig. There's a run sheet. I've asked for it twice and they say there isn't."*

*She looks at the money and not at you. "A scheduler could get that. So get it. I'll be on your ear. I want to hear how a scheduler works."*

view rue: You've worked up to this for weeks. You are testing whether his story is true, and you're paying him so that you owe him nothing. If he offers to do it for free, push the money at him harder. You don't thank him.

- take: Take the hundred. → taken
- leave: Tell her to keep it. → left

## taken
*She nods once, as if you've passed something, or failed it. She puts a bead in your hand, wet with solder, and goes back to her deck.*
→ yard

## left
*"No," she says. "You've paid for enough of my life." She keeps her hand flat on the crate until you pick it up. Then she puts a bead in your palm and goes back to her deck.*
→ yard

# yard
room: spine/long-haul

*The field deck stays in its case on your shelf. The branch reads that deck, and this isn't the branch's business.*

*Kestrel's night yard sits behind the Long Haul at deck level, forty rigs nose to tail and the rain coming through the road. The dispatch hut has one lit window and a loader on a crate outside it, who looks up at you and goes on looking.*

*{{"That's him? He's looking at you like he's never seen you,"}} she says, in your ear.*

view rue: You're on the line from your hab, and you can see what the yard's cameras see. You're watching whether anyone there knows him. Keep it short, and don't help.

- badge: Walk up with your Kestrel badge out, tired and bored, a man on his own shift. → in / asked [check cool 50]
- round: Go round by the wash bay and in through the back of the hut. → in / asked [check reflex 50]

## in
*The hut is warm and smells of burned coffee. The clerk's gone for a smoke. Nobody asks you anything, and that's the job done well.*
→ hut

## asked
*The loader asks whose crew you're on. You give him a name off a board. He writes something on his hand, and you get inside, and you'd like to know what he wrote.*
→ hut

# hut
room: spine/long-haul

*Dispatch runs on a grey terminal with a cracked corner. Three years back is in the cold store, behind a thin coat of Kestrel's cheapest lacquer. The paper's in a steel press in the corner, and a padlock that was bought by the crate.*

view rue: You can see the lacquer from your side. You could take it off in a minute, and you don't, because you want to see if he can. If he goes through it like a runner, notice that, and say so.

- terminal: Go in through the terminal, the way a bored scheduler wouldn't. → found / disturbed [check tech 50 grid]
- press: Put your shoulder to the press and take the hasp off. → found / disturbed [check body 50]

## found
*It's there. Kestrel 4471, the rig ahead of hers, one sheet. Somebody has been here first: every line of the load is struck through, and there's a stamp in the margin you know better than your own name.*
→ gate

## disturbed
*It comes open with more noise than you'd like. It's there, Kestrel 4471, one sheet. Somebody's been here first: every line of the load is struck through, and there's a stamp in the margin you know better than your own name.*
→ gate

# gate
room: spine/long-haul

*A branch stamp, on a dead man's paper, three years old. The clerk's coming back across the yard with his collar up. The loader has stood up.*

*{{"Why've you stopped?"}} she says. {{"What's on it?"}}*

view rue: You can hear him breathing and he's stopped moving, and nobody who was just reading a run sheet stops like that. Ask what's on it. Ask twice if you have to.

- talk: Hold the door for the clerk and ask him what he knows about 4471. → sheet / called [check wits 50, set rue_one=yes]
- yard: Sheet in your coat, straight through the loader and out. → sheet / called [check body 50, set rue_one=yes]

## sheet
*You're on the ramp with the road slamming overhead and the sheet flat against your ribs. Nobody's behind you.*
pay: full
→ home

## called
*The clerk has a hand on your coat and the loader has your arm. A yard horn starts up. There's one number that makes all this stop, and it isn't Kestrel's. You make the call with her on your ear.*
take: none
→ burned

# home

*She reads it twice. Then she puts her thumb over the stamp and looks at you over it.*

*"You know what that is," she says. It isn't a question. "You stopped breathing when you saw it."*

view rue: This job happened tonight and you heard all of it. You don't know whose stamp that is, but he does. What he says now is the test, whatever he got you. A straight answer that costs him counts. A smooth one doesn't.

- tell: Tell her what the stamp is, and whose. → told [set stamp=told]
- freight: Tell her it's a Kestrel audit mark. A scheduler would say so. → freight [set stamp=hidden]

## told
*She doesn't say anything for a while. Then she folds the sheet into the jacket. The loader from the yard is waiting at the foot of the stair when you go down. He saw what you did and wrote nothing down, and he'd like to work for someone who isn't Kestrel. Nobody at the branch has ever heard of him.*
gives: recruit muscle green
→ end

## freight
*"Audit," she says. She folds the sheet into the jacket. You can't tell what she believes. The loader from the yard is at the foot of the stair when you go down. He saw what you did, and he'd like to work for someone who isn't Kestrel. Nobody at the branch has ever heard of him.*
gives: recruit muscle green
→ end

# burned

*It takes four minutes. Garro doesn't ask why. A grey car comes down the ramp with no plates, the clerk finds he has somewhere else to be, and the loader looks at his boots. The sheet's gone back in the press. You stand in the rain, a freight scheduler with a Sentinel car waiting for him.*

*The line's still open. She's said nothing the whole time. {{"So that's who you call,"}} she says.*

view rue: You heard him make that call, and you heard what it did. You know what he is now, for certain. You are frightened, and you're more angry than frightened, and you won't show him either. The hundred sol is his. He didn't get the sheet.

- own: Tell her what she heard. All of it. → owned [set cover=cracked, set stamp=lost]
- nothing: Say nothing, and take the bead out of your ear. → silent [set cover=cracked, set stamp=lost]

## owned
*She lets you get to the end of it. Then the line goes dead. Garro will want a reason, and he'll write down whichever one you give him.*
→ end

## silent
*It's smaller than you remember, in the rain. You owe Garro now. He'll write it down, or he won't, and you'll never know which.*
→ end

# getaway
room: spine/long-haul

*The yard horn's going. Every lit window on the row has someone in it. There's one way this ends without your face on a Kestrel report, and it's a number you know by heart.*

*{{"What's happening?"}} she says. {{"Who's that coming?"}}*

- call: Make the call. Let the grey car come and get you. → pulled / stuck [check cool 50, set cover=cracked, set rue_one=yes]
- run: Go over the rigs on foot and call from the ramp. → pulled / stuck [check reflex 50, set cover=cracked, set rue_one=yes]

## pulled
*A grey car, no plates. The horn stops as if somebody's cut it. She heard the whole thing, and she doesn't say so. You still owe Garro for it.*
→ end

## stuck
*It takes too long, and they get a good look at you first. You leave the sheet in the press and most of your name on a Kestrel report. She heard all of it.*
take: none
→ end
