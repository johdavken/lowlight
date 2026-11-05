---
title: House Rules
kind: mission
tier: 1
take-size: 4
starts: the-tilt
after: null
pitch: A dealer in the back room is winning too often. The house wants the game broken, quietly.
pay: 90-110
art: house-rules.webp
draw complication: none | pit-boss-watching | dealer-has-a-friend
draw dealer: easy | hard
---

# table if heat>=4

*The back-room table at the Tilt seats six. Five of them are losing to a dealer with steady hands and a cart behind his left ear that hums when he shuffles.*

*The pit boss sees you come in and doesn't smile. Word's got round about you. He'd rather the cheat than the heat, and he wants you to know it.*

- tell: Sit in anyway and read him. → read / burned [check wits 55 · cass +15 · adebayo +10, set read=yes]
- jam: Lean on his cart from the bar. → jammed / burned [check tech 45 grid · ember +15 · rue +10]
- whisper: Let Ember loop his cart from the street. → jammed [needs with=ember]

# table

*The back-room table at the Tilt seats six. Five of them are losing to a dealer with steady hands and a cart behind his left ear that hums when he shuffles.*

*Nobody here wants a fight. The house wants him gone, and him thinking it was luck.*

[complication=pit-boss-watching] *The pit boss leans on the far wall with his arms folded. He'll judge how you do this, not just whether.*

- tell: Sit in and read him. → read / burned [check wits 50 · cass +15 · adebayo +10, set read=yes]
- jam: Lean on his cart from the bar. → jammed / burned [check tech 45 grid · ember +15 · rue +10]
- whisper: Let Ember loop his cart from the street. → jammed [needs with=ember]

## read
*Three hands in you have it: he blinks twice when the cart feeds him the deck.*
→ dealer

## jammed
*His next shuffle goes wrong. He looks at his own hands like they belong to someone else.*
→ dealer

## burned
*He looks up, straight at you, and smiles. He knows.*
heat: +1
→ dealer

# dealer if alarm>=1

stranger: The dealer — steady hands, a soft voice, a cart that hums behind his ear
face: local-05
temper: dealer

*He's already on his feet when you look up. He knows exactly who sent you, and he's decided it won't be quiet.*

[complication=dealer-has-a-friend] *A man at the bar puts his drink down and turns round on his stool.*

- talk: Talk him down before it starts. → walked / brawl [check cool 50 · hicks +10 · if read +10 "you know his tell"]
- block: Stand in the doorway and make him go round you. → walked / thrown [check body 50 · ines +10 · if complication=dealer-has-a-friend -10 "his friend at the bar"]
- let: Let him go. → gone

# dealer

stranger: The dealer — steady hands, a soft voice, a cart that hums behind his ear
face: local-05
temper: dealer

*He folds his cards, collects his chips and stands. "Outside," he says, not unkindly.*

[wits 6] *He keeps his right hand loose and near his pocket. He isn't planning to swing; he's planning to leave.*

- talk: Talk him into walking away. → walked / brawl [check cool 45 · hicks +10 · if read +10 "you know his tell"]
- block: Stand in the doorway and make him go round you. → walked / brawl [check body 50 · ines +10]
- let: Let him go. → gone

## walked
*He goes, and leaves a pocket deck on the table: the thing that's been feeding his cart. He doesn't look back for it.*
gives: deck pocket-deck
take: full
→ cashout

## brawl
*It's short and ugly, and a table goes over. Cass's bouncer ends it. The game's broken, but not quietly.*
heat: +1
pay: half
take: part
→ end

## thrown
*His friend gets to you first. You come to on the wet stones of the alley with the Tilt's back door shut behind you.*
heat: +1
take: none
→ end

## gone
*He walks out with his chips and his cart. The house gets its table back and pays you half for it.*
pay: half
take: part
→ end

# cashout

*The pit boss counts your money out at the end of the bar, one note at a time, watching your face.*

- take: Take it and go. → paid
- ask: Ask what else the house needs doing. → paid [clock +30m, set asked-tilt=yes]

## paid
*He slides it across. "Same time next week, maybe," he says, which at the Tilt is a compliment.*
pay: full
→ end

# push-1

*On the way out you pass the cashier's cage. The night's float sits in an open drawer while the cashier argues with a drunk about a marker.*

- palm: Palm a stack of chips from the drawer while he's turned away. → chips / caught-palming [check reflex 55 · ember +10 · rue +10]
- claim: Tell the cashier the pit boss said to pay you a stake on top. → chips / caught-palming [check cool 50 · cass +15 · mother-rot +10]

## chips
*The cashier counts them into your hand without looking at your face. At the Tilt, money belongs to whoever's holding it.*
pay: +40
→ end

## caught-palming
*The pit boss puts his hand flat on yours. He takes the chips back, and a cut of your fee for the insult, and smiles the whole time.*
lost
→ end

# push-2

*The pit boss's count book lies open at the end of the bar while he takes a call. Every name in it owes the house. Two doors down, the rival game would pay to know who.*

- read: Read the page upside down and remember it. → sold-book / burned-book [check wits 60 · adebayo +15 · soren +10]
- tear: Tear the page out while he's turned away. → sold-book / burned-book [check reflex 60 · ember +10, alarm +1]

## sold-book
*Two doors down, a man with a gold tooth listens to the names and pays like he's buying a horse.*
pay: +60
→ end

## burned-book
*The pit boss hangs up and looks at the book, then at you. Cass's bouncer walks you out by the collar, and the house keeps a cut of your fee for its trouble.*
lost
→ end
