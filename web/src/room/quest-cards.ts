/**
 * Quest cards (quest lines spec §3): the choices of the quest at a beat here, pinned above the input.
 * A card click chooses it. A line the pick check held lights its card with THAT'S MY CHOICE (choose it with
 * that line) and JUST TALKING (send the line on as ordinary chat).
 */
import type { ChatMessage, Debrief, QuestState } from '../../../shared/types';
import { debriefEl } from './debrief';
import { hhmmOf, minuteOfDay } from '../../../shared/clock';
import { passiveLabels } from '../ui/passive';
import { mountReadBoard } from './read-board';
import { markLore } from '../ui/lore-hover';

type Active = NonNullable<QuestState['active']>;
type Waiting = NonNullable<QuestState['waiting']>;

const at = (m: number) => hhmmOf(minuteOfDay(m));
/** `4h 40m`, `11h`, `20m`. */
const span = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h > 0 ? `${h}h` : '', m > 0 || h === 0 ? `${m}m` : ''].filter(Boolean).join(' ');
};

/** How long WAIT UNTIL would wait: to the hour it waits for, while you're there and it's ahead (at most a day, as WAIT allows); null: no button. */
export function waitFor(w: Waiting, now: number | null): number | null {
  if (w.ready || !w.here || w.from === null || now === null) return null;
  const mins = w.from - now;
  return mins >= 1 && mins <= 1440 ? mins : null;
}

/** The waiting panel's when-row: `from 06:00 · Lowlight Intake · by 12:00 · in 4h 40m` (past times left out). */
export function waitWhen(w: Waiting, now: number | null): string {
  const future = (m: number | null) => m !== null && (now === null || m > now);
  const parts = [future(w.from) ? `from ${at(w.from!)}` : null, w.at, w.comms ? 'ON COMMS' : null, w.by !== null ? `by ${at(w.by)}` : null];
  const until = w.by !== null ? w.by : future(w.from) ? w.from : null;
  if (until !== null && now !== null && until > now) parts.push(`in ${span(until - now)}`);
  return parts.filter((x): x is string => Boolean(x)).join(' · ');
}

export interface QuestCards {
  /** The cards for the beat here, under its written text (`story`: the latest quest row's, without your pick line). */
  show(active: Active | null, story?: string): void;
  /** The quest just ended: its last text, no cards, until closed; a job's debrief under it. */
  end(title: string, story: string, job?: { debrief: Debrief; cue(name: 'clean' | 'messy' | 'blown'): void; reduced: boolean }): void;
  /** The quest here waits for its next beat (quest waits spec §4): what to do, where, from and by when; `now` is the story clock. */
  waiting(w: Waiting | null, now: number | null, story?: string): void;
  /** The story clock moved: the countdown follows. */
  clock(now: number): void;
  pick(choice: string, text: string): void;
  clearPick(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Written text with its *actions* in italics, as the box shows them; a passive line's ⟦LABEL⟧ as its faint label. */
function storyEl(text: string): HTMLElement {
  const box = el('div', 'qc-story');
  for (const [i, part] of text.split(/\*([^*\n]+)\*/).entries()) {
    if (part === '') continue;
    box.append(i % 2 === 1 ? el('em', '', part) : document.createTextNode(part));
  }
  passiveLabels(box);
  markLore(box);
  return box;
}

/** A job's strip under its title (small jobs spec §6): ALARM in 3 segments, EDGE, HEAT, the pay range. */
function stripEl(a: Active): HTMLElement | null {
  if (a.alarm === undefined) return null;
  const strip = el('div', 'qc-strip');
  const alarm = el('span', 'qc-alarm');
  alarm.append(el('b', '', 'ALARM'));
  for (let i = 0; i < 3; i++) alarm.append(el('i', i < a.alarm ? 'on' : ''));
  strip.append(alarm, el('span', 'qc-edge', `EDGE ${a.edge ?? 0}`), el('span', 'qc-heat', `HEAT ${a.heat ?? 0}`));
  if (a.pay && a.pay[1] > 0) strip.append(el('span', 'qc-pay', `PAY ${a.pay[0] === a.pay[1] ? a.pay[0] : `${a.pay[0]}–${a.pay[1]}`} SOL`));
  // A big job (big jobs spec §5): its section first, and during legwork the go hour and the time left.
  if (a.big) {
    strip.prepend(el('span', 'qc-section', SECTION_WORD[a.big.section]));
    if (a.big.section === 'legwork') strip.append(el('span', 'qc-go', `GO ${a.big.go}${a.big.left !== null ? ` · IN ${span(a.big.left).toUpperCase()}` : ''}`));
  }
  return strip;
}

const SECTION_WORD = { legwork: 'LEGWORK', read: 'THE READ', approach: 'THE APPROACH', out: 'OUT' } as const;

/** A big job's clues held, folded (big jobs spec §5). */
function cluesEl(big: NonNullable<Active['big']>): HTMLElement | null {
  if (!big.clues.length) return null;
  const d = el('details', 'qc-clues');
  d.append(el('summary', '', `CLUES · ${big.clues.length}`));
  const ul = el('ul', '');
  for (const c of big.clues) ul.append(el('li', '', c.text));
  d.append(ul);
  return d;
}

/** Legwork's marked places still to visit (big jobs spec §2). */
function marksEl(big: NonNullable<Active['big']>): HTMLElement | null {
  if (big.section !== 'legwork' || !big.marks.length) return null;
  const ul = el('ul', 'qc-marks');
  for (const m of big.marks) ul.append(el('li', '', `${m.name} · ${m.line}`));
  return ul;
}

export function mountQuestCards(host: HTMLElement, o: { onChoose(choice: string, said?: string): void; onTalk(text: string): void; onContinue?(id: string): void; onShown?(shown: boolean): void;
  /** WAIT UNTIL in the waiting panel: let the clock run on this many minutes. */
  onWait?(minutes: number): void;
  /** A line under the cards for a new player (null: none). */
  hint?(): string | null;
  /** The pointer came onto a job's card (its hover cue). */
  onHover?(): void;
  /** READ IT on a big job's read (big jobs spec §3). */
  onRead?(picks: [string, string, string]): void;
}): QuestCards {
  host.classList.add('qc-host');
  host.hidden = true;
  let active: Active | null = null;
  let story: string | null = null;
  let ended: string | null = null;
  /** The ended job's debrief card, built once (its stamp cue and count-up play once). */
  let debrief: HTMLElement | null = null;
  let lit: { choice: string; text: string } | null = null;
  let waiting: Waiting | null = null;
  let now: number | null = null;
  const headOf = (title: string) => {
    const head = el('div', 'qc-head');
    head.append(el('span', 'qc-mark', '◆ QUEST'), el('span', 'qc-title', title));
    // The title folds the story away (the cards stay).
    head.onclick = () => host.classList.toggle('qc-folded');
    return head;
  };

  /** Whether the room last heard the panel was up (figures step aside while it is). */
  let wasShown = false;
  const render = () => {
    host.replaceChildren();
    host.classList.remove('has-art');
    host.hidden = active === null && ended === null && waiting === null;
    if (wasShown === host.hidden) {
      wasShown = !host.hidden;
      o.onShown?.(wasShown);
    }
    if (waiting !== null) {
      const w = waiting;
      host.append(headOf(w.title));
      if (story) host.append(storyEl(story));
      host.append(el('div', 'qc-next', w.next));
      const when = waitWhen(w, now);
      if (when) host.append(el('div', 'qc-when', when));
      const mins = waitFor(w, now);
      if (mins !== null && w.from !== null) {
        const wait = el('button', 'qc-wait', `WAIT UNTIL ${at(w.from)}`);
        wait.type = 'button';
        wait.onclick = (e) => {
          e.stopPropagation();
          o.onWait?.(mins);
        };
        host.append(wait);
      }
      if (w.ready) {
        const go = el('button', 'qc-continue', 'CONTINUE');
        go.type = 'button';
        go.onclick = (e) => {
          e.stopPropagation();
          o.onContinue?.(w.id);
        };
        host.append(go);
      }
      return;
    }
    if (ended !== null) {
      const close = el('button', 'qc-close', '✕');
      close.type = 'button';
      close.title = 'Close';
      close.onclick = (e) => {
        e.stopPropagation();
        ended = null;
        story = null;
        debrief = null;
        render();
      };
      const head = headOf(ended);
      head.append(el('span', 'qc-end', 'THE END'), close);
      host.append(head);
      if (story) host.append(storyEl(story));
      if (debrief) host.append(debrief);
      return;
    }
    if (!active) return;
    const head = headOf(active.title);
    // A blown job waiting on its cover cards (small jobs spec §5).
    const cover = active.choices.some((c) => c.id === '!burner' || c.id === '!fall-guy');
    if (cover) head.append(el('span', 'qc-blown', 'BLOWN'));
    const cards = el('div', 'qc-cards');
    for (const c of active.choices) {
      const card = el('div', c.id === '!burner' || c.id === '!fall-guy' ? 'qc-card qc-cover' : 'qc-card');
      card.dataset.choice = c.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.append(el('span', 'qc-line', c.line));
      if (active.alarm !== undefined) card.addEventListener('mouseenter', () => o.onHover?.());
      // A mission's checked choice: its odds for you (missions spec §3).
      if (c.odds) card.append(el('span', 'qc-odds', `· ${c.odds.stat} ${c.odds.chance}%${c.odds.noDeck ? ' · NO DECK' : ''}`));
      // A job's card (small jobs spec §6): ONE SHOT, the terminal's size, the odds as a bar and what moved them.
      if (c.red) card.append(el('span', 'qc-red', 'ONE SHOT'));
      if (c.crack) card.append(el('span', 'qc-crack', `CRACK · ${c.crack.length} LETTERS · ${c.crack.tries} TRIES`));
      // A big job's route (big jobs spec §3): its gig and difficulty, and what moved it.
      const route = active.big?.routes?.[c.id];
      if (route) {
        card.append(el('span', 'qc-gig', `${route.kind.toUpperCase()} · ${route.tier.toUpperCase()}`));
        if (route.why.length) card.append(el('div', 'qc-why', route.why.join(' · ')));
      }
      if (c.odds && active.alarm !== undefined) {
        const bar = el('div', 'qc-bar');
        bar.style.setProperty('--odds', `${c.odds.chance}%`);
        card.append(bar);
        if (c.odds.why.length) card.append(el('div', 'qc-why', c.odds.why.join(' · ')));
      }
      const said = lit?.choice === c.id ? lit.text : null;
      const choose = () => o.onChoose(c.id, said ?? undefined);
      card.onclick = choose;
      card.onkeydown = (e) => {
        // Only the card itself: Enter on either button is that button's own.
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      };
      if (said !== null) {
        card.classList.add('qc-lit');
        card.append(el('div', 'qc-said', `“${said}”`), el('div', 'qc-ask', 'That sounds like this one. Is it your choice?'));
        const row = el('div', 'qc-actions');
        const confirm = el('button', 'qc-confirm', "THAT'S MY CHOICE");
        confirm.type = 'button';
        confirm.onclick = (e) => {
          e.stopPropagation();
          o.onChoose(c.id, said);
        };
        const talk = el('button', 'qc-talk', 'JUST TALKING');
        talk.type = 'button';
        talk.onclick = (e) => {
          e.stopPropagation();
          lit = null;
          render();
          o.onTalk(said);
        };
        row.append(confirm, talk);
        card.append(row);
      }
      cards.append(card);
    }
    // The quest's picture (quest art), muted above its title; one that won't load just goes.
    if (active.art) {
      const art = el('img', 'qc-art');
      art.src = active.art;
      art.alt = '';
      art.addEventListener('error', () => {
        art.remove();
        host.classList.remove('has-art');
      });
      host.append(art);
      host.classList.add('has-art');
    }
    host.append(head);
    const strip = stripEl(active);
    if (strip) host.append(strip);
    if (story) host.append(storyEl(story));
    if (active.big) {
      const clues = cluesEl(active.big);
      if (clues) host.append(clues);
      const marks = marksEl(active.big);
      if (marks) host.append(marks);
    }
    // The read (big jobs spec §3): the board takes the cards' place.
    const read = active.big?.read;
    if (read) mountReadBoard(host, { parts: read.parts, bank: read.bank, onRead: (picks) => o.onRead?.(picks) });
    else host.append(cards);
    // The debrief as it stands, under the cover cards (spec §5–§6): the totals update after the choice.
    if (active.blown) host.append(debriefEl(active.blown.debrief, { cue: () => {}, reduced: true }));
    const hint = o.hint?.() ?? null;
    if (hint) host.append(el('div', 'qc-hint', hint));
  };

  return {
    show(a, s) {
      active = a;
      story = a ? (s ?? null) : null;
      ended = null;
      waiting = null;
      lit = null;
      render();
    },
    end(title, s, job) {
      active = null;
      waiting = null;
      ended = title;
      story = s;
      debrief = job ? debriefEl(job.debrief, job) : null;
      lit = null;
      render();
    },
    waiting(w, clock, s) {
      waiting = w;
      now = clock;
      active = null;
      ended = null;
      lit = null;
      story = w ? (s ?? null) : null;
      render();
    },
    clock(clock) {
      const had = waiting ? waitFor(waiting, now) !== null : false;
      now = clock;
      if (waiting && had !== (waitFor(waiting, now) !== null)) return render();
      const when = host.querySelector('.qc-when');
      if (waiting && when) when.textContent = waitWhen(waiting, now);
    },
    pick(choice, text) {
      lit = { choice, text };
      render();
    },
    clearPick() {
      if (lit === null) return;
      lit = null;
      render();
    },
  };
}

/** The newest quest row of yours (the room's story so far): its title, its written text without your pick line, and whether it ended the quest. */
export function latestQuestStory(rows: readonly ChatMessage[]): { id: string; title: string; text: string; ended: boolean } | null {
  const m = rows.findLast((r) => r.role === 'user' && r.mode === 'quest' && r.quest);
  if (!m?.quest) return null;
  const pick = m.quest.pick?.line;
  const text = pick && m.text.startsWith(pick) ? m.text.slice(pick.length).replace(/^\n+/, '') : m.text;
  return { id: m.id, title: m.quest.title, text, ended: m.quest.beat === null && m.quest.waiting !== true };
}
