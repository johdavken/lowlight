// Carries out an install plan (install-plan.ts) through SillyTavern's own endpoints (spec 2026-10-23 §3): cards by
// character import, expression sprites by sprite upload, persona pictures by avatar upload plus their name and bio,
// the lore book by World Info import. Each character is recorded the moment it's done, so a failure partway resumes.

const ctx = () => SillyTavern.getContext();
/** SillyTavern's request headers without the JSON content type (a multipart body sets its own). */
const headers = () => {
  const h = { ...ctx().getRequestHeaders() };
  delete h['Content-Type'];
  return h;
};

async function upload(url, fields, file, name) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('avatar', file, name);
  const r = await fetch(url, { method: 'POST', headers: headers(), body: form });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The package's files, fetched once each (several sprite labels share a figure). */
function files(base) {
  const cache = new Map();
  return (rel) => {
    if (!cache.has(rel)) cache.set(rel, fetch(new URL(rel, base)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${rel} → ${r.status}`)))));
    return cache.get(rel);
  };
}

const settings = () => {
  const es = ctx().extensionSettings;
  es.lowlight ??= { answered: false, accepted: false, installed: [], hashes: {}, version: '', tools: true };
  es.lowlight.installed ??= [];
  es.lowlight.hashes ??= {};
  return es.lowlight;
};
const hashKey = (h) => `${h.card}|${h.sprites}|${h.persona ?? ''}`;

async function sprites(c, get) {
  for (const [label, rel] of Object.entries(c.sprites)) await upload('/api/sprites/upload', { name: c.name, label }, await get(rel), `${label}.png`);
}

async function persona(c, get) {
  if (!c.persona) return;
  await upload('/api/avatars/upload', { overwrite_name: c.persona.file }, await get(c.persona.picture), c.persona.file);
  const pu = ctx().powerUserSettings;
  const name = pu.personas[c.persona.file];
  // A persona the user has named or edited stays theirs; SillyTavern names a new picture "[Unnamed Persona]" by itself.
  if (!name || (name === '[Unnamed Persona]' && !pu.persona_descriptions[c.persona.file]?.description)) {
    pu.personas[c.persona.file] = c.persona.name;
    pu.persona_descriptions[c.persona.file] = { description: c.persona.description, position: 0 };
  }
}

/** Imports a card; `overwrite`: over this file (its name without .png), as UPDATE CARDS does. */
async function card(c, get, overwrite = null) {
  await upload('/api/characters/import', overwrite ? { file_type: 'png', preserved_name: overwrite } : { file_type: 'png' }, await get(c.card), `${c.name}.png`);
}

/**
 * @param {import('../install-plan').InstallPlan} plan
 * @param {import('../cast').CastJson} cast
 * @param {string} base the package's cast/ folder URL (ends in /)
 * @returns {Promise<{ done: string[], failed: { id: string, why: string }[] }>}
 */
export async function runInstall(plan, cast, base, onItem = () => {}) {
  const get = files(base);
  const byId = new Map(cast.characters.map((c) => [c.id, c]));
  const s = settings();
  const done = [];
  const failed = [];
  const save = () => ctx().saveSettingsDebounced();
  for (const id of plan.install) {
    const c = byId.get(id);
    try {
      // The card last: until it's in, a half-done character isn't "yours" on the next load (sprite folders and persona
      // pictures are keyed by name, and re-uploads overwrite), so it simply installs again.
      await sprites(c, get);
      await persona(c, get);
      await card(c, get);
      if (!s.installed.includes(id)) s.installed.push(id);
      s.hashes[id] = hashKey(c.hash);
      save();
      done.push(id);
      onItem(id);
    } catch (e) {
      failed.push({ id, why: String(e?.message ?? e) });
    }
  }
  for (const { id, parts } of plan.refresh) {
    const c = byId.get(id);
    try {
      if (parts.includes('sprites')) await sprites(c, get);
      if (parts.includes('persona')) await persona(c, get);
      // The card part of the hash stays as it was: card text waits for UPDATE CARDS.
      const [oldCard] = (s.hashes[id] ?? '').split('|');
      s.hashes[id] = hashKey({ ...c.hash, card: oldCard || c.hash.card });
      save();
    } catch (e) {
      failed.push({ id, why: String(e?.message ?? e) });
    }
  }
  if (plan.lore) {
    try {
      await upload('/api/worldinfo/import', {}, await get('lore/Lowlight.json'), 'Lowlight.json');
    } catch (e) {
      failed.push({ id: 'lore', why: String(e?.message ?? e) });
    }
  }
  if (done.length || plan.refresh.length) await ctx().getCharacters?.();
  return { done, failed };
}

/** UPDATE CARDS: Lowlight's newer cards over their own files (chats stay: SillyTavern keeps them by character). */
export async function updateCards(ids, cast, base) {
  const get = files(base);
  const s = settings();
  const byId = new Map(cast.characters.map((c) => [c.id, c]));
  const done = [];
  const files = new Map(ctx().characters.map((ch) => [ch.name, String(ch.avatar).replace(/\.png$/i, '')]));
  for (const id of ids) {
    const c = byId.get(id);
    // Over the card's own file, whatever SillyTavern named it.
    await card(c, get, files.get(c.name) ?? c.name);
    const [, spr, per] = (s.hashes[id] ?? '||').split('|');
    s.hashes[id] = `${c.hash.card}|${spr}|${per}`;
    done.push(id);
  }
  ctx().saveSettingsDebounced();
  await ctx().getCharacters?.();
  return done;
}

export { settings as lowlightSettings };
