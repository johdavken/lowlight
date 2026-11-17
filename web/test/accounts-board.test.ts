import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAccounts } from '../src/room/table/accounts';
import type { AccountsView } from '../../shared/accounts';

afterEach(() => document.body.replaceChildren());

// The accounts board's screen (Two Stories spec §5, layout A): it draws the server's view and sends moves.
const VIEW: AccountsView = {
  id: 'mini',
  title: 'Mini',
  listeners: [
    {
      id: 'adebayo',
      name: 'Adebayo',
      portrait: null,
      patience: 2,
      patienceMax: 2,
      asks: [
        { key: 'WHERE', question: 'WHERE WERE YOU', locked: false },
        { key: 'TAKE', question: 'WHAT DID YOU TAKE', locked: true, card: { id: 'HANDED', kind: 'notebook', source: 'HER FILE', line: 'On your desk.', true: true, fills: ['TAKE'] } },
        { key: 'HELP', question: 'WHO HELPED', locked: false, card: { id: 'CREW', kind: 'street', source: 'THE CREW', line: 'Three.', true: true, fills: ['HELP'] } },
      ],
      holds: [{ source: 'THE NIGHT DESK' }, { source: null }, { source: 'YOUR SHOULDER', card: { id: 'ARM', kind: 'body', source: 'YOUR SHOULDER', line: 'Off a ladder.', true: true, fills: [] } }, { source: 'MY OFFER', glass: true }],
    },
    {
      id: 'rue',
      name: 'Rue',
      portrait: '/api/agents/rue/thumb',
      patience: 3,
      patienceMax: 3,
      asks: [
        { key: 'WHO', question: 'WHO YOU ARE', locked: false },
        { key: 'OFFER', question: "WHAT'S THE OFFER", locked: false, card: { id: 'MINE', kind: 'cover', source: 'MY OFFER', line: 'Mine.', true: false, fills: ['OFFER'] } },
        { key: 'LAST', question: 'WHAT HAPPENED TO THE LAST ONE', locked: false },
      ],
      holds: [{ source: 'HIS NAME' }],
    },
  ],
  hand: [
    { id: 'KESTREL', kind: 'cover', source: 'KESTREL', line: 'The Pylon desk.', true: false, fills: ['WHERE'], pressed: true },
    { id: 'POST', kind: 'street', source: 'THE NIGHT', line: "Garro's post.", true: true, fills: ['WHERE'] },
    { id: 'BRANCH', kind: 'said', source: 'THE BRANCH', line: 'Case officer.', true: true, fills: ['WHO'] },
  ],
  eye: { from: 'rue', to: 'adebayo', dark: false },
  tellOpen: false,
};
function board(v: Partial<AccountsView> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onMove = vi.fn();
  const b = mountAccounts(host, { onMove });
  b.show({ ...VIEW, ...v });
  const q = (s: string) => host.querySelector<HTMLElement>(s)!;
  const all = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
  const card = (id: string) => q(`.ac-hand .ac-card[data-id="${id}"]`);
  const col = (l: string) => q(`.ac-col[data-l="${l}"]`);
  return { host, b, onMove, q, all, card, col };
}

describe('the accounts board screen', () => {
  it('in HUD lines (mockup accounts-hud.html A): an empty blank asks its question, a filled one says TRUE or COVER, TELL sits under the columns, a name takes her colour', () => {
    const t = board({ listeners: [{ ...VIEW.listeners[0], accent: '#e3dcc8' }, VIEW.listeners[1]] });
    expect(t.q('.ac-col[data-l="rue"] .ac-blank[data-k="WHO"] .ac-q').textContent).toBe('WHO YOU ARE?');
    expect(t.q('.ac-col[data-l="rue"] .ac-blank[data-k="OFFER"] .ac-tf').textContent).toBe('COVER');
    expect(t.q('.ac-col[data-l="adebayo"] .ac-blank[data-k="HELP"] .ac-tf').textContent).toBe('TRUE');
    expect(t.q('.ac-main > .ac-tell')).toBeTruthy();
    expect(t.q('.ac-hand .ac-tell')).toBeNull();
    expect(t.q('.ac-tell small').textContent).toBe('FILL BOTH ACCOUNTS');
    expect(t.col('adebayo').style.getPropertyValue('--ac-who')).toBe('#e3dcc8');
    expect(t.col('rue').style.getPropertyValue('--ac-who')).toBe('');
    // The hand lies flat: no card is turned.
    expect(t.all('.ac-card').every((c) => !c.style.getPropertyValue('--r'))).toBe(true);
  });
  it("THEY'VE GOT shows sources face down, and the unmarked card with none", () => {
    const t = board();
    const held = [...t.col('adebayo').querySelectorAll<HTMLElement>('.ac-held')];
    expect(held.length).toBe(4);
    expect(held[0]!.textContent).toBe('THE NIGHT DESK');
    expect(held[0]!.classList.contains('up')).toBe(false);
    expect(held[1]!.classList.contains('unmarked')).toBe(true);
    expect(held[1]!.textContent).toBe('?');
    expect(held[3]!.classList.contains('glass')).toBe(true);
    expect(held[3]!.textContent).toContain('THE GLASS');
  });
  it('a flipped card shows its line', () => {
    const up = board().col('adebayo').querySelector<HTMLElement>('.ac-held.up')!;
    expect(up.textContent).toContain('YOUR SHOULDER');
    expect(up.textContent).toContain('Off a ladder.');
  });
  it('a locked blank shows its pin and takes no click', () => {
    const t = board();
    const take = t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="TAKE"]')!;
    expect(take.classList.contains('locked')).toBe(true);
    expect(take.textContent).toContain('PIN');
    take.click();
    t.card('POST').click();
    take.click();
    expect(t.onMove).not.toHaveBeenCalled();
  });
  it("the eye reads RECORDING, what went up the glass shows in the other's THEY'VE GOT, and DARK 01:00–04:00 in the dark", () => {
    const t = board();
    expect(t.q('.ac-eye').classList.contains('dark')).toBe(false);
    expect(t.q('.ac-eye').textContent).toContain('RECORDING');
    // The eye lists nothing itself now (mockup accounts-hud.html A): the trace runs to the glass's chips.
    expect(t.all('.ac-eye .ac-thread')).toEqual([]);
    expect(t.all('.ac-col[data-l="adebayo"] .ac-held.glass').map((x) => x.textContent)).toEqual([expect.stringContaining('MY OFFER')]);
    const d = board({ eye: { from: 'rue', to: 'adebayo', dark: true } });
    expect(d.all('.ac-eye.dark').length).toBe(1);
    expect(d.q('.ac-eye.dark').textContent).toContain('DARK 01:00–04:00');
    expect(d.all('.ac-eye.dark .ac-thread')).toEqual([]);
  });
  it('click a hand card then a blank sends place', () => {
    const t = board();
    t.card('POST').click();
    expect(t.card('POST').classList.contains('sel')).toBe(true);
    t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="WHERE"]')!.click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'place', card: 'POST', listener: 'adebayo', blank: 'WHERE' });
  });
  it("a blank the picked card can't answer takes no click, and the card stays picked (review)", () => {
    const t = board();
    t.card('POST').click();
    t.col('rue').querySelector<HTMLElement>('.ac-blank[data-k="WHO"]')!.click();
    expect(t.onMove).not.toHaveBeenCalled();
    expect(t.card('POST').classList.contains('sel')).toBe(true);
  });
  it('a refusal clears on the next move (review)', () => {
    const t = board();
    t.b.say('Nothing there.');
    t.card('POST').click();
    t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="WHERE"]')!.click();
    expect(t.q('.ac-line').textContent).toBe('');
  });
  it('click a placed card sends take', () => {
    const t = board();
    t.col('rue').querySelector<HTMLElement>('.ac-blank[data-k="OFFER"]')!.click();
    expect(t.onMove).toHaveBeenCalledWith({ kind: 'take', listener: 'rue', blank: 'OFFER' });
  });
  it('TELL is disabled until tellOpen', () => {
    const t = board();
    const tell = t.q('.ac-tell') as HTMLButtonElement;
    expect(tell.disabled).toBe(true);
    tell.click();
    expect(t.onMove).not.toHaveBeenCalled();
    const o = board({ tellOpen: true });
    (o.q('.ac-tell') as HTMLButtonElement).click();
    expect(o.onMove).toHaveBeenCalledWith({ kind: 'tell' });
  });
  it('COVER cards carry .cover', () => {
    const t = board();
    expect(t.card('KESTREL').classList.contains('cover')).toBe(true);
    expect(t.card('KESTREL').classList.contains('pressed')).toBe(true);
    expect(t.card('POST').classList.contains('cover')).toBe(false);
  });
  it("a press's line shows under the listener who said it; a refusal under the board", () => {
    const t = board();
    t.b.say('Try again.', 'adebayo');
    expect(t.col('adebayo').querySelector('.ac-said')!.textContent).toContain('Try again.');
    expect(t.col('rue').querySelector('.ac-said')!.textContent).toBe('');
    // A move on the other listener keeps it; a move on the same one clears it.
    t.card('BRANCH').click();
    t.col('rue').querySelector<HTMLElement>('.ac-blank[data-k="WHO"]')!.click();
    expect(t.col('adebayo').querySelector('.ac-said')!.textContent).toContain('Try again.');
    t.card('POST').click();
    t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="WHERE"]')!.click();
    expect(t.col('adebayo').querySelector('.ac-said')!.textContent).toBe('');
    t.b.say('Take that card back first.');
    expect(t.q('.ac-line').textContent).toBe('Take that card back first.');
  });
  it('holds no moves while she speaks, and says who is on the line', () => {
    const t = board({ tellOpen: true });
    t.b.hold('Rue');
    expect(t.q('.ac-heldby').textContent).toBe('RUE ON THE LINE');
    t.card('POST').click();
    t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="WHERE"]')!.click();
    (t.q('.ac-tell') as HTMLButtonElement).click();
    expect(t.onMove).not.toHaveBeenCalled();
    t.b.hold(null);
    t.card('POST').click();
    t.col('adebayo').querySelector<HTMLElement>('.ac-blank[data-k="WHERE"]')!.click();
    expect(t.onMove).toHaveBeenCalledTimes(1);
  });
  it('names each column, with a bust or an initial, and its patience boxes', () => {
    const t = board();
    expect(t.col('adebayo').querySelector('.ac-name')!.textContent).toBe('ADEBAYO');
    expect(t.col('adebayo').querySelector('.ac-bust')!.textContent).toBe('A');
    expect(t.col('rue').querySelector<HTMLImageElement>('img.ac-bust')!.getAttribute('src')).toBe('/api/agents/rue/thumb');
    expect(t.col('rue').querySelectorAll('.ac-pat i').length).toBe(3);
  });
});
