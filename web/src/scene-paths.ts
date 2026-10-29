/**
 * Where a room's files are served from. A city room knows its district and folder (`/scenes/karasu/noodle-stall/`);
 * a scene loaded from one district on its own (the splash, a select preview) carries neither and lives under
 * the base it came with.
 */
import type { SceneDef } from '../../shared/types';
import { idSeed } from './renderer/glow-alpha';

/** The room's own folder: its layers, light maps and sound bed. */
export function sceneDir(scene: SceneDef, base = '/scenes/'): string {
  return scene.district && scene.folder ? `/scenes/${scene.district}/${scene.folder}/` : `${base}${encodeURIComponent(scene.id)}/`;
}

/** The folder holding the room's songs (its district's `_music/`). */
export function musicDir(scene: SceneDef, base = '/scenes/'): string {
  return scene.district ? `/scenes/${scene.district}/` : base;
}

/** The room's effects seed: from its folder, so a room looks as it did before rooms had full names. */
export function effectsSeed(scene: SceneDef): number {
  return idSeed(scene.folder ?? scene.id);
}
