import { describe, expect, it } from 'vitest';
import type { ResidentInfo, SceneDef } from '../../shared/types';
import { residentOf } from '../src/room/resident';

const hae: ResidentInfo = { id: 'hae', name: 'Hae', pronoun: 'she', accent: '#ff8a3c', thumb: '/t', sprite: { url: '/s', crop: { top: 0, bottom: 0.5 } } };
const scene = (resident?: SceneDef['resident']) => ({ id: 'x', ...(resident ? { resident } : {}) }) as SceneDef;

describe('residentOf', () => {
  it("finds the scene's resident", () => {
    expect(residentOf(scene({ character: 'hae', scale: 0.78 }), { hae })).toBe(hae);
  });

  it('is null for no scene, no resident, or one that did not load', () => {
    expect(residentOf(undefined, { hae })).toBeNull();
    expect(residentOf(scene(), { hae })).toBeNull();
    expect(residentOf(scene({ character: 'cook', scale: 0.78 }), { hae })).toBeNull();
  });

  it("never mistakes an object's own built-ins for a resident", () => {
    expect(residentOf(scene({ character: 'constructor', scale: 0.78 }), { hae })).toBeNull();
    expect(residentOf(scene({ character: '__proto__', scale: 0.78 }), { hae })).toBeNull();
  });
});
