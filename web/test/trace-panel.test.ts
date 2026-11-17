import { afterEach, describe, expect, it } from 'vitest';
import { openScreen } from '../src/ui/screen';
import { headLinePoints, mountTracePanel } from '../src/ui/trace-panel';

afterEach(() => document.body.replaceChildren());

describe('the head line', () => {
  it('runs from the ring under the head, then climbs 45° into the bar\'s run', () => {
    expect(headLinePoints([64, 130], [1380, 62], 1536)).toEqual([[64, 130], [1312, 130], [1380, 62]]);
  });

  it('with no run to meet, it runs straight to the edge', () => {
    expect(headLinePoints([64, 130], null, 1536)).toEqual([[64, 130], [1536, 130]]);
  });

  it('with no room to climb (the word over the ring, or the run below the line), it stays straight', () => {
    expect(headLinePoints([64, 130], [120, 62], 1536)).toEqual([[64, 130], [1536, 130]]);
    expect(headLinePoints([64, 130], [1380, 140], 1536)).toEqual([[64, 130], [1536, 130]]);
  });

  it('lands on whole pixels', () => {
    expect(headLinePoints([64.4, 129.6], [1380.2, 61.7], 1536)).toEqual([[64, 130], [1312, 130], [1380, 62]]);
  });
});

describe('mountTracePanel', () => {
  const open = () => {
    const screen = openScreen(document.body, { title: 'CREW', className: 'scr-trace crew-screen', label: 'Crew', accent: '#ff4d4d', reducedMotion: true });
    return { screen, panel: mountTracePanel(screen, { title: 'CREW' }) };
  };

  it('builds the head: the name, a place for tabs, a note, the numbers; and a key line at the foot', () => {
    const { screen, panel } = open();
    expect([...screen.head.children].map((c) => c.className)).toEqual(['tp-title', 'tp-tabs', 'tp-note', 'tp-nums']);
    expect(screen.head.textContent).toBe('CREW');
    panel.hints('[↑↓] WHO · [ESC] CLOSE');
    const keys = document.querySelector('.tp-keys')!;
    expect(keys.textContent).toBe('[↑↓] WHO · [ESC] CLOSE');
    expect(keys.classList.contains('hint-line')).toBe(true);
    expect(keys.parentElement).toBe(screen.head.parentElement);
    panel.destroy();
  });

  it('a leader with nothing to point from or to is cleared, not drawn', () => {
    const { screen, panel } = open();
    panel.lead('pick', null, screen.head);
    panel.lead('pick', screen.head, null);
    expect(screen.root.querySelector('svg.hv-lead[data-lead="pick"] path')).toBeNull();
    panel.destroy();
  });
});
