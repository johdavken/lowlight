/** A test contract (tier 3 contracts spec): an offer, three pieces of groundwork, a night to template, two fallouts. */
const STATS = [['reflex', 'cool'], ['tech', 'wits'], ['body', 'reflex'], ['cool', 'tech'], ['wits', 'body'], ['reflex', 'wits'], ['cool', 'body']];
const CHECKS = [55, 55, 55, 50, 50, 50, 50];

const night = STATS.map(([a, b], i) => {
  const id = i === 0 ? 'night' : `n${i}`;
  const last = i === STATS.length - 1;
  const next = last ? 'end' : `n${i + 1}`;
  return [
    `# ${id}`, '', '*The night.*', '',
    `- x: X. → w${i} / l${i} [check ${a} ${CHECKS[i]}]`,
    `- y: Y. → w${i} / l${i} [check ${b} ${CHECKS[i]}]`,
    '', `## w${i}`, '*On.*', ...(last ? ['pay: full'] : []), `→ ${next}`,
    '', `## l${i}`, '*Worse.*', ...(last ? ['take: none'] : []), `→ ${next}`, '',
  ].join('\n');
}).join('\n');

const report = (piece: string) => `# report-${piece} if ${piece}=blown

*It went badly at the ${piece}.*

- leave: Leave it. → ${piece}-left
- burn: Burn it. → ${piece}-burned [set ${piece}-burned=yes]

# report-${piece}

*It went fine at the ${piece}.*

- leave: Leave it. → ${piece}-left
- burn: Burn it. → ${piece}-burned [set ${piece}-burned=yes]

## ${piece}-left
*You leave it.*
→ back

## ${piece}-burned
*You burn it.*
→ back
`;

export const CONTRACT = `---
title: The Test Contract
kind: contract
tier: 3
with: [mother-rot]
starts: haes-noodles
after: null
pitch: A small debt.
pay: 1000-1200
take-size: 6
night: +72h
fallout: +48h
groundwork: boat muscle, roof ears, goodwill face
piece boat: Her skiff, at its mooring on the Bell Street cut. It goes under before light. Someone has to pull the plug with half the stretch asleep around them.
piece roof: A room in a building he controls. The landlord changes the bolt and her things go on the landing. Someone needs to be there to see what comes out.
piece goodwill: Her name on the water. A few words on her stretch, and the ferries stop carrying her. Everyone there owes him. It only needs saying.
posts-at: 45
rumor: Mother Rot has been asking after you.
---

# offer

*He turns the ledger round.*

- take: Take it. → taken
- ask: Ask what she did, and take it. → taken

## taken
*He closes the ledger.*
→ back

${report('boat')}
${report('roof')}
${report('goodwill')}
${night}
# fallout if grade=blown

*It went badly, and he knows.*

- nod: Nod. → done
- say: Say nothing. → done

# fallout

*She's at his table.*

- nod: Nod. → done
- say: Say nothing. → done

## done
*That's that.*
→ end
`;
