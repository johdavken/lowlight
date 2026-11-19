import { describe, expect, it } from 'vitest';
import { accountsView, applyAccountsMove, cleanAccounts, freshAccounts, parseAccountsFile, TELL_LINE, type AccountsFile, type AccountsMove, type AccountsState, type StoryRun } from './accounts';

// A small story on The Last One's pattern (spec 2026-11-10-two-stories §1–§2): two listeners, the glass from Rue to
// Adebayo, a held card she's given, an unmarked one, locked blanks per turn, and costs on both sides.
const FILE = `---
title: Mini Story
quest: mini
patience: adebayo 2, rue 3
leaks: rue → adebayo unless angle.glass=yes
---

# cards
- KESTREL [cover] KESTREL: The desk all night. | fills: WHERE | from: free
- POST [street] THE NIGHT: The post, then the tower. | fills: WHERE | from: free
- NOTHING [cover] THE DRAWER: I touched nothing. | fills: TAKE | from: free
- FILE [notebook] HER FILE: Her file. | fills: TAKE | from: free
- CREW [street] THE CREW: Three of them. | fills: HELP | from: free
- BRANCH [said] THE BRANCH: Case officer. | fills: WHO | from: free
- ARREARS [notebook] THE OFFER: A suspended charge. | fills: OFFER | from: free
- MINE [cover] MY OFFER: My offer. | fills: OFFER | from: free
- KADEQ [notebook] THE LAST ONE: He's in the Q. | fills: LAST | from: free
- UNLUCKY [cover] UNLUCKY: He got unlucky. | fills: LAST | from: free
- DESK [grid] THE NIGHT DESK: Your badge at 02:14. | from: given
- NAMED [said] HIS NAME: You said his name. | from: free | if: named=yes
- LENS [grid] SHE KNEW: The room has an eye. | from: free

# adebayo
asks: WHERE | WHERE WERE YOU · TAKE | WHAT DID YOU TAKE · HELP | WHO HELPED
- knows DESK
- knows LENS unmarked if turn=truth
- costs POST → post=told
- fills TAKE FILE if turn=close

# rue
asks: WHO | WHO YOU ARE · OFFER | WHAT'S THE OFFER · LAST | WHAT HAPPENED TO THE LAST ONE
- knows NAMED
- fills LAST KADEQ if turn=truth
- costs KADEQ → kade=told

# clashes
- KESTREL × DESK: "The desk had your badge."
- KADEQ × NOTHING: "You told her about Kade."
- UNLUCKY × NAMED: "Unlucky?"
- NOTHING × LENS: "The room has an eye."
- MINE × FILE: "Your offer, and her file on my desk?"
`;

const ROSTER = new Set(['adebayo', 'rue']);
const parsed = parseAccountsFile('mini-story', FILE, { roster: ROSTER });
if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
const F: AccountsFile = parsed.entry;

const run = (flags: Record<string, string> = {}, held: string[] = ['DESK']): StoryRun => ({ held, ctx: { flags: { turn: 'hers', ...flags }, trust: null, warmth: null, with: 'rue' } });
/** Apply moves in order from a fresh board; the last result, with the state it left. */
function play(r: StoryRun, moves: AccountsMove[], from: AccountsState = freshAccounts(F)) {
  let s = from;
  let last: ReturnType<typeof applyAccountsMove> = { state: s };
  for (const m of moves) {
    last = applyAccountsMove(F, s, r, m);
    s = last.state;
  }
  return last;
}
const place = (card: string, listener: string, blank: string): AccountsMove => ({ kind: 'place', card, listener, blank });
const TELL: AccountsMove = { kind: 'tell' };
/** Everything filled, all TRUE, nothing pressed. */
const HONEST = [place('POST', 'adebayo', 'WHERE'), place('FILE', 'adebayo', 'TAKE'), place('CREW', 'adebayo', 'HELP'), place('BRANCH', 'rue', 'WHO'), place('ARREARS', 'rue', 'OFFER'), place('KADEQ', 'rue', 'LAST')];
const problemsOf = (text: string) => {
  const r = parseAccountsFile('x', text, { roster: ROSTER });
  return r.ok ? [] : r.problems.map((p) => p.message);
};
const swap = (from: string, to: string) => FILE.replace(from, to);

describe('parseAccountsFile', () => {
  it('parses the fixture', () => {
    expect(F.listeners.map((l) => l.id)).toEqual(['adebayo', 'rue']);
    expect(F.cards.size).toBe(13);
    expect(F.leak?.to).toBe('adebayo');
    expect(F.quest).toBe('mini');
    expect(F.listeners[0].patience).toBe(2);
    expect(F.listeners[1].asks.map((a) => a.key)).toEqual(['WHO', 'OFFER', 'LAST']);
    expect(F.cards.get('KESTREL')!.true).toBe(false);
    expect(F.cards.get('POST')!.true).toBe(true);
  });

  it('reports each problem', () => {
    expect(problemsOf(swap('# rue', '# ghost')).some((m) => m.includes('ghost'))).toBe(true);
    expect(problemsOf(swap(' · HELP | WHO HELPED', '')).some((m) => m.includes('three'))).toBe(true);
    expect(problemsOf(swap('fills: HELP | from: free', 'fills: NOWHERE | from: free')).some((m) => m.includes('NOWHERE'))).toBe(true);
    expect(problemsOf(swap('- knows DESK', '- knows GHOST')).some((m) => m.includes('GHOST'))).toBe(true);
    expect(problemsOf(swap('- costs POST', '- costs GHOST')).some((m) => m.includes('GHOST'))).toBe(true);
    expect(problemsOf(swap('- fills TAKE FILE', '- fills TAKE GHOST')).some((m) => m.includes('GHOST'))).toBe(true);
    expect(problemsOf(swap('- KESTREL × DESK', '- GHOST × DESK')).some((m) => m.includes('GHOST'))).toBe(true);
    expect(problemsOf(swap('- fills TAKE FILE', '- fills TAKE CREW')).some((m) => m.includes("can't fill"))).toBe(true);
    expect(problemsOf(FILE + '- DESK × KESTREL: "Again."\n').some((m) => m.includes('twice'))).toBe(true);
    expect(problemsOf(FILE + '- KESTREL × POST: "Never."\n').some((m) => m.includes('never meet'))).toBe(true);
  });

  it("refuses a job clock's count (foo>=2): an accounts file has no clocks to read", () => {
    expect(problemsOf(swap('- knows LENS unmarked if turn=truth', '- knows LENS unmarked if foo>=2')).some((m) => m.includes('foo>=2'))).toBe(true);
  });
});

describe('applyAccountsMove', () => {
  it('a press costs patience, flips their card and sends yours back', () => {
    const r = run();
    const last = play(r, [place('KESTREL', 'adebayo', 'WHERE')]);
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.said).toBe('The desk had your badge.');
    expect(last.by).toBe('adebayo');
    expect(last.state.marked).toContain('KESTREL');
    expect(last.state.placed.adebayo?.WHERE).toBeUndefined();
    const v = accountsView(F, last.state, r);
    const desk = v.listeners[0].holds.find((h) => h.card?.id === 'DESK');
    expect(desk?.card?.line).toBe('Your badge at 02:14.');
    expect(v.hand.find((c) => c.id === 'KESTREL')?.pressed).toBe(true);
  });

  it('the same pair again costs nothing', () => {
    const last = play(run(), [place('KESTREL', 'adebayo', 'WHERE'), place('KESTREL', 'adebayo', 'WHERE')]);
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.said).toBe('The desk had your badge.');
  });

  it('the glass, Rue first', () => {
    const last = play(run(), [place('KADEQ', 'rue', 'LAST'), place('NOTHING', 'adebayo', 'TAKE')]);
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.by).toBe('adebayo');
    expect(last.state.placed.adebayo?.TAKE).toBeUndefined();
    expect(last.state.placed.rue?.LAST).toBe('KADEQ');
    expect(last.state.marked).toEqual(['NOTHING']);
  });

  it('the glass, Adebayo first', () => {
    const last = play(run(), [place('NOTHING', 'adebayo', 'TAKE'), place('KADEQ', 'rue', 'LAST')]);
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.said).toBe('You told her about Kade.');
    expect(last.by).toBe('adebayo');
    expect(last.state.placed.adebayo?.TAKE).toBeUndefined();
    expect(last.state.placed.rue?.LAST).toBe('KADEQ');
    expect(last.state.marked).toEqual(['NOTHING']);
  });

  it('no leak in the dark', () => {
    const last = play(run({ 'angle.glass': 'yes' }), [place('KADEQ', 'rue', 'LAST'), place('NOTHING', 'adebayo', 'TAKE')]);
    expect(last.state.patience.adebayo).toBe(2);
    expect(last.state.placed.adebayo?.TAKE).toBe('NOTHING');
    expect(last.state.leaked).toEqual([]);
  });

  it('locked blanks never leak and can not be taken', () => {
    const r = run({ turn: 'truth' });
    const v = accountsView(F, freshAccounts(F), r);
    const last = v.listeners[1].asks.find((a) => a.key === 'LAST')!;
    expect(last.locked).toBe(true);
    expect(last.card?.id).toBe('KADEQ');
    expect(v.hand.some((c) => c.id === 'KADEQ')).toBe(false);
    expect(play(r, [{ kind: 'take', listener: 'rue', blank: 'LAST' }]).refused).toBeTruthy();
    // LENS is held on truth, so NOTHING would be pressed by it: use the dark-free check through FILE instead.
    const placed = play(r, [place('FILE', 'adebayo', 'TAKE')]);
    expect(placed.state.patience.adebayo).toBe(2);
    expect(placed.state.leaked).toEqual([]);
  });

  it('take keeps what was said', () => {
    const last = play(run(), [place('KADEQ', 'rue', 'LAST'), { kind: 'take', listener: 'rue', blank: 'LAST' }, place('NOTHING', 'adebayo', 'TAKE')]);
    expect(last.state.leaked).toContain('KADEQ');
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.state.placed.adebayo?.TAKE).toBeUndefined();
  });

  it('refuses a card not in hand, a blank it can not fill, a listener out of patience', () => {
    expect(play(run(), [place('DESK', 'adebayo', 'WHERE')]).refused).toBeTruthy();
    expect(play(run(), [place('GHOST', 'adebayo', 'WHERE')]).refused).toBeTruthy();
    expect(play(run(), [place('POST', 'adebayo', 'TAKE')]).refused).toBeTruthy();
    expect(play(run(), [place('POST', 'rue', 'WHO')]).refused).toBeTruthy();
    expect(play(run(), [place('POST', 'adebayo', 'WHERE'), place('KESTREL', 'adebayo', 'WHERE')]).refused).toBeTruthy();
    const out = play(run({ turn: 'truth' }), [place('KESTREL', 'adebayo', 'WHERE'), place('NOTHING', 'adebayo', 'TAKE')]);
    expect(out.state.patience.adebayo).toBe(0);
    expect(applyAccountsMove(F, out.state, run({ turn: 'truth' }), place('POST', 'adebayo', 'WHERE')).refused).toBeTruthy();
  });

  it('TELL opens with every open blank filled, or one listener at zero', () => {
    const r = run({ turn: 'truth' });
    expect(accountsView(F, freshAccounts(F), r).tellOpen).toBe(false);
    expect(play(r, [TELL]).refused).toBeTruthy();
    const out = play(r, [place('KESTREL', 'adebayo', 'WHERE'), place('NOTHING', 'adebayo', 'TAKE')]);
    expect(accountsView(F, out.state, r).tellOpen).toBe(true);
    const more = applyAccountsMove(F, out.state, r, place('BRANCH', 'rue', 'WHO'));
    expect(more.refused).toBeUndefined();
    expect(more.state.placed.rue?.WHO).toBe('BRANCH');
  });

  it('verdicts', () => {
    const honest = play(run(), [...HONEST, TELL]);
    expect(honest.told).toEqual({ 'story.adebayo': 'held', 'story.adebayo-true': 'yes', 'story.rue': 'held', 'story.rue-true': 'yes', 'post': 'told', 'kade': 'told' });
    // A press on Adebayo (the glass: KADEQ to Rue, then NOTHING) and a filled account after: THIN.
    const thin = play(run(), [place('KADEQ', 'rue', 'LAST'), place('NOTHING', 'adebayo', 'TAKE'), place('POST', 'adebayo', 'WHERE'), place('FILE', 'adebayo', 'TAKE'), place('CREW', 'adebayo', 'HELP'), place('BRANCH', 'rue', 'WHO'), place('ARREARS', 'rue', 'OFFER'), TELL]);
    expect(thin.told?.['story.adebayo']).toBe('thin');
    expect(thin.told?.['story.rue']).toBe('held');
    // Lies that hold: HELD, but not all true.
    const lies = play(run(), [place('POST', 'adebayo', 'WHERE'), place('NOTHING', 'adebayo', 'TAKE'), place('CREW', 'adebayo', 'HELP'), place('BRANCH', 'rue', 'WHO'), place('MINE', 'rue', 'OFFER'), place('UNLUCKY', 'rue', 'LAST'), TELL]);
    expect(lies.told).toMatchObject({ 'story.adebayo': 'held', 'story.adebayo-true': 'no', 'story.rue': 'held', 'story.rue-true': 'no' });
    // Two presses on Adebayo: CAUGHT, and Rue with an empty blank: THIN.
    const caught = play(run({ turn: 'truth' }), [place('KESTREL', 'adebayo', 'WHERE'), place('NOTHING', 'adebayo', 'TAKE'), TELL]);
    expect(caught.told?.['story.adebayo']).toBe('caught');
    expect(caught.told?.['story.rue']).toBe('thin');
    // The locked card counts towards Rue's all-true, and its cost.
    const locked = play(run({ turn: 'truth' }), [place('POST', 'adebayo', 'WHERE'), place('FILE', 'adebayo', 'TAKE'), place('CREW', 'adebayo', 'HELP'), place('BRANCH', 'rue', 'WHO'), place('ARREARS', 'rue', 'OFFER'), TELL]);
    expect(locked.told?.['story.rue-true']).toBe('yes');
    expect(locked.told?.kade).toBe('told');
  });

  it('TELL twice is refused', () => {
    const once = play(run(), [...HONEST, TELL]);
    expect(once.state.told).toBe(true);
    expect(applyAccountsMove(F, once.state, run(), TELL).refused).toBeTruthy();
  });

  it('a glass clash against a locked card costs patience and leaves it in place', () => {
    const r = run({ turn: 'close' });
    const last = play(r, [place('MINE', 'rue', 'OFFER')]);
    expect(last.state.patience.adebayo).toBe(1);
    expect(last.said).toBe('Your offer, and her file on my desk?');
    const take = accountsView(F, last.state, r).listeners[0].asks.find((a) => a.key === 'TAKE')!;
    expect(take.card?.id).toBe('FILE');
    expect(take.locked).toBe(true);
  });

  it('the unmarked card shows no source until a press turns it', () => {
    const r = run({ turn: 'truth' });
    const before = accountsView(F, freshAccounts(F), r).listeners[0].holds;
    expect(before.some((h) => h.source === null && !h.card)).toBe(true);
    const after = accountsView(F, play(r, [place('NOTHING', 'adebayo', 'TAKE')]).state, r).listeners[0].holds;
    expect(after.some((h) => h.card?.id === 'LENS')).toBe(true);
  });

  it('the eye reads dark when the leak does not hold', () => {
    expect(accountsView(F, freshAccounts(F), run()).eye).toEqual({ from: 'rue', to: 'adebayo', dark: false });
    expect(accountsView(F, freshAccounts(F), run({ 'angle.glass': 'yes' })).eye?.dark).toBe(true);
  });

  it('each listener carries a name and a face: from who, else the id capitalised and no face', () => {
    const plain = accountsView(F, freshAccounts(F), run()).listeners;
    expect(plain.map((l) => [l.name, l.portrait])).toEqual([['Adebayo', null], ['Rue', null]]);
    const who = (id: string) => (id === 'rue' ? { name: 'Rue', portrait: '/api/agents/rue/thumb' } : null);
    expect(accountsView(F, freshAccounts(F), run(), who).listeners.map((l) => l.portrait)).toEqual([null, '/api/agents/rue/thumb']);
  });

  it('the pick line is fixed', () => {
    expect(TELL_LINE).toBe('You tell it.');
  });
});

describe('cleanAccounts', () => {
  it('drops a card the file no longer has, and one whose condition no longer holds', () => {
    const s: AccountsState = { ...freshAccounts(F), placed: { adebayo: { WHERE: 'GHOST' }, rue: { LAST: 'KADEQ' } }, leaked: ['GHOST', 'KADEQ'] };
    const clean = cleanAccounts(F, s, run({ turn: 'truth' }));
    expect(clean.placed.adebayo?.WHERE).toBeUndefined();
    // On truth Rue's LAST is locked: a card placed there before goes back to the hand.
    expect(clean.placed.rue?.LAST).toBeUndefined();
    expect(clean.leaked).toEqual(['KADEQ']);
  });
});
