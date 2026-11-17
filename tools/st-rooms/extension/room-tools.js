// Her room tools in SillyTavern (spec 2026-10-23 §4): apply_mood, set_atmosphere, set_light and go_to through
// SillyTavern's tool calling; her [room: …] line before each reply; the room saved on every message and swipe, and put
// back on a swipe, delete, edit or reopening a chat. The checks and texts are the bundle's (room-tools.ts, room-stamp.ts).
import { ROOM_TOOLS, appliedText, arrivalGap, beatLine, checkRoomTool, echoLine, isRoomToolMessage, preToolMessage, propWords, roomDetail, roomDetailLine, roomFromChat, roomLine, stampOf, withStamp } from './lowlight-room.js';
import { timestampToMoment } from '../../../utils.js';

const LINE_KEY = 'lowlight-room';
const RULES_KEY = 'lowlight-room-rules';
/** One of the room's details now and then (shared/room-details.ts), and what she keeps writing (the game's echo line). */
const DETAIL_KEY = 'lowlight-room-detail';
const ECHO_KEY = 'lowlight-echo';
/** The game's beat line (about 80 words, your part yours) and how long you were away, on her ordinary turns. */
const BEAT_KEY = 'lowlight-beat';
const ARRIVAL_KEY = 'lowlight-arrival';
/** Her one-time travel or greeting note (index.js): the game gives those turns no beat line. */
const TRAVEL_KEY = 'lowlight-travel';
const TURN_KEYS = [DETAIL_KEY, ECHO_KEY, BEAT_KEY, ARRIVAL_KEY];
/** Generations not written as her: your line written for you, or another extension's quiet call. */
const NOT_HERS = new Set(['impersonate', 'quiet']);
/** Her replies looked at for the echo line, newest last (server/src/echoes.ts looks at the last four). */
const ECHO_REPLIES = 4;
/** What weather she was last shown in this chat, in its metadata: the line names it only when it's news. */
const SEEN_KEY = 'lowlight_seen';
/** A short version of Lowlight's room instructions (server/src/instructions.ts ROOM_INSTRUCTIONS). */
const ROOM_RULES =
  "The [room: …] line before each of your replies is the room you're in right now: the place, the atmosphere, the lights as two groups (inside, the room's own, and outside, the city through the windows), the room's moods, your other places and the ways out. It is the room, not something the user typed. To change the light, set a whole group (inside, mostly) or apply a mood; one lamp alone barely shows. Change the room whenever it suits the moment — the mood shifts, the light is wrong, the weather turns — without being asked and without narrating every adjustment. When your reply takes you both to one of your places or through a way out, call go_to with its id from the [room: …] line in that same turn, so the room is where the story is. Your tools are not part of the story: never mention them in your reply, and don't name a change (\"quiet mood\", \"lamp low\") — show it in the scene: what the light does, what the rain does.";

/**
 * @param {{ room: any, cast: any, rooms: string[], meta: Record<string, { name: string, district: string | null }>, current: () => string, goTo: (folder: string) => Promise<void>, idle: () => Promise<void> }} deps
 */
export function mountRoomTools({ room, cast, rooms, meta, current, goTo, idle }) {
  const ctx = () => SillyTavern.getContext();
  const byName = new Map((cast.characters ?? []).map((c) => [c.name, c]));
  /** The character speaking (none in a group chat or on the welcome screen). */
  const speaker = () => {
    const c = ctx();
    if (c.groupId || c.characterId === undefined) return null;
    return byName.get(c.characters[c.characterId]?.name) ?? null;
  };
  /** A Lowlight chat (one of the cast, alone): everywhere else her room line, rules, tools and saved rooms stay out. */
  const ours = () => speaker() !== null;
  const placesOf = (who) => (who ? (who.places ?? (who.home ? [who.home] : [])) : []);
  const exitsHere = () => (room.scene()?.exits ?? []).map((e) => ({ folder: String(e.to).split('/').pop(), way: e.way }));

  function line() {
    const scene = room.scene();
    const state = room.state();
    if (!scene || !state) return '';
    const here = current();
    const exits = exitsHere();
    const exitSet = new Set(exits.map((e) => e.folder));
    const places = placesOf(speaker()).filter((f) => f !== here && !exitSet.has(f) && rooms.includes(f));
    return roomLine({
      scene: { ...scene, id: here, name: meta[here]?.name ?? scene.name },
      atmosphere: state.atmosphere,
      lights: state.lights,
      district: meta[here]?.district ?? undefined,
      places: places.map((f) => ({ id: f, name: meta[f]?.name ?? f })),
      ways: exits.filter((e) => rooms.includes(e.folder)).map((e) => ({ id: e.folder, name: meta[e.folder]?.name ?? e.folder, way: e.way })),
      groups: true,
      painted: scene.lights,
      weather: weatherNews,
    });
  }
  /** Whether this turn's line names the weather: decided once per generation (turnLines), kept for the refreshes between. */
  let weatherNews = true;

  /** Her own replies in this chat, oldest first: not yours, not system lines, not tool calls. */
  const herReplies = (chat) => chat.filter((m) => !m.is_user && !m.is_system && !m.extra?.tool_invocations && typeof m.mes === 'string' && m.mes.trim() !== '');

  const clearTurn = () => {
    const c = ctx();
    for (const k of TURN_KEYS) c.setExtensionPrompt(k, '', 1, 0, false, 0);
  };
  /** A message's time in ms (SillyTavern's send_date is a number or a humanized date), NaN when it doesn't read. */
  const msOf = (m) => (m?.send_date ? timestampToMoment(m.send_date).valueOf() : NaN);

  /**
   * Before each generation: whether the weather is news (a new chat, a new room, the weather changed since she was
   * last shown it) and one of the room's details every few of her replies; then the lines that hang on your message
   * (yourLines). The detail turn counts her replies, so a swipe or a rewind gives the same one again.
   */
  function turnLines(type) {
    const c = ctx();
    if (!ours() || NOT_HERS.has(type)) return clearTurn();
    const scene = room.scene();
    const state = room.state();
    const here = current();
    if (state) {
      const a = state.atmosphere;
      const now = `${here}|${a.weather === 'none' ? 'clear' : `${a.weather} ${Math.round(a.weatherLevel * 100)}`}`;
      const md = c.chatMetadata ?? {};
      weatherNews = md[SEEN_KEY] !== now;
      if (weatherNews && c.chatMetadata) {
        c.chatMetadata[SEEN_KEY] = now;
        c.saveMetadata?.();
      }
    }
    const hers = herReplies(c.chat).map((m) => m.mes);
    const details = scene?.details ?? [];
    const d = details.length > 0 ? roomDetail(details, `${c.chatId ?? ''}:${here}`, hers.length) : null;
    c.setExtensionPrompt(DETAIL_KEY, d ? roomDetailLine(d) : '', 1, 0, false, 0);
    yourLines();
  }
  /** The generation running now is hers (yourLines runs again once your typed message lands, after turnLines). */
  let hersNow = false;
  /**
   * What hangs on your newest message: what she keeps writing (the echo line, with the room's props), the beat line,
   * and how long you were away before it. SillyTavern adds a typed message to the chat after GENERATION_AFTER_COMMANDS,
   * so this runs again on MESSAGE_SENT. All are worked out from the chat, so a swipe gets the same lines.
   */
  function yourLines() {
    const c = ctx();
    if (!ours() || !hersNow) return;
    const scene = room.scene();
    const state = room.state();
    const hers = herReplies(c.chat).map((m) => m.mes);
    const users = c.chat.filter((m) => m.is_user && typeof m.mes === 'string').map((m) => m.mes);
    const props = state && scene ? propWords(scene.lights.map((l) => l.label), state.atmosphere.weather) : [];
    c.setExtensionPrompt(ECHO_KEY, echoLine(hers.slice(-ECHO_REPLIES), users.slice(-2), props) ?? '', 1, 0, false, 0);
    // Neither on her greeting (nothing from you yet) nor a travel turn: the game gives those their own lines.
    const travelling = Boolean(c.extensionPrompts?.[TRAVEL_KEY]?.value);
    // Your newest message and the line before it: the gap between them, whatever she has written since.
    const at = c.chat.findLastIndex((m) => m.is_user && !m.is_system);
    const prev = at > 0 ? c.chat.slice(0, at).findLast((m) => !m.is_system) : undefined;
    const gap = at >= 0 && prev && !travelling ? arrivalGap(c.name1, msOf(prev), msOf(c.chat[at])) : null;
    c.setExtensionPrompt(ARRIVAL_KEY, gap ?? '', 1, 0, false, 0);
    c.setExtensionPrompt(BEAT_KEY, at >= 0 && !travelling ? beatLine(c.name1) : '', 1, 0, false, 0);
  }
  let enabled = false;
  /** SillyTavern sends tools only on Chat Completion with function calling on (off by default). */
  const canCall = () => Boolean(ctx().isToolCallingSupported?.());
  /** Her room line, and her room rules while her tools can actually be called (set together: SillyTavern clears
   * extension prompts when a chat opens). Without tools the rules would have her write calls out as prose. */
  const refreshLine = () => {
    const c = ctx();
    c.setExtensionPrompt(LINE_KEY, ours() ? line() : '', 1, 0, false, 0);
    c.setExtensionPrompt(RULES_KEY, ours() && enabled && canCall() ? ROOM_RULES : '', 2, 0, false, 0);
  };

  /** The room now, to save on a message. */
  const stampNow = () => {
    const state = room.state();
    return state ? { room: current(), mood: room.moodName(), atmosphere: state.atmosphere, lights: state.lights } : null;
  };
  /** Saves the room on message `i` (default: the newest), once any restore in flight has landed. */
  async function stamp(i) {
    if (!ours()) return;
    await restoring;
    const c = ctx();
    const at = i ?? c.chat.length - 1;
    const msg = c.chat[at];
    const s = stampNow();
    if (!msg || !s) return;
    Object.assign(msg, withStamp(msg, s));
    c.saveChat?.();
  }

  /** The newest restore's token: an older one still waiting on its fade gives way (fast swipes, a tool mid-fade). */
  let restoreToken = 0;
  /** The restore in flight, which stamps wait for, so a message is never saved with a room still fading out. */
  let restoring = Promise.resolve();
  /** Puts a saved room back: its room first (no fade when it's the same), then its lights, atmosphere and mood. A chat
   * with nothing saved (only its home room) starts from the room as painted, not whatever the last chat left. */
  function restore(saved) {
    const token = ++restoreToken;
    // In order: each restore starts from the room the one before it left, and a superseded one does nothing.
    restoring = restoring.then(async () => {
      // Room changes already queued (the select's backdrop, the map) land first: then `current()` is the truth.
      await idle();
      if (token !== restoreToken) return;
      if (!saved) return refreshLine();
      if (saved.room && saved.room !== current() && rooms.includes(saved.room)) await goTo(saved.room);
      if (token !== restoreToken || saved.room !== current()) return;
      if ('atmosphere' in saved) room.apply(saved, 0.6);
      else room.mood('default', 0.6);
      refreshLine();
    }).catch((e) => console.warn('[lowlight] restoring the room failed', e));
    return restoring;
  }
  const home = () => speaker()?.home ?? null;
  const restoreFromChat = () => (ours() ? restore(roomFromChat(ctx().chat, home())) : restoring);

  // ── the tools ──
  function register() {
    for (const t of ROOM_TOOLS) {
      ctx().registerFunctionTool({
        name: t.name,
        displayName: t.name.replace('_', ' '),
        description: t.description,
        parameters: t.parameters,
        action: async (args) => {
          await idle();
          const scene = room.scene();
          if (!scene) return 'no room is loaded';
          const checked = checkRoomTool(t.name, args, { scene, places: placesOf(speaker()), exits: exitsHere().map((e) => e.folder), rooms, lights: room.state()?.lights });
          if (!checked.ok) return checked.result;
          const a = checked.action;
          if (a.kind === 'mood') room.mood(a.name, a.seconds);
          else if (a.kind === 'atmosphere') room.setAtmosphere(a.patch, a.seconds);
          else if (a.kind === 'light') room.setLight(a.id, a.patch, a.seconds);
          else if (a.kind === 'lights') for (const x of a.set) room.setLight(x.id, x.patch, a.seconds);
          else if (a.kind === 'go') await goTo(a.folder);
          await stamp();
          refreshLine();
          return appliedText(line());
        },
        formatMessage: () => '',
        shouldRegister: () => enabled && ours(),
      });
    }
  }
  function setEnabled(on) {
    enabled = on;
    const c = ctx();
    if (on) register();
    else for (const t of ROOM_TOOLS) c.unregisterFunctionTool?.(t.name);
    refreshLine();
  }

  // ── the room on every message (handlers return their promise: SillyTavern awaits listeners, so a swipe is
  // generated, and a greeting stamped, only once the room is back) ──
  const { eventSource, eventTypes } = ctx();
  eventSource.on(eventTypes.MESSAGE_SENT, async (i) => { await stamp(i); refreshLine(); });
  eventSource.on(eventTypes.MESSAGE_RECEIVED, async (i, type) => {
    const msg = ctx().chat[i];
    // A greeting is "received" on every open of a one-message chat: it keeps the room it was first saved with.
    if (type === 'first_message' && msg && stampOf(msg)) return;
    await stamp(i);
    refreshLine();
  });
  eventSource.on(eventTypes.CHAT_CHANGED, () => restoreFromChat());
  eventSource.on(eventTypes.MESSAGE_DELETED, () => restoreFromChat());
  eventSource.on(eventTypes.MESSAGE_EDITED, () => restoreFromChat());
  eventSource.on(eventTypes.MESSAGE_SWIPED, (i) => {
    if (!ours()) return;
    const c = ctx();
    const at = typeof i === 'number' ? i : c.chat.length - 1;
    const msg = c.chat[at];
    // A take of its own: its room. A new take being written: the room as it was before this message.
    const own = msg?.swipe_info?.[msg.swipe_id ?? 0]?.extra?.lowlight;
    return restore(own ?? roomFromChat(c.chat.slice(0, at), home()));
  });
  // Function calling may have been switched on or off since: her rules follow it before each generation.
  // Before each generation: the weather, a detail and the echo line for this turn, then the line with them.
  // A dry run (SillyTavern counting a prompt's tokens) changes nothing: it would spend the weather's news.
  eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, (type, _params, dryRun) => {
    if (dryRun) return;
    hersNow = !NOT_HERS.has(type);
    // A new take of her travel or greeting reply: its one-time note again (index.js keeps it on the reply).
    const last = ctx().chat?.at(-1);
    if (type === 'swipe' && ours() && last && !last.is_user && last.extra?.lowlight_note) ctx().setExtensionPrompt(TRAVEL_KEY, last.extra.lowlight_note, 1, 0, false, 0);
    turnLines(type);
    refreshLine();
  });
  eventSource.on(eventTypes.MESSAGE_SENT, () => yourLines());
  eventSource.on(eventTypes.CHAT_CHANGED, () => { weatherNews = true; hersNow = false; clearTurn(); });

  // Her tool calls are hidden in the Lowlight look (style.css: .ll-room-tool), only when every call in the message is
  // hers, and never when it's the newest message (a follow-up reply that failed would otherwise leave nothing to see).
  const markToolMessages = () => {
    const chat = ctx().chat;
    for (const el of document.querySelectorAll('#chat .mes.toolCall')) {
      el.classList.toggle('ll-room-tool', isRoomToolMessage(chat[Number(el.getAttribute('mesid'))]));
    }
    for (const el of document.querySelectorAll('#chat .mes')) {
      el.classList.toggle('ll-pre-tool', Boolean(chat[Number(el.getAttribute('mesid'))]?.extra?.lowlight_pre_tool));
    }
  };
  // What she sent along with a tool call (nothing, or a first go at the beat SillyTavern's follow-up then writes again)
  // is superseded: hidden from the prompt the way SillyTavern's own hide does (is_system) and from view, its saved room
  // kept. The live check saw both on GLM: empty messages, and the same beat twice.
  const supersedePreTool = () => {
    if (!ours()) return;
    const c = ctx();
    let changed = false;
    for (let i = 0; i < c.chat.length; i++) {
      const at = preToolMessage(c.chat, i);
      if (at === null) continue;
      const msg = c.chat[at];
      msg.is_system = true;
      msg.extra = { ...msg.extra, lowlight_pre_tool: true };
      changed = true;
    }
    if (changed) c.saveChat?.();
    markToolMessages();
  };
  if (eventTypes.TOOL_CALLS_RENDERED) eventSource.on(eventTypes.TOOL_CALLS_RENDERED, () => supersedePreTool());
  for (const ev of [eventTypes.TOOL_CALLS_RENDERED, eventTypes.CHAT_CHANGED, eventTypes.CHARACTER_MESSAGE_RENDERED, eventTypes.MESSAGE_DELETED]) {
    if (ev) eventSource.on(ev, () => setTimeout(markToolMessages, 0));
  }

  /** Resolves once the room restores queued so far (a chat opened, a message deleted) have landed. */
  const settled = () => restoring;
  /** This turn is one of her ordinary ones (the beat line is on): the game's Habits line rides only those. */
  const plainTurn = () => Boolean(ctx().extensionPrompts?.[BEAT_KEY]?.value);
  return { setEnabled, refreshLine, stamp, line, isEnabled: () => enabled, canCall, stampOf, settled, ours, speaker, plainTurn };
}
