import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../src/room/table/decode';
import { slipOnce } from '../src/ui/name-slip';

describe('slipOnce', () => {
  it('flickers one letter through decode glyphs in place, then gives the name back', async () => {
    const name = document.createElement('span');
    name.textContent = 'RUE';
    const seen: string[] = [];
    const shifts: string[] = [];
    let k = 0;
    const r = () => [0.5, 0, 0.1, 0.2, 0.3][k++ % 5]; // letter U, 3 frames
    await slipOnce(name, r, async () => {
      const slip = name.querySelector<HTMLElement>('.slip')!;
      expect(name.textContent).toBe('RUE'); // the real letter stays, so the width doesn't move
      expect(slip.textContent).toBe('U');
      seen.push(slip.dataset.n!);
      shifts.push(name.style.getPropertyValue('--slip-x'));
    });
    // The name jerks on the first two frames only, then holds still, and is left with no shift.
    expect(shifts.slice(2)).toEqual(['0px']);
    expect(name.style.getPropertyValue('--slip-x')).toBe('');
    expect(seen).toHaveLength(3);
    for (const g of seen) expect(GLYPHS).toContain(g);
    expect(name.querySelector('.slip')).toBeNull();
    expect(name.innerHTML).toBe('RUE');
  });

  it("leaves a name alone that was redrawn while it slipped", async () => {
    const name = document.createElement('span');
    name.textContent = 'RUE';
    await slipOnce(name, () => 0, async () => void (name.textContent = 'HICKS'));
    expect(name.textContent).toBe('HICKS');
  });
});
