---
title: The Chair, again
art: the-chair.webp
with: [nix-direct]
starts: lowlight-intake
after: deal2=ready and trust=high and chair=yes and chair2!=yes
posts: 20:00-02:00
pitch: Six jobs on her ears and she hasn't once had to say stop. You want more of her nights. She knows it before you sit down.
---

# ledger

*The ledger's open to your page. It's a full page now. She runs a finger down the margin where she marks how each one ended, and doesn't hurry.*

view nix-direct: They've done what they said. Your cut came every time, and nobody from your stairs is on their list. Now they want more of your nights, and more nights is more of you out there with them. You can say no and lose nothing. You can say yes and it changes what this is.
view any: She's counting something on that page. Not the money.

- ask: Ask for more of her nights. → asked
- wait: Let her finish reading first. → asked [clock +20m]

## asked
*"Three," she says. "That's what you're asking. Three jobs a night, me on your ears for every one." She closes the ledger on her finger. "Three's a lot of nights to come home from. So tell me what it's worth to you now."*
→ offer

# offer

*She opens the ledger again and rules a new line under the old one.*

view nix-direct: The old share was for someone you weren't sure of. You're surer now. A smaller share for more nights is still more money in your hand, and it says you've stopped needing to be paid for the risk of them. Hear whether they know that.
view any: Whatever goes on the new line replaces the old one.

- low: Offer her three in twenty, for three jobs a night. → lean [needs warmth=high, set chair2=yes]
- fair: Offer her a fifth, for three jobs a night. → fair [set chair2=yes]
- high: Keep her at a quarter, for three jobs a night. → square [set chair2=yes]

## lean
*She looks at you a long moment. "That's a number for someone who trusts me," she says. "Fine. Three a night. If one of them goes wrong, it's the last one that night."*
arrangement: chair-cut 15 / 3
→ end

## fair
*She writes it on the new line. "Three jobs. The same terms as before, and one more: on the third, I choose the way out."*
arrangement: chair-cut 20 / 3
→ end

## square
*"You didn't haggle," she says, writing it. "Good. Three a night. Don't make me sorry I'm cheap at it."*
arrangement: chair-cut 25 / 3
→ end
