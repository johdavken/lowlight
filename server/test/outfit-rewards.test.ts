import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app';
import { openDb } from '../src/db';
import { makeFixture } from './fixtures/agents';
import { startStubOpenRouter } from './fixtures/stub-openrouter';
import { parseQuestFile, questKey, rewardOutfits } from '../../shared/quests';
import { foldKit } from '../../shared/mission';
import { applyMove, DEFAULT_SHARED_STANDING, parseStored, peakOf, standingKey } from '../../shared/standing';
import { createPlaythroughs } from '../src/playthroughs';
import { standingControl } from '../src/standing';

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

/** A job whose ending gives Zed's tie (outfits as rewards). */
const GIFT = `---
title: The Gift
kind: mission
tier: 1
starts: lowlight-intake
pitch: Something to wear.
pay: 90
---

# door

*A door.*

- go: Go in. → done
- wait: Wait. → done

## done
*Done.*
gives: outfit zed tie
→ end
`;

describe('gives: outfit', () => {
  it('reads as the ending\'s outfit, and the book lists it as a reward', () => {
    const r = parseQuestFile('the-gift', GIFT, { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.outcomes.get('done')!.effects.outfit).toEqual({ who: 'zed', name: 'tie' });
    expect([...rewardOutfits([r.entry])]).toEqual(['zed/tie']);
  });

  it("an outfit the character doesn't have is a problem", () => {
    const r = parseQuestFile('the-gift', GIFT, { roster: null, places: null, outfits: new Set(['zed/coat']) });
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toContain("gives: no outfit 'tie' in zed's character.json");
  });

  it('the kit keeps each outfit once', () => {
    const k = foldKit({ deck: null, nerveMax: 2, from: 0 }, [{ at: 1, outfit: 'zed/tie' }, { at: 2, outfit: 'zed/tie' }], 3);
    expect(k.outfits).toEqual(['zed/tie']);
  });

  it("The Subtraction gives Hicks's tie on every fallout ending but the blown one", () => {
    const r = parseQuestFile('the-subtraction', fs.readFileSync('world/quests/the-subtraction.md', 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const gives = (id: string) => r.entry.outcomes.get(id)!.effects.outfit ?? null;
    for (const id of ['done-go', 'done-keep', 'done-finish']) expect(gives(id)).toEqual({ who: 'hicks', name: 'tie' });
    expect(gives('done-blown')).toBeNull();
  });
});

describe('a locked outfit', () => {
  async function start() {
    const or = await startStubOpenRouter([]);
    cleanups.push(() => or.close());
    const { root, cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: or.url });
    // Zed: a contact with a sprite, a coat and the tie the job gives.
    const zed = path.join(cfg.charactersDir, 'zed');
    fs.mkdirSync(zed, { recursive: true });
    const png = path.join('characters', 'nix-direct', 'nix-direct-outfit-outdoors.png');
    for (const f of ['zed.png', 'zed-coat.png', 'zed-tie.png']) fs.copyFileSync(png, path.join(zed, f));
    fs.writeFileSync(path.join(zed, 'character.json'), JSON.stringify({ name: 'Zed', sprite: { src: 'zed.png' }, outfits: { coat: 'zed-coat.png', tie: 'zed-tie.png' }, rooms: ['karasu/lowlight-intake'] }));
    cfg.questsDir = path.join(root, 'quests');
    fs.mkdirSync(cfg.questsDir);
    fs.writeFileSync(path.join(cfg.questsDir, 'the-gift.md'), GIFT);
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    const addr = built.app.server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;
    const pt = built.world.active()!;
    // A run of The Gift that ended and gave the tie, in Nix's room db.
    const earn = () => {
      const file = path.join(cfg.playthroughsDir, pt.id, 'chars', 'nix', 'room.db');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const db = openDb(file, { defaultPlayer: pt.player });
      db.setMeta(questKey(pt.player, 'the-gift@0'), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, day: 1, endDay: 1, kit: [{ at: 1, outfit: 'zed/tie' }] }));
      db.close();
    };
    return { built, base, pt, earn };
  }

  it('stays out of the wardrobe, refuses a pick and reads a stored pick as none, until a run has given it', async () => {
    const { built, base, pt, earn } = await start();
    const post = (outfit: string | null) => fetch(`${base}/api/contacts/zed/outfit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outfit }) });
    expect(built.world.outfitOpen!('zed', 'tie')).toBe(false);
    expect(built.world.outfitOpen!('zed', 'coat')).toBe(true);
    expect((await post('tie')).status).toBe(400);
    expect((await post('coat')).status).toBe(200);
    // A pick saved before the lock (as in a save from before rewards) is no pick.
    built.playthroughs.setContactOutfit(pt.id, 'zed', 'tie');
    expect(built.world.contactOutfitOf!('zed')).toBeNull();
    expect(await (await fetch(`${base}/api/playthroughs/active/contact-outfits`)).json()).toEqual({});
    earn();
    expect(built.world.outfitOpen!('zed', 'tie')).toBe(true);
    expect(built.world.contactOutfitOf!('zed')).toBe('tie');
    expect(await (await fetch(`${base}/api/playthroughs/active/contact-outfits`)).json()).toEqual({ zed: 'tie' });
    expect((await post('tie')).status).toBe(200);
  });
});

describe('outfits by standing', () => {
  async function start() {
    const or = await startStubOpenRouter([]);
    cleanups.push(() => or.close());
    const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: or.url });
    // Zed: a robe for anyone she's warm to, a coat only for Kai, and a plain jacket.
    const zed = path.join(cfg.charactersDir, 'zed');
    fs.mkdirSync(zed, { recursive: true });
    const png = path.join('characters', 'nix-direct', 'nix-direct-outfit-outdoors.png');
    for (const f of ['zed.png', 'zed-robe.png', 'zed-coat.png', 'zed-jacket.png']) fs.copyFileSync(png, path.join(zed, f));
    fs.writeFileSync(
      path.join(zed, 'character.json'),
      JSON.stringify({
        name: 'Zed',
        sprite: { src: 'zed.png' },
        outfits: { robe: 'zed-robe.png', coat: 'zed-coat.png', jacket: 'zed-jacket.png' },
        outfitUnlocks: { robe: { warmth: 10 }, coat: { warmth: 10, player: 'kai' }, jacket: { warmth: 'lots' } },
        rooms: ['karasu/lowlight-intake'],
      }),
    );
    const pts = createPlaythroughs(cfg.playthroughsDir);
    const pt = pts.create({ player: 'kai', startContact: 'nix' });
    pts.setActive(pt.id);
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const warmth = (warmth: number, peak?: number) => {
      const file = path.join(cfg.playthroughsDir, pt.id, 'chars', 'zed', 'room.db');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const db = openDb(file, { defaultPlayer: 'kai' });
      db.setMeta(standingKey('kai'), JSON.stringify({ trust: 0, warmth, moves: [], ...(peak !== undefined ? { peak: { trust: 0, warmth: peak } } : {}) }));
      db.close();
    };
    const open = (name: string) => built.world.outfitOpen!('zed', name);
    return { built, pts, pt, warmth, open };
  }

  it('opens once her warmth has reached the line, and stays open after it falls', async () => {
    const { warmth, open } = await start();
    expect(open('robe')).toBe(false);
    warmth(9);
    expect(open('robe')).toBe(false);
    warmth(10);
    expect(open('robe')).toBe(true);
    warmth(4, 10);
    expect(open('robe')).toBe(true);
  });

  it("a rule for one player opens only for them; a rule that doesn't read is left out (the outfit stays open)", async () => {
    const { built, pts, pt, warmth, open } = await start();
    warmth(10);
    expect(open('coat')).toBe(true);
    pts.setActive(pts.create({ player: 'lee', startContact: 'nix' }).id);
    expect(open('coat')).toBe(false);
    pts.setActive(pt.id);
    expect(open('jacket')).toBe(true);
    void built;
  });

  it('her own rules never lock her when she is the player', async () => {
    const { pts, open } = await start();
    pts.setActive(pts.create({ player: 'zed', startContact: 'nix' }).id);
    expect(open('robe')).toBe(true);
  });
});

describe('her peak', () => {
  it('rises with her values, never falls, and reads back; an older value is its own peak', () => {
    const move = (t: number, w: number) => ({ trust: t, warmth: w, reason: 'x', at: 1, messageId: 'm', take: 0 });
    let s = applyMove(null, { trust: 9, warmth: 9 }, move(1, 1));
    expect(s.peak).toEqual({ trust: 10, warmth: 10 });
    s = applyMove(s, { trust: 0, warmth: 0 }, move(-1, -3));
    expect(s).toMatchObject({ trust: 9, warmth: 7, peak: { trust: 10, warmth: 10 } });
    expect(parseStored(JSON.stringify(s))!.peak).toEqual({ trust: 10, warmth: 10 });
    expect(peakOf(parseStored(JSON.stringify({ trust: 3, warmth: 6, moves: [] })), { trust: 0, warmth: 0 })).toEqual({ trust: 3, warmth: 6 });
    expect(peakOf(null, { trust: 2, warmth: 1 })).toEqual({ trust: 2, warmth: 1 });
  });

  it('a standing move tells onPeak where her peak was and is', () => {
    const meta = new Map<string, string>();
    const db = { getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => void meta.set(k, v), stamp: () => ({ take: 0 }), allMessages: () => [] } as never;
    const seen: unknown[] = [];
    const c = standingControl({ db, player: () => 'kai', start: () => ({ trust: 0, warmth: 9 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING, onPeak: (p, b, a) => seen.push([p, b.warmth, a.warmth]) });
    c.move({ trust: 0, warmth: 1, reason: 'warm' }, 'm1');
    expect(seen).toEqual([['kai', 9, 10]]);
  });
});
