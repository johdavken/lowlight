---
title: Clearance
kind: mission
tier: 1
take-size: 4
rules: crew
clock sees: WHAT KROLL SEES · 3 · trust adebayo · "0 EARNS TRUST · FULL LOSES IT"
clock grey: THE GREY · 4 · "AT 3 THEY'RE WAITING"
with: [adebayo]
for: soren
once: true
after: kroll_one
starts: sdg-floor
district: spine
hire-at: long-haul
pitch: "One of yours is burnt. Clear his room before the grey get there."
posted-by: Kroll, the sixty-first floor
brief: "Niko Vance, one of Soren's two runners, has his face on Kestrel's lacquer. His charge comes back tonight, and the grey will collect him for the Q. Kroll wants his room above the Long Haul empty of the branch before they do."
pay: 90-110
loot: everything of the branch's in a burnt runner's room
image niko: local-spine-08
---

# room
title: Above the Long Haul
room: spine/long-haul

*Up the drivers' ramp, past the pink neon cup in the window, and up the back stair to the rooms the night cook lets by the week. Third door. It opens before you knock. He's been watching the stair through the gap since dark.*

{img niko} *VANCE, NIKO. Twenty-two. Bought at nineteen on a lift from a Kestrel depot, a charge suspended, not dropped. Two nights ago his face came up on Kestrel's lacquer, and the branch's rule is the rule: the charge comes back and the grey come for him. A holdall's open on the bunk, half packed. He thinks you've come to fix it. You've done this before, once, and signed the file after.*

view adebayo: Kestrel's lacquer has Niko Vance's face, one of Xander's two runners. By the branch's rule his charge comes back tonight and the grey collect him for the Q; you've sent the address down, and the car comes when their paperwork does. Xander's job is the room: everything the branch gave Vance out of it before they arrive, and nobody from the branch in it when they do. You hear his glass. Tell him, as weather, what you mark: mercy to a burnt asset, money of his own, a shortcut round the rule, a lie told to you.
view adebayo if cl_moving=yes: Xander has told Vance the branch is moving him tonight. It isn't. That was a lie to an asset, not to you, and you don't mark it. You notice how easily it came.

- news: Tell him why you've come. [short THE NEWS]
  · you: Tell him the charge is coming back, and who comes for it. → news [take 1, grey 1]
  · you moving: Tell him the branch is moving him tonight, and to pack fast. → moving [take 1, alarm 1, grey 2, set cl_moving=yes]
- stair: Buy yourself the back stair for an hour. [short THE STAIR]
  · you: Put forty sol of your own in the cook's hand to keep the stair empty. → bought [take 1, sees 1]
  · muscle: Sit on the top step and turn back whoever climbs it. → held [take 1, heat 1, set cl_stair=held]
    told: You hear somebody start up a stair, a few low words, and somebody go back down it fast.

## news
*You tell him. The charge comes back tonight and the grey come up the stair for it. He sits down on the bunk with a shirt in his hands and doesn't let go of it, and you go through the room around him: the burner taped in the cistern, the drop book in the boot of a shoe. Every minute he spends finding out it's true is a minute the car is closer.*
→ kept

## moving
*You tell him the branch is moving him tonight, and he believes you, because he wants to. He packs everything, slowly and loudly, the way a man packs who thinks he's going somewhere: drawers banging, a coat folded twice, the burner and the drop book handed to you like gifts. The man in the next room hits the wall twice. He thanks you. You let him, and the minutes go.*
→ kept

## bought
*Forty sol goes into the cook's hand at the foot of the stair, your own and not the branch's, and nobody comes up for an hour. You go through the room with the door open: the burner taped in the cistern, the drop book in the boot of a shoe. The glass caught the money going.*
→ kept

## held
*{who} sits down on the top step like a man waiting for a bus. Twice somebody starts up the stair, and twice they think better of it. The man from the next room is one of them, and he'll have a story about it in the morning. You go through the room with the door open.*
→ kept

# kept
title: What He Kept
room: spine/long-haul

*The branch's things come out the way you put them in: the burner, the drop book, the sol in its band. What he kept is the rest. A shoebox under the sink: the drop log copied out in his own hand, every name he ever handled, Halloran's among them; and four hundred sol he put by himself, a note at a time. And his deck, on the table, still warm. Kestrel's lacquer has a hook in it, and the hook runs both ways.*

view adebayo: Vance kept things. A runner's insurance: a copy of the drop log in his own hand, with the branch's people in it, and his deck with Kestrel's hook still live, running back toward whoever he worked for. You want the copy gone and the hook dead. You can have the floor pull the hook from Kestrel's end; it comes out of his section's budget, and if he asks you tell him to the sol what it cost. Money left to a burnt asset is mercy, and you mark it.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.

- box: The shoebox under the sink. [short THE SHOEBOX]
  · you: Burn the copy in his sink, page by page, and his money with it. → burned [take 1, alarm 1, grey 1]
  · you money: Burn the copy, and leave him the money he put by. → spared [take 1, sees 1, set cl_money=his]
  · runner: Take the box out the window and down the drain stack, unopened. → stack [take 1, heat 1, grey -1]
    told: You hear a window go up, and rain, and a long scrape down the outside of the building.
- deck: His deck, and Kestrel's hook in it. [short HIS DECK]
  · you: Wipe it by hand on his table, the slow way. → wiped [take 1, grey 2]
  · you heel: Put it under your heel and dig the chip out of the wreck. → smashed [take 1, alarm 2]
  · program: Loop your glass and let the deck go up the hook and cut it. → looped [take 1, alarm 2, sees -1]
    told: His feed gives you six minutes of a table with nothing on it, and somewhere under it an alarm bell.
  · contact: Ask her to have the floor pull the hook from Kestrel's end. → pulled [take 1, grey 1, cut 30]

## burned
*The copy goes into the sink a page at a time, and the money after it, his four hundred, note by note, while he watches from the bunk. It takes a while. The smoke finds the vent and goes down it into the Long Haul's kitchen, and somebody down there starts banging on a pipe.*
→ ramp

## spared
*The copy goes into the sink a page at a time. The money you put back in the shoebox, and the shoebox in his holdall, and he looks at you as if you've handed him something heavier than four hundred sol. The glass caught your hands doing it.*
→ ramp

## stack
*{who} goes out of the window with the shoebox inside their jacket and down the drain stack in the rain, and is waiting at the bottom before you've finished the drawers. The copy is in the branch's hands and nobody burned anything. Someone in the yard saw a shape on the stack, and Kestrel's yard will hear about it.*
→ ramp

## wiped
*You wipe it by hand on his table, the slow way, a layer at a time, while the hook in Kestrel's lacquer goes on pulling at it like a fish. It takes as long as it takes. Under the window the yard horn sounds once for the half hour.*
→ ramp

## smashed
*It goes under your heel with a crack like a dropped plate, and you dig the chip out of the wreck with his own knife. The chip's whole. The man in the next room has stopped hitting the wall and started listening at it.*
→ ramp

## looped
*{who} feeds your glass six minutes of an empty table and goes up Kestrel's hook from inside the deck, and cuts it at the top. Kestrel's lacquer bites on the way out, and an alarm goes off on a Kestrel board somewhere with this address beside it. On the sixty-first floor, tonight has a hole in it the shape of a table.*
→ ramp

## pulled
*A minute on the line, then a long wait while somebody on the floor finds the right desk. Then the hook goes slack in the deck from somewhere a long way above you, and Kestrel's lacquer loses the thread at its own end. It comes out of your section's budget, and she'll know what it cost to the sol.*
→ ramp

# ramp if grey>=3
title: The Ramp
room: spine/long-haul

*The grey are early. A cruiser's parked at the foot of the drivers' ramp with its lights off, and two of them are at the Long Haul's counter in their wet coats, drinking the cook's bad coffee, waiting on a call to say the paperwork's through. Niko's behind you on the stair with the holdall, and he's seen them.*

view adebayo: The grey are at the Long Haul's counter, early, and Xander is on the stair above them with Vance and the branch's bag. If the uniformed side see a case officer walking a burnt asset past them, it's a page in two files, his and yours. You say so, once. You don't tell him how to get past them. Money he spends out of his own pocket, you mark. What his people do out of his glass's sight, you only hear about, and you speak only of what you heard.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.

- counter: Past the grey at the counter. [short THE COUNTER]
  · you: Walk him through the diner past their coffee, a scheduler with a driver. → past [take 1, alarm 2]
  · you stair: Take him down the back stair into the yard and round, slowly. → round [take 1, grey 2]
  · ears: Take the stool beside them and listen to their band. → overheard [take 1, heat 1, set cl_band=yes]
    told: You hear a diner, two men talking about a car, and someone breathing close to a radio.
- cook: The night cook, who saw you go up. [short THE COOK]
  · you: Give him a Kestrel badge and a name off a shift board. → board [take 1, heat 1, grey 1]
  · you cash: Pay him a week of the room out of your own pocket to forget the stair. → paid [take 1, sees 1]
  · you stair: Walk past him. Nobody went up to tell him anything. → passed [take 1] if cl_stair=held
  · face: Lean on his counter and tell him a story about a jealous husband. → husband [take 1, grey -1, heat 1]
    told: You hear someone at a counter telling a long story about somebody's wife, and a man laughing.

## past
*You walk him through the diner with your hand on his collar, a Kestrel man bringing in a driver who skipped his shift. Neither of the grey looks up from his coffee. The cook does, and drops a plate, and every driver at the counter turns to see what fell. By the time the grey turn too, there's only the door swinging.*
→ rigs

## round
*Down the back stair, along the bins, round the yard the long way under the wash bay's broken lamp, with Niko's breath going ragged behind you. By the time you're out on the deck's edge the cruiser's lights are on.*
→ rigs

## overheard
*{who} takes the stool beside them and orders a coffee, and never looks at them once. One of the grey has a good look at the face beside him while he drinks it. By the yard gate you have it in a sentence: the call's come through, and they'll go up the stair in ten minutes and find nobody there.*
→ rigs

# ramp
title: The Ramp
room: spine/long-haul

*Down the back stair with the holdall, Niko on your heels. At the foot of the drivers' ramp, between the Long Haul and Kestrel's night yard, two of Kestrel's yard men are working torches along the rigs, cab by cab. Kestrel's lacquer has his face too, and Kestrel would like a word before the grey get one. In the window the night cook is wiping the same patch of counter, watching the stair.*

view adebayo: Xander is coming down the ramp from Vance's room with the branch's bag and Vance. Kestrel's yard men are at the foot of it, looking for the face on their lacquer; you don't want Kestrel to get to Vance before the grey do. Money he spends out of his own pocket, you mark. What his people do out of his glass's sight, you only hear about, and you speak only of what you heard.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.

- yard: Kestrel's yard men at the foot of the ramp. [short THE YARD MEN]
  · you scheduler: Walk him past them, a scheduler with a driver who skipped a shift. → walked [take 1, alarm 1, grey 1]
  · you dark: Wait in the dark of the stair until their torches have gone by. → waited [take 1, grey 2]
  · ears: Get on the yard's own band and call the torches as they move. → called [take 1, grey 1, set cl_band=yes]
    told: You hear a yard band hissing in someone's ear, and somebody counting under their breath.
- cook: The night cook, who saw you go up. [short THE COOK]
  · you: Give him a Kestrel badge and a name off a shift board. → board [take 1, heat 1, grey 1]
  · you cash: Pay him a week of the room out of your own pocket to forget the stair. → paid [take 1, sees 1]
  · you stair: Walk past him. Nobody went up to tell him anything. → passed [take 1] if cl_stair=held
  · face: Lean on his counter and tell him a story about a jealous husband. → husband [take 1, grey -1, heat 1]
    told: You hear someone at a counter telling a long story about somebody's wife, and a man laughing.

## walked
*You walk him down the ramp with your hand on his collar, a Kestrel man bringing in a driver who skipped his shift, and you give the yard men a shift number and a tired look. One of them puts his torch on Niko's face and holds it there a breath too long, asking questions. Then you're past, and he's on his handset.*
→ rigs

## waited
*You stand him against the wall in the dark of the stair, your hand flat on his chest, and you wait while the torches work along the rigs and back. It takes a long time. He shakes the whole while, and you feel every minute of it go.*
→ rigs

## called
*{who} gets the yard's band into one ear and waits for the torches to settle into a pattern, and then calls them as they go: two cabs left, three right, now. You walk him through the gap between them, and nobody turns round.*
→ rigs

## board
*You lean in the Long Haul's door and give the cook a Kestrel badge and a name off the shift board, a driver you're here about, and you let him pour you a coffee you don't drink. He nods as if he believes it. He'll give the grey the same name when they ask, and a description of the man who gave it him.*
→ rigs

## paid
*A week of the room goes onto his counter out of your own pocket, folded small. He covers it with the rag and goes on wiping. He never saw anyone on the stair. The glass saw the money go.*
→ rigs

## passed
*You walk past the window with the holdall and Niko, and the cook looks up and down again. Nobody went up the stair tonight to tell him anything, and nobody came down it to tell him either.*
→ rigs

## husband
*{who} leans on the counter and tells the cook a long story about a jealous husband who's been up and down the front stair all night, and the cook laughs, and keeps laughing, and never once looks at the window. When the grey ask him, that's the story he'll give them, and they'll lose ten minutes on the wrong stair hunting a husband. When they come down it they'll want the face that told it.*
→ rigs

# rigs if grey>=4
title: The Rigs
room: spine/catwalk

*Out through the yard to the deck's edge and down onto the catwalk, and the grey are already on it. Two of them, through the hatch and onto the grating with their torches up, and a cruiser's light going round on the service road below. They have your face in their torches before you've got Niko off the ladder. Above you, along the barrier, Kestrel's rigs stand nose to tail, and past the rigs the open road. Niko looks at the rigs, and then at the grey, and then at you.*

view adebayo: The grey are on the catwalk already; you can hear their boots on the grating through his line. They have Xander in their torches with Vance beside him. Whatever he does now, the uniformed side saw a man with Vance at a collection, and that is outside the rule, and you mark it. Mercy said out loud on your line is mercy you mark, and a fence's name given to a burnt runner is the branch's name given away. You hear him decide. You don't help him.
view adebayo if cl_moving=yes: Vance still believes the branch is moving him. He finds out here that it isn't, on your line, with the grey's torches on him.
view adebayo if cl_money=his: Vance has four hundred sol of his own in his bag. Xander left it him on the glass. You marked it.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- hand: Give him to the grey. [short THE RULE, set cl_at=rigs, set niko=collected, set runner=burnt]
  · you: Walk him into their torches, and show them a Kestrel badge. → handed-caught [take 1, sees 1, heat 2]
  · you walk: Turn your back and walk, and leave him and the burner in their torches. → left-caught [sees 1]
  · you band: Walk him to them as the scheduler who called it in on their band. → handed-called [take 1, sees 1, heat 1] if cl_band=yes
- go: Let him go over the rigs. [short OVER THE RIGS, set cl_at=rigs, set niko=loose, set fence=burnt]
  · you: Boost him onto the rigs in their torches, and give him Halloran. → over-caught [take 1, sees 3, heat 2]
  · runner: Go over the rigs with him, through the torches. → over-run-caught [take 1, sees 1, heat 3]
    told: You hear the grey shout, and two pairs of boots on a trailer roof, and something hit metal hard, and then the road.

## handed-caught
*You walk him into their torches with your hand on his arm and a Kestrel badge in the other, a scheduler who found a driver the yard wanted. They take him, and they take your badge number, and your face, and one of them asks you twice what you were doing on a catwalk at this hour. You give him the same answer twice. The burner's in your pocket. Up on the ramp, Pim watched the whole of it from the shadow of a rig, and by morning his room is empty.*
pay: full
→ end

## handed-called
*You walk him into their torches on your own: the scheduler who called the yard's runaway in on their band, the minute and the place, as if you've done it before. They take him, and they take your badge number and your face, and thank you for it. He looks at you once, all the way down the ladder. The burner's in your pocket. Up on the ramp, Pim watched the whole of it from the shadow of a rig, and by morning his room is empty.*
pay: full
→ end

## left-caught
*You turn your back on him and walk, and the torches follow you a long way down the catwalk before they go back to him. He doesn't call after you. The burner goes into an evidence bag with his name on it, and your back goes into a grey report as a man who walked away. Up on the ramp, Pim watched the whole of it from the shadow of a rig, and by morning his room is empty.*
pay: full
→ end

## over-caught
*You put your hands together and he puts his boot in them, in the full light of their torches, and he's up on the first trailer and gone along the roofs. You tell him a name, Halloran, and a street, loud enough to carry, and he drops you the burner over the edge. The grey have you by both arms before he's off the third rig, and it takes a Kestrel badge and an hour to get them off. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: You let me go when the rule said don't. I've got a new name. I can run for you under it.
pay: full
→ end

## over-run-caught
*{who} goes straight through the torches and up the first trailer and pulls him up after, and one of the grey gets a hand on {who}'s boot and loses it, and they go along the roofs of the rigs with a torch on them all the way, and over the far side into the road, toward a glass-repair booth under the deck that {who} gave him the name of: Halloran's. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. You stand at the rail with the bag and the burner and your hands where the grey can see them, the officer who let it happen, in their torches. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: Your people got me over the rigs. I've got a new name. I can run for you under it.
pay: full
→ end

# rigs if grey>=3
title: The Rigs
room: spine/catwalk

*Out through the yard to the deck's edge and down onto the catwalk, where nobody official ever comes. Tonight somebody has. There's a cruiser's light going round on the service road, and two of the grey coming up the ladder to the hatch, not hurrying. Above you, along the barrier, Kestrel's rigs stand nose to tail, forty of them, and past the rigs the open road. Niko is looking at the rigs. Then he's looking at you.*

view adebayo: The grey are at the hatch, and Xander is on the catwalk with Vance between him and them. By the rule he leaves Vance to them and walks; Vance goes to the Q. An officer of the branch seen by the uniformed side at a collection is outside the rule, and you mark it. Mercy said out loud on your line is mercy you mark, and a fence's name given to a burnt runner is the branch's name given away. You hear him decide. You don't help him.
view adebayo if cl_moving=yes: Vance still believes the branch is moving him. He finds out here that it isn't, on your line.
view adebayo if cl_money=his: Vance has four hundred sol of his own in his bag. Xander left it him on the glass. You marked it.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- hand: Give him to the grey. [short THE RULE, set cl_at=rigs, set niko=collected]
  · you: Hand him to them at the hatch, and show them a Kestrel badge. → handed-seen [take 1, sees 1, heat 1]
  · you walk: Walk off down the catwalk, and leave him and the burner for them. → left
  · you band: Leave him at the hatch on the band's count, and go up through the barrier. → counted-late [take 1, heat 2] if cl_band=yes
  · you ride: Tell him the car's his ride, take the burner, and let him walk to it. → ride [take 1, heat 2] if cl_moving=yes
- go: Let him go over the rigs. [short OVER THE RIGS, set cl_at=rigs, set niko=loose, set fence=burnt]
  · you: Boost him onto the rigs with the grey on the ladder, and give him Halloran. → over-seen [take 1, sees 3, heat 1]
  · runner: Go over the rigs with him, ahead of the torches. → over-run-seen [take 1, heat 2]
    told: You hear two pairs of boots on a trailer roof, and the grey shouting at the hatch, and then the road.

## handed-seen
*You walk him to the hatch and hand him to them, and you show them a Kestrel badge while you do it, a scheduler who found a driver the yard wanted. They take him down the ladder between them. He doesn't look back. One of the grey looks at you for a long time, and writes something down.*
pay: full
→ end

## left
*You walk away down the catwalk the other way and leave him sitting on the cardboard with the burner still in his pocket, the last thing of the branch's he had. You hear them reach him. You don't look back. The burner goes into an evidence bag with his name on it.*
pay: full
→ end

## counted
*You wait for the count on the band, and leave him sitting by the hatch, and you're along the catwalk and up through the barrier before the first of them puts his head through it. The burner's in your pocket. Whatever he tells them about tonight, there's nobody standing next to him.*
pay: full
→ end

## counted-late
*You wait for the count on the band, and leave him sitting by the hatch, and go up through the barrier while the grey are still on the ladder with their heads down. They never see you. A Kestrel driver in a cab on the barrier does, and leans on his horn, and Kestrel's yard will have a man over the barrier in its log by morning. The burner's in your pocket.*
pay: full
→ end

## ride
*You tell him the car on the service road is his ride, the branch's, and he believes you, as he's believed everything tonight. He gives you the burner, because a man being moved doesn't carry the branch's phone, and he thanks you, and he walks to the hatch on his own. The grey never see you. They hear him, though, when he sees their coats: he shouts the name off your Kestrel badge, the one he's seen clipped to your jacket for three years, again and again, all the way down the ladder, and it goes on their tape.*
pay: full
→ end

## over-seen
*You put your hands together and he puts his boot in them, and he's up on the first trailer. You tell him a name, Halloran, and a street to find him on, and he drops you the burner over the edge. The grey see him go. They see you, too, on the catwalk with your hands still out. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: You let me go when the rule said don't. I've got a new name. I can run for you under it.
pay: full
→ end

## over-run-seen
*{who} goes up the first trailer and pulls him up after, and they go along the roofs of the rigs at a run with the grey shouting behind them, and over the far side into the road, toward Halloran's booth under the deck, the name {who} gave him on the way. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. You're back under the barrier in the dark with the bag and the burner before the first torch comes along the catwalk, and it finds only the rail. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: Your people got me over the rigs. I've got a new name. I can run for you under it.
pay: full
→ end

# rigs
title: The Rigs
room: spine/catwalk

*Out through the yard to the deck's edge and down onto the catwalk, where nobody official ever comes. The grey will, up the ladder to the hatch, when the car gets here. Above you, along the barrier, Kestrel's rigs stand nose to tail, forty of them, and past the rigs the open road. Niko sits down on somebody's folded cardboard and looks at the rigs for a long time. Then he asks you, very quietly, whether there's another way.*

view adebayo: Xander is on the catwalk with Vance, and the grey are on their way up the service road to the hatch. By the rule he leaves Vance to them and walks; Vance goes to the Q. Mercy said out loud on your line is mercy you mark, and a fence's name given to a burnt runner is the branch's name given away. You hear him decide. You don't help him.
view adebayo if cl_moving=yes: Vance still believes the branch is moving him. He finds out here that it isn't, on your line.
view adebayo if cl_money=his: Vance has four hundred sol of his own in his bag. Xander left it him on the glass. You marked it.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- hand: Leave him for the grey. [short THE RULE, set cl_at=rigs, set niko=collected]
  · you: Sit him by the hatch, take the burner, and walk when you hear the car. → handed [take 1, heat 1]
  · you band: Leave him at the hatch on the band's count, and be gone. → counted [take 1] if cl_band=yes
  · you ride: Tell him the car's his ride, and take the burner off him first. → ride-early [take 1] if cl_moving=yes
- go: Let him go over the rigs. [short OVER THE RIGS, set cl_at=rigs, set niko=loose, set fence=burnt]
  · you: Boost him onto the rigs, and give him Halloran's name for the far side. → over [take 1, sees 3]
  · runner: Go over the rigs with him, and down the far side. → over-run [take 1, heat 2]
    told: You hear two pairs of boots on a trailer roof, and then the road, and then only the wind.

## handed
*You sit him down by the hatch, and you tell him to stay there, and he does. He gives you the burner out of his pocket without being asked. You're off the catwalk before the car's lights come round, and a driver on the service road gets a good look at you going. You did this once before, and you remember how long the ladder takes. He's in the Q by morning.*
pay: full
→ end

## ride-early
*You tell him the car on the service road is his ride, the branch's, and you take the burner off him, because a man being moved doesn't carry the branch's phone. He thanks you. You're off the catwalk before the car's lights come round. You don't hear what he says when he sees their coats, and you don't try to.*
pay: full
→ end

## over
*You put your hands together and he puts his boot in them, and he's up on the first trailer. He drops you the burner over the edge. You give him a name, Halloran, and a street to find him on, and a fence's name is the branch's to give and not yours, and the glass was on for every word. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: You let me go when the rule said don't. I've got a new name. I can run for you under it.
pay: full
→ end

## over-run
*{who} goes up the first trailer and pulls him up after, and they go along the roofs of the rigs and over the far side, and a driver in a cab sees two shapes go over his trailer and leans on his horn. Somewhere on the way {who} gives him a name and a street: Halloran's. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. You stand at the rail with the bag and the burner, and the hatch opens on nobody. When he finds you again he'll be calling himself {hire}, and Niko Vance will be a face on Kestrel's lacquer with nobody under it.*
gives: recruit runner green man
hire-pitch: Your people got me over the rigs. I've got a new name. I can run for you under it.
pay: full
→ end

# getaway if cl_at=rigs
title: The Catwalk
room: spine/catwalk

*It's gone wrong on the catwalk. A Kestrel horn's going on the barrier, torches are coming along the grating from the hatch, and somebody up on the rigs is shouting for the yard. Whatever has become of Niko has become of him; now it's you they're looking for, with the branch's bag on your shoulder and about a minute.*

view adebayo: You heard it go wrong on Xander's line at the deck's edge: a horn, torches, the grey on the catwalk. One call from your desk pulls him out in four minutes with the bag, and an officer who needs pulling out is something you mark. What became of Vance you know only as far as Xander's glass showed it.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR]
  · you: Call the sixty-first floor and wait at the rail for the grey car. → pulled-off [sees 2]
- rigs: Go over the rigs yourself. [short OVER THE RIGS]
  · you: Drop the bag over the edge and go up over the rigs alone. → gone-over [heat 1]

## pulled-off if niko=loose
*It takes four minutes. A grey car with no plates comes along the service road, and the torches on the catwalk find somewhere else to point. You ride up to Nexus with half the bag on your knee and her line hissing in your ear. Niko got over the rigs before it went wrong; Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. When Niko finds you again he'll be calling himself {hire}.*
gives: recruit runner green man
hire-pitch: I got over the rigs while they were busy with you. I've got a new name. I can run for you under it.
take: part
pay: full
→ end

## pulled-off if runner=burnt
*It takes four minutes. A grey car with no plates comes along the service road, and the torches on the catwalk find somewhere else to point. You ride up to Nexus with half the bag on your knee and her line hissing in your ear. Behind you the grey take Niko down the ladder. Up on the ramp, Pim watched the whole of it from the shadow of a rig, and by morning his room is empty.*
take: part
pay: full
→ end

## pulled-off
*It takes four minutes. A grey car with no plates comes along the service road, and the torches on the catwalk find somewhere else to point. You ride up to Nexus with half the bag on your knee and her line hissing in your ear.*
take: part
pay: full
→ end

## gone-over if niko=loose
*The bag goes over the edge into the dark, and you go up through the barrier and along the roofs of the rigs alone, the way Niko went a minute ahead of you, with a torch finding your back twice and the horn going under you. Halloran will hide the branch's runaway under his booth, and after tonight he's done with the branch. When Niko finds you again he'll be calling himself {hire}.*
gives: recruit runner green man
hire-pitch: I got over the rigs while they were busy with you. I've got a new name. I can run for you under it.
take: none
→ end

## gone-over if runner=burnt
*The bag goes over the edge into the dark, and you go up through the barrier and along the roofs of the rigs alone, with a torch finding your back twice and the horn going under you. Behind you the grey take Niko down the ladder. What the branch gave him is somewhere at the foot of the deck, and somebody will find it. Up on the ramp, Pim watched the whole of it from the shadow of a rig, and by morning his room is empty.*
take: none
→ end

## gone-over
*The bag goes over the edge into the dark, and you go up through the barrier and along the roofs of the rigs alone, with a torch finding your back twice and the horn going under you. What the branch gave him is somewhere at the foot of the deck, and somebody will find it.*
take: none
→ end

# getaway
title: The Foot of the Ramp
room: spine/long-haul

*Somebody's put it together. The cook's on the phone in the window, Kestrel's yard men are coming out between the rigs with their torches on Niko's face, and the grey are coming down the ramp toward the noise. One of the yard men has him by the arm. You have the branch's bag on your shoulder, and about a minute before somebody asks whose it is.*

view adebayo: You heard it go wrong on Xander's line: Kestrel's people have hold of Vance, and the grey are coming down the ramp. One call from your desk pulls Xander out in four minutes with the bag, and an officer who needs pulling out is something you mark. Vance goes to the Q either way.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR]
  · you: Call the sixty-first floor and wait for the grey car. → pulled-out [sees 2, set niko=collected]
- rigs: Leave him to them, and go over the rigs yourself. [short OVER THE RIGS]
  · you: Drop the bag in a skip and go over the rigs alone. → over-alone [heat 1, set niko=collected]

## pulled-out
*It takes four minutes. A grey car with no plates comes up the ramp behind the cruiser, the yard men discover somewhere else to be, and Niko goes down the ramp between two of the grey without looking for you. You ride up to Nexus with half the bag on your knee and her line hissing in your ear.*
take: part
pay: full
→ end

## over-alone
*The bag goes into a skip behind the Long Haul, and you go over the rigs alone, trailer to trailer, with a torch finding your back twice. Behind you the grey take Niko off Kestrel's men and put him in the cruiser. What the branch gave him is in a skip, and somebody will find it.*
take: none
→ end
