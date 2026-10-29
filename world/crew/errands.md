# Crew errands (crew spec §2): one --- block per kind. Lines fill {name}, {district}, {job}, {place}.

---
kind: hustle
label: Hustle in {district}
tag: SOL
suits: fence, face
hours: 5
risk: med
needs: district known
blurb: A crate of something that fell off a truck. Somebody has to sit on it and find buyers who won't ask.
clean:
  - effect: sol 300-400 · rep +1
  - "{name} moved the lot before midnight. Nobody asked where it came from."
  - "{name} found a buyer who paid in clean sol and didn't count it."
  - "{name} sold it twice, to two people who'll never meet."
messy:
  - effect: sol 150 · heat +1
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
blurb: A man in {district} owes money to people who sold the debt on. Now it's yours to collect.
clean:
  - effect: sol 450-600
  - "{name} knocked once. The money was already in an envelope."
  - "{name} came back with the debt and the debtor's watch, for the interest."
messy:
  - effect: sol 250 · heat +1
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
suits: wire
hours: 3
risk: med
needs: job
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
