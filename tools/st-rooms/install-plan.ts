// What the package installs into someone's SillyTavern on load (spec 2026-10-23 §3): pure, so every case is a test.
// The extension (extension/installer.js) carries the plan out through SillyTavern's own endpoints.
import type { CastJson } from './cast';

/** SillyTavern's extensionSettings.lowlight. `hashes[id]` is "card|sprites|persona" as last installed. */
export interface LowlightSettings {
  answered: boolean;
  accepted: boolean;
  installed: string[];
  hashes: Record<string, string>;
  /** The package version last loaded ('' before the first install finished). */
  version: string;
  tools: boolean;
}

export interface InstallPlan {
  /** Character ids to install now. */
  install: string[];
  /** Ids not installed: SillyTavern already has a card by that name. */
  skip: { id: string; why: 'name-taken' }[];
  /** Installed ids whose sprites or persona picture changed: re-uploaded on their own. */
  refresh: { id: string; parts: ('sprites' | 'persona')[] }[];
  /** Installed ids whose card text changed: offered under SYS → CAST, never applied by themselves. */
  cardUpdates: string[];
  /** Replace the Lowlight lore book. */
  lore: boolean;
  /** Ids to announce (NEW IN LOWLIGHT): new on an update, not on the first install. */
  isNew: string[];
}

export const hashKey = (h: { card: string; sprites: string; persona: string | null }) => `${h.card}|${h.sprites}|${h.persona ?? ''}`;

/** `existing.cards`: SillyTavern's characters, by their card name (what "taken" means) and their file. */
export function planInstall(cast: CastJson, saved: LowlightSettings, existing: { cards: { name: string; avatar: string }[]; personas: Record<string, string> }): InstallPlan {
  if (!saved.answered || !saved.accepted) return { install: [], skip: [], refresh: [], cardUpdates: [], lore: false, isNew: [] };
  const taken = new Set(existing.cards.map((c) => c.name));
  const installed = new Set(saved.installed);
  const firstInstall = saved.installed.length === 0 && !saved.version;
  const plan: InstallPlan = { install: [], skip: [], refresh: [], cardUpdates: [], lore: false, isNew: [] };
  for (const c of cast.characters) {
    if (installed.has(c.id)) {
      // Installed once and since deleted by the user: left alone.
      if (!taken.has(c.name)) continue;
      const [card, sprites, persona] = (saved.hashes[c.id] ?? '||').split('|');
      if (card !== c.hash.card) plan.cardUpdates.push(c.id);
      const parts: ('sprites' | 'persona')[] = [];
      if (sprites !== c.hash.sprites) parts.push('sprites');
      if (c.hash.persona && persona !== c.hash.persona) parts.push('persona');
      if (parts.length) plan.refresh.push({ id: c.id, parts });
      continue;
    }
    if (taken.has(c.name)) {
      plan.skip.push({ id: c.id, why: 'name-taken' });
      continue;
    }
    plan.install.push(c.id);
    if (!firstInstall && saved.version) plan.isNew.push(c.id);
  }
  plan.lore = saved.version !== cast.version || plan.install.length > 0;
  return plan;
}
