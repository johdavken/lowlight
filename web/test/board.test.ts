import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardEnding, boardRefusesKey, mountBoard, sceneChanges } from '../src/room/board/board';
import { mountJobColumn } from '../src/room/job-column';
import { costEl, costTerms, priced } from '../src/room/board/panels';
import { setGraftCue } from '../src/room/table/el';
import type { CrewJobView, Debrief, QuestState, SetupOffer } from '../../shared/types';

// The board (crew rules spec 2026-11-17, mockup crew-board.html): a crew-rules run on the whole stage, the hand of
// printed cards, the beat's cards as panels showing the picked card's way there, the contact on a comms strip.
type Active = NonNullable<QuestState['active']>;
type Hand = CrewJobView['hand'][number];
type Way = CrewJobView['cards'][number]['ways'][number];

const way = (by: string, line: string, o: Partial<Way> = {}): Way => ({ by, line, take: 0, alarm: 0, heat: 0, clocks: {}, cut: 0, lose: 0, ...o });
const YOU: Hand = { id: 'you', kind: 'you', name: 'Hicks', art: '/contacts/hicks.webp', state: 'ready' };
const KIT: Hand = { id: 'kit', kind: 'recruit', name: 'Kit Moreau', spec: 'runner', grade: 2, art: null, state: 'ready', move: { id: 'loop-the-cams', name: 'LOOP THE CAMS', line: 'No HEAT lands on this beat.', art: '/abilities/loop-the-cams.webp', can: true } };
const NOOR: Hand = { id: 'noor', kind: 'recruit', name: 'Noor Hale', spec: 'face', grade: 1, art: '/api/extras/crew-face-01.png', state: 'ready', move: { id: 'cover-story', name: 'COVER STORY', line: 'No ALARM lands on this beat.', art: '/abilities/cover-story.webp', can: true } };
const WALL: Hand = { id: 'p:firewall', kind: 'program', name: 'FIREWALL', art: null, state: 'ready', play: { line: 'One ALARM on this beat does not land.', can: true } };
const RUE: Hand = { id: 'contact', kind: 'contact', name: 'Rue', art: '/contacts/rue.webp', state: 'ready' };

const CREW: CrewJobView = {
  clocks: [{ id: 'hears', label: 'WHAT RUE HEARS', size: 3, value: 1 }],
  hand: [YOU, KIT, NOOR, WALL, RUE],
  cards: [
    {
      id: 'read',
      short: 'HIS LOG-IN',
      line: 'Get his log-in off the glass while you sign.',
      ways: [way('you', 'You get the nine characters.', { take: 1, alarm: 1 }), way('kit', 'Kit lifts his whole session.', { take: 2, heat: 1 }), way('contact', 'Ask her to read it for you.', { take: 1, cut: 20 })],
      throws: ['noor'],
    },
    {
      id: 'palm',
      short: 'THE PASS',
      line: 'Lift the fourth-floor pass off the board as he turns.',
      ways: [way('you', 'Hunt and peck, the way a scheduler would.', { name: 'scheduler', take: 1, alarm: 1 }), way('you', 'Go through it the way they taught you.', { name: 'branch', take: 2, clocks: { hears: 1 } }), way('noor', 'Noor asks him for a map.', { take: 1 })],
      throws: ['kit'],
    },
  ],
  mods: [],
  ahead: { floor: ['Noor'], closet: ['Kit'] },
  contact: { id: 'ember', name: 'Ember' },
};
const ROUTE = { ways: [{ via: null, beats: [{ id: 'lobby', title: 'THE LOBBY' }, { id: 'desk', title: 'THE DESK' }, { id: 'floor', title: 'THE FLOOR' }, { id: 'closet', title: 'THE CLOSET' }] }], played: ['lobby'] };
const A: Active = { id: 'night-clerk', title: 'Night Clerk', beat: 'desk', tier: 2, route: ROUTE, choices: [{ id: 'read', line: 'Get his log-in.' }, { id: 'palm', line: 'Lift the pass.' }], alarm: 0, take: { filled: 1, size: 4 }, heat: 0, pay: [360, 440], crew: CREW };
const state = (a: Active | null): QuestState => ({ open: [], active: a, changed: null, waiting: null, elsewhere: [] });
const EMBER = { contact: { id: 'ember', name: 'Ember', comms: '/characters/ember/ember-comms.png' } };

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = (sel: string) => q(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const panel = (id: string) => q(`.bw-panel[data-card="${id}"]`);

const mount = (reduced = true) => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const o = { onSend: vi.fn(), onMove: vi.fn(), onPick: vi.fn(), onGoIn: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), tierCue: vi.fn(), cue: vi.fn(), reduced: () => reduced };
  const b = mountBoard(g, o);
  return { b, o, g };
};

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('the board (crew rules)', () => {
  it('without a crew run it is down and hidden', () => {
    const { b, g } = mount();
    b.update(state({ ...A, crew: undefined }), EMBER);
    expect(b.up()).toBe(false);
    expect(q('.tb-crew').hidden).toBe(true);
    expect(g.classList.contains('crew-board')).toBe(false);
    b.update(state(null), EMBER);
    expect(b.up()).toBe(false);
  });

  it('with a crew run it is up, and hides the room chrome', () => {
    const { b, g } = mount();
    b.update(state(A), EMBER);
    expect(b.up()).toBe(true);
    expect(q('.tb-crew').hidden).toBe(false);
    expect(g.classList.contains('crew-board')).toBe(true);
    b.update(state(null), EMBER);
    expect(b.up()).toBe(false);
    expect(g.classList.contains('crew-board')).toBe(false);
  });

  it('draws one hand card per hand entry but the contact, in order, you first, programs as programs', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    const cards = qa('.bw-hand [data-hand]');
    expect(cards.map((c) => c.dataset.hand)).toEqual(['you', 'kit', 'noor', 'p:firewall']);
    expect(cards[0].classList.contains('you')).toBe(true);
    expect(cards[3].classList.contains('program')).toBe(true);
    expect(cards.slice(0, 3).some((c) => c.classList.contains('program'))).toBe(false);
    expect(q('.bw-hand [data-hand="contact"]')).toBeNull();
    expect(cards[1].textContent).toContain('KIT');
  });

  it("offers the contact's way from her comms strip, and a click sends it as hers", () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    const offers = qa('.bw-comms .bw-offer');
    expect(offers.map((x) => x.dataset.card)).toEqual(['read']);
    expect(offers[0].textContent).toContain('HIS LOG-IN');
    click('.bw-comms .bw-offer');
    expect(o.onSend).toHaveBeenCalledWith('read', 'contact');
  });

  it('the strip reads ON COMMS away from her, WITH YOU where she is, and is gone with no contact', () => {
    const { b } = mount();
    b.update(state({ ...A, room: 'velvet/under-the-cat' }), EMBER);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · ON COMMS');
    b.update(state({ ...A, room: 'velvet/under-the-cat', here: true }), EMBER);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · WITH YOU');
    b.update(state({ ...A, comms: true }), EMBER);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · ON COMMS');
    b.update(state(A), EMBER);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · WITH YOU');
    expect(q<HTMLImageElement>('.bw-comms .bw-pic img').getAttribute('src')).toBe('/characters/ember/ember-comms.png');
  });

  it('a job with no contact has no strip, even played in a contact\'s room', () => {
    const { b } = mount();
    const { contact: _none, ...noContact } = CREW;
    b.update(state({ ...A, crew: { ...noContact, hand: [YOU, KIT, NOOR, WALL], cards: CREW.cards.map((c) => ({ ...c, ways: c.ways.filter((w) => w.by !== 'contact') })) } }), EMBER);
    expect(q('.bw-comms').hidden).toBe(true);
    expect(panel('read').querySelector('.bw-who')!.textContent).toBe('CAN DO IT · YOU · KIT');
  });

  it("a job's contact with no way anywhere still has her strip, with nothing to offer; another room's contact gives her no portrait", () => {
    const { b } = mount();
    b.update(state({ ...A, crew: { ...CREW, hand: [YOU, KIT, NOOR, WALL], cards: CREW.cards.map((c) => ({ ...c, ways: c.ways.filter((w) => w.by !== 'contact') })) } }), { contact: { id: 'rue', name: 'Rue', comms: '/characters/rue/rue-comms.png' } });
    expect(q('.bw-comms').hidden).toBe(false);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · WITH YOU');
    expect(qa('.bw-comms .bw-offer')).toHaveLength(0);
    expect(q<HTMLImageElement>('.bw-comms .bw-pic img').getAttribute('src')).toBe('/api/agents/ember/sprite');
  });

  it('with no room contact at all her strip still shows, on her sprite', () => {
    const { b } = mount();
    b.update(state(A), { contact: null });
    expect(q('.bw-comms').hidden).toBe(false);
    expect(q('.bw-comms .bw-cwho').textContent).toBe('EMBER · WITH YOU');
  });

  it("her portrait falls back to her neutral sprite, then to her initial, never a broken image", () => {
    const { b } = mount();
    b.update(state(A), { contact: { id: 'ember', name: 'Ember', comms: null } });
    const img = q<HTMLImageElement>('.bw-comms .bw-pic img');
    expect(img.getAttribute('src')).toBe('/api/agents/ember/sprite');
    img.dispatchEvent(new Event('error'));
    expect(q('.bw-comms .bw-pic img')).toBeNull();
    expect(q('.bw-comms .bw-pic').textContent).toBe('E');
  });

  it('a card with no art shows a monogram, and art that fails to load turns into one', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(q('[data-hand="kit"] .bw-mono').textContent).toBe('K');
    const you = q<HTMLImageElement>('[data-hand="you"] img.bw-face');
    you.dispatchEvent(new Event('error'));
    expect(q('[data-hand="you"] img.bw-face')).toBeNull();
    expect(q('[data-hand="you"] .bw-mono').textContent).toBe('H');
  });

  it("a recruit whose move can play has its card tucked behind theirs; a spent recruit has none and says so", () => {
    const { b } = mount();
    const spent: CrewJobView = { ...CREW, hand: [YOU, { ...KIT, state: 'spent', move: { ...KIT.move!, can: false } }, { ...NOOR, state: 'hurt', move: { ...NOOR.move!, can: false } }, WALL, RUE], cards: CREW.cards.map((c) => ({ ...c, ways: c.ways.filter((w) => w.by === 'you' || w.by === 'contact'), throws: [] })) };
    b.update(state(A), EMBER);
    expect(qa('.bw-hand .bw-ab').map((x) => x.dataset.move)).toEqual(['kit', 'noor']);
    expect(q('.bw-ab[data-move="kit"]').textContent).toContain('LOOP THE CAMS');
    b.update(state({ ...A, crew: spent }), EMBER);
    expect(qa('.bw-hand .bw-ab')).toHaveLength(0);
    expect(q('[data-hand="kit"]').classList.contains('spent')).toBe(true);
    expect(q('[data-hand="kit"] .bw-st').textContent).toBe('SPENT');
    expect(q('[data-hand="noor"] .bw-st').textContent).toBe('HURT');
  });

  it('a recruit at the door reads AT THE DOOR', () => {
    const { b } = mount();
    b.update(state({ ...A, crew: { ...CREW, hand: [YOU, { ...KIT, state: 'door' }, RUE] } }), EMBER);
    expect(q('[data-hand="kit"] .bw-st').textContent).toBe('AT THE DOOR');
  });

  it('clicking a move card plays that recruit\'s move', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('.bw-ab[data-move="noor"]');
    expect(o.onMove).toHaveBeenCalledWith('noor');
    expect(o.cue).toHaveBeenCalledWith('ability');
  });

  it('with nobody picked a panel lists the names of who has a way there', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(panel('read').querySelector('.bw-who')!.textContent).toBe('CAN DO IT · YOU · KIT · EMBER');
    expect(panel('palm').querySelector('.bw-who')!.textContent).toBe('CAN DO IT · YOU · NOOR');
    expect(panel('read').querySelector('.bw-way')).toBeNull();
  });

  it('clicking a hand card then a panel sends that card there', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    expect(q('[data-hand="kit"]').classList.contains('sel')).toBe(true);
    const rows = panel('read').querySelectorAll<HTMLElement>('.bw-way');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('TAKE +2');
    expect(rows[0].textContent).toContain('HEAT +1');
    expect(rows[0].textContent).toContain('Kit lifts his whole session.');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledWith('read', 'kit');
    expect(o.cue).toHaveBeenCalledWith('deal');
  });

  it("a way whose outcome leaves you nothing prints it as a cost: TAKE → 0, or TAKE → PART; never NOTHING", () => {
    const { b } = mount();
    const leaving: CrewJobView = { ...CREW, cards: CREW.cards.map((c, i) => ({ ...c, ways: c.ways.map((w) => (w.by === 'you' ? { ...w, take: 0, alarm: 0, heat: 0, clocks: {}, cut: 0, lose: 0, leaves: i === 0 ? ('none' as const) : ('part' as const) } : w)) })) };
    b.update(state({ ...A, crew: leaving }), EMBER);
    click('[data-hand="you"]');
    const none = panel(CREW.cards[0].id).querySelector<HTMLElement>('.bw-way')!;
    expect(none.querySelector('.bw-fx')!.textContent).toBe('TAKE → 0');
    expect(none.querySelector('.c-leaves')).not.toBeNull();
    const part = panel(CREW.cards[1].id).querySelector<HTMLElement>('.bw-way')!;
    expect(part.querySelector('.bw-fx')!.textContent).toBe('TAKE → PART');
    expect(document.body.textContent).not.toContain('NOTHING');
  });

  it('a way whose lose empties the TAKE it ends the job with prints TAKE → 0 alone, not TAKE −1 beside it', () => {
    const { b } = mount();
    const emptying: CrewJobView = { ...CREW, cards: CREW.cards.map((c, i) => ({ ...c, ways: c.ways.map((w) => (w.by === 'you' ? { ...w, take: 0, alarm: 0, heat: 1, clocks: {}, cut: 0, lose: 1, ...(i === 0 ? { leaves: 'none' as const } : {}) } : w)) })) };
    b.update(state({ ...A, crew: emptying }), EMBER);
    click('[data-hand="you"]');
    expect(panel(CREW.cards[0].id).querySelector<HTMLElement>('.bw-way .bw-fx')!.textContent).toBe('HEAT +1 · TAKE → 0');
    expect(panel(CREW.cards[1].id).querySelector<HTMLElement>('.bw-way .bw-fx')!.textContent).toBe('HEAT +1 · TAKE −1');
  });

  it("a way whose TAKE can't land (the view caps it) prints no TAKE term, only what it costs (last pass A2)", () => {
    const { b } = mount();
    const full: CrewJobView = { ...CREW, cards: CREW.cards.map((c) => ({ ...c, ways: c.ways.map((w) => ({ ...w, take: 0 })) })) };
    b.update(state({ ...A, take: { filled: 4, size: 4 }, crew: full }), EMBER);
    click('[data-hand="kit"]');
    const row = panel('read').querySelector<HTMLElement>('.bw-way')!;
    expect(row.querySelector('.bw-fx')!.textContent).toBe('HEAT +1');
    expect(row.querySelector('.c-take')).toBeNull();
  });

  it('a card with two of your ways shows both, each sending as you:<name>', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="you"]');
    const rows = [...panel('palm').querySelectorAll<HTMLElement>('.bw-way')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('ALARM +1');
    expect(rows[1].textContent).toContain('WHAT RUE HEARS +1');
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(o.onSend).toHaveBeenCalledWith('palm', 'you:branch');
  });

  it('a second you way goes out under its own name too', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="you"]');
    panel('palm').querySelectorAll<HTMLElement>('.bw-way')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(o.onSend).toHaveBeenCalledWith('palm', 'you:scheduler');
  });

  it("a recruit with no way there shows the throw's terms, and can still be sent", () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="noor"]');
    const t = panel('read').querySelector('.bw-throw')!;
    expect(t.textContent).toContain('NOT THEIR TRADE.');
    expect(t.textContent).toContain("A throw: 4 or more and they do it your way. Less, and it's ALARM +2 and they come back hurt.");
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledWith('read', 'noor');
  });

  it('a plain card is picked on a click, nobody needed', () => {
    const { b, o } = mount();
    const plain: CrewJobView = { ...CREW, cards: [{ id: 'home', short: 'HOME', line: 'Go home.', plain: true, ways: [], throws: [] }] };
    b.update(state({ ...A, crew: plain }), EMBER);
    click('.bw-panel[data-card="home"]');
    expect(o.onPick).toHaveBeenCalledWith('home');
    expect(o.onSend).not.toHaveBeenCalled();
  });

  it('a crack card is picked on a click too (the word terminal opens from the pick)', () => {
    const { b, o } = mount();
    const crack: CrewJobView = { ...CREW, cards: [{ id: 'lock', short: 'THE LOCK', line: 'Crack it.', crack: true, ways: [], throws: [] }] };
    b.update(state({ ...A, crew: crack }), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="lock"]');
    expect(o.onPick).toHaveBeenCalledWith('lock');
  });

  it('with every hand card but you spent, each panel still offers a way and a click sends it (Review Focus 3)', () => {
    vi.useFakeTimers();
    const { b, o } = mount();
    const alone: CrewJobView = {
      ...CREW,
      hand: [YOU, { ...KIT, state: 'spent', move: { ...KIT.move!, can: false } }, { ...NOOR, state: 'held', move: { ...NOOR.move!, can: false } }, { ...WALL, state: 'spent', play: { ...WALL.play!, can: false } }, { ...RUE, state: 'spent' }],
      cards: CREW.cards.map((c) => ({ ...c, ways: c.ways.filter((w) => w.by === 'you'), throws: [] })),
    };
    b.update(state({ ...A, crew: alone }), EMBER);
    expect(qa('.bw-comms .bw-offer')).toHaveLength(0);
    // You alone can be sent: you're picked for each beat.
    expect(q('[data-hand="you"]').classList.contains('sel')).toBe(true);
    for (const id of ['read', 'palm']) {
      const rows = panel(id).querySelectorAll<HTMLElement>('.bw-way');
      expect(rows.length).toBeGreaterThan(0);
      rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // A send locks the board until the run answers: the next beat (here, the same view again) frees it.
      b.update(state({ ...A, beat: `${id}-next`, crew: alone }), EMBER);
      vi.advanceTimersByTime(2000);
      b.update(state({ ...A, crew: alone }), EMBER);
    }
    expect(o.onSend.mock.calls.map((c) => c[0])).toEqual(['read', 'palm']);
  });

  it('never ranks ways: every way row carries the same classes but its owner kind, in the order the view gives', () => {
    const { b } = mount();
    const many: CrewJobView = { ...CREW, cards: [{ id: 'read', short: 'X', line: 'x', ways: [way('you', 'a', { name: 'one', take: 2 }), way('you', 'b', { name: 'two', alarm: 2, lose: 1 }), way('you', 'c', { name: 'three', heat: 1, cut: 10 }), way('you', 'd', { name: 'four', harm: 'hurt' })], throws: [] }] };
    b.update(state({ ...A, crew: many }), EMBER);
    click('[data-hand="you"]');
    const rows = [...panel('read').querySelectorAll<HTMLElement>('.bw-way')];
    expect(rows.map((r) => r.querySelector('.bw-t')!.textContent)).toEqual(['a', 'b', 'c', 'd']);
    const bare = rows.map((r) => [...r.classList].filter((c) => !c.startsWith('bw-by-')).sort().join(' '));
    expect(new Set(bare).size).toBe(1);
    for (const r of rows) expect([...r.attributes].map((x) => x.name).sort()).toEqual(['class', 'data-by', 'role', 'tabindex']);
    // Nothing on the panel or the hand speaks of best, good or bad.
    expect(document.querySelector('[class*="best"], [class*="good"], [class*="bad"], [class*="rank"]:not(.tbc-rank), [data-best], [data-rank]')).toBeNull();
  });

  it('draws TAKE, ALARM and each job clock, by its label', () => {
    const { b } = mount();
    b.update(state({ ...A, alarm: 2 }), EMBER);
    const clocks = qa('.bw-clocks .bw-clk');
    expect(clocks.map((c) => c.dataset.clock)).toEqual(['take', 'alarm', 'hears']);
    expect(clocks.map((c) => c.querySelector('.bw-clk-label')!.textContent)).toEqual(['TAKE', 'ALARM', 'WHAT RUE HEARS']);
    expect(clocks.map((c) => c.querySelectorAll('i.on').length)).toEqual([1, 2, 1]);
    expect(clocks.map((c) => c.querySelectorAll('i').length)).toEqual([4, 4, 3]);
    // TAKE and ALARM say what they are on hover; a job clock with no note in its file says nothing.
    expect(clocks.map((c) => c.querySelector('.bw-clk-tip .hv-gist')?.textContent ?? null)).toEqual(['WHAT YOU CARRY OUT. THE PAY SCALES WITH IT', 'AT 4 THE JOB GOES TO THE GETAWAY', null]);
  });

  it("a job clock's note is its hover tip, headed by its label", () => {
    const { b } = mount();
    b.update(state({ ...A, crew: { ...CREW, clocks: [{ ...CREW.clocks[0], note: 'SHE HEARS THIS' }] } }), EMBER);
    const tip = q('.bw-clk[data-clock="hears"] .bw-clk-tip');
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect([tip.querySelector('.hv-head')!.textContent, tip.querySelector('.hv-gist')!.textContent]).toEqual(['WHAT RUE HEARS', 'SHE HEARS THIS']);
  });

  it('the route names who unspent has a way at each beat ahead', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(q('.bw-route [data-beat="floor"] .bw-ahead').textContent).toBe('NOOR');
    expect(q('.bw-route [data-beat="closet"] .bw-ahead').textContent).toBe('KIT');
  });

  it('the beat header shows the moves played on it', () => {
    const { b } = mount();
    b.update(state({ ...A, crew: { ...CREW, mods: [{ label: 'COVER STORY', art: '/abilities/cover-story.webp' }, { label: 'FIREWALL' }] } }), EMBER);
    expect(qa('.bw-mods .bw-mod').map((m) => m.textContent)).toEqual(['COVER STORY', 'FIREWALL']);
    expect(q<HTMLImageElement>('.bw-mods .bw-mod img').getAttribute('src')).toBe('/abilities/cover-story.webp');
  });

  it('a program that can play plays from its card when it has no way here', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="p:firewall"]');
    expect(o.onMove).toHaveBeenCalledWith('p:firewall');
    expect(o.cue).toHaveBeenCalledWith('firewall');
  });

  it('a program with a way here is picked like anyone, its play on a chip', () => {
    const { b, o } = mount();
    const prog: CrewJobView = { ...CREW, cards: [{ ...CREW.cards[0], ways: [...CREW.cards[0].ways, way('p:firewall', 'Let the deck do it.', { take: 2, clocks: { hears: 1 } })] }, CREW.cards[1]] };
    b.update(state({ ...A, crew: prog }), EMBER);
    click('[data-hand="p:firewall"]');
    expect(o.onMove).not.toHaveBeenCalled();
    expect(q('[data-hand="p:firewall"]').classList.contains('sel')).toBe(true);
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledWith('read', 'p:firewall');
  });

  it('while she is on the line nothing goes', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    b.hold('Ember');
    expect(q('.bw-held').textContent).toBe('EMBER ON THE LINE');
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    click('.bw-comms .bw-offer');
    expect(o.onSend).not.toHaveBeenCalled();
    b.hold(null);
    expect(q('.bw-held').hidden).toBe(true);
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledWith('read', 'kit');
  });

  it("her line shows beside her portrait", () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    b.say('His log-in opens the closet.');
    expect(q('.bw-comms .bw-say').textContent).toBe('His log-in opens the closet.');
  });

  it('her *actions* read in italics, without their asterisks', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    b.say('*taps the glass* Two minutes.');
    expect(q('.bw-comms .bw-say').textContent).toBe('taps the glass Two minutes.');
    expect(q('.bw-comms .bw-say em').textContent).toBe('taps the glass');
  });

  it("her line types in at the box settings' TEXT speed; INSTANT finishes it; a line that grows types on; the first stands whole", () => {
    vi.useFakeTimers();
    const { b } = mount(false);
    b.update(state(A), EMBER);
    const say = q('.bw-comms .bw-say');
    // The first line after the board comes up was already said (a reload): it stands whole.
    b.say('Old news.');
    expect(say.querySelector('.type-cursor, .unshown')).toBeNull();
    b.say('Two minutes.');
    // Laid out whole (the scroll holds still), the unshown part hidden behind a cursor.
    expect(say.textContent).toBe('Two minutes.');
    expect(say.querySelector('.type-cursor')).not.toBeNull();
    expect(say.querySelector('.unshown')).not.toBeNull();
    vi.advanceTimersByTime(5000);
    expect(say.querySelector('.type-cursor, .unshown')).toBeNull();
    // Slower is slower: at SLOW (2) the same length is still typing where NORMAL had finished.
    b.setTextSpeed(2);
    b.say('Three minutes now.');
    vi.advanceTimersByTime(16 * 18);
    expect(say.querySelector('.unshown')).not.toBeNull();
    b.setTextSpeed(0);
    expect(say.querySelector('.type-cursor, .unshown')).toBeNull();
    expect(say.textContent).toBe('Three minutes now.');
    // Streaming: the line grows, and only the new words type.
    b.setTextSpeed(1);
    b.say('Three minutes now. Go.');
    expect(say.querySelector('.unshown')?.textContent).toBe(' Go.');
    // A skip shows the rest.
    expect(b.finishTyping()).toBe(true);
    expect(say.querySelector('.unshown')).toBeNull();
    expect(b.finishTyping()).toBe(false);
  });

  it("DECODE shows the words ahead of her cursor as glyph noise; TYPE hides them", () => {
    vi.useFakeTimers();
    const { b } = mount(false);
    b.update(state(A), EMBER);
    b.say('Before.');
    b.setTextEffect('decode');
    b.say('His log-in opens the closet.');
    const say = q('.bw-comms .bw-say');
    expect(say.querySelector('.unshown.noise .nw[data-n]')).not.toBeNull();
    b.setTextEffect('type');
    expect(say.querySelector('.unshown.noise')).toBeNull();
    expect(say.querySelector('.unshown')).not.toBeNull();
  });

  it('reduced motion shows her new line whole', () => {
    const { b } = mount(true);
    b.update(state(A), EMBER);
    b.say('Before.');
    b.say('After.');
    expect(q('.bw-comms .bw-say').querySelector('.type-cursor, .unshown')).toBeNull();
  });

  it('her line reads TEXT SIZE and FONT as the page does, scaling as far down as it does (board.css)', () => {
    const css = readFileSync('web/src/room/board/board.css', 'utf8');
    const rule = css.match(/\n\.bw-say \{[^}]*--text-scale[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('font-family: var(--chat-font');
    expect(rule).toMatch(/font-size: calc\(15px \* var\(--text-scale, 1\)\)/);
  });

  it('a refused send is said on the board, which comes back at once', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledTimes(1);
    b.refuse('// FIREWALL IS ALREADY UP');
    expect(q('.bw-note').textContent).toBe('FIREWALL IS ALREADY UP');
    expect(q('.bw-note').hidden).toBe(false);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledTimes(2);
  });

  it('keys: ←→ step the hand, ↑↓ the panels, Enter sends, M plays the selected recruit\'s move', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    expect(b.key('ArrowRight')).toBe(true);
    expect(q('[data-hand="you"]').classList.contains('sel')).toBe(true);
    b.key('ArrowRight');
    expect(q('[data-hand="kit"]').classList.contains('sel')).toBe(true);
    b.key('ArrowLeft');
    expect(q('[data-hand="you"]').classList.contains('sel')).toBe(true);
    b.key('ArrowRight');
    // Nothing is lit, and Enter sends nothing, until ↑↓ aims: then the first ↓ is the first panel.
    expect(qa('.bw-panel.at, .bw-way.at')).toHaveLength(0);
    expect(b.key('Enter')).toBe(true);
    expect(o.onSend).not.toHaveBeenCalled();
    b.key('ArrowDown');
    expect(panel('read').classList.contains('at')).toBe(true);
    b.key('ArrowDown');
    expect(panel('palm').classList.contains('at')).toBe(true);
    b.key('ArrowUp');
    expect(b.key('Enter')).toBe(true);
    expect(o.onSend).toHaveBeenCalledWith('read', 'kit');
  });

  it('M plays the selected recruit\'s move', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    b.key('ArrowRight');
    b.key('ArrowRight');
    expect(b.key('m')).toBe(true);
    expect(o.onMove).toHaveBeenCalledWith('kit');
  });

  it('↑↓ step through each of your ways where a card has two', () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    b.key('ArrowRight');
    b.key('ArrowDown');
    b.key('ArrowDown');
    expect(qa('.bw-way.at').map((r) => r.dataset.by)).toEqual(['you:scheduler']);
    b.key('ArrowDown');
    b.key('Enter');
    expect(o.onSend).toHaveBeenCalledWith('palm', 'you:branch');
  });

  it('no panel is lit when a card is picked by a click', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    expect(qa('.bw-panel.at, .bw-way.at')).toHaveLength(0);
  });

  it("the keys reach her way: ←→ step onto her strip last, ↑↓ aim, Enter sends it as hers", () => {
    const { b, o } = mount();
    b.update(state(A), EMBER);
    b.key('ArrowLeft');
    expect(q('.bw-comms').classList.contains('sel')).toBe(true);
    expect(panel('read').querySelector<HTMLElement>('.bw-way')!.dataset.by).toBe('contact');
    expect(panel('palm').querySelector('.bw-way')).toBeNull();
    b.key('ArrowDown');
    expect(panel('read').classList.contains('at')).toBe(true);
    b.key('Enter');
    expect(o.onSend).toHaveBeenCalledWith('read', 'contact');
  });

  it('a clock a move or program moved lights up, with no send', () => {
    const { b } = mount();
    b.update(state({ ...A, alarm: 2 }), EMBER);
    expect(q('.bw-clk[data-clock="alarm"]').classList.contains('moved')).toBe(false);
    b.update(state({ ...A, alarm: 1 }), EMBER);
    expect(q('.bw-clk[data-clock="alarm"]').classList.contains('moved')).toBe(true);
    b.update(state({ ...A, alarm: 1, take: { filled: 2, size: 4 } }), EMBER);
    expect(q('.bw-clk[data-clock="take"]').querySelectorAll('i.pop')).toHaveLength(1);
    expect(q('.bw-clk[data-clock="alarm"]').classList.contains('moved')).toBe(false);
  });

  it('keys it does not use are left alone', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(b.key('Escape')).toBe(false);
    expect(b.key('x')).toBe(false);
    b.update(state(null), EMBER);
    expect(b.key('ArrowRight')).toBe(false);
  });
});

describe('the board\'s moments', () => {
  it('a send lands as a stamp on its panel, then the next beat comes in', () => {
    vi.useFakeTimers();
    const { b, o } = mount(false);
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    expect(o.onSend).toHaveBeenCalledWith('read', 'kit');
    const next: CrewJobView = { ...CREW, hand: [YOU, { ...KIT, state: 'spent' }, NOOR, WALL, RUE], clocks: [{ ...CREW.clocks[0] }] };
    b.update(state({ ...A, beat: 'floor', take: { filled: 3, size: 4 }, crew: next }), EMBER);
    // The old beat holds while its stamp lands.
    expect(panel('read').querySelector('.bw-stamp')!.textContent).toBe('AT A PRICE');
    expect(o.cue).toHaveBeenCalledWith('cost');
    vi.advanceTimersByTime(2000);
    expect(q('.bw-stamp')).toBeNull();
    expect(q('.bw-clk[data-clock="take"]').querySelectorAll('i.pop')).toHaveLength(2);
  });

  it('a clean way stamps CLEAN; a throw that comes back hurt stamps HURT and shakes the stage', () => {
    vi.useFakeTimers();
    const { b, o, g } = mount(false);
    b.update(state(A), EMBER);
    click('[data-hand="noor"]');
    click('.bw-panel[data-card="palm"]');
    vi.advanceTimersByTime(400);
    b.update(state({ ...A, beat: 'floor', crew: { ...CREW, hand: [YOU, KIT, { ...NOOR, state: 'spent' }, WALL, RUE] } }), EMBER);
    expect(panel('palm').querySelector('.bw-stamp')!.textContent).toBe('CLEAN');
    expect(o.cue).toHaveBeenCalledWith('clean');
    vi.advanceTimersByTime(2000);
    click('[data-hand="noor"]');
    expect(q('[data-hand="noor"]').classList.contains('sel')).toBe(false);
    b.update(state(A), EMBER);
    click('[data-hand="noor"]');
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    b.update(state({ ...A, beat: 'floor', alarm: 2, crew: { ...CREW, hand: [YOU, KIT, { ...NOOR, state: 'hurt' }, WALL, RUE] } }), EMBER);
    expect(panel('read').querySelector('.bw-stamp')!.textContent).toBe('HURT');
    expect(o.cue).toHaveBeenCalledWith('miss');
    expect(g.querySelector('.bw')!.classList.contains('shake')).toBe(true);
  });

  it('under reduced motion the card does not fly and the stage does not shake', () => {
    vi.useFakeTimers();
    const { b, o, g } = mount(true);
    b.update(state(A), EMBER);
    click('[data-hand="noor"]');
    click('.bw-panel[data-card="read"]');
    // No flight: the pick goes at once.
    expect(o.onSend).toHaveBeenCalledWith('read', 'noor');
    expect(q('.bw-flying')).toBeNull();
    b.update(state({ ...A, beat: 'floor', alarm: 2, crew: { ...CREW, hand: [YOU, KIT, { ...NOOR, state: 'hurt' }, WALL, RUE] } }), EMBER);
    expect(g.querySelector('.bw')!.classList.contains('shake')).toBe(false);
    expect(panel('read').querySelector('.bw-stamp')!.textContent).toBe('HURT');
  });

  it('a move rises to the middle, but not under reduced motion', () => {
    const { b } = mount(false);
    b.update(state(A), EMBER);
    click('.bw-ab[data-move="kit"]');
    expect(q('.bw-rise').classList.contains('in')).toBe(true);
    expect(q('.bw-rise').textContent).toContain('LOOP THE CAMS');
    document.body.replaceChildren();
    const r = mount(true);
    r.b.update(state(A), EMBER);
    click('.bw-ab[data-move="kit"]');
    expect(q('.bw-rise').classList.contains('in')).toBe(false);
    expect(r.o.onMove).toHaveBeenCalledWith('kit');
  });

  it('a send that never lands gives the board back', () => {
    vi.useFakeTimers();
    const { b, o } = mount(true);
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledTimes(1);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    expect(o.onSend).toHaveBeenCalledTimes(2);
  });
});

describe('the room\'s hotkeys while the board is up', () => {
  const k = (o: Partial<Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey'>>) => ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, ...o });
  it('refuses the Tab cycle and every Alt hotkey that opens something the board hides', () => {
    expect(boardRefusesKey(k({ key: 'Tab', code: 'Tab' }))).toBe(true);
    for (const code of ['KeyY', 'KeyP', 'KeyC', 'KeyX', 'KeyQ', 'KeyK', 'KeyB', 'KeyL', 'KeyJ', 'KeyO', 'KeyS', 'KeyH', 'KeyM', 'KeyE', 'KeyG', 'KeyD', 'KeyR']) expect(boardRefusesKey(k({ key: 'x', code, altKey: true }))).toBe(true);
  });
  it('leaves Esc, the board\'s own keys, TITLE and the Alt key itself', () => {
    for (const key of ['Escape', 'ArrowLeft', 'ArrowDown', 'Enter', 'm']) expect(boardRefusesKey(k({ key, code: key }))).toBe(false);
    expect(boardRefusesKey(k({ key: 't', code: 'KeyT', altKey: true }))).toBe(false);
    expect(boardRefusesKey(k({ key: 'Alt', code: 'AltLeft', altKey: true }))).toBe(false);
    expect(boardRefusesKey(k({ key: 'r', code: 'KeyR', ctrlKey: true }))).toBe(false);
  });
});

// GO IN on the board (crew rules spec, The board → GO IN): the roster's ready recruits as printed cards to bring, up to
// three, and the deck's slots to load from owned programs; Enter goes in. No approaches, no favour, no contact cards.
const recruit = (id: string, name: string, spec: SetupOffer['crew'][number]['spec'], o: Partial<SetupOffer['crew'][number]> = {}): SetupOffer['crew'][number] => ({ id, name, spec, grade: 1, face: null, traits: [], abilities: [], ...o });
const OFFER: SetupOffer = {
  rules: 'crew',
  district: 'karasu',
  tier: 'NOBODY',
  heat: 1,
  favour: 'on hold',
  crew: [recruit('kit', 'Kit Moreau', 'runner', { face: 'crew-face-02.png' }), recruit('noor', 'Noor Hale', 'face', { grade: 2 }), recruit('mia', 'Mia Ross', 'ears'), recruit('dez', 'Dez Okafor', 'muscle')],
  contacts: [],
  deck: { name: 'Stall build', quality: 2, slots: 2 },
  programs: [
    { id: 'firewall', name: 'FIREWALL', stat: 'tech', kind: 'firewall', line: 'One ALARM on a beat does not land.' },
    { id: 'scrub', name: 'SCRUB', stat: 'tech', kind: 'quiet', line: 'ALARM −1 now.' },
    { id: 'solvent', name: 'SOLVENT', stat: 'tech', kind: 'quiet', line: 'Eats a lock.' },
  ],
};
const GO = { id: 'night-clerk', title: 'Night Clerk', tier: 2, pay: [360, 440] as [number, number], offer: OFFER };

describe('GO IN on the board', () => {
  it("shows the ready recruits as printed cards and the deck's slots with owned programs; no approach, favour or contact cards", () => {
    const { b, g } = mount();
    b.goIn(GO);
    expect(b.up()).toBe(true);
    expect(g.classList.contains('crew-board')).toBe(true);
    expect(q('.tb-crew').hidden).toBe(false);
    expect(q('.bw-job').textContent).toBe('NIGHT CLERK');
    expect(qa('.bw-goin [data-bring]').map((c) => c.dataset.bring)).toEqual(['kit', 'noor', 'mia', 'dez']);
    for (const c of qa('.bw-goin [data-bring]')) expect(c.classList.contains('bw-pc')).toBe(true);
    expect(q<HTMLImageElement>('[data-bring="kit"] img.bw-face').getAttribute('src')).toBe('/api/extras/crew-face-02.png');
    expect(qa('.bw-goin .bw-dslot')).toHaveLength(2);
    expect(qa('.bw-goin [data-load]').map((c) => c.dataset.load)).toEqual(['firewall', 'scrub', 'solvent']);
    expect(document.querySelector('.ts-how, .ts-favour, .ts-contacts, .bw-panel')).toBeNull();
    expect(document.body.textContent).not.toMatch(/FAVOUR|QUIET|HARD/);
    // No pick is lit before the player picks: nothing reads as the board's suggestion.
    expect(qa('.bw-goin .sel, .bw-goin .at')).toHaveLength(0);
  });

  it('brings up to three: a fourth click is refused on the board; Enter goes in with the picked ids', () => {
    const { b, o } = mount();
    b.goIn(GO);
    for (const id of ['noor', 'kit', 'mia', 'dez']) click(`[data-bring="${id}"]`);
    expect(qa('.bw-goin [data-bring].sel').map((c) => c.dataset.bring)).toEqual(['kit', 'noor', 'mia']);
    expect(q('.bw-note').hidden).toBe(false);
    expect(q('.bw-note').textContent).toBe('AT MOST 3 PEOPLE');
    click('[data-load="scrub"]');
    expect(b.key('Enter')).toBe(true);
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: ['noor', 'kit', 'mia'], programs: ['scrub'] });
  });

  it('loads programs into the free slots, a click again unloads, and one past the slots is refused', () => {
    const { b, o } = mount();
    b.goIn(GO);
    click('[data-load="firewall"]');
    click('[data-load="solvent"]');
    click('[data-load="scrub"]');
    expect(q('.bw-note').textContent).toBe('NO FREE SLOT');
    expect(qa('.bw-dslot [data-hand]').map((c) => c.dataset.hand)).toEqual(['p:firewall', 'p:solvent']);
    click('[data-load="firewall"]');
    expect(qa('.bw-dslot [data-hand]').map((c) => c.dataset.hand)).toEqual(['p:solvent']);
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: [], programs: ['solvent'] });
  });

  it('a job with nobody ready shows the deck only and still goes in', () => {
    const { b, o } = mount();
    b.goIn({ ...GO, offer: { ...OFFER, crew: [] } });
    expect(qa('.bw-goin [data-bring]')).toHaveLength(0);
    expect(document.querySelector('.bw-goin .bw-bring')).toBeNull();
    expect(qa('.bw-goin .bw-dslot')).toHaveLength(2);
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: [], programs: [] });
  });

  it('with no deck there is nothing to load, and it still goes in', () => {
    const { b, o } = mount();
    b.goIn({ ...GO, offer: { ...OFFER, deck: null, programs: undefined } });
    expect(qa('.bw-goin .bw-dslot, .bw-goin [data-load]')).toHaveLength(0);
    expect(q('.bw-goin .bw-deck').textContent).toContain('NO DECK');
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: [], programs: [] });
  });

  it("a job's guest shows among the cards to bring, on their own art", () => {
    const { b, o } = mount();
    b.goIn({ ...GO, offer: { ...OFFER, crew: [...OFFER.crew.slice(0, 1), recruit('guest:noa', 'Noa Vey', 'face', { guest: true, art: '/api/crew/art/noa.webp' })] } });
    expect(q('[data-bring="guest:noa"]').classList.contains('guest')).toBe(true);
    expect(q<HTMLImageElement>('[data-bring="guest:noa"] img.bw-face').getAttribute('src')).toBe('/api/crew/art/noa.webp');
    click('[data-bring="guest:noa"]');
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: ['guest:noa'], programs: [] });
  });

  it('a card whose art fails turns into its initial, never a broken image', () => {
    const { b } = mount();
    b.goIn(GO);
    q('[data-bring="kit"] img.bw-face').dispatchEvent(new Event('error'));
    expect(q('[data-bring="kit"] .bw-mono').textContent).toBe('K');
    expect(document.querySelector('[data-bring="kit"] img.bw-face')).toBeNull();
  });

  it('keys: ←→ step the cards to bring and the programs, Space brings or loads, nothing lit before ←→', () => {
    const { b, o } = mount();
    b.goIn(GO);
    expect(b.key('ArrowRight')).toBe(true);
    expect(q('[data-bring="kit"]').classList.contains('at')).toBe(true);
    b.key(' ');
    b.key('ArrowLeft');
    expect(q('[data-load="solvent"]').classList.contains('at')).toBe(true);
    b.key(' ');
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: ['kit'], programs: ['solvent'] });
  });

  it('a second Enter waits on the first; a refusal gives GO IN back', () => {
    const { b, o } = mount();
    b.goIn(GO);
    b.key('Enter');
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledTimes(1);
    b.refuse("// DEZ ISN'T READY");
    expect(q('.bw-note').textContent).toBe("DEZ ISN'T READY");
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledTimes(2);
  });

  it('Esc backs out without going in: the board goes down', () => {
    const { b, o, g } = mount();
    b.goIn(GO);
    expect(b.key('Escape')).toBe(true);
    expect(o.onBack).toHaveBeenCalledTimes(1);
    expect(o.onGoIn).not.toHaveBeenCalled();
    expect(b.up()).toBe(false);
    expect(g.classList.contains('crew-board')).toBe(false);
    expect(q('.tb-crew').hidden).toBe(true);
  });

  it('stays up through a state with no run; the run it started takes its place', () => {
    const { b } = mount();
    b.goIn(GO);
    b.update(state(null), EMBER);
    expect(b.up()).toBe(true);
    expect(q('.bw-goin')).not.toBeNull();
    b.update(state(A), EMBER);
    expect(document.querySelector('.bw-goin')).toBeNull();
    expect(qa('.bw-panel')).toHaveLength(2);
    expect(b.key('Escape')).toBe(false);
  });

  it('a fresh offer keeps the picks still ready, and drops who is gone', () => {
    const { b, o } = mount();
    b.goIn(GO);
    click('[data-bring="kit"]');
    click('[data-bring="noor"]');
    click('[data-load="scrub"]');
    b.goIn({ ...GO, offer: { ...OFFER, crew: OFFER.crew.filter((c) => c.id !== 'kit') } });
    expect(qa('.bw-goin [data-bring].sel').map((c) => c.dataset.bring)).toEqual(['noor']);
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledWith({ crew: true, people: ['noor'], programs: ['scrub'] });
  });

  it('leave() takes GO IN down without a back', () => {
    const { b, o } = mount();
    b.goIn(GO);
    b.leave();
    expect(b.up()).toBe(false);
    expect(o.onBack).not.toHaveBeenCalled();
  });
});

// The debrief on the board (crew rules spec, The end): the grade, the pay with the ways' cut named, the heat parts, who
// is hurt or held, what the ending gave, and one key to close; the room's chrome comes back after it.
const DEBRIEF: Debrief = {
  tier: 'messy',
  checks: [],
  take: { filled: 2, size: 3 },
  alarm: 2,
  sol: 210,
  waysCut: { pct: 20, amount: 60 },
  heat: { district: 'karasu', delta: 3, after: 4, parts: [{ label: 'ALARM', n: 2 }, { label: 'ON THE NIGHT', n: 1 }] },
  rep: { district: 'karasu', before: 2, after: 3 },
  // As crewLines writes them (shared/hand.ts): a crew-rules harm is a call's loss.
  crew: ['KIT · HURT · 3 DAYS', 'NOOR · HELD', 'MIA · LISTEN IN · CLEAN RUN · 2 TO PRO'],
  people: [{ name: 'KIT', face: 'crew-face-02.png' }, { name: 'NOOR', face: null }, { name: 'MIA', face: null }],
  recruit: 'RECRUIT · SAIDA RAHM · FREE AT THE LONG HAUL UNTIL 06:00',
  outfit: 'OUTFIT · HICKS · TIE',
  found: 'Solvent',
};

describe('the debrief on the board', () => {
  it('shows the grade, the pay with the cut named (not taken twice), the heat parts, who is hurt or held, what it gave', () => {
    const { b, o, g } = mount();
    b.update(state(A), EMBER);
    b.update(state(null), EMBER);
    b.end(DEBRIEF, { title: 'Night Clerk' });
    expect(b.up()).toBe(true);
    expect(g.classList.contains('crew-board')).toBe(true);
    expect(q('.bw-end .bw-grade').textContent).toBe('MESSY');
    expect(o.tierCue).toHaveBeenCalledWith('messy');
    // The debrief's sol is already after the cut: the pay before it, the cut on its own line, then what you keep.
    expect(q('.bw-end .bw-pay').textContent).toBe('PAY270 SOL');
    expect(q('.bw-end .bw-cut').textContent).toBe('THE CUT · 20 %−60 SOL');
    expect(q('.bw-end .bw-keep').textContent).toBe('YOU KEEP210 SOL');
    expect(q('.bw-end .bw-heat').textContent).toContain('HEAT KARASU +3 → 4');
    expect(q('.bw-end .bw-heat-why').textContent).toBe('ALARM +2 · ON THE NIGHT +1');
    expect(qa('.bw-end .bw-mate').map((m) => [m.dataset.who, m.querySelector('.bw-st')?.textContent ?? null])).toEqual([
      ['KIT', 'HURT'],
      ['NOOR', 'HELD'],
      ['MIA', null],
    ]);
    expect(q('.bw-mate[data-who="KIT"] .bw-l1').textContent).toBe('HURT · 3 DAYS');
    expect(q('.bw-mate[data-who="MIA"] .bw-l1').textContent).toBe('LISTEN IN · CLEAN RUN · 2 TO PRO');
    expect(q('.bw-end').textContent).toContain('RECRUIT · SAIDA RAHM');
    expect(q('.bw-end').textContent).toContain('OUTFIT · HICKS · TIE');
    expect(q('.bw-end').textContent).toContain('FOUND · SOLVENT · FOIL');
    expect(q('.bw-end').textContent).toContain('REP KARASU 2 → 3');
    expect(document.querySelector('.bw-panel, .bw-hand .bw-pc')).toBeNull();
  });

  it("a judging clock's verdict sits above REP, which still shows; her word's line only when it changes", () => {
    const { b } = mount();
    const rows = () => qa('.bw-end .bw-after .bw-rep').map((n) => n.textContent);
    b.end({ ...DEBRIEF, tier: 'clean', trust: null, judge: { label: 'WHAT KROLL SEES', value: 0, size: 3, delta: 1, words: 'NOTHING ON THE GLASS · TRUST ▲' } }, { title: 'Come Up' });
    expect(rows()).toEqual(['WHAT KROLL SEES 0/3 · NOTHING ON THE GLASS · TRUST ▲', 'REP KARASU 2 → 3']);
    expect(q('.bw-end .bw-judge').classList.contains('up')).toBe(true);
    b.end({ ...DEBRIEF, trust: { name: 'Kroll', before: 'Trusts you', after: 'Sizing you up' }, judge: { label: 'WHAT KROLL SEES', value: 3, size: 3, delta: -2, words: 'WHAT THE GLASS CAUGHT · TRUST ▼▼' } }, { title: 'Come Up' });
    expect(rows()).toEqual(['WHAT KROLL SEES 3/3 · WHAT THE GLASS CAUGHT · TRUST ▼▼', 'KROLL · TRUSTS YOU → SIZING YOU UP', 'REP KARASU 2 → 3']);
    expect(q('.bw-end .bw-judge').classList.contains('down')).toBe(true);
    // A repeating job at 0: the label and value alone.
    b.end({ ...DEBRIEF, trust: null, judge: { label: 'WHAT KROLL SEES', value: 0, size: 3, delta: 0, words: '' } }, { title: 'The Round' });
    expect(rows()[0]).toBe('WHAT KROLL SEES 0/3');
  });

  it('a trust: stake job (rep off) shows her word, and no REP line', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, trust: { name: 'Rue', before: 'Wary', after: 'Cold' } }, { title: 'Run Sheet' });
    expect(qa('.bw-end .bw-after .bw-rep').map((n) => n.textContent)).toEqual(['RUE · WARY → COLD']);
    b.end({ ...DEBRIEF, trust: null }, { title: 'Run Sheet' });
    expect(qa('.bw-end .bw-after .bw-rep')).toEqual([]);
  });

  it('with no cut the pay is the sol, and no cut line', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, waysCut: undefined, tier: 'clean' }, { title: 'Night Clerk' });
    expect(q('.bw-end .bw-grade').textContent).toBe('CLEAN');
    expect(q('.bw-end .bw-pay').textContent).toBe('PAY210 SOL');
    expect(document.querySelector('.bw-end .bw-cut')).toBeNull();
  });

  it("the Chair's cut and a paid retainer still come off what you keep, as the table's debrief has them", () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, cut: { name: 'Nix', pct: 10, amount: 20 }, retainer: { name: 'Nix', amount: 30, paid: true } }, { title: 'Night Clerk' });
    expect(q('.bw-end .bw-keep').textContent).toBe('YOU KEEP160 SOL');
  });

  it('stays up through states with no run (her closing turn), then Enter closes it and the chrome comes back', () => {
    const { b, o, g } = mount();
    b.update(state(A), EMBER);
    b.end(DEBRIEF, { title: 'Night Clerk' });
    b.update(state(null), EMBER);
    expect(b.up()).toBe(true);
    expect(q('.bw-end')).not.toBeNull();
    expect(b.key('Enter')).toBe(true);
    expect(o.onClose).toHaveBeenCalledTimes(1);
    expect(b.up()).toBe(false);
    expect(g.classList.contains('crew-board')).toBe(false);
    expect(q('.tb-crew').hidden).toBe(true);
    b.update(state(null), EMBER);
    expect(b.up()).toBe(false);
  });

  it('Esc closes it too, and so does its CLOSE key', () => {
    const one = mount();
    one.b.end(DEBRIEF, { title: 'Night Clerk' });
    expect(one.b.key('Escape')).toBe(true);
    expect(one.o.onClose).toHaveBeenCalledTimes(1);
    expect(one.b.up()).toBe(false);
    document.body.replaceChildren();
    const two = mount();
    two.b.end(DEBRIEF, { title: 'Night Clerk' });
    click('.bw-end .bw-close');
    expect(two.o.onClose).toHaveBeenCalledTimes(1);
    expect(two.b.up()).toBe(false);
  });

  it('a send landing as the job ends: its stamp holds, then the debrief comes in', () => {
    vi.useFakeTimers();
    const { b } = mount(true);
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    // As main.ts does it: the ending first, then the state with no run.
    b.end(DEBRIEF, { title: 'Night Clerk' });
    b.update(state(null), EMBER);
    expect(q('.bw-stamp')).not.toBeNull();
    expect(document.querySelector('.bw-end')).toBeNull();
    expect(b.up()).toBe(true);
    // Every key waits for the debrief: Esc doesn't fall through to the pause menu, Enter doesn't close what isn't up.
    expect(b.key('Escape')).toBe(true);
    expect(b.key('Enter')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(q('.bw-end .bw-grade').textContent).toBe('MESSY');
    expect(b.up()).toBe(true);
  });

  it('remembers the run it showed, so the ending is known for its own', () => {
    const { b } = mount();
    expect(b.ran()).toBeNull();
    b.update(state(A), EMBER);
    b.update(state(null), EMBER);
    expect(b.ran()).toBe('night-clerk');
  });
});

describe('the debrief on the board: pressing on, the deck', () => {
  const won = { line: 'Lift the crate.', result: 'won' as const, sol: 60 };
  const lost = { line: 'Go back for the second one.', result: 'lost' as const, sol: 0 };

  it('a won push says what it paid', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, pushes: [won], push: 'won' }, { title: 'Night Clerk' });
    const rows = qa('.bw-end .bw-push');
    expect(rows.map((r) => r.textContent)).toEqual(['PRESSED · LIFT THE CRATE.+60 SOL']);
    expect(rows[0].classList.contains('won')).toBe(true);
    expect(document.querySelector('.bw-push-end')).toBeNull();
  });

  it('a failed throw on a push beat reads PRESSED · <line> · NOTHING, neither won nor lost (last pass B1)', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, pushes: [{ line: 'Get the real name out of the clerk.', result: 'won', sol: 0, missed: true }], push: 'won' }, { title: 'Night Clerk' });
    const rows = qa('.bw-end .bw-push');
    expect(rows.map((r) => r.textContent)).toEqual(['PRESSED · GET THE REAL NAME OUT OF THE CLERK.NOTHING']);
    expect(rows[0].classList.contains('missed')).toBe(true);
    expect(rows[0].classList.contains('won')).toBe(false);
    expect(rows[0].classList.contains('lost')).toBe(false);
  });

  it('a lost push says it was lost and what it cost', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, pushes: [won, lost], push: 'lost' }, { title: 'Night Clerk' });
    expect(qa('.bw-end .bw-push').map((r) => r.textContent)).toEqual(['PRESSED · LIFT THE CRATE.+60 SOL', 'PRESSED · GO BACK FOR THE SECOND ONE.LOST']);
    expect(q('.bw-end .bw-push-end').textContent).toBe('THE PUSH WENT WRONG · THE POT AND HALF THE PAY GONE');
    document.body.replaceChildren();
    const two = mount();
    two.b.end({ ...DEBRIEF, tier: 'blown', pushes: [lost], push: 'lost' }, { title: 'Night Clerk' });
    expect(q('.bw-end .bw-push-end').textContent).toBe('THE PUSH WENT WRONG · THE POT AND ALL THE PAY GONE');
  });

  it('walking away from the push says so', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, push: 'walked' }, { title: 'Night Clerk' });
    expect(qa('.bw-end .bw-push')).toHaveLength(0);
    expect(q('.bw-end .bw-push-end').textContent).toBe('WALKED WITH IT');
  });

  it('a deck gained or lost is among what it gave', () => {
    const { b } = mount();
    b.end({ ...DEBRIEF, deck: { from: 'stall-build', to: null } }, { title: 'Night Clerk' });
    expect(qa('.bw-end .bw-gave-line').map((l) => l.textContent)).toContain('DECK STALL BUILD → NONE');
  });
});

describe('the debrief on the board: closing', () => {
  afterEach(() => setGraftCue(() => {}));

  it('a quick close stops the pay and keep cues still waiting', () => {
    vi.useFakeTimers();
    const played: string[] = [];
    setGraftCue((n) => played.push(n));
    const { b } = mount(false);
    b.end(DEBRIEF, { title: 'Night Clerk' });
    b.key('Enter');
    vi.advanceTimersByTime(3000);
    expect(played).toEqual([]);
  });

  it('left open, they play', () => {
    vi.useFakeTimers();
    const played: string[] = [];
    setGraftCue((n) => played.push(n));
    const { b } = mount(false);
    b.end(DEBRIEF, { title: 'Night Clerk' });
    vi.advanceTimersByTime(3000);
    expect(played).toEqual(['pay', 'keep']);
  });
});

describe('whose ending is the board\'s', () => {
  const row = (id: string, debrief?: Debrief) => ({ id, title: 'x', beat: null, ...(debrief ? { debrief } : {}) });
  it('the run the board showed, or a debrief marked crew rules; never a Graft one it never showed', () => {
    expect(boardEnding(row('night-clerk', DEBRIEF), 'night-clerk')).toBe(true);
    expect(boardEnding(row('night-clerk', { ...DEBRIEF, rules: 'crew' }), null)).toBe(true);
    expect(boardEnding(row('bad-batch', DEBRIEF), 'night-clerk')).toBe(false);
    expect(boardEnding(row('night-clerk'), 'night-clerk')).toBe(false);
    expect(boardEnding(undefined, 'night-clerk')).toBe(false);
  });
});

describe('GO IN that goes nowhere', () => {
  it('can go again after a wait with no answer', () => {
    vi.useFakeTimers();
    const { b, o } = mount();
    b.goIn(GO);
    b.key('Enter');
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledTimes(2);
  });

  it('can go again at once when the line drops (giveBack)', () => {
    const { b, o } = mount();
    b.goIn(GO);
    b.key('Enter');
    b.giveBack();
    b.key('Enter');
    expect(o.onGoIn).toHaveBeenCalledTimes(2);
  });
});

describe('the board on screen (e2e findings)', () => {
  it("heads a plain beat with the view's title: a plain beat is on no route, so the route can't name it", () => {
    const { b } = mount();
    b.update(state({ ...A, beat: 'ask', crew: { ...CREW, title: 'THE HUNDRED' } }), EMBER);
    expect(q('.bw-beatrow .bw-beat').textContent).toBe('THE HUNDRED');
  });
});

describe('GO IN on screen (e2e findings)', () => {
  it("GO IN's refusal doesn't carry into the run: the note goes when the run comes up", () => {
    const { b } = mount();
    b.goIn(GO);
    for (const id of ['noor', 'kit', 'mia', 'dez']) click(`[data-bring="${id}"]`);
    expect(q('.bw-note').hidden).toBe(false);
    b.update(state(A), EMBER);
    expect(q('.bw-note').hidden).toBe(true);
  });

  it('four or more to bring are drawn smaller, side by side before the deck', () => {
    const { b } = mount();
    b.goIn(GO);
    expect(q('.bw-bring').classList.contains('small')).toBe(true);
    const lefts = qa('.bw-goin [data-bring]').map((c) => parseInt(c.style.left, 10));
    expect(lefts).toEqual([470, 642, 814, 986]);
    b.goIn({ ...GO, id: 'other', offer: { ...OFFER, crew: OFFER.crew.slice(0, 3) } });
    expect(q('.bw-bring').classList.contains('small')).toBe(false);
  });
});

describe('the board beside the Graft table (e2e findings)', () => {
  it("leaves none of the table's own pieces on the page: no second .tb-middle, .tb-prose or .tb-nerve", () => {
    mount();
    expect(document.querySelectorAll('.tb-crew .tb-middle, .tb-crew .tb-prose, .tb-crew .tb-nerve, .tb-crew .tb-levers, .tb-crew .tb-bottom')).toHaveLength(0);
    expect(document.querySelector('.tb-crew > .tb-log')).not.toBeNull();
  });
});

describe('the one card that can be sent (controller look)', () => {
  const solo: CrewJobView = { ...CREW, hand: [YOU, { ...RUE }], cards: CREW.cards.map((c) => ({ ...c, throws: [] })) };

  it('is picked for you on each beat, its ways on the panels, nothing lit until ↑↓; her strip still offers hers', () => {
    const { b } = mount();
    b.update(state({ ...A, crew: solo }), EMBER);
    expect(q('[data-hand="you"]').classList.contains('sel')).toBe(true);
    expect(panel('read').querySelectorAll('.bw-way')).toHaveLength(1);
    expect(panel('palm').querySelectorAll('.bw-way')).toHaveLength(2);
    expect(qa('.bw-panels .at')).toHaveLength(0);
    expect(qa('.bw-comms .bw-offer').map((x) => x.dataset.card)).toEqual(['read']);
    b.key('ArrowDown');
    expect(qa('.bw-panels .at').length).toBeGreaterThan(0);
    // The next beat picks you again.
    b.update(state({ ...A, beat: 'floor', crew: solo }), EMBER);
    expect(q('[data-hand="you"]').classList.contains('sel')).toBe(true);
    expect(qa('.bw-panels .at')).toHaveLength(0);
  });

  it('with two or more that can be sent, nobody is picked', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(qa('.bw-hand .sel')).toHaveLength(0);
    expect(qa('.bw-panel .bw-way')).toHaveLength(0);
  });

  it("a picked recruit's move lifts with them", () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(q('.bw-ab[data-move="kit"]').classList.contains('lift')).toBe(false);
    click('[data-hand="kit"]');
    expect(q('.bw-ab[data-move="kit"]').classList.contains('lift')).toBe(true);
    expect(q('.bw-ab[data-move="noor"]').classList.contains('lift')).toBe(false);
  });
});

describe("the board's route (controller look)", async () => {
  const { fitNames, forkEl } = await import('../src/room/board/route');
  const FORK = {
    ways: [
      { via: 'charm', beats: [{ id: 'lobby', title: 'THE LOBBY' }, { id: 'desk', title: 'THE DESK' }, { id: 'floor-front', title: 'THE FLOOR' }, { id: 'closet', title: 'THE CLOSET' }, { id: 'out', title: 'THE WAY OUT' }] },
      { via: 'stairs', beats: [{ id: 'lobby', title: 'THE LOBBY' }, { id: 'stairwell', title: 'THE STAIRWELL' }, { id: 'floor-back', title: 'THE FLOOR' }, { id: 'closet', title: 'THE CLOSET' }, { id: 'out', title: 'THE WAY OUT' }] },
    ],
    played: [] as string[],
  };

  it('fits who can go: every name, else the first that fit and +N, else a count', () => {
    expect(fitNames([], 100)).toBe('YOU ALONE');
    expect(fitNames(['Juno', 'Mika'], 100)).toBe('JUNO · MIKA');
    expect(fitNames(['Juno', 'Pell', 'Mika'], 130)).toBe('JUNO · PELL +1');
    expect(fitNames(['Juno', 'Pell', 'Mika'], 60)).toBe('JUNO +2');
    expect(fitNames(['Juno', 'Pell', 'Mika'], 40)).toBe('3 OF YOURS');
  });

  it('draws the fork in two rows, the branch below in its frame; the way not taken struck after the fork', () => {
    const before = forkEl(FORK, 'lobby', { desk: ['Juno', 'Mika'], stairwell: ['Pell'] }, 540)!;
    const at = (id: string) => before.querySelector<HTMLElement>(`[data-beat="${id}"]`)!;
    expect(at('desk').style.top).toBe('0px');
    expect(at('stairwell').style.top).not.toBe('0px');
    expect(at('lobby').classList.contains('on')).toBe(true);
    expect(at('stairwell').textContent).toContain('PELL');
    expect(before.querySelector('.bw-rt-fork')).not.toBeNull();
    const after = forkEl({ ...FORK, played: ['lobby'] }, 'desk', { stairwell: ['Pell'], closet: ['Pell'] }, 540)!;
    expect(after.querySelector('[data-beat="stairwell"]')!.classList.contains('gone')).toBe(true);
    expect(after.querySelector('[data-beat="stairwell"] .bw-ahead')).toBeNull();
    expect(after.querySelector('.bw-rt-fork')!.classList.contains('gone')).toBe(true);
    expect(after.querySelector('[data-beat="floor-front"]')!.classList.contains('lit')).toBe(true);
  });

  it('a route that only runs one way is no fork', () => {
    expect(forkEl({ ways: [FORK.ways[0]], played: [] }, 'lobby', {}, 540)).toBeNull();
  });
});

describe('hover waits for the pointer (review)', () => {
  const move = () => q('.bw').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  it('a new beat, GO IN or the debrief sets .fresh; the first mousemove clears it; a redraw of the same beat keeps it clear', () => {
    const { b } = mount();
    b.update(state(A), EMBER);
    expect(q('.bw').classList.contains('fresh')).toBe(true);
    move();
    expect(q('.bw').classList.contains('fresh')).toBe(false);
    b.update(state(A), EMBER);
    expect(q('.bw').classList.contains('fresh')).toBe(false);
    b.update(state({ ...A, beat: 'floor' }), EMBER);
    expect(q('.bw').classList.contains('fresh')).toBe(true);
    move();
    b.update(state(null), EMBER);
    b.goIn(GO);
    expect(q('.bw').classList.contains('fresh')).toBe(true);
  });

  it('no pick on a beat of plain cards, even with you the one card that can be sent', () => {
    const { b } = mount();
    const plain: CrewJobView = { ...CREW, hand: [YOU], cards: [{ id: '!walk', short: 'WALK', line: '360 SOL · HEAT +5', plain: true, ways: [], throws: [] }, { id: '!press', short: 'PRESS ON', line: 'One more beat.', plain: true, ways: [], throws: [] }] };
    b.update(state({ ...A, beat: '!push', crew: plain }), EMBER);
    expect(qa('.bw-hand .sel')).toHaveLength(0);
  });
});

// The board's page (playtest: "make the page type at the text speed too … decode setting applies to it as well"): the
// JOB column types its new words in on the board, as her comms line does; the story table's page doesn't.
describe("the board's page types its new words", () => {
  const page = (board = true, reduced = false) => {
    const game = document.createElement('div');
    game.id = 'game';
    if (board) game.className = 'crew-board';
    const feed = document.createElement('div');
    game.append(feed);
    document.body.append(game);
    const c = mountJobColumn(feed, game, undefined, { reduced: () => reduced });
    const body = () => game.querySelector<HTMLElement>('.jc-body')!;
    return { c, body, game };
  };
  const typing = (n: HTMLElement) => n.querySelector('.type-cursor, .unshown') !== null;

  it('the first text stands whole (a reload, the board coming up); new text types, and only what is new', () => {
    vi.useFakeTimers();
    const { c, body } = page();
    c.show('Run Sheet', 'The cable stair swings.');
    expect(typing(body())).toBe(false);
    // Her answer lands at the foot: the beat stays put, only her words type.
    c.setThread({ head: [], foot: [{ key: 'm1', who: 'RUE', text: 'Get it.' }] });
    expect(typing(body())).toBe(true);
    expect([...body().querySelectorAll('.unshown')].map((n) => n.textContent).join('')).toContain('Get it.');
    expect(body().querySelector('.jc-story .unshown')).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(typing(body())).toBe(false);
    // A new beat is new text: it types from its start.
    c.show('Run Sheet', 'The yard is wet.');
    expect(typing(body())).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(typing(body())).toBe(false);
    expect(body().textContent).toContain('The yard is wet.');
    // The page cleared and back (the board coming up again): its first text stands whole.
    c.clear();
    c.show('Night Clerk', 'The hotel under the Cat.');
    expect(typing(body())).toBe(false);
  });

  it('INSTANT and reduced motion show new text at once; DECODE wears noise ahead of the cursor', () => {
    vi.useFakeTimers();
    const fast = page();
    fast.c.show('Run Sheet', 'First.');
    fast.c.setTextSpeed(0);
    fast.c.show('Run Sheet', 'Second.');
    expect(typing(fast.body())).toBe(false);
    document.body.replaceChildren();
    const calm = page(true, true);
    calm.c.show('Run Sheet', 'First.');
    calm.c.show('Run Sheet', 'Second.');
    expect(typing(calm.body())).toBe(false);
    document.body.replaceChildren();
    const noisy = page();
    noisy.c.setTextEffect('decode');
    noisy.c.show('Run Sheet', 'First.');
    noisy.c.show('Run Sheet', 'Second words.');
    expect(noisy.body().querySelector('.unshown.noise .nw[data-n]')).not.toBeNull();
  });

  it('a click on the page, or a skip, shows the rest at once', () => {
    vi.useFakeTimers();
    const { c, body } = page();
    c.show('Run Sheet', 'First.');
    c.show('Run Sheet', 'A long second beat to type.');
    expect(typing(body())).toBe(true);
    body().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(typing(body())).toBe(false);
    expect(body().textContent).toContain('A long second beat to type.');
    c.show('Run Sheet', 'A third beat.');
    expect(c.finishTyping()).toBe(true);
    expect(typing(body())).toBe(false);
    expect(c.finishTyping()).toBe(false);
  });

  it('the story table (no board) never types its page', () => {
    vi.useFakeTimers();
    const { c, body } = page(false);
    c.show('Run Sheet', 'First.');
    c.show('Run Sheet', 'Second.');
    expect(typing(body())).toBe(false);
  });
});

// The scene moment (a beat in another room): the board steps back while the room changes, the new room holds clear with
// its name, the board comes back. Every test ends its moment: each board's window listeners outlive its test.
describe("the board's scene moment", () => {
  const PLACE = { name: 'The Long Haul', place: () => Promise.resolve('The Spine') };
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const key = (k: string, o: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
    window.dispatchEvent(e);
    return e;
  };

  it('only when a crew run on the board goes to a room other than the one shown', () => {
    expect(sceneChanges({ crew: true, boardUp: true, target: 'spine/long-haul', shown: 'spine/rue-hab' })).toBe(true);
    expect(sceneChanges({ crew: true, boardUp: true, target: 'spine/long-haul', shown: 'spine/long-haul' })).toBe(false);
    expect(sceneChanges({ crew: false, boardUp: true, target: 'spine/long-haul', shown: 'spine/rue-hab' })).toBe(false);
    expect(sceneChanges({ crew: true, boardUp: false, target: 'spine/long-haul', shown: 'spine/rue-hab' })).toBe(false);
    expect(sceneChanges({ crew: true, boardUp: true, target: 'spine/long-haul', shown: null })).toBe(false);
  });

  it('sceneDone resolves when the board is back, at once with no moment (the voice waits for it)', async () => {
    vi.useFakeTimers();
    const { b } = mount(false);
    b.update(state(A), EMBER);
    let none = false;
    void b.sceneDone().then(() => (none = true));
    await flush();
    expect(none).toBe(true);
    const m = b.sceneMoment(PLACE)!;
    let done = false;
    void b.sceneDone().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(200);
    m.landed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(true);
  });

  it('fades the board out, waits for the room, holds its name, fades back', async () => {
    vi.useFakeTimers();
    const { b, g } = mount(false);
    b.update(state(A), EMBER);
    const m = b.sceneMoment(PLACE)!;
    expect(m).not.toBeNull();
    let out = false;
    void m.out.then(() => (out = true));
    expect(g.classList.contains('bw-scene')).toBe(true);
    expect(g.classList.contains('bw-scene-snap')).toBe(false);
    expect(q('.tb-crew').classList.contains('busy')).toBe(true);
    await flush();
    expect(out).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(out).toBe(true);
    // The room swaps: no name until it has.
    expect(q('.bw-scene-band').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    m.landed();
    expect(q('.bw-scene-band').hidden).toBe(false);
    expect(q('.bw-scene-band').textContent).toBe('THE LONG HAUL · THE SPINE');
    await vi.advanceTimersByTimeAsync(1900);
    expect(g.classList.contains('bw-scene')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(g.classList.contains('bw-scene')).toBe(false);
    expect(g.classList.contains('bw-scene-back')).toBe(true);
    expect(q('.bw-scene-band').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(g.className).not.toMatch(/bw-scene/);
    expect(b.inScene()).toBe(false);
    expect(q('.tb-crew').classList.contains('busy')).toBe(false);
  });

  it('not on a reload (the board first appearing on a beat in progress), not at GO IN, not at the debrief', () => {
    const { b } = mount(false);
    // Nothing on screen yet: the reload's run comes in after.
    expect(b.sceneMoment(PLACE)).toBeNull();
    b.goIn(GO);
    expect(b.sceneMoment(PLACE)).toBeNull();
    b.leave();
    b.update(state(A), EMBER);
    b.end(DEBRIEF, { title: 'Night Clerk' });
    expect(b.sceneMoment(PLACE)).toBeNull();
  });

  it('the first beat after GO IN, in another room, is one', () => {
    vi.useFakeTimers();
    const { b, g } = mount(false);
    b.goIn(GO);
    b.key('Enter');
    const m = b.sceneMoment(PLACE);
    expect(m).not.toBeNull();
    b.update(state(A), EMBER);
    expect(g.classList.contains('bw-scene')).toBe(true);
    key('Escape');
    expect(b.inScene()).toBe(false);
  });

  it('waits for a send’s stamp to have its hold before stepping back', async () => {
    vi.useFakeTimers();
    const { b, g, o } = mount(false);
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    expect(o.onSend).toHaveBeenCalled();
    const m = b.sceneMoment(PLACE)!;
    let out = false;
    void m.out.then(() => (out = true));
    expect(g.classList.contains('bw-scene')).toBe(false);
    b.update(state({ ...A, beat: 'floor', crew: { ...CREW, hand: [YOU, { ...KIT, state: 'spent' }, NOOR, WALL, RUE] } }), EMBER);
    expect(panel('read').querySelector('.bw-stamp')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(g.classList.contains('bw-scene')).toBe(false);
    expect(out).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(g.classList.contains('bw-scene')).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(out).toBe(true);
    key('x');
    expect(b.inScene()).toBe(false);
  });

  it('a key ends it at once and does nothing else; the board is as it was, pick and aim kept', async () => {
    vi.useFakeTimers();
    const { b, g, o } = mount(false);
    b.update(state(A), EMBER);
    b.key('ArrowRight');
    b.key('ArrowDown');
    expect(b.aimed()).toBe(true);
    const picked = qa('.bw-hand .sel').map((n) => n.dataset.hand);
    const lit = qa('.bw-panels .at').map((n) => n.className);
    const m = b.sceneMoment(PLACE)!;
    await vi.advanceTimersByTimeAsync(200);
    m.landed();
    const e = key('Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(o.onSend).not.toHaveBeenCalled();
    expect(b.inScene()).toBe(false);
    expect(g.className).not.toMatch(/bw-scene/);
    expect(q('.bw-scene-band').hidden).toBe(true);
    expect(qa('.bw-hand .sel').map((n) => n.dataset.hand)).toEqual(picked);
    expect(qa('.bw-panels .at').map((n) => n.className)).toEqual(lit);
    expect(b.aimed()).toBe(true);
    // A key held from before repeats: it doesn't end the next one.
    b.sceneMoment(PLACE);
    expect(key('Enter', { repeat: true }).defaultPrevented).toBe(true);
    expect(b.inScene()).toBe(true);
    // Through the board's own keys too.
    expect(b.key('Enter')).toBe(true);
    expect(b.inScene()).toBe(false);
    expect(o.onSend).not.toHaveBeenCalled();
    // Afterwards the keys are the board's again: Enter sends what was aimed.
    b.key('Enter');
    await vi.advanceTimersByTimeAsync(400);
    expect(o.onSend).toHaveBeenCalledTimes(1);
  });

  it('a click ends it at once and sends nothing, the press and its click both', () => {
    vi.useFakeTimers();
    const { b, o } = mount(false);
    b.update(state(A), EMBER);
    click('[data-hand="kit"]');
    b.sceneMoment(PLACE);
    panel('read').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(b.inScene()).toBe(false);
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    expect(o.onSend).not.toHaveBeenCalled();
    expect(q('[data-hand="kit"]').classList.contains('sel')).toBe(true);
    // A click alone (no press first) ends it too.
    b.sceneMoment(PLACE);
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    expect(b.inScene()).toBe(false);
    expect(o.onSend).not.toHaveBeenCalled();
    // And the next click is the board's.
    click('.bw-panel[data-card="read"]');
    vi.advanceTimersByTime(400);
    expect(o.onSend).toHaveBeenCalledWith('read', 'kit');
  });

  it('under reduced motion: no fades, the board hides at once, the name holds 1.2 s', async () => {
    vi.useFakeTimers();
    const { b, g } = mount(true);
    b.update(state(A), EMBER);
    const m = b.sceneMoment(PLACE)!;
    let out = false;
    void m.out.then(() => (out = true));
    await flush();
    expect(out).toBe(true);
    expect(g.classList.contains('bw-scene')).toBe(true);
    expect(g.classList.contains('bw-scene-snap')).toBe(true);
    m.landed();
    expect(q('.bw-scene-band').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(b.inScene()).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(b.inScene()).toBe(false);
    expect(g.className).not.toMatch(/bw-scene/);
  });

  it('a room that never lands gives the board back', async () => {
    vi.useFakeTimers();
    const { b, g } = mount(false);
    b.update(state(A), EMBER);
    b.sceneMoment(PLACE);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(b.inScene()).toBe(false);
    expect(g.className).not.toMatch(/bw-scene/);
  });

  it('the pause menu keeps its keys', () => {
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    let paused = false;
    const b = mountBoard(g, { onSend: vi.fn(), onMove: vi.fn(), onPick: vi.fn(), onGoIn: vi.fn(), onClose: vi.fn(), cue: vi.fn(), reduced: () => true, paused: () => paused });
    b.update(state(A), EMBER);
    b.sceneMoment(PLACE);
    paused = true;
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    expect(b.inScene()).toBe(true);
    paused = false;
    key('ArrowDown');
    expect(b.inScene()).toBe(false);
  });
});

describe('a way that takes a job clock down', () => {
  const clocks = [{ id: 'hears', label: 'WHAT RUE HEARS', size: 3, value: 2 }];
  it('shows as a gain chip with a true minus, not a cost', () => {
    const w = way('you', 'Bury it.', { take: 1, clocks: { hears: -1 } });
    expect(costTerms(w, clocks)).toEqual([
      { kind: 'take', text: 'TAKE +1' },
      { kind: 'gain', text: 'WHAT RUE HEARS −1' },
    ]);
    expect(costEl(w, clocks).querySelector('.c-gain')!.textContent).toBe('WHAT RUE HEARS −1');
    expect(priced(w)).toBe(false);
  });
  it('a move of 0 draws no chip', () => {
    expect(costTerms(way('you', 'Bury it.', { take: 1, clocks: { hears: 0 } }), clocks)).toEqual([{ kind: 'take', text: 'TAKE +1' }]);
  });
});
