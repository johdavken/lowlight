import { afterEach, describe, expect, it } from 'vitest';
import { clearLead, leadPoints, traceLead, traceVia } from '../src/ui/trace-lead';

describe('leadPoints (the HUD trace: the longer axis, then 45°)', () => {
  it('a tall run goes down first, then jogs onto the target', () => {
    expect(leadPoints([100, 100], [120, 200])).toEqual([[100, 100], [100, 180], [120, 200]]);
  });
  it('a wide run goes across first', () => {
    expect(leadPoints([100, 100], [200, 90])).toEqual([[100, 100], [190, 100], [200, 90]]);
  });
  it('a straight run is two points, a true diagonal too', () => {
    expect(leadPoints([10, 10], [10, 50])).toEqual([[10, 10], [10, 50]]);
    expect(leadPoints([10, 10], [40, 40])).toEqual([[10, 10], [40, 40]]);
  });
  it('lands on whole pixels', () => {
    expect(leadPoints([10.4, 10.6], [10.4, 30.2])).toEqual([[10, 11], [10, 30]]);
  });
});

describe('traceLead', () => {
  afterEach(() => document.body.replaceChildren());
  it('keeps one line per key on the host, drawn again in place, and clears it', () => {
    const host = document.body.appendChild(document.createElement('div'));
    traceLead(host, 'card', [0, 0], [10, 40]);
    traceLead(host, 'card', [0, 0], [50, 10]);
    traceLead(host, 'tip', [0, 0], [0, 10]);
    const svgs = host.querySelectorAll('svg.hv-lead');
    expect([...svgs].map((s) => (s as SVGElement).dataset.lead)).toEqual(['card', 'tip']);
    const card = host.querySelector('svg[data-lead="card"]')!;
    expect(card.querySelector('path')!.getAttribute('d')).toBe('M0.5 0.5 L40.5 0.5 L50.5 10.5');
    expect(card.querySelector('.ring')!.getAttribute('cx')).toBe('0.5');
    expect(card.querySelector('.dot')!.getAttribute('x')).toBe('49');
    clearLead(host, 'card');
    expect(card.childElementCount).toBe(0);
    expect(host.querySelector('svg[data-lead="tip"]')!.childElementCount).toBe(3);
  });
});

describe('traceVia', () => {
  afterEach(() => document.body.replaceChildren());
  it('draws through every corner, ring at the first, dot at the last, in its own colour; one key replaces its last', () => {
    const host = document.createElement('div');
    document.body.append(host);
    traceVia(host, 'pick-p1', [[500.4, 470], [500, 440], [424, 440], [402, 418]], 'var(--p1)');
    const svg = host.querySelector<SVGSVGElement>('svg.hv-lead[data-lead="pick-p1"]')!;
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M500.5 470.5 L500.5 440.5 L424.5 440.5 L402.5 418.5');
    expect(svg.querySelector('.ring')!.getAttribute('cx')).toBe('500.5');
    expect(svg.querySelector('.dot')!.getAttribute('x')).toBe('401');
    expect(svg.style.getPropertyValue('--hv-c')).toBe('var(--p1)');
    traceVia(host, 'pick-p1', [[10, 10], [20, 10]]);
    expect(host.querySelectorAll('svg.hv-lead')).toHaveLength(1);
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    traceVia(host, 'pick-p1', [[10, 10]]);
    expect(svg.childElementCount).toBe(0);
  });
});
