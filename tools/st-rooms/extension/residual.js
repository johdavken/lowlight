// Her Residual (spec 2026-10-29-st-residual-design): after each of her replies in a Lowlight chat, one quiet call on
// the chat's own connection keeps her notes, a recap every RECAP_EVERY replies, and the lights she forgot. What it
// changed is saved on her message (ledger.ts), so the ledger is always the chat folded from the top.
import { applyAnswer, changeOf, exchangesFor, isRecapRun, journalLineOf, ledgerOf, parseResidualAnswer, residualMessages, takeOf, withChange } from './lowlight-room.js';

const LEDGER_KEY = 'lowlight-ledger';
const ON_KEY = 'lowlight-residual';
/** Her answer's cap: SillyTavern can't turn thinking off for one call, so a thinking model needs room before it answers. */
const MAX_TOKENS = { turn: 1500, recap: 1800 };
/** How many of the newest lines her notes' keywords are looked for in. */
const RECENT = 5;

export function mountResidual({ room, roomTools }) {
  const ctx = () => SillyTavern.getContext();
  let on = true;
  try {
    on = localStorage.getItem(ON_KEY) !== '0';
  } catch {}
  /** The last run's outcome, for SYS → RESIDUAL's dot. */
  let last = null;
  let complete = (messages, maxTokens) => ctx().generateRaw({ prompt: messages, responseLength: maxTokens });

  const ledger = (upTo) => {
    const chat = ctx().chat ?? [];
    return ledgerOf(upTo === undefined ? chat : chat.slice(0, upTo));
  };

  /** Her journal and recap lines before each reply, in Lowlight chats only. */
  function refresh() {
    const c = ctx();
    let text = '';
    if (roomTools.ours()) {
      const l = ledger();
      const recent = (c.chat ?? []).filter((m) => !m.is_system && m.mes).slice(-RECENT).reverse().map((m) => m.mes);
      text = [journalLineOf(l.notes, recent), l.recap ? `[recap: ${l.recap}]` : null].filter(Boolean).join('\n');
    }
    c.setExtensionPrompt(LEDGER_KEY, text, 1, 0, false, 0);
  }

  /** What a run is for: the chat, the message, its take and text. Anything changed by the time it answers drops it. */
  const tokenOf = (at) => {
    const c = ctx();
    const msg = c.chat[at];
    return msg ? `${c.getCurrentChatId?.()}·${at}·${msg.swipe_id ?? 0}·${msg.mes}` : null;
  };
  /** Her newest reply, if the newest message is one: not yours, a hidden one, a narrator line or someone else's. */
  const herNewest = () => {
    const c = ctx();
    const at = (c.chat?.length ?? 0) - 1;
    const msg = c.chat?.[at];
    const who = roomTools.speaker();
    if (!msg || !who || msg.is_user || msg.is_system || msg.extra?.type === 'narrator' || msg.name !== who.name) return null;
    return at;
  };
  /** A model that thinks out loud in its text leaves that before the JSON: only what comes after the last </think>. */
  const answerText = (raw) => {
    const text = String(raw ?? '');
    const end = text.lastIndexOf('</think>');
    return (end >= 0 ? text.slice(end + '</think>'.length) : text).trim();
  };

  async function run(at, token) {
    const c = ctx();
    const msg = c.chat[at];
    const who = roomTools.speaker();
    // Still her newest reply, in the chat it was queued in, and not run yet.
    if (!msg || !who || tokenOf(at) !== token || herNewest() !== at || changeOf(msg)) return;
    const l = ledger(at);
    const recapRun = isRecapRun(c.chat, at);
    const scene = room.scene();
    const take = takeOf(msg);
    const messages = residualMessages({
      kind: recapRun ? 'recap' : 'turn',
      self: { name: who.name, pronoun: who.pronoun ?? 'they' },
      player: { id: 'you', name: c.name1 },
      roomLine: roomTools.line(),
      standing: false,
      jobs: false,
      nights: false,
      notes: l.notes,
      exchanges: exchangesFor(c.chat, at),
      recap: l.recap,
      page: null,
    });
    let result;
    try {
      const text = answerText(await complete(messages, recapRun ? MAX_TOKENS.recap : MAX_TOKENS.turn));
      if (!text) result = { ok: false, why: 'no answer' };
      else {
        const parsed = parseResidualAnswer(text);
        result = parsed.answer ? { answer: parsed.answer } : { ok: false, why: 'not JSON' };
      }
    } catch (e) {
      const why = String(e?.message ?? e);
      result = { ok: false, why: /no message generated/i.test(why) ? 'no answer' : why };
    }
    // Left the chat, swiped, deleted or edited while it ran: this answer is for a message that's gone.
    if (tokenOf(at) !== token) return;
    const lightIds = new Set((scene?.lights ?? []).map((x) => x.id));
    const change = result.answer
      ? applyAnswer(l, result.answer, lightIds, [who.name, c.name1], { recap: recapRun })
      : { notes: [], lights: [], run: result };
    change.take = take;
    last = change.run;
    // Her lights only while the room is the one it read and this is still the newest message (its room is the one saved).
    if (room.scene() !== scene || herNewest() !== at) change.lights = [];
    if (change.lights.length > 0) {
      for (const x of change.lights) room.setLight(x.id, { intensity: x.intensity });
      await roomTools.stamp(at);
    }
    Object.assign(c.chat[at], withChange(c.chat[at], change));
    c.saveChat?.();
    refresh();
  }

  // One run at a time, in order: each reads the ledger the one before it left.
  let queue = Promise.resolve();
  const { eventSource, eventTypes } = ctx();
  /** Queues a run for her newest reply, as the chat is now (the chat and take are fixed here, not when it starts). */
  const schedule = () => {
    if (!on || !roomTools.ours()) return;
    const at = herNewest();
    if (at === null || changeOf(ctx().chat[at])) return;
    const token = tokenOf(at);
    queue = queue
      .then(() => roomTools.settled())
      .then(() => run(at, token))
      .catch((e) => console.warn('[lowlight] the Residual failed', e));
  };
  // Once a whole generation has ended (her tool calls and the reply after them included), her newest reply; /sendas
  // makes no generation, so its message runs as it arrives.
  eventSource.on(eventTypes.GENERATION_ENDED, () => schedule());
  eventSource.on(eventTypes.MESSAGE_RECEIVED, (_i, type) => {
    if (type === 'command') schedule();
  });
  for (const ev of [eventTypes.MESSAGE_SENT, eventTypes.CHAT_CHANGED, eventTypes.MESSAGE_DELETED, eventTypes.MESSAGE_SWIPED, eventTypes.MESSAGE_EDITED, eventTypes.GENERATION_AFTER_COMMANDS]) {
    if (ev) eventSource.on(ev, () => refresh());
  }

  const api = {
    isOn: () => on,
    set(v) {
      on = v;
      try {
        localStorage.setItem(ON_KEY, v ? '1' : '0');
      } catch {}
    },
    status: () => last,
    ledger: () => ledger(),
    refresh,
    /** Tests: stand in for the model. `fn(messages, maxTokens)` → the answer's text. */
    setComplete(fn) {
      complete = fn;
    },
  };
  window.lowlightResidual = api;
  return api;
}
