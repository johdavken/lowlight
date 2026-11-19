---
title: Countersign
kind: mission
tier: 1
take-size: 4
rules: crew
clock sees: WHAT KROLL SEES · 3 · trust adebayo · "0 EARNS TRUST · FULL LOSES IT"
clock price: HER PRICE · 3 · "WHAT SHE ASKS TO SIGN"
with: [adebayo]
for: soren
once: true
after: kroll_one
starts: sdg-floor
district: strand
hire-at: low-roller
pitch: "A checker on the Strand's freight pier is shorting Voltaic's count. Buy her."
posted-by: Kroll, the sixty-first floor
brief: "Kroll has picked a new source for the Strand: Marta Quill, a tally checker on the freight pier past the Low Roller, three months into shorting a Voltaic manifest. Soren makes her the offer."
pay: 90-110
loot: Marta Quill's count, and her name on a branch paper
image marta: local-06
---

# wheel
title: The Low Roller
room: strand/low-roller

*The Low Roller turns over the bay, its rim lights going round pink and white, and under it the boardwalk does what it does after the Cat's up. At the foot of the boarding ramp the Wheel-Men run a spin booth: a painted wheel of its own, a barker in a striped waistcoat, a cash tin chained to the counter.*

{img marta} *She's the one in the Voltaic hi-vis with the collar turned in so the logo doesn't show. Thirty-four by the file, older by the hands. She bets red and loses, bets red and loses, and writes a marker for the third because the tin has taken everything else.*

view adebayo: You picked her from a Voltaic audit nobody else read: Marta Quill, thirty-four, tally checker on the Strand's freight pier, eleven years there, three months of crates counted short. She loses what she makes at the Wheel-Men's booth under the Low Roller. You want her bought the branch's way: a charge suspended, not dropped, and nothing on top. Xander makes the offer tonight; you're on his ear, hearing his glass. Tell him, as you'd mention the weather, what you mark against an officer: mercy to an asset, money out of his own pocket, a shortcut round the branch's rule, a lie told to you.
view adebayo if cs_staked=yes: He has just covered her marker with his own money. The glass saw the notes go down. Say, once, that you marked it.

- rail: Watch her from the boardwalk rail. [short THE RAIL]
  · you: Lean on the rail and count what she loses, where she can see you. → counted [take 1, alarm 1, price 1]
  · ears: Stand in the queue behind her and hear what the barker tells her when she's out. → marker [take 1, heat 1, set cs_marker=heard]
    told: You hear the booth's ratchet and the barker's patter, and nobody you know.
  · runner: Lift the tally slate from her coat while she plays, and copy her shift log. → slate [heat 1, price -1, set cs_slate=copied]
    told: You hear the boardwalk, and a long while later {who} saying it's back in her pocket.
- stake: Get into her game. [short HER STAKE]
  · you: Cover her marker with your own money before the barker refuses it. → staked [take 1, sees 1, price -1, set cs_staked=yes]
  · face: Take the next stool as a lucky stranger and walk her off the wheel winning. → lucky [take 1, price 1]
    told: You hear someone win at the booth, loudly, and a woman laugh in spite of herself.

## counted
*You lean on the rail with a cup of something hot and count. Forty sol on red. Thirty on red. A marker for fifty in her own hand, on a card the barker keeps. By the fourth spin she has seen you counting, and so has the barker, who says something to a boy who runs off down the boardwalk. She knows now that somebody came to the Strand to watch her lose, and she's working out what that makes her worth.*
→ gate

## marker
*{who} stands in the queue behind her with a ticket for a ride they'll never take. You get it by the food cart after, in four sentences: three markers on the Wheel-Men's card, the last due Friday, and a collector who comes down to the pier when one's late. She told the barker she'd have it. She won't. The barker's boy took a long look at the face in the queue that never rode.*
→ gate

## slate
*{who} brushes past her at the booth and comes back round the ramp with a grey Voltaic slate warm in one hand. Her shift log comes off it in a minute: three months of the night barge, and every week a crate or two counted short in her own initials. The slate goes back into her coat before the next spin. A boardwalk camera has a bad angle on all of it, and nothing of the count came away but the log.*
→ gate

## staked
*The barker won't take her marker. You put fifty sol on the counter beside it, out of your own pocket, and say it's on you tonight, and the barker looks at you the way barkers look at money. She looks at you longer. She plays it, loses it, and doesn't say thank you. She owes a stranger now, and the glass caught the notes going down.*
→ gate

## lucky
*{who} takes the next stool, bets against her and wins three spins running, loud about it, and buys her a paper cup of something on the fourth. She leaves the booth with them, laughing in spite of herself. Somebody has made her feel like she's worth a drink tonight, and it will be on her bill.*
→ gate

# gate
title: Her Shift
room: strand/low-roller

*Near midnight she leaves the booth and walks off down the boardwalk, away from the wheel, toward the far end where the stalls give out and the Strand's one working freight pier runs into the dark. You stay at the foot of the boarding ramp and watch her go: past the food cart, past the last of the lights. Down there, out of sight from here, is Voltaic's freight gate in the chain-link, a night barge unloading under sodium lamps, and her checker's hut with a slate on a cord. Every crate off the barge goes through her count, and three months of them have come out short.*

view adebayo: He's at the foot of the Low Roller's ramp, and she has gone down the boardwalk to clock on at the freight pier at its far end. He wants her manifest: the paper the offer rests on. You can pull it from Voltaic's own log from your desk in a minute, and it comes out of his section's budget if you do. If he asks, do it, and tell him to the sol what it cost. An officer who shows his cover on the ground where his asset works has taken a shortcut round the branch's rule, and you mark it.
view adebayo if cs_slate=copied: You heard one of his people say something was back in her pocket. What it was, you have only if he tells you.

- manifest: Get the night's manifest. [short THE MANIFEST]
  · you: Badge in as a Kestrel man chasing a short load, and read her slate. → badged [take 1, alarm 2, sees 1]
  · you slate: Read the short crates off the shift log you copied at the wheel. → copied [take 2] if cs_slate=copied
  · program: Let the deck lift the manifest through Voltaic's lacquer from the boardwalk. → looped [take 2, alarm 2]
    told: You hear the boardwalk and the barge's engine, and {who} working somewhere you can't see.
  · contact: Ask her to pull the manifest from Voltaic's log, from the sixty-first floor. → pulled [take 2, cut 30]
- lamp: Let her see you at the freight gate. [short THE GATE LAMP]
  · you: Walk down to the freight gate and stand under its lamp when she clocks on. → placed [take 1, price 1]
  · muscle: Walk the Wheel-Men's collector off the pier before he reaches her hut. → collector [take 1, heat 1, price -1]
    told: You hear boots on wet planking, one man explaining something to another, then only the barge.

## badged
*You walk down to the end of the boardwalk, and your Kestrel badge gets you through the freight gate and as far as her hut, a scheduler in a wet jacket chasing a load that came up short on the Spine. She hands you the slate without looking at you. Her count is there, crate by crate, and so is the gap. The gate camera has your badge number and the time, and a Voltaic pier man is already on his handset about a Kestrel man at the wrong gate. Your cover, shown on her ground, with the glass on.*
→ offer

## copied
*You don't need the freight gate. The shift log is already on your deck, and the short crates line up in her initials like teeth. You stay at the foot of the ramp with the wheel going round over you, and she never knows you've read it.*
→ offer

## looped
*{who} goes in through Voltaic's lacquer from a bench on the boardwalk, and the night's manifest comes out whole, her count beside it, short. Voltaic's log has a fault in it now, the kind they budget for until they don't, and somebody in a pier office has started reading it.*
→ offer

## pulled
*A minute on the line, and the manifest comes down from somewhere a long way above you: the night barge crate by crate, and her count beside it, short. It comes out of your section's budget, and she'll know what it cost to the sol.*
→ offer

## placed
*You walk down the boardwalk to the freight gate and stand under its lamp while she clocks on, and she knows you: the man from the booth. She doesn't look away. Through the hut window you read her count over her shoulder, crate by crate, and the gap in it. She knows now that someone came down the pier for her, and she's adding it up.*
→ offer

## collector
*The Wheel-Men's collector comes down the boardwalk for Friday's marker a night early, and {who} meets him at the freight gate and walks him back the way he came, a hand flat between his shoulders. She watches it from the hut, and her count goes wrong twice. {who} reads the rest of it through the hut window on the way back, and gives it to you at the foot of the ramp: her count, crate by crate, and the gap. She has seen what someone can do to a man on her account, and it frightens her more than the collector did. Somebody on the boardwalk saw the hand.*
→ offer

# offer
title: The Old Pier
room: strand/old-pier

*Her shift ends at four. She doesn't go home. She walks out to the end of the Strand's old pier, under the Breakwater's lit windows, and sits on the bench at the rail with a cigarette she rolls badly. Across the black bay Dockside's cranes go on working. The wheel turns pink on the next pier.*

*You've sat on the other side of this. Ten years ago: a holding room, a cigarette, tea. You know every word of the offer, and you know how it sounds from the bench.*

view adebayo: Xander has found her on the old pier at the end of her shift, and now he makes the offer. You made it to him once, ten years ago, in a holding room, and you listen to how he makes it to someone else. The branch's offer is the charge, suspended and not dropped, and nothing else. A promise beyond that, said on your line, you mark. If one of his people makes it out of your hearing, you don't know what was promised in the branch's name, and you notice that.
view adebayo if sees>=1: You've marked something against him already tonight. Let him hear that you're counting.

- charge: Make her the branch's offer. [short THE CHARGE]
  · you: Lay her count on the bench: the charge suspended, not dropped. → suspended [take 1, alarm 1]
  · you marker: Name the Wheel-Men's marker, and its Friday, before she can lie about it. → named [sees -1, price -1] if cs_marker=heard
  · face: Sit down on the bench in your place and make the offer as their own. → theirs [take 1, price 2, set cs_offer=face]
    told: You hear the bay against the pilings, {who} talking low for a long time, and her laughing once, not kindly.
- truth: Tell her where you heard it. [short WHERE YOU HEARD IT]
  · you: Tell her you heard this offer once, in a holding room, and said yes. → truth [take 1, sees 1, price -1]

## suspended
*You lay her count on the bench between you and tell her the way it was told to you: the charge would be suspended, not dropped, for as long as she counts for the branch. She stands up and says something the old man at the rods turns round for, and a face comes to one of the Breakwater's windows above you. Then she sits back down, because there's nowhere on the Strand she can walk to that the count won't follow.*
→ paper

## named
*You name the Wheel-Men's marker before she's finished her cigarette: fifty sol, the third on their card, due Friday, and the collector who comes down to the pier when one's late. She stops lying before she starts. Then you tell her the charge would be suspended, not dropped, and she listens to all of it with nothing left to bargain with. You haven't got her count on the bench. You've got her.*
→ paper

## theirs
*{who} sits down on the bench in your place, and you walk to the end of the rail and look at the cranes. It goes on a long time. When {who} comes back along the pier it's with her terms, and what was promised for them in the branch's name never went down the line.*
→ paper

## truth
*You tell her where you heard it: a holding room, nineteen, a cigarette, tea. You tell her you said yes, and why. She looks at you a long time with the roll-up burning down to her fingers. Then she gives you the rest, the short crates and who buys them off the back of the belt, because you've given her something to hold, and it's on the glass now, every word.*
→ paper

# paper if price>=3
title: The Paper
room: strand/old-pier

*The paper is one sheet, branch issue, no letterhead: her name, her count, a line at the foot for her signature and one under it for yours. She has written on the back in pencil before she'll touch the front. A wage, weekly. The Wheel-Men's card paid off. Her name off Voltaic's slate when she's done. She knows what she's worth to someone, and she has it in writing.*

view adebayo: She has set her terms on the back of the branch's paper: a wage, her markers paid, her name off Voltaic's slate. An asset who sets her own terms is a hired asset, and the branch buys; it doesn't hire. You note who set the terms tonight, and how she came to know her worth. Now he tells her what he'll countersign, and you listen to which way he goes. You don't help him choose.
view adebayo if cs_offer=face: One of his people made her the offer, out of your hearing. Whatever was promised in the branch's name, you have it only as she wrote it.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- sign: Countersign her terms. [short HER TERMS, set cs_end=dear]
  · you: Sign under her terms, wage and markers and all. → dear [cut 40]
- strike: Strike her terms and give her the branch's. [short THE BRANCH'S TERMS, set cs_end=struck]
  · you: Strike the back of the paper through and hand her the pen. → struck [heat 1]
- out: Tear it up, and tell her to get off the docks. [short LET HER GO, set cs_end=out]
  · you: Tear the paper in half and tell her to get off the pier. → out [sees 1]

# paper if price<=0
title: The Paper
room: strand/old-pier

*The paper is one sheet, branch issue, no letterhead: her name, her count, a line at the foot for her signature and one under it for yours. She reads it once, the way she'd read a manifest, and asks for nothing, because she has nothing to ask with. Her hand doesn't shake. She looks at you the whole time she signs.*

view adebayo: She's taking the branch's paper as it stands: the charge suspended, and nothing on top. That is the price you wanted. She will hate him for it, and you know exactly how much use an asset's hate is, and how long it keeps. Now he tells her what he'll countersign, and you listen to which way he goes. You don't help him choose.
view adebayo if sees<=0: Nothing he did tonight would go against him in a file. You note that, and you note what it cost her.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- sign: Countersign the branch's paper. [short COUNTERSIGN, set cs_end=cheap]
  · you: Sign under her name, and fold the paper into your coat. → cheap [heat 1]
- out: Tear it up, and tell her to get off the docks. [short LET HER GO, set cs_end=out]
  · you: Tear the paper in half and tell her to get off the pier. → out [sees 1]

# paper
title: The Paper
room: strand/old-pier

*The paper is one sheet, branch issue, no letterhead: her name, her count, a line at the foot for her signature and one under it for yours. She reads it twice and asks for one thing, the Wheel-Men's card paid, and watches your face while she asks.*

view adebayo: She's asking for one thing on top of the branch's paper: her Wheel-Men markers paid, by the branch. A small price, and still a price. Now he tells her what he'll countersign, and you listen to which way he goes. You don't help him choose.
view adebayo if cs_offer=face: One of his people made her the offer, out of your hearing. Whatever was promised in the branch's name, you have it only as she tells it.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- sign: Countersign, with her markers paid. [short COUNTERSIGN, set cs_end=signed]
  · you: Sign under her name, and write the Wheel-Men's sum in the margin. → signed [cut 20]
- out: Tear it up, and tell her to get off the docks. [short LET HER GO, set cs_end=out]
  · you: Tear the paper in half and tell her to get off the pier. → out [sees 1]

## dear
*You sign under her terms, all of them, and the branch takes on a checker with a wage and a paid card and a way out written into her. She folds her copy into her hi-vis like a winning ticket. Somewhere above Nexus a line in a budget moves, and next to it, in a hand that isn't yours, the question of who set the terms.*
pay: full
→ end

## struck
*You draw a line through the back of the paper, top to bottom, and hand her the pen. She signs the front. Then she walks back down the pier past the old man at the rods, and by the time you reach the boardwalk the barker at the spin booth knows somebody bought Marta Quill tonight, and is telling it.*
pay: full
→ end

## cheap
*You sign under her name, and the paper goes into your coat, and the branch has a checker on the Strand's freight pier for the price of a charge it was never going to bring. She stays on the bench. When you look back from the boardwalk she's still watching you go, and she'll tell somebody about you one day, in the worst words she has.*
pay: full
→ end

## signed
*You sign under her name and write the Wheel-Men's sum in the margin, and it comes out of your section's budget by Friday. She folds her copy small. She doesn't thank you, and you'd think less of her if she did.*
pay: full
→ end

## out
*You tear the paper in half, then in half again, and drop it through the boards into the bay. You tell her to get off the docks before the branch picks someone else to pick her. She doesn't thank you. At the foot of the boardwalk she catches you up, out of breath, the Voltaic hi-vis rolled under her arm. She's leaving the name Marta Quill on Voltaic's books, she says, with the count. Off the docks she answers to {hire}. If somebody's going to own her, she'd sooner it was the man who tore the paper up.*
take: part
gives: recruit face green woman
hire-pitch: Eleven years counting crates nobody checks. I can tell a barker anything, and he'll pay to hear it.
pay: full
→ end

# getaway
title: The Boardwalk
room: strand/low-roller

*Somebody's put it together: a camera, a handset, a Wheel-Man with a long memory. Two Aegis contractors are coming up the boardwalk from the freight pier in Voltaic grey, the barker at the spin booth is pointing, and she's gone, into the crowd or back to her hut, with nothing signed. You have her count, and about a minute.*

view adebayo: You heard it go wrong on Xander's line, and you can hear Voltaic's contractors on the boardwalk. One call from your desk pulls him out in four minutes, and an officer who needs pulling out is something you mark. Nothing was signed tonight.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR]
  · you: Call the sixty-first floor and stand under the wheel until the grey car comes. → pulled-out [sees 2, set cs_end=unsigned]
- crowd: Lose them in the boardwalk crowd. [short THE CROWD]
  · you: Drop her count in the bay and go into the crowd under the wheel. → crowd [heat 1, set cs_end=unsigned]

## pulled-out
*It takes four minutes. A grey car with no plates noses down the service lane behind the stalls, the two in Voltaic grey discover somewhere else to be, and you ride up to Nexus with her count on your knee and Kroll's line hissing in your ear. Half of it is still good. Marta Quill is still on the pier, unsigned, and she knows your face.*
take: part
pay: full
→ end

## crowd
*Her count goes over the rail into the black water, and you go into the crowd under the wheel, a scheduler in a wet jacket like a hundred others. Nobody follows you far. There's nothing to show for the night, and a checker on the freight pier who'll never sit on a bench with you again.*
take: none
→ end
