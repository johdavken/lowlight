---
title: Held Papers
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A woman who left a Velvet house still can't work. The house kept her papers, and sends a runner to remind her.
pay: 50-120
minutes: 20
posts: 20:00-02:00
trust: 1 / 1
---

# client
stranger: Reva — twenty-six, coat buttoned wrong, a house tattoo half lasered off her wrist

*Reva sits on the edge of the client chair with her bag on her knees. Her residency card, her med file and her work cert are all in a drawer in Velvet, and every Thursday a runner from the house eats at Hae's and waits for her to come down and ask nicely.*

view nix-direct: You know this house. You know the drawer, the Thursday runner and the asking nicely. You also know that if she goes down those stairs alone she comes back owing more than she left with. Read her before anyone reads her for you.

- listen: Let her tell it all the way through. → told [clock +30m]
- go: Go down and find the runner now. → down

## told
*The runner's name is Teodor. He carries the papers on him, in an envelope, because the house likes them close to her.*
→ runner

## down
*Hae's is three flights down. Reva stays in the chair with the door locked.*
→ runner

# runner
stranger: Teodor — a house runner, good shoes, an envelope in his inside pocket

*Teodor has the corner stool at Hae's and a bowl he isn't eating. He sees you come in, and he sees who you came with.*

view nix-direct: He knows your face. Houses keep pictures of the ones who left. Whether that helps or ruins it depends on how you stand.

- talk: Tell him the papers are leaving with you tonight. → handed / turned [check cool 50 · nix-direct +10]
- lift: Lift the envelope while he's watching her. → lifted / caught [check reflex 50]
- name: Let Nix say the house's name, and what she knows about it. → handed / turned [check cool 45 · nix-direct +20, needs with=nix-direct, set named=yes]

## handed
*He puts the envelope on the counter and leaves the bowl. He doesn't say anything, which from a house runner is a threat.*
→ upstairs

## lifted
*The envelope is in your coat before he finishes his sentence.*
→ upstairs

## turned
*He laughs and buttons his coat over the envelope.*
take: none
blown
→ end

## caught
*His hand closes on your wrist. The papers stay where they were, and now the house knows your face too.*
take: none
heat: +1
blown
→ end

# upstairs if named=yes

*Upstairs, Reva opens the envelope with both hands. Everything's there. The house will remember who said its name out loud on Level 4.*

- give: Give her the envelope. → home
- copy: Copy the papers to Nix's ledger first, in case. → home [clock +30m]

# upstairs

*Upstairs, Reva opens the envelope with both hands. Everything's there.*

- give: Give her the envelope. → home
- copy: Copy the papers to Nix's ledger first, in case. → home [clock +30m]

## home
*She folds her papers into her bag and pays what she can. It's not much. She pays it anyway.*
pay: full
take: full
→ end
