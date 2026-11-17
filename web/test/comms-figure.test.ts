import { describe, expect, it } from 'vitest';
import { dressSceneFor, faceShows, herSide } from '../src/room/comms-figure';

const s = (o: Partial<Parameters<typeof herSide>[0]> = {}) => ({ comms: false, beatRoom: false, beatGuest: false, beatComms: false, beatHere: false, ...o });

describe('herSide (comms figure, 2026-11-08)', () => {
  it('in the room she is as she is, with or without a comms figure', () => {
    expect(herSide(s(), true)).toBe('her');
    expect(herSide(s(), false)).toBe('her');
  });
  it('on a call or a beat in another room she stands in her comms figure, or is hidden without one', () => {
    expect(herSide(s({ comms: true }), true)).toBe('comms');
    expect(herSide(s({ beatRoom: true }), true)).toBe('comms');
    expect(herSide(s({ comms: true }), false)).toBe('hidden');
    expect(herSide(s({ beatRoom: true }), false)).toBe('hidden');
  });
  it('on a comms: beat she takes her comms figure; without one she stays as she is', () => {
    expect(herSide(s({ beatComms: true }), true)).toBe('comms');
    expect(herSide(s({ beatComms: true }), false)).toBe('her');
  });
  it('a beat that brought a guest leaves the slot to them', () => {
    expect(herSide(s({ beatRoom: true, beatGuest: true }), true)).toBe('her');
    expect(herSide(s({ beatRoom: true, beatGuest: true }), false)).toBe('her');
  });
  it('on a here beat she is in the room as herself, figure or not (House Glass spec)', () => {
    expect(herSide(s({ beatRoom: true, beatHere: true }), true)).toBe('her');
    expect(herSide(s({ beatRoom: true, beatHere: true }), false)).toBe('her');
    // A map call during the job still puts her on the line.
    expect(herSide(s({ comms: true, beatRoom: true, beatHere: true }), true)).toBe('comms');
    expect(herSide(s({ comms: true, beatRoom: true, beatHere: true }), false)).toBe('hidden');
  });
});

// Final review I1–I2 (House Glass): on a here beat she's dressed for the beat's room and her face follows her.
describe('dressSceneFor', () => {
  it('keeps her in the outfit she arrived in during a beat room, here or not (playtest call, 2026-11-08)', () => {
    expect(dressSceneFor('velvet/bathhouse', { beatRoom: 'velvet/bathhouse', realRoom: 'karasu/lowlight-intake' })).toBe('karasu/lowlight-intake');
    expect(dressSceneFor('karasu/lowlight-intake', { beatRoom: 'velvet/bathhouse', realRoom: 'karasu/lowlight-intake' })).toBe('karasu/lowlight-intake');
    expect(dressSceneFor('karasu/the-tilt', { beatRoom: null, realRoom: 'karasu/lowlight-intake' })).toBe('karasu/the-tilt');
    expect(dressSceneFor('velvet/bathhouse', { beatRoom: 'velvet/bathhouse', realRoom: null })).toBe('velvet/bathhouse');
  });
});
describe('faceShows', () => {
  it('her face follows her in the room and on a here beat, not on the line', () => {
    expect(faceShows({ beatRoom: null, beatHere: false, rightShows: 'her' })).toBe(true);
    expect(faceShows({ beatRoom: 'velvet/bathhouse', beatHere: true, rightShows: 'her' })).toBe(true);
    expect(faceShows({ beatRoom: 'velvet/bathhouse', beatHere: false, rightShows: 'comms' })).toBe(false);
    expect(faceShows({ beatRoom: 'velvet/bathhouse', beatHere: true, rightShows: 'comms' })).toBe(false);
  });
});
