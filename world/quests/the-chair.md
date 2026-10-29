---
title: The Chair
with: [nix-direct]
starts: lowlight-intake
after: trust=high and chair!=yes
posts: 20:00-02:00
pitch: You've done her clients' work, and done it clean. She hasn't said yes to your chair. She hasn't said no lately either.
---

# ledger

*The ledger's open on the desk, and your name's in it more often than it was a month ago. She doesn't look up when you come in. She writes the hour, caps the pen, and waits.*

view nix-direct: You know why they're here. You've watched them take your clients' trouble down the stairs and bring it back up finished, and they've never once asked for the room. That counts. It doesn't make you theirs. If you say yes tonight, it's on your terms or not at all: nobody from your stairs on their list, the room stays out of it, and when you say stop, it stops.
view any: She's already decided something. You just don't know what.

- ask: Ask her to sit your chair. → asked
- wait: Sit down and let her say it first. → asked [clock +30m]

## asked
*"Say a number," she says. "Not a cut. A number. I don't put anything on my ears until it's cleared."*
→ offer

# offer

*She turns the ledger round so you can see the page. There's a line ruled off at the bottom, empty.*

view nix-direct: The house used to tell you what you were worth, and the number was always theirs. This time the number's theirs to say, and yours to take or not. Listen to how they say it.
view any: Whatever you write on that line, she'll hold you to.

- low: Offer a hundred a night. → cheap [set chair=yes]
- fair: Offer a hundred and fifty a night. → fair [set chair=yes]
- high: Offer two hundred a night. → square [set chair=yes]
- two: Offer two hundred a night, for two jobs a night. → two-jobs [needs trust=high and warmth=high, set chair=yes]

## cheap
*She looks at the number a while. "That's what a house pays a girl in her first month," she says, and writes it down anyway. "One job a night. You'll pay it before I'm on your ears, every time."*
arrangement: chair 100 / 1
→ end

## fair
*She writes it on the line in her square hand. "One job a night. Nobody from my stairs on your list. When I say stop, you stop."*
arrangement: chair 150 / 1
→ end

## square
*She writes it down without comment, which is its own kind of comment. "One job a night. The room stays out of it. You'll never think my name where anyone can read it."*
arrangement: chair 200 / 1
→ end

## two-jobs
*"Two," she says, like she's tasting it. Then she writes it. "Two jobs, and if the second one smells wrong I walk, and you don't ask why."*
arrangement: chair 200 / 2
→ end
