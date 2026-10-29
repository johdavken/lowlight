import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLEPLAY_GUIDE, MISSION_OPEN, MISSION_CLOSE, ROOM_JOBS_APART, DICE_INSTRUCTIONS, LIGHTS_LINE, ENCOUNTER_INSTRUCTIONS, GIG_INSTRUCTIONS, LEAVE_INSTRUCTIONS, HER_LEAVE_PLACEHOLDER, herLeaveInstructions, ROOM_INSTRUCTIONS, endSceneText, roomInstructions, othersBlock, strangerBlock, type OtherVoice } from '../src/instructions';

const LIGHTS_RULE =
  "The lights work the same way: when the story changes them — the power cuts out, a lamp is switched off or on, whoever does it — call set_light with the light ids from the [room: …] line (or apply_mood) in that same turn; writing it without the call leaves the room as it was.";
const NOTES_RULE =
  "Your room keeps a journal of what should last — what's on the counter, what's owed, who's due back. It is kept for you: the [journal: …] line shows what matters now, the pinned notes and any that just came up. You don't write it.";
const TOOLS_UNSEEN_RULE =
  'Your tools are not part of the story: never mention them, notes or logging in your reply — write what happens in the scene, and let the room and your journal show the rest.';
const nix = () => readFileSync('characters/nix/instructions.md', 'utf8');

describe('room instructions know about travel', () => {
  it.each([
    ['ROOM_INSTRUCTIONS', () => ROOM_INSTRUCTIONS],
    ['roomInstructions', () => roomInstructions('Cass')],
    ["Nix's instructions.md", nix],
  ])('%s says the user can walk you both, and no longer that only she moves the room', (_n, text) => {
    expect(text()).toContain('The user can walk you both to another place on the city map');
    expect(text()).not.toContain('The user cannot change the room');
  });

  it.each([
    ['ROOM_INSTRUCTIONS', () => ROOM_INSTRUCTIONS],
    ['roomInstructions', () => roomInstructions('Cass')],
    ["Nix's instructions.md", nix],
  ])('%s no longer carries the lights rule (moved to the per-turn lights line, 2026-10-14) but keeps the notes rule', (_n, text) => {
    expect(text()).not.toContain(LIGHTS_RULE);
    expect(text()).toContain(NOTES_RULE);
  });

  it.each([
    ['ROOM_INSTRUCTIONS', () => ROOM_INSTRUCTIONS],
    ['roomInstructions', () => roomInstructions('Cass')],
    ["Nix's instructions.md", nix],
  ])('%s keeps the tools out of the story (Silas: "*sets the scene as we head out*")', (_n, text) => {
    expect(text()).toContain(TOOLS_UNSEEN_RULE);
  });

  it('the lights line: a change in this turn, even one the other person narrates, needs the call', () => {
    expect(LIGHTS_LINE.startsWith('[')).toBe(true);
    expect(LIGHTS_LINE).toContain('set_light');
    expect(LIGHTS_LINE).toContain('apply_mood');
    expect(LIGHTS_LINE).toMatch(/even when the person you're talking to narrates it/);
  });

  it('Nix keeps her apartment hers to offer', () => {
    expect(nix()).toContain("The map can't take the user to your apartment; only you can bring them, by invitation.");
  });
});

describe('othersBlock', () => {
  const hae: OtherVoice = { id: 'hae', kind: 'resident', name: 'Hae', pronoun: 'she', voice: 'HAE VOICE', file: null, faces: ['happy'] };
  const silas: OtherVoice = { id: 'silas', kind: 'contact', name: 'Silas', pronoun: 'he', voice: '', file: "[who's here: Silas — Second Socket counter]", faces: ['annoyed'] };

  it('one resident: says she is here and it is her place, gives her voice, and how to mark her lines sparingly', () => {
    const block = othersBlock([hae]);
    expect(block).toContain('Hae (she) is here, and you voice Hae as well as yourself.');
    expect(block).toContain("This is Hae's place");
    expect(block).toContain('HAE VOICE');
    expect(block).toContain('`Hae:`');
    expect(block).toContain('sparingly');
    expect(block).toContain('Most turns are yours alone');
    // Their part is ROLEPLAY_GUIDE's rule (and the beat line's), not repeated here.
    expect(block).not.toContain('Never write the user');
    expect(block).not.toContain('set_expression');
  });

  it('a resident and a contact: both named, each described, each marker given', () => {
    const block = othersBlock([hae, silas]);
    expect(block).toContain('Hae (she) and Silas (he) are here');
    expect(block).toContain('HAE VOICE');
    expect(block).toContain("[who's here: Silas — Second Socket counter]");
    expect(block).toContain('`Hae:`');
    expect(block).toContain('`Silas:`');
    expect(block).not.toContain("This is Silas's place");
    expect(block).not.toContain('set_expression');
  });

  it('three names read as a list', () => {
    expect(othersBlock([hae, silas, { ...silas, id: 'ember', name: 'Ember' }])).toContain('Hae (she), Silas (he) and Ember (he) are here');
  });

  it('never tells her to change their faces (faces come from the *actions*)', () => {
    expect(othersBlock([hae, silas])).not.toContain('face');
  });
});

describe('gigs', () => {
  it('DICE_INSTRUCTIONS, exactly', () => {
    expect(DICE_INSTRUCTIONS).toBe(
      "The user has just played liar's dice with you: the [dice] line. React in one beat, in character, and settle the stake as it fits: pay up, collect, or shrug it off. If the stake was a truth and you won, ask them one honest question now. If they won, they'll ask you next; answer that one honestly. Don't replay the game step by step.",
    );
  });

  it('GIG_INSTRUCTIONS, exactly', () => {
    expect(GIG_INSTRUCTIONS).toBe(
      "The user has just run a job while you watched: the [gig] line. React to how it went, in character and in one beat — what you saw, what it means to you, what you'd say to them now. The run is over; don't replay it step by step, don't list its rules or quote its numbers back (one detail at most, and only if it matters to you), and don't invent a payout or a price.",
    );
  });
  it('the room instructions keep [job] and [quest] lines apart', () => {
    expect(ROOM_INSTRUCTIONS).toContain(ROOM_JOBS_APART);
    expect(roomInstructions('Cass')).toContain(ROOM_JOBS_APART);
  });
  it('the job notes name the [job] line', () => {
    for (const t of [MISSION_OPEN, MISSION_CLOSE]) {
      expect(t).toContain('The [job — …: …] line');
      expect(t).not.toContain('[quest');
    }
  });
  it('the room instructions say what a [gig] line is', () => {
    expect(ROOM_INSTRUCTIONS).toContain('When the user runs a job on the grid while you watch, you get a [gig: …] line — react to how it went, in character.');
  });
});

describe('her leaving (her plans spec §5)', () => {
  it('herLeaveInstructions, exactly', () => {
    expect(herLeaveInstructions("Nix's flat", { place: "Hae's Noodles", time: '21:00' })).toBe(
      "You're the one leaving: you're heading to Nix's flat, and you'll see them at Hae's Noodles at 21:00. If they wrote a last beat, answer it; say goodbye in character with one short final beat, and go. Your reply ends as you leave: don't follow yourself there, and don't move the clock.",
    );
    expect(herLeaveInstructions('the Tilt', null)).toBe(
      "You're the one leaving: you're heading to the Tilt. If they wrote a last beat, answer it; say goodbye in character with one short final beat, and go. Your reply ends as you leave: don't follow yourself there, and don't move the clock.",
    );
  });
  it('her parting has its own placeholder', () => {
    expect(HER_LEAVE_PLACEHOLDER).toBe('[you head off]');
    expect(endSceneText('', 'her')).toBe('[you head off]');
    expect(endSceneText('wait', 'her')).toBe('wait\n\n[you head off]');
  });
});

describe('encounters', () => {
  it('ENCOUNTER_INSTRUCTIONS, exactly', () => {
    expect(ENCOUNTER_INSTRUCTIONS).toBe(
      "Something has just happened in the scene: the [event] line. React to it now, in character and in one beat, the way you would if it really cut into your evening. If it brings someone in, they are here now; give them a line if the moment calls for it. Don't resolve it for the user. If it changes the room itself — smoke fills the air, the weather turns — make that change with your room tools in this same turn.",
    );
  });

  it('strangerBlock, exactly; a voice ending on a stop gets no second one', () => {
    const block =
      "Courier is here — clipped, nervous. You voice Courier as well as yourself. Write each of Courier's lines as its own paragraph starting with `Courier:` — their speech and their actions both. Everything without that marker is you. Let Courier speak only when the scene turns to them; they're passing through, not staying.";
    expect(strangerBlock({ name: 'Courier', voice: 'clipped, nervous' })).toBe(block);
    expect(strangerBlock({ name: 'Courier', voice: 'clipped, nervous.' })).toBe(block);
  });
});

describe('endSceneText', () => {
  it('a leave line ends with the leave placeholder; a plain end with the end one', () => {
    expect(endSceneText('', true)).toBe('[the user leaves]');
    expect(endSceneText('bye', true)).toBe('bye\n\n[the user leaves]');
    expect(endSceneText('bye')).toBe('bye\n\n[the user ends the scene]');
  });

  it('the leave note says they walk out and she stays; the scribe does the saving (scribe spec)', () => {
    expect(LEAVE_INSTRUCTIONS).toContain("they're walking out, you stay");
    for (const tool of ['set_recap', 'update_dossier']) expect(LEAVE_INSTRUCTIONS).not.toContain(tool);
  });
});

describe('the roleplay guide and the clock', () => {
  it('pass_time: also when her reply moves to a later hour (time backstop 2026-10-20)', () => {
    expect(ROLEPLAY_GUIDE).toContain("When the story skips ahead, or your reply moves to a later hour — you talked till dawn, you'll see them tomorrow, the night goes on — call pass_time first so Lowlight's clock agrees; don't call it for ordinary back-and-forth.");
    expect(ROLEPLAY_GUIDE).not.toContain('When the story skips ahead — you talked till dawn');
  });
});

describe('texting (deck spec §4)', () => {
  it('the rules ask for plain texts, one per line, with no actions, and name no pronoun', async () => {
    const { TEXT_INSTRUCTIONS, TEXT_HEADING } = await import('../src/instructions');
    expect(TEXT_HEADING).toBe('# Texting');
    expect(TEXT_INSTRUCTIONS).toContain('each on its own line');
    expect(TEXT_INSTRUCTIONS).toContain('No actions, no asterisks');
    expect(TEXT_INSTRUCTIONS).not.toMatch(/\b(she|her|he|him|his)\b/i);
  });
  it('textWhereLine names where she is and who is not there', async () => {
    const { textWhereLine } = await import('../src/instructions');
    expect(textWhereLine({ place: 'the Tilt', you: 'Cass' })).toBe("[texting] You're at the Tilt. Cass is not there with you: this is a text on your deck.");
  });
});
