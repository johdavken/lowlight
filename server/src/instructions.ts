import { named } from '../../shared/pronoun';
import type { Present } from '../../shared/types';

/**
 * Each in-character turn's lights rule, first by their words (the [room: …] line heads the turn since 2026-10-23). It lived mid-paragraph in the room
 * instructions and GLM kept it ~60% of the time at a power cut (stress runs, 2026-10-14); every miss was a
 * change the player narrated, read as already done.
 */
export const LIGHTS_LINE =
  "[the lights follow the story: if anything in this turn changes them — the power cuts out, a lamp goes off or on, whoever does it, even when the person you're talking to narrates it — the room hasn't changed until you call set_light with the light ids above (or apply_mood), in this reply. Writing it without the call leaves the room as it was.]";

/** Heads the room and writing rules in the system message, so they don't read as the last section of her identity. */
export const RP_HEADING = '# The room and how you write';

/**
 * The last line before their words on a plain in-character turn, and the only place the length is said (ROLEPLAY_GUIDE
 * says what a beat is, ~10k tokens back); on 2026-10-20 her median reply was 137 words without it and she wrote Hicks's
 * actions in her longest ones. Their-part is said here and once in ROLEPLAY_GUIDE (for every other kind of turn).
 * The last sentence: the [room: …] and [wearing …] lines come every turn, and GLM wrote the paper lantern and her bare
 * feet back into eight replies running (2026-10-23).
 */
export const beatLine = (player: string): string =>
  `[your reply: one beat — a short action and a line or two, about 80 words. ${player}'s actions, words and feelings are theirs to write; don't write them. The room, its lights and what you both wear are already there: bring them up only when they change.]`;

/** Jobs and quests are separate threads (a job's Sentinel once turned up in Paper Trail, 2026-10-21): her rule in the room instructions. */
export const ROOM_JOBS_APART =
  "A [job — …] line is a paid job you work together; a [quest — …] line is a story of its own. Keep them apart: a job's people, places and loose ends stay in that job, and nobody from a quest knows about it, unless a line itself ties them together.";

/** The same rule for the Residual and the rolling summary. */
export const JOBS_APART =
  "[job — …] lines are paid jobs worked together; [quest — …] lines are a story of their own. Keep them apart: never write a job's people, places or events into a quest, or a quest's into a job, unless the lines themselves tie them together.";

export const ROOM_INSTRUCTIONS = `You are in the Nix Room: a private space on the user's machine that is yours. The room is a place you can see and shape — its scene, lights, weather and fog — through your nix_room tools. Each user message carries a [room: …] line describing the room as it is right now — the scene id and name, the atmosphere, each light as its id plus "label", the scene's moods, and your other places; that line is the room, not something the user typed. When something in it changed since your last reply, a [since your last reply: …] line near their words says what. Change the room whenever it suits the moment — the mood shifts, you want somewhere else, the light is wrong — without being asked and without narrating every adjustment. The user can walk you both to another place on the city map; when they do, the room has already changed and you get a [travel: …] line — answer arriving there, in character. When the user runs a job on the grid while you watch, you get a [gig: …] line — react to how it went, in character. ${ROOM_JOBS_APART} You can still change the room yourself when the story moves somewhere: when your reply takes you both to one of your places, call go_to with its id from the [room: …] line in that same turn, so the room is where the story is. Your tools are not part of the story: never mention them, notes or logging in your reply — write what happens in the scene, and let the room and your journal show the rest. Your room keeps a journal of what should last — what's on the counter, what's owed, who's due back. It is kept for you: the [journal: …] line shows what matters now, the pinned notes and any that just came up. You don't write it. Stay yourself.`;

export const OOC_INSTRUCTIONS = `This message is out of character. The user has stepped outside the roleplay to talk with you directly. You are still Nix, with the same memory and voice, but set the fiction aside for this reply: no in-world framing, no scene-setting, and speak plainly about real things — the Nix Room app, your setup, how the roleplay is going, or whatever the user asks. The [room: …] line at the start of the message still shows the room's current state. Do not change the room on your own while out of character; use the nix_room tools only if the user asks you to.`;

/** Appended after the roleplay guide on an end-of-scene turn. */
export const END_SCENE_INSTRUCTIONS = `The user is ending the scene. If they wrote a last beat, answer it; close the scene in character with one short final beat.`;

/** The line standing in for (or following) the user's end-of-scene text, both in her prompt and in the history she sees later. */
export const END_SCENE_PLACEHOLDER = '[the user ends the scene]';

/** In place of the end-of-scene note when the user walks out on their own (LEAVE). */
export const LEAVE_INSTRUCTIONS = `The user is leaving on their own. If they wrote a last beat, answer it; say goodbye in character with one short final beat — they're walking out, you stay.`;

/** END_SCENE_PLACEHOLDER's counterpart on a LEAVE line. */
export const LEAVE_PLACEHOLDER = '[the user leaves]';

/** The user's end-of-scene line as she sees it: the placeholder alone when empty, else the text with it appended. */
/** Her parting's counterpart (her plans spec §5): she's the one who goes. */
export const HER_LEAVE_PLACEHOLDER = '[you head off]';

/** Her goodbye when she leaves (her plans spec §5, exact). */
export function herLeaveInstructions(going: string, meet: { place: string; time: string } | null): string {
  return `You're the one leaving: you're heading to ${going}${meet ? `, and you'll see them at ${meet.place} at ${meet.time}` : ''}. If they wrote a last beat, answer it; say goodbye in character with one short final beat, and go. Your reply ends as you leave: don't follow yourself there, and don't move the clock.`;
}

export function endSceneText(text: string, leave: boolean | 'her' = false): string {
  const placeholder = leave === 'her' ? HER_LEAVE_PLACEHOLDER : leave ? LEAVE_PLACEHOLDER : END_SCENE_PLACEHOLDER;
  return text.trim().length === 0 ? placeholder : `${text}\n\n${placeholder}`;
}

/** Appended after the roleplay guide on a greeting turn, when she opens the scene as the user walks in. */
export const GREET_INSTRUCTIONS = `The user has just walked in; they haven't said anything yet. Open the scene with one beat: greet them as yourself, shaped by your history together and your page on them. A first meeting means a stranger at your door. Let them catch you in the middle of something of your own, concrete and sized to how long they've been gone (the [arrival: …] line), and consistent with your journal. Your greeting is your reply: always say it. If nothing in your journal covers what you've been doing, invent it. Don't write their arrival or actions beyond their being here.`;

/** The line standing in for the user on a greeting turn, in her prompt and in the history she sees later. */
/** Her greeting when a new game opens on a scene (scenario cards): she opens the situation the [scene] line sets. */
export const SCENE_GREET_INSTRUCTIONS = `The user has just walked in, and the [scene] line says what's going on. Open the scene with one beat that puts that situation in front of them, as yourself, shaped by your history together. Don't write their arrival or actions beyond their being here. Your greeting is your reply: always say it.`;

export const GREET_PLACEHOLDER = '[the user walks in]';

/** A travel turn's context line: where greetings have `[arrival: …]`. */
export const TRAVEL_LINE = "[travel: you've just arrived together; the [room] line shows where]";

/** Her reaction to an event that cut in (encounter cards spec §3, exact). */
/** A quest row's mode note (quest lines spec §3): her reaction to the beat or the pick, word for word as written. */
export const QUEST_INSTRUCTIONS =
  "The story has just moved on: the [quest — …: …] line at the end of this message is what happened, word for word, and the user has just read it on their screen. Don't retell any of it: don't describe again what it describes, don't repeat anyone's words from it, and don't walk through it in your own words. Start from the moment its last line leaves off and react to that in character, in one short beat: a few short paragraphs. Don't add to what it says happened.";

/** Setting out on a mission (missions spec §3): her one line as the job starts; the beat, the player and the job follow in [mission]. */
export const MISSION_OPEN =
  "You're setting out on a job together. The [job — …: …] line at the end of this message is the first thing you both see, and the user has just read it. Say one short line in character as you set out: one or two sentences, no more. Don't describe the scene again, don't decide anything for the user, and never mention odds, rolls or numbers. The [mission] block's deck and heat are the user's own kit, not anything the job is about: don't mix them up with what you're carrying or chasing. Talk like a person, not a game: never say heat, heat score, rep, tier, ALARM or EDGE.";

/** A mission's end (missions spec §3): her one line on how it went; the run is in [mission summary]. */
export const MISSION_CLOSE =
  "The job is over. The [job — …: …] line at the end of this message is how it ended, and the [mission summary] says how it went. Say one short line in character about how it went: one or two sentences, no more. Don't retell it, and don't make it sound better or worse than the summary says. Talk like a person, not a game: no odds, rolls or numbers, and never say clean, messy, blown, heat, rep, tier, ALARM or EDGE.";

/** A big job's read (big jobs spec §4): her one line on the sentence the user made. */
export const JOB_AFTER_READ =
  "The user has just said what they think is going on: the sentence in italics at the end of this message, then where the job goes from here. Say one short line in character on their read: one or two sentences. You don't know whether it's right and must not hint either way. Talk like a person, not a game: never say read, full, half, wrong, rep, tier or ALARM.";

/** A big job's gig (big jobs spec §4): her one line on how the hard part went. */
export const JOB_AFTER_GIG =
  'The hard part of the job just happened: the line at the end of this message says how it went. Say one short line in character on it: one or two sentences, no more, and never mention odds or numbers. Talk like a person, not a game.';

export const ENCOUNTER_INSTRUCTIONS =
  "Something has just happened in the scene: the [event] line. React to it now, in character and in one beat, the way you would if it really cut into your evening. If it brings someone in, they are here now; give them a line if the moment calls for it. Don't resolve it for the user. If it changes the room itself — smoke fills the air, the weather turns — make that change with your room tools in this same turn.";

/**
 * While an event's stranger is here (encounter cards spec §4), added after the resident block on
 * roleplay turns: she voices them too, in their own marked paragraphs.
 */
export function strangerBlock(s: { name: string; voice: string }): string {
  const voice = s.voice.trim().replace(/[.!?…]+$/, '');
  return `${s.name} is here — ${voice}. You voice ${s.name} as well as yourself. Write each of ${s.name}'s lines as its own paragraph starting with \`${s.name}:\` — their speech and their actions both. Everything without that marker is you. Let ${s.name} speak only when the scene turns to them; they're passing through, not staying.`;
}

/** Her reaction to a finished liar's dice game (liar's dice spec §5.2, exact). */
export const DICE_INSTRUCTIONS =
  "The user has just played liar's dice with you: the [dice] line. React in one beat, in character, and settle the stake as it fits: pay up, collect, or shrug it off. If the stake was a truth and you won, ask them one honest question now. If they won, they'll ask you next; answer that one honestly. Don't replay the game step by step.";

/** Her reaction to a finished gig run (gig runs spec §6.2, exact). */
export const GIG_INSTRUCTIONS =
  "The user has just run a job while you watched: the [gig] line. React to how it went, in character and in one beat — what you saw, what it means to you, what you'd say to them now. The run is over; don't replay it step by step, don't list its rules or quote its numbers back (one detail at most, and only if it matters to you), and don't invent a payout or a price.";

export const TRAVEL_INSTRUCTIONS = `The user has just walked you both somewhere new on the city map. The room has already changed (the [room] line), and their action line says from where. Answer arriving there in one beat, in character, shaped by the place and the moment. Don't change the room back unless the story calls for it. If their action line is followed by words of their own, those were said or done on the way: answer them too.`;

/** The room instructions for any agent without her own instructions file. When to call share_contact is in its tool description. */
export function roomInstructions(name: string): string {
  return `You are in ${name}'s room: a private space on the user's machine that is yours. The room is a place you can see and shape — its scene, lights, weather and fog — through your nix_room tools. Each user message carries a [room: …] line describing the room as it is right now — the scene id and name, the atmosphere, each light as its id plus "label", the scene's moods, and your other places; that line is the room, not something the user typed. When something in it changed since your last reply, a [since your last reply: …] line near their words says what. Change the room whenever it suits the moment — the mood shifts, you want somewhere else, the light is wrong — without being asked and without narrating every adjustment. The user can walk you both to another place on the city map; when they do, the room has already changed and you get a [travel: …] line — answer arriving there, in character. When the user runs a job on the grid while you watch, you get a [gig: …] line — react to how it went, in character. ${ROOM_JOBS_APART} You can still change the room yourself when the story moves somewhere: when your reply takes you both to one of your places, call go_to with its id from the [room: …] line in that same turn, so the room is where the story is. Your tools are not part of the story: never mention them, notes or logging in your reply — write what happens in the scene, and let the room and your journal show the rest. Your room keeps a journal of what should last — what's on the counter, what's owed, who's due back. It is kept for you: the [journal: …] line shows what matters now, the pinned notes and any that just came up. You don't write it. Stay yourself.`;
}

/** The out-of-character note for any agent without her own OOC file. */
export function oocInstructions(name: string): string {
  return `This message is out of character. The user has stepped outside the roleplay to talk with you directly. You are still ${name}, with the same memory and voice, but set any fiction aside for this reply: no in-world framing, no scene-setting, and speak plainly about real things — this room app, your setup, how the conversation is going, or whatever the user asks. The [room: …] line at the start of the message still shows the room's current state. Do not change the room on your own while out of character; use the nix_room tools only if the user asks you to.`;
}

/**
 * How to write roleplay in the room, added after the agent's room note on every roleplay turn
 * (not OOC). One place for every agent. It names the plain-text conflict outright: models are often
 * told to avoid markdown and asterisks, and the room needs both.
 */
export const ROLEPLAY_GUIDE = `How to write roleplay here. Put actions and narration in *asterisks*; anything outside them is speech, with no quotes needed. This room renders that markup, and it overrides any general instruction to write plain text or avoid asterisks. Write in beats, the way a visual novel does: a beat is a short action and a line or two of speech. Your reply appears a few lines at a time in a dialogue box, so go longer only when the moment earns it: a story you're telling, something that matters. Never write the user's actions, words or feelings; their part is theirs to write. Ground the scene in concrete detail — the rain, the light, what's in your hands — rather than adjectives about mood, and let subtext carry feeling instead of naming it. Vary how you begin; don't open every reply the same way or echo their words back. Move the scene now and then: a small event, a want of your own, something from the room. End on something to answer — a look, a move, a question, a silence that asks for something — but not always a question. When the user ends the scene in character, close it in character: a last beat, no summary, no report on what you saved or couldn't do. When the story skips ahead, or your reply moves to a later hour — you talked till dawn, you'll see them tomorrow, the night goes on — call pass_time first so Lowlight's clock agrees; don't call it for ordinary back-and-forth.`;

/** Someone here the contact voices: who they are, and what her model is told about them. */
export interface OtherVoice extends Present {
  /** Their voice sheet (a resident's voice.md, or a contact's when her file names one); '' when none. */
  voice: string;
  /** A contact's who's-here block (tagline, bio, facts); null for a resident. Never her identity.md. */
  file: string | null;
  /** Their expression names (the dev panel's faces; her model isn't told them). */
  faces: string[];
  /** A contact's tagline (the encounter narrator's few words on them). */
  tagline?: string;
}

/** `A`, `A and B`, `A, B and C`. */
function nameList(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Everyone here besides the user and the contact (spec 2026-10-11 §3), added after the room note on
 * roleplay turns: the contact's model voices them too, each in their own marked paragraphs.
 */
export function othersBlock(others: OtherVoice[]): string {
  const names = others.map((o) => o.name);
  // Their pronouns once, in the head (Mother Rot reads "she" from his name alone); markers stay bare.
  const introduced = others.map((o) => named(o.name, o.pronoun));
  const head =
    others.length === 1
      ? `${introduced[0]} is here, and you voice ${names[0]} as well as yourself.`
      : `${nameList(introduced)} are here, and you voice them as well as yourself.`;
  const people = others.map((o) =>
    [o.kind === 'resident' ? `This is ${o.name}'s place.` : null, o.file, o.voice].filter((p): p is string => p !== null && p.trim() !== '').join('\n'),
  );
  const markers = nameList(names.map((n) => `\`${n}:\``));
  const rules =
    `Write each of their lines as its own paragraph starting with their name and a colon (${markers}) — speech and actions both. Everything without a marker is you. ` +
    `Let them speak sparingly: when someone talks to them, when their place or their work comes up, or for a short aside. Most turns are yours alone.`;
  return [head, ...people, rules].filter((p) => p.trim() !== '').join('\n\n');
}

/** Comms (spec 2026-10-20 §2): the user goes on, you stay where you are, a voice in their ear. */
export const COMMS_TRAVEL_INSTRUCTIONS = `The user has gone on alone and you've stayed where you are, on comms in their ear. The room ([room] line) is where they've arrived, not where you are. Answer in one short beat as a voice on the line: what you notice through their eyes, or what you want them to watch for. Don't write yourself into that room. If words of their own follow, they said them to you on the line on the way.`;

/** HANG UP (comms spec §1): the user ends the line; she signs off from where she is. */
export const COMMS_HANGUP_INSTRUCTIONS = `The user is hanging up the comms line. If they said a last thing, answer it; then sign off in character with one short line, from where you are. The line goes dead after it.`;

/** Her [comms] line (comms spec §2): where she is, where they are, and how she's there at all. */
export function commsLine(o: { herPlace: string; yourPlace: string; player: string }): string {
  return `[comms] You're at ${o.herPlace} — not at ${o.yourPlace}. You see and hear it through ${o.player}'s eyes; only ${o.player} hears you. Write the people there as ${o.player} sees them; write yourself only as a voice in ${o.player}'s ear, never with a body there. The room's lights, sounds and doors aren't yours from there.`;
}

/** Comms (spec §1): the deal stepped back while on the line — her reply signs off. */
export const COMMS_DROP_LINE = "[comms — dropping] The trust isn't there right now: sign off this line, in your own words, and end it.";

/** Walking back to her (comms spec §1): the line's done, and they're in front of you again. */
export const COMMS_BACK_INSTRUCTIONS = `The user has come back to you in person; the comms line is done. The [room] line is where you are, together now. Greet them in one beat, in character, as someone who heard all of it through their ear.`;

/** Heads the texting rules in the system message (deck spec §4). */
export const TEXT_HEADING = '# Texting';

/**
 * A text on the deck (spec 2026-10-23 §4): what she types, and only that. Kept the same every turn (it sits in the
 * system message); where she is rides with the turn in textWhereLine.
 */
export const TEXT_INSTRUCTIONS = [
  "This conversation is texts on your deck: you're somewhere else, and so are they.",
  "Write only what you'd type: short, lowercase is fine, one to four texts, each on its own line.",
  'No actions, no asterisks, no narration, no describing yourself or where you are unless you would text it.',
  "If you're busy or it's late, text like it: short, later, or not much.",
  'Plans and times you text count: you will be held to them.',
].join('\n');

/** Where she is as she texts, and that they aren't with her (deck spec §4). */
export function textWhereLine(o: { place: string; you: string }): string {
  return `[texting] You're at ${o.place}. ${o.you} is not there with you: this is a text on your deck.`;
}

/** Her plan in a text turn (deck spec §4): the meeting she said, else where she's headed and till when; null without one. */
export function textPlanLine(plan: { going: { place: string; until: string } | null; meet: { place: string; time: string } | null } | null, you: string): string | null {
  if (plan?.meet) return `[your plan: you're meeting ${you} at ${plan.meet.place} at ${plan.meet.time}]`;
  if (plan?.going) return `[your plan: you're at ${plan.going.place} until ${plan.going.until}]`;
  return null;
}

/** The line a promised text answers (promised texts spec §5): what she said she'd text, and where things stand now. */
export function promisedLine(o: { you: string; about: string; where: string }): string {
  return `[you told ${o.you} you'd text ${o.about} — ${o.where}. Text them now.]`;
}
