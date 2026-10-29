import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { Feed } from '../src/ui/feed';
import { controlRow, latestActions, type ControlAction } from '../src/ui/message-controls';

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage {
  return { role: 'agent', text: 'x', toolLines: [], ts: 0, status: 'ok', ...over };
}

let feeds: Feed[] = [];
afterEach(() => {
  for (const f of feeds) f.dispose();
  feeds = [];
});

function setup(messages: ChatMessage[]) {
  document.body.innerHTML = '<textarea id="prompt"></textarea>';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const actions: ControlAction[] = [];
  const feed = new Feed(root, vi.fn(), () => ({ content: 20, available: 400, lineHeight: 20 }), { stage: true, onControl: (a) => actions.push(a) });
  feeds.push(feed);
  feed.setHistory(messages);
  return { root, feed, actions };
}
const node = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
/** In the box the latest line's options are the line stack (spec 2026-10-16 subtitle chat box §5); in the archive each line has its row. */
const inBox = (root: HTMLElement) => !root.classList.contains('expanded');
const stackKeys = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.line-keys button.key')];
const lineButtons = (root: HTMLElement, id: string) => (inBox(root) ? stackKeys(root) : [...node(root, id).querySelectorAll<HTMLButtonElement>('.controls button')]);
const buttons = (root: HTMLElement, id: string) => lineButtons(root, id).map((b) => b.textContent);
const click = (root: HTMLElement, id: string, label: string) =>
  [...lineButtons(root, id), ...node(root, id).querySelectorAll<HTMLButtonElement>('.takes button')].find((b) => b.textContent === label)!.click();
const story = () => [msg({ id: 'u1', role: 'user', text: 'hi' }), msg({ id: 'a1', text: 'hello', replyTo: 'u1' }), msg({ id: 'u2', role: 'user', text: 'and?' }), msg({ id: 'a2', text: 'take 2', replyTo: 'u2', takes: { index: 1, count: 3 } })];

describe('message controls in the box', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it("the box's foot holds her tool lines, not controls: those are the line stack", () => {
    const { root } = setup([msg({ id: 'a1', text: 'hello', toolLines: ['// NOTED'] })]);
    const foot = node(root, 'a1').querySelector('.foot')!;
    expect(foot.querySelector('.tools')!.textContent).toBe('// NOTED');
    expect(root.querySelector('.controls')).toBeNull();
    expect(root.querySelectorAll('.line-keys')).toHaveLength(1);
    expect(root.querySelector<HTMLElement>('.line-keys')!.hidden).toBe(false);
  });

  it('her latest line shows the swipe arrows and the action row; older lines show none', () => {
    const { root } = setup(story());
    expect(buttons(root, 'a2')).toEqual(['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']);
    expect(node(root, 'a2').querySelector('.meta .takes')!.textContent).toContain('2/3');
    expect(root.querySelector('.controls')).toBeNull();
    expect(node(root, 'a1').querySelector('.takes')).toBeNull();
  });

  it('▸ and ◂ swipe; ◂ is disabled on the first take', () => {
    const { root, feed, actions } = setup(story());
    click(root, 'a2', '▸');
    click(root, 'a2', '◂');
    expect(actions).toEqual([{ kind: 'swipe', id: 'a2', index: 2 }, { kind: 'swipe', id: 'a2', index: 0 }]);
    feed.upsert(msg({ id: 'a2', text: 'take 1', replyTo: 'u2', takes: { index: 0, count: 3 } }));
    const prev = [...node(root, 'a2').querySelectorAll<HTMLButtonElement>('.takes button')].find((b) => b.textContent === '◂')!;
    expect(prev.disabled).toBe(true);
  });

  it("when the story ends on the player's line it offers REGENERATE · EDIT · DELETE", () => {
    const { root, actions } = setup([msg({ id: 'u1', role: 'user', text: 'hi' })]);
    expect(buttons(root, 'u1')).toEqual(['REGENERATE', 'EDIT', 'DELETE', 'BRANCH HERE']);
    click(root, 'u1', 'REGENERATE');
    expect(actions).toEqual([{ kind: 'regenerate', id: 'u1' }]);
  });

  it('KEEP GOING and REGENERATE send their actions', () => {
    const { root, actions } = setup(story());
    click(root, 'a2', 'KEEP GOING');
    click(root, 'a2', 'REGENERATE');
    expect(actions).toEqual([{ kind: 'continue', id: 'a2' }, { kind: 'regenerate', id: 'a2' }]);
  });

  it('while she replies every control is disabled (Review Focus 5)', () => {
    const { root, feed } = setup(story());
    feed.setBusy(true);
    expect([...stackKeys(root), ...node(root, 'a2').querySelectorAll<HTMLButtonElement>('.takes button')].every((b) => b.disabled)).toBe(true);
    feed.setBusy(false);
    expect(stackKeys(root).every((b) => !b.disabled)).toBe(true);
  });
});

describe('edit, delete, rewind', () => {
  it('EDIT opens the line in place: Enter saves, Esc cancels, empty is refused', () => {
    const { root, actions } = setup(story());
    click(root, 'a2', 'EDIT');
    const box = node(root, 'a2').querySelector<HTMLTextAreaElement>('textarea.edit-box')!;
    expect(box.value).toBe('take 2');
    box.value = '   ';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(node(root, 'a2').querySelector('.edit-error')!.textContent).toContain("can't be empty");
    box.value = 'take 2, fixed';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(actions).toEqual([{ kind: 'edit', id: 'a2', text: 'take 2, fixed' }]);

    click(root, 'a2', 'EDIT');
    const again = node(root, 'a2').querySelector<HTMLTextAreaElement>('textarea.edit-box')!;
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(node(root, 'a2').querySelector('textarea.edit-box')).toBeNull();
    expect(actions).toHaveLength(1);
  });

  it('the line stack hides while a line is edited, and comes back after Esc or a save (Review Focus 4)', () => {
    const { root, actions } = setup(story());
    const stack = root.querySelector<HTMLElement>('.line-keys')!;
    click(root, 'a2', 'EDIT');
    expect(stack.hidden).toBe(true);
    node(root, 'a2').querySelector<HTMLTextAreaElement>('textarea.edit-box')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(stack.hidden).toBe(false);
    expect(buttons(root, 'a2')).toEqual(['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']);
    click(root, 'a2', 'EDIT');
    const box = node(root, 'a2').querySelector<HTMLTextAreaElement>('textarea.edit-box')!;
    box.value = 'take 2, fixed';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(actions).toEqual([{ kind: 'edit', id: 'a2', text: 'take 2, fixed' }]);
    expect(stack.hidden).toBe(false);
  });

  it('editing an older line in the archive leaves the latest line its stack once the archive closes (Task 4 review)', () => {
    const { root, feed } = setup(story());
    feed.expand();
    click(root, 'a1', 'EDIT');
    expect(node(root, 'a1').querySelector('textarea.edit-box')).not.toBeNull();
    feed.collapse();
    const stack = root.querySelector<HTMLElement>('.line-keys')!;
    expect(stack.hidden).toBe(false);
    expect(buttons(root, 'a2')).toEqual(['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']);
  });

  it('the archive hides the line stack and gives every line its row', () => {
    const { root, feed } = setup(story());
    feed.expand();
    expect(root.querySelector<HTMLElement>('.line-keys')!.hidden).toBe(true);
    expect(node(root, 'a1').querySelector('.controls')).not.toBeNull();
    feed.collapse();
    expect(root.querySelector<HTMLElement>('.line-keys')!.hidden).toBe(false);
  });

  it('DELETE sends the action; the archive offers EDIT · DELETE · REWIND HERE, and rewind asks first', () => {
    const { root, feed, actions } = setup(story());
    click(root, 'a2', 'DELETE');
    expect(actions).toEqual([{ kind: 'delete', id: 'a2' }]);
    feed.expand();
    expect(buttons(root, 'a1')).toEqual(['EDIT', 'DELETE', 'REWIND HERE', 'BRANCH HERE']);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    click(root, 'a1', 'REWIND HERE');
    click(root, 'a1', 'REWIND HERE');
    expect(confirm).toHaveBeenCalledWith('Rewind to here? Every line after it is deleted. A checkpoint is saved first.');
    expect(actions.at(-1)).toEqual({ kind: 'rewind', id: 'a1' });
    expect(actions.filter((a) => a.kind === 'rewind')).toHaveLength(1);
    confirm.mockRestore();
  });

  it('BRANCH HERE confirms with BRANCH_CONFIRM, on the latest line and in the archive; a declined confirm sends nothing', () => {
    const { root, feed, actions } = setup(story());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    click(root, 'a2', 'BRANCH HERE');
    expect(actions).toEqual([]);
    expect(confirm).toHaveBeenCalledWith('Branch from here? A new playthrough starts at this line. This one stays in LOAD.');
    click(root, 'a2', 'BRANCH HERE');
    feed.expand();
    click(root, 'u1', 'BRANCH HERE');
    expect(actions).toEqual([
      { kind: 'branch', id: 'a2' },
      { kind: 'branch', id: 'u1' },
    ]);
    confirm.mockRestore();
  });

  it('an undone delete returns to its place in time, not the bottom (I1)', () => {
    const lines = [msg({ id: 'u1', role: 'user', ts: 1 }), msg({ id: 'a1', ts: 2 }), msg({ id: 'u2', role: 'user', ts: 3 }), msg({ id: 'a2', ts: 4 })];
    const { root, feed } = setup(lines);
    feed.remove(['a1']);
    feed.upsert(lines[1]);
    expect([...root.querySelectorAll<HTMLElement>('.msg')].map((n) => n.dataset.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(buttons(root, 'a2')).toEqual(['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']);
  });

  it('remove(ids) drops lines; a notice can offer UNDO', () => {
    const { root, feed } = setup(story());
    feed.remove(['a2', 'u2']);
    expect(node(root, 'a2')).toBeNull();
    expect(node(root, 'u2')).toBeNull();
    const undo = vi.fn();
    feed.showNotice('// LINE DELETED', { label: 'UNDO', run: undo });
    (root.querySelector('.feed-notice button') as HTMLElement).click();
    expect(undo).toHaveBeenCalled();
    expect(root.querySelector('.feed-notice')).toBeNull();
  });

  it('a polite notice never covers one already showing (the quest notice and // BRANCHED)', () => {
    const { feed, root } = setup(story());
    feed.showNotice('// BRANCHED — X');
    expect(feed.showNotice('◆ PAPER TRAIL CAN START HERE', undefined, { polite: true })).toBe(false);
    expect(root.querySelector('.feed-notice')!.textContent).toBe('// BRANCHED — X');
  });
});

describe('keys', () => {
  const press = (key: string, opts: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));

  it('← / → swipe and Alt+R / Alt+C act on her latest line when the prompt is empty', () => {
    const { actions } = setup(story());
    (document.getElementById('prompt') as HTMLTextAreaElement).focus();
    press('ArrowRight');
    press('ArrowLeft');
    press('r', { altKey: true });
    press('c', { altKey: true });
    expect(actions).toEqual([
      { kind: 'swipe', id: 'a2', index: 2 },
      { kind: 'swipe', id: 'a2', index: 0 },
      { kind: 'regenerate', id: 'a2' },
      { kind: 'continue', id: 'a2' },
    ]);
  });

  it('nothing happens while typing', () => {
    const { actions } = setup(story());
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement;
    prompt.value = 'typing';
    prompt.focus();
    press('ArrowLeft');
    press('r', { altKey: true });
    expect(actions).toEqual([]);
  });
});

describe('paging a new take (I5)', () => {
  it('a long new take of a reply you already paged through pages again', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    let feed!: Feed;
    // Content grows with the text, so a long reply needs paging in a 100 px box.
    const measure = (id: string) => ({ content: (feed.get(id)?.text.length ?? 0) * 2, available: 100, lineHeight: 20 });
    feed = new Feed(root, vi.fn(), measure, { stage: true, onControl: () => {} });
    feeds.push(feed);
    const long = 'x'.repeat(300);
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'go', ts: 1 }), msg({ id: 'a1', text: long, ts: 2, replyTo: 'u1' })]);
    expect(root.querySelector('button.continue')).not.toBeNull();
    // Regenerate: the reply empties while the new take starts (the box falls back to the player's line)…
    feed.upsert(msg({ id: 'a1', text: '', status: 'streaming', ts: 2, replyTo: 'u1' }));
    // …then the new take streams in, just as long.
    feed.delta('a1', long);
    expect(root.querySelector('button.continue')).not.toBeNull();
  });

  it('KEEP GOING on a reply you finished paging pages the longer reply again', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    let feed!: Feed;
    const measure = (id: string) => ({ content: (feed.get(id)?.text.length ?? 0) * 2, available: 100, lineHeight: 20 });
    feed = new Feed(root, vi.fn(), measure, { stage: true, onControl: () => {} });
    feeds.push(feed);
    feed.setHistory([msg({ id: 'u1', role: 'user', text: 'go', ts: 1 }), msg({ id: 'a1', text: 'x'.repeat(300), ts: 2, replyTo: 'u1' })]);
    for (let i = 0; i < 20 && root.querySelector('button.continue'); i++) feed.advance();
    expect(root.querySelector('button.continue')).toBeNull();
    feed.upsert(msg({ id: 'a1', text: 'x'.repeat(300), status: 'streaming', ts: 2, replyTo: 'u1' }));
    feed.delta('a1', ' and more'.repeat(20));
    expect(root.querySelector('button.continue')).not.toBeNull();
  });
});

describe('model tags', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const withModels = () => [
    msg({ id: 'u1', role: 'user', text: 'hi' }),
    msg({ id: 'a1', text: 'hello', replyTo: 'u1', model: 'deepseek/deepseek-v3.2' }),
    msg({ id: 'u2', role: 'user', text: 'and?' }),
    msg({ id: 'a2', text: 'take 2', replyTo: 'u2', takes: { index: 1, count: 2 }, model: 'z-ai/glm-5.2' }),
  ];

  it('the box shows the model label beside the take counter', () => {
    const { root } = setup(withModels());
    const meta = node(root, 'a2').querySelector('.meta')!;
    expect(meta.querySelector('.model-tag')!.textContent).toBe('glm-5.2');
    expect(meta.querySelector('.takes')).not.toBeNull();
  });

  it('an agent line with a model shows its label in the archive; lines without one show none', () => {
    const { root, feed } = setup([...withModels(), msg({ id: 'u3', role: 'user', text: 'x' }), msg({ id: 'a3', text: 'no model', replyTo: 'u3' })]);
    feed.expand();
    expect(node(root, 'a1').querySelector('.model-tag')!.textContent).toBe('deepseek-v3.2');
    expect(node(root, 'a3').querySelector('.model-tag')).toBeNull();
    expect(node(root, 'u1').querySelector('.model-tag')).toBeNull();
  });

  it('uses the labels the page knows', () => {
    const { root, feed } = setup(withModels());
    feed.setModelLabels(new Map([['z-ai/glm-5.2', 'GLM 5.2']]));
    expect(node(root, 'a2').querySelector('.model-tag')!.textContent).toBe('GLM 5.2');
  });
});

describe('message controls on a move (travel line)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const move = msg({ id: 't1', role: 'user', mode: 'travel', text: "*Hicks and Nix head to Hae's Noodles.*" });

  it('as the latest line: REGENERATE and DELETE, no EDIT (the line is the server’s)', () => {
    const { root } = setup([move]);
    expect(buttons(root, 't1')).toEqual(['REGENERATE', 'DELETE', 'BRANCH HERE']);
  });

  it('in the archive: DELETE and REWIND HERE, no EDIT', () => {
    const { root, feed } = setup([move, msg({ id: 'a1', text: 'Two, no greens.', replyTo: 't1', mode: 'travel' })]);
    feed.expand();
    expect(buttons(root, 't1')).toEqual(['DELETE', 'REWIND HERE', 'BRANCH HERE']);
  });
});

describe('message controls on a gig run', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'B', result: 'clean' as const, trace: 8, max: 14 };
  const run = msg({ id: 'g1', role: 'user', mode: 'gig', text: '*Hicks jacks in.*', gig });

  it('as the latest line: REGENERATE and DELETE, no EDIT', () => {
    const { root } = setup([run]);
    expect(buttons(root, 'g1')).toEqual(['REGENERATE', 'DELETE', 'BRANCH HERE']);
  });

  it('in the archive: DELETE and REWIND HERE, no EDIT', () => {
    const { root, feed } = setup([run, msg({ id: 'a1', text: 'Clean.', replyTo: 'g1', mode: 'gig' })]);
    feed.expand();
    expect(buttons(root, 'g1')).toEqual(['DELETE', 'REWIND HERE', 'BRANCH HERE']);
  });
});

describe('message controls on a dice game', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const dice = { you: 'Hicks', her: 'Cass', stake: 'a drink', result: 'won' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 4, her: 5 } }], lines: [null] };
  const game = msg({ id: 'd1', role: 'user', mode: 'dice', text: '*Hicks plays.*', dice });

  it('as the latest line: REGENERATE and DELETE, no EDIT', () => {
    const { root } = setup([game]);
    expect(buttons(root, 'd1')).toEqual(['REGENERATE', 'DELETE', 'BRANCH HERE']);
  });
});


describe('latestActions (one list for the box row and the line stack)', () => {
  const noop = () => {};
  const labels = (m: ChatMessage) => latestActions(m, noop, noop).map((a) => a.label);
  const rowLabels = (m: ChatMessage) => [...controlRow(m, 'latest', false, noop, noop).querySelectorAll('button')].map((b) => b.textContent);

  it('her line, the player’s line, and the server’s lines get the keys they get today', () => {
    const cases: [ChatMessage, string[]][] = [
      [msg({ id: 'a', takes: { index: 0, count: 2 } }), ['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']],
      [msg({ id: 'u', role: 'user' }), ['REGENERATE', 'EDIT', 'DELETE', 'BRANCH HERE']],
      [msg({ id: 't', role: 'user', mode: 'travel' }), ['REGENERATE', 'DELETE', 'BRANCH HERE']],
      [msg({ id: 'g', role: 'user', mode: 'gig' }), ['REGENERATE', 'DELETE', 'BRANCH HERE']],
      [msg({ id: 'd', role: 'user', mode: 'dice' }), ['REGENERATE', 'DELETE', 'BRANCH HERE']],
    ];
    for (const [m, want] of cases) {
      expect(labels(m)).toEqual(want);
      expect(rowLabels(m)).toEqual(want);
    }
  });

  it('each action carries its glyph id and runs its control', () => {
    const acts: ControlAction[] = [];
    const list = latestActions(msg({ id: 'a' }), (a) => acts.push(a), noop);
    expect(list.map((a) => a.id)).toEqual(['regenerate', 'continue', 'edit', 'delete', 'branch']);
    list[0].run();
    list[1].run();
    list[3].run();
    expect(acts).toEqual([{ kind: 'regenerate', id: 'a' }, { kind: 'continue', id: 'a' }, { kind: 'delete', id: 'a' }]);
  });
});
