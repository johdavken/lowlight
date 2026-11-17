---
title: Returned to Stock
art: returned-to-stock.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: lark_one=yes
trust: 1 / 2
people: [Venn, Ostrow]
pitch: Venn asked for the condition of her eye. Nobody returns house glass to stock.
posted-by: Arlo Venn, a second envelope. Left at the Intake, care of nobody.
brief: "Venn wants the condition of Lark's left eye, and he's paying again to get it. Hicks wants to know who the eye matters to, and where it went."
pay: 90-110
loot: Venn's second envelope
---

# ask
title: The Second Envelope

*The second envelope comes in with Hae's delivery boy, addressed to you, care of nobody. Cash again, more of it. One line in pencil on the card inside: I asked for the condition of her eye.*

*Nix reads it over your shoulder and puts it face down on the desk. Somebody did her eye nine years ago. Somebody in Velvet would know who.*

view nix-direct: Venn has sent Hicks more money and the same question: the condition of your eye. Hicks is going to look for whoever took your house glass out. You know who it was. You could tell him, and some of what it cost, or you could let him find it on the street. Telling him is giving something up. You'd rather be asked than found.

view nix-direct if nix1=dug: He went to Velvet last time without telling you the name was yours. If he asks you straight this time, notice it.

- ask: Ask Nix who took her glass out. → told [set nix2=asked, set nix_asked=yes]
- street: Ask around Velvet who fits the Orchid's glass. → found [set nix2=dug]

## told
*"Ilse," she says. "Back of the bathhouse. She does the house's glass, in and out." She turns the envelope over and back. "She put me under. I woke up with this one in. That's all I remember, and I don't want to remember more of it." She takes the bead out of the drawer for your ear.*
→ ripper

## found
*It takes two drinks and a lie to a doorman. The Orchid's glass goes in and comes out in the back of the bathhouse, and the woman who does it is called Ilse. When you get back to the Intake, Nix already has the bead out of the drawer for your ear. She doesn't ask where you've been.*
→ ripper

# ripper
title: The Bathhouse
stranger: Ilse Marr — the Orchid's ripper, old, in the back of the bathhouse: tired, exact, sorry about nothing
face: local-velvet-03
room: velvet/bathhouse

*The bathhouse keeps the steam on all night. Behind the last tiled room there's a door with no handle, and behind that a bench, a magnifier lamp on an arm, a steel tray. Ilse Marr wipes the tray down with a towel from her shoulder and doesn't look round.*

*"House glass," she says, when you've said it. "I don't talk about the house's glass. The house pays me not to."*

*{{"She knows me,"}} Nix says in your ear, very quietly. {{"Don't tell her I'm listening."}}*

view nix-direct: You're on Hicks's ear in the room where your house glass came out. You were under. You remember the lamp. You don't want him to tell Ilse you're on the line, and you don't want to hear what she says, and you're going to listen anyway.

view nix-direct if nix2=dug: He found Ilse without you. You'd have given him her name if he'd asked. Keep that to yourself for now.

- wait: Put paper on her tray and wait. → read / rough [check cool 50]
- lie: Let her talk, and catch the lie in it. → read / rough [check wits 50]

## read
*"Returned to stock," Ilse says, and snorts. "Glass that's been worn nine years doesn't go back to stock. It goes in the vault, live, under the Orchid, because house glass only opens to the eye it came out of. The flat one I put on her port sits right over the socket." She folds the towel. "And it wasn't Lark paid me to do it. It was Vesna. That girl walked out owing the house."*
→ file

## rough
*It costs you more paper than you meant, and she knows you're lying about why you want it. "Glass that's been worn nine years goes in the vault, live, under the Orchid," she says at last. "House glass only opens to the eye it came out of. The flat one I put on her port sits right over the socket. Vesna paid me, not Lark. That girl walked out owing the house."*
→ file

# file
title: Venn's Desk
room: nexus/sdg-floor

*SDG's floor in the Nexus never closes, and nobody on it looks at anyone. Venn's desk is the tidy one by the window: a slate face down, a paper tray, a coat on the chair. Whatever he's been told to find, it's written down there.*

*{{"Careful,"}} Nix says. {{"That's the one place in the city that can take you and keep you."}}*

view nix-direct: Hicks is on the SDG floor, at the desk of the Sentinel who's looking for you. You've kept SDG out of the Intake for years and now he's walked into theirs. You want him out of there as much as you want to know what's on that desk. One word at a time.

- crack: Jack the floor's terminal and pull Venn's file. → read-file / loud [check tech 50 grid]
- lift: Lift the slate off his desk on your way past. → read-file / loud [check reflex 50]

## read-file
*Venn's off-book file has a name on it: Commissioner Ostrow. Eight years of payments out of Ostrow's household account, every month, to a numbered account in Velvet. And in Venn's tidy hand, at the bottom: Subject to be produced. Port intact.*
→ door

## loud
*A Sentinel at the next desk asks who you are, and you have to answer. You get the file anyway. Venn's off-book file has a name on it: Commissioner Ostrow. Eight years of payments out of Ostrow's household account, every month, to a numbered account in Velvet. And in Venn's tidy hand, at the bottom: Subject to be produced. Port intact.*
→ door

# door
title: The Intake

*Back at the Intake, her hours, a client on the couch with a cup going cold. Boots on the stairs: two pairs, in step. Two Sentinels at the door with a paper warrant. "Nicolette Varga," the first one reads. "Municipal cert review. You'll come with us tonight."*

[lark=seen] *They didn't have to ask the way. One of them has stood at the mouth of this alley before, under the noodle sign, writing something down.*

*Nix stands up from her desk. The client on the couch doesn't move at all.*

view nix-direct: Two Sentinels are at your door in your hours, with a client on your couch, reading your clinic name off a warrant. It's a pretext: a cert review is a way to get you into a room with nobody watching. You won't let them see you frightened in front of a client. You want Hicks between you and the door, and you'd rather he talked than fought, but you won't say so out loud.

- hold: Stand in the doorway and don't move. → held / taken [check body 50]
- date: Read the warrant. The date on it is wrong. → held / taken [check cool 50]

## held
*It takes a long minute. Then the first Sentinel folds the warrant and says they'll be back with a clean one, and they leave the way they came, in step. The client on the couch lets out a breath. Nix sits down and finishes the session.*
pay: full
→ home

## taken
*They take her anyway, politely, a hand on each elbow. The client on the couch watches the whole thing. The Intake's light stays on all night with nobody in it.*
take: none
→ burned

# home
title: The Roof
room: karasu/ribbon-rooftop
here: yes

*Four in the morning, on the roof above the Intake. The harbour cranes are lit far off in the rain, the way they always are when she comes up here after shift. She came up anyway, with you behind her.*

*You tell her the name. Ostrow. Eight years of money to the Orchid, every month. Her old eye is in the vault under the house, live, and it opens to one woman.*

*She watches the cranes. "So the house has been living on him," she says. "And on me."*

view nix-direct: You're on your roof at four with Hicks, and you've just learned that your old eye was never returned. It's in the Orchid's vault, live, and a commissioner has been paying the house eight years so it stays shut. It only opens to you. You don't say what's on it. You don't know yet what you want done with it.

view nix-direct if nix2=asked: He asked you for Ilse's name instead of hunting for it. You noticed. You might tell him that, if the moment comes.

view nix-direct if nix1=dug: Back at the start he kept your house name from you to see what you'd do. You've let it go. You haven't forgotten it.

- stay: Stay up here with her till the cranes go dark. → stayed [set lark_two=yes]
- vault: Tell her you'll find a way into the vault. → planned [set lark_two=yes]

## stayed
*Neither of you says anything for a long time. When the crane lights go off one by one at five, she goes down first, and leaves the roof door open behind her.*
→ end

## planned
*"Not without me," she says, still watching the cranes. "It opens to me. Remember that."*
→ end

# burned
title: The Bottom Step

*They let her go at dawn, with a stamped slip that says her cert is under review. Until it clears she can't counsel, and the Intake's shut. She gets back at seven in the morning and finds you sitting on the bottom step.*

*"A week," she says. "Maybe two. The clients will go somewhere else, or nowhere."*

view nix-direct: SDG held you all night in a room with no window and asked you about your eye. They let you go with your cert suspended, and the Intake is shut until it clears. Hicks is waiting at your door. You're tired past anger. You don't want comfort, and you don't want an apology.

- in: Go in with her and put the kettle on. → kettle [set lark_two=yes, set lark=seen]
- go: Leave her to it. → left [set lark_two=yes, set lark=seen]

## kettle
*She lets you. She sits at the desk with her coat still on and doesn't open the notebook.*
settles: nix-direct: SDG held you a night over your eye and suspended your cert; the Intake is shut for a week while it's under review.
→ end

## left
*She goes in and shuts the door, and you hear the lock.*
settles: nix-direct: SDG held you a night over your eye and suspended your cert; the Intake is shut for a week while it's under review.
→ end

# getaway
title: The SDG Floor
room: nexus/sdg-floor

*Somebody on the floor has noticed you aren't SDG. Two Sentinels are getting up from their desks at the same time, which is never good.*

*{{"Out,"}} Nix says. {{"The service stair, behind the coffee."}}*

view nix-direct: Hicks has been made on the SDG floor. Tell him the way out if you can see it on his camera, short. Don't ask him anything until he's clear.

- stair: The service stair behind the coffee. → out / caught [check reflex 50, set lark_two=yes, set lark=seen]
- walk: Walk out the front like you belong. → out / caught [check cool 50, set lark_two=yes, set lark=seen]

## out
*You come out into the Nexus rain with nobody behind you, and Venn's file in your head. They know somebody was at his desk. They'll know who by morning.*
→ end

## caught
*A Sentinel gets your face on his slate before you're through the door. You keep walking. He doesn't follow. He doesn't have to.*
take: none
→ end
