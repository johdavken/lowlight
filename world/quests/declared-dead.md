---
title: Declared Dead
with: [nix-direct, hicks]
starts: second-socket
after: intake_ledger
pitch: A card on Second Socket's JOBS board pays three times the rate to file one death certificate. The client is alive, and she'd like the certificate to be hers.
---

# board
stranger: Teodora Lund — seventy-odd, unhurried, kind in a way that doesn't leave room for argument
face: local-07

*The JOBS board at Second Socket is mostly junk: deck repairs, a lost cat with glass eyes, somebody's cousin who needs a door opened. One card is handwritten, on paper, in neat block capitals. ONE CHIRON DEATH CERTIFICATE. FILED CLEAN. And under that, a number three times the going rate.*

*Behind the counter, Silas pushes his glasses up and nods at the corner by the door.* "She's been waiting since six. She said she'd know the right people when they came in."

*The woman in the corner has grey braids to her waist and a red knitted scarf wound twice. She stands, folds her hands, and looks at both of you as if she'd ordered you.*

"Teodora Lund. The certificate is for me." *A small, patient smile.* "I'd like to stop existing. On paper. I'm not in a hurry about the rest."

view nix-direct: "I'd like to stop existing" is a sentence you've been trained to slow down for, whatever else she means by it, and "not in a hurry about the rest" made the hair on your arms stand up. She's calm. Calm isn't the same as fine; sometimes it's what decided looks like. You won't help anyone vanish until you know what she's vanishing from, and you won't treat her like a case in front of a shop counter either.
view hicks: You know this wish. It's how the dead blocks got their tenants: people who worked out that being on paper is how the city keeps hold of you. She's old, she's sure, and she's paying. Filing a Chiron certificate is a few hours with the right deck, and you have the right deck. You don't need to know her reasons. You'd rather nobody made her say them out loud in a shop.
view hicks if intake_ledger=given: Pell is in an SDG holding room because of a page from the Intake. Paper got her caught. Whatever Nix thinks of this, you think a woman who wants off the record has every right to get there before somebody hands her over.
view any: A job that pays three times the rate is a job with something wrong in it. You'd want to know what before anyone touches a deck.

- take: Take the job. → taken [set lund=taking]
- ask: Ask her why, properly. → asked
- refuse: Turn it down. → refused [set lund=refused]

## taken
*Teodora takes a folded paper from her scarf: her Chiron number, her date of birth, an address in the reconstructed blocks of Old Town, all in the same neat capitals.* "Everything they'll ask for. I wrote it down so I wouldn't have to say it."

*She presses the fee into a hand, in cash, and doesn't count it.* "Tonight, if you can. I'd like to sleep somewhere else tomorrow."

*Silas watches her go, then takes the card off the board and puts it face down under the till.*
→ filing
wait: after +2h · at hicks-room
next: The filing needs Hicks's deck. Go to his room.

## asked
*Teodora considers the question the way someone considers a stair they've climbed before. Then she sits down again and pats the stool beside her.*
→ why

## refused
*Teodora nods as if she'd expected it, and doesn't seem to mind.* "That's all right. Someone will." *She buttons her coat, winds the scarf once more, and goes out into the rain without an umbrella.*

*The card stays on the board. Silas looks at it for a long time, then goes back to his soldering.*
→ news
wait: after +12h
next: Get on with the night. Second Socket's board will still be there.

# why
*She talks the way people talk when they've rehearsed it in an empty room.*

"Forty years ago, MiraGen ran a trial in a clinic on my block. They paid in script, and I had a son to feed, so I signed. Lifetime follow-up, it said, in very small print." *She turns her left wrist over: a pale port under the skin, old and neat.* "Every month a car comes. They take blood. They take the readings off this. They've done it for forty years, and they'll do it until I die, because that's what lifetime means."

*She lets the wrist fall back into her lap.* "A dead woman's contract closes. I looked it up. My son's gone, I've given my things away, and I'd like the last of it to belong to me."

view nix-direct: Now you know what she's vanishing from, and it's real: a leash with a needle on the end. You also heard "I've given my things away", and in your work that's a phrase you never let pass. Both can be true at once: a woman reclaiming her body, and a woman putting her affairs in order. You can't tell which from here. If it's filed, you want her real name written down somewhere, on paper, so that one person in the city knows she was here.
view hicks: Forty years of a car outside her door. That's all you needed to hear. MiraGen owns her blood the way SDG wanted to own your grid work, and the only way out of a contract like that is to stop being the person who signed it. Nix is going to want to make it gentler. You'd let her, if gentler doesn't mean slower: every page that remembers Teodora Lund is a page MiraGen could find.
view any: It's a terrible contract and a clean way out. It's also a woman who's given her things away. You can't tell which one this is, and neither can anyone else at this counter.

- file: File it tonight. → filing-agreed [set lund=taking]
- page: File it, but keep her real name on paper at the Intake. → kept [set lund=taking, set lund_page=kept]
- refuse-why: Turn it down. → refused-why [set lund=refused]

## filing-agreed
*Teodora takes a folded paper from her scarf: her Chiron number, her date of birth, an address in the reconstructed blocks of Old Town.* "Everything they'll ask for." *She presses the fee into a hand, in cash.* "Thank you for asking. Most people don't."
→ filing
wait: after +2h · at hicks-room
next: The filing needs Hicks's deck. Go to his room.

## kept
*Teodora frowns at the idea for the first time.* "A page." *She looks at the window, at the rain, at nothing.* "Paper is what got me into this." *Then, after a long breath:* "Initials only. And nobody comes looking with it."

*She writes it herself, on the back of the job card: T.L., a date of birth, and a thumbprint in red ink from the stamp pad on Silas's counter. Then she takes out her Chiron number and the fee.*
→ filing
wait: after +2h · at hicks-room
next: The filing needs Hicks's deck. Go to his room.

## refused-why
*Teodora nods, unoffended.* "You listened. That's more than the car does." *She stands, winds the scarf once more, and goes out into the rain without an umbrella.*

*The card stays on the board. Silas takes his glasses off, cleans them on his shirt, and doesn't put them back on for a while.*
→ news
wait: after +12h
next: Get on with the night. Second Socket's board will still be there.

# filing
*Hicks's room: the cot, the pipes, the TV hissing static in the corner. The deck's fans spin up. Chiron's records office is the dullest door in Lowlight: a municipal form, a doctor's ID borrowed from a clinic that closed in the spring, a field for each thing the city wants to know about how a life ended.*

*Every field is filled. The cursor blinks in the last one: CAUSE OF DEATH. Natural causes is what goes there for a woman of seventy-odd, and nobody checks it.*

*A message lands on the deck. Unknown number, block capitals.* IS IT DONE? I'VE LEFT THE KEY UNDER THE MAT FOR THE NEXT ONE.

view nix-direct: She's left her key for the next tenant. Maybe that's someone moving to the dead blocks, tidy to the end. Maybe it's what people do on the last night. You've sat with people on both kinds of night, and they sound the same on the phone. You want to hear her voice before anyone presses anything, and you know Hicks thinks that's you deciding for her.
view hicks: She's packed and gone. Every hour this sits unfiled is an hour the car could come and find her halfway out the door. You hear what Nix hears in that message; you're not stupid. But you also know what it is to leave a key under the mat, and you know that wanting to stop being someone isn't the same as wanting to stop. You'd send it now.
view hicks if warmth≥mid: You were fifteen the first time SDG opened a file on you, and that night you nearly walked into the dead blocks and didn't come out. Pell talked you back. You've never told anyone that. You're thinking about it now, and you're not sure which side of this it puts you on.
view any: One key press and Teodora Lund is dead on paper. Whatever the message means, someone in this room has to decide before the deck goes to sleep.

- submit: Send the filing. → filed [set lund=dead]
- call: Call her first. → called
- hold: Don't send it. → held [set lund=alive]

## filed
*The form goes. A spinning wheel, then a confirmation number and a line of grey text: RECORD UPDATED. DECEASED.*

*The deck goes quiet. Thirty seconds later, a reply from the unknown number:* THANK YOU. *Then the number stops existing too.*
→ after

## called
*It rings five times. Then wind, and rain on plastic, and her voice, perfectly calm.*

"I'm at the edge of the blocks, by the wall. There's a woman here with a lamp who says she has a room." *A pause.* "You're kind to call. If you need to see me say it, come down. I'll be by the fire. The form will keep." *The call ends.*

*The deck goes into its bag with the form still open on it, one key from sent.*
→ by-the-fire
wait: at dead-blocks
next: She's by the fire in the dead blocks. Go and hear her say it.

## held
*The cursor keeps blinking. Nobody presses anything, and after a minute the deck dims to save its battery.*

*The unknown number writes again, much later:* I UNDERSTAND. *Then nothing, all night.*
→ after

# by-the-fire
stranger: Teodora Lund — seventy-odd, unhurried, kind in a way that doesn't leave room for argument
face: local-07

*Teodora sits on a plastic chair by the drum fire, her red scarf wound twice, a small bag at her feet that seems to be everything. Beside her, a woman with a hand lantern stands under the stairwell, saying nothing, waiting to show her up. The rain ticks on the corrugated sheet across the gap in the wall.*

"You came," Teodora says, and sounds pleased about it. "Ask me, then. I'll tell you the same thing I told the phone."

*In the bag, the deck's screen glows: the form, open, ready.*

view nix-direct: She's sitting down, she's dry enough, she has a bag and someone waiting with a lamp to show her to a room. That's not what the worst nights look like. It isn't proof either. You can ask her straight, here, to her face, and whatever she answers, you'll have heard it from her and not from a phone.
view hicks: A woman with a lamp under the stairwell. That's someone taking her in. That's the dead blocks doing the thing they're for. You can see Nix weighing it, and you don't hurry her, which surprises you.
view any: She's somewhere, with someone, and she's asked. It's still one key press.

- send: Send it with her watching. → sent [set lund=dead]
- wait: Tell her you'll send it in the morning. → morning [set lund=morning]

## sent
*The form goes. Teodora watches the screen until the grey text comes up, and a little breath comes out of her that might be a laugh.* "Oh," she says. "That's lighter than I thought."

*She picks up her bag. The woman with the lantern goes up the stairs ahead of her, one landing at a time, until the light is just a light, high in the tower.*
→ after

## morning
"The morning, then," Teodora says, without complaint. "I'll be here. I'm not going anywhere, as it turns out." *She follows the lantern up the stairwell.*

*The form sits open on the deck, ready. Whatever the morning is, it'll be somebody's choice, and at least it won't be tonight's.*
→ after

# news
*A message from Silas, the next evening: a photo of the JOBS board. Teodora's card is gone. Under it is a printout of a Chiron notice, the kind the records office posts publicly for a week. LUND, TEODORA. DECEASED. CAUSE OF DEATH: NOT STATED.*

*Silas has written under it:* someone did it fast and sloppy. a blank cause gets audited. miragen will come looking for a dead woman in about a week.

view nix-direct: Someone filed it, and filed it badly. Wherever she is, she's dead on paper and that paper won't hold. You turned this down for reasons you'd stand by, and you'd still rather she wasn't caught out by somebody's careless job. You don't know if fixing it is helping her or finishing what you refused.
view hicks: A blank cause of death. Amateurs. In a week MiraGen sends someone to look at a grave that doesn't exist, and then they look for her. You could clean that filing in an hour. You turned this down, and now you're thinking about it anyway.
view any: Somebody else did the job you didn't. Badly. Now it's yours again, if you want it.

- clean: Clean up the filing. → cleaned [set lund=dead]
- leave: Leave it. → left [set lund=sloppy]

## cleaned
*It takes an hour. CAUSE OF DEATH: NATURAL CAUSES. A doctor's ID from a clinic that closed in the spring. The audit flag drops off the record without a sound.*

*Nobody will ever know who did it, or that it needed doing.*
→ after

## left
*The notice stays up its week. Then the board is cleared for new cards, and someone pins a lost dog over the space where it was.*
→ after

# after if lund=alive
*Later. The rain has thinned to a mist that hangs in the light from the window. The deck is shut. Somewhere in Old Town there's a woman with a port in her wrist and a car coming next month, alive on paper, because of tonight.*

view nix-direct: You held it, or you're why it was held. You'd do it again and you're not sure you were right. Hicks hasn't said a word about it, and you're bracing for him to.
view nix-direct if warmth≥mid: When you left the Orchid, there was a week you thought about not being anyone at all. A new name, no paper, gone. A woman at a co-op sat with you until you decided to stay Nix. You've never told anyone. It's why you couldn't press the key, and you might tell him that, if he asks the right way.
view hicks: Nix wouldn't let it go, or you let her stop you. Either way there's a woman out there on a leash tonight. You're angry, and under that you're not sure you are, because you remember being talked back once yourself.
view hicks if warmth≥mid: You were fifteen when Pell talked you back from the dead blocks. You've never told anyone. You keep thinking Nix would have done what Pell did.
view any: It's done, or not done. The room is quiet in the way rooms get after an argument nobody actually had.

- ask-why: Ask why it mattered so much to them. → asked-why
- leave-it: Leave it for tonight. → quiet

## asked-why
*The question sits there. The pipes knock. Outside, a tram goes by on the level below and the window hums.*

*It takes a long time for anyone to answer, and when the answer comes, it isn't about Teodora at all.*
→ end

## quiet
*Nobody says anything. After a while someone puts the kettle on, which is its own kind of answer. Two cups. The rain keeps on.*
→ end

# after
*Later. The rain has thinned to a mist that hangs in the light from the window. The deck is shut. Somewhere a woman named Teodora Lund has stopped existing, or will by morning, and a car will pull up next month to an empty flat.*

view nix-direct: She's gone, the way she wanted. You let it happen, or you couldn't stop it, and you're not sure which you'd call it. Hicks thinks this was a rescue. You think it might have been, and you'll think about that key under the mat for a long time.
view nix-direct if warmth≥mid: When you left the Orchid, there was a week you thought about not being anyone at all. A woman at a co-op sat with you until you decided to stay Nix. You've never told anyone. You understand Teodora better than you'd like, and you might say so, if he asks the right way.
view hicks: She's out. You did that, or you watched it get done. It should feel cleaner than it does. Nix's face when the key went down is the thing you keep seeing, and you can't tell if she thinks you were wrong or if she's afraid you were right.
view hicks if warmth≥mid: You were fifteen the first time SDG opened your file, and that night you nearly walked into the dead blocks and didn't come out. Pell talked you back. You've never told anyone. You keep thinking Nix would have done what Pell did, and you're not sure if that's why you trust her or why she scares you.
view any: It's done. The room is quiet in the way rooms get after an argument nobody actually had.

- ask-why-dead: Ask why it mattered so much to them. → asked-why-dead
- leave-it-dead: Leave it for tonight. → quiet-dead

## asked-why-dead
*The question sits there. The pipes knock. Outside, a tram goes by on the level below and the window hums.*

*It takes a long time for anyone to answer, and when the answer comes, it isn't about Teodora at all.*
→ end

## quiet-dead
*Nobody says anything. After a while someone puts the kettle on, which is its own kind of answer. Two cups. The rain keeps on.*
→ end
