---
title: Quiet Floor
kind: mission
tier: 2
with: [nix-direct, cass, hicks, ember, silas]
starts: under-the-cat
after: null
pitch: A Cortex auditor sleeps on the hotel's top floor with his work slate on the nightstand. Somebody wants a copy, not the slate.
pay: 420-540
draw complication: none | auditor-awake | floor-guard
draw guard: easy | hard
---

# lift if heat>=4

*The top-floor lift needs a key card, and the hotel has started checking faces at the desk. Yours earns a second look.*

- service: Ride up in the service lift with the laundry. → floor / seen [check reflex 50, set laundry=yes]
- card: Borrow a card from a drunk at the bar. → floor / seen [check cool 55 · cass +10]

# lift

*The top-floor lift needs a key card. Under the Cat's bar is full of people with key cards and not much sense.*

[wits 6] *The man at the end of the bar has a top-floor card in his shirt pocket and his eyes on the door. Waiting for someone.*

- card: Borrow a card from a drunk at the bar. → floor / seen [check cool 45 · cass +10]
- service: Ride up in the service lift with the laundry. → floor / seen [check reflex 45, set laundry=yes]

## floor
*The top floor is silent: thick carpet, one corridor, four doors.*
→ door

## seen
*The lift opens on the top floor and a man in a hotel blazer looks up from a chair at the end of the corridor.*
heat: +1
→ door

# door

stranger: The floor guard — big, bored, in a blazer a size too small
temper: guard

*Suite 1 is at the end of the corridor. The guard sits outside it with a paper he isn't reading.*

[complication=floor-guard] *He's not hotel. His shoes are too good and his earpiece is Cortex blue.*

- talk: Tell him you're room service. → inside / turned [check cool 50 · if laundry +10 "you're carrying towels"]
- distract: Pull the fire alarm on the floor below. → inside [alarm +1, clock +20m]

## inside
*The suite smells of expensive soap. The auditor is a shape under the covers, breathing slowly. The slate is on the nightstand, screen down.*
→ slate

## turned
*He takes your arm and walks you back to the lift. On the way he takes a photo of your face.*
heat: +2
take: none
→ end

# slate if alarm>=1

*Somewhere below, a fire alarm is going. The auditor turns over and reaches for his glasses.*

[complication=auditor-awake] *He's not asleep at all. He's lying there with his eyes open, listening to you.*

- copy: Crack the slate fast, before he's up. → copied / locked [crack 8]
- grab: Grab it and go. → stolen

# slate

*The slate wakes at your touch and asks for a password.*

[complication=auditor-awake] *He's not asleep at all. He's lying there with his eyes open, listening to you.*
[tech 7] *It's a Cortex field slate. They ship with a password from a word list, and auditors never change them.*

- copy: Crack the slate and copy it. → copied / locked [crack 8 · if laundry +1 "nobody saw you come up"]
- grab: Grab it and go. → stolen

## copied
*The copy runs while he sleeps. You put the slate back screen down, exactly where it was.*
take: full
→ away

## locked
*The slate locks you out and starts to buzz. The auditor sits up. You're through the door before he finds the light, with nothing.*
take: none
→ end

## stolen
*The whole slate, in your coat. Somebody wanted a copy, not a missing slate.*
take: part
heat: +1
→ away

# away

*The corridor, the lift, the bar full of people with key cards.*

- lift: Ride the lift down and out. → gone
- bar: Have a drink at the bar on the way out, like a guest. → gone [clock +30m]

## gone
*Under the Cat it's still raining. The copy's warm in your pocket.*
pay: full
→ end
