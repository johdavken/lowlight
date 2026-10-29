import { describe, expect, it } from 'vitest';
import type { District, Lettering } from '../../shared/map-schema';
import { arcMid, bendAt, drawNames, letteringOf, namePath } from '../src/ui/map/lettering';

const line = (bend: number, from: [number, number] = [10, 50], to: [number, number] = [30, 50], size = 1.6): Lettering => ({ from, to, bend, size });
const finite = (s: string) => !/NaN|Infinity/.test(s);
/** The path's numbers, in order. */
const nums = (d: string) => d.match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);

describe('letteringOf', () => {
  it("a district without lettering gets a straight line through its label, as long as its name's letters", () => {
    const l = letteringOf({ id: 'v', name: 'Velvet', label: [50, 40] });
    const half = (6 * 1.6 * 1.1) / 2;
    expect(l.size).toBe(1.6);
    expect(l.bend).toBe(0);
    expect(l.from[0]).toBeCloseTo(50 - half);
    expect(l.to[0]).toBeCloseTo(50 + half);
    expect(l.from[1]).toBe(40);
    expect(l.to[1]).toBe(40);
  });

  it('its own lettering wins', () => {
    const own = line(3);
    expect(letteringOf({ id: 'v', name: 'Velvet', label: [20, 50], lettering: own })).toEqual(own);
  });
});

describe('namePath', () => {
  it('bend 0 is a straight line, its length the chord in viewBox units', () => {
    const p = namePath(line(0));
    expect(p.d.startsWith('M')).toBe(true);
    expect(p.d).toContain('L');
    expect(p.d).not.toContain('A');
    expect(p.length).toBeCloseTo(300);
  });

  it('a bend is an arc that bows to the left of from → to (up, for a line going right)', () => {
    const l = line(5);
    const p = namePath(l);
    expect(p.d).toContain('A');
    expect(p.length).toBeGreaterThan(300);
    const [x, y] = arcMid(l);
    expect(x).toBeCloseTo(20);
    expect(y).toBeCloseTo(50 - (5 * 15) / 10);
  });

  it('a line drawn right to left reads left to right, the same shape', () => {
    const l = line(-5, [30, 50], [10, 50]);
    expect(arcMid(l)[0]).toBeCloseTo(20);
    expect(arcMid(l)[1]).toBeCloseTo(42.5);
    expect(nums(namePath(l).d).slice(0, 2)).toEqual([150, 500]);
  });

  it('a bend more than half the line takes the large arc, its middle still the bend off the line', () => {
    const l = line(15);
    const n = nums(namePath(l).d);
    // M x y A r r rot large sweep x y
    expect(n[5]).toBe(1);
    expect(arcMid(l)[1]).toBeCloseTo(50 - (15 * 15) / 10);
  });

  it('both ends on one spot draw a finite path (Review Focus 1)', () => {
    for (const bend of [0, 4]) {
      const p = namePath(line(bend, [40, 40], [40, 40]));
      expect(finite(p.d)).toBe(true);
      expect(Number.isFinite(p.length)).toBe(true);
    }
  });

  it('a near-vertical name draws either way round (Review Focus 3)', () => {
    for (const [from, to] of [
      [[50, 10], [50.001, 60]],
      [[50.001, 10], [50, 60]],
    ] as [number, number][][]) {
      const p = namePath(line(3, from, to));
      expect(finite(p.d)).toBe(true);
      expect(p.length).toBeGreaterThan(0);
    }
  });
});

describe('bendAt', () => {
  it.each([0, 5, -8])('finds bend %d back from the arc middle', (bend) => {
    const l = line(bend, [10, 30], [40, 60]);
    expect(bendAt(l, arcMid(l))).toBeCloseTo(bend);
  });
});

describe('drawNames', () => {
  const ds: District[] = [
    { id: 'a', name: 'Aye', label: [10, 10] },
    { id: 'b', name: 'Bee', label: [40, 10], lettering: line(2) },
  ];

  it('draws one text along its own path per district, spread to fill it', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawNames(svg, ds, { has: (id) => id === 'b', sel: 'a' });
    const texts = [...svg.querySelectorAll('text.dname')];
    expect(texts.map((t) => (t as SVGElement).dataset.id)).toEqual(['a', 'b']);
    const tp = texts[1].querySelector('textPath')!;
    expect(tp.textContent).toBe('Bee');
    expect(tp.getAttribute('href')).toBe('#dname-b');
    expect(Number(tp.getAttribute('textLength'))).toBeCloseTo(namePath(line(2)).length, 1);
    expect(tp.getAttribute('lengthAdjust')).toBe('spacing');
    expect(Number(texts[1].getAttribute('font-size'))).toBeCloseTo(1.6 * 15);
    expect(svg.querySelector('path#dname-b')!.getAttribute('d')).toBe(namePath(line(2)).d);
    expect(texts[0].classList.contains('has')).toBe(false);
    expect(texts[0].classList.contains('sel')).toBe(true);
    expect(texts[1].classList.contains('has')).toBe(true);
  });

  it('draws again in place', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    drawNames(svg, ds, {});
    drawNames(svg, ds.slice(0, 1), {});
    expect(svg.querySelectorAll('text.dname')).toHaveLength(1);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });
});
