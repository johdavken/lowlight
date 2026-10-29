import type { ResidentInfo, SceneDef } from '../../../shared/types';

/** The resident a scene names, if she loaded; null for no scene, no resident, or an unknown one. */
export function residentOf(scene: SceneDef | undefined, residents: Record<string, ResidentInfo>): ResidentInfo | null {
  const id = scene?.resident?.character;
  return id !== undefined && Object.hasOwn(residents, id) ? residents[id] : null;
}
