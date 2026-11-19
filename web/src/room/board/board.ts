/**
 * The board (crew rules spec 2026-11-17, The board; mockup docs/mockups/crew-board.html, CARD BEHIND): a crew-rules run
 * on the whole 1600×900 stage in place of the story table. The job and its route along the top with the clocks; the
 * story page down the left (the JOB column, which main.ts fills as for the table: the board only gives it its place);
 * the contact's comms strip under it; the beat's cards as panels in the middle; the hand of printed cards along the
 * bottom. Pick a card from the hand and each panel shows its way there; click a panel to send them.
 *
 * It never marks, sorts or colours ways by how good they are: rows keep the view's order, and each cost is coloured
 * by its kind only.
 *
 * Before the run, GO IN (setup.ts) stands in the same frame: who to bring, the deck to load, Enter goes in. After it,
 * the debrief (debrief.ts), until it's closed. The room's chrome stays down from GO IN to the debrief's close.
 */
import './board.css';
import type { ChatMessage, CrewJobView, Debrief, QuestState } from '../../../../shared/types';
import { ALARM_MAX } from '../../../../shared/dice';
import { baseProgramId } from '../../../../shared/programs';
import { beatAway } from '../../../../shared/quests';
import { mountTableShell } from '../table/shell';
import { routeEl } from '../table/route';
import { fitNames, forkEl } from './route';
import { el } from '../table/el';
import { faceEl, firstName, handLayout, moveCard, moveFace, personCard, programCard, DECK_X, type HandCard } from './hand';
import { byOf, costEl, handOf, panelEl, priced, targets, waysFor, whoOf, type BoardCard, type BoardWay } from './panels';
import { fly, rise, shake, stamp, FLY_MS, SCENE_BACK_MS, SCENE_GIVE_UP_MS, SCENE_HOLD_MS, SCENE_OUT_MS, SCENE_STILL_MS, STAMP_HOLD_MS, type Stamp } from './moments';
import { goInEl, goInItems, keepPicks, toggle, type GoInItem, type GoInJob, type GoInPicks } from './setup';
import { debriefBoardEl } from './debrief';
import { graftCue } from '../table/el';
import { traceVia } from '../../ui/trace-lead';
import type { TextEffect } from '../../ui/box-prefs';
import { mountSayLine } from './say-line';

type Active = NonNullable<QuestState['active']>;
type Contact = { id: string; name: string; comms: string | null } | null;
export type BoardCue = 'deal' | 'clean' | 'cost' | 'miss' | 'take' | 'ability' | 'firewall' | 'program' | 'go' | 'tap' | 'crew' | 'load';
export type { GoInJob } from './setup';

/**
 * A scene moment the board agreed to (Board.sceneMoment): the room's swap waits on `out` (the board has stepped back,
 * or the moment is over), and calls `landed` once the new room is up and clear.
 */
export interface SceneMoment {
  out: Promise<void>;
  landed(): void;
}

export interface Board {
  /**
   * The quest state as it stands, and the room's contact (null: none). The comms strip shows only for a job with a
   * contact (the view's `contact`); the room's is used for her portrait when it's her.
   */
  update(state: QuestState, o: { contact: Contact }): void;
  /** A crew-rules run, its GO IN or its debrief is on screen: main.ts keeps the room's chrome and the story table down. */
  up(): boolean;
  /**
   * GO IN for a crew-rules job (its setup offer): who to bring and the deck to load. Called again for the same job with
   * a fresh offer, the picks it still holds are kept. The run it starts takes its place on the next update.
   */
  goIn(job: GoInJob): void;
  /** GO IN goes without going in or backing out (the job left the list): no callback. */
  leave(): void;
  /** The job's debrief, until it's closed (onClose). A send still landing finishes first. */
  end(d: Debrief, o: { title: string }): void;
  /** The id of the last crew-rules run the board showed (null: none yet): whose ending is the board's. */
  ran(): string | null;
  /** GO IN went nowhere (the socket dropped): it can go again at once. */
  giveBack(): void;
  /** The contact is speaking (ride-along replies): nothing goes until she's done, as on the table. */
  hold(name: string | null): void;
  /** Her latest line, beside her portrait (null: none yet). */
  say(text: string | null): void;
  /** The box settings' TEXT speed (typing.ts textSpeedScale) and TEXT EFFECT, for her line on the comms strip. */
  setTextSpeed(scale: number): void;
  setTextEffect(e: TextEffect): void;
  /** Shows the rest of her comms line now, if it's typing; true when it was. */
  finishTyping(): boolean;
  /**
   * The room's contact's model, short (the HUD's name; null: none), under her portrait when the job's contact is her:
   * the model her next reply answers on.
   */
  setModel(label: string | null): void;
  /** Whether a key has aimed at something (a way on a panel, someone at GO IN): Enter goes there, not to the typing. */
  aimed(): boolean;
  /** The server refused what was sent (busy, already up): said on the board, which is given back at once. */
  refuse(text: string): void;
  /**
   * ←→ the hand, ↑↓ the panels, Enter sends, M plays the selected recruit's move. At GO IN: ←→ step who to bring and
   * the programs, Space brings or loads, Enter goes in, Esc backs out. At the debrief: Enter or Esc closes. True when taken.
   */
  key(key: string): boolean;
  /**
   * The beat's room differs from the picture (main.ts showBeatRoom): the board steps back so the change is seen. The
   * pieces fade out (after a send's stamp has had its hold), the room swaps, the new room holds clear with its name on a
   * band (`name`, then ` · ` and `place()` once it answers), the board fades back. Any key or click ends it at once and
   * does nothing else. Null when there's no moment: the board isn't already showing a run (a reload, the board first
   * appearing on a beat in progress) and isn't going in from GO IN, or the debrief is up.
   */
  sceneMoment(m: { name: string; place: () => Promise<string | null> }): SceneMoment | null;
  /** Resolves when the scene moment under way is over and the board is back (at once with none): the voice waits for it. */
  sceneDone(): Promise<void>;
  /** A scene moment is under way (stepped back, or waiting for a stamp to finish to do so). */
  inScene(): boolean;
  root: HTMLElement;
}

/**
 * Whether a key is one of the room's hotkeys the board refuses while it's up (crew rules spec: no map, texts or chat
 * while a job runs): the Tab cycle (YOU, PEOPLE, QUEST, CREW, MAP, BOOK) and every Alt hotkey (panels, TEXTS, the book,
 * the chat's mode, END SCENE, a suggestion, a draw, her reroll) but TITLE. Esc is never refused: the pause menu opens.
 */
/**
 * Whether a job's ending is the board's to show (a crew-rules run's): the run the board last showed, or a debrief the
 * server marked as crew rules (after a reload mid-run the board never saw the run).
 */
export function boardEnding(end: NonNullable<ChatMessage['quest']> | undefined, ran: string | null): end is NonNullable<ChatMessage['quest']> & { debrief: Debrief } {
  return end?.debrief !== undefined && (end.id === ran || end.debrief.rules === 'crew');
}

/**
 * Whether a beat's room change is the board's scene moment (main.ts showBeatRoom): a crew-rules run, the board up, and
 * a picture that actually changes (the room the board was last showing, not the beat's id: a beat back in the room
 * you stood in changes it too, a beat in the room already shown doesn't).
 */
export function sceneChanges(o: { crew: boolean; boardUp: boolean; target: string; shown: string | null }): boolean {
  return o.crew && o.boardUp && o.shown !== null && o.target !== o.shown;
}

export function boardRefusesKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey'>): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  if (e.key === 'Tab') return true;
  return e.altKey && e.code !== 'KeyT' && e.key !== 'Alt';
}

/** The route's width along the top, between the job's name and the clocks (mockup); narrower when the clocks reach in. */
const ROUTE_W = 540;
/** Where the route starts (board.css .bw-route) and the air it keeps before the clocks. */
const ROUTE_X = 470;
const ROUTE_GAP = 24;

/** What TAKE and ALARM are, on hover (a job's own clocks carry their note from the job file). */
const CLOCK_TIPS: Record<string, string> = { take: 'WHAT YOU CARRY OUT. THE PAY SCALES WITH IT', alarm: 'AT 4 THE JOB GOES TO THE GETAWAY' };

const RUN_KEYS = '[←→] WHO · [↑↓] WHERE · [ENTER] SEND · [M] MOVE';

/**
 * The job's meta line as the story table writes its own (job-table.ts showRoute, `.tb-role`): the tier in the text's
 * white, then HEAT and the pay in the grey, ` · ` between.
 */
export function metaLine(tier: number | null | undefined, heat: number | null | undefined, pay: readonly [number, number] | null | undefined): Node[] {
  const out: Node[] = [];
  const add = (n: Node | string) => out.push(...(out.length ? [document.createTextNode(' · ')] : []), typeof n === 'string' ? document.createTextNode(n) : n);
  if (tier) add(el('b', '', `TIER ${tier}`));
  if (heat !== null && heat !== undefined) add(`HEAT ${heat}`);
  if (pay && pay[1] > 0) add(`${pay[0] === pay[1] ? pay[0] : `${pay[0]}–${pay[1]}`} SOL`);
  return out;
}

/** The page's head line stands this far over the page's region (board.css: the TEXT key centred on it). */
const PAGE_HEAD_LIFT = 16;

/** A send that never comes back (refused, lost) gives the board back after this. */
const GIVE_BACK_MS = 5000;

export function mountBoard(
  host: HTMLElement,
  o: {
    onSend(card: string, by: string): void;
    onMove(card: string): void;
    onPick(card: string): void;
    /** GO IN: who's brought and what's loaded (quest_start's crew setup). */
    onGoIn(setup: { crew: true; people: string[]; programs: string[] }): void;
    /** GO IN backed out of (Esc, BACK) without going in. */
    onBack?(): void;
    /** The debrief closed: the board is down and the room's chrome is back. */
    onClose(): void;
    /** The debrief's grade landing (the table's debrief cue). */
    tierCue?(tier: Debrief['tier']): void;
    cue(n: BoardCue): void;
    reduced(): boolean;
    /** The pause menu is up: a scene moment leaves its keys and clicks alone. */
    paused?(): boolean;
  },
): Board {
  const shell = mountTableShell(host, { hud: true });
  shell.root.classList.add('tb-crew');
  // The table's own pieces the board never uses leave the page (the shell keeps its handles on them): a second
  // `.tb-middle`, `.tb-prose` or `.tb-nerve` on the page would read as the Graft table's to anything that looks for it.
  for (const n of [shell.top, shell.middle, shell.levers, shell.bottom, shell.log?.querySelector('.tb-prose')]) n?.remove();
  const bw = el('div', 'bw');
  const job = el('div', 'bw-job');
  const sub = el('div', 'bw-sub');
  const route = el('div', 'bw-route');
  const clocks = el('div', 'bw-clocks');
  const beatRow = el('div', 'bw-beatrow');
  const held = el('div', 'bw-held');
  held.hidden = true;
  const note = el('div', 'bw-note');
  note.hidden = true;
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  const panels = el('div', 'bw-panels');
  const labWho = el('div', 'bw-lab', 'WHO YOU SEND');
  const labDeck = el('div', 'bw-lab deck', 'THE DECK');
  labDeck.style.left = `${DECK_X}px`;
  const hand = el('div', 'bw-hand');
  const comms = el('div', 'bw-comms');
  const pic = el('div', 'bw-pic');
  const cwho = el('div', 'bw-cwho');
  const modelEl = el('div', 'bw-model');
  modelEl.hidden = true;
  const sayEl = el('div', 'bw-say');
  const offers = el('div', 'bw-offers');
  comms.append(pic, modelEl, cwho, sayEl, offers);
  const sayLine = mountSayLine(sayEl, { reduced: o.reduced });
  const keys = el('div', 'bw-keys', RUN_KEYS);
  const riseBox = el('div', 'bw-rise');
  bw.append(el('div', 'bw-wash'), job, sub, route, clocks, beatRow, held, note, panels, labWho, labDeck, hand, comms, keys, riseBox);
  shell.root.append(bw);

  let a: Active | null = null;
  /** The room's contact: her portrait art, when she's the job's. */
  let room: Contact = null;
  /** The room's contact's model, short (setModel). */
  let modelLabel: string | null = null;
  /** The job's contact on the strip (null: none): her model shows only when she's the room's. */
  let commsWho: string | null = null;
  /** The beat last drawn (`<job>|<beat>`): a new one drops the pick. */
  let drawnAt: string | null = null;
  let picked: string | null = null;
  let at = 0;
  /**
   * ↑↓ have been used since the pick: only then does the cursor sit on one of two ways on a card (no way is lit
   * before the player moves to it, so the first row never reads as the board's suggestion).
   */
  let aimed = false;
  let heldBy: string | null = null;
  /** A send on its way: what was sent, the way it went (null: a throw), and the run as it stood. */
  let pending: { card: string; by: string; way: BoardWay | null; prev: Active } | null = null;
  let flyTimer: ReturnType<typeof setTimeout> | null = null;
  let giveBack: ReturnType<typeof setTimeout> | null = null;
  /** The landing's hold: the old beat stands with its stamp, then the latest state is drawn. */
  let landing: ReturnType<typeof setTimeout> | null = null;
  /** Each clock's value as last drawn (`<job>` and values): what moved since lights up on the next draw. */
  let lastClocks: { job: string; values: Record<string, number> } | null = null;
  let picSrc: string | null = null;
  /** GO IN: the job, the picks, where the keys stand (null until ←→), and whether GO IN went (until a refusal). */
  let goin: { job: GoInJob; picks: GoInPicks; at: GoInItem | null; sent: boolean } | null = null;
  /** The debrief up, and whether its cue has played. */
  let ended: { d: Debrief; title: string; cued: boolean } | null = null;
  /** The debrief's pay and keep cues, waiting: a quick close stops them. */
  let endCues: ReturnType<typeof setTimeout>[] = [];
  /** GO IN sent and nothing back: it can go again after this (as a send that never lands). */
  let goInWait: ReturnType<typeof setTimeout> | null = null;
  let lastRun: string | null = null;
  /** GO IN's or the debrief's node in the middle. */
  const modeBox = el('div', 'bw-mode');
  bw.append(modeBox);
  /**
   * The scene moment (sceneMoment): `wait` until a send's stamp has had its hold, `out` while the board fades, `swap`
   * while the room changes, `hold` while the new room stands with its name, `back` while the board fades in.
   */
  let scene: { phase: 'wait' | 'out' | 'swap' | 'hold' | 'back'; name: string; place: string | null; open: () => void; timer: ReturnType<typeof setTimeout> | null; guard: ReturnType<typeof setTimeout> } | null = null;
  /** The room's name across the lower stage during the moment: on the stage itself, since the board's pieces are faded. */
  const band = el('div', 'bw-scene-band');
  band.hidden = true;
  host.append(band);

  const view = (): CrewJobView | null => a?.crew ?? null;
  const entry = (id: string): HandCard | undefined => view()?.hand.find((h) => h.id === id);
  const busy = () => heldBy !== null || pending !== null || landing !== null;
  const hasWay = (id: string) => view()?.cards.some((c) => c.ways.some((w) => w.by === id)) ?? false;
  /**
   * Who ←→ steps through and a click can pick: you, ready recruits, and ready programs with a way on this beat; then
   * the contact, last, when she has a way here (her strip has no card in the hand, so the keys reach her there).
   */
  const pickable = (h: HandCard) => h.state === 'ready' && (h.kind === 'you' || h.kind === 'recruit' || ((h.kind === 'program' || (h.kind === 'contact' && view()?.contact !== undefined)) && hasWay(h.id)));
  /** The one hand card that can be sent on this beat, when there's exactly one (her strip offers hers apart). */
  const soleSender = (v: CrewJobView): string | null => {
    // A beat of plain picks (PRESS ON?, a plain beat): a pick there means nothing.
    if (v.cards.every((c) => c.plain || c.crack)) return null;
    const can = v.hand.filter((h) => h.kind !== 'contact' && pickable(h));
    return can.length === 1 ? can[0].id : null;
  };
  const herName = (): string | null => view()?.contact?.name ?? null;
  const pickedCard = (): HandCard | null => (picked ? (entry(picked) ?? null) : null);
  const isUp = () => a !== null;
  // By the data attribute, not a selector: ids are the job file's (CSS.escape isn't everywhere this runs).
  const panelOf = (card: string) => [...panels.querySelectorAll<HTMLElement>('.bw-panel')].find((n) => n.dataset.card === card) ?? null;

  // ── drawing ──────────────────────────────────────────────────────────

  function drawClocks(x: Active, v: CrewJobView): void {
    const rows: { id: string; label: string; size: number; value: number; note?: string }[] = [...(x.take ? [{ id: 'take', label: 'TAKE', size: x.take.size, value: x.take.filled }] : []), { id: 'alarm', label: 'ALARM', size: ALARM_MAX, value: x.alarm ?? 0 }, ...v.clocks];
    clocks.replaceChildren(
      ...rows.map((r) => {
        const c = el('div', `bw-clk k-${r.id === 'take' || r.id === 'alarm' ? r.id : 'job'}`);
        c.dataset.clock = r.id;
        const pips = el('b', '');
        // Since the last draw of this job: the pips filled light up; a clock that went down (SCRUB) glows whole.
        const before = lastClocks?.job === x.id ? (lastClocks.values[r.id] ?? r.value) : r.value;
        if (r.value !== before) c.classList.add('moved');
        for (let i = 0; i < r.size; i++) pips.append(el('i', [i < r.value ? 'on' : '', i < r.value && i >= before ? 'pop' : ''].filter(Boolean).join(' ')));
        c.append(el('span', 'bw-clk-label', r.label), pips);
        // Rest the pointer on a clock and it says what it is (playtest: HIS NERVE needed saying, as a tip on hover).
        const note = r.note ?? CLOCK_TIPS[r.id];
        if (note) {
          const tip = el('div', 'bw-clk-tip hv-frame');
          tip.setAttribute('role', 'tooltip');
          tip.append(el('div', 'hv-head', r.label), el('div', 'hv-gist', note));
          c.append(tip);
        }
        return c;
      }),
    );
    // Four or more (a job's own clocks beside TAKE and ALARM): set closer, so they leave the route its room.
    clocks.classList.toggle('tight', rows.length >= 4);
    lastClocks = { job: x.id, values: Object.fromEntries(rows.map((r) => [r.id, r.value])) };
  }

  /** The route's width: up to ROUTE_W, never into the clocks (drawn first). Unlaid (hidden) clocks leave it ROUTE_W. */
  function routeWidth(): number {
    if (!clocks.offsetWidth) return ROUTE_W;
    return Math.max(280, Math.min(ROUTE_W, clocks.offsetLeft - ROUTE_X - ROUTE_GAP));
  }

  function drawRoute(x: Active, v: CrewJobView): void {
    if (!x.route) return void route.replaceChildren();
    const w = routeWidth();
    route.style.width = `${w}px`;
    // A fork in two rows of cells (route.ts); any other way, the table's ladder with who can go under each beat ahead.
    const fork = forkEl(x.route, x.beat, v.ahead, w);
    if (fork) return void route.replaceChildren(fork);
    const r = routeEl(x.route, x.beat, { width: w });
    const cells = [...r.querySelectorAll<HTMLElement>('[data-beat]')];
    for (const n of cells) {
      const names = v.ahead[n.dataset.beat ?? ''];
      if (names) n.append(el('small', 'bw-ahead', fitNames(names, w / Math.max(1, cells.length) - 10)));
    }
    route.replaceChildren(r);
  }

  function beatTitle(x: Active): string {
    if (x.crew?.title) return x.crew.title;
    const b = x.route?.ways.flatMap((w) => w.beats).find((y) => y.id === x.beat);
    return b?.title ?? x.beat.replace(/-/g, ' ').toUpperCase();
  }

  function drawHeader(x: Active, v: CrewJobView): void {
    job.textContent = x.title.toUpperCase();
    sub.replaceChildren(...metaLine(x.tier, x.heat, x.pay));
    const mods = el('span', 'bw-mods');
    for (const m of v.mods) {
      const mod = el('span', 'bw-mod');
      if (m.art) {
        const img = el('img', '');
        img.src = m.art;
        img.alt = '';
        img.addEventListener('error', () => img.remove());
        mod.append(img);
      }
      mod.append(m.label);
      mods.append(mod);
    }
    beatRow.replaceChildren(el('span', 'bw-beat', `${x.getaway ? 'GET OUT · ' : ''}${beatTitle(x)}`), mods);
  }

  function drawPanels(v: CrewJobView): void {
    const p = pickedCard();
    const ts = targets(v.cards, p);
    const t = ts.length ? ts[Math.min(at, ts.length - 1)] : null;
    panels.className = `bw-panels n${v.cards.length}`;
    panels.replaceChildren(
      ...v.cards.map((c) =>
        panelEl(c, {
          picked: p,
          hand: v.hand,
          clocks: v.clocks,
          contactName: herName(),
          // Nothing is lit until ↑↓ aims (a lit panel or way would read as the board's suggestion).
          at: aimed && t && t.card === c.id && t.act !== 'none' ? (t.act === 'send' && waysFor(c, p).ways.length > 1 ? t.by : true) : null,
        }),
      ),
    );
    fitTitles();
  }

  /** A card's name stays on one line: a long one (WHERE YOU HEARD IT) steps down until it fits, never under 26px. */
  function fitTitles(): void {
    for (const h of panels.querySelectorAll<HTMLElement>('.bw-panel h2')) {
      if (!h.clientWidth) continue;
      let size = parseFloat(getComputedStyle(h).fontSize);
      while (h.scrollWidth > h.clientWidth && size > 26) {
        size -= 2;
        h.style.fontSize = `${size}px`;
      }
    }
  }

  function drawHand(v: CrewJobView): void {
    const pos = handLayout(v.hand);
    const cards: HTMLElement[] = [];
    const moves: HTMLElement[] = [];
    for (const h of v.hand) {
      const xy = pos.get(h.id);
      if (!xy || h.kind === 'contact') continue;
      if (h.kind === 'program') cards.push(programCard(h, { sel: picked === h.id, at: xy, chip: picked === h.id && h.play?.can === true }));
      else {
        cards.push(personCard(h, { sel: picked === h.id, at: xy }));
        // A picked recruit's move lifts with them, so its name stays readable above their card.
        if (h.kind === 'recruit' && h.state === 'ready' && h.move?.can) moves.push(moveCard(h, xy, picked === h.id));
      }
    }
    // The moves first: each is tucked behind its recruit's card.
    hand.replaceChildren(...moves, ...cards);
    labDeck.hidden = !v.hand.some((h) => h.kind === 'program');
  }

  function drawComms(x: Active, v: CrewJobView): void {
    // Only a job with a contact has the strip, whoever's room it's played in.
    const her = v.contact;
    comms.hidden = !her;
    commsWho = her?.id ?? null;
    drawModel();
    if (!her) return;
    comms.classList.toggle('sel', picked === 'contact');
    const away = beatAway({ room: x.room, onComms: x.comms, here: x.here });
    cwho.textContent = `${her.name.toUpperCase()} · ${away ? 'ON COMMS' : 'WITH YOU'}`;
    // Her comms figure (when the room's contact is her), else her neutral sprite; her initial if neither loads.
    const src = (room?.id === her.id ? room.comms : null) ?? `/api/agents/${encodeURIComponent(her.id)}/sprite`;
    if (src !== picSrc) {
      picSrc = src;
      pic.replaceChildren(faceEl(src, her.name, 'bw-pic-img'));
    }
    // Her way on a card is offered here, not from the hand.
    offers.replaceChildren(
      ...v.cards.flatMap((c) =>
        c.ways
          .filter((w) => w.by === 'contact')
          .map((w) => {
            const b = el('div', 'bw-offer');
            b.dataset.card = c.id;
            b.setAttribute('role', 'button');
            const head = el('div', 'bw-offer-head', `${firstName(her.name)} DOES ${c.short}`);
            // Her line (what you'd ask) is a tip on hover, so the offer leaves her words their room (playtest).
            const tip = el('div', 'bw-offer-tip hv-frame');
            tip.setAttribute('role', 'tooltip');
            tip.append(el('div', 'hv-head', `${firstName(her.name)} DOES ${c.short}`), el('div', 'hv-gist', w.line));
            b.append(head, costEl(w, v.clocks), tip);
            return b;
          }),
      ),
    );
  }

  /** Her model under her portrait: only the room's contact's is known (the room's model event), so only for her. */
  function drawModel(): void {
    const on = modelLabel !== null && commsWho !== null && room?.id === commsWho;
    modelEl.hidden = !on;
    modelEl.textContent = on ? modelLabel : '';
    if (on) modelEl.title = modelLabel!;
  }

  /** Clears the run's own pieces (GO IN and the debrief stand in the frame without them). */
  function clearRun(): void {
    for (const n of [route, clocks, beatRow, panels, hand, offers]) n.replaceChildren();
    sayLine.reset();
    picSrc = null;
    pic.replaceChildren();
    comms.hidden = true;
    commsWho = null;
    drawnAt = null;
    picked = null;
    lastClocks = null;
  }

  function drawGoIn(g: NonNullable<typeof goin>): void {
    const { job: j } = g;
    job.textContent = j.title.toUpperCase();
    sub.replaceChildren(...metaLine(j.tier, j.offer.heat, j.pay));
    modeBox.replaceChildren(goInEl(j, g.picks, g.at));
    keys.textContent = '[←→] PICK · [SPACE] BRING · LOAD · [ENTER] GO IN · [ESC] BACK';
  }

  function drawEnd(e: NonNullable<typeof ended>): void {
    job.textContent = e.title.toUpperCase();
    sub.textContent = '';
    modeBox.replaceChildren(debriefBoardEl(e.d, { title: e.title, reduced: o.reduced() }));
    keys.textContent = '[ENTER] CLOSE';
    if (e.cued) return;
    e.cued = true;
    o.tierCue?.(e.d.tier);
    // The pay and what you keep sound after the grade's own cue, as the table's debrief does.
    if (!o.reduced() && e.d.sol > 0) {
      endCues = [setTimeout(() => graftCue('pay'), 700), setTimeout(() => graftCue('keep'), 1900)];
    }
  }

  /**
   * The page's trace, as the story table draws its own (job-table.ts drawTrace, ui/trace-lead.ts): the head line from a
   * ring at the page's top-left corner into the TEXT key's ring at its right end (style.css .bs-key), and the rail down
   * the page's left to its foot, over the comms strip. In the shell's box, on the stage's pixels (the board's place is fixed).
   */
  function drawPageTrace(): void {
    const log = shell.log;
    if (!log || log.offsetWidth === 0) return;
    const x = log.offsetLeft;
    const y = log.offsetTop - PAGE_HEAD_LIFT;
    const keyW = parseFloat(getComputedStyle(shell.root).getPropertyValue('--bs-key-w')) || 62;
    traceVia(shell.root, 'head', [[x, y], [x + log.offsetWidth - keyW, y]]);
    traceVia(shell.root, 'rail', [[x, y + 4], [x, log.offsetTop + log.offsetHeight]], undefined, { ring: false });
  }

  function draw(): void {
    const x = a;
    const mode = x ? 'run' : ended ? 'end' : goin ? 'goin' : null;
    // A note belongs to the screen it was said on: GO IN's refusal doesn't carry into the run.
    if ((bw.dataset.mode ?? '') !== (mode ?? '')) hideNote();
    // The run is over (the debrief, the board down): a scene moment goes with it.
    if (mode !== 'run') sceneEnd();
    host.classList.toggle('crew-board', mode !== null);
    bw.dataset.mode = mode ?? '';
    if (!mode) {
      bw.dataset.drawn = '';
      if (!shell.root.hidden) shell.close();
      clearRun();
      modeBox.replaceChildren();
      return;
    }
    if (shell.root.hidden) shell.open();
    drawPageTrace();
    if (mode !== 'run') {
      if (bw.dataset.drawn !== mode) freshen();
      bw.dataset.drawn = mode;
      clearRun();
      if (mode === 'end') drawEnd(ended!);
      else drawGoIn(goin!);
      applyHold();
      return;
    }
    modeBox.replaceChildren();
    bw.dataset.drawn = 'run';
    keys.textContent = RUN_KEYS;
    const v = x!.crew!;
    const here = `${x!.id}|${x!.beat}`;
    if (here !== drawnAt) {
      drawnAt = here;
      freshen();
      // One card in the hand that can be sent (you alone, nobody ready, no program with a way here): it's picked for
      // you, so the panels show your ways at once. Nothing is lit until ↑↓ aims, as ever.
      picked = soleSender(v);
      at = 0;
      aimed = false;
    }
    const p = pickedCard();
    if (p && !pickable(p)) picked = null;
    drawHeader(x!, v);
    drawClocks(x!, v);
    drawRoute(x!, v);
    drawPanels(v);
    drawHand(v);
    drawComms(x!, v);
    applyHold();
  }

  function applyHold(): void {
    held.hidden = heldBy === null;
    held.textContent = heldBy ? `${heldBy.toUpperCase()} ON THE LINE` : '';
    shell.root.classList.toggle('held', heldBy !== null);
    shell.root.classList.toggle('busy', pending !== null || landing !== null || scene !== null);
  }

  // ── the scene moment ─────────────────────────────────────────────────

  const SCENE_CLASSES = ['bw-scene', 'bw-scene-back', 'bw-scene-snap'];
  /** Who waits on the moment ending (sceneDone). */
  const sceneWaiters: (() => void)[] = [];

  /** The stamp's hold is over (or there was none): the board steps back. */
  function sceneOut(): void {
    const s = scene;
    if (!s || s.phase !== 'wait' || pending || landing) return;
    s.phase = 'out';
    const still = o.reduced();
    host.classList.toggle('bw-scene-snap', still);
    host.classList.remove('bw-scene-back');
    host.classList.add('bw-scene');
    if (still) {
      s.phase = 'swap';
      return s.open();
    }
    s.timer = setTimeout(() => {
      s.timer = null;
      if (scene !== s) return;
      s.phase = 'swap';
      s.open();
    }, SCENE_OUT_MS);
  }

  function sceneBand(s: NonNullable<typeof scene>): void {
    const place = s.place && s.place.toUpperCase() !== s.name.toUpperCase() ? s.place : null;
    band.replaceChildren(el('span', '', [s.name, place].filter(Boolean).join(' · ').toUpperCase()));
  }

  /** The new room is up: its name holds over it, then the board comes back. */
  function sceneLanded(s: NonNullable<typeof scene>): void {
    if (scene !== s) return;
    // Landed before the board stepped back (nothing to wait for: no renderer): there was nothing to see.
    if (s.phase === 'wait' || s.phase === 'out') return sceneEnd();
    if (s.phase !== 'swap') return;
    s.phase = 'hold';
    sceneBand(s);
    band.hidden = false;
    const still = o.reduced();
    s.timer = setTimeout(() => {
      s.timer = null;
      if (scene !== s) return;
      if (still) return sceneEnd();
      s.phase = 'back';
      band.hidden = true;
      host.classList.remove('bw-scene');
      host.classList.add('bw-scene-back');
      s.timer = setTimeout(sceneEnd, SCENE_BACK_MS);
    }, still ? SCENE_STILL_MS : SCENE_HOLD_MS);
  }

  /** The moment is over: the board is as it was, at once. */
  function sceneEnd(): void {
    const s = scene;
    if (!s) return;
    scene = null;
    for (const r of sceneWaiters.splice(0)) r();
    if (s.timer) clearTimeout(s.timer);
    clearTimeout(s.guard);
    band.hidden = true;
    band.replaceChildren();
    host.classList.remove(...SCENE_CLASSES);
    // The room's swap never waits on a moment that's gone.
    s.open();
    applyHold();
  }

  /** The board has stepped back (not just waiting on a stamp): keys and clicks end the moment and do nothing else. */
  const sceneShown = () => scene !== null && scene.phase !== 'wait';

  let eatClick = false;
  const stopIt = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  // On the window, in the capture phase, from the board's mount: ahead of main.ts's own keys (the typing skip, the
  // pause menu's Esc, the board's keys) and of every click on the stage.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!sceneShown() || o.paused?.()) return;
      stopIt(e);
      // A key still held from the send repeats: it doesn't end the moment.
      if (!e.repeat) sceneEnd();
    },
    true,
  );
  // The press ends it; its click (and what comes between) lands nowhere, or it would send on the board come back.
  window.addEventListener(
    'pointerdown',
    (e) => {
      eatClick = false;
      if (!sceneShown() || o.paused?.()) return;
      eatClick = true;
      stopIt(e);
      sceneEnd();
    },
    true,
  );
  for (const type of ['mousedown', 'pointerup', 'mouseup'] as const) window.addEventListener(type, (e) => void (eatClick && stopIt(e)), true);
  window.addEventListener(
    'click',
    (e) => {
      if (sceneShown() && !o.paused?.()) {
        stopIt(e);
        sceneEnd();
      } else if (eatClick) stopIt(e);
      eatClick = false;
    },
    true,
  );

  // ── moments ──────────────────────────────────────────────────────────

  /** Whether the run moved since a send (its answer came in): the beat, a clock, the hand, or the run's end. */
  function moved(prev: Active, next: Active | null): boolean {
    if (!next || next.id !== prev.id || next.beat !== prev.beat) return true;
    if ((next.alarm ?? 0) !== (prev.alarm ?? 0) || (next.take?.filled ?? 0) !== (prev.take?.filled ?? 0)) return true;
    const pv = prev.crew!;
    const nv = next.crew!;
    if (nv.clocks.some((c) => c.value !== (pv.clocks.find((y) => y.id === c.id)?.value ?? 0))) return true;
    return nv.hand.some((h) => h.state !== pv.hand.find((y) => y.id === h.id)?.state);
  }

  function land(): void {
    const s = pending!;
    if (giveBack) clearTimeout(giveBack);
    giveBack = null;
    const prev = s.prev;
    const next = a;
    const after = next?.crew?.hand.find((h) => h.id === handOf(s.by));
    const before = prev.crew!.hand.find((h) => h.id === handOf(s.by));
    const harmed = after && before?.state === 'ready' && (after.state === 'hurt' || after.state === 'held') ? after.state : null;
    const takeBefore = prev.take?.filled ?? 0;
    const takeAfter = next?.take?.filled ?? takeBefore;
    const alarmRose = (next?.alarm ?? prev.alarm ?? 0) > (prev.alarm ?? 0);
    const clockRose = next?.crew?.clocks.some((c) => c.value > (prev.crew!.clocks.find((y) => y.id === c.id)?.value ?? 0)) ?? false;
    const word: Stamp = harmed === 'hurt' ? 'HURT' : harmed === 'held' ? 'HELD' : (s.way && priced(s.way)) || alarmRose || clockRose || takeAfter < takeBefore ? 'AT A PRICE' : 'CLEAN';
    const panel = panelOf(s.card);
    if (panel) stamp(panel, word, o.reduced());
    o.cue(harmed ? 'miss' : word === 'CLEAN' ? 'clean' : 'cost');
    if (takeAfter > takeBefore) setTimeout(() => o.cue('take'), 220);
    if (alarmRose || harmed) shake(bw, o.reduced());
    landing = setTimeout(() => {
      landing = null;
      pending = null;
      draw();
      // A beat in another room waited for the stamp's hold: now the board steps back for it.
      sceneOut();
    }, STAMP_HOLD_MS);
    applyHold();
  }

  function send(card: string, by: string): void {
    const x = a;
    const v = view();
    if (!x || !v || busy()) return;
    const c = v.cards.find((y) => y.id === card);
    if (!c) return;
    const way = c.ways.find((w) => byOf(w) === by) ?? null;
    if (!way && !c.throws.includes(by)) return;
    pending = { card, by, way, prev: x };
    picked = null;
    o.cue('deal');
    const panel = panelOf(card);
    // The other panels step back; this one waits for the card.
    for (const q of panels.querySelectorAll<HTMLElement>('.bw-panel')) q.classList.toggle(q === panel ? 'done' : 'off', true);
    for (const q of hand.querySelectorAll<HTMLElement>('.sel, .lift')) q.classList.remove('sel', 'lift');
    const slot = panel?.querySelector<HTMLElement>('.bw-slot');
    slot?.replaceChildren();
    const card0 = by === 'contact' ? null : [...hand.querySelectorAll<HTMLElement>('[data-hand]')].find((n) => n.dataset.hand === handOf(by));
    if (card0 && slot) fly(card0, slot, bw, o.reduced());
    else if (slot) slot.append(whoOf(handOf(by), v.hand, herName()));
    applyHold();
    const go = () => {
      flyTimer = null;
      o.onSend(card, by);
      giveBack = setTimeout(() => {
        giveBack = null;
        if (!pending || landing) return;
        pending = null;
        draw();
        sceneOut();
      }, GIVE_BACK_MS);
    };
    if (o.reduced()) go();
    else flyTimer = setTimeout(go, FLY_MS);
  }

  function playMove(id: string): boolean {
    const h = entry(id);
    if (!h?.move?.can || h.state !== 'ready' || busy()) return false;
    o.cue('ability');
    rise(riseBox, moveFace(h), o.reduced());
    picked = null;
    o.onMove(id);
    return true;
  }

  function playProgram(id: string): boolean {
    const h = entry(id);
    if (!h?.play?.can || h.state !== 'ready' || busy()) return false;
    o.cue(baseProgramId(id.replace(/^p:/, '')) === 'firewall' ? 'firewall' : 'program');
    picked = null;
    o.onMove(id);
    return true;
  }

  function tapHand(id: string): void {
    const h = entry(id);
    if (!h || h.state !== 'ready' || pending || landing) return;
    // A program with no way on this beat is played from its card (FIREWALL, SCRUB).
    if (h.kind === 'program' && !hasWay(id)) return void playProgram(id);
    if (!pickable(h)) return;
    picked = picked === id ? null : id;
    at = 0;
    aimed = false;
    o.cue('tap');
    draw();
  }

  function tapPanel(card: string): void {
    const v = view();
    const c = v?.cards.find((y) => y.id === card);
    if (!c || busy()) return;
    if (c.plain || c.crack) return pick(c);
    const p = pickedCard();
    if (!p) return;
    const f = waysFor(c, p);
    // Two of your ways on one card: the row says which.
    if (f.ways.length === 1) send(card, byOf(f.ways[0]));
    else if (!f.ways.length && f.throws) send(card, p.id);
  }

  function pick(c: BoardCard): void {
    if (busy()) return;
    o.cue('go');
    picked = null;
    o.onPick(c.id);
  }

  // ── GO IN and the debrief ────────────────────────────────────────────

  const atGoIn = () => (goin !== null && a === null && ended === null ? goin : null);
  const atEnd = () => (ended !== null && a === null && !pending && !landing ? ended : null);

  function pickGoIn(item: GoInItem): void {
    const g = atGoIn();
    if (!g || g.sent) return;
    const why = toggle(g.job.offer, g.picks, item);
    if (why) return showNote(why);
    o.cue(item.kind === 'bring' ? 'crew' : 'load');
    draw();
  }

  function goInNow(): void {
    const g = atGoIn();
    // Once sent, nothing more goes until the run comes in or the server refuses (a refusal gives GO IN back).
    if (!g || g.sent) return;
    g.sent = true;
    unwait();
    goInWait = setTimeout(() => {
      goInWait = null;
      if (goin) goin.sent = false;
    }, GIVE_BACK_MS);
    o.cue('go');
    o.onGoIn({ crew: true, people: [...g.picks.people], programs: [...g.picks.programs] });
  }

  function backOut(): void {
    if (!atGoIn()) return;
    goin = null;
    draw();
    o.onBack?.();
  }

  function unwait(): void {
    if (goInWait) clearTimeout(goInWait);
    goInWait = null;
  }

  function closeEnd(): void {
    if (!atEnd()) return;
    for (const t of endCues) clearTimeout(t);
    endCues = [];
    ended = null;
    draw();
    o.onClose();
  }

  function stepGoIn(dir: 1 | -1): void {
    const g = atGoIn()!;
    const items = goInItems(g.job.offer);
    if (!items.length) return;
    const i = g.at ? items.findIndex((x) => x.kind === g.at!.kind && x.id === g.at!.id) : -1;
    // The first ←→ steps on (→ the first, ← the last): nothing is lit before, so nothing reads as the board's pick.
    g.at = items[i < 0 ? (dir > 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length];
    o.cue('tap');
    draw();
  }

  function hideNote(): void {
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = null;
    note.hidden = true;
  }

  /** A line on the board's note strip, for a while. */
  function showNote(text: string): void {
    note.textContent = text.replace(/^\/\/\s*/, '').toUpperCase();
    note.hidden = false;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note.hidden = true), 4000);
  }

  /** A new screen drew: nothing lights on hover until the pointer moves (board.css `.fresh`). */
  function freshen(): void {
    bw.classList.add('fresh');
  }
  bw.addEventListener('mousemove', () => bw.classList.remove('fresh'));

  bw.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (!t) return;
    if (atGoIn()) {
      const bring = t.closest<HTMLElement>('[data-bring]');
      const load = t.closest<HTMLElement>('[data-load]') ?? t.closest<HTMLElement>('[data-unload]');
      if (bring) return pickGoIn({ kind: 'bring', id: bring.dataset.bring! });
      if (load) return pickGoIn({ kind: 'load', id: load.dataset.load ?? load.dataset.unload! });
      if (t.closest('.bw-go')) return goInNow();
      if (t.closest('.bw-back')) return backOut();
      return;
    }
    if (atEnd()) {
      if (t.closest('.bw-close')) closeEnd();
      return;
    }
    if (!isUp()) return;
    const chip = t.closest<HTMLElement>('.bw-play');
    const handCard = t.closest<HTMLElement>('[data-hand]');
    const mv = t.closest<HTMLElement>('.bw-ab');
    const offer = t.closest<HTMLElement>('.bw-offer');
    const row = t.closest<HTMLElement>('.bw-way');
    const panel = t.closest<HTMLElement>('.bw-panel');
    if (chip && handCard) return void playProgram(handCard.dataset.hand!);
    if (mv) return void playMove(mv.dataset.move!);
    if (handCard) return tapHand(handCard.dataset.hand!);
    if (offer) return send(offer.dataset.card!, 'contact');
    if (row && panel) return send(panel.dataset.card!, row.dataset.by!);
    if (panel) return tapPanel(panel.dataset.card!);
  });

  return {
    root: shell.root,
    update(state, u) {
      a = state.active?.crew ? state.active : null;
      room = u.contact;
      // A run on the board: it takes GO IN's place (the run GO IN started), and a debrief still up goes.
      if (a) {
        lastRun = a.id;
        unwait();
        goin = null;
        ended = null;
      }
      // A landing is playing: it draws the latest state when it's done.
      if (landing) return;
      // GO IN or the debrief already drawn: a state with no run (her closing turn, a clock tick) leaves it as it is,
      // so the pay doesn't count up again and nothing under the pointer is rebuilt.
      if (!a && !pending && bw.dataset.mode === (ended ? 'end' : goin ? 'goin' : '-')) return;
      if (pending) {
        // Still in flight, or nothing came of it yet: the board waits as it is.
        if (flyTimer || !moved(pending.prev, a)) return;
        return land();
      }
      draw();
    },
    up: () => isUp() || landing !== null || goin !== null || ended !== null,
    goIn(job) {
      const same = goin?.job.id === job.id ? goin : null;
      goin = { job, picks: same ? keepPicks(job.offer, same.picks) : { people: [], programs: [] }, at: same?.at ?? null, sent: same?.sent ?? false };
      // A cursor on someone gone from the offer comes off.
      if (goin.at && !goInItems(job.offer).some((x) => x.kind === goin!.at!.kind && x.id === goin!.at!.id)) goin.at = null;
      ended = null;
      if (!a && !pending && !landing) draw();
    },
    leave() {
      if (!goin) return;
      goin = null;
      if (!a && !pending && !landing) draw();
    },
    end(d, e) {
      // The run is over: whatever lands next is drawn as the debrief.
      a = null;
      goin = null;
      ended = { d, title: e.title, cued: false };
      if (!pending && !landing) draw();
    },
    ran: () => lastRun,
    sceneMoment(m) {
      // Only on a run already on screen, or the run GO IN is going into; never at the debrief.
      const going = atGoIn()?.sent === true;
      if (ended || (bw.dataset.drawn !== 'run' && !going)) return null;
      // A moment already under way (two rooms in quick succession): the board is back first.
      sceneEnd();
      let open!: () => void;
      const out = new Promise<void>((r) => (open = r));
      const s: NonNullable<typeof scene> = { phase: 'wait', name: m.name, place: null, open, timer: null, guard: setTimeout(sceneEnd, SCENE_GIVE_UP_MS) };
      scene = s;
      void m.place().then(
        (p) => {
          s.place = p;
          if (scene === s && s.phase === 'hold') sceneBand(s);
        },
        () => {},
      );
      applyHold();
      sceneOut();
      return { out, landed: () => sceneLanded(s) };
    },
    inScene: () => scene !== null,
    sceneDone: () => (scene ? new Promise<void>((r) => sceneWaiters.push(r)) : Promise.resolve()),
    giveBack() {
      unwait();
      if (goin) goin.sent = false;
    },
    hold(name) {
      heldBy = name;
      applyHold();
    },
    say(text) {
      // Typed in at the box settings' speed and effect, her *actions* in italics (say-line.ts).
      sayLine.say(text);
    },
    finishTyping: () => sayLine.finish(),
    setModel(label) {
      modelLabel = label;
      drawModel();
    },
    aimed: () => (atGoIn() ? atGoIn()!.at !== null : !atEnd() && a !== null && aimed),
    setTextSpeed: (scale) => sayLine.setTextSpeed(scale),
    setTextEffect: (e) => sayLine.setTextEffect(e),
    refuse(text) {
      showNote(text);
      // GO IN refused (someone isn't ready, no slot): it can go again.
      unwait();
      if (goin) goin.sent = false;
      // A refused send never lands: the board comes back now, not after the wait.
      if (pending && !landing && !flyTimer) {
        if (giveBack) clearTimeout(giveBack);
        giveBack = null;
        pending = null;
        draw();
        sceneOut();
      }
    },
    key(k) {
      // The board stepped back for a room: any key ends that, and does nothing else.
      if (sceneShown()) {
        sceneEnd();
        return true;
      }
      // The ending is in, a send's stamp still holding: every key waits for the debrief (Esc doesn't pause past it).
      if (ended && !a && (pending || landing)) return true;
      if (atEnd()) {
        if (k === 'Enter' || k === 'Escape') closeEnd();
        return k === 'Enter' || k === 'Escape' || k.startsWith('Arrow');
      }
      const g = atGoIn();
      if (g) {
        if (k === 'Enter') goInNow();
        else if (k === 'Escape') backOut();
        else if (k === 'ArrowLeft' || k === 'ArrowRight') stepGoIn(k === 'ArrowRight' ? 1 : -1);
        else if (k === ' ' || k === 'Spacebar') {
          if (g.at) pickGoIn(g.at);
        } else return k === 'ArrowUp' || k === 'ArrowDown';
        return true;
      }
      const v = view();
      if (!v || !a) return false;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const list = v.hand.filter(pickable);
        if (!list.length || pending || landing) return true;
        const i = list.findIndex((h) => h.id === picked);
        const n = i < 0 ? (k === 'ArrowRight' ? 0 : list.length - 1) : (i + (k === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
        picked = list[n].id;
        at = 0;
        aimed = false;
        o.cue('tap');
        draw();
        return true;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        const ts = targets(v.cards, pickedCard());
        if (ts.length) {
          // The first ↑↓ aims (↓ the first target, ↑ the last); then they step.
          at = !aimed ? (k === 'ArrowDown' ? 0 : ts.length - 1) : (Math.min(at, ts.length - 1) + (k === 'ArrowDown' ? 1 : ts.length - 1)) % ts.length;
          aimed = true;
          drawPanels(v);
        }
        return true;
      }
      if (k === 'Enter') {
        const ts = targets(v.cards, pickedCard());
        const t = ts[Math.min(at, ts.length - 1)];
        // Nothing goes until ↑↓ has aimed at it. Enter is the board's either way: nothing behind it takes it.
        if (!aimed || !t || t.act === 'none' || busy()) return true;
        if (t.act === 'pick') pick(v.cards.find((c) => c.id === t.card)!);
        else send(t.card, t.by);
        return true;
      }
      if (k === 'm' || k === 'M') {
        const p = pickedCard();
        if (!p) return false;
        return p.kind === 'recruit' ? playMove(p.id) : p.kind === 'program' ? playProgram(p.id) : false;
      }
      return false;
    },
  };
}
