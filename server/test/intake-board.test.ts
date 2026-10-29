import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ownedBy, parseQuestFile } from '../../shared/quests';
import { TAKE } from '../src/mission-run';
import { at, intakeRelay, lastUser, OWN, OWN_TEXT, parse, play, questRows } from './fixtures/intake-relay';

describe('the Intake board: posting', () => {
  it('an own job lists inside its window only', () => {
    const r = intakeRelay();
    expect(r.relay.questState('hicks').open.map((q) => q.id)).toContain('held-papers');
    r.setClock(at(3, 0));
    expect(r.relay.questState('hicks').open.map((q) => q.id)).not.toContain('held-papers');
    r.setClock(at(19, 0));
    expect(r.relay.questState('hicks').open.map((q) => q.id)).not.toContain('held-papers');
  });

  it('a started own job carries on past its window', async () => {
    const r = intakeRelay({ clock: at(1, 55) });
    expect(await r.relay.startQuest('hicks', 'held-papers')).toMatchObject({ ok: true });
    r.setClock(at(2, 30));
    const beat = r.run()!.beat!;
    expect(await r.relay.chooseQuest('hicks', { id: 'held-papers', beat, choice: 'wait' })).toMatchObject({ ok: true });
    expect(r.run()!.picks.map((p) => p.choice)).toEqual(['wait']);
  });

  it('the row: own and trust', () => {
    const r = intakeRelay();
    expect(r.relay.questState('hicks').open.find((q) => q.id === 'held-papers')!.mission).toMatchObject({ own: 'Nix', trust: true });
  });
});

describe('the Intake board: trust as the stake', () => {
  it("clean +W, messy 0, blown −L; rep doesn't move", async () => {
    const clean = intakeRelay({ rolls: [10] });
    await play(clean, 'clean');
    expect(clean.trustNow()).toBe(1);
    const messy = intakeRelay();
    await play(messy, 'messy');
    expect(messy.trustNow()).toBe(0);
    const blown = intakeRelay({ rolls: [95], trust: 2 });
    await play(blown, 'blown');
    expect(blown.trustNow()).toBe(1);
    for (const r of [clean, messy, blown]) {
      expect(r.kit().rep.karasu ?? 0).toBe(0);
      expect((r.run()!.kit ?? []).some((e) => 'rep' in e)).toBe(false);
    }
  });

  it('cover never softens trust, so a trust job offers no cover cards and spends none', async () => {
    const r = intakeRelay({ rolls: [95], burner: 1, trust: 2 });
    await r.relay.startQuest('hicks', 'held-papers');
    await r.relay.chooseQuest('hicks', { id: 'held-papers', beat: r.run()!.beat!, choice: 'talk' });
    if (r.run()!.pending) await r.relay.chooseQuest('hicks', { id: 'held-papers', beat: r.run()!.beat!, choice: TAKE });
    expect(r.run()!.pendingCover ?? null).toBeNull();
    expect(r.run()!.done).toBe(true);
    expect(r.trustNow()).toBe(1);
    expect(r.kit().rep.karasu ?? 0).toBe(0);
    expect(r.kit().cover.burner).toBe(1);
  });

  it('the trust move belongs to the row', async () => {
    const r = intakeRelay({ rolls: [10] });
    const before = questRows(r.db).length;
    await play(r, 'clean');
    expect(r.jobMoves()).toHaveLength(1);
    const closing = r.db.recentMessages('hicks', 80).filter((m) => m.role === 'agent').at(-1)!;
    await r.relay.regenerate('hicks', closing.id);
    expect(r.trustNow()).toBe(1);
    expect(r.jobMoves()).toHaveLength(1);
    // Rewind to the row before the job's last one: the last row, and its move, go.
    const prior = questRows(r.db).at(-2)!;
    expect(before).toBe(0);
    await r.relay.rewind('hicks', prior.id);
    expect(r.run()!.done).toBe(false);
    expect(r.trustNow()).toBe(0);
    expect(r.jobMoves()).toHaveLength(0);
  });

  it("the debrief's trust line", async () => {
    const up = intakeRelay({ rolls: [10], trust: 4 });
    const row = await play(up, 'clean');
    expect(row.quest!.debrief!.trust).toEqual({ name: 'Nix', before: 'Sizing you up', after: 'Trusts you' });
    const flat = intakeRelay({ rolls: [10] });
    expect((await play(flat, 'clean')).quest!.debrief!.trust).toBeNull();
    const plain = intakeRelay({ rolls: [10], book: [parse(OWN_TEXT.replace('trust: 1 / 1\n', ''), 'held-papers')] });
    expect((await play(plain, 'clean')).quest!.debrief!.trust).toBeUndefined();
  });

  it('her closing note says trust moved', async () => {
    const up = intakeRelay({ rolls: [10], trust: 4 });
    await play(up, 'clean');
    expect(lastUser(up.backend.reqs.at(-1)!)).toContain('Their standing with you went up');
    const down = intakeRelay({ rolls: [95], trust: 5 });
    await play(down, 'blown');
    expect(lastUser(down.backend.reqs.at(-1)!)).toContain('Their standing with you went down');
    // Moved with no word change: still told.
    const nudge = intakeRelay({ rolls: [10] });
    await play(nudge, 'clean');
    expect(lastUser(nudge.backend.reqs.at(-1)!)).toContain('Their standing with you went up');
    // Nothing moved (MESSY, or clamped at the top): not told.
    const messy = intakeRelay();
    await play(messy, 'messy');
    expect(lastUser(messy.backend.reqs.at(-1)!)).not.toContain('Their standing with you went');
    const top = intakeRelay({ rolls: [10], trust: 10 });
    await play(top, 'clean');
    expect(lastUser(top.backend.reqs.at(-1)!)).not.toContain('Their standing with you went');
  });
});

describe('the Intake board: her clients line', () => {
  const clients = (r: ReturnType<typeof intakeRelay>) => /\[your clients\][^\n]*/.exec(lastUser(r.backend.reqs.at(-1)!))?.[0] ?? null;

  it('her clients line on a turn at the Intake', async () => {
    const r = intakeRelay();
    await r.relay.send('hicks', 'quiet night?');
    expect(clients(r)).toBe("[your clients] Tonight someone upstairs needs help: Held Papers — A woman upstairs owes a house. Bring it up if it fits the moment, or don't. Never say job, board or quest.");
  });

  it('two posted, both listed', async () => {
    const two = parse(OWN_TEXT.replace('title: Held Papers', 'title: Last Ferry').replace('pitch: A woman upstairs owes a house.', 'pitch: A man needs the night ferry.'), 'last-ferry');
    const r = intakeRelay({ book: [OWN, two] });
    await r.relay.send('hicks', 'quiet night?');
    expect(clients(r)).toContain('Held Papers — A woman upstairs owes a house.; Last Ferry — A man needs the night ferry.');
  });

  it('the line never carries a beat', async () => {
    const r = intakeRelay();
    await r.relay.send('hicks', 'quiet night?');
    expect(clients(r)).not.toContain('steel door');
    expect(clients(r)).not.toContain('ledger');
  });

  it('gone once the job starts, and outside the window', async () => {
    const r = intakeRelay();
    await r.relay.startQuest('hicks', 'held-papers');
    await r.relay.send('hicks', 'go on');
    expect(clients(r)).toBeNull();
    const late = intakeRelay({ clock: at(3, 0) });
    await late.relay.send('hicks', 'quiet night?');
    expect(clients(late)).toBeNull();
  });

  it('no line for another contact or another place', async () => {
    const hicks = intakeRelay({ contact: 'hicks' });
    await hicks.relay.send('hicks', 'quiet night?');
    expect(clients(hicks)).toBeNull();
    const away = intakeRelay({ place: 'haes-noodles' });
    await away.relay.send('hicks', 'quiet night?');
    expect(clients(away)).toBeNull();
  });
});

describe('the shipped Intake jobs (world/quests)', () => {
  const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
  const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
  for (const id of ['held-papers', 'on-the-stairs', 'last-ferry', 'cut-short']) {
    it(`${id}: parses with no warnings, is one of Nix's own on her shift, and starts at 22:00`, async () => {
      const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), live as never);
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      expect(r.warnings).toEqual([]);
      const q = r.entry;
      expect(q).toMatchObject({ kind: 'mission', tier: 1, starts: 'lowlight-intake', posts: [1200, 120], trust: [1, 1] });
      expect(ownedBy(q)).toBe('nix-direct');
      expect(q.payRange![0]).toBeGreaterThanOrEqual(50);
      expect(q.payRange![1]).toBeLessThanOrEqual(150);
      const relay = intakeRelay({ book: [q] });
      expect(await relay.relay.startQuest('hicks', id)).toMatchObject({ ok: true });
    });
  }
});

describe('final review fixes', () => {
  it('every shipped Intake job can be BLOWN, and a choice only she opens still carries a check', () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
    const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
    for (const id of ['held-papers', 'on-the-stairs', 'last-ferry', 'cut-short']) {
      const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), live as never);
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      expect([...r.entry.outcomes.values()].some((o) => o.effects.blown), `${id} has a blown ending`).toBe(true);
      for (const c of [...r.entry.beats.values()].flat().flatMap((b) => b.choices)) {
        const hers = c.tags.some((t) => t.kind === 'needs' && t.all.some((x) => x.kind === 'with'));
        if (hers) expect(c.check ?? c.crack ?? null, `${id}: ${c.id} carries a check`).not.toBeNull();
      }
    }
  });

  it('no clients line on an out-of-character turn', async () => {
    const r = intakeRelay();
    await r.relay.send('hicks', 'brb', 'ooc');
    expect(lastUser(r.backend.reqs.at(-1)!)).not.toContain('[your clients]');
  });
});

describe('posts: on quest lines (arrangement plan Task 1)', () => {
  it('posts: gates a quest line too', () => {
    const line = parse(
      '---\ntitle: Late Line\nwith: [nix-direct]\nstarts: lowlight-intake\nposts: 20:00-02:00\n---\n\n# one\n*A beat.*\n\nview any: Here.\n\n- a: A. → done\n- b: B. → done\n\n## done\n*Done.*\n→ end\n',
      'late-line',
    );
    const r = intakeRelay({ book: [line] });
    expect(r.relay.questState('hicks').open.map((q) => q.id)).toContain('late-line');
    r.setClock(at(3, 0));
    expect(r.relay.questState('hicks').open.map((q) => q.id)).not.toContain('late-line');
  });
});
