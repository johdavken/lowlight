// The room saved on each SillyTavern message (and each swipe of it), so swipes, deletes and reopening a chat put the
// room back as it was. Pure: the extension (extension/room-tools.js) reads and writes SillyTavern's chat with these.
import type { Atmosphere, LightDef } from '../../shared/types';

/** The room as it was after a message: its folder, the mood last applied (or none), and its state. */
export interface RoomStamp {
  room: string;
  mood: string | null;
  atmosphere: Atmosphere;
  lights: LightDef[];
}

/** The parts of a SillyTavern chat message these read and write. */
export type StMessage = {
  is_user?: boolean;
  extra?: Record<string, unknown>;
  swipe_id?: number;
  swipe_info?: { extra?: Record<string, unknown> }[];
};

const KEY = 'lowlight';

/** The message's stamp: its current swipe's own, else the message's, else null. */
export function stampOf(msg: StMessage): RoomStamp | null {
  const swipe = msg.swipe_info?.[msg.swipe_id ?? 0]?.extra?.[KEY];
  return ((swipe ?? msg.extra?.[KEY]) as RoomStamp | undefined) ?? null;
}

/** A copy of `msg` stamped with `stamp`: on the message, and on its current swipe when it has swipes. */
export function withStamp(msg: StMessage, stamp: RoomStamp): StMessage {
  const out: StMessage = { ...msg, extra: { ...msg.extra, [KEY]: stamp } };
  if (msg.swipe_info) {
    const i = msg.swipe_id ?? 0;
    out.swipe_info = msg.swipe_info.map((s, j) => (j === i ? { ...s, extra: { ...s.extra, [KEY]: stamp } } : s));
  }
  return out;
}

/** The room a chat should show: its newest stamp; with none, the character's home room; with neither, null. */
export function roomFromChat(chat: StMessage[], home: string | null): RoomStamp | { room: string } | null {
  for (let i = chat.length - 1; i >= 0; i--) {
    const s = stampOf(chat[i]);
    if (s) return s;
  }
  return home ? { room: home } : null;
}
