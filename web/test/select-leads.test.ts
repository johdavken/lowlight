import { afterEach, describe, expect, it } from 'vitest';
import { drawSelectLeads, leadSides, pickLeadPoints } from '../src/landing/select-leads';

describe('the select leaders (B TRACE)', () => {
  afterEach(() => document.body.replaceChildren());

  it('1P leads while choosing and at YOU; both while 2P chooses; none at the model step or READY', () => {
    expect(leadSides('p1')).toEqual(['p1']);
    expect(leadSides('you')).toEqual(['p1']);
    expect(leadSides('p2')).toEqual(['p1', 'p2']);
    expect(leadSides('model')).toEqual([]);
    expect(leadSides('ready')).toEqual([]);
  });

  it('up from the tile, across over the grid, then 45° onto the file (1P to its right edge, 2P to its left)', () => {
    expect(pickLeadPoints('p1', { left: 802, top: 520, width: 104 }, 490, { left: 0, right: 420 })).toEqual([
      [854, 516],
      [854, 474],
      [424, 474],
      [402, 452],
    ]);
    expect(pickLeadPoints('p2', { left: 914, top: 520, width: 104 }, 490, { left: 1180, right: 1600 })).toEqual([
      [966, 516],
      [966, 464],
      [1176, 464],
      [1198, 442],
    ]);
  });

  it('draws a line per shown cursor and clears it when its cursor hides or the phase moves on', () => {
    const stage = document.createElement('div');
    stage.innerHTML = `<div class="fighter p1"><div class="file-strip"></div></div><div class="fighter p2"><div class="file-strip"></div></div>
      <div class="grid"><div class="cursor c1"></div><div class="cursor c2 hide"></div></div>`;
    document.body.append(stage);
    const drawn = () => [...stage.querySelectorAll('svg.hv-lead')].filter((s) => s.childElementCount > 0).map((s) => (s as SVGElement).dataset.lead);
    drawSelectLeads(stage, 'p2');
    expect(drawn()).toEqual(['pick-p1']);
    stage.querySelector('.cursor.c2')!.classList.remove('hide');
    drawSelectLeads(stage, 'p2');
    expect(drawn()).toEqual(['pick-p1', 'pick-p2']);
    drawSelectLeads(stage, 'ready');
    expect(drawn()).toEqual([]);
  });
});
