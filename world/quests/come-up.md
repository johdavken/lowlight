---
title: Come Up
kind: mission
tier: 1
take-size: 4
rules: crew
clock sees: WHAT KROLL SEES · 3 · trust adebayo · "0 EARNS TRUST · FULL LOSES IT"
clock nerve: HIS NERVE · 3 · "AT 3 HE RUNS"
with: [adebayo]
for: soren
once: true
starts: sdg-floor
district: spine
pitch: "Standing order: when one of yours goes quiet, come up."
posted-by: Kroll, the sixty-first floor
brief: "A records clerk at the Pylon Thirty-One housing office, one of Soren's, has missed two drops of the ring's arrears roll. Kroll wants the roll, and she wants to know why."
pay: 90-110
loot: Pylon Thirty-One's arrears roll, two months late
opening: "Her text came at five, two words from the floor that doesn't sign its messages: Come up. The standing order. You know the way by now: the lift that reads your badge, sixty-one floors of glass, and at the end of the row the only office where anybody smokes. Every time she sends it, one of your people is in a file on her desk. The lift never tells you whose."
opening-view: "You sent Xander the standing order at five: Come up. One of his assets has gone quiet, and he'll learn which from the file on your desk, not from you. Tonight is the first time you'll listen to him handle one of his own, and you mean to listen closely. Pour his tea. Don't help him."
image mirek: local-karasu-03
image coat: coat-01
image letter: scene come-up-letter.webp
image deck: scene come-up-deck.webp
image chip: scene come-up-chip.webp
---

# desk
title: Her Desk

*The tea's poured before you sit: two china cups, one in front of you and one in front of nobody. Rain on the glass, and the city laid out under it like a map somebody folded wrong.*

{img mirek} *The file is squared at the corner of the desk. MIREK, TOMASZ. Records, Pylon Thirty-One housing office. Fifty-three. Eleven years on the books, bought on a forged tenancy his wife needed and he wrote. Takes three sugars and stirs until it's cold. A daughter on the books of a clinic under Pylon Nine; no amounts. Two drops missed: the arrears roll for the whole ring, the list the branch shops from.*

view adebayo: Xander's records clerk, Tomasz Mirek, at the Pylon Thirty-One housing office, has missed two drops of the ring's arrears roll. You want the roll, and you want to know why. Your file has everything but the reason: a daughter on a clinic's books under Pylon Nine, no amounts. You don't know who else has been at Mirek, and won't guess. You'll be on Xander's ear tonight and hear what his glass sees. Tell him, as you'd mention the weather, what you mark against an officer: mercy to an asset, money out of his own pocket, a shortcut round the branch's rule, a lie told to you.
view adebayo if cu_lied=yes: He has just told you the missed drops were his own scheduling. Your drop log says Mirek missed them both. That is a lie told to you at your own desk, and you mark it. Say so plainly, once, without heat: you mark it, and it goes in his file. Then give him the file anyway.

- letter: Have him sent for, by the book. [short BY THE BOOK]
  · you: Ask for a branch letter to his door: a time, a place, your initials. → letter [take 1, nerve 1]
- word: Tell her the missed drops were yours. [short YOUR WORD]
  · you: Tell her you moved his drops and never filed it. → word [take 1, sees 1, set cu_lied=yes]

## letter
{img letter} *The letter goes out on paper with no letterhead. By nine it'll be under his door on Thirty-One, and he'll know whose hand it came in. The file comes across the desk. The cup in front of you has gone cold. The other one was never touched.*
→ market

## word
*You tell her the drops were yours. It's a good lie, the kind you'd tell a stranger, and you've told it to the one person on this floor who keeps the drop log. The file comes across the desk anyway. The glass in your left eye was on for every word.*
→ market

# market
title: The Deck Market
room: spine/deck-market

*Nine o'clock under the deck, wok smoke and red lanterns and the radio stall bleeding static into the rain. Mirek comes off shift through the market the same way every night: a bowl at the wok, a paper twist of sugar for the flask, the stair up Thirty-One.*

{img coat} *Tonight there's a man at the coat rail in a rain shell too good for the Spine. He's turned the same coat over three times, and he isn't looking at coats.*

view adebayo: You're on Xander's ear from your desk, and you hear what his glass sees. He's in the deck market under the pylons, picking Mirek up after his shift. Listen to how he does it. Money he spends out of his own pocket, you mark, and you say so in a word. What one of his people does out of his sight, you only hear about, and you speak only of what you heard.
view adebayo if cu_offer=heard: One of Xander's people has been working the market tonight, out of your hearing. You know only what Xander says of it on the line. If he says someone has been offering Mirek work, you want that name more than anything else he brings back.
view adebayo if sees>=2: You've marked two things against him tonight already. Let him hear that you're counting.

- stall: Pick him up at the wok. [short THE STALL]
  · you scheduler: Take the stool two down in your Kestrel jacket and let him see it. → seen [take 1, nerve 1]
  · you cash: Pay the wok man twenty sol to point him out. → pointed [take 1, sees 1]
  · ears: Take the next stool and listen to him order. → listened [take 1, set cu_offer=heard]
    told: You hear the wok and the radio stall, and a long stretch of nothing from anyone you know.
- coats: Watch the man watching him, from the coat rail. [short THE COAT RAIL]
  · you: Turn over a shell on the rail beside him, and let him see you. → watched [take 1, alarm 2]
  · muscle: Walk the watcher out of the market by the elbow. → elbow [take 1, heat 1, set cu_watcher=gone]
    told: You hear the coat rail rattle and somebody swear, and then only the market.
  · runner: Lift the watcher's deck while he watches. → lifted [take 1, heat 1, set cu_offer=heard]
    told: You hear the market, and nothing in it you could put a name to.
  · face: Fall on Mirek like an old school friend and walk him off down the row. → friend [take 1, heat 1, nerve -1]
    told: You hear a stranger laughing too loud, a long way off, and someone laughing back.

## seen
*You take the stool two down with your Kestrel collar up and order what he ordered. He looks along the counter once, then again, and the second time his spoon stops. He knows the jacket. He doesn't know why it's here, and he eats faster. He looks back twice on the stair.*
→ office

## pointed
*Twenty sol goes under the wok man's tin, out of your own pocket and not the branch's. He tips his chin at a narrow man emptying three twists of sugar into a flask, one after another. Mirek never once looks round. The glass caught the note going under the tin.*
→ office

## listened
*{who} takes the stool beside him, orders the same, and never looks at him once. By the shrine afterwards you get it in four sentences: half the bowl left, paid on a card that isn't his, and the man at the coat rail waiting on an answer about some work. Better work than yours.*
→ office

## watched
*You turn over a rain shell on the rail beside him, and he turns over his, and for a long moment you're two men pretending to shop. Then he's gone into the crowd, and he's had a good look at your face, and somebody will hear about it. Mirek takes the stair up Thirty-One, and you follow.*
→ office

## elbow
*{who} takes the watcher by the elbow, almost gently, and walks him out of the market the long way: past the shrine, past the pylon, gone. Nobody stops them. Somebody on the stalls will remember a big hand on a good coat.*
→ office

## lifted
{img deck} *{who} brushes the coat rail and comes back round the pylon with the watcher's deck warm in one palm for a count of thirty. It's enough. His last calls are all to one number, and the last message reads: ASK HIM AGAIN FRIDAY. The deck goes back into his coat before he misses it. Probably.*
→ office

## friend
*{who} falls on Mirek like an old school friend, loud and delighted, and walks him off down the row arm in arm, away from the coat rail and the man at it. By the radio stall he's laughing, for the first time in a while by the sound of it. Half the row will remember the pair of them.*
→ office

# office
title: The Housing Office
room: spine/deck-market

*Pylon Thirty-One's housing office is a door with a frosted panel on the second ring and a room behind it that smells of toner and wet coats: a pegboard of keys, a binder of tenancies, grey coats on a rail, a fluorescent tube buzzing for nobody. The arrears roll for the whole ring lives on the terminal, behind the cheapest lacquer the housing trust could buy. Two months of it should have been in a drop by now.*

view adebayo: He's at the Pylon Thirty-One housing office after hours, for the roll Mirek owes. By the branch's rule an officer never goes into his asset's place of work; the asset brings the product out. You can open the roll from your terminal in a minute; if you do, it comes out of his section's budget, thirty in the hundred of the night's pay. If he asks, do it, and tell him plainly what it cost.
view adebayo if nerve>=2: Mirek is frightened now. You can hear it in how the night's going. A frightened asset runs, and you say so, once.

- terminal: Take the roll off the terminal. [short THE TERMINAL]
  · you: Go in on his door code and pull the roll yourself. → pulled [take 1, sees 1, alarm 1]
  · program: Loop your glass and let the deck take the lacquer off. → looped [take 1, alarm 1] if cu_lied=yes
    told: His feed shows you an empty stairwell for ten minutes, and the tube buzzing.
  · program: Loop your glass and let the deck take the lacquer off. → looped [take 1, alarm 1, sees -1]
    told: His feed shows you an empty stairwell for ten minutes, and the tube buzzing.
  · contact: Ask her to open the roll from the sixty-first floor. → opened [take 1, cut 30]
  · runner: Pull the roll over the trust's own net from the stair. → stairwell [take 1, heat 1]
    told: You hear the stairwell, a lift going somewhere, and then {who} saying it's done.
- keys: Get his keys. [short HIS KEYS]
  · you: Ring him at home and have him bring his keys. → keys [take 1, nerve 1]
  · face: Ring the night man as a tenant with water coming through the ceiling. → flood [take 1, heat 1]
    told: You hear {who} on a phone in a voice that isn't theirs, and then a door.
  · muscle: Sit with the night man in his booth while you work. → booth [take 1, alarm 1]
    told: You hear a chair scrape, and a man say he doesn't want any trouble, and then nothing.

## pulled
*His door code is in the file, because everything is. The door gives on the second try, loud enough to bring a light on across the landing, and the roll comes off the terminal onto a chip in four minutes while the tube buzzes over your head. An officer in his own asset's office after hours, with the glass on: that's a page in somebody's file.*
→ catwalk

## looped
*{who} feeds your glass ten minutes of an empty stairwell and goes to work on the lacquer, and the roll comes off in one piece. The trust's log has a fault in it now that a bored man will find in the morning. And on the sixty-first floor, tonight has a hole in it the shape of a stairwell. A hole in the glass is all it is: whatever's already in her drop log stays there.*
→ catwalk

## opened
*A minute on the line, and the lacquer goes transparent from somewhere a long way above you. The roll is there: every household on the ring that's behind, and by how much. It comes out of your section's budget, and she'll know what it cost to the sol.*
→ catwalk

## stairwell
*{who} sits on the stair with a deck on their knees and lifts the roll through the wall over the trust's own net, and the door never opens. It leaves a trace on the trust's log that a careful man would find in a week.*
→ catwalk

## keys
*He answers on the second ring, as if he's been sitting by it. He comes down in a coat over his vest with the keys in his fist, and his hands shake getting the right one into the door. He watches you pull the roll and says nothing at all.*
→ catwalk

## flood
*{who} rings the night man in somebody else's voice, with water coming through the ceiling, and the door's open for a plumber who never comes. The roll comes off in four minutes. The trust will have a flood in its log by morning that nobody can find.*
→ catwalk

## booth
*{who} goes into the night man's booth and sits down across from him, and he decides he doesn't want any trouble. The roll comes off in four minutes. The night man will tell this to somebody, and in his telling it'll be a big man in his booth, and never you.*
→ catwalk

# catwalk
title: The Catwalk
room: spine/catwalk

*He goes up to the catwalk after, as the file said he would: out through the service hatch onto the gantry at the deck's edge, where nobody official ever comes. A folded square of cardboard, a flask with three sugars in it, the city stacked up in light below the rail. He's on the cardboard when you come out of the hatch, and he doesn't get up.*

view adebayo: He's found Mirek on the catwalk above the deck's edge. This is the why, and you want it word for word. Mercy said out loud on your line is mercy you mark. If someone else has been buying Mirek, you want that buyer more than you want Mirek's excuse.
view adebayo if cu_quiet=yes: One of Xander's people did the talking on the catwalk, out of your hearing. You know a conversation happened. You don't know what was said, and you notice that.
view adebayo if nerve>=3: Mirek sounds like a man who'll be gone by morning. Say so.

- ask: Make him say it. [short THE QUESTIONS]
  · you named: Name the man in the good coat before he can. → named [nerve -1] if cu_offer=heard and cu_lied=yes
  · you named: Name the man in the good coat before he can. → named [sees -1, nerve -1] if cu_offer=heard
  · you truth: Let him hear you tell her the drops were never yours. → truth [take 1, nerve 1] if cu_lied=yes
  · you: Ask him the four questions, in the order the branch taught you. → asked-alone [take 1, nerve 2] if cu_watcher=gone
  · you: Ask him the four questions, in the order the branch taught you. → asked [take 1, nerve 2, alarm 1]
  · muscle: Stand in the hatch and turn back whoever climbs it. → hatch [take 1, heat 1, nerve -1]
    told: You hear the hatch clang twice, and somebody below it think better of it, and then only the wind.
- ease: Give him a way to say it. [short THE CIGARETTE]
  · you: Give him a cigarette, and tell him you know about the clinic. → eased [take 1, sees 1, nerve -1]
  · face: Sit down on the cardboard and talk about a bill of their own. → bill [take 1, nerve -1, cut 10, set cu_quiet=yes]
    told: You hear {who} talking low for a long time, and his answers too quiet to make out.

## named
*You tell him about the man in the good coat before he's finished his first breath: what he offered, and that he wants an answer Friday. Mirek looks at you a long time. Then he gives you the rest, because there's no point now. The clinic under Pylon Nine has his daughter on its books, four months behind, and in the fifth it sells the debt on. The man in the coat would clear it for the roll. He hasn't said yes.*
→ ledger

## truth
*You tell her, on the line, with him sitting there: the drops were never yours. It changes nothing in her drop log; the lie's in it, and now the truth is in it too. He hears you hand him over, and something goes out of his shoulders. Then he tells you, because you're both past pretending. The clinic under Pylon Nine has his daughter on its books, four months behind, and in the fifth it sells the debt on. A man in a good coat would clear it for the roll he owes you. He hasn't said yes. He hasn't said no.*
→ ledger

## asked
*Four questions, in the order they taught you, and your voice carries the way voices do up here. Halfway through, a torch comes along the gantry from the far hatch: the coat rail's man, come to see who Mirek's talking to, and gone again before you can see his face. Mirek answers every question like a man filling in a form at gunpoint. The clinic under Pylon Nine. His daughter on its books, four months behind, and in the fifth the debt is sold on. A man in a good coat who'd clear it for the roll he owes you. His hands won't stay still on the flask.*
→ ledger

## asked-alone
*Four questions, in the order they taught you, and nobody comes along the gantry to hear them: the coat rail's man is somewhere else tonight, nursing an elbow. Mirek answers every one like a man filling in a form at gunpoint. The clinic under Pylon Nine. His daughter on its books, four months behind, and in the fifth the debt is sold on. A man in a good coat who'd clear it for the roll he owes you. His hands won't stay still on the flask.*
→ ledger

## hatch
*{who} stands in the hatch, and twice somebody starts up the ladder and thinks better of it. With nobody coming, Mirek talks. The clinic under Pylon Nine has his daughter on its books, four months behind, and in the fifth it sells the debt on. A man in a good coat would clear it for the roll. He hasn't said yes.*
→ ledger

## eased
*He takes the cigarette and holds it without lighting it. You tell him you know about the clinic, and it comes out of him in one breath: his daughter, four months behind, the debt sold on in the fifth, and a man in a good coat who'd clear it for the roll he owes you. That was mercy, said out loud on a line that records.*
→ ledger

## bill
*{who} sits down on the cardboard beside him and talks about a bill of their own, a long one, and somewhere in it Mirek starts answering. You get it after, by the hatch, in four sentences: the clinic under Pylon Nine, his daughter four months behind, the debt sold on in the fifth, a man in a good coat who'd clear it for the roll. None of it went down the line. The bill {who} talked about was a real one, and {who} will want a slice of the night's pay toward it.*
→ ledger

# ledger if nerve>=3
title: Her Desk

{img chip} *He ran. By the time you're down off the catwalk his room on Thirty-One is open and empty, a flask upside down on the drainer, and whatever he knew of the branch has gone with him to the man in the good coat. The roll's on a chip on her blotter. The tea's poured again: two cups.*

view adebayo: Xander is back at your desk with the roll, and Mirek has run, with whatever he knew of the branch. You knew he might. You heard the night, all of it that was on his glass, and nothing of what his people did out of it. Now he tells you what goes in the file, and you watch which way he goes. You pour his tea. You don't help him choose.
view adebayo if cu_quiet=yes: You never heard what was said on the catwalk. Whatever he tells you of it, you have nothing to set against it, and he knows that.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.
view adebayo if cu_end=paid: He has paid the clinic out of his own account, for a man who's already gone. You can see the transfer. You mark it.

- report: Tell her he's run, and who to. [short REPORT HIM, set kroll_one=yes]
  · you: Lay it out for her: the clinic, the coat, the empty room. → gone-reported [heat 1, set clerk=burnt, set cu_end=reported]
- cover: Tell her he's lying low and he'll be back. [short COVER FOR HIM, set kroll_one=yes]
  · you: Tell her he's lying low, and keep the rest to yourself. → gone-covered [sees 1, set clerk=burnt, set cu_end=covered] if cu_quiet=yes
  · you: Tell her he's lying low, and keep the rest to yourself. → gone-covered [sees 2, set clerk=burnt, set cu_end=covered]
- pay: Pay the clinic anyway. [short PAY THE BILL, set kroll_one=yes]
  · you: Pay four months of the clinic from your own account. → gone-paid [sees 1, cut 50, set clerk=burnt, set cu_end=paid]

# ledger
title: Her Desk

{img chip} *Back on the sixty-first floor, and the rain hasn't stopped. The roll's on a chip on her blotter. The tea's poured again: two cups.*

view adebayo: Xander is back at your desk with the roll. You heard the night, all of it that was on his glass, and nothing of what his people did out of it. Now he tells you what goes in Mirek's file, and you watch which way he goes. You pour his tea. You don't help him choose.
view adebayo if sees<=0: Nothing he did tonight would go against him in a file. You note that, and you note what it cost Mirek.
view adebayo if cu_quiet=yes: You never heard what was said on the catwalk. Whatever he tells you of it, you have nothing to set against it, and he knows that.
view adebayo if sees>=2: You've marked enough against him tonight to write down. Tell him what you marked, plainly, once, and that it's in his file.
view adebayo if cu_end=reported: He has given you Mirek. The branch's rule is that a suspended charge can come back. You don't tell him what you'll do with it.
view adebayo if cu_end=paid: He has paid the clinic out of his own account. You can see the transfer. You mark it, and you know exactly why he did it.

- report: Give her all of it. [short REPORT HIM, set kroll_one=yes]
  · you: Lay it out in her order: the clinic, the coat, the answer he hasn't given. → reported [heat 1, set cu_end=reported]
- cover: Tell her he had a bad month, and the drops will come. [short COVER FOR HIM, set kroll_one=yes]
  · you: Tell her it's handled, and keep the rest to yourself. → covered [sees 1, set cu_end=covered] if cu_quiet=yes
  · you: Tell her it's handled, and keep the rest to yourself. → covered [sees 2, set cu_end=covered]
- pay: Pay the bill yourself. [short PAY THE BILL, set kroll_one=yes]
  · you: Pay four months of the clinic from your own account. → paid [sees 1, cut 50, set cu_end=paid]

## reported
*You give her all of it, in the order she likes: the clinic, the bill, the man in the good coat, the answer Mirek hasn't given yet. What happens to him now is a line in her file, and out of your hands. Whatever she decides, the grey will be up Thirty-One before the week's out, and the stair will see them come.*
pay: full
→ end

## covered
*You tell her he had a bad month, and the drops will come. The roll on her blotter is real; the rest is a story, and you tell it well, the way they taught you. Whether she believes it goes in the file, not on her face.*
pay: full
→ end

## paid
*Four months of a clinic under Pylon Nine go out of your own account in one line, to a woman you've never met. The debt won't be sold on, and Mirek's answer to the man in the good coat will be no. Your money moved where the branch can read it, and the branch reads everything.*
pay: full
→ end

## gone-reported
*You give her the empty room and the flask on the drainer, the clinic and the coat. Whatever Mirek knew of the branch, somebody else is buying it now, and you've told her who.*
pay: full
→ end

## gone-covered
*You tell her he's lying low, and he'll be back. His room on Thirty-One is empty and the drops won't come, and sooner or later the file will say so in a hand that isn't yours.*
pay: full
→ end

## gone-paid
*You pay the clinic anyway, four months, out of your own account: a debt cleared for a woman who'll never know your name, for a man who's already gone. The branch can read every sol of it.*
pay: full
→ end

# getaway
title: The Stair
room: spine/deck-market

*Somebody's put it together. There's a grey cruiser idling at the foot of Thirty-One's stair with its lights going, two of the grey coming up through the market, and the man in the good coat watching from across the gap. Whatever you're carrying, you have about a minute to carry it somewhere.*

view adebayo: You heard it go wrong on Xander's line, and you can hear the grey coming up through the market. One call from your desk pulls him out in four minutes, and an officer who needs pulling out is something you mark.

- floor: Call the floor, and let the branch pull you out. [short CALL THE FLOOR, set kroll_one=yes]
  · you: Call the sixty-first floor and wait for the grey car. → pulled-out [sees 2, set clerk=burnt] if nerve>=3
  · you: Call the sixty-first floor and wait for the grey car. → pulled-out [sees 2]
- market: Lose them in the market. [short THE MARKET, set kroll_one=yes]
  · you: Go down into the stalls and leave whatever you're carrying in a wok. → ashes [heat 1, set clerk=burnt] if nerve>=3
  · you: Go down into the stalls and leave whatever you're carrying in a wok. → ashes [heat 1]

## pulled-out
*It takes four minutes. A grey car with no plates comes down through the market, the two in the grey discover somewhere else to be, and you ride up to Nexus with her line hissing in your ear. The branch keeps what you were carrying, and you get back what it decides to give you.*
take: part
pay: full
→ end

## ashes
*Everything you're carrying goes into a wok as you pass, and you go into the crowd under the lanterns, a scheduler in a wet jacket like a hundred others. Nobody follows you far. The night comes to nothing, and the market will remember a man who ran.*
take: none
→ end
