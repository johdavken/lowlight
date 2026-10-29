/**
 * Liar's dice in the room (spec §3): the tray on the stage between you and her, in its own layer so
 * it stays up whatever the stage does. Her round lines and faces arrive through here, the result goes
 * to her as your turn, and her reply's row closes it. Every way out gives her face back.
 */
import type { ChatMessage, ClientEvent } from '../../../../shared/types';
import type { DiceSettings } from '../../../../shared/dice/opponent';
import type { DiceState } from '../../../../shared/dice/rules';
import { DiceTray } from './tray';
import { onClickAway } from '../click-away';
import { gameRoot } from '../game-stage';

export interface DiceRoomDeps {
  her: () => { name: string; accent: string; settings: DiceSettings };
  you: () => string;
  reducedMotion: boolean;
  seed?: () => number;
  send: (e: ClientEvent) => void;
  stage: { setExpression: (side: 'right', name: string | null) => void };
  /** Her face as her latest reply left it. */
  herFace: () => string | null;
  /** Puts text in the room's prompt (a truth you won: your question). */
  prefill: (text: string) => void;
  /** The feed is expanded over the room: Esc is its. */
  feedExpanded: () => boolean;
  cue?: (name: string) => void;
}

export function diceRoom(deps: DiceRoomDeps) {
  let tray: DiceTray | null = null;
  let host: HTMLElement | null = null;
  /** What was sent, while her reply is coming. */
  let pending: { stake: string; result: 'won' | 'lost' } | null = null;
  let offClickAway: (() => void) | null = null;

  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !tray || deps.feedExpanded()) return;
    if (tray.handleEscape()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  function close(): void {
    if (!tray) return;
    const t = tray;
    tray = null;
    pending = null;
    window.removeEventListener('keydown', onEsc, true);
    offClickAway?.();
    offClickAway = null;
    t.destroy();
    host?.remove();
    host = null;
    deps.stage.setExpression('right', deps.herFace());
  }

  return {
    get open(): boolean {
      return tray !== null;
    },
    start(): void {
      if (tray) return;
      host = document.createElement('div');
      host.className = 'dice-host';
      gameRoot().append(host);
      // Before the tray's own listener, so Esc reaches the room first.
      window.addEventListener('keydown', onEsc, true);
      // A click away does what Esc does (it asks first mid-game); not while the feed is read over it.
      const h = host;
      offClickAway = onClickAway(
        (n) => h.contains(n),
        () => {
          if (tray && !deps.feedExpanded()) tray.handleEscape();
        },
      );
      tray = new DiceTray(host, {
        her: deps.her(),
        you: deps.you(),
        reducedMotion: deps.reducedMotion,
        seed: deps.seed,
        cue: deps.cue,
        paused: () => deps.feedExpanded(),
        onRound: (round, record, stake, seed) => deps.send({ type: 'dice_line', round, record, stake, seed }),
        // Her round face as it came (null is neutral); closing puts her reply's back (close()).
        onExpression: (name) => deps.stage.setExpression('right', name),
        onSend: (r) => {
          pending = { stake: r.stake, result: r.result };
          deps.send({ type: 'dice', ...r });
        },
        onClose: () => close(),
      });
    },
    line(e: { round: number; seed: number; line: string; expression: string | null }): void {
      tray?.showLine(e.round, e.seed, e.line, e.expression);
    },
    refusal(text: string): void {
      tray?.showRefusal(text);
    },
    /** Your dice row reached the feed: her reply to the game is on its way, the table is cleared. (Another tab's row leaves a game you haven't sent alone.) */
    row(m: ChatMessage): void {
      if (m.mode !== 'dice' || !tray || pending === null) return;
      const truth = pending !== null && pending.result === 'won' && pending.stake.toLowerCase() === 'a truth';
      close();
      if (truth) deps.prefill('My question: ');
    },
    roomChanged(): void {
      close();
    },
    close,
    state(): DiceState | null {
      return tray?.state() ?? null;
    },
  };
}

export type DiceRoom = ReturnType<typeof diceRoom>;
