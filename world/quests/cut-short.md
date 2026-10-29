---
title: Cut Short
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A client's hands won't stop shaking. Her script came from the Open Hand, and it wasn't what the label said.
pay: 50-150
minutes: 20
posts: 20:00-02:00
trust: 1 / 1
---

# client
stranger: Sun — a line cook, chrome in both hands, holding a cup of tea in both of them so it won't spill

*Sun's chrome hands won't keep still. She bought this month's script at the Open Hand because it was cheaper than MiraGen, and the ampoule in her pocket is cloudy where it should be clear.*

view nix-direct: Cut script. You've seen this twice this year, and both times the ripper said it was the client's fault. She needs a clean dose tonight, and somebody needs to know who's cutting it.

- ampoule: Take the cloudy ampoule to the Open Hand. → clinic
- tea: Sit with her until the shaking settles. → clinic [clock +30m, set sat=yes]

## clinic
*The Open Hand smells of iodine and wet coats. The ripper on nights is restocking a fridge full of ampoules that all look the same.*
→ ripper

# ripper
stranger: The night ripper — gloves on, mask down, a cigarette she isn't allowed to smoke

*She looks at the cloudy ampoule and then at you, and her face doesn't change at all.*

- talk: Tell her what it did to Sun's hands. → clean-dose / denied [check cool 50 · nix-direct +10]
- log: Crack the clinic's batch log for where it came from. → traced / locked [crack 6]
- push: Lean on her until she opens the fridge. → clean-dose / denied [check body 50]

## clean-dose
*She takes a clear ampoule from the back of the fridge and puts it in your hand. "Not from me," she says.*
pay: full
take: full
→ end

## traced
*The batch came in off a Ferrymen boat, signed for by someone at the counter downstairs. You take a clean dose from the right shelf while the screen's still open.*
pay: full
take: full
→ end

## denied
*She puts the ampoule back on the counter and tells you to buy MiraGen like everyone else.*
take: part
→ end

## locked
*The log locks, and the ripper turns round from the fridge. You leave with nothing but the cloudy ampoule.*
take: none
heat: +1
blown
→ end
