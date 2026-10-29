import '@fontsource/vt323';
import { bugReportOpen, installBugReportKey } from './ui/bug-report';
import { her, setHerPronoun } from './room/her-copy';
import type { Pronoun } from '../../shared/pronoun';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/tilt-neon';
import '@fontsource/teko/500.css';
import '@fontsource/teko/700.css';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/400-italic.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@fontsource/share-tech-mono';
import './ui/style.css';
import type { Atmosphere, ChatMessage, ChatMode, ClientEvent, Crop, KitView, LinkStatus, OtherInfo, PersonaInfo, QuestState, ResidentInfo, SceneDef, ServerEvent } from '../../shared/types';
import { connectSocket } from './net/socket';
import { createRenderer, type Renderer } from './renderer';
import type { EffectsState } from './renderer/effects';
import { DevPanel } from './ui/devpanel';
import { Feed, type CurrentLine } from './ui/feed';
import { mountPlanCard } from './ui/plan-card';
import { loadTextSpeed, saveTextSpeed, stepTextSpeed, textSpeedScale, type TextSpeed } from './ui/typing';
import { applyTextSize, loadTextSize, saveTextSize, stepTextSize, type TextSize } from './ui/text-size';
import { applyChatFont, loadChatFont, saveChatFont, stepChatFont, type ChatFont } from './ui/chat-font';
import { applyChatKeys, loadChatKeys, saveChatKeys, type ChatKeys } from './ui/chat-keys';
import type { ControlAction } from './ui/message-controls';
import { Hud } from './ui/hud';
import { JournalView } from './ui/journal';
import { MAP_CUE_LEVEL, MAP_CUE_URL, MapPanel } from './ui/map';
import { StoryDark } from './ui/map/story-dark';
import { MENU_CUE_LEVEL, MENU_CUE_URL } from './landing/menu-sound';
import { mapWho } from './ui/map/who';

import { ModelMenu } from './ui/model-menu';
import { modelLabel } from '../../shared/model-label';
import { stageFaces } from './ui/stage-faces';
import { Stage, outfitFor, type FigureSource } from './ui/stage';
import { StageLight } from './ui/stage-light';
import { AudioEngine } from './audio/engine';
import type { RoomAudioState } from './audio/room-audio';
import { createRoomAudio } from './audio/room-audio';
import { RecapCard, createRecapGate } from './ui/recap';
import { createGreetGate } from './ui/greet-gate';
import { createArrival, fetchDistrict, type Arrival, type IntroState } from './room/arrival';
import { sceneDraft } from './net/scenario';
import { moveLine } from '../../shared/arrival';
import { createRecapHold } from './room/recap-hold';
import { mountInput } from './ui/input';
import { suggestLine } from './net/suggest';
import { EncounterPanel, ENCOUNTER_COPY, hereLine } from './room/encounter-panel';
import { latestQuestStory, mountQuestCards } from './room/quest-cards';
import { mountSpeakerPortrait } from './room/speaker-portrait';
import { mountCommsInset } from './room/comms-inset';
import { mountQuestList, newlyOpen } from './room/quest-list';
import { WhosHere, partySpeaker, type Member } from './room/whos-here';
import { DoorLayer } from './room/doors';
import { listenHideUi } from './room/hide-ui';
import { encounterOptions } from './net/encounter';
import { getNarratorThinking, putNarratorThinking } from './net/link';
import { createDealer } from './room/encounter-dealer';
import { TurnTracker } from './ui/turn-state';
import { lastAgent, listenChromeKeys, markSkipIntro, reloadOnRestore, playerFromSearch, rememberAgent, routeFromPath, shouldReturnToDialIn, setFlash, showRoomNotice, takeFlash, takeSkipIntro, worldChangedPath } from './room/identity';
import { openSavePrompt, saveFailure } from './room/save-prompt';
import { sceneDir } from './scene-paths';
import { listenScreenCycle, type CycleScreen } from './room/screen-cycle';
import { crewSeen, openCrew, type CrewHandle, type CrewTab } from './room/crew-screen';
import { fetchCrew } from './net/crew';
import { openPeople, type PeopleHandle, type PeopleTab } from './room/people-screen';
import { openCharacterSheet, type SheetPage, type SheetPlayer } from './room/character-sheet';
import { fetchKit } from './net/kit';
import { ApiError, branchFrom, contacts, goSolo, leads, listPlaythroughs, saveNow, setLocation, setOutfit, wait } from './net/playthroughs';
import { greetAllowed, markWalkedOut, walkedOut, walkOutDue } from './room/walk-out';
import { resolveRoomPlayer } from './room/room-player';
import { residentOf } from './room/resident';
import { markSplashSeen } from './landing/splash';
import { GigWindow, type GigWindowOpts } from './ui/gig/window';
import { GIG_CUE_URL, GIG_MUSIC_LEVEL, GIG_MUSIC_URL, gigCuePlayer, type GigCueName } from './ui/gig/sound';
import { SLIP_CUE_URL, SLIP_MUSIC_LEVEL, SLIP_MUSIC_URL, slipCuePlayer, type SlipCueName } from './ui/slip/sound';
import { PAPERS_CUE_URL, papersCuePlayer, type PapersCueName } from './ui/papers/sound';
import type { PapersData } from '../../shared/papers/data';
import type { Brief } from '../../shared/gig/brief';
import { diceRoom } from './ui/dice/room';
import { DICE_CUE_URL, diceCuePlayer } from './ui/dice/sound';
import { DEFAULT_SETTINGS, type DiceSettings } from '../../shared/dice/opponent';
import type { DiceState } from '../../shared/dice/rules';
import type { District, Place } from '../../shared/map-schema';
import { gameRoot, mountGameStage } from './ui/game-stage';
import { playCheck } from './room/check-anim';
import { checkToPlay, type Shown } from './room/job-moment';
import { openTerminal } from './ui/crack/terminal';
import { crackCuePlayer } from './ui/crack/sound';
import { installLoreCard, markLore, setGlossary } from './ui/lore-hover';
import type { GlossaryEntry } from '../../shared/lore';
import { missionCuePlayer } from './ui/mission-sound';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}

/** Test hook for the Playwright e2e smoke test, installed on every page load (cheap). */
export interface NixRoomTestHook {
  /** The district load screen: its state, or 'closed' when this page skipped it. */
  intro(): IntroState;
  nonBlank(): boolean;
  /** The loaded room's frame in px (`[480, 270]` before the renderer is up). */
  frameSize(): [number, number];
  /** The room's drawn size on the canvas, in device px. */
  viewSize(): [number, number];
  /** Where the room is drawn, in window css px (zeros before the renderer is up). */
  roomRect(): { left: number; top: number; width: number; height: number };
  /** The room's ambient effects this frame, whether weather particles were drawn and whether they're clipped to window shapes. */
  effects(): (EffectsState & { weatherDrawn: boolean; weatherMasked: boolean }) | null;
  /** One pixel of the room's frame (frame px), `[r, g, b]`. */
  pixelAt(x: number, y: number): [number, number, number];
  fps(): number;
  warnings: string[];
  send(e: ClientEvent): void;
  /** The sound engine's state (Playwright can't listen). */
  audio(): RoomAudioState;
  /** Shortens the pause between a room's songs (e2e). */
  setMusicPause(min: number, max: number): void;
  /** Whether this connection asked for her greeting (see GreetGate). */
  greeting(): 'waiting' | 'sent' | 'not-due';
  /** Whether the room's socket is open: `send` drops events until it is. */
  connected(): boolean;
  /** The open gig run's solver route, when the page was opened with ?gigSeed= (e2e). */
  gig?: { path(): number[] | null };
  /** The open liar's dice game, when the page was opened with ?diceSeed= (e2e). */
  dice?: { state(): DiceState | null };
  /** Blacks out exactly these districts on the rendered map (spec 2026-10-27; [] brings the power back). */
  blackout?: (ids: string[]) => void;
  /** The districts the map was last told to black out (blackouts phase 3 e2e). */
  mapDark?: () => string[];
  /** How many windows and signs the map's live layer drew last frame (blackouts phase 2 e2e). */
  mapGridLights?: () => number;
}

declare global {
  interface Window {
    __nixRoom?: NixRoomTestHook;
  }
}

function startRoom(agentId: string): void {
  rememberAgent(agentId);
  const host = byId('stage');

  // The chat layer mounts (and the socket connects) independently of the renderer, so chat is
  // usable while the scene loads — and still works if WebGL init fails.
  let socket: ReturnType<typeof connectSocket> | null = null;
  const hud = new Hud(byId('hud'));
  // F8: report a bug from the scene, with a screenshot (spec 2026-10-11 bug report §3.1).
  installBugReportKey({ inScene: () => true });
  // The input is busy from the moment a turn is sent until it settles (see TurnTracker), while
  // any Nix reply streams, or while the socket is down (sends drop).
  const turns = new TurnTracker();
  let socketOpen = false;
  let serverLink: LinkStatus = 'down';
  let agentName = 'Nix';
  let agentAccent = '#ff4f8b';
  /** A BRANCH HERE on its way: the controls wait for it. */
  let branching = false;
  const updateBusy = () => {
    if (!socketOpen) input.setBusy(true, '// NO CARRIER');
    else input.setBusy(turns.busy);
    feed.setBusy(!socketOpen || turns.busy || branching);
    // Saving waits for her reply to finish, as the server would refuse it.
    hud.setSaveBusy(turns.busy ? agentName : null);
    refreshDice();
  };
  // Liar's dice (DICE in the HUD): set up below, once the stage, map and journal exist.
  let refreshDice = () => {};
  /** DICE in the scene keys: opens liar's dice (set once the table exists). */
  let openDice = () => {};
  const sendTurn = (e: ClientEvent) => {
    if (!socket) return;
    socket.send(e);
    turns.onSend();
    updateBusy();
  };
  // Message controls: regenerate / swipe / keep going go straight to the server (her reply then
  // streams, which makes the page busy); a delete keeps a copy for UNDO.
  const onControl = (a: ControlAction) => {
    if (!socket) return;
    switch (a.kind) {
      case 'regenerate':
      case 'continue':
      case 'rewind':
        socket.send({ type: a.kind, messageId: a.id });
        return;
      case 'swipe':
        socket.send({ type: 'swipe', messageId: a.id, index: a.index });
        return;
      case 'edit':
        socket.send({ type: 'edit_message', messageId: a.id, text: a.text });
        return;
      case 'branch':
        // The world switches to the new playthrough: the room reloads into it, on this line.
        branching = true;
        updateBusy();
        branchFrom(agentId, a.id)
          .then((info) => {
            setFlash(`// BRANCHED — ${info.name}`);
            leave(worldChangedPath(info.location), { branched: true });
          })
          .catch((err: unknown) => {
            branching = false;
            updateBusy();
            feed.showNotice(err instanceof ApiError && err.error === 'busy' ? waitFor(err.contact) : `// CAN'T BRANCH — ${reason(err)}`);
          });
        return;
      case 'delete': {
        const copy = feed.get(a.id);
        socket.send({ type: 'delete_message', messageId: a.id });
        feed.showNotice('// LINE DELETED ·', copy ? { label: 'UNDO', run: () => socket?.send({ type: 'restore_message', message: copy }) } : undefined);
        return;
      }
    }
  };
  const feed = new Feed(byId('feed'), (messageId) => sendTurn({ type: 'retry', messageId }), undefined, { stage: true, onControl });
  // Her plan's card (her plans spec §5): LET HER GO is her goodbye turn; GO WITH HER drops the plan.
  /** The line LET HER GO took from the box, until her parting row lands (a refusal puts it back). */
  let letGoDraft: string | null = null;
  const planCard = mountPlanCard(byId('feed'), {
    letGo: () => {
      planCard.show(null);
      // Your typed last line goes with it, as with LEAVE: one goodbye that answers it, not two.
      const text = input.takeDraft();
      letGoDraft = text || null;
      // Not a sendTurn: a refusal sends the card back rather than a turn (final review M1); her goodbye streams in as any reply does.
      socket?.send({ type: 'let_her_go', ...(text ? { text } : {}) });
    },
    stay: () => {
      planCard.show(null);
      socket?.send({ type: 'plan_drop' });
    },
  });
  // Text speed (the HUD's TEXT control): anyone's to set, kept per browser.
  let textSpeed = loadTextSpeed();
  const showTextSpeed = (next: TextSpeed) => {
    textSpeed = next;
    saveTextSpeed(next);
    feed.setTextSpeed(textSpeedScale(next));
    hud.showTextSpeed(next);
  };
  hud.setTextSpeedControl({ onPick: showTextSpeed, onStep: (d) => showTextSpeed(stepTextSpeed(textSpeed, d)) });
  showTextSpeed(textSpeed);
  // A notice left by the page before this one (a branch says where the room now is), shown once
  // her lines are in, so it isn't spent while the room is still loading.
  let flash = takeFlash();

  // The stage: the player's figure left (his persona), the agent's right (her sprite → portrait → monogram);
  // whoever's line is in the dialogue box is lit.
  const stage = new Stage(byId('stage-figures'));
  // Who's here, as a party window down the left: you, your contact, everyone else, a quest stranger; the speaker lit.
  const whosHere = new WhosHere(byId('whos-here'), { reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false });
  let partyYou: Member = { name: 'You', accent: '#7fe9ff', thumb: null };
  let partyContact: Member | null = null;
  /** The quest stranger present with a face, by name (their row in the party). */
  let partyStranger: string | null = null;
  whosHere.setParty(partyYou, partyContact);
  /** Comms (spec 2026-10-20): on the line, whether you can go on it, and where she is. */
  let comms: { on: boolean; can: boolean; where: string | null; herAt: string | null } = { on: false, can: false, where: null, herAt: null };
  const crops: { left: Crop; right: Crop } = { left: { top: 0, bottom: 0.5 }, right: { top: 0, bottom: 0.5 } };
  // Both callers run asynchronously (persona fetch, portrait event), after the dev panel below exists.
  const showCrops = () => devPanel.setStageCrops(crops, (side, crop) => stage.setCrop(side, crop));
  stage.setLeft([{ kind: 'silhouette' }], 'YOU', '#7fe9ff');
  /** Liar's dice owns her face while its tray is up (set once the dice room exists, below). */
  let diceOpen = () => false;
  /** Her faces and yours (expression names), for faces from actions; empty until the portrait and persona come. */
  let herFaces: string[] = [];
  let yourFaces: string[] = [];
  let herPronoun: Pronoun | undefined;
  /** The line in the box, kept so her faces and yours (which come after the history) re-apply when they arrive. */
  let currentLine: CurrentLine | null = null;
  const applyFaces = () => {
    const faces = stageFaces(currentLine, { her: herFaces, you: yourFaces, herPronoun });
    if (!diceOpen()) stage.setExpression('right', faces.right);
    stage.setExpression('left', faces.left);
  };
  feed.onCurrent((c) => {
    // Someone in the strip, or an encounter's stranger, has no figure: neither side is marked (their card lights instead).
    if (c) stage.setSpeaker(c.speaker === 'user' ? 'left' : c.speaker === 'contact' ? 'right' : null);
    whosHere.speaking(partySpeaker(c, partyStranger));
    // Faces from actions (spec 2026-10-20): hers from her *actions* on the page showing (else the reply's
    // stored face), yours from your line's; each neutral while the other speaks.
    currentLine = c;
    applyFaces();
  });
  /** Goodbyes not to offer WALK OUT for: walked out on (this browser), or stayed for (this page). */
  const stayedFor = new Set<string>();
  const noWalkOut = () => new Set([...walkedOut(), ...stayedFor]);
  const input = mountInput(byId('input'), (text, mode, o) => sendTurn({ type: 'user_message', text, mode, ...(o?.leave ? { leave: true } : {}) }), {
    initialMode: loadMode(),
    onModeChange: saveMode,
    onDraw: () => openEncounter(),
    onDice: () => openDice(),
    suggest: (steer) => suggestLine(agentId, steer),
    onWalkOut: () => void walkOut(),
    // stay: no WALK OUT again for this goodbye while the page is open (a reconnect, an edit).
    onStay: () => {
      const goodbye = feed.messages().findLast((m) => m.role === 'agent');
      if (goodbye) stayedFor.add(goodbye.id);
    },
  });
  // Quest lines (spec 2026-10-16 §3): the cards pinned above the input, QUEST's list under the HUD.
  let questState: QuestState = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };
  /** The quest and beat a held line was judged against (CONFIRM sends it back). */
  let questHeld: { id: string; beat: string } | null = null;
  /** The ending row already shown (its panel stays closed once closed). */
  let questEndShown: string | null = null;
  /** The story clock as the server last said (the waiting panel's countdown). */
  let storyClock: number | null = null;
  /** Where the server's dark districts go (blackouts phase 3 §4): the map, once it's built. */
  let powerEvents: ((dark: string[]) => void) | null = null;
  const questCardsHost = document.createElement('div');
  byId('input').before(questCardsHost);
  /** A quest row that came in on this tab (not history): only those play their check. */
  let freshQuestRow: string | null = null;
  /** A job's ending row that came in on this tab: its debrief shows. */
  let lastJobEnd: string | null = null;
  /** A failed check already played while it waited for REROLL / TAKE IT: its card and how many rolls. */
  let checkShown: Shown | null = null;
  /** Quest panel updates wait for a check playing on the cards. */
  let questPanel: Promise<void> = Promise.resolve();
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const cardFor = (choice: string) => questCardsHost.querySelector<HTMLElement>(`.qc-card[data-choice="${CSS.escape(choice)}"]`);
  /**
   * A job's check on its card before the panel moves on (small jobs spec §6): a fail that parked plays
   * on the card that rolled; the row that resolves it plays the rest (on REROLL's card), or the whole
   * check on a card that rolled once. Then the job's other cues: setting out, a new beat, ALARM up.
   */
  async function playJobMoment(prev: QuestState, next: QuestState): Promise<void> {
    const was = prev.active;
    const now = next.active;
    if (now?.alarm !== undefined) {
      if (!was || was.id !== now.id) {
        if (freshQuestRow) missionCue('start');
      } else if (was.beat !== now.beat) missionCue('beat');
      if (was && was.id === now.id && now.alarm > (was.alarm ?? 0)) missionCue('alarm');
    }
    const row = freshQuestRow ? feed.messages().find((m) => m.id === freshQuestRow) : undefined;
    if (!now?.rolled && !now?.blown) freshQuestRow = null;
    const { play, shown, blown } = checkToPlay(was, now, row, checkShown);
    checkShown = shown;
    const card = play ? cardFor(play.card) : null;
    if (play && card) await playCheck(card, { ...play, reduced: reducedMotion(), cue: missionCue });
    if (blown) missionCue('blown');
  }
  const questCards = mountQuestCards(questCardsHost, {
    // While the panel is up, the figures step out to either side to make room for it.
    onShown: (on) => gameRoot().classList.toggle('quest-up', on),
    onChoose: (choice, said) => {
      const at = said !== undefined && questHeld ? questHeld : questState.active;
      if (!at || !socket) return;
      markQuestHintDone();
      if (said !== undefined) input.clearDraft();
      questHeld = null;
      const now = questState.active;
      // A big job's route (big jobs spec §3): its gig window first, unless the e2e hook resolves it.
      const routeOf = now && now.id === at.id && now.beat === at.beat ? now.big?.routes?.[choice] : undefined;
      if (routeOf && !now?.big?.gigAuto) {
        openRouteGig({ id: at.id, beat: at.beat }, choice, routeOf);
        return;
      }
      // A crack card (small jobs spec §4): the terminal opens first; its moves go with the pick.
      const setup = now && now.id === at.id && now.beat === at.beat ? now.crack?.[choice] : undefined;
      if (setup) {
        const job = { id: at.id, beat: at.beat };
        openTerminal(gameRoot(), {
          setup,
          title: now!.title,
          cue: crackCue,
          alarm: now!.alarm ?? 0,
          reduced: reducedMotion(),
          onDone: ({ moves }) => socket?.send({ type: 'quest_choose', id: job.id, beat: job.beat, choice, moves }),
        });
        return;
      }
      socket.send({ type: 'quest_choose', id: at.id, beat: at.beat, choice, ...(said !== undefined ? { said } : {}) });
    },
    onContinue: (id) => socket?.send({ type: 'quest_continue', id }),
    // WAIT UNTIL (the waiting panel): the clock runs on to the hour it waits for, and the beat plays here.
    onWait: (minutes) => {
      wait({ minutes }).catch((err: unknown) => {
        feed.showNotice(err instanceof ApiError && err.status === 409 ? `// NOT NOW — ${agentName.toUpperCase()} IS REPLYING` : "// CAN'T WAIT RIGHT NOW");
      });
    },
    // Until your first pick ever, a line under the cards says you can talk it over first.
    hint: () => (questHintDone() ? null : `Talk it over with ${agentName}, or pick when you're ready. Saying what you do counts too.`),
    onHover: () => missionCue('hover'),
    // A big job's read (big jobs spec §3): the three words go to the server, which scores them.
    onRead: (read) => {
      const a = questState.active;
      if (a) socket?.send({ type: 'quest_choose', id: a.id, beat: a.beat, choice: '!read', read });
    },
    onTalk: (text) => {
      questHeld = null;
      input.clearDraft();
      sendTurn({ type: 'user_message', text, mode: 'rp', talk: true });
    },
  });
  // The stranger present, with a face: a framed bust beside the subtitles while they're in the scene (speaker portrait, 2026-10-17).
  const speakerPortrait = mountSpeakerPortrait(byId('feed'));
  const commsInset = mountCommsInset(byId('feed'));
  /** Comms on the stage (spec §2): no figure for her, her face on the monitor, her role, HANG UP, her pages tagged. */
  const applyComms = () => {
    byId('stage-figures').classList.toggle('on-comms', comms.on);
    document.querySelector('.feed-root')?.classList.toggle('comms', comms.on);
    commsInset.show(comms.on && partyContact ? { name: partyContact.name, face: `/api/agents/${encodeURIComponent(agentId)}/sprite`, where: comms.where ?? '', accent: partyContact.accent } : null);
    whosHere.setParty(partyYou, partyContact, { comms: comms.on });
    input.setComms(comms.on);
  };
  feed.onStranger((st) => {
    const s = st?.face ? { name: st.name, url: `/api/extras/${encodeURIComponent(st.face)}` } : null;
    speakerPortrait.show(s);
    // They're in the party window too, while they're here.
    partyStranger = s?.name ?? null;
    whosHere.setStranger(s);
  });
  const questListHost = document.createElement('div');
  gameRoot().append(questListHost);
  const questList = mountQuestList(questListHost, {
    onStart: (id) => socket?.send({ type: 'quest_start', id }),
    onOpen: () => hud.setQuestNew(false),
    onBuy: (item) => socket?.send({ type: 'fixer_buy', item }),
    onWalk: (id) => socket?.send({ type: 'quest_walk', id }),
  });
  /** Quests this tab has already announced as able to start here. */
  const questsAnnounced = new Set<string>();
  // Editing the held line takes the light off its card: what's in the field is talk again.
  byId('input').addEventListener('input', () => {
    questHeld = null;
    questCards.clearPick();
  });
  // Text size (SYS → TEXT SIZE): the reading text on the stage, kept per browser.
  let textSize = loadTextSize();
  const showTextSize = (next: TextSize) => {
    textSize = next;
    saveTextSize(next);
    applyTextSize(gameRoot(), next);
    hud.showTextSize(next);
    feed.relayout();
    input.refit();
  };
  hud.setTextSizeControl((d) => showTextSize(stepTextSize(textSize, d)));
  showTextSize(textSize);
  // Transcript font (SYS → FONT): the lines, not the names, kept per browser. Widths change, so re-page.
  let chatFont = loadChatFont();
  const showChatFont = (next: ChatFont) => {
    chatFont = next;
    saveChatFont(next);
    applyChatFont(gameRoot(), next);
    hud.showChatFont(next);
    feed.relayout();
  };
  hud.setChatFontControl((d) => showChatFont(stepChatFont(chatFont, d)));
  showChatFont(chatFont);
  void document.fonts?.ready.then(() => feed.relayout());
  // Chat keys (SYS → CHAT KEYS): the chat box's corner stacks as glyphs or words. Words widen the
  // subtitle's margins (--sub-x), so what's shown is re-paged.
  const showChatKeys = (k: ChatKeys) => {
    saveChatKeys(k);
    applyChatKeys(gameRoot(), k);
    hud.showChatKeys(k);
    feed.relayout();
    input.refit();
  };
  hud.setChatKeysControl(showChatKeys);
  showChatKeys(loadChatKeys());
  // Narrator thinking (SYS → NARRATOR THINKING): kept on the server, in data/settings.json. Lit only once it answers.
  hud.setThinkingControl((t) => {
    void putNarratorThinking(t).then(
      (saved) => hud.showThinking(saved),
      (err: unknown) => console.warn('[sys] narrator thinking not saved', err),
    );
  });
  void getNarratorThinking().then(
    (t) => hud.showThinking(t),
    () => {},
  );
  updateBusy();

  // The dev panel and the socket don't depend on the renderer: if WebGL init fails, chat still works.
  let renderer: Renderer | null = null;
  const devPanel = new DevPanel(byId('devpanel'), (e) => socket?.send(e), () => renderer?.fps() ?? 0);
  const warnings: string[] = [];
  const rendererReady: Promise<Renderer | null> = createRenderer(host, gameStage).then(
    (r) => {
      renderer = r;
      // The room's light on you, your contact and whoever in the strip is speaking (no renderer, no light: they stay as drawn).
      new StageLight(r, () => [...document.querySelectorAll<HTMLElement>('#stage-figures .stage-figure')]);
      // Each lightning strike's thunder (roomAudio exists by the time a strike can happen).
      r.onStrike((s) => roomAudio.thunder(s.distance, s.sceneId));
      r.onWarn((msg) => {
        console.warn(`[renderer] ${msg}`);
        devPanel.log('warn', msg);
        warnings.push(msg);
      });
      return r;
    },
    (err: unknown) => {
      const msg = `renderer failed to start (${err instanceof Error ? err.message : String(err)}); chat still works`;
      console.error(`[renderer] ${msg}`, err);
      devPanel.log('error', msg);
      warnings.push(msg);
      hud.setNotice('// RENDERER OFFLINE');
      return null;
    },
  );

  // Sound: plays once the player clicks or presses a key (browsers require it), follows every room event.
  // Its unlock listeners are registered before the recap card's, so the key that dismisses a recap
  // also turns the sound on.
  const roomAudio = createRoomAudio({
    engine: new AudioEngine({ warn: (m) => devPanel.log('warn', m) }),
    view: (v) => {
      hud.showSound(v);
      // Deferred: the first view arrives while roomAudio is still being created.
      queueMicrotask(() => devPanel.setSoundState(roomAudio.state()));
    },
  });
  // A job's cues (small jobs spec §6), at the UI cue level.
  const missionCue = missionCuePlayer(roomAudio);
  const crackCue = crackCuePlayer(roomAudio);
  hud.setSoundControl({
    onToggle: () => roomAudio.toggleMute(),
    onWheel: (n) => roomAudio.wheel(n),
    onMusic: (n) => roomAudio.musicStep(n),
    onAmbient: (n) => roomAudio.ambientStep(n),
  });
  devPanel.setSoundMixer(roomAudio.settings().channels, (ch, v) => roomAudio.setChannel(ch, v));
  const unlockAudio = (e: Event) =>
    roomAudio.gesture({ fromSpeaker: e.target instanceof Element && e.target.closest('.sys-row[data-row="sound"]') !== null });
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  // The arrival screen (spec 2026-10-27), in the district load screen's place: every room page opens
  // on it, except a reload from inside the room (leave() marks it). Created right after the audio
  // unlock, so the key that closes it still turns the sound on, and before every other room key
  // listener, which it blocks. The history decides whether it's a new game's opening or a resume.
  const intro: Arrival | null = takeSkipIntro()
    ? null
    : createArrival(byId('district-intro'), {
        reducedMotion: reducedMotion(),
        fetchDistrict,
        paused: bugReportOpen,
        suggest: (steer) => sceneDraft(agentId, steer),
      });
  /** The history has said whether the page-load screen is an opening or a resume (only the first counts). */
  let introModeSet = false;
  /** GO's arrival screen while it's up, and the room it goes to (spec 2026-10-27 §4). */
  let travelScreen: { screen: Arrival; sceneId: string } | null = null;
  /** Resolves once the first scene has loaded and drawn (or can't be: no WebGL, an unknown scene). */
  let markSceneReady = () => {};
  const firstSceneReady = new Promise<void>((resolve) => (markSceneReady = resolve));
  void firstSceneReady.then(() => intro?.ready());
  document.addEventListener('visibilitychange', () => roomAudio.visibility(document.hidden));
  const audioFrame = () => {
    roomAudio.frame(renderer?.time() ?? performance.now() / 1000);
    requestAnimationFrame(audioFrame);
  };
  requestAnimationFrame(audioFrame);

  window.__nixRoom = {
    nonBlank: () => renderer?.nonBlank() ?? false,
    frameSize: () => renderer?.frameSize() ?? [480, 270],
    viewSize: () => renderer?.viewSize() ?? [0, 0],
    roomRect: () => renderer?.roomRect() ?? { left: 0, top: 0, width: 0, height: 0 },
    effects: () => renderer?.effectsState() ?? null,
    pixelAt: (x, y) => renderer?.pixelAt(x, y) ?? [0, 0, 0],
    fps: () => renderer?.fps() ?? 0,
    warnings,
    send: (e) => socket?.send(e),
    audio: () => roomAudio.state(),
    setMusicPause: (min, max) => roomAudio.setMusicPause(min, max),
    greeting: () => greetGate.state(),
    connected: () => socketOpen,
    intro: () => intro?.state() ?? 'closed',
  };

  const scenes = new Map<string, SceneDef>();
  /** Places' residents (Hae at the noodle stall), from the scene list: id → how to draw her (the map's FIXED people). */
  let residents: Record<string, ResidentInfo> = {};
  /** Who's here besides you and her (the strip), from the room. */
  let others: OtherInfo[] = [];
  /** You, for the map's who's-here list (from the persona). */
  let mapPlayer: { id: string; name: string } | null = null;
  // Created before the journal panel: while it shows, its key listener runs first, so the
  // dismissing key (even J) only dismisses it.
  const recap = new RecapCard(byId('recap'), () => {
    socket?.send({ type: 'recap_seen' });
    greetGate.onRecapSeen();
  });
  const recapGate = createRecapGate();
  // She greets you once the recap card (if any) is out of the way.
  // The opening typed on the arrival screen goes with it, read when the greeting is asked for (spec 2026-10-27 §3).
  const greetGate = createGreetGate(() => {
    const opening = intro?.text() ?? '';
    socket?.send({ type: 'greet', ...(opening ? { opening } : {}) });
  });
  // A recap behind the district screen waits for it; the greeting follows the card either way.
  const recapHold = createRecapHold({ show: (text) => recap.show(text), greet: greetGate });
  if (intro) {
    greetGate.onIntro(true);
    intro.onClose(() => recapHold.introClosed());
  }
  // Every screen in the keys bar opens on the MAP's page-swap cue.
  // The journal: PEOPLE's JOURNAL tab (2026-10-18 spec §2); its notes arrive whether or not it's showing.
  const journal = new JournalView((e) => socket?.send(e));
  /** PEOPLE (CONTACTS · LEADS · JOURNAL), while it's up. */
  let people: PeopleHandle | null = null;
  // CREW (crew spec 2026-10-19 §4): its screen while open, and the playthrough its seen-results mark belongs to.
  let crew: CrewHandle | null = null;
  let crewPt = '';
  void listPlaythroughs().then((l) => (crewPt = l.active ?? ''), () => {});
  /** The tab PEOPLE last showed: the bar's PEOPLE and Alt+P open it there. */
  let lastPeopleTab: PeopleTab = 'contacts';
  // Gig runs: the hack window over the map (GIGS at a gig place); one at a time.
  let gigWindow: GigWindow | null = null;
  /** Why GIGS can't open (her link), or null; a down connection is checked when the map asks. */
  /** Why GIGS can't run: read when asked, since words about her follow her pronoun (her portrait can come after). */
  let gigWhyNot: (() => string) | null = null;
  const gigBlock = () => gigWhyNot?.() ?? (serverLink === 'ok' ? null : 'no link');
  const closeGig = () => {
    if (!gigWindow) return;
    gigWindow.destroy();
    gigWindow = null;
    // The room's own song comes back.
    roomAudio.overrideMusic(null);
  };
  const gigCue = gigCuePlayer(roomAudio);
  const slipCue = slipCuePlayer(roomAudio);
  const papersCue = papersCuePlayer(roomAudio);
  /** What every gig window shares: who's playing, the cues, the music, papers data, the dev strip. */
  const gigShared = (): Pick<GigWindowOpts, 'you' | 'contact' | 'onClose' | 'loadPapers' | 'cue' | 'music' | 'reducedMotion' | 'dev'> => ({
    you: personaName ?? 'You',
    contact: agentName,
    onClose: closeGig,
    loadPapers: () => fetch('/api/papers').then(async (r) => (r.ok ? ((await r.json()) as PapersData & { firstNight: boolean }) : null)),
      cue: (name) => {
        if (name.startsWith('slip:')) {
          const n = name.slice(5);
          if (n in SLIP_CUE_URL) slipCue(n as SlipCueName);
        } else if (name.startsWith('papers:')) {
          const n = name.slice(7);
          if (n in PAPERS_CUE_URL) papersCue(n as PapersCueName);
        } else if (name in GIG_CUE_URL) gigCue(name as GigCueName);
      },
      // The floor's track while a slip runs; the gig track on the jobs and result screens, and at the desk
      // until its track is made (PAPERS_MUSIC_URL: a missing file would stop the music, not fall back).
      music: (kind) => (kind === 'slip' ? roomAudio.overrideMusic(SLIP_MUSIC_URL, SLIP_MUSIC_LEVEL) : roomAudio.overrideMusic(GIG_MUSIC_URL, GIG_MUSIC_LEVEL)),
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      // The dev strip (seed, solver, REVEAL…): with the admin panel open, or a fixed ?gigSeed=.
      dev: devPanel.open || new URLSearchParams(location.search).has('gigSeed'),
  });
  const gigAudio = () => {
    for (const url of [...Object.values(GIG_CUE_URL), ...Object.values(SLIP_CUE_URL), ...Object.values(PAPERS_CUE_URL)]) roomAudio.preloadCue(url);
    roomAudio.overrideMusic(GIG_MUSIC_URL, GIG_MUSIC_LEVEL);
  };
  const openGig = (place: Place, district: District) => {
    if (gigWindow) return;
    gigAudio();
    gigWindow = new GigWindow(gameRoot(), {
      ...gigShared(),
      place: { id: place.id, name: place.name, district: district.name },
      load: () =>
        fetch(`/api/gigs?place=${encodeURIComponent(place.id)}`).then(async (r) => (r.ok ? ((await r.json()) as { briefs: Brief[] }).briefs : [])),
      // The window and the map stay up until her turn starts on it (or the server says why not).
      onSend: (run) => {
        if (socket && socketOpen) socket.send({ type: 'gig', ...run });
        else gigWindow?.showRefusal('no link');
      },
    });
  };
  /** A big job's route (big jobs spec §3): its gig, straight onto the board; the result goes back as the route's pick. */
  const openRouteGig = (job: { id: string; beat: string }, choice: string, route: { brief: Brief; seed: number }) => {
    if (gigWindow) return;
    gigAudio();
    gigWindow = new GigWindow(gameRoot(), {
      ...gigShared(),
      place: { id: route.brief.place, name: route.brief.title, district: '' },
      load: async () => [],
      direct: { brief: route.brief, seed: route.seed },
      onSend: (run) => socket?.send({ type: 'quest_choose', id: job.id, beat: job.beat, choice, gig: { result: run.result, seed: route.seed } }),
    });
  };
  const map = new MapPanel(byId('map'), {
    // Blackout switches on the map while the admin panel is open (spec 2026-10-27).
    dev: () => devPanel.open,
    // Rain over the rendered map follows the city's weather (the room's, carried room to room).
    weather: () => ({ weather: atmosphere?.weather ?? 'none', level: atmosphere?.weatherLevel ?? 0 }),
    onOpen: () => {
      roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
      hud.setOpen('map');
    },
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    load: () =>
      fetch('/api/map').then(async (r) => {
        if (r.ok) return r.json();
        const body = (await r.json().catch(() => ({}))) as { error?: string; errors?: { path: string; message: string }[] };
        throw new Error([body.error ?? r.statusText, ...(body.errors ?? []).map((e) => `${e.path}: ${e.message}`)].join(' · '));
      }),
    // You and her, at the place her room is (if it's on the map).
    who: (m) => ({
      ...mapWho({
        map: m,
        rooms: [...scenes.values()],
        sceneId: currentSceneId,
        residents,
        player: mapPlayer,
        contact: { id: agentId, name: agentName, accent: agentAccent },
        busy: turns.busy,
        gigBlock: gigBlock(),
      }),
      // A big job's marked places (big jobs spec §2).
      ...(questState.active?.big?.marks.length ? { jobMarks: Object.fromEntries(questState.active.big.marks.map((mk) => [mk.place, mk.line])) } : {}),
      comms: { on: comms.on, can: comms.can, herAt: comms.herAt },
    }),
    onTravel: (place, onComms) => openTravel(place, onComms === true),
    onGigs: openGig,
    escapeFirst: () => gigWindow?.handleEscape() ?? false,
    onClose: () => {
      closeGig();
      hud.setOpen(null);
    },
    // The menus' move/confirm, under the landing's 0.25 scale like the map's own cue.
    onCue: (c) => roomAudio.cue(MENU_CUE_URL[c], MENU_CUE_LEVEL[c] * 0.25),
    // The hack window and the MODEL menu over the map take their own keys (Enter in OTHER… must not GO).
    overlayOpen: () => gigWindow !== null || modelMenu.isOpen,
  });
  /**
   * GO on the map (spec 2026-10-27 §4): the arrival screen, not the move. It names where you're going
   * and what she'll read, takes your line, and only GO on it sends the move; BACK changes nothing.
   * The server still checks the move, and a refusal shows on the screen with your text kept.
   */
  function openTravel(placeId: string, onComms: boolean): void {
    const place = map.place(placeId);
    if (!place?.scene || travelScreen?.screen.open) return;
    const sceneId = place.scene;
    const from = loadedSceneId ? (map.placeOf(loadedSceneId)?.name ?? scenes.get(loadedSceneId)?.name ?? null) : null;
    const onLine = onComms || comms.on;
    const backToHer = comms.on && !onComms && sceneId === comms.herAt;
    const you = personaName ?? mapPlayer?.name ?? 'You';
    const screen = createArrival(byId('district-intro'), {
      reducedMotion: reducedMotion(),
      fetchDistrict,
      paused: bugReportOpen,
      travel: { sceneId, to: place.name, from, comms: onLine },
      moveLine: moveLine({ you, contact: agentName, from, to: place.name, ...(onLine ? { comms: { on: !backToHer } } : {}) }),
      preload: (id) => {
        const scene = scenes.get(id);
        for (const layer of scene?.layers ?? []) new Image().src = `${sceneDir(scene!)}${layer.src}`;
      },
      suggest: (steer) => suggestLine(agentId, steer, { from, to: place.name, comms: onLine && !backToHer, ...(backToHer ? { back: true } : {}) }),
    });
    screen.setClock(storyClock);
    // Going back to her, she isn't with you: the move line says where she is (final review M1).
    screen.setWith(backToHer ? null : onLine ? `${agentName.toUpperCase()} ON THE LINE` : `${agentName.toUpperCase()} COMES WITH YOU`);
    screen.onSend((line) => {
      // A dropped connection would swallow the move: say so on the screen, with the line kept (final review I2).
      if (!socketOpen) return screen.notice("the game server isn't connected: wait a moment, then GO again");
      socket?.send({ type: 'travel', place: placeId, ...(onComms ? { comms: true as const } : {}), ...(line ? { line } : {}) });
    });
    screen.onClose(() => {
      if (travelScreen?.screen === screen) travelScreen = null;
    });
    travelScreen = { screen, sceneId };
  }
  window.__nixRoom!.blackout = (ids) => map.setBlackout(ids);
  window.__nixRoom!.mapGridLights = () => map.gridLights;
  window.__nixRoom!.mapDark = () => map.darkDistricts;
  // The story's blackouts (phase 3 §4); the admin panel's switches own the map while it's open.
  const storyDark = new StoryDark((ids) => map.setBlackout(ids), () => devPanel.open);
  powerEvents = (dark) => storyDark.set(dark);
  // Opening the admin panel with the map open shows its blackout switches there and then.
  devPanel.onToggle((open) => {
    map.refreshDev();
    storyDark.devToggled(open);
  });
  roomAudio.preloadCue(MAP_CUE_URL);
  hud.setMapLink(() => {
    if (dice.open) return;
    // From YOU or PEOPLE it's a switch (the old one goes at once); otherwise MAP opens or closes.
    if ((currentScreen() ?? 'map') !== 'map') return switchTo('map');
    map.toggle();
  });
  // Liar's dice with her, on the stage between you (spec 2026-10-10 §3).
  let diceSettings: DiceSettings = DEFAULT_SETTINGS;
  const dice = diceRoom({
    her: () => ({ name: agentName, accent: agentAccent, settings: diceSettings }),
    you: () => personaName ?? 'You',
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    send: (e) => {
      if (socket && socketOpen) socket.send(e);
      else if (e.type === 'dice') dice.refusal('no link');
    },
    stage,
    // Closing the tray gives her back the face the box's line gives her (faces from actions).
    herFace: () => stageFaces(currentLine, { her: herFaces, you: yourFaces, herPronoun }).right,
    prefill: (text) => input.restoreDraft(text),
    feedExpanded: () => feed.expanded,
    cue: diceCuePlayer(roomAudio),
  });
  diceOpen = () => dice.open;
  const diceBlock = () => (turns.busy ? her().waitFor : gigBlock());
  refreshDice = () => input.setDiceBlock(diceBlock());
  openDice = () => {
    if (dice.open || diceBlock() !== null) return;
    if (people && !people.requestClose()) return;
    map.close();
    for (const url of Object.values(DICE_CUE_URL)) roomAudio.preloadCue(url);
    dice.start();
  };
  if (new URLSearchParams(location.search).has('diceSeed')) window.__nixRoom!.dice = { state: () => dice.state() };
  const modelMenu = new ModelMenu(byId('hud'), (e) => socket?.send(e));
  document.addEventListener('click', () => modelMenu.close());
  window.addEventListener('keydown', (e) => {
    if (shouldReturnToDialIn(e, { feedExpanded: feed.expanded, devPanelOpen: devPanel.open, journalOpen: people !== null })) location.assign('/');
  });

  // The chrome beside MAP: SAVE, CONTACTS and TITLE (spec 2026-10-07 §6), on S, C and T too.
  /** Set once the room is navigating away, so a later reason (the socket closing) can't redirect it. */
  let leaving = false;
  const leave = (path: string, o: { branched?: true } = {}) => {
    if (leaving) return;
    // A branch on its way switches the world (world-changed, the socket closing): the room waits
    // for its answer and leaves with it, so the new page can say where it is.
    if (branching && !o.branched) return;
    leaving = true;
    // A reload into a room (a branch, a world change, another contact) skips the district screen;
    // the title and /solo don't, so the next room opened from them shows it.
    if (path.startsWith('/room')) markSkipIntro();
    location.assign(path);
  };
  /** Who a `busy` refusal waits on: her, or (named by id) another contact. */
  const waitFor = (contact: string | undefined) =>
    `Wait for ${!contact || contact === agentId ? agentName : contact.charAt(0).toUpperCase() + contact.slice(1)} to finish`;
  const reason = (err: unknown) => (err instanceof ApiError ? err.error : err instanceof Error ? err.message : String(err));
  /** Whether the save prompt or the contacts panel is up (one at a time). */
  let chromeOpen = false;
  let sheet: ReturnType<typeof openCharacterSheet> | null = null;
  /** Who the YOU sheet shows: the persona once it loads. */
  let sheetPlayer: SheetPlayer | null = null;
  // Missions (spec 2026-10-18 §4): the kit the YOU sheet shows, fetched at load and after every quest move.
  let lastKit: KitView | null = null;
  // A job's cues on the kit (small jobs spec §6): heat here up, sol up, a new deck, EDGE back at 06:00.
  const refreshKit = () =>
    void fetchKit().then((k) => {
      const was = lastKit;
      lastKit = k;
      if (!was || !k) return;
      if (k.heatHere > was.heatHere) missionCue('heat');
      if (k.sol > was.sol) missionCue('sol');
      if (k.deck && k.deck.id !== was.deck?.id) missionCue('deck');
      if (k.edgeLeft > was.edgeLeft) missionCue('edge');
    }).then(() => crewDot());
  /** CREW's dot: a crew result newer than the last one seen on its ASSIGN tab. */
  const crewDot = () => hud.setCrewDot(!crew && lastKit !== null && lastKit.crewLatest !== null && lastKit.crewLatest > crewSeen(crewPt));
  refreshKit();
  // Lore words (feedback 2026-10-19): the glossary once, the card over the stage, and the lines already up marked.
  installLoreCard(gameRoot());
  void fetch('/api/lore/glossary')
    .then((r) => (r.ok ? (r.json() as Promise<{ glossary: GlossaryEntry[] }>) : null))
    .then((b) => {
      if (!b) return;
      setGlossary(b.glossary);
      for (const n of document.querySelectorAll<HTMLElement>('#feed .msg.agent .text, #feed .quest-row .text, .qc-story')) markLore(n);
    })
    .catch(() => {});
  let personaName: string | null = null;
  const openSave = async () => {
    if (chromeOpen) return;
    chromeOpen = true;
    map.close();
    let active: string | null;
    const scene = scenes.get(currentSceneId ?? '');
    let defaultName = scene?.name ?? '';
    // The card's line, as LOAD will show the save: where, when, and who's with you.
    let place = defaultName;
    let time: string | null = null;
    try {
      const [list, known] = await Promise.all([listPlaythroughs(), contacts().catch(() => [])]);
      active = list.active;
      const here = known.find((c) => c.id === agentId);
      if (here) {
        defaultName = here.timeOfDay ? `${here.placeName}, ${here.timeOfDay}` : here.placeName;
        place = here.placeName;
        time = here.timeOfDay;
      }
    } catch (err) {
      chromeOpen = false;
      feed.showNotice(`// CAN'T SAVE — ${reason(err)}`);
      return;
    }
    if (active === null) return leave('/');
    const playthrough = active;
    roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
    openSavePrompt(gameRoot(), {
      defaultName,
      snapshot: { picture: scene?.layers[0] ? sceneDir(scene) + scene.layers[0].src : null, place, time, withName: agentName, withAccent: agentAccent },
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => (chromeOpen = false),
      save: async (name) => {
        try {
          const saved = await saveNow(playthrough, name, agentId);
          feed.showNotice(`Saved: ${saved.name}`);
        } catch (err) {
          const f = saveFailure(err, waitFor);
          if ('leave' in f) return leave(f.leave);
          if ('notice' in f) {
            feed.showNotice(f.notice);
            return;
          }
          throw new Error(f.inline);
        }
      },
    });
  };
  /** WALK OUT: the playthrough goes solo, then the solo screen. */
  const walkOut = async () => {
    // Her goodbye stays the newest line until she greets you back: no WALK OUT for it then.
    const goodbye = feed.messages().findLast((m) => m.role === 'agent');
    try {
      await goSolo();
      if (goodbye) markWalkedOut(goodbye.id);
    } catch (err) {
      if (err instanceof ApiError && err.error === 'no-playthrough') return leave('/');
      feed.showNotice(err instanceof ApiError && err.error === 'busy' ? waitFor(err.contact) : `// CAN'T WALK OUT — ${reason(err)}`);
      return;
    }
    leave('/solo');
  };
  const goToContact = async (id: string) => {
    if (id === agentId) return;
    try {
      await setLocation(id);
    } catch (err) {
      if (err instanceof ApiError && err.error === 'no-playthrough') return leave('/');
      feed.showNotice(err instanceof ApiError && err.error === 'busy' ? waitFor(err.contact) : `// CAN'T GO THERE — ${reason(err)}`);
      return;
    }
    leave(`/room/${encodeURIComponent(id)}`);
  };
  // PEOPLE (2026-10-18 spec §2): CONTACTS, LEADS and JOURNAL as tabs of one screen. Its key on its own tab closes it.
  const openPeopleOn = (tab: PeopleTab) => {
    if (people) return people.tab === tab ? void people.requestClose() : people.show(tab);
    if (chromeOpen || dice.open) return;
    chromeOpen = true;
    map.close();
    roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
    const playthrough = <T,>(load: () => Promise<T>) => () =>
      load().catch((err: unknown) => {
        if (err instanceof ApiError && err.error === 'no-playthrough') leave('/');
        throw err;
      });
    people = openPeople(gameRoot(), {
      tab,
      contacts: playthrough(contacts),
      leads: playthrough(leads),
      journal,
      current: agentId,
      persona: personaName,
      dev: devPanel.open,
      pick: (id) => (people?.requestClose() ?? true) && void goToContact(id),
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => {
        if (people) lastPeopleTab = people.tab;
        people = null;
        chromeOpen = false;
        hud.setOpen(null);
      },
    });
    hud.setOpen('people');
  };
  // CREW (crew spec §4): ROSTER, ASSIGN and HIRE. Alt+K or its word opens it; Alt+K, Esc or the word closes it.
  const openCrewOn = (tab?: CrewTab) => {
    if (crew) return tab ? crew.show(tab) : crew.close();
    if (chromeOpen || dice.open) return;
    chromeOpen = true;
    map.close();
    roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
    crew = openCrew(gameRoot(), {
      load: fetchCrew,
      act: (action) => socket?.send({ type: 'crew', action }),
      ...(tab ? { tab } : {}),
      playthrough: crewPt,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => {
        crew = null;
        chromeOpen = false;
        hud.setOpen(null);
        crewDot();
      },
    });
    hud.setOpen('crew');
    hud.setCrewDot(false);
  };
  // YOU (character sheet, 2026-10-16): who you're playing; its sections are the roadmap until they're built.
  const toggleSheet = (page: SheetPage = 'file') => {
    if (sheet) return sheet.close();
    if (chromeOpen) return;
    chromeOpen = true;
    map.close();
    // Opened like the MAP: the same page-swap cue, the same glitch.
    roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
    // The kit as last heard (each quest move and clock move refreshes it), and a fresh fetch for the next look.
    refreshKit();
    sheet = openCharacterSheet(gameRoot(), {
      page,
      player: { ...(sheetPlayer ?? { name: personaName ?? 'You', sprite: null }), ...(lastKit ? { kit: lastKit } : {}) },
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => {
        sheet = null;
        chromeOpen = false;
        hud.setOpen(null);
      },
      // The wardrobe: your figure in the room changes with the sheet's, and the playthrough keeps it.
      onOutfit: async (outfit) => {
        const before = sheetPlayer?.outfit;
        const wear = (o: string | undefined) => {
          if (sheetPlayer) sheetPlayer = { ...sheetPlayer, outfit: o };
          stage.setOutfit('left', o ?? null);
        };
        wear(outfit ?? undefined);
        try {
          await setOutfit(outfit);
        } catch (e) {
          wear(before);
          throw e;
        }
      },
    });
    hud.setOpen('you');
  };
  /** Which of YOU, PEOPLE, CREW and MAP is up (one at a time), or null. */
  const currentScreen = (): CycleScreen | null => (sheet ? 'you' : people ? 'people' : crew ? 'crew' : map.isOpen ? 'map' : null);
  /** From the open one of the three to `s`: the old one goes at once (unsaved journal work refuses), the new one glitches in. */
  /** `dir` -1 (Shift+Tab on the cycle) comes into YOU at its last page, SHEET, so the ring runs the same both ways. */
  const switchTo = (s: CycleScreen, dir: 1 | -1 = 1) => {
    const cur = currentScreen();
    if (cur === s || dice.open) return;
    if (cur === 'people' && !people?.requestClose(true)) return;
    if (cur === 'you') sheet?.close(true);
    if (cur === 'crew') crew?.close(true);
    if (cur === 'map') map.close(true);
    if (s === 'you') toggleSheet(dir < 0 ? 'sheet' : 'file');
    else if (s === 'people') openPeopleOn(lastPeopleTab);
    else if (s === 'crew') openCrewOn();
    else map.open();
  };
  // Tab cycles YOU → PEOPLE → MAP while one is up (Shift+Tab back), unless a field of its own or something over it has the keys.
  listenScreenCycle(window, {
    current: currentScreen,
    inField: () => {
      const a = document.activeElement;
      return (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) && a.closest('.scr-root, #map') !== null;
    },
    blocked: () => gigWindow !== null || modelMenu.isOpen || bugReportOpen() || dice.open || recap.visible || encounterPanel !== null,
    go: switchTo,
    turnPage: (cur, dir) => cur === 'you' && sheet !== null && sheet.turnPage(dir),
  });
  hud.setYou(() => {
    if (dice.open) return;
    const cur = currentScreen();
    if (cur && cur !== 'you') return switchTo('you');
    if (!dice.open) toggleSheet();
  });
  hud.setSave(() => {
    if (!dice.open) void openSave();
  });
  hud.setPeople(() => ((currentScreen() ?? 'people') === 'people' ? openPeopleOn(lastPeopleTab) : switchTo('people')));
  hud.setCrew(() => ((currentScreen() ?? 'crew') === 'crew' ? openCrewOn() : switchTo('crew')));
  hud.setQuest(() => {
    if (!dice.open) questList.toggle();
  });
  hud.setBackLink(() => leave('/'));
  const hideUi = listenHideUi(window, document.body);
  listenChromeKeys(window, {
    modalOpen: () => chromeOpen || map.isOpen || recap.visible || encounterPanel !== null || dice.open || (intro?.open ?? false) || (travelScreen?.screen.open ?? false),
    run: (k) => {
      if (k === 'you') toggleSheet();
      else if (k === 'save') hud.pressSave();
      else if (k === 'people') openPeopleOn(lastPeopleTab);
      else if (k === 'contacts' || k === 'leads' || k === 'journal') openPeopleOn(k);
      else if (k === 'quest') questList.toggle();
      else if (k === 'crew') openCrewOn();
      else if (k === 'hide') hideUi.toggle();
      else leave('/');
    },
  });
  let loadedSceneId: string | null = null;
  // Doors (clickable doors spec §3): click one to go through its exit; inert while a panel is open.
  const doors = new DoorLayer(byId('doors'), {
    send: (to) => socket?.send({ type: 'exit', to }),
    blocked: () => chromeOpen || map.isOpen || whosHere.cardOpen || questList.isOpen || recap.visible || encounterPanel !== null || dice.open || (intro?.open ?? false) || (travelScreen?.screen.open ?? false) || gigWindow !== null,
    roomRect: () => renderer?.roomRect() ?? { left: 0, top: 0, width: 0, height: 0 },
    stage: () => gameStage.rect(),
  });
  gameStage.onRect(() => requestAnimationFrame(() => doors.layout()));
  // Her outfit follows the room's scene: her scene → outfit map (from her sprite) and the scene she's in now.
  let outfitByScene: Record<string, string> | undefined;
  let currentSceneId: string | null = null;

  // Encounter cards: ◆ DRAW deals three events for this moment; playing one sends it, and she reacts.
  let encounterPanel: EncounterPanel | null = null;
  /** The deals: one call at a time, and the last set kept (a second DRAW reopens it free) until a new turn lands or you move. */
  const dealer = createDealer(() => encounterOptions(agentId));
  let modelText: string | undefined;
  let atmosphere: Atmosphere | null = null;
  const closeEncounter = () => {
    encounterPanel?.destroy();
    encounterPanel = null;
  };
  const openEncounter = () => {
    if (encounterPanel) return;
    const scene = currentSceneId ? scenes.get(currentSceneId) : undefined;
    const header = [
      `${(personaName ?? 'YOU').toUpperCase()} × ${agentName.toUpperCase()}`,
      scene?.name.toUpperCase(),
      atmosphere?.timeOfDay.toUpperCase(),
      atmosphere && atmosphere.weather !== 'none' ? atmosphere.weather.toUpperCase() : null,
      hereLine(others.map((o) => o.name)),
    ]
      .filter(Boolean)
      .join(' · ');
    encounterPanel = new EncounterPanel(gameRoot(), {
      header,
      ...(modelText ? { model: modelText } : {}),
      cached: dealer.cached,
      load: () => dealer.load(),
      onPlay: (encounter) => {
        // Still in character, connected and idle? (The bar's DRAW state says why not.)
        const why = input.drawWhyNot() ?? (socket ? null : her().waitToFinish);
        if (why) encounterPanel?.showRefusal(why);
        else socket?.send({ type: 'encounter', encounter });
      },
      onCancel: closeEncounter,
      onCache: () => {}, // the dealer keeps it
    });
  };
  // While the panel is up it has the keyboard: its own keys, and no typing into the prompt behind
  // it. Alt+M (out of character) and Alt+E (END SCENE) close it first — its events were for this
  // scene, in character. Other Alt shortcuts wait (the save prompt checks it as a modal).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!encounterPanel) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyM' || e.code === 'KeyE')) {
        closeEncounter();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      encounterPanel.key(e);
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  // Room events are applied strictly in order, even when one has to wait for a scene load.
  let queue: Promise<void> = Promise.resolve();

  const onEvent = (e: ServerEvent) => {
    const { restoreDraft } = turns.onEvent(e);
    if (restoreDraft !== undefined) input.restoreDraft(restoreDraft);
    updateBusy();

    switch (e.type) {
      case 'history':
        feed.setHistory(e.messages);
        input.setWalkOut(walkOutDue(feed.messages(), noWalkOut()));
        greetGate.onHistory(greetAllowed(e.greetDue, feed.messages(), noWalkOut()));
        // The page-load screen: a new game opens on HOW IT OPENS, anything else picks up where it was.
        if (!introModeSet) {
          introModeSet = true;
          const opening = e.greetDue && feed.messages().length === 0;
          intro?.setMode(opening ? 'opening' : 'resume');
          if (opening) intro?.setWith(`${agentName.toUpperCase()} COMES WITH YOU`);
        }
        if (flash) {
          feed.showNotice(flash);
          flash = null;
        }
        break;
      case 'message':
        feed.upsert(e.message);
        if (e.message.role === 'user' && e.message.mode === 'quest') {
          freshQuestRow = e.message.id;
          if (e.message.quest?.debrief) lastJobEnd = e.message.id;
        }
        if (e.message.role === 'user' && e.message.parting === 'her') letGoDraft = null;
        input.setWalkOut(walkOutDue(feed.messages(), noWalkOut()));
        // A new turn: the dealt set was for the moment before it. A played event closes the panel.
        if (e.message.role === 'user' && e.message.status === 'ok') {
          dealer.clear();
          if (e.message.mode === 'encounter') closeEncounter();
          // Her turn has started on the game: the tray goes, her face back to hers.
          if (e.message.mode === 'dice') dice.row(e.message);
          // Her turn has started on the run: the window and the map go.
          if (e.message.mode === 'gig') {
            closeGig();
            map.close();
          }
        }
        break;
      case 'turn_rejected':
        // No key linked: the room can't run her turns until the player relinks at select.
        if (e.reason === 'no-link') intro?.close();
        if (e.reason === 'no-link') showRoomNotice(gameRoot(), { id: agentId, name: agentName, reason: 'no-link' });
        else devPanel.log('warn', `${agentName} is still replying — your message was not sent`);
        break;
      case 'dice_line':
        dice.line(e);
        break;
      case 'messages_removed':
        feed.remove(e.ids);
        input.setWalkOut(walkOutDue(feed.messages(), noWalkOut()));
        break;
      case 'control_rejected':
        // A refused LET HER GO: the card comes back, and so does the line it took.
        if (letGoDraft !== null) input.restoreDraft(letGoDraft);
        letGoDraft = null;
        feed.showNotice(e.reason === 'busy' ? `// NOT NOW — ${agentName.toUpperCase()} IS REPLYING` : "// CAN'T DO THAT HERE");
        break;
      case 'nix_delta':
        feed.delta(e.messageId, e.delta);
        break;
      case 'tool_line':
        feed.toolLine(e.messageId, e.text);
        devPanel.log('info', e.text);
        break;
      case 'sound':
        roomAudio.roomSound(e.scene, e.name);
        break;
      case 'link':
        serverLink = e.status;
        refreshDice();
        greetGate.onLink(e.status);
        if (socketOpen) hud.setLink(e.status);
        devPanel.setLink(e.status);
        break;
      case 'model': {
        devPanel.setModel(e);
        const label = e.label ?? modelLabel(e.model);
        hud.setModel(label.toUpperCase(), () => modelMenu.toggle());
        modelMenu.update(e);
        feed.setModelLabels(new Map((e.choices ?? []).map((c) => [c.id, c.label])));
        modelText = label.toUpperCase();
        break;
      }
      case 'model_rejected':
        modelMenu.reject(e.reason);
        break;
      case 'quest_state': {
        const prev = questState;
        const next = e.state;
        questState = next;
        refreshKit();
        questHeld = null;
        // A job's check plays on the cards first; then the written text stays readable in the panel (the box moves on to her reply).
        questPanel = questPanel
          .then(() => playJobMoment(prev, next))
          .catch(() => {})
          .then(() => {
            if (questState !== next) return;
            const story = latestQuestStory(feed.messages());
            // A blown job's cover cards read under the pick that blew it (its row is written after the card).
            const blown = next.active?.blown;
            const shownStory = blown ? (blown.pick && blown.text.startsWith(blown.pick.line) ? blown.text.slice(blown.pick.line.length).replace(/^\n+/, '') : blown.text) : story?.text;
            if (next.active) questCards.show(next.active, shownStory);
            else if (next.waiting) questCards.waiting(next.waiting, storyClock, story?.text);
            else if (story?.ended && story.id !== questEndShown) {
              questEndShown = story.id;
              // A job's debrief (small jobs spec §6); its stamp sounds and its sol counts up only for an ending that came in on this tab.
              const debrief = feed.messages().find((m) => m.id === story.id)?.quest?.debrief;
              const live = story.id === lastJobEnd;
              questCards.end(story.title, story.text, debrief ? { debrief, cue: live ? missionCue : () => {}, reduced: !live || reducedMotion() } : undefined);
            } else questCards.show(null);
          });
        questList.show(e.state);
        hud.setQuestShown(questList.has());
        {
          // A quest that can now start here: say so once (unless another notice is up), and light QUEST until the list is opened.
          const fresh = newlyOpen(questsAnnounced, e.state);
          if (fresh.length > 0) {
            feed.showNotice(`◆ ${fresh.length === 1 ? `${fresh[0].title.toUpperCase()} CAN START HERE` : `${fresh.length} QUESTS CAN START HERE`} — QUEST (ALT+Q)`, { label: 'OPEN', run: () => questList.toggle() }, { polite: true });
            hud.setQuestNew(true);
          }
          if (e.state.open.length === 0) hud.setQuestNew(false);
        }
        break;
      }
      case 'quest_pick':
        questHeld = { id: e.id, beat: e.beat };
        questCards.pick(e.choice, e.text);
        break;
      case 'notice':
        // A play the server refused (busy, no key) is said in the open panel; anything else in the feed.
        if (e.for === 'encounter' && encounterPanel) encounterPanel.showRefusal(e.text);
        else if (e.for === 'gig' && gigWindow) gigWindow.showRefusal(e.text);
        else if (e.for === 'dice' && dice.open) dice.refusal(e.text);
        else if (e.for === 'crew' && crew) crew.refusal(e.text);
        // GO refused (busy, no key, not on your line): said on the arrival screen, the line kept.
        else if (e.for === 'travel' && travelScreen?.screen.open) travelScreen.screen.notice(e.text);
        else {
          feed.showNotice(e.text);
          doors.refused();
        }
        break;
      case 'crew_changed':
        crew?.refresh();
        refreshKit();
        break;
      case 'power':
        // Blackouts phase 3 §4: the HUD says whether this room has power; the map darkens every district without.
        hud.setPower(e.here);
        powerEvents?.(e.dark);
        break;
      case 'texts_unread':
        // Someone texted you and you haven't seen it on the deck (promised texts spec §6).
        hud.setTexts(e.from);
        break;
      case 'clock':
        // A WAIT or a trip moves the clock: heat cools and EDGE refills at 06:00 (missions spec §1); crew errands land.
        refreshKit();
        crew?.refresh();
        storyClock = e.clock;
        questCards.clock(e.clock);
        hud.setClock(e.clock);
        intro?.setClock(e.clock);
        travelScreen?.screen.setClock(e.clock);
        break;
      case 'plan_card':
        planCard.show(e.card);
        break;
      case 'comms':
        comms = { on: e.on, can: e.can, where: e.where, herAt: e.herAt };
        applyComms();
        break;
      case 'world-changed':
        // Another tab switched playthroughs: follow the world to its contact, or to the solo screen (this socket closes next).
        // The server sent you solo after her goodbye (HANG UP, a dropped line): that goodbye is walked out on.
        if (e.solo === true && walkOutDue(feed.messages(), noWalkOut())) {
          const goodbye = feed.messages().findLast((m) => m.role === 'agent');
          if (goodbye) markWalkedOut(goodbye.id);
        }
        leave(worldChangedPath(e.location, e.solo === true));
        break;
      case 'portrait': {
        const chain: FigureSource[] = [];
        if (e.sprite) {
          chain.push({ kind: 'sprite', url: e.sprite.url, crop: e.sprite.crop, height: e.sprite.height, pixel: e.sprite.pixel, expressions: e.sprite.expressions, outfits: e.sprite.outfits });
          crops.right = e.sprite.crop;
        }
        if (e.kind !== 'monogram') chain.push({ kind: 'portrait', url: e.url });
        chain.push({ kind: 'monogram', letter: e.name.charAt(0).toUpperCase() });
        stage.setRight(chain, e.name, e.accent);
        partyContact = { name: e.name, accent: e.accent, thumb: e.kind === 'monogram' ? null : `/api/agents/${encodeURIComponent(agentId)}/thumb` };
        journal.setContact({ name: e.name, accent: e.accent, face: partyContact.thumb });
        whosHere.setParty(partyYou, partyContact, { comms: comms.on });
        applyComms();
        outfitByScene = e.sprite?.outfitByScene;
        stage.setOutfit('right', outfitFor(outfitByScene, loadedSceneId ?? currentSceneId));
        showCrops();
        herFaces = Object.keys(e.sprite?.expressions ?? {});
        herPronoun = e.pronoun;
        applyFaces();
        devPanel.setExpressions(Object.keys(e.sprite?.expressions ?? {}), (name) =>
          socket?.send({ type: 'dev_action', tool: 'set_expression', args: { name } }),
        );
      }
        agentName = e.name;
        agentAccent = e.accent;
        setHerPronoun(e.pronoun);
        refreshDice(); // its block text (needs her direct link) was worded before her pronoun came
        feed.setPortrait(e.url, e.kind, e.name);
        feed.setAgentName(e.name);
        input.setAgentName(e.name);
        document.documentElement.style.setProperty('--agent', e.accent);
        document.title = `${e.name} · Nix Room`;
        break;
      case 'journal':
        journal.setNotes(e.notes);
        break;
      case 'dossier_page':
        journal.setPage(e);
        break;
      case 'recap': {
        const text = recapGate.onEvent(e);
        if (recapHold.recap(text, intro?.open ?? false)) break;
        if (text && !recap.visible) recap.show(text);
        greetGate.onRecap(recap.visible);
        break;
      }
      case 'scribe_runs':
        devPanel.setScribeRuns(e.runs);
        break;
      case 'dev_log':
        // A refused journal edit comes back as a warning to this tab: show it in the open panel too.
        if (e.level === 'warn' && people?.tab === 'journal') journal.showError(e.text);
        devPanel.log(e.level, e.text);
        break;
      case 'room': {
        // A move: events dealt for the place before don't fit here.
        if (currentSceneId !== null && currentSceneId !== e.state.sceneId) {
          dealer.clear();
          closeEncounter();
          dice.roomChanged();
        }
        atmosphere = e.state.atmosphere;
        currentSceneId = e.state.sceneId;
        const scene = scenes.get(e.state.sceneId);
        hud.setScene(scene?.name ?? e.state.sceneId);
        hud.setAtmosphere(e.state.atmosphere);
        devPanel.setRoom(e.state);
        if (scene) {
          roomAudio.room(e.state, scene, '/scenes/', e.source === 'restore' ? 0 : e.duration, e.transition);
          roomAudio.place(scene, '/scenes/', e.source === 'restore' ? 0 : e.duration);
          devPanel.setSoundState(roomAudio.state());
        }
        break;
      }
    }

    if (e.type === 'others') {
      others = e.others;
      // Her replies split by everyone who could speak in them, here or gone (a goodbye stays theirs).
      feed.setOthers(e.voices.map((o) => ({ id: o.id, name: o.name, accent: o.accent })));
      whosHere.set(others);
    } else if (e.type === 'scenes') {
      residents = e.residents ?? {};
      for (const s of e.scenes) scenes.set(s.id, s);
      devPanel.setScenes(e.scenes);
    } else if (e.type === 'room') {
      /** The room has drawn (or can't): the page-load screen's bar fills, and GO's screen steps aside. */
      const arrived = (sceneId: string) => {
        markSceneReady();
        if (travelScreen && travelScreen.sceneId === sceneId) travelScreen.screen.ready();
      };
      // The server finds the room's district from the map (rooms sit in folders named for no district).
      const arriving = scenes.get(e.state.sceneId);
      intro?.setScene(arriving ? e.state.sceneId : undefined, arriving?.name ?? e.state.sceneId);
      // A move takes the old room's doors away at once; the new room's come once its picture is up.
      if (e.state.sceneId !== loadedSceneId) doors.show(null);
      queue = queue
        .then(async () => {
          const renderer = await rendererReady;
          // Her outfit changes with the scene's backdrop (mid-transition); with no backdrop to wait for, at once.
          const dress = (sceneId: string) => {
            stage.setOutfit('right', outfitFor(outfitByScene, sceneId));
          };
          if (!renderer) {
            arrived(e.state.sceneId);
            return dress(e.state.sceneId);
          }
          if (e.state.sceneId !== loadedSceneId) {
            const scene = scenes.get(e.state.sceneId);
            if (!scene) {
              console.warn(`[room] unknown scene ${e.state.sceneId}`);
              arrived(e.state.sceneId);
              return dress(e.state.sceneId);
            }
            const swap = async () => {
              await renderer.loadScene(scene);
              loadedSceneId = scene.id;
              doors.show(scene);
              dress(scene.id);
              renderer.applyState(e.state, 0);
              arrived(e.state.sceneId);
            };
            // The first scene just appears; later scene changes play their transition (default fade).
            if (loadedSceneId === null) await swap();
            else await renderer.playTransition(e.transition ?? 'fade', swap);
          } else {
            renderer.applyState(e.state, e.duration, e.transition);
          }
        })
        .catch((err) => {
          console.error('[room] failed to apply state', err);
          // A failed first load still lets the district screen finish.
          arrived(e.state.sceneId);
        });
    }
  };

  const fetchPersona = (as: string | null): Promise<{ persona: PersonaInfo | null }> =>
    fetch(`/api/persona${as !== null ? `?as=${encodeURIComponent(as)}` : ''}`).then((r) => r.json() as Promise<{ persona: PersonaInfo | null }>);

  void resolveRoomPlayer(location.search, fetchPersona)
    .catch((): Awaited<ReturnType<typeof resolveRoomPlayer>> => ({ player: playerFromSearch(location.search), persona: null, search: null }))
    .then(({ player, persona, search }) => {
      if (search !== null) history.replaceState(null, '', `${location.pathname}${search}`);
      if (persona) {
        feed.setUserName(persona.name);
        mapPlayer = { id: persona.id, name: persona.name };
        personaName = persona.name;
        // Your outfit is the one picked on the YOU sheet; unlike hers, it doesn't follow the scene.
        const outfitUrl = (name: string) => `/api/agents/${encodeURIComponent(persona.id)}/outfit/${encodeURIComponent(name)}`;
        const outfits = Object.fromEntries((persona.outfits ?? []).map((n) => [n, outfitUrl(n)]));
        sheetPlayer = {
          name: persona.name,
          sprite: persona.sprite,
          accent: persona.accent,
          tagline: persona.tagline,
          outfits: persona.outfits,
          outfit: persona.outfit,
          baseOutfit: persona.baseOutfit,
          outfitUrl,
          bio: persona.bio,
          facts: persona.facts,
        };
        const chain: FigureSource[] = persona.sprite
          ? [{ kind: 'sprite', url: persona.sprite.url, crop: persona.sprite.crop, height: persona.sprite.height, pixel: persona.sprite.pixel, expressions: persona.expressions, outfits }]
          : [];
        yourFaces = Object.keys(persona.expressions ?? {});
        applyFaces();
        stage.setOutfit('left', persona.outfit ?? null);
        stage.setLeft([...chain, { kind: 'silhouette' }], persona.name, '#7fe9ff');
        partyYou = { name: persona.name, accent: persona.accent ?? '#7fe9ff', thumb: persona.sprite ? `/api/agents/${encodeURIComponent(persona.id)}/thumb` : null };
        whosHere.setParty(partyYou, partyContact, { comms: comms.on });
        if (persona.sprite) crops.left = persona.sprite.crop;
        showCrops();
        journal.setPlayerName(persona.name);
      }
      socket = connectSocket(
        agentId,
        player,
        onEvent,
        (open) => {
          socketOpen = open;
          if (open) {
            recapGate.onConnect();
            greetGate.onConnect();
          }
          if (!open) turns.onSocketClosed();
          hud.setLink(open ? serverLink : 'socket-down');
          updateBusy();
        },
        // 4409 no playthrough, 4410 the world switched: back to the title.
        (code) => {
          // A room that won't open says why: the district screen gets out of its way.
          intro?.close();
          if (code === 4404) void explainRefusal(agentId);
          else leave('/');
        },
      );
    });

  // A connected contact whose key is missing or rejected still gets her room, plus the fix-it notice.
  void fetchAgent(agentId).then((a) => {
    if (a?.connected && (a.link === 'key-rejected' || a.link === 'no-link')) intro?.close();
    if (a?.connected && (a.link === 'key-rejected' || a.link === 'no-link')) showRoomNotice(gameRoot(), { id: a.id, name: a.name, reason: a.link });
    // DRAW needs her link with a working key.
    const why: (() => string) | null =
      a?.link === 'no-link'
        ? () => ENCOUNTER_COPY.noKey
        : a?.link === 'key-rejected'
          ? () => her().encounters.keyRejected
          : a?.link === 'no-credit'
            ? () => her().encounters.noCredit
            : null;
    if (why) input.setDraw({ ok: false, why });
    gigWhyNot = a?.link === 'no-link' || a?.link === 'key-rejected' || a?.link === 'no-credit' ? () => 'no link' : null;
    if (a?.dice) diceSettings = a.dice;
    refreshDice();
  });
}

interface AgentSummary {
  id: string;
  name: string;
  connected: boolean;
  link: string;
  backend: 'direct' | 'none';
  dice?: DiceSettings;
}

async function fetchAgent(id: string): Promise<AgentSummary | null> {
  try {
    const res = await fetch('/api/agents');
    const body = (await res.json()) as { agents: AgentSummary[] };
    return body.agents.find((a) => a.id === id) ?? null;
  } catch {
    return null;
  }
}

/** The server refused /ws/<id>: say why (unknown agent, a character with no mind, or not connected yet). */
async function explainRefusal(id: string): Promise<void> {
  const a = await fetchAgent(id);
  showRoomNotice(gameRoot(), { id, name: a?.name ?? id, reason: !a ? 'unknown' : a.backend === 'none' ? 'no-mind' : 'not-connected' });
}

/** The 1600×900 stage every game screen lays out on, zoomed to the window (spec 2026-10-16). */
const gameStage = mountGameStage(byId('game'));

const route = routeFromPath(location.pathname, lastAgent());
if (route.kind === 'room') {
  markSplashSeen(); // the splash opens the app; back from a room (even one opened directly) skips it
  reloadOnRestore(window);
  startRoom(route.id);
} else if (route.kind === 'solo') {
  markSplashSeen(); // between scenes: back to the title skips the splash, as from a room
  void import('./landing/solo').then((m) => m.startSolo());
} else {
  void import('./landing/landing').then((m) => m.startLanding());
}

const MODE_KEY = 'nix-room.mode';
const QUEST_HINT_KEY = 'nix-room.quest-hint-done';

/** Whether this viewer has made a quest pick (the hint under the cards then stays away); storage failures show it. */
function questHintDone(): boolean {
  try {
    return localStorage.getItem(QUEST_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function markQuestHintDone(): void {
  try {
    localStorage.setItem(QUEST_HINT_KEY, '1');
  } catch {
    // Private windows can refuse storage; the hint then comes back on reload.
  }
}

/** The last roleplay/OOC choice; a per-viewer convenience, so storage failures just mean roleplay. */
function loadMode(): Exclude<ChatMode, 'end' | 'greet' | 'travel' | 'scene' | 'encounter' | 'quest' | 'gig' | 'dice' | 'text'> {
  try {
    return localStorage.getItem(MODE_KEY) === 'ooc' ? 'ooc' : 'rp';
  } catch {
    return 'rp';
  }
}

function saveMode(mode: Exclude<ChatMode, 'end' | 'greet' | 'scene' | 'encounter' | 'gig' | 'text'>): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private windows can refuse storage; the mode then resets to roleplay on reload.
  }
}
