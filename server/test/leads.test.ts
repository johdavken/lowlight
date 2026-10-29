import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLeadBook } from '../src/leads';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { okStep, startStubOpenRouter } from './fixtures/stub-openrouter';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const lead = (from: string, to: string, after?: string) =>
  `---\ntitle: T\nfrom: ${from}\nto: ${to}\nkeys: [xx]\n${after ? `after: ${after}\n` : ''}fill: y\n---\n## On her mind\nm\n## Giver knows\ng\n## Receiver knows\nr\n`;

describe('loadLeadBook', () => {
  it('loads good files, warns and skips bad ones and broken chains', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-'));
    fs.writeFileSync(path.join(dir, 'a.md'), lead('cass', 'hicks'));
    fs.writeFileSync(path.join(dir, 'b.md'), lead('cass', 'nobody'));
    fs.writeFileSync(path.join(dir, 'c.md'), lead('hicks', 'cass', 'missing'));
    fs.writeFileSync(path.join(dir, 'd.md'), lead('hicks', 'cass', 'a'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const warnings: string[] = [];
    const book = loadLeadBook(dir, new Set(['cass', 'hicks']), (m) => warnings.push(m));
    expect(book.map((e) => e.id)).toEqual(['a', 'd']);
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toMatch(/b\.md.*to/);
    expect(warnings.join('\n')).toMatch(/c\.md.*after/);
  });

  it('a missing folder is an empty book', () => {
    expect(loadLeadBook('/nonexistent/leads', null, () => {})).toEqual([]);
  });
});

describe('the game with a lead book', () => {
  it("the giver's turn carries her side once it's mentioned; once held, the receiver's carries his", async () => {
    const or = await startStubOpenRouter([], { fallback: okStep('ok') });
    cleanups.push(() => or.close());
    const { cfg } = await makeFixture([
      { id: 'nix', direct: true, pack: 'karasu' },
      { id: 'cass', direct: true, pack: 'karasu' },
    ], undefined, { openrouterUrl: or.url });
    fs.mkdirSync(cfg.leadsDir!, { recursive: true });
    fs.writeFileSync(path.join(cfg.leadsDir!, 'teo-debt.md'), lead('nix', 'cass').replace('keys: [xx]', 'keys: [teo]').replace('## Giver knows\ng', '## Giver knows\nTeo borrowed.'));
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const player = built.world.active()!.player;
    // The lead blocks ride at the start of the latest user message (cache order), not in the system message.
    const system = () => (or.requests.filter((r) => r.url.endsWith('/v1/chat/completions')).at(-1)!.body as { messages: { content: string }[] }).messages.at(-1)!.content;

    const nix = (await built.runtime('nix'))!;
    await nix.relay.send(player, 'how are you?');
    expect(system()).toContain('[on your mind: m.');
    expect(system()).not.toContain('[a lead you could give');
    await nix.relay.send(player, 'and Teo?');
    expect(system()).toContain('[a lead you could give — T: Teo borrowed.');

    const last = nix.db.allMessages(player).at(-1)!;
    nix.db.giveLead({ id: 'teo-debt', player, details: 'Teo owes 4k', messageId: last.id, at: 1 });
    const cass = (await built.runtime('cass'))!;
    await cass.relay.send(player, 'evening');
    expect(system()).toContain('[if they raise it — T: what you know is: r. What they may have heard: Teo owes 4k.');
    await nix.relay.send(player, 'bye');
    expect(system()).not.toContain('[on your mind');
  });

  it('regenerating the reply that gave a lead offers it again in the new take (review I1)', async () => {
    const { built, or } = await game();
    const player = built.world.active()!.player;
    const nix = (await built.runtime('nix'))!;
    await nix.relay.send(player, 'and Teo?');
    const reply = nix.db.allMessages(player).at(-1)!;
    nix.db.giveLead({ id: 'teo-debt', player, details: 'Teo owes 4k', messageId: reply.id, at: 1 });
    await nix.relay.regenerate(player, reply.id);
    expect(lastSystem(or)).toContain('[a lead you could give — T:');
  });

  it('without a playthrough no lead is live (review I2)', async () => {
    const { built, or } = await game((c) => (c.autoPlaythrough = false));
    expect(built.world.active()).toBeNull();
    const nix = (await built.runtime('nix'))!;
    await nix.relay.send(built.world.players.defaultId, 'and Teo?');
    expect(lastSystem(or)).not.toContain('[on your mind');
    expect(lastSystem(or)).not.toContain('[a lead you could give');
  });
});

/** The latest user message of the last turn: where the lead blocks ride. */
const lastSystem = (or: { requests: { url: string; body: unknown }[] }) =>
  (or.requests.filter((r) => r.url.endsWith('/v1/chat/completions')).at(-1)!.body as { messages: { content: string }[] }).messages.at(-1)!.content;

/** nix (gives teo-debt, keys [teo]) and cass on a stub that answers "ok". */
async function game(prepare?: (cfg: import('../src/config').Config) => void) {
  const or = await startStubOpenRouter([], { fallback: okStep('ok') });
  cleanups.push(() => or.close());
  const { cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  prepare?.(cfg);
  fs.mkdirSync(cfg.leadsDir!, { recursive: true });
  fs.writeFileSync(path.join(cfg.leadsDir!, 'teo-debt.md'), lead('nix', 'cass').replace('keys: [xx]', 'keys: [teo]'));
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  return { built, or };
}
