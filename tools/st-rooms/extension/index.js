// Lowlight's live room behind SillyTavern's chat, with its sound. /room <folder>, /mood <name|default>, /map (Alt+M),
// /music and /ambient <0-100>, /lowchat.
import { mountMap, mountRoom } from './lowlight-room.js';
import { getUserAvatar, user_avatar } from '../../../personas.js';
import { mountHud } from './hud.js';
import { mountSelect } from './select.js';
import { mountSubtitles } from './subtitles.js';
import { mountRoomTools } from './room-tools.js';
import { planInstall, planSettings } from './lowlight-room.js';
import { runInstall, updateCards, lowlightSettings } from './installer.js';
import { showNotice, showWelcome } from './welcome.js';

const BASE = new URL('./rooms/', import.meta.url).href;
// The bundle's stylesheet (the map, its fonts) and the map's rules copied from the game's: SillyTavern loads only style.css.
for (const css of ['lowlight-room.css', 'map-game.css', 'panels.css', 'select.css', 'welcome.css']) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL(`./${css}`, import.meta.url).href;
  document.head.append(link);
}
const ROOMS = await (await fetch(new URL('./rooms.json', import.meta.url))).json();
/** The cast's details and personas (npm run st-cast writes cast.json); {} before it has run. */
/** The cast (cast.json): the package's cast/cast.json, else the one npm run st-cast writes beside the extension; {} with neither. */
const fetchJson = (rel) => fetch(new URL(rel, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const packageCast = await fetchJson('./cast/cast.json');
/** The package installs its own cast (welcome, installer); a developer's own setup (npm run st-cast) already has it. */
const IS_PACKAGE = Boolean(packageCast);
const CAST_BASE = new URL('./cast/', import.meta.url).href;
const cast = packageCast ?? (await fetchJson('./cast.json')) ?? {};
/** Each room's name and district, for her room line (build.ts writes it). */
const META = await fetch(new URL('./rooms-meta.json', import.meta.url)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

const host = document.createElement('div');
host.id = 'lowlight-room';
document.getElementById('bg1').after(host);
document.body.classList.add('lowlight-room-on');

// The speaker in the top bar (Lowlight's HUD speaker): click mutes, scroll sets the volume.
const speaker = document.createElement('div');
speaker.id = 'lowlight-sound';
speaker.className = 'drawer-icon fa-solid fa-volume-off fa-fw closedIcon interactable';
speaker.tabIndex = 0;
speaker.title = 'Lowlight sound: click anywhere to start it';
function showSound(v) {
  const icon = v.kind !== 'on' ? 'fa-volume-off' : v.muted ? 'fa-volume-xmark' : 'fa-volume-high';
  speaker.classList.remove('fa-volume-off', 'fa-volume-xmark', 'fa-volume-high');
  speaker.classList.add(icon);
  speaker.title =
    v.kind === 'on'
      ? `Lowlight sound ${v.muted ? 'muted' : `${Math.round(v.volume * 100)}%`} · music ${Math.round(v.music * 100)}% · ambient ${Math.round(v.ambient * 100)}% (click mutes, scroll sets the volume)`
      : v.kind === 'hidden'
        ? "Lowlight sound isn't available in this browser"
        : 'Lowlight sound: click anywhere to start it';
}

/** Which shared sounds this build has (build.ts): the full set in a developer's own build, CC0 picks or nothing in the public package. */
const SOUND_MAP = await fetchJson('./sound-map.json');
const room = await mountRoom(host, BASE, new URL('./sound/', import.meta.url).href, showSound, SOUND_MAP ?? undefined);
speaker.addEventListener('click', () => room.audio.toggleMute());
speaker.addEventListener('wheel', (e) => {
  e.preventDefault();
  room.audio.wheel(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
window.lowlightRoom = room;
// You on the left (your persona's picture), as in Lowlight's stage; she stands on the right.
const you = document.createElement('div');
you.id = 'lowlight-persona';
// Its own class: SillyTavern's expressions code takes over anything classed expression-holder.
you.className = 'lowlight-figure';
const youImg = document.createElement('img');
youImg.alt = '';
you.append(youImg);
document.body.append(you);
function showYou() {
  const inChat = SillyTavern.getContext().characterId !== undefined;
  youImg.src = inChat && user_avatar ? getUserAvatar(user_avatar) : '';
  you.hidden = !youImg.src;
}

// Both sprites take the room's light (Lowlight's figure lighting); the filter sits in each holder, read by its img.
room.light(() => [...document.querySelectorAll('#expression-holder, #lowlight-persona')].filter((h) => h.offsetParent));
let current = ROOMS.includes('lowlight-intake') ? 'lowlight-intake' : ROOMS[0];
await room.load(current);

/** Fades to another room. */
/** Room changes run one after another, whoever asks (a chat's saved room, the select, the map, her go_to): two fades
 * at once could finish in either order and leave the wrong room showing. */
let goChain = Promise.resolve();
function goTo(folder) {
  goChain = goChain
    .then(() =>
      // `current` changes the moment the new room loads (mid-fade), so the room and its name never disagree.
      room.renderer.playTransition('fade', async () => {
        await room.load(folder, 1.2);
        current = folder;
      }),
    )
    .catch((e) => console.warn('[lowlight] changing room failed', e));
  return goChain;
}

// The travel note (Lowlight's [travel] line): her next reply is told you both just arrived. Cleared once she has answered.
const TRAVEL_KEY = 'lowlight-travel';
function travelNote(text) {
  const c = SillyTavern.getContext();
  c.setExtensionPrompt(TRAVEL_KEY, text, 1, 0, false, 0);
}

// The city map: GO fades to the place's room, tells her, and asks for her arrival beat (as Lowlight's travel does).
const mapHost = document.createElement('div');
mapHost.id = 'lowlight-map';
document.body.append(mapHost);
const map = mountMap(mapHost, {
  mapUrl: new URL('./map/lowlight.json', import.meta.url).href,
  here: () => current,
  canGo: (folder) => ROOMS.includes(folder),
  onTravel: async (place, folder) => {
    await goTo(folder);
    yourChange();
    const c = SillyTavern.getContext();
    if (c.characterId === undefined) return;
    travelNote(`[travel: ${c.name1} has just walked you both to ${place.name}; you've just arrived together. Answer arriving there in one beat, in character, shaped by the place and the moment.]`);
    await c.executeSlashCommandsWithOptions('/trigger');
  },
});
window.lowlightMap = map;
const toggleMap = () => (map.isOpen ? map.close() : map.open());
// Lowlight's character select: SYS → SELECT, /select, and on its own whenever no chat is open (with /lowchat on).
const CUES = { move: 0.6, confirm: 0.9, lock: 0.9, vs: 0.9 };
const select = mountSelect({
  cast,
  rooms: ROOMS,
  current: () => current,
  goTo,
  menu: (on) => room.menu(on),
  // A cue this build doesn't have stays silent (the public package: until CC0 cues are picked).
  cue: (name) => {
    const file = SOUND_MAP ? SOUND_MAP.cues[name] : `ui/${name}.ogg`;
    if (file) room.audio.cue(new URL(`./sound/${file}`, import.meta.url).href, CUES[name] * 0.25);
  },
});
window.lowlightSelect = select;
// Lowlight's Keys bar in place of SillyTavern's top bar (with /lowchat on).
// Her room tools, her room line, and the room saved on every message (on unless SYS → HER ROOM TOOLS is off).
const settings = () => {
  const es = SillyTavern.getContext().extensionSettings;
  es.lowlight ??= {};
  return es.lowlight;
};
const roomTools = mountRoomTools({ room, cast, rooms: ROOMS, meta: META, current: () => current, goTo, idle: () => goChain });
roomTools.setEnabled(settings().tools !== false);
window.lowlightRoomTools = roomTools;
const setRoomTools = (on) => {
  settings().tools = on;
  SillyTavern.getContext().saveSettingsDebounced();
  roomTools.setEnabled(on);
};
/** A room change of yours (/room, /mood, the map): saved on the newest message, and her line follows. */
const yourChange = async () => {
  await roomTools.stamp();
  roomTools.refreshLine();
};
mountHud({ room, map, select, roomTools: { isOn: () => roomTools.isEnabled(), canCall: () => roomTools.canCall(), set: setRoomTools } });

// A map icon in SillyTavern's top bar.
const mapBtn = document.createElement('div');
mapBtn.id = 'lowlight-map-button';
mapBtn.className = 'drawer-icon fa-solid fa-map fa-fw closedIcon interactable';
mapBtn.title = 'Lowlight map (Alt+M)';
mapBtn.tabIndex = 0;
mapBtn.addEventListener('click', toggleMap);
document.getElementById('top-settings-holder')?.append(mapBtn, speaker);
window.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyM') {
    e.preventDefault();
    toggleMap();
  }
});

const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE, eventSource, eventTypes } = SillyTavern.getContext();
// Dev setup only (npm run st-cast writes cast.json beside the extension): the cast's personas, any missing added, one
// you've edited left alone. The package's installer does this for its own cast.
if (!IS_PACKAGE) try {
  const pu = SillyTavern.getContext().powerUserSettings;
  let added = 0;
  for (const p of (cast.characters ?? []).map((c) => c.persona).filter(Boolean)) {
    // SillyTavern registers a new picture by itself as an unnamed, empty persona: that one still counts as missing.
    const unnamed = !pu.personas[p.file] || (pu.personas[p.file] === '[Unnamed Persona]' && !pu.persona_descriptions[p.file]?.description);
    if (!unnamed) continue;
    pu.personas[p.file] = p.name;
    pu.persona_descriptions[p.file] = { description: p.description, position: 0 };
    added++;
  }
  if (added) SillyTavern.getContext().saveSettingsDebounced();
} catch {
  // No cast.json yet (st-cast hasn't run): nothing to add.
}

eventSource.on(eventTypes.CHAT_CHANGED, showYou);
eventSource.on(eventTypes.PERSONA_CHANGED, showYou);
eventSource.on(eventTypes.MESSAGE_RECEIVED, () => travelNote(''));
eventSource.on(eventTypes.CHAT_CHANGED, () => travelNote(''));
showYou();

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'room',
  helpString: `Lowlight room behind the chat: ${ROOMS.join(', ')}.`,
  unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'room folder', typeList: [ARGUMENT_TYPE.STRING], isRequired: true, enumList: ROOMS })],
  callback: async (_args, folder) => {
    const name = String(folder).trim();
    if (!ROOMS.includes(name)) return `No room ${name}. Rooms: ${ROOMS.join(', ')}`;
    await goTo(name);
    yourChange();
    return `Moods: ${room.moods().join(', ')}`;
  },
}));

// Lowlight's subtitle chat look; remembered per browser.
const CHAT_KEY = 'lowlight-chat';
function setLowChat(on) {
  document.body.classList.toggle('lowlight-chat', on);
  try { localStorage.setItem(CHAT_KEY, on ? '1' : '0'); } catch { /* private window */ }
}
let lowChat = true;
try { lowChat = localStorage.getItem(CHAT_KEY) !== '0'; } catch { /* private window */ }
setLowChat(lowChat);
// The dialogue box's paging and Page Up history (with /lowchat on).
window.lowlightSubtitles = mountSubtitles();

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'lowchat',
  helpString: 'Lowlight subtitle chat on/off (off shows the whole log).',
  callback: () => {
    setLowChat(!document.body.classList.contains('lowlight-chat'));
    return '';
  },
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'select',
  helpString: "Lowlight's character select: who you are, then who you see.",
  callback: () => {
    select.open();
    return '';
  },
}));

// ── The package's cast (spec 2026-10-23 §3): ask once, install, then on each update add new characters and refresh art ──
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** The latest line of the package's CHANGELOG.md (its first "- " line), or ''. */
const latestChange = async () => {
  const text = await fetch(new URL('./CHANGELOG.md', import.meta.url)).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  return (/^- (.+)$/m.exec(text)?.[1] ?? '').trim();
};
const namesOf = (ids) => ids.map((id) => cast.characters.find((c) => c.id === id)?.name ?? id).map((n) => n.toUpperCase()).join(', ');
/** The plan for this load (what to install, refresh, offer), from SillyTavern's own lists. */
const castPlan = () => {
  const c = SillyTavern.getContext();
  return planInstall(cast, lowlightSettings(), { cards: c.characters.map((ch) => ({ name: ch.name, avatar: ch.avatar })), personas: c.powerUserSettings.personas });
};
async function installNow() {
  const s = lowlightSettings();
  const firstVersion = !s.version;
  const plan = castPlan();
  const result = plan.install.length || plan.refresh.length || plan.lore ? await runInstall(plan, cast, CAST_BASE) : { done: [], failed: [] };
  const lines = [];
  if (plan.isNew.length) lines.push(`NEW IN LOWLIGHT: ${namesOf(plan.isNew.filter((id) => result.done.includes(id)))}`);
  else if (firstVersion && result.done.length) lines.push(`INSTALLED: ${result.done.length} CHARACTERS`);
  if (plan.skip.length) lines.push(`KEPT YOUR OWN: ${namesOf(plan.skip.map((k) => k.id))}`);
  if (result.failed.length) lines.push(`COULDN'T INSTALL: ${namesOf(result.failed.map((f) => f.id))} (they'll try again next time)`);
  if (s.version && s.version !== cast.version) lines.push(await latestChange());
  // The version is only recorded once everything went in, so a failure tries again on the next load.
  if (!result.failed.length) s.version = cast.version;
  SillyTavern.getContext().saveSettingsDebounced();
  showNotice(lines);
}
/** Resolves once SillyTavern's own first-run dialog (its persona prompt) has closed: browser dialogs sit above all. */
async function noDialogOpen() {
  while (document.querySelector('dialog[open]')) await wait(400);
}
const castReady = (async () => {
  if (!IS_PACKAGE || !cast.characters?.length) return;
  // Once SillyTavern has its characters (APP_READY replays to late listeners), so the plan sees what's really there.
  await new Promise((r) => eventSource.once(eventTypes.APP_READY, r));
  await wait(800);
  const s = lowlightSettings();
  if (!s.answered) {
    await noDialogOpen();
    // What Y would change, worked out now so the welcome can say so (SillyTavern's settings, shared by all chats).
    const c = SillyTavern.getContext();
    const settings = planSettings({
      mainApi: String(c.mainApi ?? ''),
      functionCalling: Boolean(document.getElementById('openai_function_calling')?.checked),
      context: Number(c.chatCompletionSettings?.openai_max_context ?? 0),
    });
    const yes = await showWelcome(cast, settings.changes);
    s.answered = true;
    s.accepted = yes;
    if (yes) {
      const cb = document.getElementById('openai_function_calling');
      if (settings.functionCalling && cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // SillyTavern's untouched default (4,095 tokens, 1,500 kept for the reply) leaves no room for the chat once a
      // Lowlight card, the roleplay guide and the lore are in: the live check saw her answer with no history at all.
      const ctxSlider = document.getElementById('openai_max_context');
      if (settings.context && ctxSlider) {
        ctxSlider.value = settings.context;
        ctxSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const lines = [...settings.changes, ...settings.advice];
      if (lines.length) showNotice(['SETTINGS FOR LOWLIGHT', ...lines]);
    }
    SillyTavern.getContext().saveSettingsDebounced();
  }
  if (s.accepted) await installNow();
})();
window.lowlightCast = {
  /** SYS → CAST's line: accepted or not, how many installed, how many cards have updates. */
  status: () => {
    const s = lowlightSettings();
    return { isPackage: IS_PACKAGE, accepted: Boolean(s.accepted), installed: s.installed.length, cardUpdates: s.accepted ? castPlan().cardUpdates.length : 0 };
  },
  install: async () => {
    const s = lowlightSettings();
    s.answered = true;
    s.accepted = true;
    await installNow();
    select.open();
  },
  updateCards: async () => {
    const ids = castPlan().cardUpdates;
    await updateCards(ids, cast, CAST_BASE);
    showNotice([`CARDS UPDATED: ${namesOf(ids)}`]);
  },
};

// No chat open (SillyTavern's welcome screen): the select stands in for it, with the Lowlight look on, once the
// package's welcome (if any) is answered.
const selectIfNoChat = async () => {
  await castReady;
  if (document.body.classList.contains('lowlight-chat') && SillyTavern.getContext().characterId === undefined) select.open();
};
eventSource.on(eventTypes.CHAT_CHANGED, selectIfNoChat);
// On load, only once SillyTavern has had its chance to reopen your last chat (this can finish before it does).
eventSource.on(eventTypes.APP_READY, () => setTimeout(selectIfNoChat, 300));
setTimeout(selectIfNoChat, 2500);

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'map',
  helpString: "Lowlight's city map (also Alt+M): GO walks you both there and she answers arriving.",
  callback: () => {
    toggleMap();
    return '';
  },
}));

/** A 0–100 level as 0–1, or null when it isn't one. */
const level = (v) => {
  const n = Number(String(v).trim().replace(/%$/, ''));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : null;
};
for (const [name, channels, help] of [
  ['music', ['music'], "Lowlight's music level, 0–100 (SYS → MUSIC)."],
  ['ambient', ['weather', 'room', 'lights'], "Lowlight's ambient level, 0–100: rain, the room's sounds and light hums (SYS → AMBIENT)."],
]) {
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name,
    helpString: help,
    unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'level 0–100', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true })],
    callback: (_args, v) => {
      const l = level(v);
      if (l === null) return 'A level from 0 to 100.';
      for (const ch of channels) room.audio.setChannel(ch, l);
      return '';
    },
  }));
}

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'mood',
  helpString: 'Lowlight room mood (or "default").',
  unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'mood name', typeList: [ARGUMENT_TYPE.STRING], isRequired: true })],
  callback: (_args, name) => {
    if (!room.mood(String(name).trim())) return `Moods: ${room.moods().join(', ')}, default`;
    yourChange();
    return '';
  },
}));
