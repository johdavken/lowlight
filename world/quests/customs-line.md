---
title: Customs Line
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A client's sister comes in on the night ferry. SDG customs has started pulling people off the stairs before they reach the street.
pay: 60-140
posts: 20:00-02:00
trust: 1 / 1
comms: ferry-stairs
---

# client
stranger: Mira — a client, coat still wet, a ferry schedule folded small in her fist

*Mira's sister is on the 01:40 from the Isle with no stamp worth the paper. Three people off last week's boat never made it up the stairs. Mira can't go down there herself; her face is on a list.*

view nix-direct: You can't leave the desk, and you won't. But you can see what they see, and you can tell them where to stand. That's the job tonight.

- go: Say you'll meet the boat, with Nix in your ear. → sent
- ask: Get the sister's description first. → described [clock +30m]

## sent
*You go down to the water. Nix stays where she is, with the line open.*
→ stairs
wait: until 01:30 · at ferry-stairs · comms · by 02:00 else missed

## described
*Grey coat, red scarf, a cardboard suitcase tied with string. "She'll look lost," Mira says. "She always looks lost."*
→ stairs
wait: until 01:30 · at ferry-stairs · comms · by 02:00 else missed

## missed
*The 01:40 comes and goes. By the time you'd have reached the stairs, the customs van is pulling away.*
take: none
blown
→ end

# stairs
stranger: A customs officer — SDG armband, a tablet, a voice that never rises

*The ferry ties up under the floodlights. The officer stands at the top of the stairs, reading faces against a tablet, pulling some aside to a folding table.*

view nix-direct: You see him through their eyes: bored, thorough, a man who likes the folding table. You can read who he'll stop before he does.

- read: Let Nix read the officer and say who he'll pull next. → clear / pulled [check wits 50 · nix-direct +10]
- cut: Cut in and walk the sister up past him. → clear / pulled [check cool 50]
- distract: Draw his eye to someone else. → clear / pulled [check cool 45, needs with=nix-direct]

## clear
*The sister comes up the stairs on your arm and nobody stops her. On the line, Nix lets out a breath you can hear.*
pay: full
take: full
→ end

## pulled
*The officer's hand is on the sister's shoulder before you can say anything. She's at the folding table. You walk up the stairs alone.*
take: none
heat: +1
blown
→ end
