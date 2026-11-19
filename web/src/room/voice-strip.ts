/**
 * The narrator's controls (voiced job beats): a red strip on the JOB column's top edge, beside the TEXT tag, while the
 * page has narration. ❚❚ pauses the reading where it is, ▶ plays it on (or, once it has finished, reads the page
 * again), ↺ reads the page again from its first clip, VOICE n% is SYS's VOICE level (a click steps it 10 %, round
 * from 100 to 0; the wheel steps it up and down).
 */
import type { VoiceGate } from './voice-gate';

export interface VoiceStrip {
  /** Redraw from the gate and the voice (the page, a pause, the level). */
  refresh(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
/** A 12 px icon in the strip's red: filled shapes, or a stroked line (`line`). */
function icon(name: string, paths: string[], line = false): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('class', `jcv-icon jcvi-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    if (line) p.setAttribute('class', 'jcv-line');
    svg.append(p);
  }
  return svg;
}

/** VOICE's step, in SYS's 5 % steps: 10 %. */
const STEPS = 2;

export function mountVoiceStrip(col: HTMLElement, o: { gate: VoiceGate; speaking(): boolean; level(): number; step(steps: number): void }): VoiceStrip {
  const box = document.createElement('div');
  box.className = 'jc-voice';
  box.hidden = true;
  const button = (cls: string, label: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('aria-label', label);
    // The board's keys stay its own: a click here never leaves focus on the strip.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  };
  const play = button('jcv-play', 'Pause the narrator');
  play.append(icon('pause', ['M2 1h3v10H2z', 'M7 1h3v10H7z']), icon('play', ['M2 1l9 5-9 5z']));
  const restart = button('jcv-restart', 'Read this page again');
  restart.append(icon('restart', ['M9.6 3.2A4.5 4.5 0 1 0 10.5 6', 'M10.5 0.8v3h-3'], true));
  const vol = button('jcv-vol', 'Narrator volume');
  box.append(play, restart, vol);
  col.append(box);

  const state = (): 'playing' | 'paused' | 'done' => (o.gate.paused() ? 'paused' : o.speaking() ? 'playing' : 'done');
  let timer: ReturnType<typeof setInterval> | null = null;
  const refresh = () => {
    const on = o.gate.page().length > 0;
    box.hidden = !on;
    const st = state();
    play.dataset.state = st;
    play.setAttribute('aria-label', st === 'playing' ? 'Pause the narrator' : st === 'paused' ? 'Play the narrator on' : 'Read this page again');
    vol.textContent = `VOICE ${Math.round(o.level() * 100)}%`;
    // While it reads, look again now and then: a reading that ends turns ❚❚ back to ▶.
    if (on && st === 'playing' && !timer) timer = setInterval(() => refresh(), 400);
    if ((!on || st !== 'playing') && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  play.addEventListener('click', () => {
    const st = state();
    if (st === 'playing') o.gate.pause();
    else if (st === 'paused') o.gate.play();
    else o.gate.restart();
    refresh();
  });
  restart.addEventListener('click', () => {
    o.gate.restart();
    refresh();
  });
  vol.addEventListener('click', () => {
    o.step(o.level() >= 1 ? -20 : STEPS);
    refresh();
  });
  vol.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      o.step(e.deltaY < 0 ? STEPS : -STEPS);
      refresh();
    },
    { passive: false },
  );
  return { refresh };
}
