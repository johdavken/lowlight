import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BoardCue, mountQuestList } from '../src/room/quest-list';
import { EMPTY_QUEST_STATE, type QuestState } from '../../shared/types';

afterEach(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.replaceChildren();
});

const key = (k: string, o: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));

/** A board with one job to take and one that's locked, open, and what it sounded. */
function board(): { cues: BoardCue[]; onStart: ReturnType<typeof vi.fn> } {
  const h = document.createElement('div');
  document.body.append(h);
  const cues: BoardCue[] = [];
  const onStart = vi.fn();
  const list = mountQuestList(h, { onStart, onCue: (c) => cues.push(c), reduced: () => true });
  const open: QuestState['open'] = [
    { id: 'night', title: 'Night Shift', pitch: null, timed: false, mission: { pay: 400, tier: 1 } },
    { id: 'chair', title: 'The Chair', pitch: null, timed: false, locked: 'NEEDS TRUST', mission: { pay: 900, tier: 2 } },
  ];
  list.show({ ...EMPTY_QUEST_STATE, open });
  list.toggle();
  return { cues, onStart };
}

describe('the board sounds its moments', () => {
  it('a row tick per step that moves, none past the end; a locked key refuses once', () => {
    const { cues, onStart } = board();
    key('ArrowDown');
    key('ArrowDown');
    expect(cues).toEqual(['move']);
    key('Enter');
    key('Enter', { repeat: true });
    expect(cues).toEqual(['move', 'refused']);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('START sounds itself and the board goes without a close cue', () => {
    const { cues, onStart } = board();
    key('Enter');
    expect(onStart).toHaveBeenCalledWith('night');
    expect(cues).toEqual(['start']);
  });

  it('Esc with nothing done: the close cue', () => {
    const { cues } = board();
    key('Escape');
    expect(cues).toEqual(['close']);
  });
});
