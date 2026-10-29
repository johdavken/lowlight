import { describe, expect, it } from 'vitest';
import { planSettings, ST_DEFAULT_CONTEXT } from './settings-plan';

describe('planSettings', () => {
  it("raises SillyTavern's untouched 4,095 default to 32k and turns function calling on", () => {
    const p = planSettings({ mainApi: 'openai', functionCalling: false, context: ST_DEFAULT_CONTEXT });
    expect(p.functionCalling).toBe(true);
    expect(p.context).toBe(32768);
    expect(p.changes).toHaveLength(2);
    expect(p.advice).toEqual([]);
  });

  it('leaves a context the player set themselves, and advises when it is under 16k', () => {
    const p = planSettings({ mainApi: 'openai', functionCalling: true, context: 8192 });
    expect(p.context).toBeNull();
    expect(p.functionCalling).toBe(false);
    expect(p.changes).toEqual([]);
    expect(p.advice.join(' ')).toMatch(/8,192/);
    expect(p.advice.join(' ')).toMatch(/16K/);
  });

  it('says nothing about a context of 16k or more', () => {
    expect(planSettings({ mainApi: 'openai', functionCalling: true, context: 16384 })).toEqual({ functionCalling: false, context: null, changes: [], advice: [] });
  });

  it("on a Text Completion API (a fresh SillyTavern starts on the Horde) still sets Chat Completion's, and says her tools need it", () => {
    const p = planSettings({ mainApi: 'koboldhorde', functionCalling: false, context: ST_DEFAULT_CONTEXT });
    expect(p.functionCalling).toBe(true);
    expect(p.context).toBe(32768);
    expect(p.advice.join(' ')).toMatch(/CHAT COMPLETION/);
  });
});
