import type { ChatMessage, ServerEvent } from '../../../shared/types';

/**
 * Tracks whether a chat turn is in flight, so the input is busy for exactly as long as the
 * server would refuse a new message: from the moment this tab sends (before any server event)
 * until that turn reaches a terminal status — the nix reply ok/lost, the user message failed,
 * or the server refusing it — plus whenever any reply streams (e.g. one started by another tab),
 * and while her greeting is on its way (from its greet line to her reply, or the line's removal).
 */
export class TurnTracker {
  private pending = false;
  private readonly streaming = new Set<string>();

  get busy(): boolean {
    return this.pending || this.streaming.size > 0;
  }

  /** This tab just sent a user_message (or retry). */
  onSend(): void {
    this.pending = true;
  }

  /** The socket closed: a send in flight was either dropped or will show up in the next history. */
  onSocketClosed(): void {
    this.pending = false;
  }

  /** Feed every server event through; returns a draft to restore when the server refused one. */
  onEvent(e: ServerEvent): { restoreDraft?: string } {
    switch (e.type) {
      case 'history':
        this.pending = false;
        this.streaming.clear();
        e.messages.forEach((m) => this.track(m));
        return {};
      case 'message':
        // A greet line, a move on the map or a played event arriving live: she's about to speak, though this tab sent nothing.
        if (e.message.role === 'user' && (e.message.mode === 'greet' || e.message.mode === 'travel' || e.message.mode === 'encounter' || (e.message.mode === 'quest' && !e.message.quest?.silent)) && e.message.status === 'ok') this.streaming.add(e.message.id);
        else this.track(e.message);
        return {};
      case 'messages_removed':
        for (const id of e.ids) this.streaming.delete(id);
        return {};
      case 'quest_pick':
        // The pick check held the line (quest lines spec §3): nothing was saved, so the line goes back to the field.
        this.pending = false;
        return { restoreDraft: e.text };
      case 'turn_rejected':
        this.pending = false;
        return e.text !== undefined ? { restoreDraft: e.text } : {};
      default:
        return {};
    }
  }

  private track(m: ChatMessage): void {
    if (m.role === 'agent' && m.replyTo) this.streaming.delete(m.replyTo); // her greeting has opened
    if (m.role === 'agent' && m.status === 'streaming') {
      this.streaming.add(m.id);
      return;
    }
    this.streaming.delete(m.id);
    const terminal = (m.role === 'agent' && (m.status === 'ok' || m.status === 'lost')) || (m.role === 'user' && m.status === 'failed');
    if (terminal) this.pending = false;
  }
}
