---
title: Run Sheet
art: run-sheet.webp
kind: mission
tier: 1
take-size: 4
rules: crew
clock hears: WHAT RUE HEARS · 3 · "AT 3 SHE KNOWS HIS COVER"
with: [rue]
for: soren
bars: field-deck
once: true
starts: rue-hab
after: null
trust: 1 / 2
pitch: You schedule freight for Kestrel. She'd like to see you do it.
posted-by: Rue
brief: "Rue has work for a scheduler: a Kestrel run sheet from one particular night. She'll be on the line while it's done."
pay: 90-110
loot: a Kestrel run sheet, three years old
opening: "Her message came at six: three words. No price, no reason. Weeks of tea beside her at Oksana's counter, and she's never asked you anywhere. You've stood at the foot of her stair on the branch's business more nights than she knows, and never once climbed it. Tonight the door at the top is propped open with a boot, and there's a heater burning orange behind it."
opening-view: "You messaged Soren at six, three words from a relay he can't trace, asking him up tonight: the first time he's been inside. Kestrel says there's no run sheet for the night your father died, three years ago, when a Kestrel rig ahead of him dropped its load above Forty-Three. You've asked them twice. You want a scheduler to get it while you listen on his ear, to find out whether his story is true, and there's a hundred sol on the crate so you owe him nothing. Don't thank him."
image loader: local-02
---

# ask
title: The Hundred

*The cable stair swings the whole way across, chain and grating hung over a drop full of other people's light. Inside, the heater ticks orange and two cheap monitors scroll green for nobody. Her father's hauler's jacket hangs over the back of the crate, its reflective stripe gone the yellow of old teeth, and on the lid there's a hundred sol: counted, squared off, and pushed to your side.*

*The money sits on the crate between you like a third party to the deal. It's for a Kestrel run sheet, three years old: the night her father died above Forty-Three, and she'll be on your ear while you get it.*

view rue: You've worked up to this for weeks. The night your father died, a Kestrel rig ahead of him above Forty-Three dropped its load. There's a run sheet for that night; you've asked Kestrel twice, and they say there isn't one. You want him to get it the way a scheduler would, with you on his ear, so you can hear how a scheduler works. You are testing whether his story is true, and you're paying him so that you owe him nothing. If he offers to do it for free, push the money at him harder. You don't thank him.

- take: Take the hundred. → taken
- leave: Tell her to keep it. → left [set hundred=left]

## taken
*The bead in your palm is still warm from the iron, a fleck of solder bright on its wire, and the monitors go on scrolling.*
→ yard

## left
*In the end you give up and take the notes. The bead comes after, still warm from the iron, a fleck of solder bright on its wire.*
→ yard

# yard
title: The Yard
room: spine/long-haul

*The field deck stays on your shelf in its foam-lined case, Sentinel grey, a serial etched under the hinge. The branch reads everything that deck touches, and this isn't the branch's business.*

{img loader} *Kestrel's night yard sits behind the Long Haul at deck level: forty rigs nose to tail, marker lights banked low and red, the rain coming through the road's expansion joints in long cold ropes. The dispatch hut is a prefab box with one lit window. A loader sits on a crate outside it, hi-vis gone grey with diesel, and he looks up at you and goes on looking.*

view rue: You're on the line from your hab, and you can see what the yard's cameras see. You're watching whether anyone there knows him. The loader outside the hut is looking at him as if he's never seen him before: ask about that. Keep it short, and don't help.

- badge: Walk up to the loader with your Kestrel badge out. [short THE BADGE]
  · you scheduler: Slouch up tired and bored, a man on his own shift. Let him ask. → asked [take 1, alarm 1]
  · you branch: Walk at him as if the yard is yours. Don't slow down. → waved [take 2, hears 1]
- round: Go round by the wash bay and in through the back of the hut. [short THE WASH BAY]
  · you: Go round the back, under the wash bay's camera. → in [take 1, heat 1]

## in
*The hut is warm and smells of burned coffee and wet cardboard, a fan heater roaring under the desk as if it's paid by the hour. The clerk's out having a smoke. Nobody asks you anything, and that's the job done well. The wash bay camera has a red light you didn't see until you were under it.*
→ hut

## waved
*He starts to stand, and then he doesn't. You're past him and inside, and he's studying his boots.*
→ hut

## asked
*The loader asks whose crew you're on. You give him a name off the shift board by the door. He writes something on the back of his hand in ballpoint, slowly, the way men write who don't do much of it, and then you're inside, and you'd give a good deal to know what he wrote.*
→ hut

# hut
title: The Hut
room: spine/long-haul

*Dispatch runs on a grey terminal with a cracked corner, its casing yellowed to the colour of a smoker's fingers. Three years back is in the cold store, behind a thin coat of Kestrel's cheapest lacquer, the kind they buy by the seat. The paper lives in a steel press in the corner, under a padlock that was bought by the crate and looks it.*

view rue: You can see the lacquer from your side. You could take it off in a minute, and you don't, because you want to see if he can. If he goes through it like a runner, notice that, and say so.
view rue if asked=yes: He asked you to take the lacquer off, and you did it yourself in about a minute. He didn't go through it; you did. That's what a scheduler would do, and you can say so.

- terminal: Go in through the terminal. [short THE TERMINAL]
  · you scheduler: Log in under your own Kestrel badge and ask for the sheet. → logged [take 1, heat 1]
  · program: Let the pocket deck take the lacquer off. → found [take 2, hears 1]
  · contact: Ask her to take the lacquer off. → opened [take 1, cut 50, set asked=yes]
- press: Put your shoulder to the press and take the hasp off. [short THE PRESS]
  · you: Take the hasp off with your shoulder. → disturbed [take 2, alarm 2]

## found
*It's there. Kestrel 4471, the rig ahead of her father's, one sheet gone soft at the folds. Somebody's been here first: every line of the load is struck through in the same flat black ink, and there's a stamp in the margin you know better than your own name.*
→ gate

## logged
*It gives you the cold store on the third request, and writes your badge number beside the time. It's there: Kestrel 4471, the rig ahead of her father's, one sheet gone soft at the folds. Somebody's been here first: every line of the load is struck through in the same flat black ink, and there's a stamp in the margin you know better than your own name.*
→ gate

## opened
*A minute, and the cold store opens. It's there: Kestrel 4471, the rig ahead of her father's, one sheet gone soft at the folds. Somebody's been here first: every line of the load is struck through in the same flat black ink, and there's a stamp in the margin you know better than your own name. Half the hundred goes back across the crate for it.*
→ gate

## disturbed
*The hasp goes with a crack like a dropped tray, and the whole hut seems to listen. It's there: Kestrel 4471, one sheet gone soft at the folds. Somebody's been here first: every line of the load struck through in the same flat black ink, and a stamp in the margin you know better than your own name.*
→ gate

# gate
title: The Gate
room: spine/long-haul

*A branch stamp, on a dead man's paper, three years old, the ink gone brown at the edges the way blood goes. Through the window the clerk's coming back across the yard with his collar up and his cigarette cupped against the rain. The loader has stood up.*

view rue: You can hear him breathing and he's stopped moving, and nobody who was just reading a run sheet stops like that. Ask what's on it. Ask twice if you have to.

- talk: Hold the door for the clerk and ask him what he knows about 4471. [short THE CLERK, set rue_one=yes]
  · you scheduler: Ask him one tired man to another, about an old run. → remembers [take 1, alarm 1]
  · you branch: Ask him the way you were taught to ask. → questioned [take 2, hears 1]
- yard: Sheet in your coat, straight through the loader and out. [short THE YARD, set rue_one=yes]
  · you: Go through him, and don't stop. → sheet [take 2, alarm 2]

## remembers
*He remembers the rig. He remembers being told to forget it, too, and he looks at your badge for a while before you go. Then you're on the ramp with the road slamming overhead, every hauler hitting the joint like a crate dropped from a height, and the sheet flat against your ribs.*
pay: full
→ home

## questioned
*Four questions, in the order they taught you. He gives you the driver, the load, and who signed for it, and he's grateful when you stop. Then you're on the ramp with the road slamming overhead, every hauler hitting the joint like a crate dropped from a height, and the sheet flat against your ribs.*
pay: full
→ home

## sheet
*You're on the ramp with the road slamming overhead, every hauler hitting the joint like a crate dropped from a height, and the sheet flat against your ribs. Nobody's behind you.*
pay: full
→ home

## called
*The clerk has a fistful of your coat and the loader has your arm, and somewhere behind the rigs a yard horn starts up, flat and endless. There's one number that makes all this stop, and it isn't Kestrel's. You make the call with her on your ear.*
take: none
→ burned

# home
title: Her Crate

*The sheet lies open on the crate under the clamp lamp, read twice, creased where it rode against your ribs. A thumbprint of yard grease sits square over the stamp, as if somebody tried to cover it and couldn't.*

view rue: This job happened tonight and you heard all of it. You don't know whose stamp that is, but he does: he stopped breathing when he saw it, and you heard that. What he says now is the test, whatever he got you. A straight answer that costs him counts. A smooth one doesn't.
view rue if hundred=left: He tried to do this for nothing, and you heard that too.
view rue if hears>=2: You heard how he worked tonight, and no scheduler works like that. Weigh whatever he tells you now against it.
view rue if asked=yes: You opened the cold store yourself, so you owe him nothing for the sheet. That's how you wanted it.

- tell: Tell her what the stamp is, and whose. → told [set stamp=told, needs hears<=2]
- freight: Tell her it's a Kestrel audit mark. A scheduler would say so. → freight [set stamp=hidden, needs hears<=2]
- tell-heard: Tell her what the stamp is, and whose. → told [set stamp=told, set cover=cracked, needs hears>=3]
- freight-heard: Tell her it's a Kestrel audit mark. A scheduler would say so. → freight [set stamp=hidden, set cover=cracked, needs hears>=3]

## told
*You tell her whose stamp it is: the branch's. For a while there's only the heater ticking and the road going over. The sheet stays on the crate, folded along its own creases. The loader from the yard is waiting at the foot of the stair when you go down, his hi-vis dark with rain, as if he's stood there an hour. {hire}, he says. He saw what you did and wrote nothing down, and he'd like to work for someone who isn't Kestrel. Nobody at the branch has ever heard of him.*
gives: recruit muscle green man
hire-pitch: Nine years loading for Kestrel. I saw what you did, and I never wrote it down.
→ end

## freight
*You call it a Kestrel audit mark, the way a scheduler would. The sheet stays on the crate, folded along its own creases. The loader from the yard is at the foot of the stair when you go down, his hi-vis dark with rain. {hire}, he says. He saw what you did, and he'd like to work for someone who isn't Kestrel. Nobody you report to has ever heard of him.*
gives: recruit muscle green man
hire-pitch: Nine years loading for Kestrel. I saw what you did, and I never wrote it down.
→ end

# burned
title: The Grey Car

*It takes four minutes. Garro doesn't ask why. A grey car comes down the ramp with no plates and its wipers going, the clerk discovers somewhere else he urgently has to be, and the loader studies his boots as if they owe him money. The sheet's gone back to Kestrel. You stand in the rain, a freight scheduler with a Sentinel car idling for him.*

*The line's still open, a faint hiss of her room in your ear.*

view rue: You heard him make that call, and you heard what it did, and you've said nothing since. Now you know who he calls when it goes wrong. You know what he is now, for certain. You are frightened, and you're more angry than frightened, and you won't show him either. The hundred sol is his. He didn't get the sheet.

- own: Tell her what she heard. All of it. → owned [set cover=cracked, set stamp=lost]
- nothing: Say nothing, and take the bead out of your ear. → silent [set cover=cracked, set stamp=lost]

## owned
*You get to the end of it. Garro will want a reason, and he'll write down whichever one you give him.*
→ end

## silent
*It's smaller than you remember, in the rain: a fleck of solder in a wet palm. You owe Garro now. He'll write it down, or he won't, and you'll never know which.*
→ end

# getaway
title: The Horn
room: spine/long-haul

*The yard horn's going, flat and endless. Every lit window on the row has a face in it now, and somebody's working a torch along the rigs, cab by cab. There's one way this ends without your face on a Kestrel report, and it's a number you know by heart.*

view rue: You heard the yard horn start on his line and someone coming for him along the rigs, and you could see none of it. You heard all of it.

- call: Make the call. Let the grey car come and get you. [short MAKE THE CALL, set rue_one=yes]
  · you: Call the number you know by heart. → called [hears 3]
- run: Go over the rigs on foot. [short OVER THE RIGS, set rue_one=yes]
  · you: Go over the rigs and leave the sheet behind. → stuck [heat 2]

## stuck
*It takes too long, and they get a good long look at you under the sodium first, long enough to remember. You leave the sheet behind and most of your name on a Kestrel report.*
take: none
→ end
