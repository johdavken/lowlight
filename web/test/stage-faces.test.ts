import { describe, expect, it } from 'vitest';
import type { CurrentLine } from '../src/ui/feed';
import { stageFaces } from '../src/ui/stage-faces';

const line = (over: Partial<CurrentLine>): CurrentLine => ({ id: 'm1', role: 'agent', status: 'ok', speaker: 'contact', actions: '', ...over });

describe('stageFaces', () => {
  it('her page: her face from her actions, yours neutral', () => {
    expect(stageFaces(line({ actions: 'I grin' }), { her: ['happy'], you: ['happy'] })).toEqual({ right: 'happy', left: null });
  });

  it("an old save's stored face shows when her actions match nothing", () => {
    expect(stageFaces(line({ actions: 'I set the mug down', expression: 'tired' }), { her: ['tired'], you: [] })).toEqual({ right: 'tired', left: null });
  });

  it('her actions beat a stored face', () => {
    expect(stageFaces(line({ actions: 'I grin', expression: 'tired' }), { her: ['happy', 'tired'], you: [] }).right).toBe('happy');
  });

  it('your line: your face from your actions, hers neutral', () => {
    expect(stageFaces(line({ role: 'user', speaker: 'user', actions: 'I grin' }), { her: ['happy'], you: ['smile'] })).toEqual({ right: null, left: 'smile' });
  });

  it('a figure with no faces stays neutral', () => {
    expect(stageFaces(line({ role: 'user', speaker: 'user', actions: 'I grin' }), { her: [], you: [] })).toEqual({ right: null, left: null });
    expect(stageFaces(line({ actions: 'I grin' }), { her: [], you: [] })).toEqual({ right: null, left: null });
  });

  it("others' and strangers' pages, and no line, change no face", () => {
    const faces = { her: ['happy'], you: ['happy'] };
    expect(stageFaces(line({ speaker: 'other', otherId: 'hae', actions: 'She grins' }), faces)).toEqual({ right: null, left: null });
    expect(stageFaces(line({ speaker: 'stranger', actions: 'He grins' }), faces)).toEqual({ right: null, left: null });
    expect(stageFaces(null, faces)).toEqual({ right: null, left: null });
  });

  it("whose face: his laugh in her reply isn't hers; your line counts I and bare verbs only", () => {
    expect(stageFaces(line({ actions: 'He laughs.' }), { her: ['happy'], you: [], herPronoun: 'she' }).right).toBeNull();
    expect(stageFaces(line({ actions: 'He laughs.' }), { her: ['happy'], you: [], herPronoun: 'he' }).right).toBe('happy');
    expect(stageFaces(line({ role: 'user', speaker: 'user', actions: 'She grins at me.' }), { her: [], you: ['happy'], herPronoun: 'she' }).left).toBeNull();
    expect(stageFaces(line({ role: 'user', speaker: 'user', actions: 'Grins.' }), { her: [], you: ['happy'], herPronoun: 'she' }).left).toBe('happy');
  });
});
