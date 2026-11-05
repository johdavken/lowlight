---
title: Quiet Floor
art: quiet-floor.webp
kind: mission
tier: 2
template: true
starts: under-the-cat
after: null
pitch: A Cortex auditor sleeps on the hotel's top floor with his work slate on the nightstand. Somebody wants a copy, not the slate.
pay: 360-440
draw complication: none | auditor-awake | floor-guard
draw guard: easy | hard
---

# lift if heat>=4

*The top-floor lift needs a key card, and the hotel has started checking faces at the desk. Yours earns a second look.*

- service: Ride up in the service lift with the laundry. → floor / seen [check reflex 50, set laundry=yes]
- card: Borrow a card from a drunk at the bar. → floor / seen [check cool 50 · cass +10 · adebayo +10]

# lift

*The top-floor lift needs a key card. Under the Cat's bar is full of people with key cards and not much sense.*

[wits 6] *The man at the end of the bar has a top-floor card in his shirt pocket and his eyes on the door. Waiting for someone.*

- card: Borrow a card from a drunk at the bar. → floor / seen [check cool 55 · cass +10 · adebayo +10]
- service: Ride up in the service lift with the laundry. → floor / seen [check reflex 55, set laundry=yes]

## floor
*The top floor is silent: thick carpet, one corridor, four doors.*
→ door

## seen
*The lift opens on the top floor and a man in a hotel blazer looks up from a chair at the end of the corridor.*
→ door

# door

stranger: The floor guard — big, bored, in a blazer a size too small
face: local-04
temper: guard

*Suite 1 is at the end of the corridor. The guard sits outside it with a paper he isn't reading.*

[complication=floor-guard] *He's not hotel. His shoes are too good and his earpiece is Cortex blue.*

- talk: Tell him you're room service. → inside / turned [check cool 55 · soren +10 · if laundry +10 "you're carrying towels"]
- distract: Pull the fire alarm on the floor below and be back up before he is. → inside / turned [check reflex 55, alarm +1, clock +20m, set fire=yes]

## inside
*The suite smells of expensive soap. The auditor is a shape under the covers, breathing slowly. The slate is on the nightstand, screen down.*
→ slate

## turned
*He takes your arm and walks you back to the lift, and takes a photo of your face on the way. He doesn't wait to see it close. You come back along the service passage and in through the suite's dressing room.*
→ slate

# slate if fire

*Somewhere below, a fire alarm is going. The auditor turns over and reaches for his glasses.*

[complication=auditor-awake] *He's not asleep at all. He's lying there with his eyes open, listening to you.*

- copy: Crack the slate fast, before he's up. → copied / locked [crack 8]
- note: Find where he wrote the password down. Auditors do. → copied / locked [check wits 55 · nix-direct +10]

# slate

*The slate wakes at your touch and asks for a password.*

[complication=auditor-awake] *He's not asleep at all. He's lying there with his eyes open, listening to you.*
[tech 7] *It's a Cortex field slate. They ship with a password from a word list, and auditors never change them.*

- copy: Crack the slate and copy it. → copied / locked [crack 8 · if laundry +1 "you came up with the laundry"]
- note: Find where he wrote the password down. Auditors do. → copied / locked [check wits 55 · nix-direct +10]

## copied
*The copy runs while he breathes. You put the slate back screen down, exactly where it was.*
→ hall

## locked
*The slate gives you half the copy, then locks you out and starts to buzz. The auditor sits up. You're through the door before he finds the light.*
take: part
→ hall

# hall

*Back in the corridor the blazer's chair is empty, which is worse. Down at the far end a bell rings for a lift nobody called.*

[complication=floor-guard] *The man with the earpiece is on the stairs. You can hear him not hurrying.*

- panel: Kill the corridor lights from the panel by the ice machine. → clear / heard [check tech 50 · rue +10]
- fire: Shoulder the fire door and take the back stair. → clear / heard [check body 50 · ines +10]

## clear
*Three floors down you stop to breathe. Nobody's above you.*
→ away

## heard
*Somebody on the top floor shouts a question after you. You don't stay to answer it.*
→ away

# away

*The lobby, and the bar full of people with key cards. One of them isn't drinking.*

- lift: Cross the lobby like a guest going out for cigarettes. → gone / made [check cool 50 · cass +10]
- bar: Go out through the kitchens while the shift changes. → gone / made [check reflex 50 · hicks +10]

## gone
*Under the Cat it's still raining. The copy's warm in your pocket.*
pay: full
→ end

## made
*A hand closes on your arm at the door, not roughly. It goes through your coat and comes out with the copy. Nobody says a word.*
take: none
→ end
