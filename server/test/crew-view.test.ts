import { describe, expect, it } from 'vitest';
import { crewView } from '../src/crew-view';
import { emptyCrewBook, parseCrewBook } from '../../shared/crew-book';
import { parseInstance, type Recruit } from '../../shared/crew';
import { foldWithCrew, type CrewEvent } from '../../shared/crew-fold';

describe('crewView without crew tables (a build ships no world/crew yet)', () => {
  it('lists no hires rather than cards named Nobody', () => {
    const book = emptyCrewBook();
    const r = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [], crew: [], now: 1200, book, seed: 's', instance: () => null });
    const v = crewView({ crew: r.crew, kit: r.kit, book, now: 1200, seed: 's', places: [{ id: 'low-roller', name: 'The Low Roller', district: 'strand', hires: ['face'] }], extras: [], here: null, districts: ['strand'] });
    expect(v.hires).toEqual([]);
  });
});

describe('crewView: free cards and SPRING THEM (crew spec §5)', () => {
  const { book } = parseCrewBook({ names: '## strand\n- Juno Sato\n- Ilya Voss\n- Saida Rahm\n## karasu\n- Pell Okoro\n', traits: '', pitches: '', errands: '' });
  const DAY = 1440;
  const view = (o: { crew?: CrewEvent[][]; now?: number; vouchers?: Parameters<typeof crewView>[0]['vouchers']; jobCards?: Parameters<typeof crewView>[0]['jobCards']; springs?: boolean }) => {
    const now = o.now ?? 1200;
    const r = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [{ at: 0, sol: 1000 }, { at: 0, rep: { district: 'karasu', delta: 25 } }], crew: o.crew ?? [], now, book, seed: 's', instance: () => null });
    return crewView({ crew: r.crew, kit: r.kit, book, now, seed: 's', places: [], extras: [], here: null, districts: ['strand', 'karasu'], vouchers: o.vouchers, jobCards: o.jobCards, springs: o.springs ?? true });
  };
  const cass = { contact: 'cass', name: 'Cass', place: 'the-tilt', placeName: 'The Tilt', district: 'karasu', spec: 'fence' as const };

  it('a contact in a vouch cell has a VOUCHED card at her home place', () => {
    const v = view({ vouchers: [cass] });
    expect(v.hires).toHaveLength(1);
    expect(v.hires[0]).toMatchObject({ place: 'the-tilt', name: 'The Tilt', district: 'karasu', vouched: { contact: 'cass', name: 'Cass' } });
    // Karasu rep 25 is Known (tier 2): top grade HAND, so the vouch is PRO.
    expect(v.hires[0].cards[0]).toMatchObject({ cost: 0, loyalty: 70, from: { vouched: 'cass', name: 'Cass' }, recruit: { spec: 'fence', grade: 2 } });
  });

  it("a vouch's grade is the week's, not tonight's (deferred minor)", () => {
    // Karasu is Known (tier 2) tonight; the week began at Nobody (tier 1): GREEN + 1 = HAND.
    expect(view({ vouchers: [{ ...cass, tier: 1 }] }).hires[0].cards[0].recruit!.grade).toBe(1);
  });

  it('the same vouch all week, a new one the next', () => {
    const id = (now: number) => view({ vouchers: [cass], now }).hires[0].cards[0].recruit!.id;
    expect(id(1200)).toBe(id(1200 + 3 * DAY));
    expect(id(1200)).not.toBe(id(1200 + 7 * DAY));
  });

  const card = { runKey: 'quest.hicks.weigh-station@0', title: 'Weigh Station', place: 'long-haul', placeName: 'The Long Haul', district: 'spine', spec: 'muscle' as const, grade: 1 as const, endAt: 1300 };
  it('a job card sits at the job place until the next 06:00', () => {
    expect(view({ jobCards: [card], now: 1290 }).hires).toEqual([]);
    const v = view({ jobCards: [card], now: 1360 });
    expect(v.hires[0]).toMatchObject({ place: 'long-haul', name: 'The Long Haul' });
    expect(v.hires[0].cards[0]).toMatchObject({ cost: 0, loyalty: 50, from: { job: card.runKey, title: 'Weigh Station' }, recruit: { spec: 'muscle', grade: 1 } });
    expect(view({ jobCards: [card], now: DAY + 359 }).hires).toHaveLength(1);
    expect(view({ jobCards: [card], now: DAY + 360 }).hires).toEqual([]);
  });

  it('a hired free card leaves the list', () => {
    const c = view({ vouchers: [cass] }).hires[0].cards[0];
    const hired: CrewEvent = { type: 'hire', at: 1100, recruit: c.recruit!, place: 'the-tilt', cost: 0, loyalty: 70, vouched: 'cass' };
    expect(view({ vouchers: [cass], crew: [[hired]] }).hires).toEqual([]);
  });

  it('canSpring: held and nothing posted today; not after a spring, nor with no rescue written', () => {
    const r: Recruit = { id: 'dez', name: 'Dez Vance', face: null, origin: 'strand', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
    const held: CrewEvent[] = [{ type: 'hire', at: 1000, recruit: r, place: 'low-roller', cost: 0 }];
    // Held by a job's call, built in the fold: simplest is a hand job with a held loss.
    const jobs = [{ key: 'quest.hicks.back-door@0', title: 'Back Door', district: 'strand', setup: { approach: 'quiet' as const, people: ['dez'], favour: false, at: 1100 }, calls: [{ beat: 'b', choice: 'c', card: 'dez', again: true, at: 1110, loss: 'held' as const }], end: { at: 1120, tier: 'blown' as const, getOut: false } }];
    const at = (evs: CrewEvent[], springs = true) => {
      const f = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [{ at: 0, sol: 1000 }], crew: [evs], now: 1200, book, seed: 's', instance: () => null, jobs });
      return crewView({ crew: f.crew, kit: f.kit, book, now: 1200, seed: 's', places: [], extras: [], here: null, districts: ['strand'], springs }).roster[0];
    };
    expect(at(held)).toMatchObject({ state: 'held', canSpring: true, springWhy: null });
    expect(at([...held, { type: 'spring', at: 1150, job: 'spring-quiet' }])).toMatchObject({ canSpring: false, springWhy: 'one rescue a night' });
    expect(at(held, false)).toMatchObject({ canSpring: false, springWhy: 'no rescue written' });
    expect(at(held).springPlace).toBeNull();
  });

  it('springPlace names their hire place once sprung; vouchedBy names who vouched', () => {
    const r: Recruit = { id: 'dez', name: 'Dez Vance', face: null, origin: 'strand', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
    const jobs = [{ key: 'quest.hicks.back-door@0', title: 'Back Door', district: 'strand', setup: { approach: 'quiet' as const, people: ['dez'], favour: false, at: 1100 }, calls: [{ beat: 'b', choice: 'c', card: 'dez', again: true, at: 1110, loss: 'held' as const }], end: { at: 1120, tier: 'blown' as const, getOut: false } }];
    const evs: CrewEvent[] = [{ type: 'hire', at: 1000, recruit: r, place: 'low-roller', cost: 0, loyalty: 70, vouched: 'cass' }, { type: 'spring', at: 1150, job: 'spring-quiet' }];
    const f = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [{ at: 0, sol: 1000 }], crew: [evs], now: 1200, book, seed: 's', instance: () => null, jobs });
    const names = { place: (id: string) => (id === 'low-roller' ? 'The Low Roller' : id), contact: (id: string) => (id === 'cass' ? 'Cass' : id) };
    const m = crewView({ crew: f.crew, kit: f.kit, book, now: 1200, seed: 's', places: [], extras: [], here: null, districts: ['strand'], springs: true, names }).roster[0];
    expect(m).toMatchObject({ springPlace: 'The Low Roller', vouchedBy: 'Cass' });
    // Past 06:00 with the rescue still under way (deferred minor): still waiting there, SPRING THEM held.
    const later = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [{ at: 0, sol: 1000 }], crew: [evs], now: 1440 + 380, book, seed: 's', instance: () => null, jobs });
    const m2 = crewView({ crew: later.crew, kit: later.kit, book, now: 1440 + 380, seed: 's', places: [], extras: [], here: null, districts: ['strand'], springs: true, names, rescuing: ['dez'] }).roster[0];
    expect(m2).toMatchObject({ springPlace: 'The Low Roller', canSpring: false, springWhy: 'their rescue is under way' });
  });
});

describe('crewView: abilities (crew abilities spec §4)', () => {
  const { book } = parseCrewBook({
    names: '## strand\n- Juno Sato\n',
    traits: '',
    pitches: '',
    errands: '---\nkind: records\nlabel: Records\ntag: PREP\nsuits: runner\nhours: 3\nrisk: med\nneeds:\nclean:\n  - "ok"\nmessy:\n  - "meh"\nblown:\n  - "no"\n---\n',
    abilities: 'log-wipe · Log Wipe · runner · HAND · alarm -1 · Knows which logs nobody reads.\nclean-exit · Clean Exit · runner · VET · save · Never a trace.',
  });
  const r = (o: Partial<Recruit>): Recruit => ({ id: 'r-w', name: 'Juno Sato', face: null, origin: 'strand', spec: 'runner', grade: 3, traits: [], hidden: null, pitch: '', wage: 90, abilities: ['log-wipe'], ...o });
  const view = (rec: Recruit) => {
    const f = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [], crew: [[{ type: 'hire', at: 1100, recruit: rec, place: 'p', cost: 0 }]], now: 1200, book, seed: 's', instance: () => null });
    return crewView({ crew: f.crew, kit: f.kit, book, now: 1200, seed: 's', places: [], extras: [], here: null, districts: ['strand'] });
  };
  it('the book in words, and slots by grade', () => {
    const v = view(r({}));
    expect(v.abilities['log-wipe']).toEqual({ label: 'Log Wipe', timing: 'after', job: 'ALARM −1 AFTER A ROLL', text: 'Knows which logs nobody reads.', from: 1 });
    expect(v.abilities['clean-exit']).toMatchObject({ timing: 'after', job: 'A MISS BECOMES A 4–5' });
    expect(v.roster[0].slots).toBe(2);
    expect(view(r({ grade: 0, abilities: [] })).roster[0].slots).toBe(1);
  });
  it('a slotted ability is not in the odds', () => {
    expect(view(r({})).errands[0].odds['r-w'].why.join()).not.toContain('LOG WIPE');
  });
});

describe('crewView: goods (crew goods spec)', () => {
  const lines = '  - "{name} did it."\n  - "{name} did it again."\n';
  const errand = (kind: string, head: string) => `---\nkind: ${kind}\nlabel: ${kind}\ntag: SOL\nhours: 3\nrisk: low\n${head}\nclean:\n${lines}messy:\n${lines}blown:\n${lines}`;
  const goods = '---\nkind: data\nlabel: Data\nroute: runner\nvalue: 380\n---\nkind: pharma\nlabel: Pharma\nroute: ears\nvalue: 340\n---\n';
  const { book } = parseCrewBook({ names: '', traits: 'trains · T · + · hours -33% + sells-anywhere · any · x\n', pitches: '', goods, errands: errand('pull-drive', 'suits: runner\ngroup: collect\nneeds: offer\ngives: data') + errand('sell', 'suits: runner, ears, fence\ngroup: hustle\nneeds: lot') + '---\n' });
  const r = (o: Partial<Recruit>): Recruit => ({ id: 'r-a', name: 'Juno Sato', face: null, origin: 'strand', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40, ...o });
  const hire = (x: Recruit): CrewEvent => ({ type: 'hire', at: 1140, recruit: x, place: 'p', cost: 0 });
  const view = (crew: CrewEvent[][], rep: Record<string, number> = { strand: 25 }) => {
    const inst = (id: string) => parseInstance(id, { book, districtOfJob: () => null, placeOfJob: () => null });
    const f = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: Object.entries(rep).map(([district, delta]) => ({ at: 0, rep: { district, delta } })), crew, now: 1200, book, seed: 's', instance: inst, placeDistrict: () => 'strand' });
    return crewView({ crew: f.crew, kit: f.kit, book, now: 1200, seed: 's', places: [], extras: [], here: null, districts: ['strand', 'karasu'] });
  };
  it('a sale lists a price and hours per recruit', () => {
    const v = view([[hire(r({}))]]);
    const e = v.errands.find((x) => x.kind === 'sell' && x.district === 'strand')!;
    const full = v.stash![0].kind === 'data' ? 380 : 340 * 0.6;
    expect(e.routes!['r-a'].hours).toBe(3);
    expect(e.routes!['r-a'].price).toBe(Math.round((full * (e.wanted ? 1.5 : 1)) / 10) * 10);
  });
  it('only those who can reach a district are on its sale', () => {
    const v = view([[hire(r({}))], [hire(r({ id: 'r-b', traits: ['trains'] }))]]);
    const far = v.errands.find((x) => x.kind === 'sell' && x.district === 'karasu')!;
    expect(Object.keys(far.odds)).toEqual(['r-b']);
  });
  it('the wanted line is only where you are Known', () => expect(view([[hire(r({}))]]).wanted!.map((w) => w.district)).toEqual(['strand']));
  it('the stash fills with lots on the way', () => {
    expect(view([[hire(r({}))]]).stashFull).toBe(false);
  });
  it('a stash row', () => expect(view([[hire(r({}))]]).stash![0]).toMatchObject({ id: 'first', nightsLeft: 3, stale: false, damaged: false, district: 'strand' }));
});

describe('crewView: one person per night', () => {
  const names = '## strand\n' + Array.from({ length: 20 }, (_, i) => `- Name ${i}`).join('\n') + '\n';
  const { book } = parseCrewBook({ names, traits: '', pitches: '', errands: '' });
  const places = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, district: 'strand', hires: ['face' as const] }));
  const view = (crew: CrewEvent[][], now: number) => {
    const r = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [{ at: 0, sol: 5000 }], crew, now, book, seed: 's', instance: () => null });
    return crewView({ crew: r.crew, kit: r.kit, book, now, seed: 's', places, extras: [], here: null, districts: ['strand'] });
  };
  const namesOf = (v: ReturnType<typeof view>) => v.hires.flatMap((h) => h.cards.flatMap((c) => (c.recruit ? [c.recruit.name] : [])));
  it('no name on two places the same night, none from crew hired before', () => {
    for (let day = 0; day < 10; day++) {
      const n = namesOf(view([], 1200 + day * 1440));
      expect(new Set(n).size).toBe(n.length);
    }
    const first = view([], 1200).hires[0].cards[0].recruit!;
    const hire: CrewEvent = { type: 'hire', at: 1200, recruit: first, place: 'a', cost: 0 };
    // The same night, hiring them takes their card and leaves the others as they were.
    const after = namesOf(view([[hire]], 1210));
    expect(after).toEqual(namesOf(view([], 1210)).filter((x) => x !== first.name));
    // A later night never offers them again.
    for (let day = 1; day < 10; day++) expect(namesOf(view([[hire]], 1200 + day * 1440))).not.toContain(first.name);
  });
});

describe('crewView: a contract\'s groundwork (tier 3 contracts spec §3)', () => {
  const errand = (kind: string, head: string) => `---\nkind: ${kind}\nlabel: ${kind}\ntag: PREP\nsuits: muscle\nhours: 8\nrisk: med\n${head}\nblurb: x\nclean:\n  - "{name} did it."\nmessy:\n  - "{name} did it, loud."\nblown:\n  - "{name} lost it."\n`;
  const parsed = (head = '') => parseCrewBook({ names: '', traits: '', pitches: '', errands: errand('groundwork', `needs: run${head}`) }).book;
  const dez: Recruit = { id: 'r-dez', name: 'Dez Vance', face: null, origin: 'karasu', spec: 'muscle', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
  const run = 'the-contract@3';
  const pieces = [{ id: 'boat', spec: 'muscle' as const, line: 'Her skiff.' }, { id: 'roof', spec: 'ears' as const, line: 'A room.' }, { id: 'goodwill', spec: 'face' as const, line: 'Her name.' }];
  const sent = 'groundwork:the-contract@3:boat:muscle@0';
  const view = (o: { crew?: CrewEvent[][]; now?: number; art?: string | null; book?: ReturnType<typeof parsed> }) => {
    const book = o.book ?? parsed();
    const now = o.now ?? 1200;
    const r = foldWithCrew({ start: { deck: null, nerveMax: 1, from: 0 }, kitEvents: [], crew: o.crew ?? [], now, book, seed: 's', instance: (id) => parseInstance(id, { book, districtOfJob: () => null, placeOfJob: () => null }) });
    return crewView({ crew: r.crew, kit: r.kit, book, now, seed: 's', places: [], extras: [], here: null, districts: [], contracts: [{ run, title: 'The Test Contract', nightsLeft: 2, art: o.art === undefined ? 'the-contract.webp' : o.art, pieces }] });
  };
  const hired: CrewEvent = { type: 'hire', at: 1100, recruit: dez, place: 'low-roller', cost: 0 };
  const out: CrewEvent[] = [hired, { type: 'send', at: 1150, errand: sent }];
  const states = (v: ReturnType<typeof view>) => v.contracts![0].pieces.map((p) => p.state);

  it('open: all three, each with its errand and its line', () => {
    const v = view({});
    expect(v.contracts![0]).toMatchObject({ run, title: 'The Test Contract', nightsLeft: 2, hours: 8, risk: 'med' });
    expect(v.contracts![0].pieces[0]).toEqual({ id: 'boat', label: 'The boat', spec: 'muscle', line: 'Her skiff.', state: 'open', errand: sent });
    expect(states(v)).toEqual(['open', 'open', 'open']);
    expect(v.errands.map((e) => e.piece)).toEqual(['boat', 'roof', 'goodwill']);
  });
  it("out, and the others wait: one a night; they're listed but can't be sent", () => {
    const v = view({ crew: [out] });
    expect(states(v)).toEqual(['out', 'waits', 'waits']);
    expect(v.contracts![0].pieces[0]).toMatchObject({ recruit: 'r-dez', due: 1150 + 480, errand: sent });
    expect(v.contracts![0].pieces[1].errand).toBeUndefined();
    expect(v.errands).toEqual([]);
  });
  it("back once it's landed, and the next night the others open", () => {
    const v = view({ crew: [out], now: 1800 + 60 });
    expect(states(v)).toEqual(['back', 'open', 'open']);
    expect(v.contracts![0].pieces[0].recruit).toBeUndefined();
  });
  it("art: the errand's own, else the contract's, else none", () => {
    expect(view({}).errands[0].art).toBe('/api/quests/art/the-contract.webp');
    expect(view({}).contracts![0].art).toBe('/api/quests/art/the-contract.webp');
    expect(view({ art: null }).errands[0].art).toBeUndefined();
    const own = view({ book: parsed('\nart: own-picture.webp') });
    expect(own.errands[0].art).toBe('/api/quests/art/own-picture.webp');
  });
  it('a bad art name is a book problem', () => {
    expect(parseCrewBook({ names: '', traits: '', pitches: '', errands: errand('groundwork', 'needs: run\nart: Not A File.png') }).problems).toEqual(['errands: groundwork: art must be a file name like night-clerk.webp']);
  });
});
