---
title: Run Sheet
kind: mission
tier: 1
take-size: 4
template: true
with: [soren]
for: rue
once: true
starts: soren-hab
after: null
trust: 1 / 2
pitch: Kestrel says there's no run sheet for the night your father died. You're going to look anyway, and he's going to listen.
posted-by: Rue herself. Her own job, with Soren on the line.
brief: "A Kestrel run sheet from one particular night, out of their yard behind the Long Haul. Rue goes in herself, with Soren on her ear because she wants him there."
pay: 90-110
loot: a Kestrel run sheet, three years old
---

# ask

*It took you two nights to find where he lives, and you didn't need the second. Top ring of Pylon Forty, a door like every other door. You knock once and he opens it as if he'd been standing behind it.*

*"Kestrel had a rig ahead of my father's, above Forty-Three," you tell him. "It dropped its load. There's a run sheet for that night. I've asked for it twice and they say there isn't. I'm going into their yard for it. Not you. Me."*

*He doesn't ask how you found the door. He puts a hundred sol on the shelf by it, counted. {{"Clerks take money,"}} he says. {{"And I'd like to be on your ear, if you'll have me."}}*

*You'll have him. You want to hear what a freight scheduler sounds like when he hears what's on it.*

view soren: She found your door. Nobody's told you she was coming, and you won't ask how. You're paying because the branch would want the yard watched, and because you want her to have it. She'll refuse it. Make sure she has it anyway, and don't explain. You asked to be on her ear; if she asks why, give her nothing she can use.

- take: Take the hundred. Clerks do. → taken
- leave: Leave it on the shelf. → left

## taken
*You fold it into your father's jacket. He watches you do it and doesn't say thank you either. He gives you a bead for your ear and shuts the door.*
→ yard

## left
*You leave it where it is. It's in your jacket pocket when you get to the foot of the stair, and you never saw his hand go near it. The bead's in the other pocket.*
→ yard

# yard
room: spine/long-haul

*Kestrel's night yard sits behind the Long Haul at deck level: forty rigs nose to tail and the rain coming through the road above. The dispatch hut has one lit window. A loader sits on a crate outside it and watches the gate, not the rigs.*

*{{"There's a man on a crate,"}} Soren says in your ear. {{"He's not loading anything."}}*

view soren: You're on her ear, and you've got Kestrel's own yard cameras up on your deck, which a freight scheduler couldn't do. You can hear rain, idling rigs, her breathing. You know Kestrel's yard the way a man who says he schedules freight should, and better. Give her one useful thing and no more. You want to hear how she works when nobody's carrying her.

- under: Go under the trailers, rig to rig, to the back of the hut. → in / seen [check reflex 50]
- walk: Walk straight past him with your hood up, like you're late for a shift. → in / seen [check cool 50]

## in
*Nobody calls out. The hut's back door has a broken closer and a brick to hold it. Inside it's warm and smells of burned coffee, and the clerk's gone for a smoke.*
→ hut

## seen
*The loader looks right at you and doesn't get up. He looks at the jacket, the stripe on it, and something goes across his face. Then he looks at the gate again. You're inside, and he knows you are.*
→ hut

# hut
room: spine/long-haul

*Dispatch runs on a grey terminal with a cracked corner. Three years back is in cold store, behind a coat of Kestrel's cheapest lacquer. The paper's in a steel press in the corner, under a padlock bought by the crate.*

*{{"The clerk smokes two,"}} Soren says. {{"You've got about one."}}*

view soren: You can hear her keys. You know what Kestrel's lacquer is like, because you've read the yard's file, and you'd like to hear whether she does. If she goes through it fast, notice, and don't flatter her. If she talks to you while she works, answer short.

- terminal: Jack the terminal and go through the lacquer to cold store. → found / noisy [check tech 50 grid]
- press: Find the tyre bar by the stove and lever the hasp off the press. → found / noisy [check body 50]

## found
*Kestrel 4471, the rig ahead of his. One sheet. Somebody's been here first: every line of the load is struck through. In the margin there's a stamp, square and grey, with no company name on it. Only a file number.*
→ gate

## noisy
*The press drawer sticks and comes out with a bang that goes round the yard. Kestrel 4471, the rig ahead of his, one sheet. Somebody's been here first: every line of the load is struck through. In the margin there's a stamp, square and grey, with no company name on it. Only a file number.*
→ gate

# gate
room: spine/long-haul

*You read the stamp into the bead, number and all, because he's the one who'd know. The line goes very quiet. Outside, the clerk is coming back across the yard with his collar up, and the loader has stood up.*

*{{"Put it in your coat,"}} Soren says, too evenly. {{"Come out the way you went in."}}*

view soren: She has just read you a branch stamp off a dead man's run sheet. Your branch, three years ago. You knew it by the second digit. She heard you stop breathing, and you can't take that back. Get her out of the yard first. Don't tell her what it is yet. Don't lie to her either, if you can help it.

- door: Hold the door for the clerk, all apology, and walk out past him. → sheet / caught [check wits 50, set rue_one=yes]
- fence: Sheet in your coat, out the back and over the yard fence. → sheet / caught [check body 50, set rue_one=yes]

## sheet
*You're on the ramp with the road slamming overhead and the sheet flat against your ribs. Nobody's behind you. In your ear he's breathing again.*
pay: full
→ home

## caught
*The clerk has a hand in your jacket and the loader has your arm, and a yard horn starts up. You're nineteen and you weigh nothing, and they both know it. The sheet goes back in the press.*

*{{"Stay where you are,"}} Soren says. {{"Don't give them your name. I'm making a call."}}*
take: none
→ owed

# home

*You climb back up to his door with it, because you said he'd hear what was on it, and he did. You hold it up so he can see the stamp, and you watch his face instead of the paper.*

*He touches his temple. He doesn't say anything yet.*

view soren: She's at your door with the sheet, holding up your branch's stamp, and she's watching your face, not the paper. You touched your temple before you meant to. Whatever you say now is the test, and she'll know it was. A straight answer will cost you, and a smooth one costs more later. She hasn't asked yet.

- ask: Ask him whose stamp it is. Straight out. → asked [set asked=yes]
- keep: Fold it away. You'll find out yourself, and he'll know you will. → kept [set asked=no]

## asked
*You ask. He answers, or he doesn't, and either way you'll remember how long he took. When you go down the stair the loader from the yard is waiting at the bottom, out of the rain. He gives his name, {hire}. He knew your father's jacket. He'd like to work for someone who isn't Kestrel.*
gives: recruit muscle green man
hire-pitch: I loaded for Kestrel nine years. I knew your father's jacket before I knew your face.
→ end

## kept
*You fold it into the jacket and go. He doesn't stop you. The loader from the yard is at the foot of the stair, out of the rain. He gives his name, {hire}. He knew your father's jacket. He'd like to work for someone who isn't Kestrel.*
gives: recruit muscle green man
hire-pitch: I loaded for Kestrel nine years. I knew your father's jacket before I knew your face.
→ end

# owed
room: spine/long-haul

*It takes four minutes. A grey car comes down the ramp with no plates. The clerk remembers he has somewhere else to be, and the loader lets go of your arm and looks at his boots. You walk out of Kestrel's yard without the sheet and without anyone writing your name down.*

*You never said you wanted his help, and he never asked. {{"You don't owe me,"}} he says. You both know that's a lie.*

view soren: You just called the branch to get her out of a freight yard, and she heard you do it. You know what she'll make of that, and she's right. You'd do it again. Don't ask for anything. Don't tell her she owes you, because she knows. Let her be angry if she's angry.

- say: Tell him you'll pay it back. All of it. → paying [set owed=yes]
- nothing: Say nothing, and take the bead out of your ear. → silent [set owed=yes]

## paying
*{{"Good,"}} he says, as if it were that simple, and the line goes dead before you can tell him it isn't.*
→ end

## silent
*The bead is warm in your hand. In the rain it's smaller than you remember. Somewhere up the pylon a man you didn't ask for help is writing something down, or isn't.*
→ end

# getaway
room: spine/long-haul

*The yard horn's going. Every lit window on the row has someone in it, and a torch is coming down the rigs toward you.*

*{{"I can make this stop,"}} Soren says. {{"One call. Say the word."}}*

view soren: The yard's awake and she's in it. You can make one call and it ends. You'd rather she asked. You'll make it anyway if she doesn't get out, and you'll tell her you did.

- word: Say the word, and stand still while he makes his call. → pulled / late [check cool 50, set rue_one=yes, set owed=yes]
- rigs: Over the rigs on foot and down the ramp, no help. → clear / stuck [check reflex 50, set rue_one=yes]

## pulled
*A grey car, no plates. The horn stops as if somebody's cut it. You got out, and now you know whose number he has.*
→ end

## clear
*Trailer roof to trailer roof and down onto the ramp in the rain. Nobody follows. You did it without him, and he heard you do it.*
→ end

## late
*The grey car comes, but you couldn't stand still, and they had a good look at you first. The sheet stays in the press. Your face goes on a Kestrel report anyway, and he heard all of it.*
take: none
→ end

## stuck
*It takes too long, and they get a good look at you first. The sheet stays in the press. You leave most of your face on a Kestrel report, and he heard all of it.*
take: none
→ end
