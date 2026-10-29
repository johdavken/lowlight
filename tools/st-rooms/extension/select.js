// Lowlight's character select over SillyTavern: 1P picks who you are (a persona), CPU picks your contact (a
// character), then //JACK IN switches persona and opens that chat. Built on a 1600×900 stage scaled to the window,
// as Lowlight's is; the live room behind it shows the skyline, and each contact's own room while the cursor rests.
import { getUserAvatar, setUserAvatar, user_avatar } from '../../../personas.js';

const COLUMNS = 6;
const STAGE_W = 1600;
const STAGE_H = 900;
/** The backdrop swaps to the CPU cursor's room once it rests this long (Lowlight's select). */
const ROOM_REST_MS = 600;
const SKYLINE = 'splash';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const thumb = (type, file) => `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`;

/**
 * @param {{ cast: { characters?: any[] }, rooms: string[], current: () => string, goTo: (folder: string) => Promise<void>, cue: (name: string) => void }} deps
 */
export function mountSelect({ cast, rooms, current, goTo, cue }) {
  const info = new Map((cast.characters ?? []).map((c) => [c.name, c]));
  const root = el('div', 'lls-root');
  root.hidden = true;
  const stage = el('div', 'lls-stage');
  root.append(stage);
  document.body.append(root);

  const title = el('div', 'lls-title');
  const files = { p1: el('div', 'lls-file lls-p1'), p2: el('div', 'lls-file lls-p2') };
  const fighters = { p1: el('img', 'lls-fighter lls-p1'), p2: el('img', 'lls-fighter lls-p2') };
  for (const f of Object.values(fighters)) {
    f.alt = '';
    f.draggable = false;
  }
  const grid = el('div', 'lls-grid');
  const banner = el('div', 'lls-banner', '//JACK IN Y/N');
  const hint = el('div', 'lls-hint');
  stage.append(fighters.p1, fighters.p2, title, files.p1, files.p2, grid, banner, hint);

  /** 'p1' (who you are) → 'p2' (your contact) → 'ready' (JACK IN Y/N). */
  let phase = 'p1';
  const cursor = { p1: 0, p2: 0 };
  const picked = { p1: null, p2: null };
  let roster = { p1: [], p2: [] };
  let restTimer = null;
  let roomBefore = null;
  /** CPU's grid: the Lowlight cast only (the default), or every SillyTavern character ([A] switches, remembered). */
  const ALL_KEY = 'lowlight-select-all';
  let showAll = false;
  try { showAll = localStorage.getItem(ALL_KEY) === '1'; } catch { /* private window */ }

  /** Who can be picked: your personas, and SillyTavern's characters. */
  function load() {
    const c = SillyTavern.getContext();
    const charByName = new Map(c.characters.map((ch, i) => [ch.name, { ch, i }]));
    const descriptions = c.powerUserSettings.persona_descriptions;
    const named = Object.entries(c.powerUserSettings.personas).filter(([, name]) => name && name !== '[Unnamed Persona]');
    // SillyTavern's own first-run persona (its default picture, nothing written) has no figure or file to show: leave
    // it off the grid when there's anyone else to be.
    const untouched = ([file]) => file === 'user-default.png' && !descriptions[file]?.description;
    roster.p1 = (named.some((p) => !untouched(p)) ? named.filter((p) => !untouched(p)) : named)
      .map(([file, name]) => ({
        name,
        file,
        face: charByName.has(name) ? thumb('avatar', charByName.get(name).ch.avatar) : thumb('persona', file),
        figure: getUserAvatar(file),
        about: descriptions[file]?.description ?? '',
      }));
    // Without cast.json there's no cast to keep to: everyone shows.
    const keep = (ch) => showAll || info.size === 0 || info.has(ch.name);
    roster.p2 = c.characters.map((ch, i) => ({ ch, i })).filter(({ ch }) => keep(ch)).map(({ ch, i }) => ({
      name: ch.name,
      index: i,
      face: thumb('avatar', ch.avatar),
      // SillyTavern keeps sprites in a folder named for the character (Seraphina), not the card file (default_Seraphina.png).
      figure: `/characters/${encodeURIComponent(ch.name)}/neutral.png`,
      fallback: `/characters/${encodeURIComponent(ch.avatar)}`,
      // Their FILE: the bio a playable character carries as a persona (as on Lowlight's own select screen).
      about: info.get(ch.name)?.persona?.description ?? '',
    }));
    cursor.p1 = Math.max(0, roster.p1.findIndex((p) => p.file === user_avatar));
    const open = c.characterId !== undefined ? roster.p2.findIndex((r) => r.index === Number(c.characterId)) : -1;
    cursor.p2 = Math.max(0, open);
  }

  function fileFor(side, who) {
    const box = files[side];
    box.replaceChildren();
    box.append(el('div', 'lls-tag', side === 'p1' ? '1P · YOU' : 'CPU · AI'));
    if (!who) {
      box.append(el('div', 'lls-awaiting', 'AWAITING SELECTION'));
      return;
    }
    const meta = info.get(who.name);
    const name = el('div', `lls-name${who.name.length > 8 ? ' long' : ''}`, who.name.toUpperCase());
    box.append(name);
    if (meta?.tagline) box.append(el('div', 'lls-tagline', meta.tagline));
    if (who.about) {
      box.append(el('div', 'lls-dh', `// FILE ${who.name.toUpperCase()}`));
      const about = el('div', 'lls-about');
      for (const para of who.about.split(/\n\s*\n/)) about.append(el('p', '', para.trim()));
      box.append(about);
    }
    if (meta?.facts?.length) {
      const dl = el('dl', 'lls-facts');
      for (const f of meta.facts) dl.append(el('dt', '', f.label), el('dd', '', f.value));
      box.append(dl);
    }
  }

  function setFighter(side, who) {
    const img = fighters[side];
    if (!who) {
      img.hidden = true;
      return;
    }
    img.hidden = false;
    if (img.dataset.src === who.figure) return;
    img.dataset.src = who.figure;
    img.onerror = who.fallback ? () => { img.onerror = null; img.src = who.fallback; } : null;
    img.src = who.figure;
  }

  function paint() {
    const list = phase === 'p1' ? roster.p1 : roster.p2;
    const side = phase === 'p1' ? 'p1' : 'p2';
    root.dataset.phase = phase;
    title.textContent = phase === 'p1' ? 'SELECT YOUR OPERATOR' : phase === 'p2' ? 'SELECT YOUR CONTACT' : 'READY';
    const p1 = phase === 'p1' ? roster.p1[cursor.p1] : picked.p1;
    const p2 = phase === 'p1' ? null : phase === 'p2' ? roster.p2[cursor.p2] : picked.p2;
    fileFor('p1', p1);
    fileFor('p2', p2);
    setFighter('p1', p1);
    setFighter('p2', p2);
    grid.replaceChildren();
    list.forEach((who, i) => {
      const tile = el('div', 'lls-tile');
      const img = el('img');
      img.src = who.face;
      img.alt = '';
      img.draggable = false;
      tile.append(img, el('span', 'lls-tile-name', who.name.toUpperCase()));
      if (phase !== 'ready' && i === cursor[side]) {
        tile.classList.add('on', side);
        tile.append(el('span', 'lls-tile-tag', side === 'p1' ? '1P' : 'CPU'));
      }
      tile.addEventListener('click', () => {
        if (phase === 'ready') return;
        if (cursor[side] !== i) {
          cursor[side] = i;
          cue('move');
          moved();
        }
        lock();
      });
      grid.append(tile);
    });
    banner.hidden = phase !== 'ready';
    hint.textContent =
      phase === 'ready'
        ? '[Y] JACK IN · [N] BACK'
        : `[↑↓←→] MOVE · [ENTER] LOCK IN${phase === 'p2' && info.size ? ` · [A] ${showAll ? 'LOWLIGHT ONLY' : 'ALL'}` : ''} · [ESC] ${phase === 'p1' ? 'CLOSE' : 'BACK'}`;
  }

  /** The backdrop: the skyline while choosing who you are; the CPU cursor's room once it rests. */
  function backdropFor(folder) {
    const want = folder && rooms.includes(folder) ? folder : rooms.includes(SKYLINE) ? SKYLINE : null;
    if (want && want !== current()) void goTo(want);
  }
  function moved() {
    paint();
    clearTimeout(restTimer);
    if (phase === 'p2') {
      const who = roster.p2[cursor.p2];
      restTimer = setTimeout(() => backdropFor(info.get(who?.name)?.home), ROOM_REST_MS);
    }
  }

  function move(dx, dy) {
    const side = phase === 'p1' ? 'p1' : 'p2';
    const n = (phase === 'p1' ? roster.p1 : roster.p2).length;
    if (!n) return;
    let i = cursor[side] + dx + dy * COLUMNS;
    if (dy !== 0 && (i < 0 || i >= n)) return;
    i = (i + n) % n;
    if (i === cursor[side]) return;
    cursor[side] = i;
    cue('move');
    moved();
  }

  function lock() {
    if (phase === 'p1' && roster.p1.length) {
      picked.p1 = roster.p1[cursor.p1];
      phase = 'p2';
      cue('lock');
      moved();
    } else if (phase === 'p2' && roster.p2.length) {
      picked.p2 = roster.p2[cursor.p2];
      phase = 'ready';
      cue('vs');
      clearTimeout(restTimer);
      backdropFor(info.get(picked.p2.name)?.home);
      paint();
    }
  }

  /** [A] on CPU's step: the whole SillyTavern roster, or back to the Lowlight cast; the cursor stays on the same character if it can. */
  function toggleAll() {
    if (phase !== 'p2' || !info.size) return;
    const was = roster.p2[cursor.p2]?.index;
    showAll = !showAll;
    try { localStorage.setItem(ALL_KEY, showAll ? '1' : '0'); } catch { /* private window */ }
    const p1 = cursor.p1;
    load();
    cursor.p1 = p1;
    cursor.p2 = Math.max(0, roster.p2.findIndex((r) => r.index === was));
    cue('move');
    moved();
  }

  function back() {
    if (phase === 'ready') {
      phase = 'p2';
      moved();
    } else if (phase === 'p2') {
      phase = 'p1';
      picked.p1 = null;
      clearTimeout(restTimer);
      backdropFor(null);
      paint();
    } else close(true);
  }

  async function jackIn() {
    const { p1, p2 } = picked;
    if (!p1 || !p2) return;
    cue('confirm');
    close(false);
    const c = SillyTavern.getContext();
    if (p1.file !== user_avatar) await setUserAvatar(p1.file, { toastPersonaNameChange: false });
    if (String(c.characterId) !== String(p2.index)) await c.selectCharacterById(p2.index);
  }

  function fit() {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  function open() {
    if (!root.hidden) return;
    load();
    phase = 'p1';
    picked.p1 = picked.p2 = null;
    roomBefore = current();
    root.hidden = false;
    document.body.classList.add('lls-open');
    fit();
    backdropFor(null);
    paint();
  }

  /** `restore`: closed without jacking in, so the room goes back to where it was. */
  function close(restore) {
    if (root.hidden) return;
    clearTimeout(restTimer);
    root.hidden = true;
    document.body.classList.remove('lls-open');
    if (restore && roomBefore && roomBefore !== current()) void goTo(roomBefore);
  }

  window.addEventListener('resize', () => !root.hidden && fit());
  window.addEventListener(
    'keydown',
    (e) => {
      if (root.hidden) return;
      const k = e.key;
      const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'y', 'Y', 'n', 'N', 'a', 'A'].includes(k);
      if (!handled) return;
      e.preventDefault();
      e.stopPropagation();
      if (phase === 'ready') {
        if (k === 'y' || k === 'Y' || k === 'Enter') void jackIn();
        else if (k === 'n' || k === 'N' || k === 'Escape') back();
        return;
      }
      if (k === 'ArrowLeft') move(-1, 0);
      else if (k === 'ArrowRight') move(1, 0);
      else if (k === 'ArrowUp') move(0, -1);
      else if (k === 'ArrowDown') move(0, 1);
      else if (k === 'Enter' || k === ' ') lock();
      else if (k === 'Escape') back();
      else if (k === 'a' || k === 'A') toggleAll();
    },
    true,
  );
  banner.addEventListener('click', () => void jackIn());

  return { open, close: () => close(true), get isOpen() { return !root.hidden; } };
}
