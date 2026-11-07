import { describe, expect, it } from 'vitest';
import { heatEffects } from './heat';

describe('what heat does', () => {
  it('nothing below 4', () => {
    expect(heatEffects(0)).toEqual([]);
    expect(heatEffects(3)).toEqual([]);
  });
  it('at 4 and 5: warier jobs, errands slipping', () => {
    expect(heatEffects(4)).toEqual(['ERRANDS −5 %', 'SOME JOBS OPEN WARIER']);
    expect(heatEffects(5)).toEqual(['ERRANDS −10 %', 'SOME JOBS OPEN WARIER']);
  });
  it('at 6 and up: smaller rolls and no favours as well', () => {
    expect(heatEffects(6)).toEqual(['ROLLS A STEP SMALLER', 'NO FAVOURS', 'ERRANDS −15 %', 'SOME JOBS OPEN WARIER']);
    expect(heatEffects(10)).toContain('ERRANDS −35 %');
  });
});
