import type { LinkStatus } from '../../../shared/types';

export interface GreetGate {
  /** A new connection: everything starts over. */
  onConnect(): void;
  onHistory(greetDue: boolean): void;
  /** Only the first recap after a connect counts: whether its card went up. */
  onRecap(cardShown: boolean): void;
  onRecapSeen(): void;
  onLink(status: LinkStatus): void;
  /** The district load screen is up (true): the greeting waits for it. A reconnect doesn't reset this. */
  onIntro(open: boolean): void;
  onIntroClosed(): void;
  /** For tests: still deciding, asked for her greeting, or none due on this connection. */
  state(): 'waiting' | 'sent' | 'not-due';
}

/**
 * Decides when the room asks for her greeting: once per connection, when the server said one is
 * due, the recap card (if any) has been read, the district screen (if any) is closed, and the link
 * is up. The server checks again.
 */
export function createGreetGate(send: () => void): GreetGate {
  let historyKnown = false;
  let due = false;
  let recapKnown = false;
  let cardUp = false;
  let linkOk = false;
  let sent = false;
  let introUp = false;

  const maybeSend = () => {
    if (sent || !due || !recapKnown || cardUp || !linkOk || introUp) return;
    sent = true;
    send();
  };

  return {
    onConnect() {
      historyKnown = due = recapKnown = cardUp = linkOk = sent = false;
    },
    onHistory(greetDue) {
      historyKnown = true;
      due = greetDue;
      maybeSend();
    },
    onRecap(cardShown) {
      if (recapKnown) return;
      recapKnown = true;
      cardUp = cardShown;
      maybeSend();
    },
    onRecapSeen() {
      cardUp = false;
      maybeSend();
    },
    onLink(status) {
      linkOk = status === 'ok';
      maybeSend();
    },
    onIntro(open) {
      introUp = open;
      maybeSend();
    },
    onIntroClosed() {
      introUp = false;
      maybeSend();
    },
    state() {
      if (sent) return 'sent';
      return historyKnown && !due ? 'not-due' : 'waiting';
    },
  };
}
