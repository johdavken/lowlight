import type { NarratorKind } from '../../../shared/narrator';
import { forms, type Pronoun } from '../../../shared/pronoun';

/** One line of an opening card page; a `gap` has no text. */
export interface OpeningLine {
  text?: string;
  accent?: string[];
  kind?: 'dim' | 'tag' | 'label' | 'gap';
}
/** One page of the opening card: a block-letter name and the lines under it. */
export interface OpeningPage {
  title: string;
  lines: OpeningLine[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every on-screen string for the character-select screen, in one place; words about a character take her pronoun. */
export const COPY = {
  /**
   * The opening card before the splash (mockup docs/mockups/intro-story.html): three pages, each a block-letter name over
   * small text that scrolls. `accent` words show red; a line's `kind` is `dim`, `tag` (a red sub-head), `label` (a red
   * `//` head) or `gap` (a short blank line, no text).
   */
  openingCard: {
    pages: [
      {
        title: 'LOWLIGHT',
        lines: [
          { text: 'The sea came in, and the city built up instead of out.' },
          { kind: 'gap' },
          { text: 'The Spine carries the roads over the water on pylons, and people live hung under its decks. In Karasu the Ribbon stacks a street on a street on a street, and the bottom levels never see daylight.', accent: ['Spine', 'Karasu', 'Ribbon'] },
          { text: 'On top sits Nexus: glass, money, and a dark tower with no logo on it, because everyone already knows whose it is.', accent: ['Nexus'] },
          { kind: 'gap' },
          { text: 'Lowlight runs on three things it sells back to you. The grid, owned by the corps. The law, sold by SDG to the districts that can pay. The truth, rewritten by Spectra every morning for whoever paid for it.', accent: ['SDG', 'Spectra'] },
          { kind: 'gap' },
          { text: 'The city behaves like someone who has been cheated too many times. Patient. Watchful. Never generous. It remembers debts and forgets people.' },
          { text: 'Nobody calls it beautiful out loud. People who leave talk about it for the rest of their lives.', kind: 'dim' },
          { kind: 'gap' },
          // The runners close the brief and hand over to the next two names.
          { text: 'In between, runners do the work nobody admits to paying for. A debt vanishes. A file appears. A door stops opening.' },
          { kind: 'gap' },
          { text: 'Most people never know a runner touched their life.', accent: ['runner'] },
          { text: 'Tonight, two of them are working.' },
        ],
      },
      {
        title: 'HICKS',
        lines: [
          { text: 'NETRUNNER. FINDER, NO TICKET.', kind: 'tag' },
          { text: "Old Town born. One room on Level 2 of the Ribbon, where the stack barely sees daylight. He finds people who don't want finding.", accent: ['Old Town', 'Ribbon'] },
          { text: "SDG pulled his ticket when he wouldn't find people for them. He finds them anyway now, for whoever pays.", accent: ['SDG'] },
          { text: "His operator was his girlfriend. She's gone. He runs with nobody on his ear, and nobody says her name.", kind: 'dim' },
          { kind: 'gap' },
          { text: '// FIRST JOB: THE PASSENGER', kind: 'label' },
          { text: 'A card off the board at Second Socket. Lusk, a fixer under the Cat, wants a girl back for a placement house: nineteen, eleven days gone, a cart slot behind her left ear. The photo is on paper, which is how you know the house is worried.', accent: ['Lusk'] },
          { text: "The retainer folded inside is more than finder's work pays." },
          { text: "Ember Zhou, from down the hall, has already read it over his shoulder. She's going on his ear whether he asks or not.", accent: ['Ember Zhou'] },
        ],
      },
      {
        title: 'SOREN',
        lines: [
          { text: 'CASE OFFICER. FREIGHT SCHEDULER, ON PAPER.', kind: 'tag' },
          { text: "Grew up in Old Town's Grant blocks, the kid who could make a power meter forget a month. At nineteen a Sentinel named Kroll bought him.", accent: ['Old Town', 'Kroll'] },
          { text: "Ten years on he buys runners the same way, for SDG's plainclothes branch, under cover on the night shift at Kestrel. He lives on the top ring of Pylon Forty and eats at Oksana's counter.", accent: ['SDG', 'Kestrel'] },
          { text: 'SDG glass in his left eye. He assumes it is always recording.', kind: 'dim' },
          { kind: 'gap' },
          { text: '// FIRST JOB: RUN SHEET', kind: 'label' },
          { text: "Her message came at six, from a relay she thinks he can't trace: three words. Come up tonight. Weeks of tea beside Rue at Oksana's counter, and she has never asked him anywhere.", accent: ['Rue'] },
          { text: "Three years ago a Kestrel rig dropped its load above Forty-Three, and her father died under it. Kestrel says there's no run sheet for that night.", accent: ['Kestrel'] },
          { text: "She wants a scheduler to get it, with her on his ear. There's a hundred sol on the crate, so she owes him nothing." },
        ],
      },
    ] as OpeningPage[],
    /** The corner hint: while a page plays, while it scrolls, and once it waits on its last line. */
    hint: {
      playing: '[ANY KEY] FINISH · [ESC] SKIP',
      scrolling: '[WHEEL] SCROLL · [ANY KEY] SKIP TO END',
      ready: '[ANY KEY] CONTINUE · [ESC] SKIP',
    },
  },
  /** The desktop app's corner on the title (spec 2026-10-09 preview build §5.2). */
  help: {
    label: (v: string) => `PREVIEW ${v}`,
    button: '?',
    buttonLabel: 'Help',
    saveFolder: 'OPEN SAVE FOLDER',
    logFolder: 'OPEN LOG FOLDER',
    version: (v: string) => `VERSION ${v}`,
    copied: 'COPIED',
  },
  titleP1: 'SELECT YOUR OPERATOR',
  titleP2: 'SELECT YOUR CONTACT',
  tagP1: '1P · YOU',
  tagP2: 'CPU · AI',
  cursorP1: '1P',
  cursorP2: 'CPU',
  jackIn: '//JACK IN Y/N',
  awaiting: 'AWAITING SELECTION',
  fileHeader: (name: string) => `// FILE ${name}`,
  modelHeader: 'MODEL',
  catalogOffline: 'catalog offline',
  noMind: 'NO MIND ATTACHED',
  notConnected: 'Not connected',
  /** The + tile at 1P (character creator spec 2026-11-14). */
  newPerson: 'MAKE SOMEONE',
  /** The label over your made people at 1P. */
  yours: 'Yours',
  hintGrid: '[↑↓←→] MOVE · [ENTER] LOCK IN',
  hintBack: '[ESC] BACK',
  /** On a made person's tile at 1P (character creator spec 2026-11-14). */
  hintPerson: '[E] EDIT · [X] DELETE · [S] EXPORT FOR SILLYTAVERN',
  deleteAsk: (name: string) => `DELETE ${name.toUpperCase()}? Games already started keep them. [ENTER] YES · [ESC] NO`,
  /** READY's hints with SET THE SCENE's (S SET THE SCENE / S CHANGE THE SCENE). */
  hintReady: '[Y] JACK IN · [N] BACK',
  livePreviously: 'PREVIOUSLY',
  liveLink: 'LINK',
  /** LINK's value for a broken link (`unreachable`: her model's provider couldn't be reached). */
  linkStatus: { 'key-rejected': 'KEY REJECTED', 'no-link': 'NO LINK', 'no-credit': 'NO CREDIT', 'unreachable': 'UNREACHABLE', 'room-error': 'ROOM ERROR' },
  liveLastSeen: 'LAST SEEN',
  liveBackend: 'BACKEND',
  liveModel: 'MODEL',
  backendNames: { direct: 'DIRECT', none: 'NO MIND' },
  unreachable: '// ROOM SERVER UNREACHABLE',
  empty: '// NOTHING TO DIAL',
  dialFailed: (why: string) => `// COULDN'T SET THE MODEL — ${why}`,
  /** New Game refused (409 busy): another contact's reply is still streaming. */
  dialBusy: (name: string) => `Wait for ${name} to finish`,
  newGameFailed: (why: string) => `// COULDN'T START A NEW GAME — ${why}`,
  /** The link panel and the model step (spec 2026-10-08 §5). */
  link: {
    why: 'Your contacts think through OpenRouter. Paste a key to wake them — it stays on this machine.',
    fieldLabel: 'OPENROUTER KEY',
    getKeyLead: 'no key? ',
    getKey: 'get one → openrouter.ai/keys ↗',
    button: 'LINK',
    checking: 'checking…',
    back: '[ESC] BACK',
    linked: (credit: number | null) => (credit === null ? 'linked' : `linked · $${credit.toFixed(2)}`),
    noCredit: 'no credit on this key',
    noCreditShort: 'NO CREDIT',
    errors: {
      'key-rejected': "key rejected — OpenRouter didn't accept that key. Check you copied all of it.",
      unreachable: 'OpenRouter unreachable — check your connection.',
      'bad-key': "that doesn't look like a key — paste the whole thing.",
    },
    tileTag: 'NO LINK',
    stripExtra: (p: Pronoun) => `▶ PICK ${forms(p).her.toUpperCase()} TO LINK A MIND`,
    titleLink: 'LINK A MIND',
    titleModel: (p: Pronoun) => `CHOOSE ${forms(p).hers.toUpperCase()} MIND`,
    titleKeys: 'KEYS',
    /** The band's tabs (ALL MODELS counts them once they've loaded). */
    tabHer: (p: Pronoun) => `FOR ${forms(p).her.toUpperCase()}`,
    tabAll: (n: number | null) => (n === null ? 'ALL MODELS' : `ALL MODELS ${n}`),
    tabKeys: 'KEYS',
    allVendors: 'ALL',
    heads: { model: 'MODEL', memory: 'MEMORY', price: 'IN / OUT' },
    free: 'FREE',
    loading: 'loading…',
    catalogOffline: "the model list can't be reached right now",
    linkLine: (last4: string | null, credit: number | null, provider: 'openrouter' | 'anthropic' | 'nanogpt' = 'openrouter', plan?: { active: boolean; weekLeft: number | null }) =>
      `${COPY.link.providers[provider]} …${last4 ?? '????'}${plan?.active ? ` · ${COPY.link.planLine(plan.weekLeft)}` : ''}${credit === null ? '' : ` · $${credit.toFixed(2)}`}`,
    /** NanoGPT's plan, on KEYS and the band's summary: how much of the week's tokens is left. */
    planLine: (weekLeft: number | null) => (weekLeft === null ? 'PLAN' : `PLAN ${Math.round(weekLeft * 100)}% OF THE WEEK`),
    /** A row's name on KEYS, and the band's summary of what's linked. */
    providers: { openrouter: 'OPENROUTER', anthropic: 'ANTHROPIC', nanogpt: 'NANOGPT' },
    addLink: (provider: 'openrouter' | 'anthropic' | 'nanogpt') => `+ LINK ${COPY.link.providers[provider]}`,
    via: { anthropic: 'via your Anthropic key', nanogpt: 'via your NanoGPT key' },
    /** LINK A MIND on the Anthropic side (Anthropic backend spec §1): Claude models only. */
    anthropic: {
      why: 'Claude models only, through your own Anthropic key — Max plan API credits work here. It stays on this machine.',
      fieldLabel: 'ANTHROPIC KEY',
      getKey: 'get one → platform.claude.com/settings/keys ↗',
      href: 'https://platform.claude.com/settings/keys',
      errors: {
        'key-rejected': "key rejected — Anthropic didn't accept that key. Check you copied all of it.",
        unreachable: 'Anthropic unreachable — check your connection.',
        'bad-key': "that doesn't look like a key — paste the whole thing.",
      },
    },
    /** LINK A MIND on the NanoGPT side: its plan covers the open models (GLM, DeepSeek, Kimi); the rest bill its balance. */
    nanogpt: {
      why: "Open models — GLM, DeepSeek, Kimi — on NanoGPT's monthly plan; anything else it lists comes off your balance there. It stays on this machine.",
      fieldLabel: 'NANOGPT KEY',
      getKey: 'get one → nano-gpt.com/api ↗',
      href: 'https://nano-gpt.com/api',
      errors: {
        'key-rejected': "key rejected — NanoGPT didn't accept that key. Check you copied all of it.",
        unreachable: 'NanoGPT unreachable — check your connection.',
        'bad-key': "that doesn't look like a key — paste the whole thing.",
      },
    },
    changeKey: 'CHANGE KEY',
    unlinkFailed: (why: string) => `// COULDN'T UNLINK — ${why}`,
    unlink: 'UNLINK',
    unlinkConfirm: 'UNLINK? CLICK AGAIN',
    groups: { current: 'CURRENT', picks: 'PICKS', recent: 'RECENT' },
    reset: (p: Pronoun, label: string) => `↺ reset to ${forms(p).hers} default · ${label}`,
    search: 'SEARCH',
    searchEmpty: 'no matches',
    hint: '[▲▼] CHOOSE · [◀▶] TAB · TYPE TO SEARCH · [ENTER] PICK · [ESC] BACK',
    hintKeys: '[▲▼] CHOOSE · [◀▶] TAB · [ENTER] KEY · [ESC] BACK',
    hintLink: 'PASTE KEY · [ENTER] LINK · [ESC] BACK',
  },
  /** The YOU step (spec 2026-10-08 playable persona §2). */
  /** The creator over 1P (character creator spec 2026-11-14). */
  make: {
    title: 'MAKE SOMEONE',
    hint: 'TAB next field · CTRL+ENTER generate / keep · ESC back',
  },
  you: {
    title: 'WHO ARE YOU',
    playAs: (name: string) => `PLAY AS ${name.toUpperCase()}`,
    edit: 'EDIT',
    custom: 'CUSTOM',
    name: 'NAME',
    pronoun: 'PRONOUN',
    background: 'BACKGROUND',
    placeholder: 'Who are you? A line or a few paragraphs.',
    count: (n: number) => `${n} / 1200`,
    confirm: 'CONFIRM',
    back: '[ESC] BACK',
    tag: 'YOU',
    hint: '[▲▼] CHOOSE · [ENTER] PICK · [ESC] BACK',
    hintForm: '[CTRL+ENTER] CONFIRM · [ESC] BACK',
  },
};
