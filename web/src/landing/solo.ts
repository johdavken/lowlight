/**
 * The solo screen (go solo, spec 2026-10-10 §3): between scenes, with no one. You (1P) at the side
 * over the splash art, and the contacts you know: the one you walked out on first (LAST WITH).
 * Picking one goes to her, and she greets you. SAVE saves here; Esc is the title.
 */
import type { AroundEntry, ContactEntry, PlaythroughInfo } from '../../../shared/types';
import { ApiError, type PlaythroughApi } from '../net/playthroughs';
import { formatClock, parseHhmm } from '../../../shared/clock';
import { lineFor } from '../room/people-contacts';
import { openSavePrompt, saveFailure } from '../room/save-prompt';
import { FighterStrip } from './fighter-strip';
import type { AgentsResponse, LandingAgent } from './landing';
import { splashArt, type SplashArt } from './splash';
import { mountStage } from './stage';
import './select.css';
import './solo.css';
import { MENU_CUE_URL, menuCuePlayer } from './menu-sound';
import { gameRoot } from '../ui/game-stage';

export interface SoloDeps {
  api: Pick<PlaythroughApi, 'listPlaythroughs' | 'contacts' | 'setLocation' | 'saveNow' | 'persona' | 'around' | 'clock' | 'wait'>;
  /** The roster, by id: your fighter's art and file. */
  agents(): Promise<ReadonlyMap<string, LandingAgent>>;
  art: SplashArt;
  nav(path: string): void;
  sound?(cue: 'move' | 'confirm' | 'save'): void;
}

const SAVE_NAME = 'On your own';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

/** Who a `busy` refusal waits on: by name when you know her, "someone" for a stranger (her name is a meeting away). */
function waitFor(contact: string | undefined, known: ContactEntry[], strangers: AroundEntry[] = []): string {
  if (strangers.some((s) => s.contactId === contact)) return 'Wait for someone to finish';
  const name = known.find((c) => c.id === contact)?.name ?? (contact ? contact.charAt(0).toUpperCase() + contact.slice(1) : 'them');
  return `Wait for ${name} to finish`;
}

export function mountSolo(root: HTMLElement, deps: SoloDeps): { destroy(): void } {
  const screen = el('div', 'landing solo-screen');
  const backdrop = el('div', 'solo-backdrop');
  backdrop.style.backgroundImage = `url("${deps.art.src}")`;
  screen.append(backdrop);
  root.append(screen);
  const stage = mountStage(screen);

  const p1 = new FighterStrip(stage.el, 'p1', { reducedMotion: false });
  p1.setTag('1P · ON YOUR OWN');
  const panel = el('div', 'solo-panel');
  const head = el('div', 'solo-head', 'ON YOUR OWN');
  const sub = el('div', 'solo-sub', 'Who next?');
  const list = el('div', 'solo-list');
  list.append(el('div', 'solo-empty', '// DIALING…'));
  const error = el('div', 'solo-error');
  const foot = el('div', 'solo-foot');
  const saveButton = el('button', 'solo-btn', 'SAVE');
  const backButton = el('button', 'solo-btn', 'BACK');
  saveButton.type = backButton.type = 'button';
  foot.append(saveButton, backButton, el('span', 'solo-hints', '[↑↓] CONTACT · [ENTER] GO · [S] SAVE · [ESC] TITLE'));
  // WAIT (between scenes): let the story clock run on, and see who's where then.
  const waitRow = el('div', 'solo-wait');
  const wait1 = el('button', 'solo-btn solo-wait-1h', '+1 HOUR');
  const wait4 = el('button', 'solo-btn solo-wait-4h', '+4 HOURS');
  const untilField = el('input', 'solo-wait-until');
  untilField.placeholder = 'HH:MM';
  untilField.maxLength = 5;
  const waitGo = el('button', 'solo-btn solo-wait-go', 'WAIT UNTIL');
  wait1.type = wait4.type = waitGo.type = 'button';
  waitRow.append(wait1, wait4, waitGo, untilField);
  panel.append(head, sub, waitRow, list, error, foot);
  stage.el.append(panel);

  let destroyed = false;
  let clock: number | null = null;
  let busy = false;
  let modal = false;
  let active: PlaythroughInfo | null = null;
  let known: ContactEntry[] = [];
  /** AROUND LOWLIGHT: who you haven't met, by place (empty when the call failed). */
  let strangers: AroundEntry[] = [];

  const nav = (path: string) => {
    if (!destroyed) deps.nav(path);
  };
  const rows = () => [...list.querySelectorAll<HTMLButtonElement>('.solo-row')];
  /** A focus the page gives (on load, after the save prompt) isn't a step: no cue. */
  let quiet = false;
  const moved = () => {
    if (!quiet) deps.sound?.('move');
  };
  const focusQuietly = (row: HTMLButtonElement | undefined) => {
    quiet = true;
    row?.focus();
    quiet = false;
  };

  function render(): void {
    const last = active?.location?.contactId;
    const ordered = [...known.filter((c) => c.id === last), ...known.filter((c) => c.id !== last)];
    if (ordered.length === 0 && strangers.length === 0) {
      list.replaceChildren(el('div', 'solo-empty', '// NO ONE TO CALL'));
      return;
    }
    list.replaceChildren(
      ...ordered.map((c) => {
        const row = el('button', 'solo-row');
        row.type = 'button';
        row.dataset.id = c.id;
        row.style.setProperty('--a', c.accent);
        const face = el('div', 'solo-face');
        if (c.portrait) face.style.backgroundImage = `url("${c.portrait}")`;
        else face.textContent = c.name.charAt(0).toUpperCase();
        const text = el('div', 'solo-text');
        const name = el('div', 'solo-name', c.name.toUpperCase());
        if (c.id === last) name.append(el('span', 'solo-last', 'LAST WITH'));
        text.append(name, el('div', 'solo-line', lineFor(c)));
        row.append(face, text);
        row.addEventListener('click', () => void pick(c.id));
        row.addEventListener('focus', moved);
        return row;
      }),
    );
    if (strangers.length > 0) {
      list.append(
        el('div', 'solo-head2', 'AROUND LOWLIGHT'),
        ...strangers.map((s) => {
          // A place, not a name: walking in is how you find out who.
          const row = el('button', 'solo-row solo-stranger');
          row.type = 'button';
          row.dataset.id = s.contactId;
          const text = el('div', 'solo-text');
          text.append(el('div', 'solo-name', (s.planTail ? `${s.placeName} · ${s.planTail}` : s.placeName).toUpperCase()), el('div', 'solo-line', ["someone's there", s.timeOfDay].filter(Boolean).join(' · ')));
          // The room you walked out of was hers, before you'd met: LAST WITH, still no name.
          if (s.contactId === last) text.firstElementChild!.append(el('span', 'solo-last', 'LAST WITH'));
          row.append(el('div', 'solo-face solo-silhouette'), text);
          row.addEventListener('click', () => void pick(s.contactId));
          row.addEventListener('focus', moved);
          return row;
        }),
      );
    }
    focusQuietly(rows().find((r) => r.dataset.id === last) ?? rows()[0]);
  }

  async function pick(id: string): Promise<void> {
    if (busy || destroyed) return;
    busy = true;
    error.textContent = '';
    deps.sound?.('confirm');
    try {
      await deps.api.setLocation(id);
    } catch (err) {
      busy = false;
      if (err instanceof ApiError && err.error === 'no-playthrough') return nav('/');
      error.textContent = err instanceof ApiError && err.error === 'busy' ? waitFor(err.contact, known, strangers) : `// CAN'T GO THERE — ${err instanceof ApiError ? err.error : err instanceof Error ? err.message : String(err)}`;
      return;
    }
    nav(`/room/${encodeURIComponent(id)}`);
  }

  function save(): void {
    if (!active || modal || busy) return;
    const pt = active;
    modal = true;
    openSavePrompt(screen, {
      defaultName: SAVE_NAME,
      // No contact: a save from her room would move you into it.
      save: async (name) => {
        try {
          await deps.api.saveNow(pt.id, name);
          deps.sound?.('save');
        } catch (err) {
          const f = saveFailure(err, (c) => waitFor(c, known, strangers));
          if ('leave' in f) return nav(f.leave);
          if ('notice' in f) {
            error.textContent = f.notice;
            return;
          }
          throw new Error(f.inline);
        }
      },
      onClose: () => {
        modal = false;
        focusQuietly(rows()[0]);
      },
    });
  }

  function showClock(): void {
    sub.textContent = clock !== null ? `${formatClock(clock)} · who next?` : 'Who next?';
  }

  /** WAIT: the clock moves on, then the lists again (people may have moved). */
  async function waitFor_(b: { minutes: number } | { until: string }): Promise<void> {
    if (busy || modal || destroyed) return;
    busy = true;
    error.textContent = '';
    try {
      clock = (await deps.api.wait(b)).clock;
      const [cs, around] = await Promise.all([deps.api.contacts(), deps.api.around().catch(() => [] as AroundEntry[])]);
      if (destroyed) return;
      known = cs;
      strangers = around;
      showClock();
      render();
    } catch (err) {
      if (err instanceof ApiError && err.error === 'no-playthrough') return nav('/');
      error.textContent = err instanceof ApiError && err.error === 'busy' ? waitFor(err.contact, known, strangers) : `// CAN'T WAIT — ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      busy = false;
    }
  }
  wait1.addEventListener('click', () => void waitFor_({ minutes: 60 }));
  wait4.addEventListener('click', () => void waitFor_({ minutes: 240 }));
  waitGo.addEventListener('click', () => {
    const v = untilField.value.trim();
    if (parseHhmm(v) === null) {
      error.textContent = '// HH:MM, like 20:00';
      return;
    }
    void waitFor_({ until: v });
  });

  const onKey = (e: KeyboardEvent) => {
    if (modal || destroyed) return;
    // Typing a time: the field's keys, and Enter waits.
    if (document.activeElement === untilField && e.key !== 'Escape') {
      if (e.key === 'Enter') {
        e.preventDefault();
        waitGo.click();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return nav('/');
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      return save();
    }
    const all = rows();
    if (!all.length) return;
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      all[at < 0 ? 0 : (at + step + all.length) % all.length]!.focus();
    } else if (e.key === 'Enter' && document.activeElement !== saveButton && document.activeElement !== backButton) {
      e.preventDefault();
      void pick(all[Math.max(0, at)]!.dataset.id!);
    }
  };
  window.addEventListener('keydown', onKey);
  saveButton.addEventListener('click', save);
  backButton.addEventListener('click', () => nav('/'));

  void (async () => {
    try {
      const res = await deps.api.listPlaythroughs();
      active = res.playthroughs.find((p) => p.id === res.active) ?? null;
      if (!active) return nav('/');
      const [cs, around, persona, agents, now] = await Promise.all([
        deps.api.contacts(),
        // Strangers are extra: if the call fails, your contacts still show.
        deps.api.around().catch(() => [] as AroundEntry[]),
        deps.api.persona().catch(() => null),
        deps.agents().catch(() => new Map<string, LandingAgent>()),
        deps.api.clock().then((c) => c.clock).catch(() => null),
      ]);
      if (destroyed) return;
      known = cs;
      strangers = around;
      clock = now;
      showClock();
      p1.show(agents.get(active.player) ?? null, { locked: false });
      if (active.persona) p1.showYou(active.persona);
      else if (persona && persona.id === active.player) p1.setFile({ name: persona.name, head: '// ON YOUR OWN', rows: [{ p: 'Between scenes.' }] });
      render();
    } catch (err) {
      if (destroyed) return;
      if (err instanceof ApiError && err.error === 'no-playthrough') return nav('/');
      list.replaceChildren(el('div', 'solo-empty', `// NO SIGNAL — ${err instanceof Error ? err.message : String(err)}`));
    }
  })();

  return {
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      stage.dispose();
      screen.remove();
    },
  };
}

/** The `/solo` page. */
export async function startSolo(): Promise<void> {
  document.title = 'On your own · Nix Room';
  const [api, art, { AudioEngine }, { createRoomAudio }] = await Promise.all([
    import('../net/playthroughs'),
    splashArt(),
    import('../audio/engine'),
    import('../audio/room-audio'),
  ]);
  // The menus' cues at the landing's level; the first key or click unlocks audio before the page hears it.
  const audio = createRoomAudio({ engine: new AudioEngine(), scale: 0.25 });
  const unlock = () => audio.gesture();
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => audio.visibility(document.hidden));
  for (const url of Object.values(MENU_CUE_URL)) audio.preloadCue(url);
  mountSolo(gameRoot(), {
    sound: menuCuePlayer(audio),
    api,
    art,
    agents: async () => {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`/api/agents: HTTP ${res.status}`);
      const body = (await res.json()) as AgentsResponse;
      return new Map(body.agents.map((a) => [a.id, a]));
    },
    nav: (path) => location.assign(path),
  });
}
