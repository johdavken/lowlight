/**
 * QUEST (quest lines spec §3): the quests that can start here, from the HUD's QUEST key or Alt+Q. A
 * run here whose quest file lost its beat says so instead.
 */
import type { QuestState } from '../../../shared/types';
import { onClickAway } from '../ui/click-away';

/** The open quests in `state` not in `seen` (which learns them): what the "can start here" notice names. */
export function newlyOpen(seen: Set<string>, state: QuestState): QuestState['open'] {
  const fresh = state.open.filter((q) => !seen.has(q.id));
  for (const q of fresh) seen.add(q.id);
  return fresh;
}

export interface QuestList {
  show(state: QuestState): void;
  toggle(): void;
  close(): void;
  /** Whether there's anything to list (the HUD shows QUEST only then). */
  has(): boolean;
  readonly isOpen: boolean;
}

export function mountQuestList(
  host: HTMLElement,
  o: { onStart(id: string): void; onOpen?(): void; /** BUY at the fixer (small jobs spec §5). */ onBuy?(item: string): void; /** WALK AWAY from a big job before its approach (big jobs spec §4). */ onWalk?(id: string): void },
): QuestList {
  host.classList.add('ql-host');
  host.hidden = true;
  // Like the other panels: a click outside, or Esc, closes it (click-away spec 2026-10-15).
  let off: (() => void) | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Capture phase: Esc closes the list and goes no further (not back to the dial-in).
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  };
  function setOpen(open: boolean): void {
    host.hidden = !open;
    if (open) o.onOpen?.();
    if (open && !off) {
      const offAway = onClickAway((n) => host.contains(n), () => setOpen(false));
      window.addEventListener('keydown', onKey, true);
      off = () => {
        offAway();
        window.removeEventListener('keydown', onKey, true);
      };
    } else if (!open && off) {
      off();
      off = null;
    }
  }
  let state: QuestState = { open: [], active: null, changed: null, waiting: null, elsewhere: [] };

  const render = () => {
    host.replaceChildren();
    const title = document.createElement('div');
    title.className = 'ql-head';
    title.textContent = '◆ QUESTS HERE';
    host.append(title);
    if (state.changed) {
      const c = document.createElement('div');
      c.className = 'ql-changed';
      c.textContent = state.changed;
      host.append(c);
    }
    if (state.waiting) {
      const w = document.createElement('div');
      w.className = 'ql-row ql-waiting';
      w.textContent = `${state.waiting.title} · ${state.waiting.next}`;
      host.append(w);
    }
    // Quests in someone else's room: listed so they're never lost; they go on only with that contact.
    for (const e of state.elsewhere) {
      const row = document.createElement('div');
      row.className = 'ql-row ql-elsewhere';
      row.textContent = [e.title, `with ${e.contactName}`, e.next].filter(Boolean).join(' · ');
      host.append(row);
    }
    // A big job before its approach (big jobs spec §4): it can be walked away from.
    const big = walkable(state);
    if (big) {
      const row = document.createElement('div');
      row.className = 'ql-row ql-active-big';
      const text = document.createElement('div');
      text.className = 'ql-text';
      const name = document.createElement('span');
      name.className = 'ql-title';
      name.textContent = big.title;
      const sub = document.createElement('div');
      sub.className = 'ql-big';
      sub.textContent = 'BIG JOB · IN PROGRESS';
      text.append(name, sub);
      const walk = document.createElement('button');
      walk.type = 'button';
      walk.className = 'ql-walk';
      walk.textContent = 'WALK AWAY';
      walk.onclick = () => {
        setOpen(false);
        o.onWalk?.(big.id);
      };
      row.append(text, walk);
      host.append(row);
    }
    for (const q of state.open) {
      const row = document.createElement('div');
      row.className = 'ql-row';
      const name = document.createElement('span');
      name.className = 'ql-title';
      name.textContent = q.title;
      const start = document.createElement('button');
      start.type = 'button';
      start.className = 'ql-start';
      start.textContent = 'START';
      start.onclick = () => {
        setOpen(false);
        o.onStart(q.id);
      };
      const text = document.createElement('div');
      text.className = 'ql-text';
      text.append(name);
      // A mission (spec 2026-10-18 §3): what it pays, before what it's about.
      if (q.mission) {
        const tag = document.createElement('div');
        tag.className = 'ql-mission';
        const r = q.mission.range;
        const pay = r && r[0] !== r[1] ? `${r[0]}–${r[1]} SOL` : q.mission.pay !== null ? `${q.mission.pay} SOL` : null;
        // A contact's own job (Intake board spec §3): whose client, and trust as its stake.
        const head = q.mission.own ? [`${q.mission.own.toUpperCase()}'S CLIENT`, ...(q.mission.comms ? ['COMMS', q.mission.comms.toUpperCase()] : [])] : ['MISSION', q.mission.tier !== undefined ? `TIER ${q.mission.tier}` : null];
        tag.textContent = [...head, pay, q.mission.trust ? 'TRUST' : null].filter(Boolean).join(' · ');
        text.append(tag);
        // The arrangement's nights are used up tonight (spec 2026-10-20 §2): greyed, with why, and no START.
        if (q.mission.capped) {
          row.classList.add('ql-capped');
          const note = document.createElement('div');
          note.className = 'ql-capped-note';
          note.textContent = `${q.mission.capped.toUpperCase()} IS DONE TONIGHT`;
          text.append(note);
          start.disabled = true;
        }
        // Crew (spec 2026-10-19 §2): a SCOUT shows tonight's draws and pay; a CASE says so.
        const sc = q.mission.scouted;
        if (sc) {
          const line = document.createElement('div');
          line.className = 'ql-scouted';
          const up = (x: string) => x.toUpperCase().replace(/-/g, ' ');
          line.textContent = [sc.pay !== null ? `PAY ${sc.pay}` : null, ...Object.entries(sc.draws).map(([k, v]) => `${up(k)}: ${up(v)}`)].filter(Boolean).join(' · ');
          text.append(line);
        }
        if (q.mission.cased) {
          const c = document.createElement('div');
          c.className = 'ql-cased';
          c.textContent = 'CASED';
          text.append(c);
        }
      }
      if (q.big) {
        const tag = document.createElement('div');
        tag.className = 'ql-big';
        const r = q.big.range;
        tag.textContent = ['BIG JOB', q.big.tier >= 4 ? 'A NAME' : 'TRUSTED', r ? `${r[0]}–${r[1]} SOL` : null, `+${q.big.stake[0]} / −${q.big.stake[1]} REP`].filter(Boolean).join(' · ');
        text.append(tag);
      }
      if (q.pitch) {
        const pitch = document.createElement('div');
        pitch.className = 'ql-pitch';
        pitch.textContent = q.pitch;
        text.append(pitch);
      }
      if (q.timed) {
        const timed = document.createElement('div');
        timed.className = 'ql-timed';
        timed.textContent = 'HAS A DEADLINE';
        text.append(timed);
      }
      row.append(text, start);
      host.append(row);
    }
    // The fixer at a board (small jobs spec §5): BUY at your tier there with the sol for it.
    if (state.fixer?.items.length) {
      const box = document.createElement('div');
      box.className = 'ql-fixer';
      const head = document.createElement('div');
      head.className = 'ql-head';
      head.textContent = '◆ FIXER';
      box.append(head);
      for (const item of state.fixer.items) {
        const row = document.createElement('div');
        row.className = `ql-row ql-item ${item.state}`;
        const name = document.createElement('span');
        name.className = 'ql-item-name';
        name.textContent = `${item.name} · ${item.price} SOL`;
        const text = document.createElement('div');
        text.className = 'ql-text';
        text.append(name);
        if (item.state !== 'ok') {
          const why = document.createElement('div');
          why.className = 'ql-item-why';
          why.textContent = item.state === 'locked' ? `TIER ${item.tier}` : 'NOT ENOUGH SOL';
          text.append(why);
        }
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'ql-buy';
        buy.textContent = 'BUY';
        buy.disabled = item.state !== 'ok';
        buy.onclick = () => o.onBuy?.(item.id);
        row.append(text, buy);
        box.append(row);
      }
      host.append(box);
    }
  };

  return {
    show(s) {
      state = s;
      render();
      if (!this.has()) setOpen(false);
    },
    toggle() {
      if (host.hidden && this.has()) render();
      setOpen(host.hidden && this.has());
    },
    close() {
      setOpen(false);
    },
    has() {
      return state.open.length > 0 || walkable(state) !== null || state.changed !== null || state.waiting !== null || state.elsewhere.length > 0 || (state.fixer?.items.length ?? 0) > 0;
    },
    get isOpen() {
      return !host.hidden;
    },
  };
}

/** The active big job you can still walk away from (legwork or the read), or null. */
function walkable(state: QuestState): { id: string; title: string } | null {
  const a = state.active;
  return a?.big && (a.big.section === 'legwork' || a.big.section === 'read') ? { id: a.id, title: a.title } : null;
}
