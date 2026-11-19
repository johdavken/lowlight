/**
 * Images in the narration on a run (spec 2026-11-18): Come Up with markers, played through the relay. The first time
 * the run reaches an image's marker its row carries it (by paragraph); markers never reach the player's text or a
 * character.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { entryOf, onRelay, read, relayWith, useKrollsDesk, type DeskRelay } from './krolls-desk-kit';

useKrollsDesk();

const EXTRAS = [
  { id: 'local-01', file: 'local-01.png', tags: ['local', 'man'] },
  { id: 'local-02', file: 'local-02.png', tags: ['local', 'man', 'old'] },
  { id: 'crew-muscle-01', file: 'crew-muscle-01.png', tags: ['crew', 'man', 'old'] },
];

/** Come Up with three images: the file on her desk (a beat she reads), mirek introduced at the market and (again) at the office; the coat at the market, or in YOUR WORD's outcome. */
/** Come Up as shipped, without its own images: the base these tests mark for themselves. */
const bare = () => read('come-up').replace(/^image .*\n/gm, '').replace(/\{img [a-z0-9-]+\} /g, '');

function marked(): string {
  let t = bare();
  const put = (a: string, b: string) => {
    expect(t).toContain(a);
    t = t.replace(a, b);
  };
  put('clock nerve: HIS NERVE', 'image mirek: local-01\nimage coat: any man old\nimage file: local-01\nclock nerve: HIS NERVE');
  put('*The file is squared at the corner of the desk.', '{img file} *The file is squared at the corner of the desk.');
  put("*Nine o'clock under the deck", "*{img mirek} Nine o'clock under the deck");
  put("*Tonight there's a man at the coat rail", "{img coat} *Tonight there's a man at the coat rail");
  put('*You tell her the drops were yours.', '{img coat} *You tell her the drops were yours.');
  put('*The letter goes out on paper', '{img letter} *The letter goes out on paper');
  put('image file: local-01\n', 'image file: local-01\nimage letter: scene come-up-letter.webp\n');
  put("*Pylon Thirty-One's housing office", "{img mirek} *Pylon Thirty-One's housing office");
  return t;
}

const desk = (text: string) => relayWith([entryOf('come-up', onRelay(text))], { trust: 4, extras: EXTRAS });
const rows = (t: DeskRelay): ChatMessage[] => t.db.recentMessages('soren', 80).filter((m) => m.mode === 'quest' && m.role === 'user' && m.quest);
const paras = (text: string) => text.split(/\n[ \t]*\n/);
const run = (t: DeskRelay) => JSON.parse(t.db.getMeta('quest.soren.come-up@0') ?? 'null');
const start = async (t: DeskRelay) => expect(await t.relay.startQuest('soren', 'come-up', { crew: true, people: ['ash'], programs: [] })).not.toBeTypeOf('string');
const pick = async (t: DeskRelay, beat: string, choice: string, by: string) => expect(await t.relay.chooseQuest('soren', { id: 'come-up', beat, choice, by })).not.toBeTypeOf('string');

describe('images on a run', () => {
  it('shows each image the first time its marker is reached, at that paragraph, and never in the text', async () => {
    const t = desk(marked());
    await start(t);
    await pick(t, 'desk', 'letter', 'you');
    const market = rows(t).at(-1)!;
    expect(market.text).not.toContain('{img');
    const imgs = market.quest!.images!.filter((i) => !i.wide);
    expect(imgs.map((i) => i.name)).toEqual(['mirek', 'coat']);
    expect(imgs[0].url).toBe('/api/extras/local-01');
    // The coat is drawn from the old men who aren't crew and aren't mirek's face: only local-02.
    expect(imgs[1].url).toBe('/api/extras/local-02');
    expect(paras(market.text)[imgs[0].para]).toMatch(/^\*Nine o'clock under the deck/);
    expect(paras(market.text)[imgs[1].para]).toMatch(/^\*Tonight there's a man at the coat rail/);
    expect(run(t).images).toEqual({ drawn: { coat: 'local-02' }, shown: ['file', 'letter', 'mirek', 'coat'] });
    await pick(t, 'market', 'stall', 'ash');
    const office = rows(t).at(-1)!;
    expect(office.text).toContain("Pylon Thirty-One's housing office");
    expect(office.text).not.toContain('{img');
    expect(office.quest!.images).toBeUndefined();
  });

  it('an `any` face is drawn when the run starts, even when its first row shows no image', async () => {
    const t = desk(marked().replace('image file: local-01\n', '').replace('{img file} ', ''));
    await start(t);
    expect(rows(t)[0].quest!.images).toBeUndefined();
    expect(run(t).images).toEqual({ drawn: { coat: 'local-02' }, shown: [] });
  });

  it('a scene picture comes on the row wide, from the quest art', async () => {
    const t = desk(marked());
    await start(t);
    await pick(t, 'desk', 'letter', 'you');
    const letter = rows(t).at(-1)!.quest!.images!.find((i) => i.name === 'letter')!;
    expect(letter).toMatchObject({ url: '/api/quests/art/come-up-letter.webp', wide: true });
    expect(paras(rows(t).at(-1)!.text)[letter.para]).toMatch(/^\*The letter goes out on paper/);
  });

  it('a branch decides where an image first shows', async () => {
    const t = desk(marked());
    await start(t);
    await pick(t, 'desk', 'word', 'you');
    const row = rows(t).at(-1)!;
    const imgs = row.quest!.images!;
    expect(imgs.find((i) => i.name === 'coat')).toBeDefined();
    expect(paras(row.text)[imgs.find((i) => i.name === 'coat')!.para]).toMatch(/^\*You tell her the drops were yours/);
    // The market's coat paragraph comes later in the same row: no second coat.
    expect(imgs.filter((i) => i.name === 'coat')).toHaveLength(1);
  });

  it('rewinding past the first showing takes it back; the other branch then shows it at its own marker', async () => {
    const t = desk(marked());
    await start(t);
    await pick(t, 'desk', 'letter', 'you');
    const first = rows(t).at(-1)!;
    expect(first.quest!.images!.map((i) => i.name)).toEqual(['letter', 'mirek', 'coat']);
    // rewind keeps the row it's given: back to the job's first row, before the pick.
    await t.relay.rewind('soren', rows(t)[0].id);
    expect(run(t).images.shown).toEqual(['file']);
    await pick(t, 'desk', 'word', 'you');
    const again = rows(t).at(-1)!;
    const coat = again.quest!.images!.find((i) => i.name === 'coat')!;
    expect(paras(again.text)[coat.para]).toMatch(/^\*You tell her the drops were yours/);
    // The draw was made at the start and kept: the same face.
    expect(coat.url).toBe('/api/extras/local-02');
  });

  it('nothing she is told changes: the same picks with and without markers give her the same prompts', async () => {
    const plain = desk(bare());
    const withImages = desk(marked());
    for (const t of [plain, withImages]) {
      await start(t);
      await pick(t, 'desk', 'letter', 'you');
      await pick(t, 'market', 'stall', 'ash');
      await pick(t, 'office', 'keys', 'you');
    }
    const said = (t: DeskRelay) => JSON.stringify(t.backend.reqs.map((r) => r.messages));
    // Her desk's file paragraph is a beat she reads (not over the line): it reaches her, marker and all, unless stripped.
    expect(said(plain)).toContain('The file is squared at the corner of the desk');
    expect(said(withImages)).not.toContain('{img');
    expect(said(withImages)).toBe(said(plain));
  });

  it("a ride-along row's held split still falls at the next beat once the markers are out", async () => {
    const t = desk(marked());
    await start(t);
    // YOUR WORD's outcome carries the coat's marker before the split: taking it out moves the split.
    await pick(t, 'desk', 'word', 'you');
    const market = rows(t).at(-1)!;
    const held = market.quest!.held!;
    expect(market.text.slice(held.at)).toMatch(/^\*Nine o'clock under the deck/);
    // The coat heads the outcome, before the split; mirek the market, after it.
    const before = paras(market.text.slice(0, held.at).trimEnd()).length;
    expect(market.quest!.images!.map((i) => [i.name, i.para >= before])).toEqual([['coat', false], ['mirek', true]]);
  });

  it("the pick check's read of the beat (a model call) has no markers", async () => {
    const t = desk(marked());
    await start(t);
    const check = (t.relay as unknown as { jobs: { questCheck(p: string): { beat: string } | null } }).jobs.questCheck('soren');
    expect(check!.beat).toContain('The file is squared at the corner of the desk');
    expect(check!.beat).not.toContain('{img');
  });
});
