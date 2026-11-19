---
title: Night Clerk
kind: mission
rules: crew
tier: 2
starts: under-the-cat
after: null
pitch: Forty seconds of hotel camera somebody wants gone before morning.
posted-by: A fixer under the Cat, for a guest who won't give a name.
brief: The hotel under the Cat. Forty seconds of camera sit on a recorder in a closet upstairs. Go in the front past the night clerk, or up the back where nobody looks, and get rid of them before morning.
pay: 360-440
art: night-clerk.webp
---

# lobby

title: The Lobby
stranger: The night clerk — young, tired, a screen he watches more than the door
face: local-08

*The hotel under the Cat keeps one clerk on at night, behind glass, with a screen he watches more than the door. Somewhere upstairs is a camera closet, and in it forty seconds of somebody's evening.*

*The front way is through him. The service stair is round the side, past the bins.*

- charm: Go to the glass and be a guest. [short THE GLASS, set route=front]
  · you: Give him a name and be a guest. → noticed [take 1, heat 1]
  · face: Sign in as a couple halfway through an argument. → couple [take 1]
  · muscle: Sign in, and let him look. → looked [take 1, alarm 1]
- stairs: Go round the side and take the service stair. [short THE SIDE STAIR, set route=back]
  · you: Go round past the bins and up. → heard [take 1, alarm 1]
  · runner: Lift the latch code off the hotel's net. → coded [take 1]
  · muscle: Lift the door off its latch and hold it. → lifted [take 1]

## noticed
*He takes the name you give him and holds it a second too long. You're a guest, and he'll know this one again.*
→ desk

## couple
*{who} signs you both in as a couple halfway through an argument. He doesn't look up twice.*
→ desk

## looked
*He signs {who} in, and goes on looking.*
→ desk

## heard
*The stair door bangs once behind you. Up top, someone stops walking, and then starts again.*
→ stairwell

## coded
*{who} has the latch code off the hotel's net before you reach the bins. The door gives without a sound.*
→ stairwell

## lifted
*{who} lifts the door a finger off its latch and holds it there, and you go under the arm.*
→ stairwell

# desk

title: The Desk

*He turns the register round to you. His screen is angled away, but the glass behind him isn't. The key board hangs at his shoulder, fourth floor along the top.*

- read: Get his log-in off the glass while you sign. [short HIS LOG-IN]
  · you: Read his log-in off the glass while you sign. → read-glass [take 1, alarm 1, set login=yes]
  · ears: Read it off the glass from the lobby chairs. → read-chairs [take 1, set login=yes]
  · runner: Lift his whole session off the hotel's net. → read-session [take 2, heat 1, set login=yes]
- palm: Lift the fourth-floor pass off the board as he turns. [short THE PASS]
  · you: Lift the pass off its hook as he turns. → palmed [take 1, heat 1, set pass=yes]
  · face: Ask him for a map of the district. → mapped [take 1, set pass=yes]

## read-glass
*You get the nine characters. He gets a look at where your eyes went.*
→ floor-front

## read-chairs
*{who} reads it from the lobby chairs, off the glass, over the top of a magazine.*
→ floor-front

## read-session
*{who} lifts his whole session, not just the log-in. The lacquer on the hotel's net writes down that somebody did.*
→ floor-front

## palmed
*You have the pass. The hook it hung on is still swinging when he turns back.*
→ floor-front

## mapped
*{who} asks him for a map of the district. He turns for it. He always turns left.*
→ floor-front

# floor-front

title: The Floor

*The lift opens straight into the lens. The camera over the closet door sweeps the corridor, stops on the lift, sweeps back. You are a guest on the fourth floor, and it has seen guests before.*

- stroll: Walk it like a guest who can't find the room. [short THE WALK]
  · you: Hold the pass up to a door that isn't yours. → pass-door [take 1] if pass=yes
  · you: Walk it slow, reading the room numbers. → lens-stops [take 1, alarm 1]
  · face: Walk it in one shoe, carrying the other. → one-shoe [take 1]
- cart: Get behind the linen cart and work it down the corridor. [short THE LINEN CART]
  · you: Work the cart down the corridor yourself. → wheel [take 1, heat 1]
  · muscle: Roll the cart like it's the job, and lift the minibar keys. → minibar [take 2, heat 1]

## pass-door
*You hold the pass up to a door that isn't yours. The lens has seen that a hundred times.*
→ closet

## lens-stops
*The lens stops on you for a moment too long before it moves on.*
→ closet

## one-shoe
*{who} walks it in one shoe, carrying the other. The lens gives up the whole corridor.*
→ closet

## wheel
*A wheel sticks. A door opens down the corridor, and somebody watches you fight a cart.*
→ closet

## minibar
*{who} rolls it like it's the job, and lifts the minibar keys on the way. The man at the ice machine gets a good look.*
→ closet

# stairwell

title: The Stairwell

*Four flights of concrete. The door at the bottom locks itself from the street side. The fire door on four has been painted shut since before the clerk was born, and the laundry comes up at ten past.*

- force: Go through the paint on four. [short THE FIRE DOOR]
  · you: Put your shoulder through the paint. → second-try [take 1, alarm 1]
  · muscle: Put your weight through the paint in one go. → one-sheet [take 2, alarm 1]
- wait: Wait out the laundry and go up behind the cart. [short THE LAUNDRY]
  · you: Go up behind the cart and keep your head down. → porter [take 1, heat 1]
  · ears: Time the cart and go up in its noise. → timed [take 1]

## second-try
*It goes on the second try, and the second try is loud. A door closes somewhere that was open a second ago.*
→ floor-back

## one-sheet
*The paint lets go in one sheet. You're on four ten minutes ahead of the night, and the whole floor heard it.*
→ floor-back

## porter
*The porter looks back once on the third landing. He says nothing. He has a face to describe now.*
→ floor-back

## timed
*{who} has the cart's time to the minute. You go up in its noise and the porter never turns.*
→ floor-back

# floor-back

title: The Floor

*You come out behind the lens. The camera over the closet door sweeps the corridor, stops, sweeps back. It runs on the hotel's own line, and the junction box is on your side of it.*

- blind: Splice the camera line and feed it its last ten seconds. [short THE CAMERA LINE]
  · you: Splice it at the junction box yourself. → spliced [take 1, alarm 1, set blind=yes]
  · runner: Feed the lens an empty corridor off a deck. → fed [take 1, set blind=yes]
- slip: Go under the sweep, on the count. [short THE SWEEP]
  · you: Count it yourself and go on four. → on-four [take 1, heat 1]
  · ears: Call the count. → counted [take 1]

## spliced
*The splice takes, and the lacquer on the line notes that something touched it.*
→ closet

## fed
*{who} feeds the lens an empty corridor. It will watch that until someone tells it otherwise.*
→ closet

## on-four
*You go on four. You make it, and somebody's door is open a hand's width when you look back.*
→ closet

## counted
*{who} calls the count in your ear. Five. The lens goes over where you were.*
→ closet

# closet

title: The Closet

*Racks of recorders, each with its own small green eye. The footage is on the third one down, behind a login screen older than you are.*

- crack: Crack the login and wipe it clean. [short THE LOGIN]
  · you: Type his nine characters and wipe it. → his-login [take 2] if login=yes
  · you: Work the login until it gives. → last-try [take 1, alarm 1]
  · runner: Stitch the gap and copy the night beside it. → stitched [take 2]
- pull: Pull the drive and walk out with it. [short THE DRIVE]
  · you: Pull it and pocket it. → warm [take 1, heat 2]
  · muscle: Swap a dead drive from the next rack into its slot. → swapped [take 1, heat 1]

## his-login
*You type his nine characters. Forty seconds of nothing, and the night next to it for whoever's buying.*
→ out

## last-try
*It wipes on the last try. The login keeps a line about who asked.*
→ out

## stitched
*{who} stitches forty seconds of nothing in so well the timestamps never stutter, and copies the night beside it.*
→ out

## warm
*The drive is warm in your pocket. The gap in the rack will be noticed.*
→ out

## swapped
*{who} has the drive out and a dead one from the next rack in its slot. It buys a day.*
→ out

# out if route=front

title: The Way Out

*The lift lets you out into the lobby.*

[alarm<=1] *The clerk is back behind his glass, and he signed you in: your name, the time, his own initials. The street door is past him.*
[alarm>=2] *Two men in hotel blazers are at the glass with the clerk, not hurrying, talking into their collars. The street door is past all three.*
[door=held] *Tonight it's open, because someone you brought is standing in it.*

- walk: Walk out past the glass like someone who's paid. [short PAST THE GLASS]
  · you: Walk to the street like you've paid. → home if door=held
  · you: Walk to the street like you've paid. → stripped [lose 2] if alarm>=2
  · you: Walk to the street like you've paid. → described [alarm 1]
  · face: Settle the bill and complain about the towels. → towels if door=held
  · face: Settle the bill and complain about the towels. → held [held] if alarm>=2
  · face: Settle the bill and complain about the towels. → towels
- loop: Loop the lobby camera on his screen and go behind it. [short HIS SCREEN]
  · you: Loop it from your deck and go. → home if door=held
  · you: Loop it from your deck and go. → searched [lose 1, heat 1] if alarm>=2
  · you: Loop it from your deck and go. → deck-hand [heat 1]
  · runner: Show him an empty lobby until the door shuts. → empty-lobby if door=held
  · runner: Show him an empty lobby until the door shuts. → held [held] if alarm>=2
  · runner: Show him an empty lobby until the door shuts. → empty-lobby

# out

title: The Way Out

*Back at the head of the stair.*

[alarm<=1] *Four flights down is the service door, the kind that locks itself from the street side.*
[alarm>=2] *Two men in hotel blazers are coming up the main flight, not hurrying, talking into their collars. The service door at the bottom is the only way that isn't through them.*
[door=held] *Tonight it's open, because someone you brought is standing in it.*

- drop: Go down quiet and work the latch. [short THE LATCH]
  · you: Go down quiet and work the latch. → home if door=held
  · you: Go down quiet and work the latch. → stripped [lose 2] if alarm>=2
  · you: Go down quiet and work the latch. → unwatched if blind=yes
  · you: Go down quiet and work the latch. → stair-light [alarm 1]
  · ears: Call the porter's rounds and go between them. → rounds if door=held
  · ears: Call the porter's rounds and go between them. → held [held] if alarm>=2
  · ears: Call the porter's rounds and go between them. → rounds
- door: Go through it and be gone. [short THE DOOR]
  · you: Hit it until it opens. → home if door=held
  · you: Hit it until it opens. → searched [lose 1, heat 1] if alarm>=2
  · you: Hit it until it opens. → third-hit [heat 1]
  · muscle: Open it from the wrong side, once. → wrong-side if door=held
  · muscle: Open it from the wrong side, once. → held [held] if alarm>=2
  · muscle: Open it from the wrong side, once. → wrong-side

## home
*Under the Cat the rain's still coming down. Nobody follows you out.*
pay: full
→ end

## stripped
*The blazers stop you, polite, and go through your coat. You're out in the rain with half of what you came for.*
pay: full
→ end

## searched
*The blazers stop you, polite, and go through your coat. You're out in the rain with less than you came for.*
pay: full
→ end

## held
*The blazers stop {who}, polite, a hand on each arm. You're out in the rain with what you came for, and one fewer.*
pay: full
→ end

## described
*You're out. Behind you he says a description to nobody in particular.*
pay: full
→ end

## towels
*{who} settles the bill, complains about the towels, and takes your arm.*
pay: full
→ end

## deck-hand
*It holds long enough. The lacquer has a note with your deck's hand on it.*
pay: full
→ end

## empty-lobby
*{who} shows him an empty lobby until the street door has closed on it.*
pay: full
→ end

## unwatched
*Nobody is watching the stair. You take your time with the latch.*
pay: full
→ end

## stair-light
*The latch goes, and so does the stairwell light, on a sensor you didn't see.*
pay: full
→ end

## rounds
*{who} calls it when the porter's on two. You're out between his rounds.*
pay: full
→ end

## third-hit
*It opens on the third hit. The alley has windows.*
pay: full
→ end

## wrong-side
*{who} opens it the way it was built to open, from the wrong side, once.*
pay: full
→ end

# getaway

title: The Blazers

*Every light on the clerk's board is lit. There are blazers on the main stair and blazers at the street door, and the clerk has the handset to his ear with his back to the wall. There's a way out that keeps something, and a way out that keeps you.*

- keep: Go out through them with what you can hold. [short WHAT YOU CAN HOLD]
  · you: Go through them with it under your coat. → torn [lose 2, heat 1]
- drop: Leave it all on the rack and walk. [short EMPTY HANDS]
  · you: Leave it on the rack and walk out a guest. → empty-handed

## torn
*A blazer gets a hand in your coat and keeps what it closes on. You're in the rain with half of it, and a face the Cat will know.*
pay: full
→ end

## empty-handed
*You leave it on the rack and walk out past them with your hands where they can see them. Nobody stops a guest with nothing. Nobody pays one either.*
take: none
→ end

# push-1

title: One More Thing

*Back past the glass, the clerk's screen shows tonight's register. One guest checked in under a name his face doesn't match: a Cortex auditor, from the cut of his coat.*

- lean: Get the real name out of the clerk. [short THE CLERK]
  · you: Lean on him until he gives it up. → leaned [alarm 1, heat 1]
  · face: Ask him which room the husband is really in. → husband [alarm 1]
  · muscle: Stand at the glass. That's all. → stood [alarm 2]
- pread: Read the screen over his shoulder. [short THE REGISTER]
  · you: Ask for a map and read it over his shoulder. → folded [heat 2]
  · ears: Read it from the lobby chairs. → chairs [heat 1]

## leaned
*He gives it up, and he'll remember who asked, and how.*
pay: +160
→ end

## husband
*{who} asks which room the husband is really in. He mouths it without meaning to. He watches {who} all the way to the street door.*
pay: +160
→ end

## stood
*{who} stands at the glass. That's all. The clerk writes it down, and then he picks up the handset.*
pay: +160
→ end

## folded
*Third line. He folds your map slowly, watching you read.*
pay: +160
→ end

## chairs
*{who} has it from the chairs before he's finished the first fold. The lobby camera has had an hour of that face.*
pay: +160
→ end
