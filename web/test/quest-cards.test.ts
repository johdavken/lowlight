import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mountQuestCards } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import type { QuestState } from '../../shared/types';

const ACTIVE: NonNullable<QuestState['active']> = {
  id: 'paper-trail',
  title: 'Paper Trail',
  beat: 'sentinel',
  choices: [
    { id: 'hand', line: 'Hand it over.' },
    { id: 'stall', line: 'Stall him till morning.' },
  ],
};
const host = () => {
  document.body.innerHTML = '';
  const h = document.createElement('div');
  document.body.append(h);
  return h;
};
const click = (el: Element | null) => (el as HTMLElement).click();

describe('quest cards', () => {
  it('one card per shown choice, with its line', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show(ACTIVE);
    expect([...h.querySelectorAll('.qc-card .qc-line')].map((n) => n.textContent)).toEqual(['Hand it over.', 'Stall him till morning.']);
    expect(h.querySelector('.qc-title')!.textContent).toBe('Paper Trail');
  });

  it('a card click chooses it, with no typed line', () => {
    const h = host();
    const onChoose = vi.fn();
    mountQuestCards(h, { onChoose, onTalk: vi.fn() }).show(ACTIVE);
    click(h.querySelector('.qc-card[data-choice="hand"]'));
    expect(onChoose).toHaveBeenCalledWith('hand', undefined);
  });

  it('a held line lights its card and asks: THAT\'S MY CHOICE or JUST TALKING', () => {
    const h = host();
    const onChoose = vi.fn();
    const onTalk = vi.fn();
    const cards = mountQuestCards(h, { onChoose, onTalk });
    cards.show(ACTIVE);
    cards.pick('stall', 'Come back in the morning.');
    expect([...h.querySelectorAll('.qc-lit')].map((n) => (n as HTMLElement).dataset.choice)).toEqual(['stall']);
    expect(h.querySelector('.qc-said')!.textContent).toContain('Come back in the morning.');
    click(h.querySelector('.qc-confirm'));
    expect(onChoose).toHaveBeenCalledWith('stall', 'Come back in the morning.');
    cards.pick('stall', 'Come back in the morning.');
    click(h.querySelector('.qc-talk'));
    expect(onTalk).toHaveBeenCalledWith('Come back in the morning.');
  });

  it('Enter on JUST TALKING sends it as talk, not the choice (final review I1)', () => {
    const h = host();
    const onChoose = vi.fn();
    const onTalk = vi.fn();
    const cards = mountQuestCards(h, { onChoose, onTalk });
    cards.show(ACTIVE);
    cards.pick('stall', 'Come back in the morning.');
    const talk = h.querySelector<HTMLButtonElement>('.qc-talk')!;
    talk.focus();
    talk.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('another card while one is lit chooses that one, with its own line', () => {
    const h = host();
    const onChoose = vi.fn();
    const cards = mountQuestCards(h, { onChoose, onTalk: vi.fn() });
    cards.show(ACTIVE);
    cards.pick('stall', 'Come back in the morning.');
    click(h.querySelector('.qc-card[data-choice="hand"]'));
    expect(onChoose).toHaveBeenCalledWith('hand', undefined);
  });

  it('clearPick puts the cards back; show(null) empties the host', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.show(ACTIVE);
    cards.pick('stall', 'x');
    cards.clearPick();
    expect(h.querySelector('.qc-lit')).toBeNull();
    cards.show(null);
    expect(h.children).toHaveLength(0);
    expect(h.hidden).toBe(true);
  });
});

describe('the story in the cards panel', () => {
  it('shows the written text above the cards, and folds on the title', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show(ACTIVE, '*Boots on the stairs.* "Evening."');
    expect(h.querySelector('.qc-story')!.textContent).toBe('Boots on the stairs. "Evening."');
    expect(h.querySelector('.qc-story em')!.textContent).toBe('Boots on the stairs.');
    click(h.querySelector('.qc-head'));
    expect(h.classList.contains('qc-folded')).toBe(true);
    click(h.querySelector('.qc-head'));
    expect(h.classList.contains('qc-folded')).toBe(false);
  });

  it('keeps the ending up, with no cards, until closed', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.end('Paper Trail', "*It's over.*");
    expect(h.hidden).toBe(false);
    expect(h.querySelector('.qc-card')).toBeNull();
    expect(h.querySelector('.qc-story')!.textContent).toBe("It's over.");
    expect(h.querySelector('.qc-end')!.textContent).toBe('THE END');
    click(h.querySelector('.qc-close'));
    expect(h.hidden).toBe(true);
  });
});

describe('the QUEST list', () => {
  it('lists the open quests; START starts one', () => {
    const h = host();
    const onStart = vi.fn();
    const list = mountQuestList(h, { onStart });
    list.show({ open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] });
    list.toggle();
    expect(h.hidden).toBe(false);
    expect(h.querySelector('.ql-row .ql-title')!.textContent).toBe('Paper Trail');
    click(h.querySelector('.ql-row .ql-start'));
    expect(onStart).toHaveBeenCalledWith('paper-trail');
    expect(h.hidden).toBe(true);
  });

  it('shows why a run here cannot go on', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ open: [], active: null, changed: 'Paper Trail has changed since you started it', waiting: null, elsewhere: [] });
    list.toggle();
    expect(h.querySelector('.ql-changed')!.textContent).toBe('Paper Trail has changed since you started it');
  });

  it('says what it has to offer', () => {
    const list = mountQuestList(host(), { onStart: vi.fn() });
    expect(list.has()).toBe(false);
    list.show({ open: [{ id: 'a', title: 'A', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] });
    expect(list.has()).toBe(true);
  });
});

import { latestQuestStory } from '../src/room/quest-cards';
import type { ChatMessage } from '../../shared/types';

describe('latestQuestStory', () => {
  const row = (id: string, text: string, quest: ChatMessage['quest'], role: ChatMessage['role'] = 'user'): ChatMessage => ({ id, role, text, toolLines: [], ts: 1, status: 'ok', mode: 'quest', quest });
  it('is the newest quest row of yours, without its pick line', () => {
    const rows = [
      row('a', 'Beat one.', { id: 'p', title: 'Paper Trail', beat: 'sentinel' }),
      row('b', 'You stall him.\n\nHe goes.\n\nBeat two.', { id: 'p', title: 'Paper Trail', beat: 'return', pick: { choice: 'stall', line: 'You stall him.' } }),
      row('c', 'Hm.', undefined, 'agent'),
    ];
    expect(latestQuestStory(rows)).toEqual({ id: 'b', title: 'Paper Trail', text: 'He goes.\n\nBeat two.', ended: false });
  });
  it('knows an ending, and nothing without a quest row', () => {
    expect(latestQuestStory([row('e', 'You run.\n\nGone.', { id: 'p', title: 'Paper Trail', beat: null, pick: { choice: 'run', line: 'You run.' } })])!.ended).toBe(true);
    expect(latestQuestStory([])).toBeNull();
  });
});

describe('the waiting panel (quest waits spec §4)', () => {
  const D = 1440;
  const at = (day: number, hhmm: number) => (day - 1) * D + hhmm;
  const W = { id: 'paper-trail', title: 'Paper Trail', next: 'The Sentinel said morning. Be at the Intake.', at: 'Lowlight Intake', from: at(2, 360), by: at(2, 720), ready: false, here: true };
  const mount = () => {
    const h = host();
    const onContinue = vi.fn();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), onContinue });
    return { h, cards, onContinue };
  };
  it('shows the next line, where, from and by, with the time left', () => {
    const { h, cards } = mount();
    cards.waiting(W, at(2, 60));
    expect(h.hidden).toBe(false);
    expect(h.querySelector('.qc-card')).toBeNull();
    expect(h.querySelector('.qc-next')!.textContent).toBe('The Sentinel said morning. Be at the Intake.');
    expect(h.querySelector('.qc-when')!.textContent).toBe('from 06:00 · Lowlight Intake · by 12:00 · in 11h');
  });
  it('drops from once past, and follows the clock', () => {
    const { h, cards } = mount();
    cards.waiting(W, at(2, 360 + 80));
    expect(h.querySelector('.qc-when')!.textContent).toBe('Lowlight Intake · by 12:00 · in 4h 40m');
    cards.clock(at(2, 700));
    expect(h.querySelector('.qc-when')!.textContent).toBe('Lowlight Intake · by 12:00 · in 20m');
  });
  it('CONTINUE only when it waits for the player', () => {
    const { h, cards, onContinue } = mount();
    cards.waiting(W, at(2, 60));
    expect(h.querySelector('.qc-continue')).toBeNull();
    cards.waiting({ ...W, ready: true, at: null, from: null, by: null }, at(2, 60));
    click(h.querySelector('.qc-continue'));
    expect(onContinue).toHaveBeenCalledWith('paper-trail');
  });
  it('folds like the cards', () => {
    const { h, cards } = mount();
    cards.waiting(W, at(2, 60));
    click(h.querySelector('.qc-head'));
    expect(h.classList.contains('qc-folded')).toBe(true);
  });
  it("a row that parked the quest isn't an ending", () => {
    const row = { id: 'p', role: 'user' as const, text: 'You hand it over.\n\n*He thanks you.*', toolLines: [], ts: 1, status: 'ok' as const, mode: 'quest' as const, quest: { id: 'p', title: 'Paper Trail', beat: null, waiting: true as const, pick: { choice: 'hand', line: 'You hand it over.' } } };
    expect(latestQuestStory([row])!.ended).toBe(false);
  });
});

describe('QUEST lists what waits, here and elsewhere', () => {
  const none = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };
  it('a quest waiting here, with its next line', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ ...none, waiting: { id: 'paper-trail', title: 'Paper Trail', next: 'Be at the Intake.', at: null, from: null, by: null, ready: false, here: true } });
    expect(list.has()).toBe(true);
    list.toggle();
    expect(h.querySelector('.ql-waiting')!.textContent).toBe('Paper Trail · Be at the Intake.');
  });
  it('quests in someone else\'s room, with no START', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ ...none, elsewhere: [{ id: 'paper-trail', title: 'Paper Trail', contact: 'nix-direct', contactName: 'Nix', next: 'Be at the Intake.' }] });
    expect(list.has()).toBe(true);
    list.toggle();
    expect(h.querySelector('.ql-elsewhere')!.textContent).toBe('Paper Trail · with Nix · Be at the Intake.');
    expect(h.querySelector('.ql-elsewhere .ql-start')).toBeNull();
  });
});

describe('the QUEST list closes like the other panels', () => {
  const state = { open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] };
  const opened = () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state);
    list.toggle();
    expect(h.hidden).toBe(false);
    return { h, list };
  };
  it('a click outside closes it; a click inside keeps it', () => {
    const { h } = opened();
    h.querySelector('.ql-title')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(h.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(h.hidden).toBe(true);
  });
  it('Esc closes it', () => {
    const { h } = opened();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(esc);
    window.removeEventListener('keydown', later);
    expect(h.hidden).toBe(true);
    // It stops there: not back to the dial-in.
    expect(esc.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
  });
  it('once closed, clicks elsewhere do nothing (no stale listener)', () => {
    const { h, list } = opened();
    list.close();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    list.toggle();
    expect(h.hidden).toBe(false);
  });
});

describe('the room hears when the panel is up (figures step aside)', () => {
  it('reports shown and hidden, including the ending closed by its ✕', () => {
    const h = host();
    const shown: boolean[] = [];
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), onShown: (on) => shown.push(on) });
    cards.show(ACTIVE);
    cards.show(null);
    cards.end('Paper Trail', 'Over.');
    click(h.querySelector('.qc-close'));
    expect(shown).toEqual([true, false, true, false]);
  });
  it("the beat's text box scrolls with the panel's thin cyan bar, like the room's other panels", () => {
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    expect(css).toMatch(/\.qc-story[^{]*\{[^}]*scrollbar-width: thin;[^}]*scrollbar-color: rgba\(127, 233, 255, 0\.45\) transparent;/);
  });
  it('quest text and responses read the chat font', () => {
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    for (const sel of ['.qc-story', '.qc-line', '.qc-said', '.qc-next']) expect(css).toMatch(new RegExp(`\\${sel}[^{]*\\{[^}]*font-family: var\\(--chat-font, var\\(--mono\\)\\)`));
  });
});

describe('new-player quick wins', () => {
  it('a lit card asks plainly whether the line was the choice', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.show(ACTIVE);
    cards.pick('stall', 'Come back in the morning.');
    expect(h.querySelector('.qc-ask')!.textContent).toBe('That sounds like this one. Is it your choice?');
    expect(h.querySelector('.qc-confirm')!.textContent).toBe("THAT'S MY CHOICE");
    expect(h.querySelector('.qc-talk')!.textContent).toBe('JUST TALKING');
  });

  it('shows the hint under the cards while hint() gives one', () => {
    const h = host();
    let hint: string | null = 'Talk it over with Nix, or pick when you\'re ready.';
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), hint: () => hint });
    cards.show(ACTIVE);
    expect(h.querySelector('.qc-hint')!.textContent).toBe("Talk it over with Nix, or pick when you're ready.");
    hint = null;
    cards.show(ACTIVE);
    expect(h.querySelector('.qc-hint')).toBeNull();
  });

  const D = 1440;
  const at = (day: number, hhmm: number) => (day - 1) * D + hhmm;
  const W = { id: 'paper-trail', title: 'Paper Trail', next: 'Be at the Intake.', at: 'Lowlight Intake', from: at(2, 360), by: at(2, 720), ready: false, here: true };
  it('WAIT UNTIL the hour it waits for, when you are there and it is ahead', () => {
    const h = host();
    const onWait = vi.fn();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), onWait });
    cards.waiting(W, at(1, 21 * 60));
    expect(h.querySelector('.qc-wait')!.textContent).toBe('WAIT UNTIL 06:00');
    click(h.querySelector('.qc-wait'));
    expect(onWait).toHaveBeenCalledWith(9 * 60);
  });
  it('no WAIT UNTIL elsewhere, once the hour is past, or more than a day off', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), onWait: vi.fn() });
    cards.waiting({ ...W, here: false }, at(1, 21 * 60));
    expect(h.querySelector('.qc-wait')).toBeNull();
    cards.waiting(W, at(2, 400));
    expect(h.querySelector('.qc-wait')).toBeNull();
    cards.waiting(W, at(1, 0));
    expect(h.querySelector('.qc-wait')).toBeNull();
  });
  it('the clock moving past the hour takes WAIT UNTIL away', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn(), onWait: vi.fn() });
    cards.waiting(W, at(1, 21 * 60));
    cards.clock(at(2, 361));
    expect(h.querySelector('.qc-wait')).toBeNull();
  });

  it('the QUEST list shows a pitch, and says when a quest has a deadline', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: 'A Sentinel wants one page.', timed: true }], active: null, changed: null, waiting: null, elsewhere: [] });
    list.toggle();
    expect(h.querySelector('.ql-pitch')!.textContent).toBe('A Sentinel wants one page.');
    expect(h.querySelector('.ql-timed')!.textContent).toBe('HAS A DEADLINE');
  });
});

import { newlyOpen } from '../src/room/quest-list';
describe('newlyOpen (the notice when a quest can start)', () => {
  const S = (ids: string[]): QuestState => ({ open: ids.map((id) => ({ id, title: id.toUpperCase(), pitch: null, timed: false })), active: null, changed: null, waiting: null, elsewhere: [] });
  it('gives the quests not seen before, and remembers them', () => {
    const seen = new Set<string>();
    expect(newlyOpen(seen, S(['a'])).map((q) => q.id)).toEqual(['a']);
    expect(newlyOpen(seen, S(['a']))).toEqual([]);
    expect(newlyOpen(seen, S(['a', 'b'])).map((q) => q.id)).toEqual(['b']);
  });
});

describe("the stranger's face is no longer in the panel (speaker portrait, 2026-10-17)", () => {
  it('the panel shows only the story and offers no face', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.show(ACTIVE, '*Boots on the stairs.*');
    expect(h.querySelector('.qc-who, .qc-scene')).toBeNull();
    expect('stranger' in cards).toBe(false);
  });
});
