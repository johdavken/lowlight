---
title: The Last One
quest: the-last-one
patience: adebayo 2, rue 3
leaks: rue → adebayo unless angle.glass=yes
---

# cards
- POST [street] THE NIGHT: Garro's post on the second ring, then the sixty-first at two. | fills: WHERE | from: free
- KESTREL [cover] KESTREL: The Pylon desk all night, routing haulers. Ask Kestrel. | fills: WHERE | from: free
- FOLLOWED [cover] THE RUNNER: I heard she was going in. I went up after her. | fills: WHERE | from: free | if: turn!=close
- HANDED [notebook] HER FILE: The runner's file, on your desk, the night I closed it. | fills: TAKE | from: free | if: turn=close
- RUEFILE [notebook] HER FILE: The runner's file. Voltaic, the night she went in. | fills: TAKE | from: free | if: turn=hers
- BOTHFILES [notebook] BOTH FILES: Hers, and Kade's. My signature's on the last sheet. | fills: TAKE | from: free | if: turn=truth
- NOTHING [cover] THE DRAWER: It was open when I got there. I touched nothing. | fills: TAKE | from: free | if: turn!=close
- CREW [street] THE CREW: Three people the branch has never heard of, paid in sol. | fills: HELP | from: free
- IMOGEN [said] IMOGEN: The clerk on the sixty-first. She lent the pass. | fills: HELP | from: given
- ALONE [cover] ALONE: Nobody. Just me and your signature. | fills: HELP | from: free
- BRANCH [said] THE BRANCH: Case officer. Seven-one-one-four before that. | fills: WHO | from: free
- DONE [said] NOT THEIRS: I'm not theirs. Not after that drawer. | fills: WHO | from: free | if: turn!=close
- DONE-LIE [cover] NOT THEIRS: I'm not theirs. Not any more. | fills: WHO | from: free | if: turn=close
- ARREARS [notebook] THE OFFER: A suspended charge for your debts. Same as mine at nineteen. | fills: OFFER | from: free
- MINE [cover] MY OFFER: It was my offer. The branch never knew. | fills: OFFER | from: free
- KADE-Q [notebook] THE LAST ONE: Ari Kade. He's in the Q. I signed it. | fills: LAST | from: free
- UNLUCKY [cover] HE GOT UNLUCKY: Kade got unlucky. That's all. | fills: LAST | from: free
- DESK [grid] THE NIGHT DESK: A Kestrel badge through the side door, 02:14. | from: given
- GREY [street] THE LOBBY: A man in Kestrel's jacket out at four, holding his arm wrong. | from: given
- ARM [body] YOUR SHOULDER: You're holding it like a man who came off a ladder. | from: given
- CUP [said] GARRO: Garro rang. Your man sat on his ring, and he called you Xander. | from: free | if: garro=knows
- LOSTPASS [notebook] A LOST PASS: A clerk lost her pass that week, and cried in her supervisor's office. | from: free | if: pass=blown
- DOOR [body] THE STEEL ROOM: Somebody put a shoulder to the door. | from: given
- TAP [grid] SHE KNEW: The runner's deck has been ours since Arrears. She never left her hab. | from: free | if: turn=hers
- LENS [grid] SHE KNEW: The steel room has its own eye. I watched you lift both. | from: free | if: turn=truth
- KNEW [said] SHE KNEW: Your three, Xander. I've had them since the second night. | from: free | if: turn=close
- CUT [said] THE LINE WENT DEAD: You closed it mid-question, and came up the stair with their paper. | from: free | if: turn=close
- NAMED [said] HIS NAME: You said Ari Kade like it cost you. | from: free | if: named=yes

# adebayo
asks: WHERE | WHERE WERE YOU · TAKE | WHAT DID YOU TAKE · HELP | WHO HELPED
- knows DESK
- knows GREY
- knows ARM
- knows CUP
- knows LOSTPASS
- knows DOOR
- knows TAP unmarked
- knows LENS unmarked
- knows KNEW unmarked
- costs IMOGEN → clerk=burned
- fills TAKE HANDED if turn=close

# rue
asks: WHO | WHO YOU ARE · OFFER | WHAT'S THE OFFER · LAST | WHAT HAPPENED TO THE LAST ONE
- knows CUT
- knows NAMED
- costs KADE-Q → kade=told
- fills LAST KADE-Q if turn=truth

# clashes
- KESTREL × DESK: "The desk had your badge at 02:14. Try again."
- KESTREL × GREY: "Kestrel's jacket left my tower at four, holding its arm."
- KESTREL × ARM: "You didn't do that at a desk."
- KESTREL × CUP: "Garro says you were on his ring."
- ALONE × CUP: "Garro gave your man a coffee."
- ALONE × LOSTPASS: "Then whose pass was it, Xander?"
- ALONE × KNEW: "Your three. I've had them since the second night."
- NOTHING × DOOR: "It was open, was it?"
- NOTHING × LENS: "The room has its own eye, Xander. You lifted both."
- FOLLOWED × TAP: "She never left her hab. I've had her deck since Arrears."
- KADE-Q × NOTHING: "You told the runner what's in Kade's file. You touched nothing?"
- DONE × FOLLOWED: "You went up after her for me, and told her you're not mine."
- UNLUCKY × NAMED: "You said his name like it cost you. Unlucky?"
- DONE-LIE × CUT: "You closed the line on me and came up with their paper."
- MINE × CUT: "It's their paper. I've signed it."
