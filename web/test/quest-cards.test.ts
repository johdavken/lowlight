import { withImageTokens } from '../src/room/narration-image';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mountQuestCards, backToWait } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import { TRACE_OUT_MS } from '../src/ui/screen';
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
afterEach(() => {
  // A panel a test left open still listens on the window: Esc closes any, so no test's keys reach another's.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
});

describe('quest cards', () => {
  it('one card per shown choice, with its line', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show(ACTIVE);
    expect([...h.querySelectorAll('.qc-card .qc-line')].map((n) => n.textContent)).toEqual(['Hand it over.', 'Stall him till morning.']);
    expect(h.querySelector('.qc-title')!.textContent).toBe('Paper Trail');
  });

  it('an active job with push shows PRESS ON? in the head, POT +150 SOL when pot > 0, and the two cards in order WALK then PRESS ON', () => {
    const h = host();
    const job = {
      ...ACTIVE,
      beat: '!push',
      alarm: 1,
      edge: 2,
      heat: 1,
      pay: [350, 450] as [number, number],
      choices: [
        { id: '!walk', line: 'WALK — 550 SOL · HEAT +0' },
        { id: '!press', line: 'PRESS ON' },
      ],
    };
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.show({ ...job, push: { stage: 1, pot: 150, walk: { sol: 550, heat: 0 } } });
    expect(h.querySelector('.qc-head .qc-push')!.textContent).toBe('PRESS ON?');
    expect(h.querySelector('.qc-strip .qc-pot')!.textContent).toBe('POT +150 SOL');
    expect([...h.querySelectorAll('.qc-card')].map((n) => (n as HTMLElement).dataset.choice)).toEqual(['!walk', '!press']);
    cards.show({ ...job, push: { stage: 0, pot: 0, walk: { sol: 400, heat: 0 } } });
    expect(h.querySelector('.qc-head .qc-push')!.textContent).toBe('PRESS ON?');
    expect(h.querySelector('.qc-pot')).toBeNull();
    cards.show(ACTIVE);
    expect(h.querySelector('.qc-push')).toBeNull();
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
  it('never prints a narration image token (spec 2026-11-18): the panel shows the prose alone', () => {
    const h = host();
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show(ACTIVE, withImageTokens('*Boots on the stairs.*', [{ para: 0, name: 'mirek', url: '/api/extras/local-01' }]));
    expect(h.querySelector('.qc-story')!.textContent).toBe('Boots on the stairs.');
  });

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
  // A pick back to the wait left nothing on screen: the table closed, and beats stay out of the box (playtest).
  it('an outcome before a wait stays up until closed, and says nothing has ended', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.outcome('The Recut', '*You keep it.*');
    expect(h.hidden).toBe(false);
    expect(h.querySelector('.qc-story')!.textContent).toBe('You keep it.');
    expect(h.querySelector('.qc-end')).toBeNull();
    click(h.querySelector('.qc-close'));
    expect(h.hidden).toBe(true);
  });
  it('the next ending says THE END again', () => {
    const h = host();
    const cards = mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() });
    cards.outcome('The Recut', '*You keep it.*');
    cards.end('The Recut', "*It's over.*");
    expect(h.querySelector('.qc-end')!.textContent).toBe('THE END');
  });
});

describe('the QUEST list', () => {
  it('lists the open quests; START starts one', () => {
    const h = host();
    const onStart = vi.fn();
    const list = mountQuestList(h, { onStart });
    list.show({ open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] });
    list.toggle();
    expect(list.isOpen).toBe(true);
    expect(h.querySelector('.quest-screen .ql-row .ql-title')!.textContent).toBe('Paper Trail');
    click(h.querySelector('.ql-file .ql-start'));
    expect(onStart).toHaveBeenCalledWith('paper-trail');
    expect(list.isOpen).toBe(false);
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
  it('a ride-along row gives the story up to its held beat, without the pick line (2026-11-08)', () => {
    const text = 'You wait.\n\nYou are in.\n\nThe ledger.';
    const story = latestQuestStory([row('r', text, { id: 'p', title: 'Back Door', beat: 'desk', pick: { choice: 'wait', line: 'You wait.' }, held: { at: text.indexOf('The ledger.'), clips: 0 } })])!;
    expect(story.before).toBe('You are in.');
    expect(story.text).toBe('You are in.\n\nThe ledger.');
  });
  it('holds nothing back when only the pick line comes before the beat', () => {
    const text = 'You wait.\n\nThe ledger.';
    expect(latestQuestStory([row('r', text, { id: 'p', title: 'Back Door', beat: 'desk', pick: { choice: 'wait', line: 'You wait.' }, held: { at: text.indexOf('The ledger.'), clips: 0 } })])!.before).toBeUndefined();
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
    expect(h.querySelector('.ql-waiting .ql-title')!.textContent).toBe('Paper Trail');
    expect(h.querySelector('.ql-file .ql-line')!.textContent).toBe('Be at the Intake.');
  });
  it('quests in someone else\'s room, with no START', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show({ ...none, elsewhere: [{ id: 'paper-trail', title: 'Paper Trail', contact: 'nix-direct', contactName: 'Nix', next: 'Be at the Intake.' }] });
    expect(list.has()).toBe(true);
    list.toggle();
    expect(h.querySelector('.ql-elsewhere .ql-title')!.textContent).toBe('Paper Trail');
    expect(h.querySelector('.ql-file .ql-line')!.textContent).toBe('With Nix · Be at the Intake.');
    expect(h.querySelector('.ql-start')).toBeNull();
  });
});

describe('the QUEST list closes like the other panels', () => {
  const state = { open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] };
  const opened = () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn() });
    list.show(state);
    list.toggle();
    expect(list.isOpen).toBe(true);
    expect(h.querySelector('.scr-root.quest-screen')).not.toBeNull();
    return { h, list };
  };
  const pane = (h: HTMLElement) => h.querySelector<HTMLElement>('.ql-pane')!;
  /** Parked: the panel's parts wait in the hidden holder, off any screen. */
  const parked = (h: HTMLElement) => ['.ql-tabs', '.ql-notes', '.ql-nums', '.ql-pane'].every((sel) => h.querySelector<HTMLElement>(`:scope > .ql-host > ${sel}`) !== null) && h.querySelector<HTMLElement>(':scope > .ql-host')!.hidden;
  it("a click outside (the screen's backdrop) closes it; a click inside keeps it", () => {
    const { h, list } = opened();
    click(h.querySelector('.ql-title'));
    click(pane(h));
    click(h.querySelector('.quest-screen .scr-screen'));
    click(h.querySelector('.quest-screen .tp-title'));
    expect(list.isOpen).toBe(true);
    // No click-away on the document: only the backdrop itself.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    click(document.body);
    click(h);
    expect(list.isOpen).toBe(true);
    click(h.querySelector('.scr-root.quest-screen'));
    expect(list.isOpen).toBe(false);
  });
  it('closed, it steps off with its parts still on the screen and parks them after TRACE_OUT_MS; opened again meanwhile, it stays up', () => {
    vi.useFakeTimers();
    try {
      const { h, list } = opened();
      expect(parked(h)).toBe(false);
      list.close();
      expect(list.isOpen).toBe(false);
      expect(h.querySelector('.quest-screen')!.classList.contains('scr-closing')).toBe(true);
      expect(pane(h).closest('.quest-screen')).not.toBeNull();
      expect(pane(h).closest('.ql-host')).toBeNull();
      vi.advanceTimersByTime(TRACE_OUT_MS - 1);
      expect(pane(h).closest('.quest-screen')).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(h.querySelector('.quest-screen')).toBeNull();
      expect(parked(h)).toBe(true);
      list.toggle();
      list.close();
      list.toggle();
      vi.advanceTimersByTime(TRACE_OUT_MS);
      expect(list.isOpen).toBe(true);
      // The one that closed is gone; the parts are on the new one, not parked.
      const screens = [...h.querySelectorAll('.quest-screen')];
      expect(screens).toHaveLength(1);
      expect(screens[0].classList.contains('scr-closing')).toBe(false);
      expect(pane(h).closest('.quest-screen')).toBe(screens[0]);
      expect(h.querySelector('.quest-screen .tp-tabs .ql-tabs')).not.toBeNull();
      expect(parked(h)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("the head line's numbers: the jobs here on the HERE tab, heat where you stand at the right", () => {
    const { h, list } = opened();
    const nums = h.querySelector<HTMLElement>('.quest-screen .tp-nums .ql-nums')!;
    expect(h.querySelector('.ql-tab[data-tab="here"] .tp-n')!.textContent).toBe('1');
    expect(h.querySelector('.ql-tab[data-tab="here"]')!.textContent).toBe('HERE 1');
    expect(nums.textContent).toBe('');
    // HEAT 3 on the line; where, and out of how many, on its hover title.
    list.setHeat('old-town', 3);
    expect(nums.textContent).toBe('HEAT 3');
    expect(nums.querySelector<HTMLElement>('.ql-hot')!.title).toBe('OLD TOWN HEAT 3 / 10');
    list.setHeat('old-town', 0);
    expect(nums.textContent).toBe('HEAT 0');
    expect(nums.querySelector<HTMLElement>('.ql-cool')!.title).toBe('OLD TOWN HEAT 0 / 10');
    expect(nums.querySelector('.ql-hot')).toBeNull();
    list.setHeat(null, 0);
    expect(nums.textContent).toBe('');
  });
  it("setPurse: sol and tonight's NERVE lead the numbers, before the heat, and outlive a redraw", () => {
    const { h, list } = opened();
    const nums = h.querySelector<HTMLElement>('.ql-nums')!;
    list.setPurse(1240, 3, 4);
    expect(nums.textContent).toBe('SOL 1,240 · NERVE 3 / 4');
    expect([...nums.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['1,240', '3 / 4']);
    list.setHeat('old-town', 3);
    expect(nums.textContent).toBe('SOL 1,240 · NERVE 3 / 4 · HEAT 3');
    expect(nums.querySelector<HTMLElement>('.ql-hot')!.title).toBe('OLD TOWN HEAT 3 / 10');
    list.show(state);
    expect(nums.textContent).toBe('SOL 1,240 · NERVE 3 / 4 · HEAT 3');
    list.setHeat(null, 0);
    expect(nums.textContent).toBe('SOL 1,240 · NERVE 3 / 4');
    list.setPurse(0, 0, 4);
    expect(nums.textContent).toBe('SOL 0 · NERVE 0 / 4');
    // NERVE gone takes the numbers' place, and gives it back.
    list.show({ ...state, nerveGone: { back: '06:00' } });
    expect(nums.textContent).toBe('NERVE GONE · NO NEW JOB UNTIL 06:00');
    list.show(state);
    expect(nums.textContent).toBe('SOL 0 · NERVE 0 / 4');
  });
  it('close(true), a switch to another screen: gone and parked at once, no step-off', () => {
    const { h, list } = opened();
    list.close(true);
    expect(list.isOpen).toBe(false);
    expect(h.querySelector('.quest-screen')).toBeNull();
    expect(parked(h)).toBe(true);
  });
  it('reduced motion: a plain close is gone and parked at once too', () => {
    const h = host();
    const list = mountQuestList(h, { onStart: vi.fn(), reduced: () => true });
    list.show(state);
    list.toggle();
    expect(h.querySelector('.quest-screen')!.classList.contains('scr-still')).toBe(true);
    list.close();
    expect(list.isOpen).toBe(false);
    expect(h.querySelector('.quest-screen')).toBeNull();
    expect(parked(h)).toBe(true);
  });
  it('Esc closes it', () => {
    const { h, list } = opened();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(esc);
    window.removeEventListener('keydown', later);
    expect(list.isOpen).toBe(false);
    // Still stepping off, its parts on it.
    expect(h.querySelector('.quest-screen.scr-closing .ql-pane')).not.toBeNull();
    // It stops there: not back to the dial-in.
    expect(esc.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
  });
  it('once closed, its keys and a click on the screen stepping off do nothing (no stale listener)', () => {
    const { h, list } = opened();
    list.close();
    click(h.querySelector('.scr-root.quest-screen'));
    // Esc is free again for whatever comes next (START goes on to the table).
    const later = vi.fn();
    window.addEventListener('keydown', later);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(esc);
    window.removeEventListener('keydown', later);
    expect(esc.defaultPrevented).toBe(false);
    expect(later).toHaveBeenCalledTimes(1);
    list.toggle();
    expect(list.isOpen).toBe(true);
    expect(h.querySelectorAll('.quest-screen:not(.scr-closing)')).toHaveLength(1);
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

import { createJobNoticeHold } from '../src/room/quest-list';
describe('createJobNoticeHold (the notice waits for her greeting on a new game, 2026-11-11)', () => {
  it('holds what turns up, then shows it all once, marked held', () => {
    const show = vi.fn();
    const hold = createJobNoticeHold<string>(show, true);
    hold.add(['a']);
    hold.add([]);
    hold.add(['b']);
    expect(show).not.toHaveBeenCalled();
    hold.release();
    expect(show).toHaveBeenCalledExactlyOnceWith(['a', 'b'], true);
    hold.release();
    hold.add(['c']);
    expect(show).toHaveBeenLastCalledWith(['c'], false);
  });
  it('a release with nothing held shows nothing; not holding shows at once', () => {
    const show = vi.fn();
    createJobNoticeHold<string>(show, true).release();
    expect(show).not.toHaveBeenCalled();
    createJobNoticeHold<string>(show, false).add(['a']);
    expect(show).toHaveBeenCalledExactlyOnceWith(['a'], false);
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

describe('backToWait', () => {
  const beat = { active: { id: 'j' } };
  const none = { active: null, waiting: null };
  const row = { id: 'r', title: 'J', text: 'x', ended: false };
  it('a pick that left the beat for a wait', () => expect(backToWait(beat, none, row, null)).toBe(true));
  it('not when a beat follows', () => expect(backToWait(beat, { active: { id: 'j' }, waiting: null }, row, null)).toBe(false));
  it('not when the waiting panel will show it', () => expect(backToWait(beat, { active: null, waiting: {} }, row, null)).toBe(false));
  it('not an ending: that has its own panel', () => expect(backToWait(beat, none, { ...row, ended: true }, null)).toBe(false));
  it('not twice', () => expect(backToWait(beat, none, row, 'r')).toBe(false));
  it('not with no beat before it', () => expect(backToWait({ active: null }, none, row, null)).toBe(false));
});
