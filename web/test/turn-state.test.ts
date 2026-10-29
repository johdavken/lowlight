import { describe, expect, it } from 'vitest';
import type { ChatMessage, ServerEvent } from '../../shared/types';
import { TurnTracker } from '../src/ui/turn-state';

function msg(over: Partial<ChatMessage>): ServerEvent {
  return { type: 'message', message: { id: 'm', role: 'agent', text: '', toolLines: [], ts: 0, status: 'ok', ...over } };
}

describe('TurnTracker', () => {
  it('is busy from the moment a user_message is sent, before any server event', () => {
    const t = new TurnTracker();
    expect(t.busy).toBe(false);
    t.onSend();
    expect(t.busy).toBe(true);
  });

  it('stays busy through the user echo and the streaming reply, and clears when the reply settles ok', () => {
    const t = new TurnTracker();
    t.onSend();
    t.onEvent(msg({ id: 'u1', role: 'user', status: 'ok' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'streaming', replyTo: 'u1' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'ok', replyTo: 'u1' }));
    expect(t.busy).toBe(false);
  });

  it('clears when the reply is lost', () => {
    const t = new TurnTracker();
    t.onSend();
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'streaming' }));
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'lost' }));
    expect(t.busy).toBe(false);
  });

  it('clears when the user message fails', () => {
    const t = new TurnTracker();
    t.onSend();
    t.onEvent(msg({ id: 'u1', role: 'user', status: 'ok' }));
    t.onEvent(msg({ id: 'u1', role: 'user', status: 'failed' }));
    expect(t.busy).toBe(false);
  });

  it('clears on quest_pick and gives the held line back to the field', () => {
    const t = new TurnTracker();
    t.onSend();
    expect(t.onEvent({ type: 'quest_pick', id: 'paper-trail', beat: 'sentinel', choice: 'stall', text: 'Come back in the morning.' })).toEqual({ restoreDraft: 'Come back in the morning.' });
    expect(t.busy).toBe(false);
  });

  it('clears on turn_rejected and returns the refused draft', () => {
    const t = new TurnTracker();
    t.onSend();
    expect(t.onEvent({ type: 'turn_rejected', reason: 'busy', text: 'draft' })).toEqual({ restoreDraft: 'draft' });
    expect(t.busy).toBe(false);
  });

  it('is busy while another tab’s reply streams, without having sent anything', () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'streaming' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'ok' }));
    expect(t.busy).toBe(false);
  });

  it('history resets state to what it shows (a still-streaming reply keeps it busy)', () => {
    const t = new TurnTracker();
    t.onSend();
    t.onEvent({ type: 'history', messages: [], greetDue: false });
    expect(t.busy).toBe(false);
    t.onEvent({ type: 'history', messages: [(msg({ id: 'n1', status: 'streaming' }) as any).message], greetDue: false });
    expect(t.busy).toBe(true);
  });

  it('a socket drop clears a pending send (it was dropped or will show up in history)', () => {
    const t = new TurnTracker();
    t.onSend();
    t.onSocketClosed();
    expect(t.busy).toBe(false);
  });

  it('a deleted streaming reply no longer keeps the page busy', () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 'n1', status: 'streaming' }) as never);
    expect(t.busy).toBe(true);
    t.onEvent({ type: 'messages_removed', ids: ['n1'] });
    expect(t.busy).toBe(false);
  });

  it('her greeting (no send from this tab) is busy from its greet line until her reply settles', () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 'g1', role: 'user', status: 'ok', mode: 'greet' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'streaming', mode: 'greet', replyTo: 'g1' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'ok', mode: 'greet', replyTo: 'g1' }));
    expect(t.busy).toBe(false);
  });

  it('a move on the map (no send from this tab) is busy from its travel line until her reply settles', () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 't1', role: 'user', status: 'ok', mode: 'travel' }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'n1', role: 'agent', status: 'ok', mode: 'travel', replyTo: 't1' }));
    expect(t.busy).toBe(false);
  });

  it('a greeting that fails before any text clears when its line is removed, or marked failed', () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 'g1', role: 'user', status: 'ok', mode: 'greet' }));
    t.onEvent({ type: 'messages_removed', ids: ['g1'] });
    expect(t.busy).toBe(false);
    t.onEvent(msg({ id: 'g2', role: 'user', status: 'ok', mode: 'greet' }));
    t.onEvent(msg({ id: 'g2', role: 'user', status: 'failed', mode: 'greet' }));
    expect(t.busy).toBe(false);
  });

  it('an old greet line in the history is not busy', () => {
    const t = new TurnTracker();
    t.onEvent({ type: 'history', messages: [(msg({ id: 'g1', role: 'user', status: 'ok', mode: 'greet' }) as any).message], greetDue: false });
    expect(t.busy).toBe(false);
  });

  it("a job's silent beat row (no reply follows) doesn't leave her transmitting", () => {
    const t = new TurnTracker();
    t.onEvent(msg({ id: 'q1', role: 'user', status: 'ok', mode: 'quest', quest: { id: 'back-door', title: 'Back Door', beat: 'desk', silent: true } }));
    expect(t.busy).toBe(false);
    t.onEvent(msg({ id: 'q2', role: 'user', status: 'ok', mode: 'quest', quest: { id: 'back-door', title: 'Back Door', beat: null } }));
    expect(t.busy).toBe(true);
    t.onEvent(msg({ id: 'a2', role: 'agent', status: 'ok', replyTo: 'q2' }));
    expect(t.busy).toBe(false);
  });
});

