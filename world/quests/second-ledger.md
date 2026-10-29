---
title: Second Ledger
kind: mission
tier: 1
with: [nix-direct]
starts: lowlight-intake
after: null
pitch: A client's debt was sold twice. The Counting House keeps a second ledger nobody's supposed to know about.
pay: 70-150
posts: 20:00-02:00
trust: 1 / 1
comms: counting-house
---

# client
stranger: Dana — a client, an envelope of payment slips in both hands

*Dana paid her debt to the house in full. Then a second collector came for it, with a ledger page from the Counting House. Two buyers, one debt, and the books say she owes them both.*

view nix-direct: The Counting House keeps books for anyone who pays. A second ledger means someone paid them to keep two. You can't walk into the Drownworks, but you can read a page through someone else's eyes.

- go: Say you'll find the second ledger, with Nix on the line. → sent
- slips: Photograph Dana's payment slips first. → sent-proof [clock +30m]

## sent
*You head down to the marsh. Nix stays at her desk, the line open.*
→ ledger
wait: at counting-house · comms · by 02:00 else missed

## sent-proof
*Every slip is stamped and dated. Whatever the ledger says, the house was paid.*
→ ledger
wait: at counting-house · comms · by 02:00 else missed

## missed
*The Counting House shuts its doors at two. In the morning, the second collector is waiting on Dana's stairs.*
take: none
blown
→ end

# ledger
stranger: A bookkeeper — sleeve garters, a green visor, wet boots

*The books for the house are open on the stand. Under them, half hidden, a second ledger with a different binding.*

view nix-direct: Through their eyes you can read the line, if they hold still long enough. It's the dates that matter. Two sales, a week apart, the same debt.

- read: Read the second ledger while Nix tells you which line to find. → copied / seen [check wits 50 · nix-direct +10]
- bribe: Pay the bookkeeper to lose a page. → copied / seen [check cool 55]
- steal: Take the ledger while Nix times the bookkeeper's back. → copied / seen [check reflex 50, needs with=nix-direct]

## copied
*The double sale is in your hand, dated and signed. With Dana's slips, the second collector has nothing.*
pay: full
take: full
→ end

## seen
*The bookkeeper slams the ledger shut and calls for the door. You're out in the wet with nothing, and he's seen your face.*
take: none
heat: +1
blown
→ end
