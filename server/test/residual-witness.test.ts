import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { applyResidual, parseResidualAnswer, residualMessages, type ResidualAnswer, type ResidualInput } from '../src/residual';
import { ResidualRunner, RESIDUAL_WITNESS_TOKENS, sceneOthers, witnessesApply, witnessSceneFor, type ResidualRunnerDeps } from '../src/residual-runner';
import { standingControl } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';
import { parseWitness, WITNESS_MAX, witnessKey } from '../../shared/witness';
import { storyDay } from '../../shared/board';
import type { ChatMessage } from '../../shared/types';

// Witness lines spec §2: the Residual names who saw what.
const P = 'hicks';
const CLOCK = 360 + 1440 * 3 + 900;
const KEY = witnessKey(P, 'ember', storyDay(CLOCK));
const FLAT = 'karasu/zhou-flat';
let db: Db;
let journal: Journal;
beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  journal = new Journal(db, () => 1);
});
const empty: ResidualAnswer = { notes: [], standing: null, lights: [], time: null, plan: null, recap: null, dossier: null };
const input = (over: Partial<ResidualInput> = {}): ResidualInput => ({
  kind: 'turn',
  self: { name: 'Silas', pronoun: 'he' },
  player: { id: P, name: 'Hicks' },
  roomLine: '[room: the flat]',
  standing: null,
  notes: [],
  exchanges: [{ speaker: 'Silas', text: 'Three nights.' }],
  recap: null,
  page: null,
  ...over,
});
const HERE = [{ id: 'ember', name: 'Ember', carried: null }];
const text = (i: ResidualInput) => residualMessages(i).map((m) => m.content).join('\n');

describe('the prompt', () => {
  it('nobody here: the prompt is what it was', () => {
    expect(residualMessages(input({ here: [] }))).toEqual(residualMessages(input()));
  });
  it('someone here: the line and the rule', () => {
    const all = text(input({ here: HERE }));
    expect(all).toContain('[here too: ember "Ember"]');
    expect(all).toContain('WITNESSES:');
    // Silas's Residual wrote the job for Ember and nothing of what she said from the doorway (playtest).
    expect(all).toContain('what they said or did comes first');
    expect(all).toContain('"witnesses":[{"id"');
    expect(all).toContain('"witnesses":[],"recap":null');
    expect(all).toContain('Anyone in [here too] who speaks or is spoken to carries something');
    expect(all).toContain('the one new thing');
    expect(all).toContain('never repeat');
    expect(all).toContain("who sleeps where");
    expect(all).not.toContain('It replaces');
    expect(all).not.toContain('Most turns, nobody');
  });
  it('shows what they carry today', () => {
    expect(text(input({ here: [{ ...HERE[0], carried: 'He came about the reel.' }] }))).toContain('[here too: ember "Ember" (so far today: He came about the reel.)]');
  });
});

describe('parse', () => {
  it('reads witnesses', () => {
    expect(parseResidualAnswer('{"witnesses":[{"id":"ember","saw":"He came."}]}').answer!.witnesses).toEqual([{ id: 'ember', saw: 'He came.' }]);
    expect(parseResidualAnswer('{}').answer!.witnesses).toBeUndefined();
  });
});

describe('apply', () => {
  const at = { messageId: 'a1', take: 0, kind: 'turn' as const };
  const deps = (set: (id: string, t: string) => void) => ({ journal, player: P, standing: null, setLight: () => ({ ok: true as const, text: '' }), db, witness: { here: new Set(['ember']), set } });
  it('a bad id is refused and a good one lands', () => {
    const got: [string, string][] = [];
    const r = applyResidual(deps((i, t) => got.push([i, t])), { ...empty, witnesses: [{ id: 'hae', saw: 'x' }, { id: 'ember', saw: 'y' }] }, at);
    expect(got).toEqual([['ember', 'y']]);
    expect(r.refused).toContain("witness refused: hae isn't here");
    expect(r.applied).toContain('witness ember');
  });
  it('cuts the text to one short line', () => {
    const got: string[] = [];
    applyResidual(deps((_, t) => got.push(t)), { ...empty, witnesses: [{ id: 'ember', saw: 'x'.repeat(400) }] }, at);
    expect(got[0]).toHaveLength(WITNESS_MAX);
  });
  it('without the dep, witnesses are refused', () => {
    const { witness: _none, ...d } = deps(() => {});
    expect(applyResidual(d, { ...empty, witnesses: [{ id: 'ember', saw: 'y' }] }, at).refused).toContain("witness refused: ember isn't here");
  });
});

describe('witnessesApply', () => {
  const reply = { clock: 100 } as ChatMessage;
  it('a stamped turn, her goodbye too', () => {
    expect(witnessesApply(reply, {} as ChatMessage, false)).toBe(true);
    expect(witnessesApply(reply, { parting: 'her' } as ChatMessage, false)).toBe(true);
  });
  it('never OOC, a text, comms or an unstamped reply', () => {
    expect(witnessesApply(reply, { mode: 'ooc' } as ChatMessage, false)).toBe(false);
    expect(witnessesApply(reply, { mode: 'text' } as ChatMessage, false)).toBe(false);
    expect(witnessesApply(reply, {} as ChatMessage, true)).toBe(false);
    expect(witnessesApply({} as ChatMessage, {} as ChatMessage, false)).toBe(false);
  });
});

describe('the runner', () => {
  let answers: string[];
  let sent: string[];
  let caps: number[];
  let seq: number;
  const exchange = (reply: string) => {
    seq += 1;
    db.insertMessage(P, { id: `u${seq}`, role: 'user', text: 'hm', toolLines: [], ts: 1000 * seq, status: 'ok' });
    const m: ChatMessage = { id: `a${seq}`, role: 'agent', text: reply, toolLines: [], ts: 1000 * seq + 1, status: 'ok' };
    db.insertMessage(P, m);
    return m;
  };
  const runner = (hold: () => Promise<void> = async () => {}) => {
    const d: ResidualRunnerDeps = {
      db,
      journal,
      selfName: 'Silas',
      selfPronoun: 'he',
      playerName: () => 'Hicks',
      roomLine: () => '[room: the flat]',
      standing: () => standingControl({ db, player: () => P, start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }),
      standingLine: () => null,
      setLight: () => ({ ok: true, text: '' }),
      complete: async (messages, o) => {
        caps.push(o.maxTokens);
        await hold();
        sent.push(messages.map((m) => m.content).join('\n'));
        return { text: answers.shift() ?? '{"notes":[]}' };
      },
      log: () => {},
      now: () => 0,
    };
    return new ResidualRunner(d);
  };
  const SCENE = { clock: CLOCK, scene: FLAT, others: [{ id: 'ember', name: 'Ember' }] };
  const saw = (s: string) => JSON.stringify({ notes: [], witnesses: [{ id: 'ember', saw: s }] });
  beforeEach(() => {
    answers = [];
    sent = [];
    caps = [];
    seq = 0;
  });

  it('writes the entry, and a later turn the same day adds to it and sees it', async () => {
    const r = runner();
    answers.push(saw('He came about the reel.'));
    r.afterTurn(P, { id: exchange('One.').id, take: 0 }, 'turn', undefined, SCENE);
    await r.wait();
    expect(parseWitness(db.getMeta(KEY))).toEqual({ text: 'He came about the reel.', at: CLOCK, scene: FLAT });
    answers.push(saw('He took the job.'));
    r.afterTurn(P, { id: exchange('Two.').id, take: 0 }, 'turn', undefined, SCENE);
    await r.wait();
    expect(sent[1]).toContain('(so far today: He came about the reel.)');
    expect(parseWitness(db.getMeta(KEY))?.text).toBe('He came about the reel. He took the job.');
  });
  it('a rewind brings back what the turn before wrote', async () => {
    const r = runner();
    const a1 = exchange('One.');
    answers.push(saw('First.'));
    r.afterTurn(P, { id: a1.id, take: 0 }, 'turn', undefined, SCENE);
    await r.wait();
    answers.push(saw('Second.'));
    r.afterTurn(P, { id: exchange('Two.').id, take: 0 }, 'turn', undefined, SCENE);
    await r.wait();
    db.cutAfter(P, a1.id);
    expect(parseWitness(db.getMeta(KEY))?.text).toBe('First.');
  });
  it('a queued turn keeps the scene it was taken with, wherever the room has gone (fresh review)', async () => {
    let free!: () => void;
    const gate = new Promise<void>((res) => (free = res));
    const r = runner(async () => {
      await gate;
    });
    r.afterTurn(P, { id: exchange('One.').id, take: 0 }, 'turn');
    answers.push('{"notes":[]}', saw('He took the job.'));
    r.afterTurn(P, { id: exchange('Two.').id, take: 0 }, 'turn', undefined, SCENE);
    free();
    await r.waitAll();
    expect(parseWitness(db.getMeta(KEY))).toEqual({ text: 'He took the job.', at: CLOCK, scene: FLAT });
  });
  it('a witness turn has room for the answer (live: 600 ran out and the notes went too)', async () => {
    const r = runner();
    r.afterTurn(P, { id: exchange('One.').id, take: 0 }, 'turn');
    await r.wait();
    r.afterTurn(P, { id: exchange('Two.').id, take: 0 }, 'turn', undefined, SCENE);
    await r.wait();
    expect(caps[1]).toBe(caps[0] + RESIDUAL_WITNESS_TOKENS);
  });
  it('an end job sends no [here too]', async () => {
    const r = runner();
    r.afterTurn(P, { id: exchange('Night.').id, take: 0 }, 'end', undefined, SCENE);
    await r.wait();
    expect(sent[0]).not.toContain('[here too:');
  });
});

describe('sceneOthers', () => {
  const ember = { id: 'ember', kind: 'contact' as const, name: 'Ember', pronoun: 'she' as const };
  const hae = { id: 'hae', kind: 'resident' as const, name: 'Hae', pronoun: 'she' as const };
  const line = '*He nods.*\n\nEmber: Told you.';
  it('someone the clock puts here counts, speaking or not', () => {
    expect(sceneOthers('*He nods.*', [ember], [ember])).toEqual([{ id: 'ember', name: 'Ember' }]);
  });
  it('someone a job wrote in counts when they speak (playtest: the clock had her at the Tilt)', () => {
    expect(sceneOthers(line, [], [ember])).toEqual([{ id: 'ember', name: 'Ember' }]);
  });
  it('a line mid-paragraph counts (live: GLM runs them on)', () => {
    expect(sceneOthers('*She crosses her heart.* Ember: Not a word.', [], [ember])).toEqual([{ id: 'ember', name: 'Ember' }]);
  });
  it('once, when both say so', () => {
    expect(sceneOthers(line, [ember], [ember])).toEqual([{ id: 'ember', name: 'Ember' }]);
  });
  it('being talked about is not being here', () => {
    expect(sceneOthers("*He glances at Ember's door.* She's at the Tilt.", [], [ember])).toEqual([]);
  });
  it('a resident never counts', () => {
    expect(sceneOthers('Hae: More tea?', [hae], [hae])).toEqual([]);
  });
});

describe('witnessSceneFor', () => {
  const ember = { id: 'ember', kind: 'contact' as const, name: 'Ember', pronoun: 'she' as const };
  const reply = { clock: 100, text: '*He nods.*' } as ChatMessage;
  const base = { reply, line: {} as ChatMessage, comms: false, beatRoom: undefined, scene: FLAT, present: [ember], voices: [ember] };
  it('takes who was here', () => {
    expect(witnessSceneFor(base)).toEqual({ clock: 100, scene: FLAT, others: [{ id: 'ember', name: 'Ember' }] });
  });
  it('nobody here: nothing', () => expect(witnessSceneFor({ ...base, present: [] })).toBeNull());
  it("a room: beat isn't this room: the contact is on the line (final review)", () => {
    expect(witnessSceneFor({ ...base, beatRoom: 'nexus/spectra-archive' })).toBeNull();
  });
  it('a beat with the contact on the line is elsewhere too', () => expect(witnessSceneFor({ ...base, beatComms: true })).toBeNull());
});
