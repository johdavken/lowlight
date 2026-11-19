import { describe, expect, it } from 'vitest';
import { MOVES_SYSTEM, movesMessages, spanPlace, spansOf, type MovesPromptInput } from '../src/moves-prompt';
import { forgetThinkingRefusals, thinksFirst } from '../src/scenario';

const input = (o: Partial<MovesPromptInput> = {}): MovesPromptInput => ({
  you: 'Vee',
  window: { from: 1320, to: 1440 },
  weather: 'rain',
  dark: ['Spine'],
  places: [
    { id: 'karasu/noodle-stall', name: 'the Noodle Stall' },
    { id: 'karasu/the-tilt', name: 'the Tilt' },
  ],
  movers: [
    {
      id: 'hicks',
      name: 'Hicks',
      pronoun: 'he',
      tagline: 'Netrunner, finder.',
      bio: 'Dry, hard to find.',
      spans: 'the Noodle Stall 22:00–00:00',
      recent: ['Fenced a deck.'],
      summary: 'You asked him to find the drive.',
      plan: null,
      promise: 'to text you when he has it',
      job: null,
    },
  ],
  written: { threads: [{ title: 'Signed', pitch: 'A contract.', people: ['Kestrel'] }], guests: ['Imogen'] },
  ...o,
});

describe('the beat prompt', () => {
  it('opens with its own system line (the e2e fake answers by it)', () => {
    expect(MOVES_SYSTEM.startsWith('You keep the city moving')).toBe(true);
    // A move never opens a mystery or chains one (playtest: Rue traced a stranger across nine story days off-screen).
    expect(MOVES_SYSTEM).toContain('no new people');
    expect(MOVES_SYSTEM).toContain('Never investigate');
    expect(MOVES_SYSTEM).toContain("don't take it a step further");
    expect(movesMessages(input())[0]).toEqual({ role: 'system', content: MOVES_SYSTEM });
  });

  it('shows each mover with her spans, her threads with you, the places and the fence', () => {
    const user = movesMessages(input())[1].content as string;
    expect(user).toContain('[mover: hicks "Hicks" (he)');
    expect(user).toContain('where: the Noodle Stall 22:00–00:00');
    expect(user).toContain("lately (done; don't repeat or extend): Fenced a deck.");
    expect(user).toContain('with Vee: You asked him to find the drive.');
    expect(user).toContain('promised Vee: to text you when he has it');
    expect(user).toContain('[written: Signed — A contract.; people: Kestrel]');
    expect(user).toContain('[guests: Imogen]');
    expect(user).toContain('karasu/noodle-stall "the Noodle Stall"');
    expect(user).toContain('[window: 22:00–00:00 · rain');
    expect(user).toContain('dark: Spine');
    expect(user).toContain('"moves":[]');
  });

  it('spans collapse the window into places, marking fixed time', () => {
    const at = (t: number) => (t < 1500 ? 'home' : 'tilt');
    const name = (id: string) => (id === 'home' ? 'home' : 'the Tilt');
    expect(spansOf({ from: 1380, to: 1620 }, at, name, () => false)).toBe('home 23:00–01:00 · the Tilt 01:00–03:00');
    expect(spansOf({ from: 1380, to: 1620 }, at, name, (f) => f >= 1500)).toBe('home 23:00–01:00 · the Tilt 01:00–03:00 (fixed)');
  });

  it('spans name each place by id and name, so two rooms at one place stay apart (minor M7)', () => {
    expect(spansOf({ from: 1380, to: 1440 }, () => 'karasu/noodle-stall', spanPlace((id) => (id === 'karasu/noodle-stall' ? 'the Noodle Stall' : id)), () => false)).toBe('karasu/noodle-stall "the Noodle Stall" 23:00–00:00');
  });

  it('a fresh model is asked without thinking', () => {
    forgetThinkingRefusals();
    expect(thinksFirst('z-ai/glm-4.6')).toBe(false);
  });
});
