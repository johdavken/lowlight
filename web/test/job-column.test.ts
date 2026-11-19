// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountJobColumn, talkParts } from '../src/room/job-column';

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

  it("the room HUD: the box's frame behind it in the layer, the name on its plate (◆ JOB · unseen but in the text), the details beside it", () => {
    const c = mountJobColumn(feed, game);
    expect(game.querySelector('.jc-layer > .hf.hf-col')).not.toBeNull();
    expect(game.querySelector('.jc-layer > .hf')!.nextElementSibling).toBe(col());
    c.show('Run Sheet', 'The yard.', 'POSTED BY RUE');
    expect(col().querySelector('.jc-top > .jc-head .jc-title')!.textContent).toBe('RUN SHEET');
    expect(col().querySelector('.jc-head .jc-kind')!.textContent).toBe('◆ JOB · ');
    expect(col().querySelector('.jc-top > .jc-sub')!.textContent).toBe('POSTED BY RUE');
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
  it("the words on the line stand as her replies do (playtest 2026-11-17): their paragraph a block under her name, ON COMMS", () => {
    const c = mountJobColumn(feed, game);
    c.setOnLine('Silas', ['"Oh."']);
    c.show('Job', '*Nothing yet.*\n\n*On the line, Silas says, "Oh."*\n\n*Nothing else.*');
    const blocks = [...col().querySelectorAll<HTMLElement>('.jc-body > *')];
    expect(blocks.map((b) => b.className)).toEqual(['jc-story', 'jc-reply jc-scripted', 'jc-story']);
    expect(blocks[1].dataset.who).toBe('Silas (ON COMMS)');
    expect(blocks[1].dataset.name).toBe('Silas');
    expect(blocks[1].querySelector('.jc-t-say')!.textContent).toBe('“Oh.”');
    expect(blocks[1].querySelector('.jc-t-act')!.textContent).toBe('On the line, Silas says, ');
    expect(blocks[2].textContent).toBe('Nothing else.');
    expect(col().querySelector('.jc-line')).toBeNull();
  });
  it('a new line on the same text redraws it', () => {
    const c = mountJobColumn(feed, game);
    c.show('Job', 'He says "Oh."');
    expect(col().querySelector('.jc-scripted')).toBeNull();
    c.setOnLine('Silas', ['"Oh."']);
    expect(col().querySelector('.jc-scripted .jc-t-say')?.textContent).toBe('“Oh.”');
  });
});

describe('the talk beside a job (2026-11-11)', () => {
  const body = () => col().querySelector<HTMLElement>('.jc-body')!;
  const her = (key: string, text: string | null, line = true) => ({ key, who: line ? 'Rue (ON COMMS)' : 'Rue', text, line });
  it('her line: noise while she writes, under the beat; then it decodes in, actions plain and her words in quotes', async () => {
    vi.useFakeTimers();
    const c = mountJobColumn(feed, game);
    c.show('Run Sheet', 'The yard. *Rain.*');
    c.setThread({ head: [], foot: [her('a1', null)] });
    const r = () => body().querySelector<HTMLElement>('.jc-reply')!;
    expect(r().dataset.who).toBe('Rue (ON COMMS)');
    // The name it shows has no (ON COMMS): being on the line is drawn as a mark after it (job-column.css).
    expect(r().dataset.name).toBe('Rue');
    expect(r().classList.contains('jc-here')).toBe(false);
    expect(body().lastElementChild).toBe(r());
    expect(r().textContent).toMatch(/^\p{Script=Han}{24}$/u);
    c.setThread({ head: [], foot: [her('a1', '*She exhales.* Keep walking.')] });
    await vi.advanceTimersByTimeAsync(800);
    // Told the traditional way (playtest 2026-11-11): the action plain, what she says in quotes.
    expect(r().textContent).toBe('She exhales. “Keep walking.”');
    expect(r().querySelector('.jc-t-act')!.textContent).toBe('She exhales.');
    expect(r().querySelector('.jc-t-say')!.textContent).toBe('“Keep walking.”');
    vi.useRealTimers();
  });
  it('the exchange in order: her answer heads the next beat, then your typed line and hers under it', () => {
    const c = mountJobColumn(feed, game, undefined, { reduced: () => true });
    c.show('Run Sheet', 'The hut.');
    c.setThread({ head: [her('a1', 'Keep walking.')], foot: [{ key: 'u1', who: 'Soren', text: 'Who is he?', you: true }, her('a2', 'Nobody you know.', false)] });
    expect(body().textContent).toBe('“Keep walking.”The hut.“Who is he?”“Nobody you know.”');
    expect(body().querySelector('.jc-story')!.textContent).toBe('The hut.');
    // Her answer, the job's text under NARRATOR, your line, hers.
    const kids = [...body().children];
    expect(kids[1].classList.contains('jc-story')).toBe(true);
    expect(kids[2].classList.contains('jc-you')).toBe(true);
    expect((kids[2] as HTMLElement).dataset.who).toBe('Soren');
    expect(kids[3].classList.contains('jc-here')).toBe(true);
    expect(kids[0].classList.contains('jc-here')).toBe(false);
  });
  it('an empty thread takes it away; clear drops it', () => {
    const c = mountJobColumn(feed, game, undefined, { reduced: () => true });
    c.show('X', 'one');
    c.setThread({ head: [], foot: [her('a1', 'Hm.')] });
    c.setThread({ head: [], foot: [] });
    expect(body().textContent).toBe('one');
    c.setThread({ head: [], foot: [her('a1', 'Hm.')] });
    c.clear();
    c.show('X', 'two');
    expect(body().querySelector('.jc-reply')).toBeNull();
  });
});

describe('talkParts: a line of talk told the traditional way (playtest 2026-11-11)', () => {
  const plain = (t: string) => talkParts(t).plain;
  it('actions plain, words in quotes, an action opening a paragraph and her words running on after it, no blank lines', () => {
    expect(plain("*I'm on the daybed, taping paper to the wall.*\n\nYou knocked twice. Good.\n\n*I climb down.*\n\nIntake's shut Sundays.")).toBe(
      "I'm on the daybed, taping paper to the wall. “You knocked twice. Good.”\n\u2003I climb down. “Intake's shut Sundays.”",
    );
  });
  it('words already in quotes keep theirs; a bit of punctuation after an action stays as written', () => {
    expect(plain('"Fine," I say. *nods*.')).toBe('"Fine," I say. nods .');
    expect(talkParts('*nods*.').paragraphs[0].map((p) => p.kind)).toEqual(['act', 'plain']);
  });
  it("someone else's beat keeps its words under their name, on its own line", () => {
    const t = talkParts('*I glance at the counter.*\n\nSilas: He looks up. Neither.\n\nIt\'s my night.');
    expect(t.paragraphs.map((ps) => ps.map((p) => p.kind))).toEqual([['act'], ['who', 'plain'], ['say']]);
    expect(t.plain).toBe('I glance at the counter.\n\u2003SILAS He looks up. Neither.\n\u2003“It\'s my night.”');
  });
});

describe('the job text in the column (playtest 2026-11-11)', () => {
  it("what's said in the job's text stands in a span of its own, the narration around it plain", () => {
    const feed = document.createElement('div');
    const game = document.createElement('div');
    document.body.append(feed, game);
    const c = mountJobColumn(feed, game, undefined, { reduced: () => true });
    c.show('Run Sheet', 'The warden looks up. "Shut," he says. “Come back Monday.”');
    const story = game.querySelector('.jc-story')!;
    expect([...story.querySelectorAll('.jc-t-quote')].map((q) => q.textContent)).toEqual(['“Shut,”', '“Come back Monday.”']);
    // Curled, as her replies' words are.
    expect(story.textContent).toBe('The warden looks up. “Shut,” he says. “Come back Monday.”');
  });
  it('a beat written all in asterisks: its quotes stand apart too; the words on comms keep their own colour', () => {
    const feed = document.createElement('div');
    const game = document.createElement('div');
    document.body.append(feed, game);
    const c = mountJobColumn(feed, game, undefined, { reduced: () => true });
    c.setOnLine('Nix', ['"Not if she likes her."']);
    c.show('Job', '*"I sweep floors," she says. "Not if she likes her." Nix says.*');
    // The paragraph holds Nix's words on the line: it's hers, and another's quote in it keeps the warm white.
    const block = game.querySelector<HTMLElement>('.jc-scripted')!;
    expect([...block.querySelectorAll('.jc-t-quote')].map((q) => q.textContent)).toEqual(['“I sweep floors,”']);
    expect(block.querySelector('.jc-t-say')!.textContent).toBe('“Not if she likes her.”');
  });
});
