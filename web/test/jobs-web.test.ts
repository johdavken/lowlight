import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestCards } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import { Feed } from '../src/ui/feed';
import type { ChatMessage, QuestState } from '../../shared/types';

afterEach(() => {
  // A panel a test left open still listens on the window: Esc closes any, so no test's keys reach another's.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.innerHTML = '';
});
const host = () => {
  const h = document.createElement('div');
  document.body.append(h);
  return h;
};
type Active = NonNullable<QuestState['active']>;
const JOB: Active = {
  id: 'back-door',
  title: 'Back Door',
  beat: 'door',
  alarm: 2,
  nerve: { left: 1, max: 5 },
  take: { filled: 3, size: 6 },
  heat: 4,
  pay: [350, 450],
  choices: [
    { id: 'talk', line: 'Talk your way in.', pool: { stat: 'COOL', base: 3, dice: 4, parts: [{ label: 'EASY MARK', dice: 1 }], position: 'wire', noDeck: false } },
    { id: 'kick', line: 'Kick the door.', pool: { stat: 'BODY', base: 2, dice: 2, parts: [], position: 'wire', noDeck: false }, red: true },
    { id: 'grab', line: 'Crack the lock panel.', crack: { length: 6, tries: 5 } },
  ],
};
const cards = (a: Active, story?: string) => {
  const h = host();
  mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show(a, story);
  return h;
};
const card = (h: HTMLElement, id: string) => h.querySelector<HTMLElement>(`.qc-card[data-choice="${id}"]`)!;

describe('the job panel', () => {
  it('the strip shows TAKE and ALARM as clocks, NERVE, HEAT and the pay range (the table spec §4)', () => {
    const h = cards(JOB);
    const take = h.querySelector('.qc-take')!;
    expect(take.querySelectorAll('i')).toHaveLength(6);
    expect(take.querySelectorAll('i.on')).toHaveLength(3);
    const alarm = h.querySelector('.qc-alarm')!;
    expect(alarm.querySelectorAll('i')).toHaveLength(4);
    expect(alarm.querySelectorAll('i.on')).toHaveLength(2);
    expect(h.querySelector('.qc-nerve')!.textContent).toBe('NERVE 1/5');
    expect(h.querySelector('.qc-heat')!.textContent).toBe('HEAT 4');
    expect(h.querySelector('.qc-pay')!.textContent).toBe('PAY 350–450 SOL');
  });

  it('a quest has no strip', () => {
    const h = cards({ id: 'q', title: 'Q', beat: 'b', choices: [{ id: 'a', line: 'A.' }] });
    expect(h.querySelector('.qc-strip')).toBeNull();
  });

  it('a checked card shows its dice and its position (the table spec §4)', () => {
    const h = cards(JOB);
    expect(card(h, 'talk').querySelector('.qc-odds')!.textContent).toBe('· COOL ●●● +EASY MARK ● · ON THE WIRE');
    expect(card(h, 'talk').querySelector('.qc-odds .qc-pos-wire')!.textContent).toBe('ON THE WIRE');
    expect(card(h, 'kick').querySelector('.qc-odds')!.textContent).toBe('· BODY ●● · ON THE WIRE');
    expect(card(h, 'talk').querySelector('.qc-bar')).toBeNull();
  });

  it('a card that fills TAKE ends its odds with its effect (effect and NERVE spec §3)', () => {
    const h = cards({ ...JOB, choices: [{ id: 'talk', line: 'Talk.', pool: { stat: 'COOL', base: 3, dice: 3, parts: [], position: 'open', noDeck: false, effect: 'big', effectParts: [] } }] });
    expect(card(h, 'talk').querySelector('.qc-odds')!.textContent).toBe('· COOL ●●● · IN THE OPEN · BIG');
    expect(card(h, 'talk').querySelector('.qc-odds .qc-eff-big')!.textContent).toBe('BIG');
  });

  it("the card's base dots are the stat's dice, whatever the pool was clamped or capped to (final review M2)", () => {
    const h = cards({ ...JOB, choices: [{ id: 'talk', line: 'Talk.', pool: { stat: 'COOL', base: 1, dice: 0, parts: [{ label: 'NO DECK', dice: -1 }, { label: 'HARD MARK', dice: -1 }], position: 'open', noDeck: true } }] });
    expect(card(h, 'talk').querySelector('.qc-odds')!.textContent).toBe('· COOL ● −NO DECK ○ −HARD MARK ○ · IN THE OPEN');
  });

  it('PUSH: a toggle with 2 NERVE to spare; on, a checked card that is not red is chosen with push', () => {
    const onChoose = vi.fn();
    const h = host();
    mountQuestCards(h, { onChoose, onTalk: vi.fn() }).show({ ...JOB, nerve: { left: 2, max: 5 } });
    const toggle = h.querySelector<HTMLElement>('.qc-push-toggle')!;
    expect(toggle.textContent).toBe('PUSH +1d (2 NERVE)');
    toggle.click();
    expect(h.querySelector('.qc-push-toggle')!.classList.contains('on')).toBe(true);
    card(h, 'talk').click();
    expect(onChoose).toHaveBeenLastCalledWith('talk', undefined, true);
    h.querySelector<HTMLElement>('.qc-push-toggle')!.click();
    card(h, 'kick').click();
    expect(onChoose).toHaveBeenLastCalledWith('kick', undefined);
    expect(cards(JOB).querySelector('.qc-push-toggle')).toBeNull();
  });

  it('a getaway: the head reads GET OUT', () => {
    const h = cards({ ...JOB, getaway: true });
    expect(h.querySelector('.qc-head .qc-getaway')!.textContent).toBe('GET OUT');
    expect(cards(JOB).querySelector('.qc-getaway')).toBeNull();
  });

  it('a red card says ONE SHOT; a crack card its letters and tries', () => {
    const h = cards(JOB);
    expect(card(h, 'kick').querySelector('.qc-red')!.textContent).toBe('ONE SHOT');
    expect(card(h, 'talk').querySelector('.qc-red')).toBeNull();
    expect(card(h, 'grab').querySelector('.qc-crack')!.textContent).toBe('CRACK · 6 LETTERS · 5 TRIES');
  });

  it('the story draws a passive line marker as its label', () => {
    const h = cards(JOB, '*The ledger.*\n\n⟦WITS⟧ *A second ledger under the first.*');
    const label = h.querySelector('.qc-story .qr-passive')!;
    expect(label.textContent).toBe('WITS ·');
    expect(h.querySelector('.qc-story')!.textContent).not.toContain('⟦');
  });
});

describe('the feed', () => {
  it('draws the passive marker as its label span', () => {
    const root = host();
    const feed = new Feed(root, vi.fn(), undefined, { stage: true, onControl: vi.fn() });
    const row: ChatMessage = { id: 'q1', role: 'user', mode: 'quest', text: '*The ledger.*\n\n⟦WITS⟧ *A second ledger under the first.*', toolLines: [], ts: 1, status: 'ok', quest: { id: 'back-door', title: 'Back Door', beat: 'desk' } };
    feed.setHistory([row]);
    feed.expand();
    const text = root.querySelector('article.quest-row .text')!;
    expect(text.querySelector('.qr-passive')!.textContent).toBe('WITS ·');
    expect(text.textContent).not.toContain('⟦');
    feed.dispose?.();
  });
});

const listState = (o: Partial<QuestState>): QuestState => ({ open: [], active: null, changed: null, waiting: null, elsewhere: [], ...o });

describe('the QUEST list', () => {
  it('a job row reads MISSION · TIER T · lo–hi SOL', () => {
    const h = host();
    mountQuestList(h, { onStart: vi.fn() }).show(listState({ open: [{ id: 'back-door', title: 'Back Door', pitch: null, timed: false, mission: { pay: 350, tier: 2, range: [350, 450] } }] }));
    expect(h.querySelector('.ql-mission')!.textContent).toBe('MISSION · TIER 2 · 350–450 SOL');
  });

  it('a scouted row shows its draws and pay; a cased row says CASED', () => {
    const h = host();
    mountQuestList(h, { onStart: vi.fn() }).show(
      listState({ open: [{ id: 'back-door', title: 'Back Door', pitch: null, timed: false, mission: { pay: 350, tier: 2, range: [350, 450], scouted: { draws: { complication: 'caper-watching', door: 'easy' }, pay: 380 }, cased: true } }] }),
    );
    expect(h.querySelector('.ql-scouted')!.textContent).toBe('PAY 380 · COMPLICATION: CAPER WATCHING · DOOR: EASY');
    expect(h.querySelector('.ql-cased')!.textContent).toBe('CASED');
  });

  const FIXER_ITEMS: NonNullable<QuestState['fixer']>['items'] = [
    { id: 'burner', name: 'Burner', kind: 'cover', price: 600, tier: 1, state: 'ok' },
    { id: 'stall-build', name: 'Stall build', kind: 'deck', price: 600, tier: 1, quality: 2, heat: 0, traits: ['fragile'], state: 'short' },
    { id: 'fall-guy', name: 'Fall guy', kind: 'cover', price: 1000, tier: 3, state: 'locked' },
    { id: 'pocket-deck', name: 'Pocket deck', kind: 'deck', price: 600, tier: 1, quality: 1, heat: 0, traits: ['hidden'], state: 'owned' },
  ];

  it("FIXER: a row per item with its numbers and price; the picked item's file has its picture; BUY only for ok; why for the rest", () => {
    const h = host();
    const onBuy = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onBuy });
    list.show(listState({ fixer: { place: 'under-the-cat', items: FIXER_ITEMS } }));
    expect(list.has()).toBe(true);
    // A list and a file, as the jobs are: no shelf of cards.
    expect(h.querySelector('.ql-shelf, button.ql-gear, .ql-gear-foot')).toBeNull();
    expect([...h.querySelectorAll('.ql-body.ql-fixer > .ql-list > .ql-group')].map((g) => g.textContent)).toEqual(['FOR SALE HERE']);
    const rows = () => [...h.querySelectorAll<HTMLButtonElement>('.ql-body.ql-fixer > .ql-list > button.ql-row.ql-item')];
    expect(rows().map((r) => r.dataset.item)).toEqual(['burner', 'stall-build', 'fall-guy', 'pocket-deck']);
    expect(rows().map((r) => ['ok', 'short', 'locked', 'owned'].filter((c) => r.classList.contains(c)))).toEqual([['ok'], ['short'], ['locked'], ['owned']]);
    expect(rows().map((r) => r.querySelector('.ql-item-name')!.textContent)).toEqual(['BURNER', 'STALL BUILD', 'FALL GUY', 'POCKET DECK']);
    // Why it can't be bought leads the stat line.
    expect(rows().map((r) => r.querySelector('.ql-item-stat')!.textContent)).toEqual(['COVER · USED UP', 'NOT ENOUGH SOL · Q2 · 2 SLOTS · HEAT 0 · FRAGILE', 'TIER 3 · COVER · USED UP', 'YOU HAVE ONE · Q1 · 1 SLOT · HEAT 0 · HIDDEN']);
    expect(rows().map((r) => r.querySelector('.ql-item-stat .ql-row-why')?.textContent ?? null)).toEqual([null, 'NOT ENOUGH SOL', 'TIER 3', 'YOU HAVE ONE']);
    expect(rows().map((r) => r.querySelector('.ql-item-price')!.textContent)).toEqual(['600 SOL', '600 SOL', '1000 SOL', '600 SOL']);
    // No picture on a row: the picked item's stands in its file.
    expect(h.querySelector('.ql-list img')).toBeNull();
    // Each item's file, picked by a click on its row.
    const files = FIXER_ITEMS.map((item) => {
      h.querySelector<HTMLButtonElement>(`.ql-row[data-item="${item.id}"]`)!.click();
      const file = h.querySelector<HTMLElement>('.ql-file')!;
      const why = file.querySelector('.ql-meta .ql-item-why');
      return {
        img: file.querySelector('div.ql-art.ql-gear > img')!.getAttribute('src'),
        title: file.querySelector('.ql-file-title')!.textContent,
        tag: file.querySelector('.ql-meta .ql-file-tag')!.textContent,
        why: why?.textContent ?? null,
        has: why?.classList.contains('has') ?? null,
        hint: file.querySelector(':scope > .ql-go .ql-hint')!.textContent,
        keys: [...file.querySelectorAll(':scope > .ql-go button')].map((b) => [b.className, b.textContent]),
      };
    });
    expect(files).toEqual([
      { img: '/gear/burner.webp', title: 'BURNER', tag: 'COVER · USED UP · 600 SOL', why: null, has: null, hint: 'YOURS TO KEEP', keys: [['ql-buy tp-key go', 'BUY · 600']] },
      { img: '/gear/stall-build.webp', title: 'STALL BUILD', tag: 'Q2 · 2 SLOTS · HEAT 0 · FRAGILE · 600 SOL', why: 'NOT ENOUGH SOL', has: false, hint: 'NOT ENOUGH SOL', keys: [] },
      { img: '/gear/fall-guy.webp', title: 'FALL GUY', tag: 'COVER · USED UP · 1000 SOL', why: 'TIER 3', has: false, hint: 'TIER 3', keys: [] },
      // Yours already: a white tag, not a grey one.
      { img: '/gear/pocket-deck.webp', title: 'POCKET DECK', tag: 'Q1 · 1 SLOT · HEAT 0 · HIDDEN · 600 SOL', why: 'YOU HAVE ONE', has: true, hint: 'YOU HAVE ONE', keys: [] },
    ]);
    rows()[0].click();
    h.querySelector<HTMLButtonElement>('.ql-go .ql-buy')!.click();
    expect(onBuy).toHaveBeenCalledExactlyOnceWith('burner');
  });

  it('FIXER: the first row is picked and its rule shows in the file; a click picks another', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(
      listState({
        fixer: {
          place: 'deck-market',
          items: [
            { id: 'burner', name: 'Burner', kind: 'cover', price: 550, tier: 1, state: 'ok' },
            { id: 'field-deck', name: 'Sentinel field deck', kind: 'deck', price: 3900, tier: 2, quality: 3, heat: 3, traits: ['breaker'], state: 'short' },
          ],
        },
      }),
    );
    const rule = () => h.querySelector('.ql-file .ql-in .ql-gear-rule')!.textContent;
    const pickedRows = () => [...h.querySelectorAll<HTMLElement>('.ql-row.ql-picked')].map((r) => [r.dataset.item, r.classList.contains('on'), r.getAttribute('aria-selected')]);
    expect(pickedRows()).toEqual([['burner', true, 'true']]);
    expect(h.querySelectorAll('.ql-row.on')).toHaveLength(1);
    expect(h.querySelector('.ql-gear-rule .ql-gear-rule-name')!.textContent).toBe('BURNER');
    expect(h.querySelector('.ql-gear-rule p.ql-brief')!.textContent).toBe("A blown job's rep loss is halved. Used up.");
    expect(rule()).toBe("BURNERA blown job's rep loss is halved. Used up.");
    h.querySelector<HTMLButtonElement>('button.ql-row[data-item="field-deck"]')!.click();
    expect(pickedRows()).toEqual([['field-deck', true, 'true']]);
    expect(h.querySelector('.ql-row[data-item="burner"]')!.getAttribute('aria-selected')).toBe('false');
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('SENTINEL FIELD DECK');
    expect(rule()).toBe("SENTINEL FIELD DECK2 program slots. Heat 3 at a job's end if you rolled a grid check. Breaker: the wire becomes open on a grid check.");
  });

  it('FIXER: a program shows its card art, PROGRAM · stat · kind, and its line as the rule', () => {
    const h = host();
    const onBuy = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onBuy });
    list.show(listState({ fixer: { place: 'deck-market', items: [{ id: 'leech', name: 'LEECH', kind: 'program', price: 200, tier: 1, stat: 'tech', programKind: 'effect', line: 'Drinks what the lacquer guards.', state: 'ok' }] } }));
    const row = h.querySelector<HTMLElement>('.ql-fixer .ql-row.ql-item')!;
    expect(row.querySelector('.ql-item-name')!.textContent).toBe('LEECH');
    expect(row.querySelector('.ql-item-stat')!.textContent).toBe('PROGRAM · TECH · EFFECT');
    expect(h.querySelector('.ql-file .ql-art.ql-gear > img')!.getAttribute('src')).toBe('/programs/leech.webp');
    expect(h.querySelector('.ql-file .ql-file-tag')!.textContent).toBe('PROGRAM · TECH · EFFECT · 200 SOL');
    expect(h.querySelector('.ql-gear-rule')!.textContent).toBe('LEECHDrinks what the lacquer guards. Yours for good: load it free at SETUP.');
    h.querySelector<HTMLButtonElement>('.ql-file .ql-go .ql-buy')!.click();
    expect(onBuy).toHaveBeenCalledWith('leech');
  });

  it('FIXER: a picture that fails to load leaves nothing standing there', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(listState({ fixer: { place: 'x', items: [{ id: 'new-deck', name: 'New deck', kind: 'deck', price: 1, tier: 1, quality: 1, heat: 0, traits: [], state: 'ok' }] } }));
    const pic = h.querySelector<HTMLElement>('.ql-file > .ql-art.ql-gear')!;
    expect(pic.classList.contains('ql-noart')).toBe(false);
    pic.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(pic.classList.contains('ql-noart')).toBe(true);
    // The file keeps its title and its key.
    expect(h.querySelector('.ql-file-title')!.textContent).toBe('NEW DECK');
    expect(h.querySelector('.ql-go .ql-buy')).not.toBeNull();
  });

  it('FIXER: ↑ / ↓ walk the items without wrapping, and Enter buys the picked one when it can be bought', () => {
    const h = host();
    const onBuy = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onBuy });
    list.show(listState({ fixer: { place: 'under-the-cat', items: FIXER_ITEMS } }));
    list.toggle();
    expect(h.querySelector<HTMLElement>('.ql-pane')!.dataset.tab).toBe('fixer');
    const at = () => [h.querySelector<HTMLElement>('.ql-row.on')!.dataset.item, h.querySelector('.ql-file-title')!.textContent];
    const press = (key: string) => {
      const e = new KeyboardEvent('keydown', { key, cancelable: true });
      window.dispatchEvent(e);
      return e;
    };
    expect(at()).toEqual(['burner', 'BURNER']);
    // The arrows never reach the room, even at the list's end.
    expect(press('ArrowUp').defaultPrevented).toBe(true);
    expect(at()).toEqual(['burner', 'BURNER']);
    press('ArrowDown');
    expect(at()).toEqual(['stall-build', 'STALL BUILD']);
    // Not enough sol: no filled key, so Enter does nothing.
    expect(press('Enter').defaultPrevented).toBe(false);
    expect(onBuy).not.toHaveBeenCalled();
    press('ArrowDown');
    press('ArrowDown');
    expect(at()).toEqual(['pocket-deck', 'POCKET DECK']);
    press('ArrowDown');
    expect(at()).toEqual(['pocket-deck', 'POCKET DECK']);
    for (let i = 0; i < 3; i++) press('ArrowUp');
    expect(at()).toEqual(['burner', 'BURNER']);
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(onBuy).toHaveBeenCalledExactlyOnceWith('burner');
    // A held Enter buys once: the repeats are taken (the room never hears them) but do nothing.
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true });
    window.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    expect(onBuy).toHaveBeenCalledTimes(1);
    // BUY keeps the panel up.
    expect(list.isOpen).toBe(true);
    list.close(true);
  });
});
