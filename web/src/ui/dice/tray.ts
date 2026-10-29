/**
 * The liar's dice tray (spec §3): a bar-top tray on the stage between you and her. The stake, then
 * Perudo (LIAR only) against her settings, a reveal after every call, and the result, sent once.
 * Her round lines arrive from outside (showLine) and set her bubble and her face. Keys are taken
 * here while it's open; Esc comes from the room through handleEscape.
 */
import { her } from '../../room/her-copy';
import { bugReportOpen } from '../bug-report';
import { chooseMove, type DiceSettings } from '../../../../shared/dice/opponent';
import { bid, callLiar, isLegal, lastBid, minRaise, newGame, totalDice, type DiceState, type Face, type RoundRecord } from '../../../../shared/dice/rules';
import { bidText, cleanStake, STAKES } from '../../../../shared/dice/text';
import { rng } from '../../../../shared/gig/generate';
import './dice.css';

export interface DiceTrayOpts {
  her: { name: string; accent: string; settings: DiceSettings };
  you: string;
  reducedMotion: boolean;
  /** Default: `?diceSeed=` when present (e2e), else random. */
  seed?: () => number;
  /** A round is over: ask for her line (it comes back through showLine). */
  onRound: (round: number, record: RoundRecord, stake: string, seed: number) => void;
  /** Her face for the round's line; null puts her reply's face back. */
  onExpression: (name: string | null) => void;
  onSend: (result: { stake: string; result: 'won' | 'lost'; rounds: RoundRecord[]; lines: (string | null)[]; seed: number }) => void;
  /** Left mid-game (Esc twice): nothing sent. */
  onClose: (opts: { truthWon: boolean }) => void;
  cue?: (name: string) => void;
  /** True while something covers the tray (the expanded feed): keys are left alone. */
  paused?: () => boolean;
}

type Screen = 'stake' | 'rules' | 'table' | 'reveal' | 'result';

/** HOW TO PLAY (the stake screen's [?]): the rules as the tray plays them, a heading and its lines each. */
const rules = (): [string, string[]][] => [
  ['THE DICE', ['Five each, under a cup. You only see yours.', '1s are wild: they count as any face (not in a bid on 1s).']],
  ['A TURN', ['Raise the bid, or call LIAR.', 'A bid is about both cups together: "four 5s" means at least four 5s on the table, 1s included.']],
  ['RAISING', ['More of the same face (four 5s → five 5s), or the same number of a higher face (→ four 6s).', 'To 1s: half the number, rounded up (four 5s → two 1s). Off 1s: double plus one (two 1s → five of a face).', 'You open the first round, never on 1s. The tray only offers legal bids.']],
  ['LIAR', ['The cups lift. Fewer than the bid: the bidder loses a die. As many or more: the caller does.', her().diceLastDie]],
  ['KEYS', ['↑↓ number · ←→ face · ENTER bid · L liar · ESC twice leaves (not once the game is decided).']],
  ['THE ODDS', [her().diceOdds, 'Few dice left: bids get thin, and LIAR gets good.']],
];
const FACES: Face[] = [1, 2, 3, 4, 5, 6];
const PIPS: Record<Face, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
/** How long she "thinks" before her move (none under reduced motion). */
const THINK_MS: [number, number] = [800, 1500];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, cls: string, run: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}
const NS = 'http://www.w3.org/2000/svg';
function die(n: Face, cls: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `dice-die${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('data-face', String(n));
  const rect = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: 4, y: 4, width: 92, height: 92, rx: 18 })) rect.setAttribute(k, String(v));
  svg.append(rect);
  for (const [x, y] of PIPS[n]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(y));
    c.setAttribute('r', '9');
    c.setAttribute('class', n === 1 ? 'dice-pip dice-pip-one' : 'dice-pip');
    svg.append(c);
  }
  return svg;
}
const counts = (d: Face, f: Face) => d === f || (f !== 1 && d === 1);

function urlSeed(): number | null {
  const raw = new URLSearchParams(location.search).get('diceSeed');
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) >>> 0 : null;
}

/** How long a sent result waits for her turn to start before the tray offers SEND AGAIN (as the gig's). */
const ANSWER_MS = 10_000;

export class DiceTray {
  private readonly layer: HTMLElement;
  private readonly box: HTMLElement;
  private readonly say: HTMLElement;
  private screen: Screen = 'stake';
  private stake: string = STAKES[0];
  private own = '';
  private seed = 0;
  private game: DiceState | null = null;
  private rand: () => number = Math.random;
  private pick: { q: number; face: Face } = { q: 1, face: 2 };
  private thinking = false;
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRecord: RoundRecord | null = null;
  private lines: (string | null)[] = [];
  private sent = false;
  private refusal: string | null = null;
  private escArmed = false;
  private closed = false;
  /** The dice were just rolled: this paint tumbles them (once). */
  private rolled = false;
  /** A round line set her face: closing puts it back. */
  private faceSet = false;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  // The bug report over this takes the keys (its own listener comes later on window).
  private readonly onKey = (e: KeyboardEvent) => void (!bugReportOpen() && this.key(e));

  constructor(
    host: HTMLElement,
    private readonly opts: DiceTrayOpts,
  ) {
    this.layer = el('div', 'dice-layer');
    this.layer.classList.toggle('dice-motion', !opts.reducedMotion);
    this.layer.style.setProperty('--dice-accent', opts.her.accent);
    this.say = el('div', 'dice-say');
    this.box = el('div', 'dice-tray');
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-label', "Liar's dice");
    this.layer.append(this.say, this.box);
    host.append(this.layer);
    window.addEventListener('keydown', this.onKey, true);
    this.paint();
    // The room's prompt may have focus: take it, so typing goes to the stake and Enter deals.
    this.layer.querySelector<HTMLInputElement>('.dice-own')?.focus();
  }

  /** The game as it stands (for the e2e hook and tests). */
  state(): DiceState | null {
    return this.game;
  }

  /** Her line for `round` of the game dealt from `seed`: shown only if that's this game's latest finished round and the tray is open. */
  showLine(round: number, seed: number, line: string, expression: string | null): void {
    if (this.closed || !this.lastRecord || round !== this.lastRecord.round || seed !== this.seed) return;
    this.lines[round - 1] = line;
    this.say.replaceChildren(el('b', '', this.opts.her.name), ` · ${line}`);
    this.say.classList.add('dice-on');
    this.faceSet = true;
    this.opts.onExpression(expression);
  }

  /** The room refused the result: say why, and let it go again. */
  showRefusal(text: string): void {
    if (this.closed || this.screen !== 'result') return;
    this.stopWaiting();
    this.refusal = text;
    this.sent = false;
    this.paint();
  }

  /** Esc from the room: true while the tray is up (it always takes it). */
  handleEscape(): boolean {
    if (this.closed) return false;
    // A finished game has one way out, [ENTER] BACK TO HER, until the room refuses it: losing the last
    // die can't be dodged (the reveal that ends it included).
    const finished = this.screen === 'result' || (this.screen === 'reveal' && !!this.game?.over);
    if (finished && !this.refusal) return true;
    if (this.screen === 'rules') {
      this.screen = 'stake';
      this.paint();
      return true;
    }
    if (this.screen === 'result') {
      this.leave();
      return true;
    }
    if (this.screen !== 'stake' && !this.escArmed) {
      this.escArmed = true;
      this.paint();
      return true;
    }
    this.leave();
    return true;
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.faceSet) this.opts.onExpression(null);
    if (this.thinkTimer !== null) clearTimeout(this.thinkTimer);
    this.stopWaiting();
    for (const t of this.timers) clearTimeout(t);
    window.removeEventListener('keydown', this.onKey, true);
    this.layer.remove();
  }

  private leave(): void {
    this.faceSet = false;
    this.opts.onExpression(null);
    this.opts.onClose({ truthWon: false });
  }

  private cue(name: string): void {
    try {
      this.opts.cue?.(`dice:${name}`);
    } catch {
      // a missing sound never breaks the game
    }
  }

  // ── keys ──

  private key(e: KeyboardEvent): void {
    if (this.closed || this.opts.paused?.() || e.key === 'Escape' || e.key === '`' || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const t = e.target;
    const inOwn = t instanceof HTMLElement && this.layer.contains(t) && t.tagName === 'INPUT';
    // Typing in a field outside the tray (the dev panel) is that field's; the room's own prompt isn't.
    if (t instanceof HTMLElement && !this.layer.contains(t) && !t.closest('#input') && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (this.escArmed) {
      this.escArmed = false;
      this.paint();
    }
    if (e.repeat && e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.screen === 'stake') {
      if (k === 'Enter') this.deal();
    } else if (this.screen === 'rules') {
      if (k === 'Enter') {
        e.preventDefault();
        this.screen = 'stake';
        this.paint();
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        this.box.scrollBy?.({ top: k === 'ArrowDown' ? 60 : -60 });
      }
    } else if (this.screen === 'table' && this.game && this.game.turn === 'you' && !this.thinking) {
      if (k === 'ArrowUp') this.setQty(this.pick.q + 1);
      else if (k === 'ArrowDown') this.setQty(this.pick.q - 1);
      else if (k === 'ArrowRight') this.setFace(Math.min(6, this.pick.face + 1) as Face);
      else if (k === 'ArrowLeft') this.setFace(Math.max(1, this.pick.face - 1) as Face);
      else if (k === 'Enter') this.youBid();
      else if (k === 'l') this.youLiar();
    } else if (this.screen === 'reveal' && k === 'Enter') this.next();
    else if (this.screen === 'result' && k === 'Enter') this.send();
    // Nothing reaches the room behind the tray (letters into its prompt, Enter sending them).
    if (inOwn && k !== 'Enter') {
      e.stopImmediatePropagation();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // ── play ──

  private deal(): void {
    this.stake = cleanStake(this.own.trim() ? this.own : this.stake);
    this.seed = this.opts.seed?.() ?? urlSeed() ?? (Math.random() * 2 ** 32) >>> 0;
    this.game = newGame(this.seed);
    this.rand = rng((this.seed ^ 0x9e3779b9) >>> 0);
    this.screen = 'table';
    this.resetPick();
    this.cue('roll');
    this.rolled = true;
    this.paint();
  }

  private resetPick(): void {
    const s = this.game!;
    const last = lastBid(s);
    const total = totalDice(s);
    const prefer: Face = last ? (last.face === 1 ? 2 : last.face) : 2;
    // The last bid's face when it can still be raised, else the first face that can.
    const face = [prefer, ...FACES].find((f) => minRaise(last, f, total) !== Infinity) ?? prefer;
    const q = minRaise(last, face, total);
    this.pick = { face, q: q === Infinity ? 1 : q };
  }

  private setQty(q: number): void {
    this.pick.q = Math.max(1, Math.min(totalDice(this.game!), q));
    this.disarm();
    this.paint();
  }

  private setFace(f: Face): void {
    this.pick.face = f;
    // The quantity starts at the picked face's minimum legal raise (spec §3.3).
    const m = minRaise(lastBid(this.game!), f, totalDice(this.game!));
    if (m !== Infinity) this.pick.q = m;
    this.disarm();
    this.paint();
  }

  private disarm(): void {
    this.escArmed = false;
  }

  private legal(): boolean {
    const s = this.game!;
    return isLegal(lastBid(s), this.pick.q, this.pick.face, totalDice(s));
  }

  private youBid(): void {
    const s = this.game!;
    if (this.screen !== 'table' || s.turn !== 'you' || this.thinking || !this.legal()) return;
    this.game = bid(s, this.pick.q, this.pick.face);
    this.disarm();
    this.cue('bid');
    this.herTurn();
  }

  private youLiar(): void {
    const s = this.game!;
    if (this.screen !== 'table' || s.turn !== 'you' || this.thinking || !lastBid(s)) return;
    this.disarm();
    this.reveal();
  }

  private herTurn(): void {
    const move = () => {
      this.thinkTimer = null;
      this.thinking = false;
      if (this.closed || this.screen !== 'table' || !this.game || this.game.turn !== 'her') return;
      const m = chooseMove(this.game, this.opts.her.settings, this.rand);
      if (m.kind === 'liar') return this.reveal();
      this.game = bid(this.game, m.q, m.face, m.bluff);
      this.cue('bid');
      this.resetPick();
      this.paint();
    };
    if (this.opts.reducedMotion) return move();
    this.thinking = true;
    this.paint();
    const [lo, hi] = THINK_MS;
    // The beat comes from Math.random, not the game's RNG: her play stays the same for a seed either way.
    this.thinkTimer = setTimeout(move, lo + Math.random() * (hi - lo));
  }

  private reveal(): void {
    const { state, record } = callLiar(this.game!);
    this.game = state;
    this.lastRecord = record;
    this.lines.push(null);
    this.screen = 'reveal';
    this.cue('liar');
    this.later(() => this.cue('reveal'), 350);
    this.later(() => this.cue('lose-die'), 800);
    this.paint();
    this.opts.onRound(record.round, record, this.stake, this.seed);
  }

  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** A step a beat later (at once under reduced motion); never after the tray is gone. */
  private later(run: () => void, ms: number): void {
    if (this.opts.reducedMotion) return run();
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.closed) run();
    }, ms);
    this.timers.add(t);
  }

  private next(): void {
    const s = this.game!;
    this.disarm();
    if (s.over) {
      this.screen = 'result';
      this.cue(s.over === 'you' ? 'win' : 'lose');
      this.paint();
      return;
    }
    this.screen = 'table';
    this.resetPick();
    this.cue('roll');
    this.rolled = true;
    this.paint();
    if (s.turn === 'her') this.herTurn();
  }

  private send(): void {
    const s = this.game;
    if (this.sent || !s?.over) return;
    this.sent = true;
    this.refusal = null;
    this.paint();
    this.opts.onSend({ stake: this.stake, result: s.over === 'you' ? 'won' : 'lost', rounds: s.rounds, lines: [...this.lines], seed: this.seed });
    // No row and no refusal (the link dropped, the room said nothing): offer it again.
    this.stopWaiting();
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      this.showRefusal('no answer — check the link and send again');
    }, ANSWER_MS);
  }

  private stopWaiting(): void {
    if (this.answerTimer !== null) clearTimeout(this.answerTimer);
    this.answerTimer = null;
  }

  // ── drawing ──

  private paint(): void {
    if (this.closed) return;
    this.box.replaceChildren();
    if (this.screen === 'stake') return this.paintStake();
    if (this.screen === 'rules') return this.paintRules();
    const s = this.game!;
    const name = this.opts.her.name;
    const top = el('div', 'dice-top');
    const cups = el('span', 'dice-cups', name.toUpperCase());
    for (let i = 0; i < 5; i++) cups.append(el('span', `dice-cup${i < s.left.her ? '' : ' dice-gone'}`));
    top.append(el('span', 'dice-stake-label', `FOR · ${this.stake.toUpperCase()}`), cups);
    this.box.append(top);
    this.box.classList.toggle('dice-lifted', this.screen !== 'table');

    if (this.screen === 'table') {
      const last = lastBid(s);
      const tbl = el('div', 'dice-table');
      tbl.append(
        el('div', 'dice-bid', last ? bidText(last) : '—'),
        el('div', 'dice-by', `${last ? (last.by === 'her' ? `${name.toUpperCase()} BIDS` : 'YOU BID') : 'YOUR OPENING BID'} · ROUND ${s.round}`),
        el('div', 'dice-hist', s.bids.slice(0, -1).slice(-3).map((b) => `${b.by === 'you' ? 'you' : name.toLowerCase()} · ${bidText(b)}`).join('  ·  ')),
        this.hand(s.dice.you, last?.face ?? null, false, 'dice-mine'),
      );
      if (this.thinking) tbl.append(el('div', 'dice-think', `${name.toUpperCase()} IS THINKING…`));
      else if (s.turn === 'you') tbl.append(...this.controls(s));
      this.box.append(tbl);
    } else if (this.screen === 'reveal') {
      const r = this.lastRecord!;
      const loser = r.loser === 'you' ? 'you lose a die' : `${name} loses a die`;
      const rev = el('div', 'dice-reveal');
      rev.append(
        el('div', 'dice-liar', `${r.caller === 'you' ? 'YOU' : name.toUpperCase()}: LIAR!`),
        el('div', 'dice-by', `${bidText(r.bid)} · there ${r.count === 1 ? 'was' : 'were'} ${r.count} · ${loser}`),
        this.hand(r.dice.her, r.bid.face, true, 'dice-her', name.toUpperCase()),
        this.hand(r.dice.you, r.bid.face, true, 'dice-mine', 'YOU'),
        button(`[ENTER] ${s.over ? 'SEE IT OUT' : 'NEXT ROUND'}`, 'dice-btn dice-next', () => this.next()),
      );
      this.box.append(rev);
    } else {
      const won = s.over === 'you';
      const truth = this.isTruth() ? her().diceTruth(won) : '';
      const res = el('div', 'dice-result');
      const r = this.lastRecord!;
      res.append(
        el('div', `dice-big ${won ? 'dice-win' : 'dice-lose'}`, won ? 'YOU WIN' : `${name.toUpperCase()} WINS`),
        el('div', 'dice-result-line', `${s.left.you} – ${s.left.her} · for ${this.stake}${truth}`),
        this.hand(r.dice.her, r.bid.face, true, 'dice-her', name.toUpperCase()),
        this.hand(r.dice.you, r.bid.face, true, 'dice-mine', 'YOU'),
      );
      if (this.refusal) res.append(el('div', 'dice-refusal', this.refusal));
      res.append(button(this.refusal ? '[ENTER] SEND AGAIN' : her().diceBack, 'dice-btn dice-send', () => this.send(), this.sent));
      this.box.append(res);
    }
    if (this.escArmed) this.box.append(el('div', 'dice-esc', '[ESC] or click away again to leave the table'));
  }

  private paintStake(): void {
    const wrap = el('div', 'dice-stake');
    const chips = el('div', 'dice-chips');
    for (const t of STAKES) {
      const c = button(t, `dice-chip${this.stake === t && !this.own.trim() ? ' dice-on' : ''}`, () => {
        this.stake = t;
        this.own = '';
        this.paint();
      });
      chips.append(c);
    }
    const own = el('input', 'dice-own');
    own.type = 'text';
    own.maxLength = 60;
    own.placeholder = 'or write your own…';
    own.value = this.own;
    own.addEventListener('input', () => {
      this.own = own.value;
      chips.querySelectorAll('.dice-chip').forEach((c) => c.classList.remove('dice-on'));
    });
    const help = button('[?] HOW TO PLAY', 'dice-help', () => {
      this.screen = 'rules';
      this.paint();
    });
    const top = el('div', 'dice-top');
    top.append(el('span', '', `LIAR'S DICE · ${this.opts.her.name.toUpperCase()}`), help);
    wrap.append(top, el('div', 'dice-by', 'PLAYING FOR'), chips, own, button('[ENTER] DEAL', 'dice-btn dice-deal', () => this.deal()));
    this.box.append(wrap);
  }

  private paintRules(): void {
    const wrap = el('div', 'dice-rules');
    const back = () => {
      this.screen = 'stake';
      this.paint();
    };
    // BACK sits in the heading: the rules run longer than the tray and scroll (↑↓) under it.
    const top = el('div', 'dice-top');
    top.append(el('span', '', 'HOW TO PLAY'), button('[ENTER] BACK', 'dice-help dice-rules-back', back));
    wrap.append(top);
    for (const [head, lines] of rules()) {
      const sec = el('section', 'dice-rule');
      sec.append(el('h4', '', head));
      for (const l of lines) sec.append(el('p', '', l));
      wrap.append(sec);
    }
    this.box.append(wrap);
    this.box.scrollTop = 0;
  }

  private hand(dice: Face[], face: Face | null, reveal: boolean, cls: string, label?: string): HTMLElement {
    const row = el('div', `dice-hand ${cls}`);
    if (label) row.append(el('span', 'dice-lbl', label));
    if (!this.opts.reducedMotion && cls === 'dice-mine' && this.screen === 'table' && this.rolled) {
      row.classList.add('dice-tumble');
      this.rolled = false;
    }
    for (const d of dice) {
      const hit = face !== null && counts(d, face);
      row.append(die(d, reveal ? (hit ? 'dice-glow' : 'dice-dim') : hit ? 'dice-soft' : ''));
    }
    return row;
  }

  /** "a truth", however it was typed. */
  private isTruth(): boolean {
    return this.stake.toLowerCase() === 'a truth';
  }

  private controls(s: DiceState): HTMLElement[] {
    const last = lastBid(s);
    const ok = this.legal();
    const min = minRaise(last, this.pick.face, totalDice(s));
    const faces = el('span', 'dice-faces');
    for (const f of FACES) {
      const b = button(String(f), `dice-face${this.pick.face === f ? ' dice-on' : ''}`, () => this.setFace(f));
      b.dataset.face = String(f);
      if (f === 1) b.append(el('span', 'dice-wild', 'WILD'));
      faces.append(b);
    }
    const row = el('div', 'dice-ctrl');
    row.append(
      button('−', 'dice-btn dice-qm', () => this.setQty(this.pick.q - 1)),
      el('span', 'dice-qty', String(this.pick.q)),
      button('+', 'dice-btn dice-qp', () => this.setQty(this.pick.q + 1)),
      el('span', 'dice-x', '×'),
      faces,
      button('BID', 'dice-btn dice-do-bid', () => this.youBid(), !ok),
      button('LIAR', 'dice-btn dice-liar-btn dice-do-liar', () => this.youLiar(), !last),
    );
    const note = ok ? '' : min === Infinity ? (last ? "can't bid that face" : "can't open on 1s") : `at least ${min} on ${this.pick.face}s`;
    return [row, el('div', 'dice-note', note), el('div', 'dice-hint', '[↑↓] QTY · [←→] FACE · [ENTER] BID · [L] LIAR · [ESC] ×2 LEAVE')];
  }
}
