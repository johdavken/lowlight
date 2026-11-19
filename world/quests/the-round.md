---
title: The Round
kind: mission
tier: 1
take-size: 3
rules: crew
clock sees: WHAT KROLL SEES · 3 · trust adebayo · "FULL LOSES HER TRUST"
clock street: THE STREET · 3 · "AT 3 THE STREET KNOWS HIM"
with: [adebayo]
for: soren
starts: sdg-floor
district: spine
after: kroll_one
draw tr_asset: fence | checker | runner
pitch: "The round: one of yours a night, and an envelope from each."
posted-by: Kroll, the sixty-first floor
brief: "Collections. Tonight one of Soren's people on the Spine has an envelope for the branch: the fence, the dock checker or the runner. Bring it up sealed."
pay: 50-70
loot: one asset's envelope, sealed
image halloran:
image pim:
image dessa: local-01
---

# meet if tr_asset=runner and runner!=burnt
title: The Radio Stall
room: spine/deck-market

{img pim} *Pim waits where he always waits: on an upturned crate behind the pirate radio stall, in the static and the red lantern light, nineteen, all elbows, a deck in his lap he's too proud to put down. The chip is in his fist. He's been there an hour, as he always has, and wants you to know it.*

view adebayo: Xander is on his round tonight: Pim, nineteen, his runner, behind the radio stall in the deck market. Pim hands over a chip of the week's work and is paid from the envelope Xander carries, three hundred, the branch's figure. You're on his ear and hear what his glass sees. Money out of his own pocket, money gone anywhere but where the branch says, a shortcut round the rule: you mark it, and you say so in a word.

- trade: Make the trade by the stall. [short THE TRADE, set tr_round=runner]
  · you: Pay him and take the chip, out by the stall where the row can see. → r-open [take 1, street 1]
  · runner: Send another runner to swap with him deck to deck, no hands. → r-deck [take 1, heat 1]
    told: You hear the radio stall's static, and two decks chirp at each other.
- wok: Take him down the row to eat. [short THE WOK, set tr_round=runner]
  · you: Buy him a bowl at the wok and do the trade under the counter. → r-bowl [take 1, sees 1]
  · face: Walk him down the row like an older brother, talking about nothing. → r-brother [take 1, alarm 1]
    told: You hear someone talking about a ball game, and Pim laughing once.

# meet if tr_asset!=checker and fence!=burnt
title: The Glass Booth
room: spine/deck-market

{img halloran} *Halloran's booth is a counter the width of a door between two pylons: GLASS REPAIRED in red tape, a loupe on a chain, a tray of eyes under a sheet of plastic. He's sixty, and he's fenced on this row since before the deck was finished. The envelope is under the tray, where it always is. The row is full: wok smoke, the radio stall, a hundred people who'd remember a Kestrel jacket at a fence's counter.*

view adebayo: Xander is on his round tonight: Halloran, the fence at the glass-repair booth under the deck, pays the branch for being let alone. You're on his ear and hear what his glass sees. Every sol in the envelope is the branch's. Money out of his own pocket, money gone anywhere but the envelope, a shortcut round the rule: you mark it, and you say so in a word.

- counter: Take it across his counter. [short OVER THE COUNTER, set tr_round=fence]
  · you: Hand him your glass to clean, and take the envelope back in its case. → f-case [take 1, street 1]
  · runner: Let the envelope leave the booth in a stranger's pocket. → f-pocket [take 1, heat 1]
    told: You hear the booth's bell, the row, and nothing change hands.
- curtain: Take it behind his curtain. [short BEHIND THE CURTAIN, set tr_round=fence]
  · you: Pay the noodle boy across the row ten sol to sing out if anyone lingers. → f-boy [take 1, sees 1]
  · muscle: Stand in the booth's mouth and make the row walk round. → f-wall [take 1, alarm 1]
    told: You hear the row change its mind about the booth, one pair of boots at a time.

# meet
title: The Corner Booth
room: spine/long-haul

{img dessa} *The Long Haul at the end of the dock shift: bad coffee, real eggs, drivers who don't look up. Dessa Koury is in the corner booth under the pink neon cup, where she always is, with her checker's slate face down on the table and her boots still wet from Kestrel's gate on the Strand. She looks at the door every time it opens. The envelope is under the slate: half of what the haulers paid her this week not to read their seals.*

view adebayo: Xander is on his round tonight: Dessa Koury, a tally checker at Kestrel's dock gate, in the corner booth of the hauler stop. The branch takes half of what the haulers pay her to look away, and it's in the envelope. You're on his ear and hear what his glass sees. Money out of his own pocket, money gone anywhere but the envelope, a shortcut round the rule: you mark it, and you say so in a word.

- booth: Sit down across from her. [short THE BOOTH, set tr_round=checker]
  · you: Sit in her booth in your Kestrel jacket and take the slate, envelope and all. → c-booth [take 1, street 1]
  · runner: Swap her slate for a blank one on the way past the counter. → c-swap [take 1, heat 1]
    told: You hear the door, a coffee pot, and nobody sit down.
- cab: Take her out to a driver's cab. [short THE CAB, set tr_round=checker]
  · you: Pay a driver twenty sol for ten minutes in his cab on the ramp. → c-cab [take 1, sees 1]
  · face: Slide in as her sister, come to walk her home. → c-sister [take 1, alarm 1]
    told: You hear two women talking about somebody's mother, and a door.

## f-case
*You hand him your glass across the counter. He cleans it with his back to the row and gives it back in a case, and the case is heavy. Two stalls down a woman frying dough watches the whole thing and goes on frying.*
→ count

## f-pocket
*{who} comes down the row behind you, and somewhere between the booth's bell and the radio stall the envelope stops being under the tray. It's in your jacket by the shrine. A stranger's pocket will be lighter for a while, and missing a wallet it never had.*
→ count

## f-boy
*Ten sol goes across the row to the noodle boy, out of your own pocket, and you step behind the curtain. Nobody lingers. The glass watched the note go over.*
→ count

## f-wall
*{who} stands in the booth's mouth like a man waiting for a lens, and the row decides to walk round. It takes a while, and people notice what they're walking round.*
→ count

## c-booth
*You slide into the booth across from her with the Kestrel badge on your jacket, and she turns the slate over to you without a word. Two drivers at the counter clock the jacket, and the slate, and go back to their eggs a beat too late.*
→ count

## c-swap
*{who} comes past the corner booth with a coffee and leaves with her slate, and the blank one's there before she's looked down. You get the envelope off {who} in the car park. Somewhere a camera on the ramp caught a stranger with two slates.*
→ count

## c-cab
*Twenty sol to a driver who doesn't ask, out of your own pocket, and ten minutes in his cab with the heater ticking and Dessa's slate on the dash. The glass caught the note, and the cab's plate. She goes back in to her booth first, and you follow a minute after.*
→ count

## c-sister
*{who} slides into the booth as her sister, loud about somebody's mother, and sits on beside her, so that nobody at the counter looks twice at who joins them. A man at the counter watches the sisters longer than he should.*
→ count

## r-open
*You pay him by the stall with the radio going, and he gives you the chip, and for a second you're two people under a red lantern doing business. A woman at the next stall has seen the jacket before, and the kid.*
→ count

## r-deck
*{who} sits down on the next crate and their decks talk for eight seconds under the static. Nobody touches anybody. It leaves a handshake in the market's open net that a careful man would find.*
→ count

## r-bowl
*You buy him a bowl at the wok, out of your own pocket, and do the trade under the counter with your knees. He eats like somebody who hasn't. The glass saw the bowl and the note.*
→ count

## r-brother
*{who} falls in beside him like an older brother and walks him the length of the row talking about a ball game, and the chip comes back down the line in a cigarette packet. The wok man will remember two people laughing at night with nothing to laugh about.*
→ count

# count if tr_round=fence
title: The Count
room: spine/deck-market

*Behind the curtain: a bench, a lamp, a stool, a jar of lenses. The envelope is short, as it is every round: the row's stall boss takes his tithe off the top before the branch sees a note, and Halloran won't cross him. Folded in with the notes is a slip of paper. He watches you count the way he watches a lens.*

view adebayo: The branch's rule is that an officer counts the envelope in front of the asset and brings it up sealed. Halloran's always comes short, because the row's stall boss takes his tithe first, and you've let it ride. If the tithe is made up out of Xander's pocket, or the envelope gets lighter on its way to you, you mark it.

- count: Count it on his bench. [short THE COUNT]
  · you: Make up the tithe from your own wallet, and seal it full. → f-madeup [take 1, sees 1]
  · face: Buy the tithe back off the stall boss as a customer with a grievance. → f-buyback [take 1, cut 20]
    told: You hear somebody arguing price with a man who isn't used to it, and then counting.
- lean: Lean on him for the tithe. [short LEAN ON HIM]
  · you: Tell him this round's tithe comes out of his own cut, loud enough for the row. → f-leaned [take 1, street 1]
  · you hard: Turn the tray out on the bench until the tithe turns up. → f-tray [alarm 2]
  · ears: Sit in the row with a bowl and hear tonight's name when he warns them. → f-ears [take 1, set tr_heard=yes]
    told: You hear the row, and somebody's tea going cold.

## f-madeup
*The tithe goes into the envelope out of your own wallet, and you seal it full. Halloran watches you do it and doesn't thank you. The glass counted every note.*
→ word

## f-buyback
*{who} goes up the row to the stall boss with a grievance about a lens and comes back with the tithe, bought back at a price and a story. It goes into the envelope. The stall boss will remember a customer who knew too much about whose money it was.*
→ word

## f-leaned
*You tell him this round's tithe comes out of his own cut, in a voice the row can hear. He finds it in a coffee tin. Two stalls down, the woman frying dough has stopped frying.*
→ word

## f-tray
*You turn the tray out onto the bench, and eyes roll in the lamplight, and the tithe never turns up in the mess, though a lens or two goes into Halloran's coat while you dig. Somebody outside the curtain hears glass breaking and goes to find a Sentinel.*
→ word

## f-ears
*{who} eats a bowl in the row with their back to the booth. After the curtain closes, Halloran makes one call, as he does every round, to warn whoever he's leaving off the slip tonight, and says the name twice. You get it by the shrine in a sentence. The envelope comes up short.*
→ word

# count if tr_round=runner
title: The Count
room: spine/deck-market

*The chip holds what you sent him for, and it's good. It always is. His envelope is in your jacket, three hundred, his week. He asks for fifty more, as he does every week: the rent on his bunk went up again, or it's a different bunk.*

view adebayo: Pim's chip is the week's work, and Xander pays him from the branch's envelope: three hundred, no more. He always asks for more. A runner's pay is the branch's to set. If Xander pays him out of his own pocket, or keeps any back, you mark it.

- pay: Pay him. [short HIS PAY]
  · you: Keep fifty back for the branch's books and tell him he was docked. → r-docked [take 1, sees 1]
  · program: Loop your glass and let the deck read what he skimmed off the chip. → r-loop [take 1, alarm 1]
    told: His feed shows you the radio stall's lantern, steady, for ten minutes.
- rest: Ask him for the rest of it. [short THE REST OF IT]
  · you: Make him open the chip by the stall and walk you through it. → r-shown [take 1, street 1]
  · you hard: Take his deck off him and go through it yourself. → r-deck-taken [alarm 2]
  · ears: Sit by the radio stall and hear which stall is watching tonight. → r-ears [take 1, set tr_heard=yes]
    told: You hear static, a song nobody asked for, and the row going past.

## r-docked
*You keep fifty back and tell him the branch docked him. He counts the two-fifty twice. Fifty sol of a nineteen-year-old's week is in your jacket, and the glass knows which pocket.*
→ word

## r-loop
*{who} feeds your glass ten minutes of a red lantern, and the deck goes through the chip while he watches. A file he kept for himself, as he always does, comes off and goes into the branch's copy. Your glass has a hole in its night now.*
→ word

## r-shown
*He opens it by the stall because you told him to, and walks you through it file by file with the row going past. The woman at the next stall has stopped pretending to sort her cables.*
→ word

## r-deck-taken
*You take his deck off his knees, and he lets you, and you go through it while he stands there with his hands empty. It's clean: he flushed the week while you reached for it, and there's nothing on it but the boot screen. He shouts, once. Somebody at the radio stall turns the volume down to listen, then goes to find a Sentinel.*
→ word

## r-ears
*{who} sits on a crate by the radio stall and watches the row watch you. One stall is paying more attention than cables need: the woman two down, who sells to whoever asks what a Kestrel jacket was doing here. You get it under the static in a sentence.*
→ word

# count
title: The Count
room: spine/long-haul

*She counts it out for you under the table, in hauler's notes gone soft with diesel, and it's light, as it's always light. The gate's quiet, she says, every week. Every week her hand stays on the slate after the count.*

view adebayo: Dessa's envelope is always light, and she always says the gate's been quiet. You don't believe quiet. If Xander makes it up out of his own pocket, you mark it. If he asks you to pull the gate's log from your desk, you can, and it comes out of his section's budget: tell him to the sol what it cost.

- count: Count it under the table. [short THE COUNT]
  · you: Make up the light week from your own wallet, and seal it full. → c-madeup [take 1, sees 1]
  · contact: Ask her to pull the gate's log from the sixty-first floor. → c-log [take 1, cut 30]
- press: Press her for the rest. [short PRESS HER]
  · you: Ask her where the rest went, loud enough for the counter. → c-pressed [take 1, street 1]
  · you hard: Take her slate and read the gate's week off it in front of her. → c-slate [alarm 2]
  · ears: Sit at the counter with the drivers and hear who'll be at her gate tonight. → c-ears [take 1, set tr_heard=yes]
    told: You hear eggs, a radio, and drivers complaining about a dock.

## c-madeup
*The light week is made up out of your own wallet, and you seal it full. She watches you do it the way you'd watch a man feed a meter that isn't his. The glass counted every note.*
→ word

## c-log
*A minute on the line, and the gate's log for the week comes down from a long way above you: what the haulers paid, and what she kept. The envelope goes up as it is, and the difference goes on her file. It comes out of your section's budget, and she'll know what it cost to the sol.*
→ word

## c-pressed
*You ask her where the rest went, plainly, and the counter hears you ask. She finds sixty in her boot and the rest in a story about a hauler who didn't pay. The drivers have stopped talking.*
→ word

## c-slate
*You turn her slate round and scroll the week in front of her, gate by gate, until she puts her hand over it. A driver at the counter gets up and makes a call from the car park.*
→ word

## c-ears
*{who} sits at the counter between two drivers and says nothing for twenty minutes. By the ramp you get it in a sentence: one of the drivers at the counter runs her gate on the late tally tonight, and he's been watching her booth. The envelope comes up light.*
→ word

# word if tr_round=fence
title: What He Tells You
room: spine/deck-market

*When the count's done he unfolds the slip: who's sold Sentinel kit across his counter since the last round, glass and decks and the odd grey jacket. There's always one name he's left off. Somebody's nephew, somebody who owes him, somebody who'll be in tomorrow. He asks, as he asks every round, that you let the slip be what it is.*

view adebayo: Halloran's slip names who's sold the branch's kit across his counter, and there's always a name he leaves off. You want the slip whole. Listen to what Xander does with it. Letting the slip go up short is mercy to an asset, and you mark it.
view adebayo if tr_heard=yes: One of Xander's people sat in the row after the count, out of your hearing. You know something was heard. You know only what he tells you of it, and you notice that.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.
view adebayo if street>=2: The row has seen a freight scheduler at a fence's booth more than once tonight. Tell him what a seen officer costs the branch, once.

- slip: Have the slip whole. [short THE SLIP]
  · you named: Write in tonight's missing name yourself, without asking him for it. → f-told [sees -1, street -1] if tr_heard=yes
  · you: Make him write the missing name in, at his counter, with the row watching. → f-named [take 1, street 1, heat 2] if street>=2
  · you: Make him write the missing name in, at his counter, with the row watching. → f-named [take 1, street 1]
  · you hard: Hold his hand flat on the bench till he writes it, and tells nobody. → f-hand [alarm 2, street -1]
  · muscle: Shut the booth with him, and stand there while he writes the name in. → f-closing [take 1, heat 1]
    told: You hear a shutter come down, and a big voice say goodnight to the row.
- short: Let it go up short. [short LET IT BE SHORT]
  · you: Take the slip as it is, and let him keep his one name. → f-short [take 1, sees 1, street -1]

## f-told
*You write tonight's missing name onto the slip yourself, and fold it, and he watches you do it and says nothing, because there's nothing for the row to hear. The slip goes up whole tonight. Next round there'll be another name.*
pay: full
→ end

## f-named if street>=3
*He writes the missing name in, slowly, with the row going past behind you, and the row sees a fence giving a scheduler a name. The slip goes up whole. Tonight the row saw Halloran talk, and to whom. The row has watched a scheduler at this booth all night, and tonight it put a name to him. Before you're out of the row, two people have pointed you out to a third.*
take: part
pay: full
→ end

## f-named if street>=2
*He writes the missing name in, slowly, with the row going past behind you, and the row sees a fence giving a scheduler a name. The slip goes up whole. Tonight the row saw Halloran talk, and to whom. The row has watched a scheduler at this booth all night, and tonight it put a name to him.*
take: part
pay: full
→ end

## f-named
*He writes the missing name in, slowly, with the row going past behind you, and the row sees a fence giving a scheduler a name. The slip goes up whole. Tonight the row saw Halloran talk, and to whom.*
pay: full
→ end

## f-hand
*You hold his hand flat on the bench, and he won't write it: he'd sooner lose the hand than the row. You let go and tell him what happens if he tells anybody, and he believes you. The slip goes up as it is. A lens cracks under the bench. Somebody outside the curtain has heard enough to tell a Sentinel.*
pay: full
→ end

## f-closing if street>=2
*{who} pulls the shutter down with him and stands in front of it while he writes the missing name in by the light of the lamp, and nobody in the row sees a fence give anybody anything. The slip goes up whole. A big stranger at a shut booth is something the row will mention. But the row had already seen enough of a scheduler at this booth to talk, and some of the envelope stays behind the shutter.*
take: part
pay: full
→ end

## f-closing
*{who} pulls the shutter down with him and stands in front of it while he writes the missing name in by the light of the lamp, and nobody in the row sees a fence give anybody anything. The slip goes up whole. A big stranger at a shut booth is something the row will mention.*
pay: full
→ end

## f-short
*You take the slip as it is and let him keep his one name. He puts the plastic back on the tray like a man covering a bird. The glass watched you let it go.*
pay: full
→ end

# word if tr_round=runner
title: What He Asks You
room: spine/deck-market

*Then, as every week, he asks it: is his charge still suspended. He's heard the stories, runners whose charge came back on a Tuesday for nothing they did. He wants it in words. He always wants it in words, and he never believes them.*

view adebayo: Pim asks every week whether his charge is still suspended, and the branch's rule is that it can always come back. Listen to what Xander tells him. Whatever he promises, you'll be the one who has to keep it, and a promise outside the rule you mark.
view adebayo if tr_heard=yes: One of Xander's people sat by the radio stall after the trade, out of your hearing. You know something was heard. You know only what he tells you of it, and you notice that.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.
view adebayo if street>=2: The deck market has watched a man in a Kestrel jacket pay a kid by the radio stall. Tell him what a seen officer costs the branch, once.

- rule: Tell him the rule. [short THE RULE]
  · you named: Give her the watching stall, and walk him out the back of the radio stall. → r-told [sees -1, street -1] if tr_heard=yes
  · you: Tell him the rule as it was told to you, there by the stall, and send him off. → r-rule [take 1, street 1, heat 2] if street>=2
  · you: Tell him the rule as it was told to you, there by the stall, and send him off. → r-rule [take 1, street 1]
  · you hard: Tell him his charge is already on your desk, and watch him go to ground. → r-scared [alarm 2, street -1]
  · muscle: Walk him home and stand on his stair after. → r-stair [take 1, heat 1]
    told: You hear the market thin out, a stair, and somebody big settling on it.
- safe: Tell him he's safe. [short HE'S SAFE]
  · you: Tell him he's safe, and give him the fifty he asked for out of your own pocket. → r-safe [take 1, sees 1, street -1]

## r-told
*You give her the stall that was watching tonight, and walk Pim out behind the radio stall where the woman two down can't see who he's walking with. He doesn't ask why. He knows the row better than you do.*
pay: full
→ end

## r-rule if street>=3
*You tell him the rule there by the stall, the way it was told to you: suspended, not dropped, and it can come back. He listens with his whole face. The woman at the next stall listens too. The row has watched a Kestrel jacket and a kid by the radio stall all night, and tonight it put the two together. Before you're out of the row, two people have pointed you out to a third.*
take: part
pay: full
→ end

## r-rule if street>=2
*You tell him the rule there by the stall, the way it was told to you: suspended, not dropped, and it can come back. He listens with his whole face. The woman at the next stall listens too. The row has watched a Kestrel jacket and a kid by the radio stall all night, and tonight it put the two together.*
take: part
pay: full
→ end

## r-rule
*You tell him the rule there by the stall, the way it was told to you: suspended, not dropped, and it can come back. He listens with his whole face. The woman at the next stall listens too.*
pay: full
→ end

## r-scared
*You tell him his charge is already on your desk. It isn't. He believes you completely, and goes to ground before the lantern's done swinging, and nobody in the market sees him again tonight. Somebody heard a kid shouting, and has called it in.*
pay: full
→ end

## r-stair if street>=2
*{who} walks him home through the market and sits on his stair after, until the lights in the block go off. Nobody asks him who the scheduler was. A big stranger on a stair all night is a story the block will tell. But the row had already seen enough of the scheduler and the kid to talk, and some of the chip went home with him unread.*
take: part
pay: full
→ end

## r-stair
*{who} walks him home through the market and sits on his stair after, until the lights in the block go off. Nobody asks him who the scheduler was. A big stranger on a stair all night is a story the block will tell.*
pay: full
→ end

## r-safe
*You tell him he's safe and give him the fifty he asked for out of your own pocket, folded small. He doesn't believe you, and takes the money. The glass saw the fold.*
pay: full
→ end

# word
title: What She Asks You
room: spine/long-haul

*Then, as every week, she turns the slate over: the seal numbers she was told not to read since the last round. She wants to know whose they are. She never gets told. And she asks the other thing again: off the gate, a transfer, anywhere the haulers don't know her face.*

view adebayo: Dessa wants to know whose seals she waves through, and she wants off the gate. Neither is hers to have. Listen to what Xander promises her. A promise of the branch's protection is a promise you'll be asked to keep, and one made outside the rule you mark.
view adebayo if tr_heard=yes: One of Xander's people sat among the drivers, out of your hearing. You know something was heard. You know only what he tells you of it, and you notice that.
view adebayo if sees>=2: You've marked two things against him tonight. Let him hear that you're counting.
view adebayo if street>=2: The drivers at the Long Haul have seen a Kestrel scheduler with a checker's slate tonight. Tell him what a seen officer costs the branch, once.

- seals: Take the seal numbers up. [short THE SEALS]
  · you named: Name tonight's driver, and keep her off the gate's late tally tonight. → c-told [sees -1, street -1] if tr_heard=yes
  · you: Have her read the numbers into your glass, and send her back to the gate. → c-sealed [take 1, street 1, heat 2] if street>=2
  · you: Have her read the numbers into your glass, and send her back to the gate. → c-sealed [take 1, street 1]
  · you hard: Take the slate up with you and leave her to explain it at the gate. → c-taken [alarm 2]
  · muscle: Walk her back to the gate for the late tally and stand there till it ends. → c-gate [take 1, heat 1]
    told: You hear a big voice say it'll walk her back to the gate, and her say all right.
- off: Take her off the gate. [short OFF THE GATE]
  · you: Tell her the branch has her, and to skip the late tally at the gate tonight. → c-home [take 1, sees 1, street -1]

## c-told
*You give the driver's name up the line with the seal numbers, and keep her off the gate tonight: she goes home by the kitchen door instead of back to the late tally, and the man at the counter waits for a woman who doesn't come. Nobody saw a scheduler give her anything.*
pay: full
→ end

## c-sealed if street>=3
*She reads the numbers into your glass, digit by digit, and goes back to the gate for the late tally. Whoever's on the barrier will see her come back from the Long Haul, and wonder who she met there. The counter has watched a Kestrel scheduler at her booth all night, and tonight it put the two together. Before you're down the ramp, a driver has your face on his deck.*
take: part
pay: full
→ end

## c-sealed if street>=2
*She reads the numbers into your glass, digit by digit, and goes back to the gate for the late tally. Whoever's on the barrier will see her come back from the Long Haul, and wonder who she met there. The counter has watched a Kestrel scheduler at her booth all night, and tonight it put the two together.*
take: part
pay: full
→ end

## c-sealed
*She reads the numbers into your glass, digit by digit, and goes back to the gate for the late tally. Whoever's on the barrier will see her come back from the Long Haul, and wonder who she met there.*
pay: full
→ end

## c-taken
*You reach for her slate, and she puts it face-down on the hot plate before you have it. The screen goes with a smell like burnt sugar, and the seal numbers with it. You leave her in the booth to explain at the late tally why she hasn't got one. A driver at the counter has already called someone about the scheduler who tried to take it.*
pay: full
→ end

## c-gate if street>=2
*{who} walks her back to the gate for the late tally and stands by the barrier till it's done, eating, saying nothing. Nobody asks her who she drinks with tonight. A camera on the gate has a big stranger on it for three hours, and the seal numbers go up as they are. But the counter had already seen enough of a scheduler at her booth to talk, and some of what you came for stays on the gate.*
take: part
pay: full
→ end

## c-gate
*{who} walks her back to the gate for the late tally and stands by the barrier till it's done, eating, saying nothing. Nobody asks her who she drinks with tonight. A camera on the gate has a big stranger on it for three hours, and the seal numbers go up as they are.*
pay: full
→ end

## c-home
*You tell her she's covered, that the branch has her, and to skip the late tally tonight and stay off the gate. She believes you because she needs to. That's a promise outside the rule, made on a line that records.*
pay: full
→ end

# getaway if tr_round=checker
title: The Ramp
room: spine/long-haul

*Somebody at the counter has made a call. There's a grey car at the foot of the ramp with its lights going, and every driver in the Long Haul has found his eggs very interesting. You have the envelope, and about a minute.*

view adebayo: You heard it go wrong on Xander's line, and you can hear the grey at the foot of the ramp. One call from your desk pulls him out in four minutes, and an officer who needs pulling out is something you mark.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR]
  · you: Call the sixty-first floor and wait for the grey car. → pulled-out [sees 2]
- crowd: Lose them down the ramp. [short LOSE THEM]
  · you: Go down the ramp between the haulers with the envelope inside your shirt. → walked-off [heat 1, lose 1]

# getaway
title: The Row
room: spine/deck-market

*The row has put it together: a man in a Kestrel jacket, and what he came for. Two of the grey are coming down through the woks with their lights going, and somebody at the radio stall is pointing. You have what you collected, and about a minute.*

view adebayo: You heard it go wrong on Xander's line, and you can hear the grey coming through the market. One call from your desk pulls him out in four minutes, and an officer who needs pulling out is something you mark.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR]
  · you: Call the sixty-first floor and wait for the grey car. → pulled-out [sees 2]
- crowd: Lose them under the deck. [short LOSE THEM]
  · you: Go into the crowd with what you collected inside your shirt. → walked-off [heat 1, lose 1]

## pulled-out
*It takes four minutes. A grey car with no plates comes up the Spine, the grey who were coming for you discover somewhere else to be, and you ride up to Nexus with what you collected on your knee and her line hissing in your ear. Half of it is still good.*
take: part
pay: full
→ end

## walked-off
*You go down into the Spine and come up three pylons along, wet to the knee, a scheduler in a Kestrel jacket like a hundred others. Some of what you collected didn't come with you.*
take: part
pay: full
→ end
