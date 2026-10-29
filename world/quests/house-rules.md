---
title: House Rules
kind: mission
tier: 1
with: [cass, hicks, ember, silas, nix-direct]
starts: the-tilt
after: null
pitch: A dealer in the back room is winning too often. The house wants the game broken, quietly.
pay: 250-350
art: house-rules.webp
draw complication: none | pit-boss-watching | dealer-has-a-friend
draw dealer: easy | hard
---

# table if heat>=4

*The back-room table at the Tilt seats six. Five of them are losing to a dealer with steady hands and a cart behind his left ear that hums when he shuffles.*

*The pit boss sees you come in and doesn't smile. Word's got round about you. He'd rather the cheat than the heat, and he wants you to know it.*

- tell: Sit in anyway and read him. → read / burned [check wits 55 · cass +15, set read=yes]
- jam: Lean on his cart from the bar. → jammed / burned [check tech 45 grid · ember +15]
- whisper: Let Ember loop his cart from the street. → jammed [needs with=ember]

# table

*The back-room table at the Tilt seats six. Five of them are losing to a dealer with steady hands and a cart behind his left ear that hums when he shuffles.*

*Nobody here wants a fight. The house wants him gone, and him thinking it was luck.*

[complication=pit-boss-watching] *The pit boss leans on the far wall with his arms folded. He'll judge how you do this, not just whether.*

- tell: Sit in and read him. → read / burned [check wits 50 · cass +15, set read=yes]
- jam: Lean on his cart from the bar. → jammed / burned [check tech 45 grid · ember +15]
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
temper: dealer

*He's already on his feet when you look up. He knows exactly who sent you, and he's decided it won't be quiet.*

[complication=dealer-has-a-friend] *A man at the bar puts his drink down and turns round on his stool.*

- talk: Talk him down before it starts. → walked / brawl [check cool 50 · hicks +10 · if read +10 "you know his tell"]
- block: Stand in the doorway and make him go round you. → walked / thrown [check body 50 · if complication=dealer-has-a-friend -10 "his friend at the bar"]
- let: Let him go. → gone

# dealer

stranger: The dealer — steady hands, a soft voice, a cart that hums behind his ear
temper: dealer

*He folds his cards, collects his chips and stands. "Outside," he says, not unkindly.*

[wits 6] *He keeps his right hand loose and near his pocket. He isn't planning to swing; he's planning to leave.*

- talk: Talk him into walking away. → walked / brawl [check cool 45 · hicks +10 · if read +10 "you know his tell"]
- block: Stand in the doorway and make him go round you. → walked / brawl [check body 50]
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
