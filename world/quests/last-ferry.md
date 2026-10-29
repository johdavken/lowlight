---
title: Last Ferry
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A man has a seat on tonight's last ferry and a reason to be on it. There's a Sentinel on the Ferry Stairs checking faces.
pay: 50-110
minutes: 20
posts: 20:00-02:00
trust: 1 / 1
---

# upstairs
stranger: Ilias — forties, a bag that's already packed, a ticket he keeps checking

*Ilias has the ticket in his hand and the bag between his feet. The ferry leaves at {time +90m}. He worked six years for a firm that owns his contract and his face, and tonight he means to be on the Isle before anyone counts heads in the morning.*

view nix-direct: He's been a client for a year. You helped him decide; you didn't help him plan. Now he's asking you to walk him to the water, and it's the first time he's asked you for anything.

- walk: Walk him down to the Ferry Stairs. → stairs
- coat: Change his coat and hat first. → stairs [clock +30m, set changed=yes]

## stairs
*The Ferry Stairs run wet under the floodlights. At the top, an SDG Sentinel in a rain cape reads every face that goes down, one at a time.*
→ sentinel

# sentinel
stranger: A Sentinel — rain cape, a face scanner on a lanyard, bored until he isn't

*The line moves a step at a time. The Sentinel holds the scanner up to each face, waits for the beep, then waves them on.*

- through: Walk Ilias through the line as if you belong. → aboard / stopped [check cool 50 · if changed=yes +15 "a different coat" · nix-direct +10]
- client: Let Nix keep the Sentinel talking while he passes. → aboard / stopped [check cool 45 · nix-direct +20, needs with=nix-direct, clock +30m]
- rail: Take him down the service rail beside the stairs. → aboard / stopped [check reflex 50]

## aboard
*Ilias goes down the last steps without looking back. The ferry's horn goes once, low, across the water.*
pay: full
take: full
→ end

## stopped
*The scanner beeps a different note. The Sentinel puts a hand on Ilias's shoulder, and the line goes quiet around them.*
take: none
heat: +1
blown
→ end
