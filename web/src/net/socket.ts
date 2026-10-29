import type { ClientEvent, ServerEvent } from '../../../shared/types';

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 8000;
/** Close codes after which reconnecting can't help. */
const REFUSED_CODES = [4404, 4409, 4410] as const;
export type RefusedCode = (typeof REFUSED_CODES)[number];

/** The room socket's URL; `first` (the page's first connect) adds enter=1. */
export function socketUrl(o: { proto: string; host: string; agentId: string; token: string; player: string | null; first: boolean }): string {
  const asParam = o.player !== null ? `&as=${encodeURIComponent(o.player)}` : '';
  return `${o.proto}//${o.host}/ws/${encodeURIComponent(o.agentId)}?token=${encodeURIComponent(o.token)}${asParam}${o.first ? '&enter=1' : ''}`;
}

/**
 * Connects to an agent's room: GET /api/bootstrap for the token, then a WebSocket to /ws/<agentId>.
 * `player`, when non-null, is sent as `&as=<player>` so the socket binds to that visitor.
 * Reconnects forever with exponential backoff 0.5 s → 8 s (×2), reset on a successful open.
 * `send` while disconnected drops the event.
 */
export function connectSocket(
  agentId: string,
  player: string | null,
  onEvent: (e: ServerEvent) => void,
  onStatus: (open: boolean) => void,
  /**
   * Called when the server closes this room for good, with no retry: 4404 no such connected agent,
   * 4409 no playthrough, 4410 the world switched to another playthrough.
   */
  onRefused?: (code: RefusedCode) => void,
): { send(e: ClientEvent): void } {
  let ws: WebSocket | null = null;
  let backoff = BACKOFF_MIN_MS;
  /** The page's first socket says enter=1 (the player walked in); reconnects don't. */
  let first = true;

  const scheduleReconnect = () => {
    const delay = backoff;
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
    setTimeout(connect, delay);
  };

  async function connect(): Promise<void> {
    let token: string;
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error(`bootstrap ${res.status}`);
      token = ((await res.json()) as { token: string }).token;
    } catch {
      scheduleReconnect();
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const sock = new WebSocket(socketUrl({ proto, host: location.host, agentId, token, player, first }));
    ws = sock;
    sock.onopen = () => {
      // Walked in: from now on a socket coming back is a reconnect.
      first = false;
      backoff = BACKOFF_MIN_MS;
      onStatus(true);
    };
    sock.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(String(msg.data)) as ServerEvent;
      } catch {
        return;
      }
      onEvent(event);
    };
    sock.onclose = (ev) => {
      if (ws === sock) ws = null;
      onStatus(false);
      if ((REFUSED_CODES as readonly number[]).includes(ev.code)) {
        onRefused?.(ev.code as RefusedCode);
        return;
      }
      scheduleReconnect();
    };
  }

  void connect();

  return {
    send(e: ClientEvent) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
    },
  };
}
