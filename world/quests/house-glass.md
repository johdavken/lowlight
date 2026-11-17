---
title: House Glass
art: house-glass.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: null
trust: 1 / 2
people: [Venn]
pitch: An SDG man wants a woman found off the books. The photo's fifteen years old, and you know the face.
posted-by: Arlo Venn, SDG, off the books. A card in Hicks's coat.
brief: "Find a woman called Lark, once of the Glass Orchid, and report the condition of her left eye. Double finder's rates, no ticket asked. The man paying is the Sentinel who pulled Hicks's."
pay: 90-110
loot: Venn's retainer
---

# ask
title: The Card

*An hour ago, at the Tilt, a man in SDG grey sat down on the stool beside you and ordered nothing. Sentinel Arlo Venn. Grey beard, rain shell, the same patient voice he used the week he pulled your ticket.*

*"You said no to me once," he said. "I respected it. I'm asking again." He left a card under your glass: double finder's rates, and a photograph on paper. A woman of twenty or so, two eyes, the left one catching the light the way house glass does. On the back, in pencil: LARK. GLASS ORCHID.*

*You know the face. You've sat across from it once a week for a year.*

*Now you're in her doorway, with the card in your coat and the retainer folded inside it. Nix is at her desk with the lamp down, writing on paper, initials only. The pen keeps moving.*

view nix-direct: Hicks has come in at an odd hour, with his coat still on and something in it. You don't know what. If he tells you, you'll know the name. If he only asks you to sit his ear on a job in Velvet and says "Lark", you'll know it too: it was yours, at the Orchid, and nobody has said it to you in nine years. Then you'll say nothing about it, and wait to see whether he tells you himself.

- lay: Lay the card on her desk. → told [set nix1=asked, set nix_asked=yes]
- name: Ask her to sit your ear on a Velvet job. Give her only the name. → kept [set nix1=dug]

## told
*She looks at the photograph for a long time without touching it. "Lark," she says, like a word in a language she's stopped speaking. "Somebody's paying for that name." She takes a bead out of the drawer for your ear. "Then I'm listening."*
→ house

## kept
*"Velvet," she says. "Who?" You say Lark. Her pen stops for a moment, then finishes the line. "I know the Orchid," she says, and takes a bead out of the drawer for your ear. Her face doesn't do anything at all.*
→ house

# house
title: The Glass Orchid
stranger: Vesna Halloran — the Glass Orchid's Host: gracious, unhurried, never says no outright
room: velvet/glass-orchid

*The Glass Orchid keeps its lights low and its carpets thick, so nobody hears anyone arrive. Vesna Halloran meets you at the lectern herself, which means somebody told her you were coming. She has a house book open under her hand, on paper.*

*"Lark," she says, pleasantly. "Nine years. She left us, the way people do. The house took its glass back, of course, and it went back to stock." She turns a page you can't see. "Who's asking, Mr Hicks? Or shall I guess?"*

*{{"She's lying about something,"}} Nix says in your ear. {{"She always is. Find out which thing."}}*

view nix-direct: You're on Hicks's ear and he's standing in the Glass Orchid, in front of Vesna, who walked you to the door nine years ago. Your voice stays level. You know the house book, the lectern, the way Vesna turns a page so nobody can read it. Tell him one useful thing about the house, and no more.

view nix-direct if nix1=dug: He hasn't told you Lark is you. You haven't told him either. Hearing Vesna say the name in your ear costs you something; keep it out of your voice.

- host: Let her host you. Take the drink, take your time. → read / rough [check cool 50]
- book: Read the house book upside down while she talks. → read / rough [check wits 50]

## read
*"Returned to stock," Vesna says again, and smiles, and it's the one thing she said twice. On the way out a young companion with her hair pinned up holds the door for you longer than she has to. "Nobody returns glass," she says, under her breath, and lets it shut.*
→ money

## rough
*Vesna gives you nothing she hadn't decided to give you, and a drink you didn't want. On the way out a young companion with her hair pinned up holds the door for you longer than she has to. "Nobody returns glass," she says, under her breath, and lets it shut.*
→ money

# money
title: Second Socket
room: karasu/second-socket

*Venn's retainer came in a paper envelope, in cash, which is how you know it isn't SDG's. Second Socket's back counter has a deck that can see where cash came from, if it was ever anything but cash. The runner who brought the envelope to the Tilt drinks here too. He's in the corner, counting something.*

*{{"Who pays a Sentinel to find a woman?"}} Nix says. {{"Not SDG. SDG would just take her."}}*

view nix-direct: Someone is paying to find you, and you're about to hear who. You want to know more than you want to look like you do. Ask him one question about the money, not about yourself.

view nix-direct if nix1=dug: He still hasn't said the name is yours. You're starting to wonder whether he knows. Don't ask.

- trace: Jack the counter's deck and walk the cash back to its account. → traced / smeared [check tech 50 grid]
- shake: Sit down across from the runner and lean on him. → traced / smeared [check body 50]

## traced
*The money comes out of a household account in the Nexus, a commissioner's, no name on it you can read from here. And the brief that came with it wasn't Venn's handwriting. It says: Locate. Report the condition of the left eye.*
→ stairs

## smeared
*It takes longer than it should, and somebody sees you take it. The money comes out of a household account in the Nexus, a commissioner's, no name on it you can read from here. And the brief that came with it wasn't Venn's handwriting. It says: Locate. Report the condition of the left eye.*
→ stairs

# stairs
title: The Back Alley
room: karasu/intake-back-alley

*Rain on the bins behind Hae's. You've had a Sentinel on you since Velvet: grey shell, no hurry, always a block back. The Intake's back stair is thirty metres ahead. If he sees which door you go in, he has her.*

*{{"Don't come up,"}} Nix says. {{"Not yet. Not with him on you."}}*

view nix-direct: There's a Sentinel following Hicks down the alley under your window, and the door he's walking toward is yours. You want him to lose the tail before he comes anywhere near your door. Say so, once, and then let him work.

- kitchen: Go in the back of Hae's and out through the kitchen. → lost / followed [check reflex 50]
- corner: Wait for him at the corner and put him against the wall. → lost / followed [check body 50]

## lost
*Through the steam, past the stock pots, Hae's cook swearing at you, out the side door into another alley. When you look back there's nobody. You reach her door with the rain still running off your coat.*
pay: full
→ home

## followed
*He's better than you thought. When you look back from her landing he's at the mouth of the alley, under the noodle sign, writing something down. He doesn't look up. He doesn't have to.*
take: none
→ seen

# home
title: Her Landing

*You call Venn from her landing, with the door open so she can hear. "The trail's cold," you tell him. "Lark's nobody. Give me a few nights." He says he has plenty of nights. He says it like a man with a commissioner's money behind him.*

*You've lied to clients before. You've never done it with her listening.*

*Nix is at the window with the lamp off. "Somebody wants my eye," she says. "Not me. The eye."*

view nix-direct: Hicks just lied to an SDG Sentinel for you, with your door open so you'd hear. Somebody with a commissioner's money wants to know the condition of your left eye, and the only people who know what that eye was are you and the Orchid. Say one true thing about it, if you want to, and nothing about what was on it.

view nix-direct if nix1=dug: He went all the way to Velvet and back without telling you the name was yours. Now you've said it yourself. You'd like to know why he didn't, and you'd like him to be the one to bring it up.

view nix-direct if nix1=asked: He brought it straight to you, before he did anything. That counts. Don't make a speech about it.

- stay: Tell her you'll keep lying to him as long as it takes. → stayed [set lark_one=yes]
- ask: Ask her what the eye was. → asked [set lark_one=yes]

## stayed
*She nods, once. Outside, the young companion from the Orchid is sitting on the bottom step in a rain poncho, waiting. She says Vesna will know by now who you are, and she'd rather not be there when Vesna does. Her name, she says, is {hire}.*
gives: recruit face green woman
hire-pitch: I held the door for you at the Orchid. I can hold a lot of doors.
→ end

## asked
*"House glass," she says, and that's all. Outside, the young companion from the Orchid is sitting on the bottom step in a rain poncho, waiting. She says Vesna will know by now who you are, and she'd rather not be there when Vesna does. Her name, she says, is {hire}.*
gives: recruit face green woman
hire-pitch: I held the door for you at the Orchid. I can hold a lot of doors.
→ end

# seen
title: Her Landing

*You call Venn from her landing and tell him the trail's cold. There's a pause on the line long enough to hear the rain at his end. "Of course it is," he says, and hangs up.*

*Nix has the lamp off and is standing back from the window. "He saw the door," she says. "Didn't he."*

view nix-direct: It went wrong. The Sentinel saw which door Hicks came through, and it was yours. Somebody with SDG's ear now knows where Lark lives and works. You're frightened and you're angry, and not at him. Keep it short.

view nix-direct if nix1=dug: He still hasn't told you the name was yours, and now SDG has your door. That's a conversation for when you're less frightened.

- sorry: Tell her you're sorry. → sorry-low [set lark_one=yes, set lark=seen]
- watch: Tell her you'll sit on the stairs tonight. → watch-low [set lark_one=yes, set lark=seen]

## sorry-low
*"Don't," she says. "Just don't lead him here again." She doesn't turn the lamp back on.*
→ end

## watch-low
*She doesn't say yes. She doesn't lock the door either. You sit on the stairs until the noodle sign goes off at four.*
→ end

# getaway
title: The Alley
room: karasu/intake-back-alley

*The Sentinel's at the mouth of the alley and he's stopped pretending. You've got the card in your coat and nowhere to go but away from her door.*

*{{"Go,"}} Nix says. {{"Anywhere but here."}}*

view nix-direct: Hicks is running with SDG on him, and he's running away from your door. Tell him what you can see from the window, short. Don't ask him anything until he's clear.

- roof: Up the fire stair and over the roofs. → out / caught [check reflex 50, set lark_one=yes, set lark=seen]
- crowd: Into the noodle queue on the street and out the far side. → out / caught [check cool 50, set lark_one=yes, set lark=seen]

## out
*You come down three roofs over into the Ribbon's noise. The Sentinel didn't follow. He didn't need to: he watched you leave her alley.*
→ end

## caught
*He's close enough to say your name before you're gone. He says hers too. Lark. Then he lets you go.*
take: none
→ end
