import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAccounts } from '../src/accounts';

// Accounts files (Two Stories spec §2): world/accounts/<id>.md, read once at startup.
const GOOD = `---
title: Good
quest: q
patience: adebayo 2, rue 3
---
# cards
- POST [street] THE NIGHT: The post. | fills: WHERE | from: free
- DESK [grid] THE DESK: Your badge. | from: given
- KESTREL [cover] KESTREL: The desk. | fills: WHERE | from: free
- BRANCH [said] THE BRANCH: Case officer. | fills: WHO | from: free
# adebayo
asks: WHERE | WHERE · TAKE | TAKE · HELP | HELP
- knows DESK
# rue
asks: WHO | WHO · OFFER | OFFER · LAST | LAST
# clashes
- KESTREL × DESK: "Try again."
`;

function dir(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-'));
  for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(d, n), t);
  return d;
}

describe('loadAccounts', () => {
  const roster = new Set(['adebayo', 'rue']);
  it('loads a good file and skips a bad one with a warning', () => {
    const warns: string[] = [];
    const book = loadAccounts(dir({ 'good.md': GOOD, 'bad.md': GOOD.replace('# rue', '# ghost') }), { roster, caseIds: new Set() }, (m) => warns.push(m));
    expect(book.map((a) => a.id)).toEqual(['good']);
    expect(warns.join(' ')).toMatch(/bad\.md/);
  });
  it('skips an accounts id that is also a case id, with a warning naming both', () => {
    const warns: string[] = [];
    const book = loadAccounts(dir({ 'the-fourteenth.md': GOOD }), { roster, caseIds: new Set(['the-fourteenth']) }, (m) => warns.push(m));
    expect(book).toEqual([]);
    expect(warns.join(' ')).toMatch(/the-fourteenth.*case/);
  });
  it('a missing folder is an empty book', () => {
    expect(loadAccounts('/nope/nowhere', { roster, caseIds: new Set() }, () => {})).toEqual([]);
  });
});
