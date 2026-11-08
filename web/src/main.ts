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
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/share-tech-mono';
import './ui/style.css';
import type { Atmosphere, ChatMessage, ChatMode, ClientEvent, Crop, KitView, LinkStatus, OtherInfo, PersonaInfo, QuestState, ResidentInfo, RoomState, SceneDef, ServerEvent, SpriteRef } from '../../shared/types';
import { connectSocket, serverUp } from './net/socket';
import { createRenderer, type Renderer } from './renderer';
import type { EffectsState } from './renderer/effects';
import { signalShape } from './renderer/signal-shape';
import { TRANSITION_DURATION } from './renderer/transitions';
import { DevPanel } from './ui/devpanel';
import { Feed, type CurrentLine } from './ui/feed';
import { mountPlanCard } from './ui/plan-card';
import { loadTextSpeed, saveTextSpeed, stepTextSpeed, textSpeedScale, type TextSpeed } from './ui/typing';
import { applyTextSize, loadTextSize, saveTextSize, stepTextSize, type TextSize } from './ui/text-size';
import { applyChatFont, loadChatFont, saveChatFont, stepChatFont, type ChatFont } from './ui/chat-font';
import { loadMirror, saveMirror } from './ui/stage-mirror';
import { loadFrameRate, maxFps, saveFrameRate, type FrameRate } from './ui/frame-rate';
import { paceCssLoops, setFramePace } from './ui/frame-clock';
import { applyChatKeys, loadChatKeys, saveChatKeys, type ChatKeys } from './ui/chat-keys';
import type { ControlAction } from './ui/message-controls';
import { Hud } from './ui/hud';
import { JournalView } from './ui/journal';
import { MAP_CUE_LEVEL, MAP_CUE_URL, MapPanel, PAUSE_IN_CUE_URL, PAUSE_OUT_CUE_URL } from './ui/map';
import { StoryDark } from './ui/map/story-dark';
import { MENU_CUE_LEVEL, MENU_CUE_URL } from './landing/menu-sound';
import { mapWho } from './ui/map/who';

import { ModelMenu } from './ui/model-menu';
import { modelLabel } from '../../shared/model-label';
import { stageFaces } from './ui/stage-faces';
import { WAIST_PULL } from './ui/figure';
import { Stage, outfitFor, type FigureSource } from './ui/stage';
import { StageLight } from './ui/stage-light';
import { AudioEngine } from './audio/engine';
import type { RoomAudioState } from './audio/room-audio';
import { createRoomAudio } from './audio/room-audio';
import { RecapCard, createRecapGate } from './ui/recap';
import { createGreetGate } from './ui/greet-gate';
import { createArrival, fetchDistrict, type Arrival, type IntroState } from './room/arrival';
import { sceneOptions, type OpeningSet } from './net/scenario';
import { openOpeningPanel } from './room/opening-panel';
import { moveLine } from '../../shared/arrival';
import { createRecapHold } from './room/recap-hold';
import { mountInput } from './ui/input';
import { suggestLine, suggestLines, type SuggestDraft } from './net/suggest';
import { openSuggestPanel } from './room/suggest-panel';
import type { CardsPanel } from './room/cards-panel';
import { EncounterPanel, ENCOUNTER_COPY, hereLine } from './room/encounter-panel';
import { latestQuestStory, mountQuestCards, backToWait } from './room/quest-cards';
import { mountJobTable, tableAction } from './room/table/job-table';
import { mountSetup, setupLine, type SetupCard } from './room/table/setup';
import { mountJobColumn } from './room/job-column';
import { bookLines, mountBookDrawer, type BookFile } from './room/book-drawer';
import { watchTables } from './room/table/shell';
import { mountTips } from './room/table/tips';
import { FLIP_CUE_URL, type TableCue } from './room/table/el';
import { GIG_CUE_LEVEL } from './ui/gig/sound';
import { debriefEl, debriefRolls } from './room/debrief';
import { mountSpeakerPortrait } from './room/speaker-portrait';
import { mountCommsInset } from './room/comms-inset';
import { mountCommsSlot } from './room/comms-slot';
import { mountQuestList, newlyOpen } from './room/quest-list';
import { WhosHere, partySpeaker, type Member } from './room/whos-here';
import { DoorLayer } from './room/doors';
import { listenHideUi } from './room/hide-ui';
import { encounterOptions } from './net/encounter';
import { getNarratorThinking, putNarratorThinking } from './net/link';
import { createDealer } from './room/encounter-dealer';
import { TurnTracker } from './ui/turn-state';
import { chromeKey, lastAgent, listenChromeKeys, markSkipIntro, reloadOnRestore, playerFromSearch, rememberAgent, routeFromPath, shouldPause, setFlash, showRoomNotice, takeFlash, takeSkipIntro, worldChangedPath } from './room/identity';
import { openSavePrompt, saveFailure } from './room/save-prompt';
import { branchName } from '../../shared/branch-name';
import { sceneDir } from './scene-paths';
import { listenScreenCycle, type CycleScreen } from './room/screen-cycle';
import { crewDotOn, crewSeen, openCrew, type CrewHandle, type CrewTab } from './room/crew-screen';
import { fetchCrew } from './net/crew';
import { openPeople, type PeopleHandle, type PeopleTab } from './room/people-screen';
import { openTexts, textsDeck, textsOwnsTab, type TextsDeck, type TextsHandle } from './ui/texts-screen';
import { newDeckMemory } from './deck/deck-client';
import { openCharacterSheet, type SheetPage, type SheetPlayer } from './room/character-sheet';
import { fetchKit } from './net/kit';
import { ApiError, branchFrom, contactOutfits, contacts, goSolo, leads, listPlaythroughs, looseEnds, saveNow, setContactOutfit, setLocation, setOutfit, wait } from './net/playthroughs';
import * as playthroughApi from './net/playthroughs';
import { mountLoad } from './landing/load';
import type { LandingAgent } from './landing/landing';
import { openPauseMenu } from './room/pause-menu';
import { greetAllowed, markWalkedOut, walkedOut, walkOutDue } from './room/walk-out';
import { resolveRoomPlayer } from './room/room-player';
import { residentOf } from './room/resident';
import { markSplashSeen } from './landing/splash';
import { GigWindow, type GigWindowOpts } from './ui/gig/window';
import { GIG_CUE_URL, GIG_MUSIC_LEVEL, GIG_MUSIC_URL, TABLE_MUSIC_URL, gigCuePlayer, type GigCueName } from './ui/gig/sound';
import { PAPERS_CUE_URL, papersCuePlayer, type PapersCueName } from './ui/papers/sound';
import type { PapersData } from '../../shared/papers/data';
import type { Brief } from '../../shared/gig/brief';
import { diceRoom } from './ui/dice/room';
import { DICE_CUE_URL, diceCuePlayer } from './ui/dice/sound';
import { DEFAULT_SETTINGS, type DiceSettings } from '../../shared/dice/opponent';
import type { DiceState } from '../../shared/dice/rules';
import type { District, Place } from '../../shared/map-schema';
import { gameRoot, mountGameStage } from './ui/game-stage';
import { glitchSave, PARKED_HOLD_MS, playCheck } from './room/check-anim';
import { checkToPlay, type Shown } from './room/job-moment';
import { openTerminal } from './ui/crack/terminal';
import { crackCuePlayer } from './ui/crack/sound';
import { installLoreCard, markLore, setGlossary } from './ui/lore-hover';
import type { BookPage } from '../../shared/lore';
import type { GlossaryEntry } from '../../shared/lore';
import { missionCuePlayer, MISSION_CUE_URL } from './ui/mission-sound';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}

/** Test hook for the Playwright e2e smoke test, installed on every page load (cheap). */
export interface NixRoomTestHook {
  /** The scene drawn now: a beat's `room:` over the real one. */
  viewScene(): string | null;
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
  /** The renderer's frame cap: 0 for none, -1 before it has loaded. */
  maxFps(): number;
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
  /** The moment moved (her turn starting, a swipe to another take, an edit of a line; set below, with
   * the cards panels): SUGGEST's set, drafted for the moment before, is spent. */
  let momentMoved = () => {};
  let wasBusy = false;
  const updateBusy = () => {
    // A swipe, a regenerate, a DRAW or a card pick moves the moment without a new line of yours.
    if (turns.busy && !wasBusy) momentMoved();
    wasBusy = turns.busy;
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
      // Another take, or a line rewritten, without a new turn streaming.
      case 'swipe':
        socket.send({ type: 'swipe', messageId: a.id, index: a.index });
        momentMoved();
        return;
      case 'edit':
        socket.send({ type: 'edit_message', messageId: a.id, text: a.text });
        momentMoved();
        return;
      case 'branch': {
        // The world switches to the new playthrough: the room reloads into it, on this line. Named first (load in place §3).
        if (chromeOpen || branching) return;
        chromeOpen = true;
        const line = a.id;
        listPlaythroughs()
          .then((list) => {
            const here = list.playthroughs.find((p) => p.id === list.active);
            if (!here) {
              chromeOpen = false;
              return leave('/');
            }
            openSavePrompt(gameRoot(), {
              defaultName: branchName(here, list.playthroughs),
              title: 'BRANCH',
              action: 'BRANCH',
              reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
              onClose: () => (chromeOpen = false),
              save: async (name) => {
                branching = true;
                updateBusy();
                try {
                  const info = await branchFrom(agentId, line, name);
                  setFlash(`// BRANCHED — ${info.name}`);
                  leave(worldChangedPath(info.location), { branched: true });
                } catch (err) {
                  branching = false;
                  updateBusy();
                  if (err instanceof ApiError && err.error === 'busy') {
                    feed.showNotice(waitFor(err.contact));
                    return;
                  }
                  if (err instanceof ApiError && err.error === 'bad-name') throw new Error('// NAME IT — 1 TO 80 CHARACTERS');
                  throw new Error(`// CAN'T BRANCH — ${reason(err)}`);
                }
              },
            });
          })
          .catch((err: unknown) => {
            chromeOpen = false;
            feed.showNotice(`// CAN'T BRANCH — ${reason(err)}`);
          });
        return;
      }
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
  const waistPull = { value: WAIST_PULL, onChange: (v: number) => stage.setPull(v) };
  const showCrops = () => devPanel.setStageCrops(crops, (side, crop) => stage.setCrop(side, crop), waistPull);
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
    if (!diceOpen() && !beatRoom) stage.setExpression('right', faces.right);
    stage.setExpression('left', faces.left);
  };
  feed.onCurrent((c) => {
    // Someone in the strip, or an encounter's stranger, has no figure: neither side is marked (their card lights instead).
    if (c) stage.setSpeaker(c.speaker === 'user' ? 'left' : c.speaker === 'contact' && !beatRoom ? 'right' : null);
    whosHere.speaking(partySpeaker(c, partyStranger));
    // Faces from actions (spec 2026-10-20): hers from her *actions* on the page showing (else the reply's
    // stored face), yours from your line's; each holds while the other speaks (CurrentLine.held).
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
    onDraft: () => {
      if (bookDraftWait !== null) clearTimeout(bookDraftWait);
      bookDraftWait = setTimeout(bookUpdate, BOOK_DRAFT_MS);
    },
    onDice: () => openDice(),
    suggest: (steer) => openSuggest(steer),
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
  /** A failed check already played while it waited for REROLL / TAKE IT: its card and how many rolls. */
  let checkShown: Shown | null = null;
  /** Quest panel updates wait for a check playing on the cards. */
  let questPanel: Promise<void> = Promise.resolve();
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // A choice's card: on the table for a job, else on the quest panel.
  const cardFor = (choice: string) =>
    (jobTable.isOpen() ? jobTable.root : questCardsHost).querySelector<HTMLElement>(`.tb-card[data-choice="${CSS.escape(choice)}"], .qc-card[data-choice="${CSS.escape(choice)}"]`);
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
    const { play, shown, blown, save } = checkToPlay(was, now, row, checkShown);
    checkShown = shown;
    const card = play ? cardFor(play.card) : null;
    if (play && card) await playCheck(card, { ...play, reduced: reducedMotion(), cue: missionCue, ...(play.parked ? { hold: PARKED_HOLD_MS } : {}) });
    // A save on the waiting miss: its dice glitch to the cost it became, where the table keeps them.
    const parked = save ? jobTable.root.querySelector<HTMLElement>('.tb-parked') : null;
    if (save && parked) await glitchSave(parked, { ...save, reduced: reducedMotion(), cue: missionCue });
    if (blown) missionCue('blown');
  }
  /** A choice clicked on the quest panel or the table: a crack's terminal first, else the pick (with a card from the hand). */
  function chooseQuest(choice: string, said?: string, push?: boolean | 'dice' | 'effect', card?: string, trade?: 'safe' | 'bold', programs?: { load: string[]; run: string[] }, press?: string): void {
    const at = said !== undefined && questHeld ? questHeld : questState.active;
    if (!at || !socket) return;
    markQuestHintDone();
    if (said !== undefined) input.clearDraft();
    questHeld = null;
    const now = questState.active;
    // A crack card (small jobs spec §4): the terminal opens first; its moves go with the pick.
    const setup = now && now.id === at.id && now.beat === at.beat ? now.crack?.[choice] : undefined;
    if (setup) {
      const job = { id: at.id, beat: at.beat };
      cracking = true;
      openTerminal(gameRoot(), {
        setup,
        title: now!.title,
        cue: crackCue,
        alarm: now!.alarm ?? 0,
        reduced: reducedMotion(),
        onDone: ({ moves }) => {
          cracking = false;
          socket?.send({ type: 'quest_choose', id: job.id, beat: job.beat, choice, moves });
        },
      });
      return;
    }
    socket.send({ type: 'quest_choose', id: at.id, beat: at.beat, choice, ...(said !== undefined ? { said } : {}), ...(push ? { push: push === true ? ('dice' as const) : push } : {}), ...(trade ? { trade } : {}), ...(card ? { card } : {}), ...(press ? { press } : {}), ...(programs ? { programs } : {}) });
  }
  const questCards = mountQuestCards(questCardsHost, {
    // While the panel is up, the figures step out to either side to make room for it.
    onShown: (on) => gameRoot().classList.toggle('quest-up', on),
    onChoose: (choice, said, push) => chooseQuest(choice, said, push),

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
    onTalk: (text) => {
      questHeld = null;
      input.clearDraft();
      sendTurn({ type: 'user_message', text, mode: 'rp', talk: true });
    },
  });
  // The table (the hand spec §5): a job's beats as dealt cards over the dimmed room, your hand along the bottom.
  // A deal-in flips several cards in a row, so the flip sits a little lower.
  const tableCue = (n: TableCue) =>
    n === 'beat' ? missionCue('beat') : n === 'flip' ? roomAudio.cue(FLIP_CUE_URL, GIG_CUE_LEVEL * 0.7) : roomAudio.cue(MENU_CUE_URL[n], GIG_CUE_LEVEL * (n === 'move' ? 0.5 : 1));
  // Graft tips (spec 2026-10-30-graft-tips): one-time callouts on a first player's jobs; SYS → TIPS below.
  const tips = mountTips(gameRoot(), { reduced: reducedMotion });
  const jobTable = mountJobTable(gameRoot(), {
    onChoose: (choice, c) => chooseQuest(choice, c.said, c.push, c.card, c.trade, c.programs, c.press),
    onTalk: (text) => {
      questHeld = null;
      input.clearDraft();
      sendTurn({ type: 'user_message', text, mode: 'rp', talk: true });
    },
    onHover: () => missionCue('hover'),
    cue: tableCue,
    reduced: reducedMotion,
    tips,
  });
  // Graft plays the papers desk's track (the gig track) while a table is up. Closing waits a moment, so SETUP's
  // GO IN handing over to the job's first beat doesn't dip; then the room's song comes back (a gig window keeps its own).
  let tableUp = false;
  /** The room a quest beat shows (view only): the contact stays home, on the inset; `null`: the real room. */
  let beatRoom: string | null = null;
  /** The contact's on the line on this beat, with no room to bring it (`comms: yes`): the figure stays. */
  let beatComms = false;
  /** The contact's figure, kept while a guest stands in the slot, and the room as the server has it. */
  let contactFigure: { chain: FigureSource[]; name: string; accent: string } | null = null;
  let realRoom: RoomState | null = null;
  /** The song a quest beat is playing (guest crew spec §3b): it holds the music over the table's. */
  let beatSong: string | null = null;
  let beatSongUrl: string | null = null;
  let songList: Promise<{ title: string; url: string }[]> | null = null;
  /** The newest ask: a song still being looked up when the beat moves on doesn't start late. */
  let songAsk = 0;
  const playBeatSong = async (title: string | null): Promise<void> => {
    const ask = ++songAsk;
    if (title === beatSong) return;
    if (title === null) {
      beatSong = null;
      beatSongUrl = null;
      if (!gigWindow) roomAudio.overrideMusic(tableUp ? TABLE_MUSIC_URL : null, GIG_MUSIC_LEVEL);
      return;
    }
    songList ??= fetch('/api/songs').then((r) => r.json() as Promise<{ songs: { title: string; url: string }[]; beats: { title: string; url: string }[] }>).then((j) => [...j.beats, ...j.songs]).catch(() => {
      songList = null;
      return [];
    });
    // A title with no file yet plays nothing: the beat can be written before its song is in.
    const song = (await songList).find((s) => s.title === title);
    if (!song || ask !== songAsk) return;
    beatSong = title;
    beatSongUrl = song.url;
    if (!gigWindow) roomAudio.overrideMusic(song.url, GIG_MUSIC_LEVEL);
  };
  let tableDown: ReturnType<typeof setTimeout> | null = null;
  // The job's written text beside the subtitles while a table is up (the JOB column, 2026-11-02); the last table closing takes it.
  const jobColumn = mountJobColumn(byId('feed'), gameRoot(), () => feed.relayout());
  /** The crack terminal is up: it isn't on the stage's modal list, and Esc is its to walk away with. */
  let cracking = false;
  /** Hears the draft a moment after the last key, not on each one. */
  const BOOK_DRAFT_MS = 200;
  let bookDraftWait: ReturnType<typeof setTimeout> | null = null;
  /** Tells the drawer what's going on: it keeps the bar's count whether it's open or not. */
  const bookUpdate = () =>
    book.update({
      lines: bookLines(feed.messages()),
      draft: input.draft(),
      sceneId: currentSceneId,
      present: [partyYou.name, ...(partyContact ? [partyContact.name] : []), ...others.map((o) => o.name)],
    });
  // The lore drawer (spec 2026-11-06). Mounted here so its Esc comes ahead of SETUP's; the rest of its wiring is by the screens.
  const book = mountBookDrawer(gameRoot(), {
    files: () => bookFiles(),
    onCount: (n) => hud.setBookCount(n),
    onOpenChange: (on) => {
      if (on) roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
      byId('feed').classList.toggle('book-col', on);
      hud.setBookOpen(on);
      feed.relayout();
    },
    chatBox: () => document.querySelector<HTMLElement>('#input textarea'),
    over: () => bookBlocked(),
  });
  /** What the job table last put in the column: a SETUP card closing over its debrief hands the column back to it. */
  let tableText: { title: string; text: string | undefined; sub?: string; rolls?: HTMLElement | null } | null = null;
  const showTableText = (title: string, text: string | undefined, sub?: string, rolls?: HTMLElement | null) => {
    tableText = { title, text, sub, rolls };
    jobColumn.show(title, text, sub, rolls);
  };
  const postedLine = (who: string | undefined) => (who ? `POSTED BY ${who}` : undefined);
  /** SETUP's column: the pitch and what's involved, with who posted it under the district line. */
  const showSetupColumn = (open: QuestState['open'][number], offer: NonNullable<QuestState['open'][number]['setup']>) =>
    jobColumn.show(open.title, [open.pitch, open.brief].filter(Boolean).join('\n\n') || null, [setupLine(offer), postedLine(open.postedBy)].filter(Boolean).join('\n'));
  const setupGone = () => {
    if (jobTable.isOpen() && tableText) jobColumn.show(tableText.title, tableText.text, tableText.sub, tableText.rolls);
    else jobColumn.clear();
  };
  watchTables((on) => {
    tableUp = on;
    if (!on) jobColumn.clear();
    if (tableDown) clearTimeout(tableDown);
    tableDown = null;
    if (on && !beatSong) roomAudio.overrideMusic(TABLE_MUSIC_URL, GIG_MUSIC_LEVEL);
    else if (!on) tableDown = setTimeout(() => !tableUp && !gigWindow && !beatSong && roomAudio.overrideMusic(null), 1500);
  });
  /** The SETUP card before a job's first beat (the hand spec §1), and the job it's for. */
  let setupCard: { id: string; card: SetupCard; offer: string } | null = null;
  const startQuest = (id: string) => {
    const open = questState.open.find((q) => q.id === id);
    // A job with a SETUP card: how you go in and who you bring first; anything else starts now.
    if (!open?.setup) {
      socket?.send({ type: 'quest_start', id });
      return;
    }
    setupCard?.card.close();
    const card = mountSetup(gameRoot(), {
      offer: open.setup,
      title: open.title,
      pitch: open.pitch,
      tier: open.mission?.tier ?? null,
      reduced: reducedMotion(),
      cue: tableCue,
      onGo: (setup) => socket?.send({ type: 'quest_start', id, setup }),
      onBack: () => {
        setupCard = null;
        setupGone();
      },
      tips,
    });
    setupCard = { id, card, offer: JSON.stringify(open.setup) };
    showSetupColumn(open, open.setup);
  };
  // The stranger present, with a face: a framed bust beside the subtitles while they're in the scene (speaker portrait, 2026-10-17).
  const speakerPortrait = mountSpeakerPortrait(byId('feed'), gameRoot());
  const commsInset = mountCommsInset(byId('feed'));
  // On comms with a stranger here, one face by the subtitles: the speaker's (comms speaker slot, spec 2026-11-01).
  const commsSlot = mountCommsSlot(commsInset, speakerPortrait);
  feed.onCurrent((c) => commsSlot.setLine(c ? `${c.id}:${c.speaker}` : '', c?.speaker ?? null));
  /** Comms on the stage (spec §2): no figure for her, her face on the monitor, her role, HANG UP, her pages tagged. */
  let beatGuest = false;
  const applyComms = () => {
    byId('stage-figures').classList.toggle('on-comms', comms.on || (beatRoom !== null && !beatGuest));
    document.querySelector('.feed-root')?.classList.toggle('comms', comms.on);
    document.querySelector('.feed-root')?.classList.toggle('on-line', beatRoom !== null || beatComms);
    commsSlot.setComms(comms.on && partyContact ? { name: partyContact.name, face: `/api/agents/${encodeURIComponent(agentId)}/sprite`, where: comms.where ?? '', accent: partyContact.accent } : null);
    whosHere.setParty(partyYou, partyContact, { comms: comms.on || beatRoom !== null || beatComms });
    input.setComms(comms.on);
  };
  feed.onStranger((st) => {
    const s = st?.face ? { name: st.name, url: `/api/extras/${encodeURIComponent(st.face)}` } : null;
    commsSlot.setStranger(s);
    // They're in the party window too, while they're here.
    partyStranger = s?.name ?? null;
    whosHere.setStranger(s);
  });
  const questListHost = document.createElement('div');
  gameRoot().append(questListHost);
  const questList = mountQuestList(questListHost, {
    leads,
    looseEnds,
    onNotes: () => hud.setQuestShown(questList.has()),
    onStart: (id) => startQuest(id),
    onOpen: () => {
      roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
      hud.setQuestNew(false);
      hud.setOpen('quest');
    },
    onClose: () => hud.setOpen(null),
    onBuy: (item) => socket?.send({ type: 'fixer_buy', item }),
    onWalk: (id) => socket?.send({ type: 'quest_walk', id }),
    // GO THERE on another place's board: the map's GO, arrival screen and all.
    onGoTo: (place) => void map.findPlace(place).then(() => openTravel(place, false)),
    onGoToContact: (id) => void goToContact(id),
    reduced: reducedMotion,
  });
  /** Quests this tab has already announced as able to start here. */
  const questsAnnounced = new Set<string>();
  // Editing the held line takes the light off its card: what's in the field is talk again.
  byId('input').addEventListener('input', () => {
    questHeld = null;
    questCards.clearPick();
    jobTable.clearPick();
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
  // SYS → TIPS: Graft's tips on or off (SKIP TIPS on a callout lands here too), SHOW AGAIN.
  tips.onChange = (on) => hud.showTips(on);
  hud.setTipsControl({
    onTips: (on) => tips.setEnabled(on),
    // SHOW AGAIN wants them shown: every tip unseen, and tips on.
    onTipsAgain: () => {
      tips.reset();
      tips.setEnabled(true);
    },
  });
  hud.showTips(tips.enabled());
  // SYS → MIRROR: her figure faces the other way, kept per contact, per browser.
  const showMirror = (on: boolean) => {
    saveMirror(agentId, on);
    stage.setMirror('right', on);
    hud.showMirror(on);
  };
  hud.setMirrorControl(showMirror);
  showMirror(loadMirror(agentId));
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
  // SYS → FRAME RATE: the room redraws at most this often; rendererReady applies it to a renderer still loading.
  let frameRate = loadFrameRate();
  /** The map covers the room: it keeps ticking (its weather, its thunder) but needn't draw often. */
  let mapUp = false;
  const capRoom = () => renderer?.setMaxFps(mapUp ? ROOM_FPS_UNDER_MAP : maxFps(frameRate));
  const showFrameRate = (next: FrameRate) => {
    frameRate = next;
    saveFrameRate(next);
    setFramePace(maxFps(next));
    capRoom();
    hud.showFrameRate(next);
  };
  hud.setFrameRateControl(showFrameRate);
  showFrameRate(frameRate);
  paceCssLoops();
  const devPanel = new DevPanel(byId('devpanel'), (e) => socket?.send(e), () => renderer?.fps() ?? 0);
  const warnings: string[] = [];
  // The figures and the UI are DOM over the canvas: they go down the same line as the room.
  const signalGame = (amount: number) => {
    const game = gameRoot();
    const s = signalShape(amount);
    game.style.transform = amount > 0 ? `scale(${s.width}, ${s.height})` : '';
    game.style.filter = amount > 0 ? `brightness(${1 + 3 * s.flash})` : '';
    // The figures' art runs past the frame's foot: squeezed, that would show under the band.
    game.style.clipPath = amount > 0 ? 'inset(0)' : '';
  };
  const rendererReady: Promise<Renderer | null> = createRenderer(host, gameStage, { onSignal: signalGame }).then(
    (r) => {
      renderer = r;
      capRoom();
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
  // The dice's tumble, knock and landings, warmed: a first roll's taps would otherwise all wait on one fetch and knock at once.
  for (const n of ['tick', 'tap', 'land-crit', 'land-clean', 'land-cost', 'land-miss'] as const) roomAudio.preloadCue(MISSION_CUE_URL[n]);
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
  // The opening's three openings: the last set is kept for the same steer while the screen is up.
  let openingKept: { steer: string | null; set: OpeningSet } | null = null;
  const intro: Arrival | null = takeSkipIntro()
    ? null
    : createArrival(byId('district-intro'), {
        reducedMotion: reducedMotion(),
        fetchDistrict,
        paused: bugReportOpen,
        openings: (host, steer, h) =>
          openOpeningPanel(host, {
            her: { id: agentId, name: agentName },
            // Where and when, as the room has it by now (the screen opens on a loaded room's facts).
            where: [
              currentSceneId ? scenes.get(currentSceneId)?.name.toUpperCase() : null,
              atmosphere?.timeOfDay.toUpperCase(),
              atmosphere && atmosphere.weather !== 'none' ? atmosphere.weather.toUpperCase() : null,
            ]
              .filter(Boolean)
              .join(' · '),
            steer,
            cached: openingKept && openingKept.steer === steer ? openingKept.set : null,
            load: () => sceneOptions(agentId, steer),
            onCache: (set) => (openingKept = { steer, set }),
            onStart: h.start,
            onEdit: h.edit,
            onCancel: h.close,
          }),
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
    maxFps: () => renderer?.maxFps() ?? -1,
    warnings,
    send: (e) => socket?.send(e),
    viewScene: () => loadedSceneId,
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
  // The journal: PEOPLE's JOURNAL page (2026-10-18 spec §2); its notes arrive whether or not it's showing.
  const journal = new JournalView((e) => socket?.send(e));
  /** PEOPLE (who you know: FILE · JOURNAL), while it's up. */
  let people: PeopleHandle | null = null;
  // CREW (crew spec 2026-10-19 §4): its screen while open, and the playthrough its seen-results mark belongs to.
  let crew: CrewHandle | null = null;
  // TEXTS (in-game texts spec §2): the deck in the room. Its client is made on the first open and kept for the page,
  // connected, so texts land and fail while the pane is put away (final review C1, I3).
  let texts: TextsHandle | null = null;
  const textsMemory = newDeckMemory();
  let textsKept: TextsDeck | null = null;
  let crewPt = '';
  void listPlaythroughs().then((l) => (crewPt = l.active ?? ''), () => {});
  /** The tab PEOPLE last showed: the bar's PEOPLE and Alt+P open it there. */
  let lastPeopleTab: PeopleTab = 'file';
  // Gig runs: the gig window over the map (GIGS at a gig place); one at a time.
  let gigWindow: GigWindow | null = null;
  /** Why GIGS can't open (her link), or null; a down connection is checked when the map asks. */
  /** Why GIGS can't run: read when asked, since words about her follow her pronoun (her portrait can come after). */
  let gigWhyNot: (() => string) | null = null;
  const gigBlock = () => gigWhyNot?.() ?? (serverLink === 'ok' ? null : 'no link');
  const closeGig = () => {
    if (!gigWindow) return;
    gigWindow.destroy();
    gigWindow = null;
    // The room's own song comes back, or a beat's song, or the table's track if a job is still on it.
    roomAudio.overrideMusic(beatSongUrl ?? (tableUp ? TABLE_MUSIC_URL : null), GIG_MUSIC_LEVEL);
  };
  const gigCue = gigCuePlayer(roomAudio);
  const papersCue = papersCuePlayer(roomAudio);
  /** What every gig window shares: who's playing, the cues, the music, papers data, the dev strip. */
  const gigShared = (): Pick<GigWindowOpts, 'you' | 'contact' | 'onClose' | 'loadPapers' | 'cue' | 'music' | 'reducedMotion' | 'dev'> => ({
    you: personaName ?? 'You',
    contact: agentName,
    onClose: closeGig,
    loadPapers: () => fetch('/api/papers').then(async (r) => (r.ok ? ((await r.json()) as PapersData & { firstNight: boolean }) : null)),
      cue: (name) => {
        if (name.startsWith('papers:')) {
          const n = name.slice(7);
          if (n in PAPERS_CUE_URL) papersCue(n as PapersCueName);
        } else if (name in GIG_CUE_URL) gigCue(name as GigCueName);
      },
      // The gig track on the jobs and result screens, and at the desk until its track is made (PAPERS_MUSIC_URL:
      // a missing file would stop the music, not fall back).
      music: () => roomAudio.overrideMusic(GIG_MUSIC_URL, GIG_MUSIC_LEVEL),
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      // The dev strip (the run's seed and result): with the admin panel open, or a fixed ?gigSeed=.
      dev: devPanel.open || new URLSearchParams(location.search).has('gigSeed'),
  });
  const gigAudio = () => {
    for (const url of [...Object.values(GIG_CUE_URL), ...Object.values(PAPERS_CUE_URL)]) roomAudio.preloadCue(url);
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
  const map = new MapPanel(byId('map'), {
    // Blackout switches on the map while the admin panel is open (spec 2026-10-27).
    dev: () => devPanel.open,
    // Rain over the rendered map follows the city's weather (the room's, carried room to room).
    weather: () => ({ weather: atmosphere?.weather ?? 'none', level: atmosphere?.weatherLevel ?? 0 }),
    onOpen: () => {
      roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
      hud.setOpen('map');
      mapUp = true;
      capRoom();
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
      comms: { on: comms.on, can: comms.can, herAt: comms.herAt },
    }),
    onTravel: (place, onComms) => openTravel(place, onComms === true),
    onGigs: openGig,
    escapeFirst: () => gigWindow?.handleEscape() ?? false,
    onClose: () => {
      mapUp = false;
      capRoom();
      closeGig();
      hud.setOpen(null);
    },
    // The menus' move/confirm, under the landing's 0.25 scale like the map's own cue.
    onCue: (c) => roomAudio.cue(MENU_CUE_URL[c], MENU_CUE_LEVEL[c] * 0.25),
    // The gig window and the MODEL menu over the map take their own keys (Enter in OTHER… must not GO).
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
  roomAudio.preloadCue(PAUSE_IN_CUE_URL);
  roomAudio.preloadCue(PAUSE_OUT_CUE_URL);
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
    book.close();
    dice.start();
  };
  if (new URLSearchParams(location.search).has('diceSeed')) window.__nixRoom!.dice = { state: () => dice.state() };
  const modelMenu = new ModelMenu(byId('hud'), (e) => socket?.send(e));
  document.addEventListener('click', () => modelMenu.close());
  // SETUP (mockup setup-frames.html, B): Enter goes in, Esc backs out, with nothing over it and nothing typed in the prompt.
  // Early (capture), since the prompt takes every Enter and the feed turns pages on it: a page waiting keeps its Enter.
  window.addEventListener('keydown', (e) => void (setupCard?.card.isOpen() && setupKeys(e)), true);
  window.addEventListener('keydown', (e) => {
    if (shouldPause(e, { feedExpanded: feed.expanded, devPanelOpen: devPanel.open, journalOpen: people !== null })) openPause();
  });
  /** SETUP's Enter / Esc: true when it took the key. */
  const setupKeys = (e: KeyboardEvent): boolean => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (e.key !== 'Enter' && e.key !== 'Escape') return false;
    if (paused || chromeOpen || currentScreen() !== null || feed.expanded || devPanel.open || people !== null || dice.open || questList.isOpen) return false;
    // Typing in a field: Enter is its own (the prompt sends); an empty prompt passes it on. A reply's next page keeps Enter.
    const t = e.target as HTMLElement | null;
    if (t?.closest('.lb-root')) return false; // The book's search: its keys are its own.
    const field = t?.closest('input, textarea, [contenteditable="true"]') as HTMLInputElement | HTMLTextAreaElement | null;
    if (field && e.key === 'Enter' && (field.value ?? field.textContent ?? '').trim() !== '') return false;
    if (e.key === 'Enter' && feed.pageWaiting()) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Enter') setupCard!.card.go();
    else setupCard!.card.back();
    return true;
  };

  // The chrome beside MAP: SAVE, CONTACTS and TITLE (spec 2026-10-07 §6), on S, C and T too.
  /** Set once the room is navigating away, so a later reason (the socket closing) can't redirect it. */
  let leaving = false;
  /** Navigates away once; false when it didn't (already leaving, or a branch is on its way). */
  const leave = (path: string, o: { branched?: true } = {}): boolean => {
    if (leaving) return false;
    // A branch on its way switches the world (world-changed, the socket closing): the room waits
    // for its answer and leaves with it, so the new page can say where it is.
    if (branching && !o.branched) return false;
    leaving = true;
    // A reload into a room (a branch, a world change, another contact) skips the district screen;
    // the title and /solo don't, so the next room opened from them shows it.
    if (path.startsWith('/room')) markSkipIntro();
    location.assign(path);
    return true;
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
  // A job's cues on the kit (small jobs spec §6): heat here up, sol up, a new deck, NERVE back at 06:00.
  const refreshKit = () =>
    void fetchKit().then((k) => {
      const was = lastKit;
      lastKit = k;
      if (k) sheet?.setKit(k);
      if (!was || !k) return;
      if (k.heatHere > was.heatHere) missionCue('heat');
      if (k.sol > was.sol) missionCue('sol');
      if (k.deck && k.deck.id !== was.deck?.id) missionCue('deck');
      if (k.nerveLeft > was.nerveLeft) missionCue('edge');
    }).then(() => crewDot());
  /** CREW's dot: a crew result newer than the last one seen on its ASSIGN tab. */
  const crewDot = () => hud.setCrewDot(!crew && lastKit !== null && crewDotOn(lastKit, crewSeen(crewPt)));
  refreshKit();
  // Lore words (feedback 2026-10-19): the glossary once, the card over the stage, and the lines already up marked.
  installLoreCard(gameRoot());
  void fetch('/api/lore/book')
    .then((r) => (r.ok ? (r.json() as Promise<BookPage>) : null))
    .catch(() => null)
    .then((page) => {
      book.load(page);
      bookUpdate();
    });
  void fetch('/api/lore/glossary')
    .then((r) => (r.ok ? (r.json() as Promise<{ glossary: GlossaryEntry[] }>) : null))
    .then((b) => {
      if (!b) return;
      setGlossary(b.glossary);
      for (const n of document.querySelectorAll<HTMLElement>('#feed .msg.agent .text, #feed .quest-row .text, .qc-story, .jc-body')) markLore(n);
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
    let me: string | null = null;
    try {
      const [list, known] = await Promise.all([listPlaythroughs(), contacts().catch(() => [])]);
      active = list.active;
      me = list.playthroughs.find((p) => p.id === active)?.player ?? null;
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
      // The strip LOAD will show (pause menu mockup 2026-10-30): the room, your face and hers.
      snapshot: { scene: currentSceneId, you: me ? `/api/agents/${encodeURIComponent(me)}/thumb` : null, them: agentId !== me ? `/api/agents/${encodeURIComponent(agentId)}/thumb` : null, place, time, withName: agentName },
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => (chromeOpen = false),
      save: async (name) => {
        try {
          const saved = await saveNow(playthrough, name, agentId);
          feed.showNotice(`Saved: ${saved.name}`);
        } catch (err) {
          const f = saveFailure(err, waitFor);
          if ('leave' in f) {
            leave(f.leave);
            return;
          }
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
  // PEOPLE (2026-10-18 spec §2): who you know, each one's FILE, and JOURNAL for the one you're with. A page's key on that page closes it.
  const openPeopleOn = (tab: PeopleTab) => {
    if (people) return people.tab === tab ? void people.requestClose() : people.show(tab);
    if (chromeOpen || dice.open) return;
    chromeOpen = true;
    map.close();
    questList.close();
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
      // PEOPLE's wardrobe: kept in the playthrough; the one you're with changes on stage at once.
      onOutfit: async (id, outfit) => {
        const before = Object.hasOwn(outfitPicks, id) ? outfitPicks[id] : null;
        const wear = (o: string | null) => {
          const { [id]: _, ...rest } = outfitPicks;
          outfitPicks = o === null ? rest : { ...rest, [id]: o };
          if (id === agentId) stage.setOutfit('right', herOutfit(loadedSceneId ?? currentSceneId));
        };
        wear(outfit);
        try {
          await setContactOutfit(id, outfit);
        } catch (e) {
          wear(before);
          throw e;
        }
      },
      toQuest: (t) => (people?.requestClose(true) ?? true) && questList.openOn(t),
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
      // A job's free hire opens on them; the word's dot brought you here for that.
      ...(tab ? { tab } : lastKit?.crewFree ? { tab: 'hire' as const } : {}),
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
  // TEXTS: Alt+X or its word opens it, the texts notice opens it on her thread; Alt+X, Esc or the word closes it.
  const openTextsOn = (contact?: string) => {
    if (texts) return contact ? texts.show(contact) : texts.close();
    const cur = currentScreen();
    if (cur) {
      // From another screen of the cycle: switch, then her thread.
      switchTo('texts');
      if (contact) (texts as TextsHandle | null)?.show(contact);
      return;
    }
    if (chromeOpen || dice.open) return;
    chromeOpen = true;
    map.close();
    roomAudio.cue(MAP_CUE_URL, MAP_CUE_LEVEL);
    textsKept ??= textsDeck(textsMemory);
    texts = openTexts(gameRoot(), {
      contact: contact ?? null,
      deck: textsKept,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: () => {
        texts = null;
        chromeOpen = false;
        hud.setOpen(null);
      },
    });
    hud.setOpen('texts');
  };
  /** The room you're in, as a picture: YOU's banner. */
  const roomPicture = (): string | undefined => {
    const scene = currentSceneId ? scenes.get(currentSceneId) : undefined;
    return scene?.layers[0] ? sceneDir(scene, '/scenes/') + scene.layers[0].src : undefined;
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
      player: { ...(sheetPlayer ?? { name: personaName ?? 'You', sprite: null }), ...(lastKit ? { kit: lastKit } : {}), room: roomPicture() },
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      // CARRY another deck you own: kit_changed refreshes the kit, and the sheet with it.
      onCarry: (deck) => socket?.send({ type: 'kit_carry', deck }),
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
  /** Which of YOU, PEOPLE, TEXTS, QUEST, CREW and MAP is up (one at a time), or null. */
  const currentScreen = (): Exclude<CycleScreen, 'book'> | null => (sheet ? 'you' : people ? 'people' : texts ? 'texts' : questList.isOpen ? 'quest' : crew ? 'crew' : map.isOpen ? 'map' : null);
  /** The open one goes at once; false when it refuses (unsaved journal work). */
  const closeScreen = (cur: Exclude<CycleScreen, 'book'> | null): boolean => {
    if (cur === 'people' && !people?.requestClose(true)) return false;
    if (cur === 'you') sheet?.close(true);
    if (cur === 'texts') texts?.close(true);
    if (cur === 'quest') questList.close();
    if (cur === 'crew') crew?.close(true);
    if (cur === 'map') map.close(true);
    return true;
  };
  /** Something modal owns the keys, so the drawer neither opens nor takes Esc. A full screen isn't one: BOOK replaces it. */
  const bookBlocked = () => (chromeOpen && currentScreen() === null) || cracking || paused !== null || recap.visible || cardsOpen() || dice.open || (intro?.open ?? false) || (travelScreen?.screen.open ?? false) || gigWindow !== null || modelMenu.isOpen || bugReportOpen();
  const toggleBook = () => {
    if (book.isOpen) return book.close();
    if (bookBlocked() || !closeScreen(currentScreen())) return;
    bookUpdate();
    book.open();
  };
  /** Who's on the page: your file, the contact's, then anyone else here with one. A fetch that fails leaves its files out. */
  const bookFiles = async (): Promise<BookFile[]> => {
    const [me, known] = await Promise.allSettled([playthroughApi.persona(), contacts()]);
    const you = me.status === 'fulfilled' ? me.value : null;
    const contact = partyContact && known.status === 'fulfilled' ? known.value.find((c) => c.id === agentId) : undefined;
    const files: BookFile[] = [
      ...(you ? [{ id: you.id, name: you.name, tag: 'YOUR FILE' as const, bio: you.bio ?? [], facts: you.facts ?? [], ...(you.secret ? { secret: you.secret } : {}) }] : []),
      ...(contact ? [{ id: contact.id, name: contact.name, tag: 'THEIR FILE' as const, bio: contact.bio ?? [], facts: contact.facts ?? [] }] : []),
      ...others.filter((o) => o.kind === 'contact' && o.id !== agentId).map((o) => ({ id: o.id, name: o.name, tag: 'THEIR FILE' as const, bio: o.bio, facts: o.facts })),
    ];
    return files.filter((f) => f.bio.length > 0 || f.facts.length > 0);
  };
  hud.setBook(toggleBook);
  hud.onScreenOpen(() => book.close());
  /** From the open one of the three to `s`: the old one goes at once (unsaved journal work refuses), the new one glitches in. */
  /** `dir` -1 (Shift+Tab on the cycle) comes into YOU at its last page, KIT, so the ring runs the same both ways. */
  const switchTo = (s: CycleScreen, dir: 1 | -1 = 1) => {
    const cur = currentScreen();
    if (cur === s || dice.open) return;
    if (s === 'book') return toggleBook(); // It closes the open one itself, and only if it can open.
    if (!closeScreen(cur)) return;
    if (s === 'you') toggleSheet(dir < 0 ? 'kit' : 'file');
    else if (s === 'people') openPeopleOn(dir < 0 ? 'journal' : 'file');
    else if (s === 'texts') openTextsOn();
    else if (s === 'quest') questList.toggle();
    else if (s === 'crew') openCrewOn();
    else map.open();
  };
  // Tab opens YOU and cycles YOU → PEOPLE → TEXTS → QUEST → CREW → MAP → BOOK (Shift+Tab back), unless a field of its own or something over it has the keys.
  listenScreenCycle(window, {
    current: () => currentScreen() ?? (book.isOpen && !bookBlocked() ? 'book' : null),
    canStart: () => !book.isOpen && !bookBlocked() && !hud.sysOpen && !hideUi.hidden,
    inField: () => {
      const a = document.activeElement;
      const field = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || (a instanceof HTMLElement && a.isContentEditable);
      // A screen's reply box isn't one (TEXTS keeps the cursor in its own); with none up, only the chat box isn't.
      const owns = currentScreen() === null ? a?.closest('#input') === null : a?.closest('.scr-root, #map') != null;
      return (field && owns) || a?.closest('.devpanel') != null || textsOwnsTab(a);
    },
    blocked: () => gigWindow !== null || modelMenu.isOpen || bugReportOpen() || dice.open || recap.visible || cardsOpen(),
    go: switchTo,
    turnPage: (cur, dir) => (cur === 'you' ? sheet?.turnPage(dir) : cur === 'people' ? people?.turnPage(dir) : false) ?? false,
    shown: (s) => s !== 'quest' || questList.has(),
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
  hud.setTextsScreen(() => ((currentScreen() ?? 'texts') === 'texts' ? openTextsOn() : switchTo('texts')));
  hud.setTextsNotice((contact) => openTextsOn(contact));
  hud.setCrew(() => ((currentScreen() ?? 'crew') === 'crew' ? openCrewOn() : switchTo('crew')));
  hud.setQuest(() => {
    if (!dice.open) (currentScreen() ?? 'quest') === 'quest' ? questList.toggle() : switchTo('quest');
  });
  hud.setBackLink(() => leave('/'));
  // MENU in SYS: the pause menu for a pointer or a phone (no Esc there).
  hud.setPause(() => openPause());

  // PAUSED (spec 2026-10-30): Esc with nothing else open. SAVE, LOAD (the title's, over the room), SETTINGS (SYS) or TITLE.
  let paused: { close(): void } | null = null;
  /** LOAD is up over the room: a world change waits for it (it navigates itself), or runs if it's backed out of. */
  let loadOver: { pending: (() => void) | null } | null = null;
  const openPause = () => {
    if (paused || chromeOpen || currentScreen() !== null || dice.open || recap.visible || cardsOpen() || (intro?.open ?? false) || (travelScreen?.screen.open ?? false)) return;
    chromeOpen = true;
    book.close();
    roomAudio.cue(PAUSE_IN_CUE_URL, MAP_CUE_LEVEL);
    paused = openPauseMenu(gameRoot(), {
      where: [hud.where(), agentName ? `WITH ${agentName.toUpperCase()}` : null].filter(Boolean).join(' · '),
      saveBlockedBy: () => hud.saveBlockedBy,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onClose: (resumed) => {
        paused = null;
        chromeOpen = false;
        // Back to the room: the tape spins up. SAVE, LOAD, SETTINGS and TITLE go on to their own screens.
        if (resumed) roomAudio.cue(PAUSE_OUT_CUE_URL, MAP_CUE_LEVEL);
      },
      onSave: () => hud.pressSave(),
      onLoad: () => openLoadOver(),
      onSettings: () => hud.openSys(),
      onTitle: () => leave('/'),
    });
  };
  /** LOAD from PAUSED: the title's LOAD over the room; Esc goes back to PAUSED, a load leaves for the room it opens. */
  const openLoadOver = () => {
    chromeOpen = true;
    loadOver = { pending: null };
    const host = document.createElement('div');
    host.className = 'pause-load';
    gameRoot().append(host);
    const roster = new Map<string, LandingAgent>();
    const load = mountLoad(host, {
      api: playthroughApi,
      // A branch on its way keeps the room: LOAD says so and unlocks.
      nav: (path) => {
        if (!leave(path)) throw new Error('wait for the branch to finish');
      },
      back: () => {
        load.destroy();
        host.remove();
        chromeOpen = false;
        const pending = loadOver?.pending;
        loadOver = null;
        if (pending) pending();
        else openPause();
      },
      sound: () => {},
      agents: () => roster,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      exclusive: true,
    });
    // Faces arrive with the roster.
    void fetch('/api/agents')
      .then((r) => (r.ok ? (r.json() as Promise<{ agents: LandingAgent[] }>) : null))
      .then((b) => {
        for (const a of b?.agents ?? []) roster.set(a.id, a);
        load.refresh();
      })
      .catch(() => {});
  };
  const hideUi = listenHideUi(window, document.body);
  // Alt+B over a full screen: the other chrome keys stand down there (modalOpen), but BOOK replaces it. First, so it's only heard once.
  window.addEventListener(
    'keydown',
    (e) => {
      if (chromeKey(e, false) !== 'book' || currentScreen() === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleBook();
    },
    true,
  );
  listenChromeKeys(window, {
    modalOpen: () => chromeOpen || map.isOpen || recap.visible || cardsOpen() || dice.open || (intro?.open ?? false) || (travelScreen?.screen.open ?? false),
    run: (k) => {
      if (k === 'you') toggleSheet();
      else if (k === 'save') hud.pressSave();
      else if (k === 'people') openPeopleOn(lastPeopleTab);
      else if (k === 'contacts') openPeopleOn('file');
      else if (k === 'journal') openPeopleOn('journal');
      else if (k === 'leads' || k === 'loose') questList.openOn(k);
      else if (k === 'quest') (currentScreen() ?? 'quest') === 'quest' ? questList.toggle() : switchTo('quest');
      else if (k === 'crew') openCrewOn();
      else if (k === 'texts') openTextsOn();
      else if (k === 'book') toggleBook();
      else if (k === 'hide') {
        book.close();
        hideUi.toggle();
      }
      else leave('/');
    },
  });
  let loadedSceneId: string | null = null;
  // Doors (clickable doors spec §3): click one to go through its exit; inert while a panel is open.
  const doors = new DoorLayer(byId('doors'), {
    send: (to) => socket?.send({ type: 'exit', to }),
    blocked: () => chromeOpen || map.isOpen || book.isOpen || whosHere.cardOpen || questList.isOpen || recap.visible || cardsOpen() || dice.open || (intro?.open ?? false) || (travelScreen?.screen.open ?? false) || gigWindow !== null,
    roomRect: () => renderer?.roomRect() ?? { left: 0, top: 0, width: 0, height: 0 },
    stage: () => gameStage.rect(),
  });
  gameStage.onRect(() => requestAnimationFrame(() => doors.layout()));
  // Her outfit follows the room's scene: her scene → outfit map (from her sprite) and the scene she's in now.
  let outfitByScene: Record<string, string> | undefined;
  let currentSceneId: string | null = null;
  /** Outfits picked on PEOPLE (contact id → outfit), worn everywhere over her room's. */
  let outfitPicks: Record<string, string> = {};
  /** What she wears in `sceneId`: PEOPLE's pick, else her room's, else her plain sprite. */
  const herOutfit = (sceneId: string | null) => (Object.hasOwn(outfitPicks, agentId) ? outfitPicks[agentId] : outfitFor(outfitByScene, sceneId));

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
  /** The three-card panels' header: who, where, when, and who else is here. */
  const cardsHeader = () => {
    const scene = currentSceneId ? scenes.get(currentSceneId) : undefined;
    return [
      `${(personaName ?? 'YOU').toUpperCase()} × ${agentName.toUpperCase()}`,
      scene?.name.toUpperCase(),
      atmosphere?.timeOfDay.toUpperCase(),
      atmosphere && atmosphere.weather !== 'none' ? atmosphere.weather.toUpperCase() : null,
      hereLine(others.map((o) => o.name)),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const openEncounter = () => {
    if (cardsOpen()) return;
    encounterPanel = new EncounterPanel(gameRoot(), {
      header: cardsHeader(),
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
  // SUGGEST: her model's three drafts of your next line on DRAW's panel, in cyan. Enter sends one,
  // E puts it in the box to edit, Esc leaves the box as it was. The last set is kept, like DRAW's,
  // for the same steer until a new turn lands or you move.
  let suggestPanel: CardsPanel<SuggestDraft> | null = null;
  let suggestSteer: string | null = null;
  const suggestDealer = createDealer(() => suggestLines(agentId, suggestSteer));
  const closeSuggest = () => {
    suggestPanel?.destroy();
    suggestPanel = null;
  };
  /** The moment changed (her turn, a rewind, a resync): SUGGEST's set is spent, and its panel goes. */
  const suggestSpent = () => {
    suggestDealer.clear();
    closeSuggest();
  };
  momentMoved = suggestSpent;
  /** One of the three-card panels (DRAW's or SUGGEST's) is up. */
  const cardsOpen = () => encounterPanel !== null || suggestPanel !== null;
  const openSuggest = (steer: string | null) => {
    if (cardsOpen()) return;
    if (steer !== suggestSteer) suggestDealer.clear();
    suggestSteer = steer;
    suggestPanel = openSuggestPanel(gameRoot(), {
      header: cardsHeader(),
      ...(modelText ? { model: modelText } : {}),
      steer,
      cached: suggestDealer.cached,
      load: () => suggestDealer.load(),
      onSend: (text) => {
        // Still in character, connected and idle? (The bar's SUGGEST state says why not.)
        const why = input.suggestWhyNot() ?? (socket ? null : her().waitToFinish);
        if (why) return suggestPanel?.showRefusal(why);
        // A send the server refuses comes back to the box (restoreDraft).
        input.clearDraft();
        closeSuggest();
        sendTurn({ type: 'user_message', text, mode: 'rp' });
      },
      onEdit: (text) => {
        closeSuggest();
        input.setDraft(text);
      },
      onCancel: closeSuggest,
      onCache: () => {}, // the dealer keeps it
    });
  };
  // While a panel is up it has the keyboard: its own keys, and no typing into the prompt behind
  // it. Alt+M (out of character) and Alt+E (END SCENE) close it first — its cards were for this
  // scene, in character. Other Alt shortcuts wait (the save prompt checks it as a modal).
  window.addEventListener(
    'keydown',
    (e) => {
      const panel = encounterPanel ?? suggestPanel;
      if (!panel) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyM' || e.code === 'KeyE')) {
        closeEncounter();
        closeSuggest();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      panel.key(e);
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
        bookUpdate();
        // An ending in the history was played when it happened: only one that comes in on this tab shows.
        {
          const story = latestQuestStory(feed.messages());
          if (story?.ended) questEndShown = story.id;
        }
        suggestSpent();
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
        bookUpdate();
        if (e.message.role === 'user' && e.message.mode === 'quest') freshQuestRow = e.message.id;
        if (e.message.role === 'user' && e.message.parting === 'her') letGoDraft = null;
        input.setWalkOut(walkOutDue(feed.messages(), noWalkOut()));
        // A new turn: the dealt set was for the moment before it. A played event closes the panel.
        if (e.message.role === 'user' && e.message.status === 'ok') {
          dealer.clear();
          if (e.message.mode === 'encounter') closeEncounter();
          suggestSpent();
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
        bookUpdate();
        suggestSpent();
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
        void playBeatSong(next.active?.song ?? null);
        void showBeatRoom(next.active?.room ?? null, next.active?.roomGuest ?? null);
        beatComms = next.active?.comms === true;
        applyComms();
        jobColumn.setOnLine(partyContact?.name ?? '', next.active?.onLine ?? []);
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
            // The job GO IN started, or it left the board while its card was up: the setup card goes.
            if (setupCard && (next.active?.id === setupCard.id || !next.open.some((q) => q.id === setupCard!.id))) {
              setupCard.card.close();
              setupGone();
              setupCard = null;
            } else if (setupCard) {
              // Still up with a fresh offer (a deck carried on YOU, a recruit back): it follows, picks kept.
              const open = next.open.find((q) => q.id === setupCard!.id);
              const offer = open?.setup ? JSON.stringify(open.setup) : setupCard.offer;
              if (open?.setup && offer !== setupCard.offer) {
                setupCard.offer = offer;
                setupCard.card.update(open.setup);
                showSetupColumn(open, open.setup);
              }
            }
            // A job's ending that came in since the last one shown: its debrief deals on the table.
            const ending = story?.ended && story.id !== questEndShown ? story : null;
            const debrief = ending ? feed.messages().find((m) => m.id === ending.id)?.quest?.debrief : undefined;
            // A job plays on the table (the hand spec §5); story quests on the panel.
            const act = tableAction({ active: next.active, debrief: debrief !== undefined, tableOpen: jobTable.isOpen(), tableEnded: jobTable.ended() });
            if (act === 'show') {
              questCards.show(null);
              // The column first: the table's tips point into it (TWO VOICES) as it shows.
              showTableText(next.active!.title, shownStory, postedLine(next.active!.postedBy));
              jobTable.show(next.active!, shownStory);
              return;
            }
            if (act === 'close') jobTable.close();
            if (act === 'end' && ending && debrief) {
              questEndShown = ending.id;
              const card = debriefEl(debrief, { cue: missionCue, reduced: reducedMotion() });
              jobTable.end(ending.title, ending.text, card, debrief);
              // At the HUD table the rolls read in the JOB column; a phone's table has no column and keeps them on the card.
              showTableText(ending.title, ending.text, undefined, jobTable.root.classList.contains('phone') ? null : debriefRolls(card));
            }
            if (next.active) questCards.show(next.active, shownStory);
            else if (next.waiting) questCards.waiting(next.waiting, storyClock, story?.text);
            else if (story?.ended && story.id !== questEndShown) {
              // A story quest's end stays on the panel.
              questEndShown = story.id;
              questCards.end(story.title, story.text, undefined, story.rewards);
            } else if (story && backToWait(prev, next, story, questEndShown)) {
              questEndShown = story.id;
              questCards.outcome(story.title, story.text);
              // Up until closed: her answer's own state change mustn't take it.
            } else if (story?.id !== questEndShown) questCards.show(null);
          });
        questList.show(e.state);
        hud.setQuestShown(questList.has());
        {
          // A quest that can now start here: say so once (unless another notice is up), and light QUEST until the list is opened.
          const fresh = newlyOpen(questsAnnounced, e.state);
          if (fresh.length > 0) {
            feed.showNotice(`◆ ${fresh.length === 1 ? `${fresh[0].title.toUpperCase()} CAN START HERE` : `${fresh.length} JOBS CAN START HERE`} — JOBS (ALT+Q)`, { label: 'OPEN', run: () => questList.toggle() }, { polite: true });
            hud.setQuestNew(true);
          }
          if (e.state.open.length === 0) hud.setQuestNew(false);
        }
        break;
      }
      case 'quest_pick':
        questHeld = { id: e.id, beat: e.beat };
        if (jobTable.isOpen()) jobTable.pick(e.choice, e.text);
        else questCards.pick(e.choice, e.text);
        break;
      case 'notice':
        // A play the server refused (busy, no key) is said in the open panel; anything else in the feed.
        if (e.for === 'encounter' && encounterPanel) encounterPanel.showRefusal(e.text);
        else if (e.for === 'gig' && gigWindow) gigWindow.showRefusal(e.text);
        else if (e.for === 'dice' && dice.open) dice.refusal(e.text);
        else if (e.for === 'crew' && crew) crew.refusal(e.text);
        else if (e.for === 'kit' && sheet) sheet.refusal(e.text);
        // GO IN refused (someone isn't ready, no favours): said on the setup card, which stays open.
        else if (e.for === 'quest' && setupCard?.card.isOpen()) setupCard.card.refuse(e.text);
        // GO refused (busy, no key, not on your line): said on the arrival screen, the line kept.
        else if (e.for === 'travel' && travelScreen?.screen.open) travelScreen.screen.notice(e.text);
        else {
          feed.showNotice(e.text);
          doors.refused();
        }
        break;
      case 'kit_changed':
        refreshKit();
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
        // A WAIT or a trip moves the clock: heat cools and NERVE refills at 06:00 (missions spec §1); crew errands land.
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
      case 'world-changed': {
        // Another tab switched playthroughs: follow the world to its contact, or to the solo screen (this socket closes next).
        // The server sent you solo after her goodbye (HANG UP, a dropped line): that goodbye is walked out on.
        const follow = () => {
          if (e.solo === true && walkOutDue(feed.messages(), noWalkOut())) {
            const goodbye = feed.messages().findLast((m) => m.role === 'agent');
            if (goodbye) markWalkedOut(goodbye.id);
          }
          leave(worldChangedPath(e.location, e.solo === true));
        };
        // LOAD over the room switched it (review I3): LOAD goes where it loaded; if it's backed out of, follow then.
        if (loadOver) loadOver.pending = follow;
        else follow();
        break;
      }
      case 'portrait': {
        const chain: FigureSource[] = [];
        if (e.sprite) {
          chain.push({ kind: 'sprite', url: e.sprite.url, crop: e.sprite.crop, waist: e.sprite.waist, pixel: e.sprite.pixel, expressions: e.sprite.expressions, outfits: e.sprite.outfits });
          crops.right = e.sprite.crop;
        }
        if (e.kind !== 'monogram') chain.push({ kind: 'portrait', url: e.url });
        chain.push({ kind: 'monogram', letter: e.name.charAt(0).toUpperCase() });
        contactFigure = { chain, name: e.name, accent: e.accent };
        if (!beatRoom) stage.setRight(chain, e.name, e.accent);
        partyContact = { name: e.name, accent: e.accent, thumb: e.kind === 'monogram' ? null : `/api/agents/${encodeURIComponent(agentId)}/thumb` };
        journal.setContact({ name: e.name, accent: e.accent, face: partyContact.thumb });
        whosHere.setParty(partyYou, partyContact, { comms: comms.on });
        bookUpdate();
        applyComms();
        outfitByScene = e.sprite?.outfitByScene;
        stage.setOutfit('right', herOutfit(loadedSceneId ?? currentSceneId));
        // A pick made on PEOPLE (this tab or an earlier one) dresses her once it's heard.
        void contactOutfits().then(
          (picks) => {
            outfitPicks = picks;
            stage.setOutfit('right', herOutfit(loadedSceneId ?? currentSceneId));
          },
          () => {},
        );
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
      case 'residual_runs':
        devPanel.setResidualRuns(e.runs, e.cipher, e.habits);
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
          suggestSpent();
          dice.roomChanged();
        }
        atmosphere = e.state.atmosphere;
        currentSceneId = e.state.sceneId;
        bookUpdate();
        const scene = scenes.get(e.state.sceneId);
        hud.setScene(scene?.name ?? e.state.sceneId);
        hud.setAtmosphere(e.state.atmosphere);
        devPanel.setRoom(e.state);
        if (scene) {
          roomAudio.room(e.state, scene, '/scenes/', e.source === 'restore' ? 0 : e.duration, e.transition, e.transition === 'glitch' ? TRANSITION_DURATION.signal / 2 : undefined);
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
      bookUpdate();
    } else if (e.type === 'scenes') {
      residents = e.residents ?? {};
      for (const s of e.scenes) scenes.set(s.id, s);
      devPanel.setScenes(e.scenes);
    } else if (e.type === 'room') {
      realRoom = e.state;
      // A beat's room holds the picture; this one comes back when the beat moves on.
      if (beatRoom) return;
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
            stage.setOutfit('right', herOutfit(sceneId));
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
            // A room's glitch shows as a signal drop (the select keeps the real one).
            else await renderer.playTransition(e.transition === 'glitch' ? (reducedMotion() ? 'fade' : 'signal') : (e.transition ?? 'fade'), swap);
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

  /** A beat's room (`room:`, view only): that picture, the contact's lines in CRT cyan, a brought guest in the figure slot. */
  const showBeatRoom = async (room: string | null, guest: string | null): Promise<void> => {
    if (room === beatRoom) return;
    if (room !== null && !scenes.has(room)) return console.warn(`[room] unknown beat room ${room}`);
    beatRoom = room;
    beatGuest = room !== null && guest !== null;
    const figure = beatGuest ? ((await (await fetch('/api/agents')).json()) as { agents: { id: string; name: string; accent: string; sprite: SpriteRef | null }[] }).agents.find((a) => a.id === guest) : undefined;
    if (figure?.sprite) stage.setRight([{ kind: 'sprite', url: figure.sprite.url, crop: figure.sprite.crop, waist: figure.sprite.waist, pixel: figure.sprite.pixel, outfits: figure.sprite.outfits }, { kind: 'monogram', letter: figure.name.charAt(0).toUpperCase() }], figure.name, figure.accent);
    else if (contactFigure) stage.setRight(contactFigure.chain, contactFigure.name, contactFigure.accent);
    applyComms();
    const target = scenes.get(room ?? realRoom?.sceneId ?? '');
    if (!target) return;
    hud.setScene(target.name);
    queue = queue.then(async () => {
      const renderer = await rendererReady;
      if (!renderer) return;
      await renderer.playTransition('fade', async () => {
        await renderer.loadScene(target);
        loadedSceneId = target.id;
        doors.show(room ? null : target);
        renderer.applyState(room ? { sceneId: target.id, lights: target.lights, atmosphere: target.defaults } : (realRoom ?? { sceneId: target.id, lights: target.lights, atmosphere: target.defaults }), 0);
      });
    });
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
          ? [{ kind: 'sprite', url: persona.sprite.url, crop: persona.sprite.crop, waist: persona.sprite.waist, pixel: persona.sprite.pixel, expressions: persona.expressions, outfits }]
          : [];
        yourFaces = Object.keys(persona.expressions ?? {});
        applyFaces();
        stage.setOutfit('left', persona.outfit ?? null);
        stage.setLeft([...chain, { kind: 'silhouette' }], persona.name, '#7fe9ff');
        partyYou = { name: persona.name, accent: persona.accent ?? '#7fe9ff', thumb: persona.sprite ? `/api/agents/${encodeURIComponent(persona.id)}/thumb` : null };
        whosHere.setParty(partyYou, partyContact, { comms: comms.on });
        bookUpdate();
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
  void serverUp().then(() => startRoom(route.id));
} else if (route.kind === 'solo') {
  markSplashSeen(); // between scenes: back to the title skips the splash, as from a room
  void import('./landing/solo').then((m) => m.startSolo());
} else {
  void import('./landing/landing').then((m) => m.startLanding());
}

/** How often the room draws under the map. */
const ROOM_FPS_UNDER_MAP = 10;

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
