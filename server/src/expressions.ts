/** Her face on the stage: set_expression saves a name on the reply it belongs to and broadcasts it. */
import type { ChatMessage, ServerEvent, Source } from '../../shared/types';
import type { Db } from './db';
import type { Result } from './room-state';

export interface ExpressionControl {
  /** Her expression names (never `neutral`), in her character file's order. */
  names(): string[];
  /** Sets her face on `player`'s pair's reply (the tool's `ctx.player()`: her turn's pair, or the dev panel tab's). */
  set(name: string, player: string, src: Source): Result;
}

export function createExpressionControl(deps: {
  names: string[];
  db: Db;
  /** The relay: whether a turn runs, its reply, and whose pair it is (the turn in progress, else the last). */
  relay: () => { busy: boolean; activeMessageId: string | null; activePlayer: string };
  emit: (e: ServerEvent, player?: string) => void;
  /** Whose face this control sets: the contact's (`expression`, default) or one other's here, by id. */
  field?: 'expression' | { other: string };
}): ExpressionControl {
  const field = deps.field ?? 'expression';
  /** `faces` (the contact's face and the others' map, of a reply or a take) with this control's face set; undefined clears it. */
  const withFace = <T extends { expression?: string; othersExpressions?: Record<string, string> }>(faces: T, expression: string | undefined): T => {
    if (field === 'expression') {
      const { expression: _old, ...rest } = faces;
      return (expression ? { ...rest, expression } : rest) as T;
    }
    const { [field.other]: _old, ...others } = faces.othersExpressions ?? {};
    const { othersExpressions: _map, ...rest } = faces;
    const map = expression ? { ...others, [field.other]: expression } : others;
    return (Object.keys(map).length > 0 ? { ...rest, othersExpressions: map } : rest) as T;
  };
  const names = [...deps.names];

  /**
   * The reply this call belongs to: the one in progress (`live`), or, with no turn running, her
   * latest. A turn whose reply hasn't opened yet must not land on her previous reply.
   */
  function target(player: string): { id: string; live: boolean } | { error: string } {
    const relay = deps.relay();
    if (relay.busy) {
      // Another pair's turn: this pair's reply (if any) is not the one being written.
      if (relay.activePlayer !== player || relay.activeMessageId === null) return { error: "your reply hasn't started yet" };
      return { id: relay.activeMessageId, live: true };
    }
    const latest = (msgs: ChatMessage[]) => msgs.findLast((m) => m.role === 'agent');
    // Her latest reply is almost always among the recent ones; the full scan is the rare fallback.
    const reply = latest(deps.db.recentMessages(player)) ?? latest(deps.db.allMessages(player));
    return reply ? { id: reply.id, live: false } : { error: 'you have no reply to change yet' };
  }

  return {
    names: () => [...names],
    // `src` is accepted for the tool signature; who asked doesn't change what happens.
    set(name, player, _src) {
      if (name !== 'neutral' && !names.includes(name)) {
        return { ok: false, error: `no expression '${name}'; yours are: ${['neutral', ...names].join(', ')}` };
      }
      const found = target(player);
      if ('error' in found) return { ok: false, error: found.error };
      const message = deps.db.getMessage(player, found.id);
      if (!message) return { ok: false, error: 'you have no reply to change yet' };
      const expression = name === 'neutral' ? undefined : name;

      const faced = withFace({ expression: message.expression, othersExpressions: message.othersExpressions }, expression);
      deps.db.updateMessage(player, found.id, { expression: faced.expression, othersExpressions: faced.othersExpressions });
      // A settled reply's shown take keeps it too, so swiping away and back shows it. A reply in
      // progress only has the message column: its takes still hold the old ones (the relay folds
      // this expression into the new take, or restores the old one, when the turn ends).
      const takes = found.live ? null : deps.db.getTakes(player, found.id);
      if (takes) {
        const next = [...takes.takes];
        next[takes.index] = withFace(takes.takes[takes.index], expression);
        deps.db.setTakes(player, found.id, next, takes.index);
      }
      deps.emit({ type: 'message', message: deps.db.getMessage(player, found.id)! }, player);
      return { ok: true, text: `expression: ${name}` };
    },
  };
}
