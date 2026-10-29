import { describe, expect, it, vi } from 'vitest';
import type { Atmosphere, RoomSoundDef, SceneDef } from '../../shared/types';
import { ENTRY_DELAY_SECONDS, RoomSounds } from '../src/audio/room-sounds';

const atmo: Atmosphere = { ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' };
const roomWith = (sounds: RoomSoundDef[], id = 'cafe'): SceneDef => ({ id, name: id, description: '', resolution: [480, 270], layers: [], lights: [], defaults: atmo, presets: {}, district: 'ribbon', folder: id, sound: { sounds } });
const url = (src: string, id = 'cafe') => `/scenes/ribbon/${id}/${src}`;

const door: RoomSoundDef = { name: 'door', src: 'sound/keep/door.ogg', onEntry: true, level: 0.7 };
const train: RoomSoundDef = { name: 'train', src: 'sound/keep/train.ogg', timer: { min: 1, max: 3 } };
const kettle: RoomSoundDef = { name: 'kettle', src: 'sound/keep/kettle.ogg', agent: { about: 'the kettle' } };

function setup(rng = () => 0.5) {
  const play = vi.fn();
  return { play, sounds: new RoomSounds({ play, rng }) };
}

describe('RoomSounds', () => {
  it('an entry sound plays 1.5 s after walking in, at its level, not before', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([door]), '/scenes/', 100, { entry: true });
    sounds.tick(100 + ENTRY_DELAY_SECONDS - 0.01);
    expect(play).not.toHaveBeenCalled();
    sounds.tick(100 + ENTRY_DELAY_SECONDS);
    expect(play).toHaveBeenCalledWith(url('sound/keep/door.ogg'), 0.7);
    sounds.tick(500);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('a timer waits min + rng × (max − min) minutes, plays at the default level, then waits again from then', () => {
    const { play, sounds } = setup(() => 0.5);
    sounds.enter(roomWith([train]), '/scenes/', 0, { entry: true });
    sounds.tick(119);
    expect(play).not.toHaveBeenCalled();
    sounds.tick(120);
    expect(play).toHaveBeenCalledWith(url('sound/keep/train.ogg'), 0.5);
    sounds.tick(239);
    expect(play).toHaveBeenCalledTimes(1);
    sounds.tick(240);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('a late tick plays a due timer once and waits again from the tick', () => {
    const { play, sounds } = setup(() => 0);
    sounds.enter(roomWith([train]), '/scenes/', 0, { entry: true });
    sounds.tick(1000);
    expect(play).toHaveBeenCalledTimes(1);
    sounds.tick(1059);
    expect(play).toHaveBeenCalledTimes(1);
    sounds.tick(1060);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('leave() cancels everything', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([door, train]), '/scenes/', 0, { entry: true });
    sounds.leave();
    sounds.tick(10_000);
    expect(play).not.toHaveBeenCalled();
    expect(sounds.play('door')).toBe(false);
  });

  it('enter without entry starts the timers but plays no entry sound', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([door, train]), '/scenes/', 0, { entry: false });
    sounds.tick(120);
    expect(play.mock.calls.map((c) => c[0])).toEqual([url('sound/keep/train.ogg')]);
  });

  it('a level-only edit keeps the wait', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([train]), '/scenes/', 0, { entry: true });
    sounds.update(roomWith([{ ...train, level: 0.2 }]), '/scenes/', 100);
    sounds.tick(120);
    expect(play).toHaveBeenCalledWith(url('sound/keep/train.ogg'), 0.2);
  });

  it('a timer edit restarts the wait from now', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([train]), '/scenes/', 0, { entry: true });
    sounds.update(roomWith([{ ...train, timer: { min: 2, max: 4 } }]), '/scenes/', 100);
    sounds.tick(120);
    expect(play).not.toHaveBeenCalled();
    sounds.tick(280);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('an added sound starts its timer only (no entry); a removed one never plays', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([train]), '/scenes/', 0, { entry: true });
    sounds.update(roomWith([{ ...door, timer: { min: 1, max: 1 } }]), '/scenes/', 10);
    sounds.tick(69);
    expect(play).not.toHaveBeenCalled();
    sounds.tick(70);
    expect(play.mock.calls.map((c) => c[0])).toEqual([url('sound/keep/door.ogg')]);
    sounds.tick(1000);
    expect(play.mock.calls.every((c) => c[0] !== url('sound/keep/train.ogg'))).toBe(true);
  });

  it("an update before the entry sound is due doesn't drop it", () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([door]), '/scenes/', 0, { entry: true });
    sounds.update(roomWith([{ ...door, level: 0.3 }]), '/scenes/', 0.5);
    sounds.tick(1.5);
    expect(play).toHaveBeenCalledWith(url('sound/keep/door.ogg'), 0.3);
  });

  it('a half-typed timer (0 to 0, an empty field) never plays; it starts once the numbers are valid (review)', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([{ ...train, timer: { min: 0, max: 0 } }, { ...door, onEntry: false, timer: { min: Number.NaN, max: 3 } }]), '/scenes/', 0, { entry: true });
    for (let t = 0; t < 10; t += 0.016) sounds.tick(t);
    expect(play).not.toHaveBeenCalled();
    sounds.update(roomWith([train]), '/scenes/', 10);
    sounds.tick(130);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('dropEntries() drops entry sounds not yet played, and keeps the timers (review)', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([door, train]), '/scenes/', 0, { entry: true });
    sounds.dropEntries();
    sounds.tick(120);
    expect(play.mock.calls.map((c) => c[0])).toEqual([url('sound/keep/train.ogg')]);
  });

  it('play(name) plays a sound of the room now; an unknown name is false', () => {
    const { play, sounds } = setup();
    sounds.enter(roomWith([kettle]), '/scenes/', 0, { entry: true });
    expect(sounds.play('kettle')).toBe(true);
    expect(play).toHaveBeenCalledWith(url('sound/keep/kettle.ogg'), 0.5);
    expect(sounds.play('nope')).toBe(false);
  });

  it('a room without district or folder plays from its base', () => {
    const { play, sounds } = setup();
    const { district: _d, folder: _f, ...plain } = roomWith([kettle]);
    sounds.enter(plain, '/scenes/p/', 0, { entry: true });
    sounds.play('kettle');
    expect(play).toHaveBeenCalledWith('/scenes/p/cafe/sound/keep/kettle.ogg', 0.5);
  });
});
