# Crew errands (crew spec §2): one --- block per kind. `needs: offer` is drawn nightly (collect), `needs: lot` sells from the stash, `retired: yes` is never offered. Lines fill {name}, {district}, {job}, {place}. `art: <file>` is optional, a picture in world/quests/art.

---
kind: hustle
label: Hustle in {district}
tag: SOL
suits: fence, face
hours: 5
risk: med
needs: district known
retired: yes
blurb: A crate of something that fell off a truck. Somebody has to sit on it and find buyers who won't ask.
clean:
  - effect: sol 150-200 · rep +1
  - "{name} moved the lot before midnight. Nobody asked where it came from."
  - "{name} found a buyer who paid in clean sol and didn't count it."
  - "{name} sold it twice, to two people who'll never meet."
messy:
  - effect: sol 80 · heat +1
  - "{name} sold half. The other half's at the bottom of a canal."
  - "{name} got paid, but the buyer had a friend who wrote down a face."
blown:
  - "{name} was holding when the Sentinels came through the market."
  - "The buyer was SDG. {name} never saw it coming."
---
kind: collect
label: Collect in {district}
tag: SOL
suits: muscle
hours: 4
risk: high
needs: district known
retired: yes
blurb: A man in {district} owes money to people who sold the debt on. Now it's yours to collect.
clean:
  - effect: sol 220-300
  - "{name} knocked once. The money was already in an envelope."
  - "{name} came back with the debt and the debtor's watch, for the interest."
messy:
  - effect: sol 120 · heat +1
  - "{name} got some of it. The neighbours got a show."
  - "{name} got paid. The debtor's brother called the Sentinels anyway."
blown:
  - "The debtor had friends. {name} found out how many."
  - "{name} knocked on the wrong door. The right door had a gun behind it."
---
kind: lay-low
label: Lay low in {district}
tag: HEAT
suits: face
hours: 6
risk: low
needs: district heat
art: lay-low.webp
blurb: Buy rounds in {district}. Tell people you were somewhere else that night, until they believe it.
clean:
  - effect: heat -2
  - "{name} told the story right. By closing, three people swore they'd seen you elsewhere."
  - "{name} spread enough sol and enough lies that {district} looked somewhere else."
messy:
  - effect: heat -1 · sol -80
  - "{name} told it, but it cost a lot of rounds."
  - "{name} sold half the bar on it. The other half kept quiet, which is something."
blown:
  - "{name}'s story fell apart in front of the wrong listener."
  - "{name} drank more than they bought. The story came out wrong."
---
kind: case
label: Case {job}
tag: PREP
suits: runner, ears
hours: 4
risk: low
needs: job
retired: yes
blurb: Someone sits across from {place} all night and counts who goes in and who doesn't come out. Done clean, tonight's job goes easier.
clean:
  - effect: prep cased=clean
  - "{name} sat across from {place} all night and counted who went in the back."
  - "{name} found the back stair at {place}, and when the guard takes his break."
messy:
  - effect: prep cased=messy · heat +1
  - "{name} got what you needed, but the door at {place} saw a face."
  - "{name} counted the shifts. Someone counted {name}."
blown:
  - "{name} was made outside {place}."
  - "{name} sat in the same window too long."
---
kind: records
label: Pull records for {job}
tag: PREP
suits: runner
hours: 3
risk: med
needs: job
retired: yes
blurb: The building behind tonight's job keeps its schedules on a terminal. Somebody pulls them, and loops a camera on the way out.
clean:
  - effect: prep records=clean
  - "{name} pulled the schedules and looped two cameras. Nobody will know until next week."
  - "{name} has the whole system's floor plan, and a back door in it."
messy:
  - effect: prep records=messy · heat +1
  - "{name} got the schedules, but the terminal logged it."
  - "{name} pulled half before the system kicked them out."
blown:
  - "{name} tripped an alarm two floors down. The Sentinels traced the jack."
  - "{name}'s deck fried halfway in. Somebody noticed the smoke."
---
kind: scout
label: Scout {job}
tag: PREP
suits: ears
hours: 2
risk: low
needs: job
retired: yes
blurb: Listen around {place} for an hour or two. Find out who's working tonight, and what the job really pays.
clean:
  - effect: reveal
  - "{name} heard who's on the door tonight, and what the job really pays."
  - "{name} bought a drink for the right person near {place}."
messy:
  - effect: reveal · heat +1
  - "{name} got the story, but asked one question too many."
  - "{name} heard it all. So did the man at the next table."
blown:
  - "{name} was asking about {place} in the wrong bar."
  - "Somebody at {place} remembered {name}'s face from last time."
---
---
kind: pull-drive
label: Pull a drive in {district}
tag: SOL
group: collect
gives: data
suits: runner
hours: 3
risk: low
needs: offer
blurb: A clinic in {district} keeps its ledgers on a machine nobody patched. Someone goes in over the wire and walks out with the lot.
clean:
  - effect: lot
  - "{name} copied it clean and shut the door behind them."
  - "{name} was out before the logs turned over."
messy:
  - effect: lot damaged · heat +1
  - "{name} got most of it. A sector went bad on the way out, and something noticed."
  - "{name} pulled it in a hurry. Half the index is gone."
blown:
  - "{name} tripped a tracer in {district} and burned the deck to shake it."
  - "The drive was bait. {name} found out with the jack still in."
---
kind: hear-it
label: Hear where it fell in {district}
tag: SOL
group: collect
gives: pharma
suits: ears
hours: 6
risk: low
needs: offer
blurb: A cold case came off a truck somewhere in {district}. Nobody's saying where. Someone sits in the right bars until they do.
clean:
  - effect: lot
  - "{name} bought two drinks and came back with a street number. The case was still cold."
  - "{name} heard it from a nurse who owed somebody. Nothing was missing."
messy:
  - effect: lot damaged · heat +1
  - "{name} found it warm. Half the glass is good. The questions got around."
  - "{name} got there second. The first man left some of it."
blown:
  - "{name} asked the wrong nurse in {district}."
  - "There was no case. There was a man waiting to see who came asking."
---
kind: talk-it-out
label: Talk it out the door in {district}
tag: SOL
group: collect
gives: luxuries
suits: face
hours: 5
risk: med
needs: offer
blurb: A house in {district} is selling off a dead man's things before the family hears. Someone goes in with a good coat and a better story.
clean:
  - effect: lot
  - "{name} left with the case, and the house thanked them for coming."
  - "{name} signed a name that wasn't theirs. Nobody read it."
messy:
  - effect: lot damaged · heat +1
  - "{name} got the case out. The seal didn't make it, and someone took a good look at that coat."
  - "{name} talked well, then had to leave fast."
blown:
  - "The family got there first. {name} met them in the hall."
  - "{name}'s story held until someone in {district} rang the name."
---
kind: lift-crate
label: Lift a crate in {district}
tag: SOL
group: collect
gives: contraband, parts
suits: muscle
hours: 4
risk: high
needs: offer
blurb: A container in {district} has a cheap seal and one man on it after midnight. Someone goes down there with bolt cutters.
clean:
  - effect: lot
  - "{name} cut the seal and walked the crate out. The man on the gate looked at his shoes."
  - "{name} had it on a handcart before the shift changed."
messy:
  - effect: lot damaged · heat +1
  - "{name} dropped it off the stack. Some of it still works. The noise carried."
  - "{name} got the crate. The gate man got a look."
blown:
  - "There were two men on it, and they'd been told."
  - "{name} cut the seal on a dock in {district} with a Sentinel camera on it."
---
kind: buy-cheap
label: Buy it cheap in {district}
tag: SOL
group: collect
gives: any
cost: 0.4
suits: fence
hours: 3
risk: low
needs: offer
blurb: Someone in {district} needs it gone by morning and won't ask why. It costs sol up front, and it's the safest way to fill the stash.
clean:
  - effect: lot
  - "{name} counted it out on a car roof. It's all there."
  - "{name} paid what they asked, and it was worth twice that."
messy:
  - effect: lot damaged · heat +1
  - "{name} paid for a full lot and opened it at home. Somebody else opened it first."
  - "{name} got it, and a seller who talks."
blown:
  - "The seller took the sol and the night. {name} is still waiting in {district}."
  - "It was marked. {name} walked it straight past the people who marked it."
---
kind: call-debt
label: Call in a debt in {district}
tag: SOL
group: collect
gives: any
suits: muscle
hours: 4
risk: high
needs: offer
blurb: A man in {district} owes money to people who sold the debt on. He hasn't got it. He's got a back room.
clean:
  - effect: lot
  - "{name} knocked once. The goods were already by the door."
  - "{name} took what was in the back room, for the interest."
messy:
  - effect: lot damaged · heat +1
  - "{name} got some of it. The neighbours got a show."
  - "{name} got paid in kind. The debtor's brother called the Sentinels anyway."
blown:
  - "The debtor had friends. {name} found out how many."
  - "{name} knocked on the wrong door. The right door had a gun behind it."
---
kind: sell
label: Hustle in {district}
tag: SOL
group: hustle
suits: runner, ears, face, fence, muscle
hours: 5
risk: med
needs: lot
blurb: Goods in the stash don't pay anyone. Somebody has to sit on them and find buyers who won't ask.
clean:
  - effect: rep +1
  - "{name} moved the lot before midnight. Nobody asked where it came from."
  - "{name} found a buyer who paid in clean sol and didn't count it."
  - "{name} sold it twice, to two people who'll never meet."
messy:
  - "{name} sold half. The other half's at the bottom of a canal."
  - "{name} got paid, but the buyer had a friend who wrote down a face."
blown:
  - "{name} was holding when the Sentinels came through the market."
  - "The buyer was SDG. {name} never saw it coming."
---
kind: groundwork
label: Groundwork for {job}
tag: PREP
suits: runner, ears, face, fence, muscle
hours: 8
risk: med
needs: run
blurb: Part of a contract. Someone goes and does it, and you hear how it went.
clean:
  - "{name} did what you asked."
  - "{name} is back. It's done."
messy:
  - "{name} got it done. It wasn't quiet."
  - "{name} got it done, and people saw."
blown:
  - "{name} came back without it."
  - "It went wrong for {name}."
