---
title: Lark
art: lark.webp
kind: mission
tier: 1
take-size: 4
template: true
with: [nix-direct]
for: hicks
once: true
starts: lowlight-intake
after: lark_two=yes
trust: 1 / 2
people: [Venn, Ostrow, Vesna]
pitch: Produce her by morning, Venn says, or he will. The eye's in the Orchid's vault, and it opens to one woman.
posted-by: Arlo Venn, in person, at the Intake.
brief: "Venn wants Lark produced by morning. The eye is in the Glass Orchid's vault, live, and opens only to her. Getting it out means taking her in."
pay: 90-110
loot: Venn's bonus
---

# ask
title: By Morning
stranger: Arlo Venn — an SDG Sentinel: polite, patient, never raises his voice
face: sdg-07

*The door opens without a knock. Venn wipes his feet on the mat like a guest and doesn't sit. He looks at Nix the way a man looks at a photograph he's had in his pocket a long time.*

*"Evening, Lark," he says. "I won't keep you." He looks at you. "Morning, Mr Hicks. Produce her and the eye by morning, or I produce her myself, and the commissioner can have whatever's left of the port." He lets himself out.*

*When the door shuts behind him, Nix is the one who speaks. "If anybody opens that eye, it's me."*

view nix-direct: Venn just called you Lark in your own room and gave Hicks until morning. The eye is in the Orchid's vault and only opens to you, so whatever happens, you're going in. What you haven't decided is what happens to it after. If Hicks asks you, say so honestly: you don't know yet. If he just tells you the plan, go along with it, and notice he didn't ask.

view nix-direct if nix_asked=yes: He's asked you before, instead of finding things out behind you. You've noticed every time.

- ask: Ask her what she wants done with it. → asked-again [needs nix_asked=yes, set nix3=asked, set door=open]
- ask-first: Ask her what she wants done with it. → asked [needs nix_asked!=yes, set nix3=asked]
- plan: Tell her the plan. → planned [set nix3=dug]

## asked-again
*She looks at you for a long moment. "You keep doing that," she says. "Asking." She picks up her coat. "I don't know yet. Get me in, and I'll know when I'm holding it."*
→ floor

## asked
*"I don't know," she says. "Nobody's asked me that in nine years." She picks up her coat. "Get me in, and I'll know when I'm holding it."*
→ floor

## planned
*She listens to all of it, nods once, and picks up her coat. "Fine," she says. "Your plan." She doesn't say anything else on the way out.*
→ floor

# floor
title: The Front Door
post lectern: Someone stays up at the lectern and lets Vesna host them. [suits face]
gives lectern: Vesna's eyes stay on the front room. A miss on the way out doesn't lose the eye.
stranger: Vesna Halloran — the Glass Orchid's Host: gracious, unhurried, never says no outright
room: velvet/glass-orchid
here: yes

*Nix walks into the Glass Orchid by the front door, with you a step behind her, for the first time in nine years. The carpets are the same. Vesna comes out from behind the lectern with both hands held out.*

*"Lark," she says, warmly, as if nothing in between had happened. "You came home." Behind her, past the curtained arch, a back stair goes down.*

view nix-direct: You're standing in the Glass Orchid, beside Hicks, in front of the woman who walked you out of it. Vesna is being gracious, which is how the house keeps hold of things. You don't take her hands. You talk to her the way you'd talk to a client who's lying to you: kindly, and without giving her anything. Somewhere under your feet is your old eye.

- client: Play the client. Ask Vesna for a room for the two of you. → down / seen-down [check cool 50]
- stair: Find the back stair while Vesna talks to her. → down / seen-down [check wits 50]

## down
*Vesna laughs and turns to the book, and for three seconds nobody in the Orchid is looking at the curtained arch. Then you're on the back stair, Nix ahead of you, going down.*
→ vault

## seen-down
*You make the stair, but Vesna sees you make it. She doesn't call out. She picks up the handset on the lectern instead, and the last thing you hear before the curtain falls is her voice, pleasant, asking for a number.*
→ vault

# vault
title: The Vault
room: velvet/orchid-room
here: yes

*Under the Orchid's best room there's a door with a house lock and lacquer on it thick enough to taste. Behind it, a wall of small steel drawers, each with a number and no name. Nix walks straight to one. She doesn't have to look.*

*She takes the flat glass out of her left eye, turns her face to the drawer's reader, and the drawer opens. Inside on grey velvet: an eye with a fine gold ring and a dark port behind it. When she touches it, the ring lights, once, like something waking.*

view nix-direct: You're in the Orchid's vault with your flat glass in your hand and your old eye in front of you, live. It knows you. You won't say what's on it. Your hands are steady and your voice isn't quite. Get it out of the drawer and into your pocket, and let Hicks deal with the lock while you do.

- crack: Jack the vault's lacquer and hold the drawer open. → taken / alarm [check tech 50 grid]
- grab: Wedge the drawer before it shuts on her hand. → taken / alarm [check reflex 50]

## taken
*The drawer stays open long enough. She lifts the eye out in a fold of the grey velvet and puts it inside her coat, against her ribs, and sets the flat glass back on her port without a mirror. "Go," she says.*
→ out

## alarm
*The drawer gets halfway shut on her hand before it gives. Somewhere above you a bell starts ringing, politely. She has the eye anyway, inside her coat, and the flat glass back on her port. "Go," she says.*
→ out

# out
title: The Bathhouse
room: velvet/bathhouse
here: yes

*The back stair comes out in the bathhouse, as Ilse said it would. Through the steam you can see the street door, and in it, grey shells: two Sentinels, waiting. Vesna's call was to Venn. The house sells both ways.*

*Nix has one hand inside her coat, over the eye.*

[post.lectern] *Whoever you left at the lectern is still up there in Vesna's light, being hosted.*

view nix-direct: Vesna sold you to Venn the moment you went down the stair, and there are Sentinels at the bathhouse door. You have your old eye against your ribs. You know the bathhouse: you came here on your nights off, nine years ago. Tell Hicks the one thing you know about the way out, and then run.

- steam: Through the steam rooms and out the laundry chute. → clear / caught [check wits 50 · if post.lectern=fit +10 "your face has the front room"]
- door: Go straight through them before they're ready. → clear / caught [check reflex 50]

## clear
*Down the laundry chute into the canal alley, wet to the knees, the Sentinels' lamps going the wrong way through the steam. She's laughing, nearly, out of breath. Her hand hasn't left her coat.*
→ home

## caught if post.lectern
*A Sentinel gets a hand on her coat. Then his collar says something, and he lets go: the front room, the lectern, whoever you left up there with Vesna, who has stopped being gracious. They go that way. You go down the chute, wet to the knees, the eye still against her ribs. Nobody comes out of the Orchid behind you.*
take: part
post lectern: held
→ home

## caught
*A Sentinel gets a hand on her coat. You get it off her, and it costs you, and the eye goes skidding across the wet tiles into the steam. You don't stop to look for it. Nobody could.*
take: none
→ burned

# home if door=open
title: Her Kitchen Table
room: karasu/nix-apartment
here: yes

*Her walk-up, nobody's ever been in it. She puts the eye on the kitchen table on its fold of velvet, under the one bulb, and sits down across from it. The gold ring is dark again. A hammer from the drawer lies beside it, not yet picked up.*

*"Venn's money is on one side," she says. "Nine years is on the other." Her hands are flat on the table, either side of it. "You asked me what I wanted. You kept asking. So ask me now."*

view nix-direct: Your old eye is on your table, live, and Hicks is in your home, where nobody comes. He's asked you, more than once, instead of finding you out. You still don't know what you want done with it, and you'd rather decide it with him than alone. If he sells it to Venn, it's money and Venn leaves you alone, and he chose it. If he crushes it, nobody holds those nine years ever again, the house included. If he gives it to you, it's yours: every client on it, and every woman they hurt, and you'd be a target for the rest of your life.

- venn: Take it to Venn. → sold-door [set lark=sold]
- crush: Pick up the hammer. → crushed-door [set lark=crushed]
- hers: Push it across the table to her. → kept-door [set lark=hers]

## sold-door
*She watches you fold it in the velvet and doesn't stop you. "That's an answer," she says. Venn pays in cash, as always, and says the commissioner will be grateful.*
pay: full
settles: nix-direct: Hicks took your old house glass to Venn and Ostrow for money. You let him. It was an answer, and you heard it.
gives: outfit nix-direct coat
→ end

## crushed-door
*It takes three blows. The gold ring goes first, then the glass, then whatever was behind it. She doesn't flinch. When it's done she sweeps it into her palm and puts it in the sink and runs the tap, and then she stands there with her back to you for a long time.*
settles: nix-direct: Hicks crushed your old house glass on your table after asking you, more than once, instead of finding you out. Nobody holds those nine years now. He's been in your home. You've let yourself think of him as more than a client. A door, not a promise, yours to open slowly.
gives: outfit nix-direct coat
→ end

## kept-door
*She looks at it a long time. Then she wraps it in the velvet and puts it in the tin where she keeps her token at night. "Every one of them," she says. "And every girl they hurt. I'll decide what that's worth." She turns the bulb off.*
settles: nix-direct: Your old house glass is yours, hidden at home; Ostrow and the house know it. Hicks put it in your hands after asking you, more than once, instead of finding you out. He's been in your home. You've let yourself think of him as more than a client. A door, not a promise, yours to open slowly.
gives: outfit nix-direct coat
→ end

# home
title: Her Kitchen Table
room: karasu/nix-apartment
here: yes

*Her walk-up, nobody's ever been in it. She puts the eye on the kitchen table on its fold of velvet, under the one bulb, and sits down across from it. The gold ring is dark again. A hammer from the drawer lies beside it, not yet picked up.*

*"Venn's money is on one side," she says. "Nine years is on the other." She doesn't touch it. "Your plan got us this far. Finish it."*

[nix3=asked] *"You did ask, tonight," she says. "Once. It was late to start."*

view nix-direct: Your old eye is on your table, live, and Hicks is in your home, where nobody comes. He's mostly told you things instead of asking you. You still don't know what you want done with it. If he sells it to Venn, it's money and Venn leaves you alone, and he chose it. If he crushes it, nobody holds those nine years again. If he gives it to you, it's yours, and you'd be a target for the rest of your life.

- venn: Take it to Venn. → sold [set lark=sold]
- crush: Pick up the hammer. → crushed [set lark=crushed]
- hers: Push it across the table to her. → kept [set lark=hers]

## sold
*She watches you fold it in the velvet and doesn't stop you. "That's an answer," she says. Venn pays in cash, as always, and says the commissioner will be grateful.*
pay: full
settles: nix-direct: Hicks took your old house glass to Venn and Ostrow for money. You let him. It was an answer, and you heard it.
gives: outfit nix-direct coat
→ end

## crushed
*It takes three blows. She doesn't flinch. When it's done she sweeps it into her palm and puts it in the sink and runs the tap. "Thank you," she says.*
settles: nix-direct: Hicks crushed your old house glass on your kitchen table. Nobody holds those nine years now: not the house, not Ostrow, not you. You're grateful. He decided it for you, and you noticed that too.
gives: outfit nix-direct coat
→ end

## kept
*She looks at it a long time. Then she wraps it in the velvet and puts it in the tin where she keeps her token at night. "I'll decide what it's worth," she says, and turns the bulb off.*
settles: nix-direct: Your old house glass is yours now, hidden in your walk-up. Ostrow and the house both know you have it. Hicks handed it over and went home, the way he'd planned it.
gives: outfit nix-direct coat
→ end

# burned
title: The Canal Alley
room: velvet/bathhouse
here: yes

*Out the side door into the canal alley, the two of you, empty-handed. Behind you in the steam the Sentinels are on their knees on the wet tiles, looking. One of them stands up holding something in a glove.*

*Nix stops in the rain and looks back once. Then she doesn't again.*

view nix-direct: Your old eye is in SDG's glove, and from there it goes to Venn and Ostrow, or back to the house. Either way somebody else holds those nine years again. You're soaked and shaking and you won't cry in an alley. Hicks got you out. Say that, if you can.

- walk: Walk her home. → walked [set lark=house]
- stay: Stand in the rain with her until she moves. → stood [set lark=house]

## walked
*She lets you walk her as far as her door, and no further.*
settles: nix-direct: You went back into the Glass Orchid for your old eye and lost it on the bathhouse floor. SDG has it now, or the house does. Hicks got you out.
→ end

## stood
*It's a long time before she moves. When she does, she takes your arm for the first block, and then lets go.*
settles: nix-direct: You went back into the Glass Orchid for your old eye and lost it on the bathhouse floor. SDG has it now, or the house does. Hicks got you out.
→ end

# getaway
title: The Bells
room: velvet/bathhouse
here: yes

*Bells upstairs, Sentinels at the street door, and the eye still in its drawer under the Orchid. There's no going back down for it.*

*"Leave it," Nix says. "Leave it. Get us out."*

view nix-direct: The job's gone wrong before you could reach your eye, and you're telling Hicks to leave it, and you mean it. Get out. You'll feel the rest later.

- chute: Out the laundry chute to the canal. → away / named [check reflex 50, set lark=house]
- crowd: Into the steam with the bathers and out the back. → away / named [check cool 50, set lark=house]

## away
*You come out in the canal alley with nothing, and the Orchid's bells still going above you.*
settles: nix-direct: You went back into the Glass Orchid for your old eye and left it in the vault. The house still has it.
→ end

## named
*A Sentinel gets her name out loud, her clinic name, before you're clear. Then you're gone.*
take: none
settles: nix-direct: You went back into the Glass Orchid for your old eye and left it in the vault. The house still has it, and SDG saw you there.
→ end
