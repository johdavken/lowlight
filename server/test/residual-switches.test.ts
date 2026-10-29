import { describe, expect, it } from 'vitest';
import { residualMessages, type ResidualInput } from '../src/residual';
import { JOBS_APART } from '../src/instructions';
import type { Note } from '../../shared/types';

const note: Note = { id: 'n1', text: 'Owes Hae for noodles.', pinned: true, createdAt: 0, updatedAt: 0, editedBy: 'agent', about: 'you', keys: ['noodles'] };
const input = (o: Partial<ResidualInput> = {}): ResidualInput => ({
  kind: 'turn',
  self: { name: 'Nix', pronoun: 'she' },
  player: { id: 'hicks', name: 'Hicks' },
  roomLine: '[room: Lowlight Intake · desk-lamp "Desk lamp" 0.8]',
  standing: 'Wary (trust 0, warmth 1)',
  notes: [note],
  exchanges: [{ speaker: 'Hicks', text: 'Kill the lights.' }, { speaker: 'Nix', text: '*She leaves the lamp on.* No.' }],
  recap: 'Old recap.',
  page: 'Old page.',
  ...o,
});
const text = (i: ResidualInput) => residualMessages(i).map((m) => `── ${m.role}\n${m.content}`).join('\n');

describe('the game prompt stays as it was', () => {
  it('turn and end, with no new switches', async () => {
    await expect(`${text(input())}\n\n════\n\n${text(input({ kind: 'end' }))}\n`).toMatchFileSnapshot('__snapshots__/residual-game-prompt.txt');
  });
});

describe('the SillyTavern switches', () => {
  it('standing: false leaves the standing rule and key out', () => {
    const [system] = residualMessages(input({ standing: false }));
    expect(system.content).not.toContain('STANDING');
    expect(system.content).not.toContain('"standing"');
    expect(system.content).toContain('{"notes":[],"lights":[],"recap":null,"dossier":null}');
  });

  it('jobs: false leaves the jobs rule out', () => {
    expect(residualMessages(input({ jobs: false }))[0].content).not.toContain(JOBS_APART);
  });

  it('nights: false asks for no recap on a turn', () => {
    expect(residualMessages(input({ nights: false }))[0].content).not.toContain('RECAP:');
  });

  it('a recap run asks where things stand so far, with the recap now and no dossier', () => {
    const [system, user] = residualMessages(input({ kind: 'recap', standing: false, jobs: false }));
    expect(system.content).toContain(
      'RECAP: where things stand between Nix and Hicks so far, for when the chat runs long (up to 600 characters), carrying over what still holds from the recap now.',
    );
    expect(system.content).not.toContain('DOSSIER');
    expect(user.content).toContain('The recap now: Old recap.');
    expect(user.content).not.toContain('Old page.');
  });
});
