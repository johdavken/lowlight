---
title: Second Desk
kind: mission
tier: 1
take-size: 5
rules: crew
clock sees: WHAT KROLL SEES · 3 · trust adebayo · "0 EARNS TRUST · FULL LOSES IT"
clock floor: THE FLOOR · 3 · "AT 3 WEIR HEARS OF IT"
with: [adebayo]
for: soren
once: true
after: cs_end and niko
starts: sdg-floor
district: nexus
pitch: "Another officer's file has one of hers in it. She can't be seen asking."
posted-by: Kroll, the sixty-first floor, after hours
brief: "Weir, a case officer across the floor, is building a file that touches one of Kroll's assets. She wants to know what's in it, and she can't be the one who looks. Soren has every right to be on the floor. That's the trouble."
pay: 90-110
loot: what Weir's file says about one of hers
image fenn: sdg-02
---

# desk
title: Her Desk

*Nine o'clock, and the floor empties around you the way it does every night: coats off the hooks, lifts going down full, lamps going out office by office until the glass walls are only glass. Kroll's lamp stays on. The tea's poured: two cups.*

*She doesn't open a file. She tips her cigarette at the north corner, where the last lamp but hers is going out. WEIR. A case officer, nine years on the floor, a desk that faces the lifts so he can see who comes and goes. He keeps paper, in a drawer, like she does. There's a file in that drawer with one of hers in it, and she can't be seen asking for it.*

view adebayo: It's after hours on your floor. Weir, a case officer across the floor, is building a file that touches one of your assets, and you can't be seen asking for it. Xander can be on this floor at any hour; that's why it's him. You stay at your desk with your lamp on, as you do most nights, and you never once look at the north corner. You'll be on his ear. Tell him, as you'd mention the weather, what you'd mark tonight: reading the file himself, copying it, learning whose name is in it, or keeping from you what he found.

- stay: Stay on the floor after nine. [short STAY LATE]
  · you: Take the dead desk by the copier and work late, like a man with paperwork. → stayed [take 1, floor 1]
- lift: Go down at nine, and come back up at midnight. [short THE NIGHT LIFT]
  · you: Badge the night lift at midnight on your own card. → badged [take 1, alarm 1]
  · runner: Stall the night lift from the street, so it opens for a key and no badge. → stalled [take 1, heat 1, set sd_lift=fault]
    told: You hear the night lift stop somewhere below, a bell ring once, and a long time later its doors on your floor.

## stayed
*You take the dead desk by the copier and work through a Kestrel manifest you could do in your sleep. The night duty officer comes on at ten, sees you, and writes something in his book. The cleaner starts at the far end at eleven. Both of them will remember the scheduler who never stays late, staying late.*
→ floor

## badged
*You go down with the nine o'clock crowd and come back up alone at ten past twelve, and the night lift wants your card before it'll move. It has you now: an officer badging onto his own floor after midnight, in a log that somebody reads every morning with his coffee.*
→ floor

## stalled
*At ten past twelve the night lift stops between fifty-nine and sixty, sulks for four minutes, and opens on sixty-one for a maintenance key {who} talked out of the building's own panel from a doorway on the street. The door log has a fault in it, and the lift will sit on it till an engineer comes in the morning. It doesn't have your name.*
→ floor

# floor
title: The Floor

{img fenn} *Midnight on sixty-one. Every office is a lit box or a dark one, and every wall is glass. The night duty officer, Fenn, sits by the lifts with a thermos and the night book, and looks up at every door. The cleaner is working her way along the north row with a cart and a radio in one ear. Weir's corner is at the end of it.*

view adebayo: Xander is crossing your floor at midnight, and you can see him through the glass if you look up. Don't. Fenn keeps the night book and reads it to whoever asks; the cleaner sees every office she does. Money he spends out of his own pocket, you mark, and you say so in a word. What his people do from the street, you only hear about, and you speak only of what you heard.
view adebayo if floor>=1: The floor has already had a look at him tonight, and it has a long memory. Say so, once.

- book: Get past the night book. [short THE NIGHT BOOK]
  · you: Sign Fenn's book for a late file, and let him read the reason upside down. → signed [take 1, floor 1]
  · contact: Ask her to call Fenn to her desk about next week's rota. → rota [take 1, cut 30]
  · face: Ring the duty desk as the loading dock, with a van that won't take no. → dock [take 1, heat 1]
    told: You hear Fenn's phone, then his chair, then the service lift going down without him in a hurry.
  · ears: Sit on the duty channel from the lobby café and call Fenn's rounds into his ear. → rounds [take 1, heat 1, set sd_rounds=known]
    told: You hear {who} on his line, low, saying times. Nothing else.
- row: Go round by the cleaner's row. [short THE CLEANER]
  · you: Fold fifty sol into the cleaner's hand to do Weir's corner last. → tipped [take 1, sees 1, set sd_tipped=yes]
  · muscle: Sit in the service lift in the basement, and keep her next cart down there. → cart [take 1, alarm 1]
    told: You hear the cleaner's radio stop at the end of the row. Her next cart doesn't come up.

## signed
*Fenn reads your reason upside down as you write it, and nods, and writes the time beside it in his own hand. You have every right to be here. Now there's a page that says so, with the hour on it.*
→ office

## rota
*Her lamp blinks twice across the floor. Fenn takes his thermos down to her desk, and for ten minutes the night book sits open by the lifts with nobody looking at it. Whatever she asked him about the rota, it'll be in his memory as the night Kroll stayed late.*
→ office

## dock
*Fenn's phone goes, and somebody from the loading dock wants him down there now, about a van, and won't take no. {who} has a good voice for a man with a van. Fenn goes down cursing, and the lifts are nobody's for twenty minutes. The dock will have a complaint in its log by morning about a van that never came.*
→ office

## rounds
*{who} sits in the lobby café with a cold coffee and the duty channel in one ear, and calls Fenn's night into yours: the north stair at twenty past, the copier at half past, the lifts on the hour. He's kept the same rounds for nine years. You walk past his empty chair at twenty-two minutes past.*
→ office

## tipped
*Fifty sol out of your own pocket goes into the cleaner's hand folded small, and she takes it without looking at it and turns her cart round. Weir's corner last. The glass in your left eye was on for the note.*
→ office

## cart
*{who} gets into the service lift in the basement and sits on the floor of it with the doors held, and the cleaner's next cart stays down there with him. At the end of the north row she takes her earbud out, looks at the lift, and picks up the house phone.*
→ office

# office
title: Weir's Corner

*Weir's office is glass on three sides and a view of the lifts on the fourth. A green lamp, a family in a frame turned to face the visitor's chair, and a drawer with a keypad on it, wired into the floor's net. Inside: a grey folder in a sleeve, a few dozen pages, typed and annotated in a small hand. Somewhere in it is one of hers.*

view adebayo: Xander is in Weir's office with the drawer. What you want is what's in the file, and you want it in your own hands, unread by anyone but you. Reading it himself, copying it, or learning whose name is in it is something you mark, and you mark it however good his reason. If his glass goes dark, you notice the hole, and you say so.
view adebayo if sees>=2: You've marked two things against him tonight already. Let him hear you counting.

- carry: Carry it across to her, unopened. [short CARRY IT, set sd_file=hers]
  · you: Walk the folder in its sleeve across the floor to her desk, and back. → carried [take 2, floor 1, alarm 2]
  · runner: Lift the drawer's lacquer from the riser on sixty, onto her terminal. → riser [take 2, heat 1]
    told: You hear the floor's lights hum, and your own terminal wake by itself.
- read: Read it where it lies. [short READ IT]
  · you: Read it under his green lamp, every page, and put it back square. → read [take 2, sees 1, set sd_name=known]
  · you copy: Shoot every page on your Kestrel deck, out before the cleaner turns in. → copied [take 2, sees 2, floor -1, set sd_name=known]
  · program: Loop your glass back an hour, from the lift to his lamp, and read it in the gap. → looped [take 2, alarm 2, sees -1, set sd_glass=looped]
    told: His feed shows you an empty corridor and a green lamp, and before that the same corridor, for an hour.

## carried
*The folder goes under your arm in its sleeve, and you walk it the length of the floor, past every glass wall, to her desk and her lamp. She reads it with her cigarette going out in the tray. Then you walk it back. Anyone looking up from the north row saw an officer carry another man's file across the floor at one in the morning, twice.*
→ out

## riser
*{who} is in the riser cupboard on sixty with a deck and a torch in their teeth, and Weir's drawer stops being a drawer and starts being a page on her terminal. The folder never leaves its sleeve. Somewhere in the building's own log there's a fault in the riser that an engineer will chase for a week.*
→ out

## read
*You read it under his lamp, every page, the way they taught you to read a file: what it wants, what it knows, what it's guessing. Two thirds of the way down is the name. SZABO, RUTH. A pilot on the harbour tugs, ASSET 4-071, eleven years Kroll's. Weir thinks she's selling the tide schedule twice. You put the folder back square. Your glass read it with you.*
→ out

## copied
*Every page goes onto your Kestrel deck in under four minutes, flat under his lamp, and you're out of the corner before the cleaner turns it. You saw the name going past: SZABO, RUTH, a pilot on the harbour tugs, ASSET 4-071, eleven years Kroll's. Now there's a copy of another officer's file in a freight scheduler's case, and your glass watched you make it.*
→ out

## looped
*{who} takes your glass back an hour and plays it again: an empty corridor, a green lamp. Inside the gap you read the file. SZABO, RUTH. A pilot on the harbour tugs, ASSET 4-071, eleven years Kroll's, and Weir thinks she's selling the tide schedule twice. On the sixty-first floor tonight has an hour missing from it, and the floor's net heard something reach for it.*
→ out

# out
title: The Glass

*The drawer's shut. Getting out is the same floor in reverse, with the lamps where they were and every wall still glass. The cleaner's cart is coming round the north row. Fenn's chair is empty or it isn't.*

view adebayo: Xander is getting out of Weir's corner. All anyone has to do is look up. You don't.
view adebayo if floor>=2: The floor has noticed him. By morning someone will say his name and Weir's in one sentence. Say so, once.

- lamp: Put out his lamp, and wait in the dark. [short IN THE DARK]
  · you: Put out his lamp and sit below the glass until the cleaner has gone by. → waited [take 1, alarm 1]
  · runner: Take the floor's lights out for ninety seconds from the street. → dark [take 1, heat 1, floor -1]
    told: Your lamp is the only light on the floor for ninety seconds. You hear a man in the dark swear at the building.
- walk: Walk out the way you came, in the light. [short WALK OUT]
  · you: Walk out past the duty desk with a folder of your own under your arm. → walked [take 1, floor 1]
  · you rounds: Go out on Fenn's round, the minute he's at the north stair. → timed [floor -1, set sd_hands=empty] if sd_rounds=known

## waited
*You put his lamp out and sit on his carpet below the glass, with your back to his desk, while the cart squeaks past and stops and starts again. Four minutes. The cleaner looks in, sees a dark office, and moves on. If she'd turned her torch on, there'd be no story you could tell her.*
→ ledger

## dark
*The floor goes dark from end to end for ninety seconds, every lamp but hers, and you cross it in the dark the way you'd cross your own hab. When the lights come back you're at the copier with a manifest, and nobody on the floor can say where you were before it. Facilities will have a fault on sixty-one that nobody can find.*
→ ledger

## walked
*You walk out of Weir's corner with a folder of your own under your arm, past the cleaner, past Fenn, and nod to both. Nothing wrong with it. You have every right. They'll remember it anyway: the scheduler, at that hour, coming from that end of the floor.*
→ ledger

## timed
*Twenty past, and Fenn's at the north stair with his torch, as he has been at twenty past for nine years. You walk the length of the floor behind his back with nothing in your hands, and you're at the copier when he comes round. Whatever you'd have carried out of that corner stays in it. He nods. As far as the floor knows, you've been at the copier all night.*
→ ledger

# ledger if sd_file=hers
title: Her Desk

*One in the morning, and the rain's come on. Weir's file has been read tonight, by her and nobody else. Across the floor his corner is dark and square, the drawer shut. The tea's poured again: two cups.*

view adebayo: Xander is back at your desk. You've read Weir's file yourself tonight, and as far as anything you heard on his line, he never opened it. Now he tells you how the night went, and you watch what he asks for. You pour his tea. You don't help him choose.
view adebayo if sees<=0 and alarm<=1 and floor<=1 and sd_tipped!=yes and sd_hands!=empty: Nothing he did tonight would go against him, the floor never placed him, and the night was quiet. You've decided: if he tells you plainly how it went, you give him the stall build from your drawer, a deck with no serial that nobody on this floor ever signed for, and no form. If he asks whose name was in the file, you don't.
view adebayo if floor>=2: The floor has had a look at him: Fenn's book, the cleaner, the north row. By morning someone will say his name and Weir's in one sentence. Say so, once.
view adebayo if floor>=3: The floor saw him. Weir will know by morning that someone was at his drawer, and Fenn will tell him who stayed late.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- report: Tell her how it went, and that you never opened it. [short HOW IT WENT]
  · you: Tell her how you got it to her, in order, and nothing you didn't see. → reported [heat 1, set sd_end=told]
  · you tip: Tell her about the fifty sol too, and let her take it off your fee. → reported [heat 1, sees -1, cut 30, set sd_end=told] if sd_tipped=yes
- ask: Ask her whose name it was. [short WHOSE NAME]
  · you: Ask her, plainly, whose name is in Weir's file. → asked [sees 1, set sd_end=asked]

## reported if sees<=0 and alarm<=1 and floor<=1 and sd_tipped!=yes and sd_hands!=empty
*You tell her how it went, in the order she likes, and never once what was in it, because you never saw. She listens with her cigarette burning down. When you're done she opens her own drawer and puts a deck on the blotter: a stall build, scuffed, no serial, no branch tag, nothing anyone on this floor ever signed for. Something to carry that the branch doesn't read. It won't last. Nothing off the books does.*
gives: deck stall-build
pay: full
→ end

## reported if floor>=3
*You tell her how it went, and never once what was in it. Down the floor Fenn turns a page in his book, and looks up at the north corner again. The floor has had a good look at you tonight, and it talks. By nine Weir will know somebody was at his drawer, and Fenn will tell him who was on the floor.*
pay: full
→ end

## reported
*You tell her how it went, in the order she likes, and never once what was in it, because you never saw. She listens with her cigarette burning down and never looks at the north corner. Whatever Weir builds now, she's read it first.*
pay: full
→ end

## asked
*You ask her whose name is in it. The question sits between the two cups for a long moment. Whatever she does with it, an officer who wanted to know is on the glass now, in your own voice.*
pay: full
→ end

# ledger
title: Her Desk

*One in the morning, and the rain's come on. Across the floor Weir's corner is dark and square, the drawer shut, the lamp off. Fenn is reading his thermos. The tea's poured again: two cups.*

view adebayo: Xander is back at your desk. You heard the night, all of it that was on his glass, and nothing of what his people did from the street. Now he tells you what was in the file, and you watch which way he goes. You pour his tea. You don't help him choose.
view adebayo if sd_name=known: His glass watched him read the file; he knows whose name is in it, and you know he knows. Whatever he tells you now, you'll know if he leaves her out.
view adebayo if sd_glass=looped: His glass went dark for an hour in Weir's corner. You don't know what he read in the gap, or whether he read it at all. You know only what he tells you, and you notice that.
view adebayo if floor>=2: The floor has had a look at him: Fenn's book, the cleaner, the north row. By morning someone will say his name and Weir's in one sentence. Say so, once.
view adebayo if floor>=3: The floor saw him. Weir will know by morning that someone was at his drawer, and Fenn will tell him who stayed late.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.

- all: Give her all of it. [short ALL OF IT]
  · you: Lay it out for her: what's in the file, whose name, and how you got it. → told [heat 1, set sd_end=told]
  · you tip: Tell her about the fifty sol first, and let her take it off your fee. → told [heat 1, sees -1, cut 30, set sd_end=told] if sd_tipped=yes
- keep: Keep back what you found. [short KEEP IT BACK]
  · you: Tell her the file's thin, and keep the name to yourself. → kept [sees 2, set sd_end=kept]

## told if floor>=3
*You give her all of it: what Weir has, and whose name. She listens with the rain on the glass behind her. Down the floor Fenn turns a page in his book, and looks up at the north corner again. Weir will know by morning, and he'll know who stayed late.*
pay: full
→ end

## told
*You give her all of it, in the order she likes: what Weir has, what he's guessing, and whose name it touches. She listens with her cigarette burning down and never once looks at the north corner. Whatever Weir builds now, she'll have read it first. What you did to get it is in her file too.*
pay: full
→ end

## kept if floor>=3
*You tell her the file is thin. Down the floor Fenn is writing something in his book, and looking up at the north corner. By nine Weir will know someone was at his drawer, and he'll know whose name was on the floor. Everybody on sixty-one will know something by morning, and you've kept back the one thing she sent you for.*
pay: full
→ end

## kept
*You tell her the file is thin: a few pages, nothing she needs to lose sleep over. She looks at you for a long moment over the cups, and pours. Weir's file says what it says, and now so does yours.*
pay: full
→ end

# getaway
title: The Fire Stair

*A torch comes down the north row, then another. Fenn is out of his chair with a radio, the cleaner is pointing, and the house phone at the duty desk won't stop. Somebody has put it together: Weir's corner, at this hour. You have whatever you have, and about a minute before they reach the glass.*

view adebayo: You heard it go wrong on Xander's line, and you can see the torches on your own floor. If he comes to your lamp, you give your word: he's been at your desk with you since midnight, and Fenn will write it down because you said it. An officer who needs his handler to vouch for him is something you mark.

- vouch: Cross to her desk, and let her vouch for you. [short HER WORD]
  · you: Walk to her lamp and let her tell Fenn you've been with her since midnight. → vouched [sees 2]
- stair: Get off the floor your own way. [short THE FIRE STAIR]
  · you: Go down the fire stair in the dark, with nothing in your hands. → stair [heat 1]
  · you key: Ride the stalled night lift down on the engineer's key. → keyed [heat 1] if sd_lift=fault

## vouched
*You walk the length of the floor to her lamp with the torches on your back. She tells Fenn, without looking up, that you've been at her desk since midnight, and he writes it down, because she said it. Weir will read it in the morning. You got half of what she sent you for, and she had to put her own name in a book to get you out.*
take: part
pay: full
→ end

## stair
*You go through the fire door and down, sixty-one floors of concrete and red light, with nothing in your hands. On the street it's raining. Somewhere above you Fenn is writing a time in his book, and a name.*
take: none
→ end

## keyed
*The night lift is still on the fault from the street, and it takes the engineer's key and nobody's card. Sixty-one floors down in a steel box that logs nothing, and out through the service door into the rain. Fenn's book has a time in it, and no way to put you in the lift.*
take: part
pay: full
→ end
