import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestCards } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import { Feed } from '../src/ui/feed';
import type { ChatMessage, QuestState } from '../../shared/types';

afterEach(() => {
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
  edge: 1,
  heat: 4,
  pay: [350, 450],
  choices: [
    { id: 'talk', line: 'Talk your way in.', odds: { stat: 'COOL', chance: 54, noDeck: false, why: ['EASY MARK +10', 'ALARM 2 −20'] } },
    { id: 'kick', line: 'Kick the door.', odds: { stat: 'BODY', chance: 30, noDeck: false, why: [] }, red: true },
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
  it('the strip shows ALARM as lit segments, EDGE, HEAT and the pay range', () => {
    const h = cards(JOB);
    const alarm = h.querySelector('.qc-alarm')!;
    expect(alarm.querySelectorAll('i')).toHaveLength(3);
    expect(alarm.querySelectorAll('i.on')).toHaveLength(2);
    expect(h.querySelector('.qc-edge')!.textContent).toBe('EDGE 1');
    expect(h.querySelector('.qc-heat')!.textContent).toBe('HEAT 4');
    expect(h.querySelector('.qc-pay')!.textContent).toBe('PAY 350–450 SOL');
  });

  it('a quest has no strip', () => {
    const h = cards({ id: 'q', title: 'Q', beat: 'b', choices: [{ id: 'a', line: 'A.' }] });
    expect(h.querySelector('.qc-strip')).toBeNull();
  });

  it('a checked card has an odds bar and its why line', () => {
    const h = cards(JOB);
    expect(card(h, 'talk').querySelector<HTMLElement>('.qc-bar')!.style.getPropertyValue('--odds')).toBe('54%');
    expect(card(h, 'talk').querySelector('.qc-why')!.textContent).toBe('EASY MARK +10 · ALARM 2 −20');
    expect(card(h, 'kick').querySelector('.qc-why')).toBeNull();
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

  it('the FIXER list: BUY only for ok; locked shows its tier; short says so; BUY calls onBuy', () => {
    const h = host();
    const onBuy = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onBuy });
    list.show(
      listState({
        fixer: {
          place: 'under-the-cat',
          items: [
            { id: 'burner', name: 'Burner', price: 600, tier: 1, state: 'ok' },
            { id: 'pocket-deck', name: 'Pocket deck', price: 600, tier: 1, state: 'short' },
            { id: 'fall-guy', name: 'Fall guy', price: 1000, tier: 3, state: 'locked' },
          ],
        },
      }),
    );
    expect(list.has()).toBe(true);
    const rows = [...h.querySelectorAll<HTMLElement>('.ql-fixer .ql-item')];
    expect(rows.map((r) => r.querySelector('.ql-item-name')!.textContent)).toEqual(['Burner · 600 SOL', 'Pocket deck · 600 SOL', 'Fall guy · 1000 SOL']);
    const buy = (r: HTMLElement) => r.querySelector<HTMLButtonElement>('.ql-buy')!;
    expect(rows.map((r) => buy(r).disabled)).toEqual([false, true, true]);
    expect(rows[1].querySelector('.ql-item-why')!.textContent).toBe('NOT ENOUGH SOL');
    expect(rows[2].querySelector('.ql-item-why')!.textContent).toBe('TIER 3');
    buy(rows[0]).click();
    expect(onBuy).toHaveBeenCalledWith('burner');
  });
});
