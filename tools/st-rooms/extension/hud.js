// Lowlight's Keys bar over SillyTavern (with /lowchat on): the place, the clock and the weather on the left;
// YOU · PEOPLE · MAP and SYS on the right. YOU and PEOPLE open SillyTavern's persona and character panels; SYS
// holds the sound levels and every other SillyTavern panel. SillyTavern's own top bar is hidden under it.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** SillyTavern's panels, by the drawer that holds them. */
const PANELS = {
  you: '#persona-management-button',
  people: '#rightNavHolder',
  connection: '#sys-settings-button',
  ai: '#ai-config-button',
  formatting: '#advanced-formatting-button',
  lore: '#WI-SP-button',
  settings: '#user-settings-button',
  backgrounds: '#backgrounds-button',
  extensions: '#extensions-settings-button',
};
const togglePanel = (key) => document.querySelector(`${PANELS[key]} .drawer-toggle`)?.click();
const panelOpen = (key) => document.querySelector(`${PANELS[key]} .drawer-content`)?.classList.contains('openDrawer') ?? false;

/** A word with its Alt letter underlined (shown while Alt is held). */
function word(text, letter, cls) {
  const w = el('span', `llh-word ${cls}`);
  w.tabIndex = 0;
  const i = letter ? text.indexOf(letter) : -1;
  if (i < 0) w.textContent = text;
  else w.append(text.slice(0, i), el('u', '', letter), text.slice(i + 1));
  return w;
}

/** A 10-cell meter for a 0–1 level. */
function meter(v) {
  const m = el('span', 'llh-meter');
  for (let i = 0; i < 10; i++) m.append(el('i', i < Math.round(v * 10) ? 'on' : ''));
  return m;
}

/**
 * @param {{ room: any, map: any, onLowChat: (on: boolean) => void }} deps
 */
export function mountHud({ room, map, select, roomTools, residual }) {
  const root = el('div', 'llh-root');
  const band = el('div', 'llh-band');
  const bar = el('div', 'llh-bar');
  for (const pos of ['tl', 'tr']) root.append(el('div', `llh-corner ${pos}`));

  const place = el('span', 'llh-place', '——');
  const clock = el('span', 'llh-dim llh-clock');
  const weather = el('span', 'llh-dim llh-weather');
  const left = el('div', 'llh-group llh-left');
  left.append(place, clock, weather);

  const you = word('YOU', 'Y', 'llh-you');
  const people = word('PEOPLE', 'P', 'llh-people');
  const mapWord = word('MAP', 'M', 'llh-map');
  const link = el('span', 'llh-link');
  const sys = el('span', 'llh-sys');
  sys.tabIndex = 0;
  sys.append(link, el('span', '', 'SYS'), el('span', 'llh-caret', '▾'));
  const right = el('div', 'llh-group llh-right');
  right.append(you, people, mapWord, sys);
  bar.append(left, right);

  const menu = el('div', 'llh-menu');
  menu.hidden = true;
  root.append(band, bar, menu);
  document.body.append(root);

  you.addEventListener('click', () => togglePanel('you'));
  people.addEventListener('click', () => togglePanel('people'));
  mapWord.addEventListener('click', () => (map.isOpen ? map.close() : map.open()));

  // ── SYS ──
  const audio = room.audio;
  const ambientOf = (c) => Math.max(c.weather, c.room, c.lights);
  const step = (v, d) => Math.max(0, Math.min(1, Math.round((v + d * 0.05) * 20) / 20));
  /** The sound rows: [label, value 0–1 or null, click, step(d)]. */
  const soundRows = () => {
    const s = audio.settings();
    const on = audio.state().unlocked;
    return [
      ['SOUND', on ? (s.muted ? 0 : s.master) : null, () => audio.toggleMute(), (d) => audio.wheel(d), on ? (s.muted ? 'MUTED' : '') : 'CLICK TO START'],
      ['MUSIC', on ? s.channels.music : null, null, (d) => audio.setChannel('music', step(s.channels.music, d)), ''],
      ['AMBIENT', on ? ambientOf(s.channels) : null, null, (d) => { const v = step(ambientOf(s.channels), d); for (const ch of ['weather', 'room', 'lights']) audio.setChannel(ch, v); }, ''],
    ];
  };
  const panelRows = [
    ['CONNECTION', 'connection'],
    ['AI SETTINGS', 'ai'],
    ['FORMATTING', 'formatting'],
    ['LORE', 'lore'],
    ['SETTINGS', 'settings'],
    ['BACKGROUNDS', 'backgrounds'],
    ['EXTENSIONS', 'extensions'],
  ];
  function paintMenu() {
    menu.replaceChildren();
    for (const [label, v, click, stepBy, note] of soundRows()) {
      const row = el('div', 'llh-row');
      row.append(el('span', 'llh-label', label));
      if (note) row.append(el('span', 'llh-note', note));
      if (v !== null) {
        const less = el('i', 'llh-step', '‹');
        const more = el('i', 'llh-step', '›');
        less.addEventListener('click', (e) => { e.stopPropagation(); stepBy(-1); paintMenu(); });
        more.addEventListener('click', (e) => { e.stopPropagation(); stepBy(1); paintMenu(); });
        row.append(less, meter(v), more);
      }
      row.addEventListener('wheel', (e) => { e.preventDefault(); stepBy(e.deltaY < 0 ? 1 : -1); paintMenu(); }, { passive: false });
      if (click) row.addEventListener('click', () => { click(); paintMenu(); });
      menu.append(row);
    }
    menu.append(el('div', 'llh-rule'));
    // CAST: the package's cast, installed or not, and Lowlight's newer cards (dev setups have no package cast).
    const castInfo = window.lowlightCast?.status();
    if (castInfo?.isPackage) {
      const castRow = el('div', 'llh-row');
      const value = !castInfo.accepted ? 'INSTALL ›' : castInfo.cardUpdates ? `${castInfo.cardUpdates} CARDS HAVE UPDATES · UPDATE CARDS ›` : `INSTALLED · ${castInfo.installed}`;
      castRow.append(el('span', 'llh-label', 'CAST'), el('span', 'llh-value', value));
      castRow.addEventListener('click', () => {
        closeMenu();
        if (!castInfo.accepted) void window.lowlightCast.install();
        else if (castInfo.cardUpdates) void window.lowlightCast.updateCards();
      });
      menu.append(castRow);
    }
    const pick = el('div', 'llh-row');
    pick.append(el('span', 'llh-label', 'SELECT'), el('span', 'llh-value', 'WHO YOU ARE · WHO YOU SEE ›'));
    pick.addEventListener('click', () => { closeMenu(); select.open(); });
    menu.append(pick);
    for (const [label, key] of panelRows) {
      const row = el('div', `llh-row${panelOpen(key) ? ' on' : ''}`);
      row.append(el('span', 'llh-label', label), el('span', 'llh-value', panelOpen(key) ? 'OPEN' : '›'));
      row.addEventListener('click', () => { togglePanel(key); closeMenu(); });
      menu.append(row);
    }
    menu.append(el('div', 'llh-rule'));
    const tools = el('div', 'llh-row');
    tools.append(el('span', 'llh-label', 'HER ROOM TOOLS'), el('span', 'llh-value', !roomTools.isOn() ? 'OFF' : roomTools.canCall() ? 'ON' : 'ON · FUNCTION CALLING OFF'));
    tools.addEventListener('click', () => { roomTools.set(!roomTools.isOn()); paintMenu(); });
    menu.append(tools);
    // Her Residual: ON/OFF, the ledger, and a dot for the last run (dim: ran; red: failed, why on hover).
    if (residual) {
      const res = el('div', 'llh-row');
      const state = el('span', 'llh-value', residual.isOn() ? 'ON' : 'OFF');
      const book = el('span', 'llh-value llr-open', '· LEDGER ›');
      const last = residual.status();
      res.append(el('span', 'llh-label', 'RESIDUAL'), state, book);
      if (last) {
        const dot = el('span', `llr-dot${last.ok ? '' : ' bad'}`);
        dot.title = last.ok ? 'Last run kept the ledger' : `Last run failed: ${last.why}`;
        res.append(dot);
      }
      state.addEventListener('click', (e) => { e.stopPropagation(); residual.set(!residual.isOn()); paintMenu(); });
      book.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); residual.openLedger(); });
      menu.append(res);
    }
    const look = el('div', 'llh-row');
    look.append(el('span', 'llh-label', 'LOOK'), el('span', 'llh-value', 'LOWLIGHT · SWITCH TO SILLYTAVERN'));
    look.addEventListener('click', () => { closeMenu(); SillyTavern.getContext().executeSlashCommandsWithOptions('/lowchat'); });
    menu.append(look, el('div', 'llh-foot', 'ALT+Y YOU · ALT+P PEOPLE · ALT+M MAP · /select · /lowchat'));
  }
  const closeMenu = () => {
    menu.hidden = true;
    sys.classList.remove('open');
  };
  sys.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) return closeMenu();
    paintMenu();
    menu.hidden = false;
    sys.classList.add('open');
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', closeMenu);

  // ── keys: Alt shows the letters; Alt+Y / Alt+P open YOU / PEOPLE (Alt+M is the map's, in index.js); Esc closes SYS ──
  window.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('lowlight-chat')) return;
    if (e.key === 'Alt') bar.classList.add('alt-held');
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyY') { e.preventDefault(); togglePanel('you'); }
    if (e.code === 'KeyP') { e.preventDefault(); togglePanel('people'); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') bar.classList.remove('alt-held'); });
  window.addEventListener('blur', () => bar.classList.remove('alt-held'));

  // ── live parts: place, clock, weather, the link light, which words are lit ──
  const pct = (v) => `${Math.round(v * 100)}%`;
  function tick() {
    place.textContent = (room.sceneName() ?? '——').toUpperCase();
    const now = new Date();
    clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const atm = room.renderer.current?.atmosphere;
    weather.textContent = !atm || atm.weather === 'none' || atm.weatherLevel <= 0 ? 'CLEAR' : `${atm.weather.toUpperCase()} ${pct(atm.weatherLevel)}`;
    const status = SillyTavern.getContext().onlineStatus;
    link.dataset.status = status && status !== 'no_connection' ? 'ok' : 'down';
    sys.classList.toggle('down', link.dataset.status === 'down');
    you.classList.toggle('open', panelOpen('you'));
    people.classList.toggle('open', panelOpen('people'));
    mapWord.classList.toggle('open', map.isOpen);
  }
  tick();
  setInterval(tick, 500);
  return { root, closeMenu };
}
