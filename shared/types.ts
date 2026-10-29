import type { Pronoun } from './pronoun';
import type { Band, Risk, Specialty } from './crew-book';
import type { CrewOdds, ErrandInstance, HireCard, LoyaltyWord } from './crew';
import type { CrewMember, CrewResult } from './crew-fold';
import type { DiceSettings } from './dice/opponent';
import type { Stats } from './stats';
import type { Odds } from './mission';
import type { Roll } from './quests';
import type { Deck } from './gear';
import type { TerminalSetup } from './crack';
import type { Outage } from './outage';
import type { Encounter } from './encounter';
import type { GigSnapshot } from './gig/brief';
import type { Brief, GigKind, GigResult } from './gig/brief';
import type { DiceSnapshot } from './dice/text';
import type { RoundRecord } from './dice/rules';
import type { PlaythroughPersona } from './persona';
import type { SceneMusic } from './music';
import type { Shape } from './weather-area';
export type Hex = string;

/** One line of a character's select-screen dossier. */
export interface Fact {
  label: string;
  value: string;
}

/** A point on a sprite, as fractions of its size (0..1). */
export interface Face {
  x: number;
  y: number;
}
export type Weather = 'none' | 'rain' | 'snow' | 'ash' | 'dust';
export type TimeOfDay = 'dusk' | 'night' | 'late-night' | 'dawn';
export type Transition = 'fade' | 'glitch';
/** `world`: Lowlight moved her room (her schedule), not a journey: no travel turn, no checkpoint. */
export type Source = 'agent' | 'dev' | 'user' | 'world';

/** Who last edited a journal note: the agent (her tools) or the player (the panel, or a dev action). */
export type JournalEditor = 'agent' | 'user';

/** One entry in an agent's room journal. */
export interface Note {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  editedBy: JournalEditor;
  /** Whose note: 'me' = her own journal (shared by every visitor), 'you' = the current visitor's dossier. Derived from the stored owner. */
  about: 'me' | 'you';
  /** What brings it back when it comes up (scribe spec §5); read back as [] when none. Optional on writes. */
  keys?: string[];
}

export interface LayerDef {
  id: string;
  src: string;
  parallax: number;
  emissive?: string;
  /** Per-light glow maps (light id → PNG path), drawn scaled by that light's current intensity. */
  emissiveLights?: Record<string, string>;
}

export interface LightDef {
  id: string;
  label: string;
  pos: [number, number];
  color: Hex;
  intensity: number;
  radius: number;
  flicker: number;
  /** A neon/electric light buzzes (and crackles with its flicker). Lamps and screens stay silent. */
  sound?: 'neon';
  /** Slow dust motes drift in this light's pool, following its brightness: an amount (1 = 100%, up to 3), or true for 100%. */
  dust?: boolean | number;
  /** Light from outside the room (the city through a window): turning it off doesn't dim the room. */
  outside?: boolean;
  /** Room state only: the level the room or its last preset set, which turning the light down dims the room against. */
  base?: number;
}

export interface Atmosphere {
  ambient: Hex;
  ambientLevel: number;
  weather: Weather;
  weatherLevel: number;
  fog: number;
  timeOfDay: TimeOfDay;
}

export interface PresetDef extends Partial<Atmosphere> {
  lights?: Record<string, Partial<Pick<LightDef, 'color' | 'intensity' | 'flicker'>>>;
}

export interface SceneDef {
  /** The scene's folder in a district's own scene.json; the full room name (`<district>/<folder>`) in the city's registry. */
  id: string;
  /** The district folder it sits in (set by the city's room registry). */
  district?: string;
  /** Its own folder (set by the city's room registry; the scene.json `id`). */
  folder?: string;
  name: string;
  description: string;
  resolution: [number, number];
  layers: LayerDef[];
  lights: LightDef[];
  defaults: Atmosphere;
  presets: Record<string, PresetDef>;
  /** Where weather is visible: shapes traced to the glass, in frame px. Absent = the whole frame. */
  weatherArea?: Shape[];
  /** @deprecated read only: the schema converts it to `weatherArea` (one 4-point shape). */
  weatherRegion?: [number, number, number, number];
  /** How the scene sounds (all optional). */
  sound?: SceneSound;
  /** Weather is heard (rain, thunder) but no particles are drawn (a room whose window is out of sight). */
  weatherHidden?: boolean;
  /** Ambient effects placed on the room (at most 16). */
  effects?: EffectDef[];
  /** The place's resident: a fixed character's id and her size relative to the side figures. */
  resident?: { character: string; scale: number };
  /** Everyone's place: in every contact's places, so any of them can take you there (not only its owner's). */
  public?: boolean;
  /** Rooms reached from this one without the map: whoever you're with can take you (room exits spec §2). */
  exits?: ExitDef[];
  /** A venue's hours, HH:MM (story moods spec §5): last call, closing and closed moods follow them. */
  hours?: { open: string; close: string };
}

/** One way out of a room: the full room id it leads to, and how you get there (at most 60 characters). */
export interface ExitDef {
  to: string;
  way: string;
  /** Where the door is on the room's picture, `[x, y, w, h]` in room px: hover it for the way, click to go through (clickable doors spec §2). */
  door?: [number, number, number, number];
}

type Rect4 = [number, number, number, number];

/** An ambient effect over a box of the room (`rect` in the room's px). */
export type EffectDef =
  /**
   * A working CRT: follows `light`'s brightness; `scroll` px/s moves its own pixels upward.
   * `picture` 'static' lays animated snow over them instead, `grain` 0–1 of the way (default 0.7).
   * `roll` false: no bright bar rolling down it now and then (for a screen set at an angle).
   */
  | { kind: 'screen'; rect: Rect4; light: string; scroll?: number; picture?: 'art' | 'static'; grain?: number; roll?: boolean }
  /** Each glowing dot in the box blinks on its own rhythm; `rate` 0.25–4. */
  | { kind: 'leds'; rect: Rect4; rate?: number }
  /** Flashes the weather area (or the whole frame) in rain at 0.7 and up, thunder after; `strength` 0–1. */
  | { kind: 'lightning'; strength?: number }
  /**
   * Rain on the glass of the weather area (or the whole frame): beads that gather while it rains and
   * dry slowly after, some running down; `amount` 0–3 (default 1).
   */
  | { kind: 'glass'; amount?: number }
  /**
   * Steam or smoke rising from the box's bottom edge to its top; `amount` 0–3 (default 1), `lean`
   * -1…1 tilts it sideways (default 0). Steam by default.
   */
  | { kind: 'plume'; rect: Rect4; style?: 'steam' | 'smoke'; amount?: number; lean?: number }
  /**
   * Now and then a light slides along the box's middle, end to end: `source` car (default), police or
   * drone; `every` mean seconds between passes, 5–300 (default 25); `strength` 0–1 (default 1).
   */
  | { kind: 'passing'; rect: Rect4; source?: 'car' | 'police' | 'drone'; every?: number; strength?: number };

export interface SceneSound {
  /** Weather heard through glass (muffled); no outdoor wind floor. */
  indoor?: boolean;
  /** A recorded loop, relative to the scene folder; replaces the synthesized room tone. */
  bed?: { src: string; level?: number };
  /** Synthesized room tone level (0..1) when there's no bed. */
  hum?: number;
  /** The place's songs, shuffled with pauses between them: file names in the pack's `_music/` folder; `level` 0..1 (default 0.3). */
  music?: SceneMusic;
  /** One-off sounds: on a timer, on entry, or played by the agent (`play_sound`). */
  sounds?: RoomSoundDef[];
}

/** A room's one-off sound (a door, a kettle, a passing train). */
export interface RoomSoundDef {
  /** What the agent calls it, and the tool line's word: lowercase letters, digits, '-'; unique in the room. */
  name: string;
  /** Relative to the room's folder (in Studio: sound/keep/<file>.ogg). */
  src: string;
  /** 0..1, default 0.5. */
  level?: number;
  /** The agent may play it; `about` is the line it sees (1–120 characters). */
  agent?: { about: string };
  /** Plays on its own every `min`–`max` minutes (0.5 ≤ min ≤ max ≤ 60). */
  timer?: { min: number; max: number };
  /** Plays once each time you walk in. */
  onEntry?: boolean;
}

export interface RoomState {
  sceneId: string;
  lights: LightDef[];
  atmosphere: Atmosphere;
}

/** Roleplay (in character), out of character, ending the scene, or her greeting as you walk in. Messages without a mode are roleplay. */
export type ChatMode = 'rp' | 'ooc' | 'end' | 'greet' | 'travel' | 'scene' | 'encounter' | 'quest' | 'gig' | 'dice' | 'text';

/** Quest lines in a room for one pair: the quests that can start here, the one at a beat here (its shown choices), and why a run here can't go on. */
export interface QuestState {
  /** Quests that can start here: the list's pitch line (null: none), and whether it has a deadline. */
  open: { id: string; title: string; pitch: string | null; timed: boolean; big?: { tier: number; range: [number, number] | null; stake: [number, number] }; mission?: { pay: number | null; tier?: number; range?: [number, number]; scouted?: { draws: Record<string, string>; pay: number | null }; cased?: true; /** A contact's own job (Intake board spec §3): her display name. */ own?: string; /** Its stake is trust, not rep. */ trust?: true; /** The arrangement's nights are used up tonight (spec 2026-10-20 §2): her name. */ capped?: string; /** A desk job (comms spec §3): the place it's played at, on comms. */ comms?: string } }[];
  /** A checked choice's card carries its odds (missions spec §3); during a reroll the cards are `!reroll` and `!take`. */
  active: {
    id: string;
    title: string;
    beat: string;
    /** A red check's card (ONE SHOT); a crack card's letters and tries (small jobs spec §3–§4). */
    choices: { id: string; line: string; odds?: Odds; red?: true; crack?: { length: number; tries: number } }[];
    art?: string;
    /** A job's run (small jobs spec §6): ALARM 0–3, EDGE left, heat in its district, and its pay range. */
    alarm?: number;
    edge?: number;
    heat?: number;
    pay?: [number, number];
    /** Each crack card's terminal, by choice id: the browser builds it, the server scores the moves. */
    crack?: Record<string, TerminalSetup>;
    /** A failed check parked for REROLL / TAKE IT: the card that rolled, its odds and the rolls so far (the browser animates them). */
    rolled?: { choice: string; chance: number; rolls: number[] };
    /** A big job (big jobs spec §5): its section, the go hour and minutes to it (null: passed), the clues held, the marked places still to visit; the read's sentence and bank; each route's gig. */
    big?: {
      section: 'legwork' | 'read' | 'approach' | 'out';
      go: string;
      left: number | null;
      clues: { id: string; text: string }[];
      marks: { place: string; name: string; line: string }[];
      read?: { parts: string[]; bank: string[] };
      routes?: Record<string, { kind: GigKind; tier: 'easy' | 'medium' | 'hard'; why: string[]; seed: number; brief: Brief }>;
      gigAuto?: true;
    };
    /** A blown job waiting on its cover cards: the row it will write (the pick and its roll) and the debrief as it stands. */
    blown?: { text: string; pick?: { choice: string; line: string; roll?: Roll }; debrief: Debrief };
  } | null;
  /** A run here whose quest file no longer has its beat: the notice to show; null otherwise. */
  changed: string | null;
  /** The quest here waiting for its next beat (quest waits spec §4): the line to show, where, from and by when (story-clock minutes); `here`: you're where it waits (or it waits anywhere). */
  waiting: { id: string; title: string; next: string; at: string | null; from: number | null; by: number | null; ready: boolean; here: boolean; /** A desk job's wait (comms spec §3): due only on comms. */ comms?: true } | null;
  /** Quests at a beat or waiting in another contact's room, for this player. */
  elsewhere: { id: string; title: string; contact: string; contactName: string; next: string | null }[];
  /** The fixer at a board (small jobs spec §5): its stock, each item buyable, above your tier there, or more than your sol. */
  fixer?: { place: string; items: { id: string; name: string; price: number; tier: number; state: 'ok' | 'locked' | 'short' }[] };
}

/** No quest lines to show. */
export const EMPTY_QUEST_STATE: QuestState = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };

/** A quest row's snapshot (mode 'quest'; its text is what was shown): the quest, the beat it moved to (null: it ended), the pick that moved it, and the beat's stranger. */
export interface QuestRow {
  id: string;
  title: string;
  beat: string | null;
  pick?: { choice: string; line: string; roll?: Roll };
  /** The row parked the quest on a wait: no next beat yet (not an ending). */
  waiting?: true;
  stranger?: { name: string; voice: string; face?: string };
  /** A mission beat she doesn't answer (between the first and the last): no reply follows this row. */
  silent?: true;
  /** A big job's row she answers mid-job: after the read, or after the gig (big jobs spec §4). */
  after?: 'read' | 'gig';
  /** A job's run key (`<id>@<day>`, small jobs plan ruling 2): which run this row belongs to. */
  run?: string;
  /** A job's ending (small jobs spec §6): the debrief card. */
  debrief?: Debrief;
}

/** A job's debrief (small jobs spec §6): the tier, every check and crack, and the totals. */
export interface Debrief {
  tier: 'clean' | 'messy' | 'blown';
  checks: { line: string; stat?: string; chance?: number; rolls?: number[]; crack?: { tries: number; state: string } }[];
  sol: number;
  heat: { district: string; delta: number };
  rep: { district: string; before: number; after: number };
  deck?: { from: string | null; to: string | null };
  cover?: 'burner' | 'fall-guy';
  /** A big job (big jobs spec §4): the clues found, how the read went (never its words), the gig and its result. */
  big?: { clues: string[]; read: 'full' | 'half' | 'wrong' | null; gig: { kind: GigKind; tier: 'easy' | 'medium' | 'hard'; result: GigResult } | null };
  /** A job with a trust stake (Intake board spec §2): her word before and after when it changed; null when it held; absent on other jobs. */
  trust?: { name: string; before: string; after: string } | null;
  /** Which way a trust job moved her trust, when it did (her closing line hears it even when the word held). */
  trustMoved?: 'up' | 'down';
  /** The arrangement's retainer (spec 2026-10-20 §2), on the night's first job with her: paid, or not (short). */
  retainer?: { name: string; amount: number; paid: boolean };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  toolLines: string[];
  ts: number;
  status: 'ok' | 'streaming' | 'failed' | 'lost';
  replyTo?: string;
  /** Present only for out-of-character, end-of-scene or greeting messages; absent means roleplay. */
  mode?: 'ooc' | 'end' | 'greet' | 'travel' | 'scene' | 'encounter' | 'quest' | 'gig' | 'dice' | 'text';
  /** A promised text's hidden line (promised texts spec §5): the row her text answers; never shown. Stored as leave = 3. */
  promised?: true;
  /** The opening scene's card (mode 'scene', the conversation's first row): its title and where it came from. */
  scene?: { title: string; source: 'generated' | 'written' };
  /** An event that cut in (mode 'encounter'; its text is the row's): its title and the stranger it brought, if any. */
  encounter?: { title: string; stranger?: { name: string; voice: string }; power?: 'out' };
  /** A quest's beat, or a pick and what followed (mode 'quest'). */
  quest?: QuestRow;
  /** A finished gig run (mode 'gig', the user's row): the brief and result as they were, so history never changes. */
  gig?: GigSnapshot;
  /** A liar's dice game (mode 'dice'): a copy of how it went. */
  dice?: DiceSnapshot;
  /** Her reply's alternative takes (regenerate / swipe): which one is shown, of how many. Absent = one. */
  takes?: { index: number; count: number };
  /** The model that wrote her reply (its shown take), when known. */
  model?: string;
  /** Her face for this reply (set_expression); absent means neutral. */
  expression?: string;
  /** The faces of the others here on this reply (set_expression who), by id; absent or missing an id means neutral. */
  othersExpressions?: Record<string, string>;
  /** An END SCENE that walks out (LEAVE): the user's end line only. */
  leave?: true;
  /** A LEAVE where she's the one going (her plans spec §5: LET HER GO); always with `leave`. */
  parting?: 'her';
  /** The story clock after this row (minutes since Day 1 00:00): a user row's with its turn's cost, her reply's with any time she passed. */
  clock?: number;
}

/** One take of a reply. The message's own text and tool lines are always its shown take. */
export interface Take {
  text: string;
  toolLines: string[];
  ts: number;
  /** A take whose stream was cut off (kept so it can be read, or swiped away). */
  lost?: boolean;
  /** The model that wrote this take, when known. */
  model?: string;
  /** Her face for this take; absent means neutral. */
  expression?: string;
  /** The others' faces for this take, by id; absent means neutral. */
  othersExpressions?: Record<string, string>;
  /** Minutes she passed in this take (pass_time): her reply's clock is the line's plus this, when it's shown. */
  passed?: number;
}

export type LinkStatus = 'ok' | 'down' | 'lost';

export type ServerEvent =
  /** Contacts whose newest text you haven't seen on the deck (promised texts spec §6): the HUD's `NIX · 1 TEXT`. */
  | { type: 'texts_unread'; from: { id: string; name: string }[] }
  /** `base` is where this room's scene files are served (`/scenes/<pack>/`). */
  | { type: 'scenes'; scenes: SceneDef[]; residents: Record<string, ResidentInfo> }
  | { type: 'room'; state: RoomState; duration: number; source: Source | 'restore'; transition?: Transition }
  /** `greetDue`: she should open the scene once this tab is ready (see the greet client event). */
  | { type: 'history'; messages: ChatMessage[]; greetDue: boolean }
  | { type: 'message'; message: ChatMessage } // insert or replace by id
  | { type: 'nix_delta'; messageId: string; delta: string }
  | { type: 'tool_line'; messageId: string | null; text: string }
  /** One of the room's sounds, played now (the agent's play_sound); never stored or replayed. */
  | { type: 'sound'; scene: string; name: string }
  | { type: 'link'; status: LinkStatus }
  /**
   * Her current model; sent on change and on connect once known. A direct character's also carries
   * the picker's choices and her provider credit (null: unknown).
   */
  | {
      type: 'model';
      model: string;
      provider: string;
      label?: string;
      choices?: ModelChoice[];
      credit?: number | null;
      /** A direct character's own default (her character.json model). */
      default?: string;
    }
  /** This tab's set_model was refused. */
  | { type: 'model_rejected'; reason: 'unknown-model' }
  /** Which portrait image the feed shows beside Nix's replies (an alpha mask; `@2x` sibling assumed). Sent on connect. */
  /** Who this room belongs to and how to draw her avatar (mask = CSS-recolored alpha mask). */
  | { type: 'portrait'; url: string; kind: 'face' | 'mask' | 'monogram'; accent: string; name: string; pronoun: Pronoun; sprite?: SpriteRef | null }
  /**
   * Sent only to the tab whose user_message/retry was refused: a turn is active (`busy`), or no key
   * is linked (`no-link`); `text` is the refused draft.
   */
  | { type: 'turn_rejected'; reason: 'busy' | 'no-link'; text?: string }
  | { type: 'dev_log'; level: 'info' | 'warn' | 'error'; text: string }
  /** Answer to `scribe_runs`: this pair's newest runs, newest first. */
  | { type: 'scribe_runs'; runs: ScribeRunInfo[] }
  /** Her whole journal (pinned first, then newest first), on connect and after every change. */
  | { type: 'journal'; notes: Note[] }
  /** Her recap; `text` and `at` are null when there is none. */
  | { type: 'recap'; text: string | null; at: number | null; seen: boolean }
  /** Her dossier page on this tab's player; all null when she hasn't written one. */
  /** `tie`: while there's no page, what she knows of them from before (ties), which stands in for it in her prompt. */
  | { type: 'dossier_page'; text: string | null; at: number | null; by: JournalEditor | null; tie?: string }
  /** Lines deleted (delete, rewind) — every tab drops them. */
  | { type: 'messages_removed'; ids: string[] }
  /** A message control this tab sent was refused; nothing changed. */
  | { type: 'control_rejected'; reason: ControlRejection }
  /** A quiet line for the dialogue box (a direct character's provider trouble). */
  /** `for: 'encounter'`: a refused play, said in the open ENCOUNTER panel. */
  | { type: 'notice'; text: string; for?: 'encounter' | 'quest' | 'gig' | 'dice' | 'crew' | 'travel' }
  /** What the room shows of quest lines for this pair: QUEST's list, the cards (spec 2026-10-16 quest lines §3). */
  | { type: 'quest_state'; state: QuestState }
  | { type: 'plan_card'; card: PlanCard | null }
  /** Crew spec §4: a crew action was written; an open CREW screen fetches again. */
  | { type: 'crew_changed' }
  /** To the sending tab only: its line acts out `choice`, so it was held for CONFIRM / SEND AS TALK (spec §3). */
  | { type: 'quest_pick'; id: string; beat: string; choice: string; text: string }
  /** Her line for a liar's dice round (that tab only), with the face she makes. */
  | { type: 'dice_line'; round: number; seed: number; line: string; expression: string | null }
  /** The active playthrough changed: this tab's world is gone (its socket closes next). */
  | { type: 'world-changed'; playthrough: string | null; location: Location | null; solo?: true }
  /** The playthrough's story clock (minutes since Day 1 00:00). */
  | { type: 'clock'; clock: number }
  /** Blackouts phase 3 §4: every district dark now (for the map), and this room's (`here`: its district's name and since when; null: it has power). */
  | { type: 'power'; dark: string[]; here: { name: string; since: number } | null }
  /**
   * Who's here besides you and your contact (the strip), on connect and whenever it changes; and
   * everyone who could speak in her replies (`voices`: how the feed splits them, here or not).
   */
  | { type: 'others'; others: OtherInfo[]; voices: OtherInfo[] }
  /** Comms (spec 2026-10-20): on the line or not, whether you can go on it, and where she is (her place's name, on comms). */
  | { type: 'comms'; on: boolean; can: boolean; where: string | null; /** Her scheduled room now (null: none): ON COMMS there makes no sense (final review I2). */ herAt: string | null };

export type ModelEvent = Extract<ServerEvent, { type: 'model' }>;

/** A model the picker offers: prices in dollars per million tokens (null: unknown). */
export interface ModelChoice {
  id: string;
  label: string;
  priceIn: number | null;
  priceOut: number | null;
  /** A shipped pick's one-line reason. */
  why?: string;
}

export type ControlRejection = 'busy' | 'not-latest' | 'unknown' | 'empty';

export type ClientEvent =
  | { type: 'user_message'; text: string; mode?: ChatMode; leave?: boolean; talk?: boolean }
  /** QUEST: start a quest open here (quest lines spec §3). */
  | { type: 'quest_start'; id: string }
  /** A card, or CONFIRM on a held line (`said`): the pick at `beat`. */
  | { type: 'quest_choose'; id: string; beat: string; choice: string; said?: string; moves?: ({ word: string } | { bracket: number })[]; read?: [string, string, string]; gig?: { result: GigResult; seed: number } }
  | { type: 'quest_walk'; id: string }
  | { type: 'fixer_buy'; item: string }
  | { type: 'crew'; action: CrewAction }
  /** CONTINUE on a quest waiting for the player (`wait: ready`). */
  | { type: 'quest_continue'; id: string }
  | { type: 'retry'; messageId: string } // id of the failed user message
  | { type: 'dev_action'; tool: string; args: Record<string, unknown>; as?: Source }
  /** the player's journal panel. `text` left out only pins/unpins. */
  | { type: 'journal_edit'; id: string; text?: string; pinned?: boolean; about?: 'me' | 'you'; keys?: string[] }
  | { type: 'journal_delete'; id: string }
  /** Undo of a delete: puts the note back exactly as it was. */
  | { type: 'journal_restore'; note: Note }
  | { type: 'recap_seen' }
  /** The dev panel's SCRIBE section: this pair's scribe runs (scribe spec §8). */
  | { type: 'scribe_runs' }
  /** Ready for her greeting (sent only when `history` said one is due); the server checks again. */
  | { type: 'greet'; /** How the scene opens, from the arrival screen (spec 2026-10-27 §3): kept only on a new game. */ opening?: string }
  | { type: 'let_her_go'; text?: string }
  | { type: 'plan_drop' }
  /** the player's edit of the dossier page; empty after trim clears it. */
  | { type: 'dossier_page_edit'; text: string }
  | { type: 'regenerate'; messageId: string }
  | { type: 'swipe'; messageId: string; index: number }
  | { type: 'continue'; messageId: string }
  | { type: 'edit_message'; messageId: string; text: string }
  | { type: 'delete_message'; messageId: string }
  | { type: 'restore_message'; message: ChatMessage }
  | { type: 'rewind'; messageId: string }
  /** A direct character's model picker. */
  | { type: 'set_model'; model: string }
  /** GO on the map: walk you both to a place (its id in map/lowlight.json). */
  | { type: 'travel'; place: string; /** ON COMMS (spec 2026-10-20): you go, she stays on the line. */ comms?: true; /** Your line on the way (arrival screen spec §4). */ line?: string }
  /** A door: go through one of the room's exits, as GO does (clickable doors spec §4). */
  | { type: 'exit'; to: string }
  /** DRAW: play an event (encounter cards); she reacts at once. */
  | { type: 'encounter'; encounter: Encounter | null }
  /** A finished gig run (from GIGS on the map): she reacts at once. No `kind` means a hack; `trace` is the run's meter (HEAT for a slip). */
  | { type: 'gig'; kind?: GigKind; place: string; brief: string; result: GigResult; trace: number; max: number; seed: number; papers?: { overlooked: number | null } }
  /** A liar's dice round just ended: ask her for one line and a face. */
  | { type: 'dice_line'; round: number; record: RoundRecord; stake: string; seed: number }
  /** A finished liar's dice game: the row, then her reaction. `result` is the player's. */
  | { type: 'dice'; stake: string; result: 'won' | 'lost'; rounds: RoundRecord[]; lines: (string | null)[]; seed: number };

/** Whether the app can reach her model's provider with her key. `unreachable`: it couldn't be reached. */
/** `room-error`: she's connected but her room couldn't be opened (e.g. an unreadable room.db). */
/** `no-link`: no key linked yet (set at select); `no-credit`: linked, but the key's credit is spent. */
/**
 * SYS → NARRATOR THINKING (OpenRouter only): how much the narrator thinks before SET THE SCENE, DRAW
 * and her dice lines. auto: none where the model allows it, low where it refuses (remembered per
 * model); off: none, and a model that insists fails plainly; low / medium: always that much.
 */
export type NarratorThinking = 'auto' | 'off' | 'low' | 'medium';
export const NARRATOR_THINKING: readonly NarratorThinking[] = ['auto', 'off', 'low', 'medium'];

export type LinkState = 'ok' | 'key-rejected' | 'no-link' | 'no-credit' | 'unreachable' | 'room-error' | 'unknown';

/** Public agent info — safe to send to the browser (no keys or tokens). */
/** A band of a sprite's height to show, as fractions 0..1 (top < bottom). */
export interface Crop {
  top: number;
  bottom: number;
}

/** A full-body sprite and the band of it the stage shows. */
export interface SpriteRef {
  url: string;
  crop: Crop;
  /** How tall she stands on stage, as a share of full figure height (0.5–1); absent: full height. */
  height?: number;
  /** Her art is on the cast's pixel grid (Studio SNAP): draw it with hard pixels. Absent: smooth. */
  pixel?: boolean;
  /** Her other faces, name → `/api/agents/<id>/sprite/<name>`; absent when she has none. */
  expressions?: Record<string, string>;
  /** Her outfits, name → `/api/agents/<id>/outfit/<name>`; absent when she has none. The sprite is the fallback outfit. */
  outfits?: Record<string, string>;
  /** Scene id → outfit name; a scene not listed shows the sprite. Absent when empty. */
  outfitByScene?: Record<string, string>;
  /** The face shown over the sprite when she's locked in at character select (null: none). */
  selectFace?: string | null;
}

/** Someone in your room besides you and your contact: the place's resident, or a contact the clock puts there. */
export interface Present {
  id: string;
  kind: 'resident' | 'contact';
  name: string;
  pronoun: Pronoun;
}

/** Someone here as the who's-here strip draws them: their tile (thumb, or a face crop of their sprite) and file card. */
export interface OtherInfo extends Present {
  accent: string;
  /** A face thumbnail (`/api/agents|residents/<id>/thumb`); null when their sprite has none. */
  thumb: string | null;
  /** Their sprite and faces (a contact's under `/api/agents/<id>/…`, a resident's under `/api/residents/<id>/…`). */
  sprite: SpriteRef | null;
  /** Where their face sits on their sprite (the tile's crop of an expression). */
  face: Face;
  tagline: string;
  facts: Fact[];
}

/** A place's resident (a fixed character, e.g. Hae at the noodle stall) as the browser draws her. */
export interface ResidentInfo {
  id: string;
  name: string;
  pronoun: Pronoun;
  accent: string;
  /** Her urls are under `/api/residents/<id>/…`. */
  sprite: SpriteRef;
  thumb: string;
}

/** The player's persona as the browser sees it (`GET /api/persona`); the description stays on the server. */
export interface PersonaInfo {
  id: string;
  name: string;
  sprite: SpriteRef | null;
  /** The character's accent (the sheet's colour); absent for a player outside the roster. */
  accent?: string;
  /** The character's tagline; absent under a playthrough persona or when the file has none. */
  tagline?: string;
  /** The character's outfit names (the sheet's wardrobe); absent when there are none. */
  outfits?: string[];
  /** The outfit worn in the active playthrough, one of `outfits`; absent: the plain sprite. */
  outfit?: string;
  /** The outfit whose picture is the plain sprite itself (Hicks's outdoors), so the wardrobe doesn't list it twice. */
  baseOutfit?: string;
  /** The character's faces, name → `/api/agents/<id>/sprite/<name>` (faces from actions); absent when there are none. */
  expressions?: Record<string, string>;
  /**
   * The YOU sheet's FILE (spec 2026-10-28 §1): the select screen's bio paragraphs, or under a playthrough persona its
   * background's; absent when there's none.
   */
  bio?: string[];
  /** The select screen's facts; never under a persona (the city isn't told them). Absent when there are none. */
  facts?: Fact[];
}

/** Where the player is: a contact's room and the scene it shows. */
export interface Location {
  contactId: string;
  sceneId: string;
}

/** A playthrough: a sealed world with one persona, its own folder of contact databases. */
export interface PlaythroughInfo {
  id: string;
  name: string;
  /** The persona; every turn in this playthrough uses it. */
  player: string;
  startContact: string;
  createdAt: number;
  updatedAt: number;
  /** The save this playthrough was loaded from, or the line it was branched from, if any. */
  forkedFrom:
    | { playthrough: string; save: string; name: string }
    | { playthrough: string; message: { contactId: string; messageId: string; excerpt: string }; name: string }
    | null;
  location: Location | null;
  /** Who you are when it isn't the character as written (absent: play as them). */
  persona?: PlaythroughPersona;
  /** The story clock never goes below this (WAIT between scenes: a rewind doesn't undo a wait). */
  clockFloor?: number;
  /** The city's weather (city weather spec §5): the room you're in sets it; a room you walk into takes it. */
  weather?: { weather: Weather; level: number };
  /** When you last left each contact (the story clock): she stays where you left her until her next scheduled block starts. */
  parted?: Record<string, number>;
  /** What seeds the blackout schedule (blackouts phase 3 §1): its first id, kept by loads and branches so they keep the same nights. */
  seed?: string;
  /** The narrator's power cuts (blackouts phase 3 §2), each tied to its encounter row; the schedule's are worked out from the clock, never kept. */
  outages?: Outage[];
  /** Walked out on their own (go solo): between scenes, with no one. `location` still names the last contact's room. Absent: with someone. */
  solo?: boolean;
  /** The outfit the player wears (the YOU sheet's wardrobe), one of their character's outfits. Absent: the plain sprite. */
  outfit?: string;
}

/** Someone on the roster the player hasn't met in the active playthrough (AROUND LOWLIGHT on the solo screen), where she is. */
export interface AroundEntry {
  contactId: string;
  sceneId: string;
  placeName: string;
  /** Her plan's tail, `home · Hae's 21:00` (her plans spec §7); absent or null: none. */
  planTail?: string | null;
  timeOfDay: string | null;
}

/** A contact the player knows in the active playthrough (§7), as the title menu and CONTACTS panel show her. */
export interface ContactEntry {
  id: string;
  name: string;
  accent: string;
  /** Her avatar's URL; null when she has none (show her initial). */
  portrait: string | null;
  /** Why she's known: the playthrough's start contact, met (an rp line), or introduced by another contact. */
  status: 'start' | 'met' | 'knows' | 'shared';
  /** Who introduced her (status 'shared'). */
  sharedBy?: string;
  /** Her room's scene: as her database has it, else her start room. */
  sceneId: string;
  /** The map's name for that scene, else the room's name. */
  placeName: string;
  /** Her plan's tail, `home · Hae's 21:00` (her plans spec §7); absent or null: none. */
  planTail?: string | null;
  /** Her room's time of day (null: no database yet). */
  timeOfDay: string | null;
  /** The newest roleplay line with her, first 120 characters. */
  lastLine: { speaker: string; text: string } | null;
  /**
   * Standing (spec 2026-10-13 §6): her word for where the player stands, and the values and the last
   * move's reason for the dev panel's hover. Null for a contact only heard of; absent where standing isn't read.
   */
  standing?: { word: string; trust: number; warmth: number; last: string | null } | null;
  /** Her deal to sit the player's chair (arrangement spec 2026-10-20 §3); absent or null with none. */
  arrangement?: { retainer: number; nights: 1 | 2; active: boolean } | null;
  /** Her file in CONTACTS (spec 2026-10-28 §4): the select screen's bio paragraphs and facts; absent when there are none. */
  bio?: string[];
  facts?: Fact[];
}

export type SaveTrigger = 'manual' | 'end' | 'travel' | 'rewind';

/** A snapshot of a playthrough: manual (named, kept) or an automatic checkpoint (pruned). */
export interface SaveInfo {
  id: string;
  playthrough: string;
  kind: 'manual' | 'checkpoint';
  trigger: SaveTrigger;
  name: string;
  at: number;
  location: Location | null;
  timeOfDay: string | null;
  participants: string[];
  lastLine: { speaker: string; text: string } | null;
  /** Saved while solo: loading it lands on the solo screen. */
  solo?: boolean;
  /** The story clock when saved. */
  clock?: number;
  /** Per contact database: [last message rowid, last write seq, sum of shown takes] (older saves: two numbers); equal means nothing changed. */
  fingerprint: Record<string, number[]>;
}

export interface AgentInfo {
  id: string;
  name: string;
  /** Her own, else the character she extends, else 'they'. */
  pronoun: Pronoun;
  description: string;
  accent: string;
  /** mask = an alpha-mask portrait recolored by CSS; monogram = generated initial. */
  /** Her avatar beside her lines: her face cut from her sprite, else a white mask portrait, else her initial. */
  avatarKind: 'face' | 'mask' | 'monogram';
  /** Her rooms (`<district>/<folder>`): her haunts, where she takes you herself. */
  rooms: string[];
  /** Where she is when there's no saved room: the first of her rooms. */
  startRoom: string;
  /** The district of her old `scenePack`, if she had one (completes saved room ids from before rooms). */
  legacyDistrict: string | null;
  /** Where she belongs on the select screen: a district id (her `group`, else her first room's); null in the neutral rooms. */
  group: string | null;
  connected: boolean;
  /** A character that runs on a model directly, or a mindless character with no runtime. */
  backend: 'direct' | 'none';
  /** A direct character's model, short ("GLM 5.2"); null for a mindless one. */
  modelLabel: string | null;
  /** Why a direct character can't connect (safe to show); null otherwise. */
  connectionError: string | null;
  /** Her full-body sprite for the stage, if her character file has one. */
  sprite: SpriteRef | null;
  /** The select-screen dossier's one-line hook. */
  tagline: string;
  /** The select-screen dossier's bio, as paragraphs. */
  bio: string[];
  /** The select-screen dossier's quick facts. */
  facts: Fact[];
  /** Where her face sits on her sprite, for the thumbnail crop. */
  face: Face;
  /** `/api/agents/<id>/thumb` when her sprite resolved; null otherwise. */
  thumb: string | null;
  /** Her stats (missions spec §1); loaders always set them (3s when the file has none). */
  stats?: Stats;
  /** The deck she starts with (a catalog id), or null. */
  deck?: string | null;
  /** A direct character's liar's dice play (bluff, nerve, suspicion). */
  dice?: DiceSettings;
}

/** One row of the LEADS screen (Leads spec §6): a held lead, who it points to, and whether you've followed it up. */
export interface LeadView {
  id: string;
  title: string;
  details: string;
  to: string;
  toName: string;
  place: string | null;
  /** The receiver's portrait once you've met them; null before. */
  portrait: string | null;
  met: boolean;
  followed: boolean;
}

/** A lead the player holds in a playthrough (Leads spec §4): who gave it, with what details, and whether it's been followed up. */
export interface HeldLead {
  id: string;
  givenBy: string;
  details: string;
  at: number;
  followed: boolean;
}

/** One scribe run, as the dev panel's SCRIBE section shows it (scribe spec §8). */
export interface ScribeRunInfo {
  at: number;
  kind: 'turn' | 'end' | 'summary';
  player: string;
  /** The reply it read (and its take); null when it never got that far. */
  messageId: string | null;
  take: number | null;
  ms: number;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Its answer as it came back; null when the call failed. */
  raw: string | null;
  applied: string[];
  refused: string[];
  error: string | null;
}

/** GET /api/kit (missions spec §4): the YOU sheet's live rows for the active playthrough's player. */
export interface KitView {
  deck: Deck | null;
  sol: number;
  /** The hottest district's heat (the missions-era number; the YOU sheet moves to heatHere). */
  heat: number;
  /** Small jobs spec §2: heat in the district you stand in, the hottest district, rep per district, cover held. */
  heatHere: number;
  hottest: { district: string; heat: number } | null;
  rep: Record<string, number>;
  cover: { burner: number; 'fall-guy': number };
  edgeLeft: number;
  edgeMax: number;
  stats: Stats;
  /** Crew spec §4: the newest crew result's story time (the CREW word's dot), null with none. */
  crewLatest: number | null;
}

/** A recruit on the CREW screen (crew spec §4): the folded member plus what the profile shows. */
export interface CrewRosterEntry extends CrewMember {
  traitsShown: { label: string; good: boolean; text: string }[];
  /** Traits not shown yet (the "?" rows). */
  hiddenTraits: number;
  word: LoyaltyWord;
  line: string;
  /** The next grade's name; null at VET. */
  next: string | null;
}

/** GET /api/crew (crew spec §4). */
export interface CrewView {
  roster: CrewRosterEntry[];
  slots: number;
  /** Slots taken: everyone not gone. */
  used: number;
  sol: number;
  wages: number;
  /** Minutes to the next 06:00. */
  nextSix: number;
  /** The place you stand at (HIRE works only there); null off the map. */
  here: string | null;
  hires: { place: string; name: string; district: string; cards: HireCard[] }[];
  errands: (ErrandInstance & {
    label: string;
    /** What the label's {job} / {district} / {place} names: the job's title or the district's name. */
    name: string;
    tag: string;
    suits: Specialty[];
    hours: number;
    risk: Risk;
    blurb: string;
    /** Each band's first line, for the brief. */
    bands: Record<Band, string>;
    taken: boolean;
    /** Per ready recruit id. */
    odds: Record<string, CrewOdds>;
  })[];
  /** Every result, newest first, with whose it was. */
  results: (CrewResult & { recruit: string; name: string })[];  /** The trait book's labels (hire cards carry ids). */
  traits: Record<string, { label: string; good: boolean; text: string }>;
}

/** A CREW screen action (crew spec §4), sent over the ws to the room's relay. */
export type CrewAction =
  | { do: 'hire'; recruit: string }
  | { do: 'send'; recruit: string; errand: string }
  | { do: 'recall' | 'doc' | 'bail' | 'letgo' | 'leave'; recruit: string };

/** Her plan's card while she's with you (her plans spec §5): `NIX IS HEADING HOME · Hae's at 21:00`. */
export interface PlanCard {
  name: string;
  /** Where she's heading, the map's name. */
  going: string;
  /** `Hae's Noodles at 21:00`, or null without a meeting. */
  meet: string | null;
  /** The reply it came from. */
  from: string;
}

// ── The deck (spec 2026-10-23): texting your contacts from your phone ─────────────────────────

/** A thread on the deck's list: a contact you know, and the newest text with them. */
export interface DeckThread {
  id: string;
  name: string;
  accent: string;
  /** Her face's URL; null when she has none (the list shows her initial). */
  portrait: string | null;
  pronoun: Pronoun;
  last: { text: string; clock: number; mine: boolean } | null;
  /** Her newest text hasn't been seen on the deck (promised texts spec §6). */
  unread: boolean;
}

/** A thread's header: where she is now, her plan's tail, the story time and the city's weather. */
export interface DeckHeader {
  place: string;
  tail: string | null;
  time: string | null;
  weather: string | null;
}

/** Why a thread can't be texted: you're with them, or on a call with them. */
export type DeckReadOnly = 'here' | 'call' | null;

export type DeckClientEvent =
  | { type: 'deck_open' }
  | { type: 'deck_thread'; contact: string }
  /** `localId`: the deck's own id for the bubble it shows at once, echoed on a deck_error so it can offer it again. */
  | { type: 'deck_send'; contact: string; text: string; localId?: string }
  | { type: 'deck_retry'; contact: string; messageId: string }
  /** Deck controls (deck controls spec §2): on her latest reply, your latest text, or any text. */
  | { type: 'deck_regen'; contact: string; messageId: string }
  | { type: 'deck_swipe'; contact: string; messageId: string; index: number }
  | { type: 'deck_edit'; contact: string; messageId: string; text: string }
  | { type: 'deck_delete'; contact: string; messageId: string }
  /** STEP OUT / HANG UP: you're with them (or on a call), and leave — her goodbye in the scene, then you're on your own. */
  | { type: 'deck_step_out'; contact: string };

export type DeckServerEvent =
  | { type: 'deck_threads'; threads: DeckThread[]; start: string | null }
  /** `typing`: a text to her is queued or being answered now (a deck that reconnected still shows typing…). */
  | { type: 'deck_thread'; contact: string; header: DeckHeader; rows: ChatMessage[]; readOnly: DeckReadOnly; typing: boolean }
  | { type: 'deck_typing'; contact: string; on: boolean }
  | { type: 'deck_rows'; contact: string; rows: ChatMessage[] }
  | { type: 'deck_error'; contact: string; error: string; localId?: string }
  | { type: 'deck_nosave' };
