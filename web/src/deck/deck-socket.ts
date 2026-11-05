/** The deck's socket (spec 2026-10-23 §5): /ws/deck, never a room's, reconnecting with the room socket's backoff. */
import type { DeckClientEvent, DeckServerEvent } from '../../../shared/types';

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;

export interface DeckSocket {
  send(e: DeckClientEvent): void;
  /** No more reconnects; the open socket closes (the in-game pane put away: in-game texts spec §3). */
  close(): void;
}
export type ConnectDeck = (onEvent: (e: DeckServerEvent) => void, onStatus: (open: boolean) => void) => DeckSocket;

export const connectDeck: ConnectDeck = (onEvent, onStatus) => {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let backoff = BACKOFF_MIN_MS;
  const later = () => {
    if (closed) return;
    const delay = backoff;
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
    retry = setTimeout(connect, delay);
  };
  async function connect(): Promise<void> {
    let token: string;
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error(`bootstrap ${res.status}`);
      token = ((await res.json()) as { token: string }).token;
    } catch {
      later();
      return;
    }
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const sock = new WebSocket(`${proto}//${location.host}/ws/deck?token=${encodeURIComponent(token)}`);
    ws = sock;
    sock.onopen = () => {
      backoff = BACKOFF_MIN_MS;
      onStatus(true);
    };
    sock.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(String(msg.data)) as DeckServerEvent);
      } catch {
        // Not ours to read.
      }
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (closed) return;
      onStatus(false);
      later();
    };
  }
  void connect();
  return {
    send(e) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
      ws = null;
    },
  };
};
