// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mountJobColumn } from '../src/room/job-column';

let game: HTMLElement;
let feed: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="game"><div id="feed"></div></div>';
  game = document.getElementById('game')!;
  feed = document.getElementById('feed')!;
});
const col = () => game.querySelector<HTMLElement>('.jc-layer > .jc')!;

describe('the JOB column (a job’s text beside the subtitles)', () => {
  it('shows the job’s title and text, actions in italics, and moves her line over', () => {
    const c = mountJobColumn(feed, game);
    expect(col().hidden).toBe(true);
    c.show('The Cable Stair', 'The rent went up the stair. *She pockets the key.* Nobody saw.');
    expect(col().hidden).toBe(false);
    expect(col().querySelector('.jc-head')!.textContent).toBe('◆ JOB · THE CABLE STAIR');
    expect(col().querySelector('.jc-sub')!.hasAttribute('hidden')).toBe(true);
    expect(col().querySelector('.jc-body em')!.textContent).toBe('She pockets the key.');
    expect(feed.classList.contains('job-col')).toBe(true);
  });

  it('a WALK ending has no text: the debrief\'s rolls still stand in the column', () => {
    const rolls = document.createElement('div');
    mountJobColumn(feed, game).show('The Cable Stair', '', undefined, rolls);
    expect(col().hidden).toBe(false);
    expect(col().querySelector('.jc-body')!.contains(rolls)).toBe(true);
  });

  it('SETUP: the line under the head carries the district, tier and heat, even with no pitch', () => {
    const c = mountJobColumn(feed, game);
    c.show('Night Shift', null, 'KARASU · NOBODY · HEAT 0');
    expect(col().hidden).toBe(false);
    expect(col().querySelector('.jc-sub')!.textContent).toBe('KARASU · NOBODY · HEAT 0');
    expect(col().querySelector('.jc-body')!.textContent).toBe('');
  });

  it('a new beat starts at the top; the same text again keeps where you’d scrolled', () => {
    const c = mountJobColumn(feed, game);
    const body = () => col().querySelector<HTMLElement>('.jc-body')!;
    c.show('X', 'one');
    body().scrollTop = 40;
    c.show('X', 'one');
    expect(body().scrollTop).toBe(40);
    c.show('X', 'two');
    expect(body().scrollTop).toBe(0);
  });

  it('tells the feed when her line narrows or widens (once each way), so it re-pages', () => {
    let calls = 0;
    const c = mountJobColumn(feed, game, () => calls++);
    c.show('X', 'one');
    c.show('X', 'two');
    expect(calls).toBe(1);
    c.clear();
    c.clear();
    expect(calls).toBe(2);
  });

  it('clear (or nothing to show) takes it away and gives the line its room back', () => {
    const c = mountJobColumn(feed, game);
    c.show('X', 'one');
    c.clear();
    expect(col().hidden).toBe(true);
    expect(feed.classList.contains('job-col')).toBe(false);
    c.show('X', 'two');
    c.show('X', '');
    expect(col().hidden).toBe(true);
  });
  it('new words in a column already up pulse; the same words, or the column first opening, do not', () => {
    const root = document.createElement('div');
    const host = document.createElement('div');
    const col = mountJobColumn(root, host);
    const jc = host.querySelector('.jc')!;
    col.show('Job', 'First beat.');
    expect(jc.classList.contains('jc-new')).toBe(false);
    col.show('Job', 'First beat.', 'a line');
    expect(jc.classList.contains('jc-new')).toBe(false);
    col.show('Job', 'Second beat.');
    expect(jc.classList.contains('jc-new')).toBe(true);
    col.clear();
    expect(jc.classList.contains('jc-new')).toBe(false);
  });
  it('the words on the line stand on their own, in CRT, under who said them', () => {
    const c = mountJobColumn(feed, game);
    c.setOnLine('Silas', ['"Oh."']);
    c.show('Job', '*On the line, Silas says, "Oh."*\n\n*Nothing else.*');
    const said = col().querySelectorAll<HTMLElement>('.jc-body .jc-line');
    expect(said).toHaveLength(1);
    expect(said[0].textContent).toBe('"Oh."');
    expect(said[0].dataset.who).toBe('Silas (ON COMMS)');
  });
  it('a new line on the same text redraws it', () => {
    const c = mountJobColumn(feed, game);
    c.show('Job', 'He says "Oh."');
    expect(col().querySelector('.jc-line')).toBeNull();
    c.setOnLine('Silas', ['"Oh."']);
    expect(col().querySelector('.jc-line')?.textContent).toBe('"Oh."');
  });
});
