// Her room tools in SillyTavern (spec 2026-10-23 §4): apply_mood, set_atmosphere, set_light and go_to through
// SillyTavern's tool calling; her [room: …] line before each reply; the room saved on every message and swipe, and put
// back on a swipe, delete, edit or reopening a chat. The checks and texts are the bundle's (room-tools.ts, room-stamp.ts).
import { ROOM_TOOLS, appliedText, checkRoomTool, isRoomToolMessage, preToolMessage, roomFromChat, roomLine, stampOf, withStamp } from './lowlight-room.js';

const LINE_KEY = 'lowlight-room';
const RULES_KEY = 'lowlight-room-rules';
/** A short version of Lowlight's room instructions (server/src/instructions.ts ROOM_INSTRUCTIONS). */
const ROOM_RULES =
  "The [room: …] line before each of your replies is the room you're in right now: the place, the atmosphere, each light as its id plus \"label\", the room's moods, your other places and the ways out. It is the room, not something the user typed. Change the room whenever it suits the moment — the mood shifts, the light is wrong, the weather turns — without being asked and without narrating every adjustment. When your reply takes you both to one of your places or through a way out, call go_to with its id from the [room: …] line in that same turn, so the room is where the story is. Your tools are not part of the story: never mention them in your reply, and don't name a change (\"quiet mood\", \"lamp low\") — show it in the scene: what the light does, what the rain does.";

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
    });
  }
  let enabled = false;
  /** SillyTavern sends tools only on Chat Completion with function calling on (off by default). */
  const canCall = () => Boolean(ctx().isToolCallingSupported?.());
  /** Her room line, and her room rules while her tools can actually be called (set together: SillyTavern clears
   * extension prompts when a chat opens). Without tools the rules would have her write calls out as prose. */
  const refreshLine = () => {
    const c = ctx();
    c.setExtensionPrompt(LINE_KEY, line(), 1, 0, false, 0);
    c.setExtensionPrompt(RULES_KEY, enabled && canCall() ? ROOM_RULES : '', 2, 0, false, 0);
  };

  /** The room now, to save on a message. */
  const stampNow = () => {
    const state = room.state();
    return state ? { room: current(), mood: room.moodName(), atmosphere: state.atmosphere, lights: state.lights } : null;
  };
  /** Saves the room on message `i` (default: the newest), once any restore in flight has landed. */
  async function stamp(i) {
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
  const restoreFromChat = () => restore(roomFromChat(ctx().chat, home()));

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
          const checked = checkRoomTool(t.name, args, { scene, places: placesOf(speaker()), exits: exitsHere().map((e) => e.folder), rooms });
          if (!checked.ok) return checked.result;
          const a = checked.action;
          if (a.kind === 'mood') room.mood(a.name, a.seconds);
          else if (a.kind === 'atmosphere') room.setAtmosphere(a.patch, a.seconds);
          else if (a.kind === 'light') room.setLight(a.id, a.patch, a.seconds);
          else if (a.kind === 'go') await goTo(a.folder);
          await stamp();
          refreshLine();
          return appliedText(line());
        },
        formatMessage: () => '',
        shouldRegister: () => enabled,
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
    const c = ctx();
    const at = typeof i === 'number' ? i : c.chat.length - 1;
    const msg = c.chat[at];
    // A take of its own: its room. A new take being written: the room as it was before this message.
    const own = msg?.swipe_info?.[msg.swipe_id ?? 0]?.extra?.lowlight;
    return restore(own ?? roomFromChat(c.chat.slice(0, at), home()));
  });
  // Function calling may have been switched on or off since: her rules follow it before each generation.
  eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, () => refreshLine());

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

  return { setEnabled, refreshLine, stamp, line, isEnabled: () => enabled, canCall, stampOf };
}
