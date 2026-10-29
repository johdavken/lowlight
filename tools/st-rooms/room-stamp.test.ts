import { describe, expect, it } from 'vitest';
import type { Atmosphere } from '../../shared/types';
import { roomFromChat, stampOf, withStamp, type RoomStamp, type StMessage } from './room-stamp';

const atm = { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.7, fog: 0.2, timeOfDay: 'night' } as Atmosphere;
const stamp = (room: string, mood: string | null = null): RoomStamp => ({ room, mood, atmosphere: atm, lights: [] });

describe('room stamps', () => {
  it('the newest stamp wins', () => {
    const chat: StMessage[] = [withStamp({}, stamp('lowlight-intake')), {}, withStamp({ is_user: true }, stamp('the-tilt'))];
    expect(roomFromChat(chat, null)).toMatchObject({ room: 'the-tilt' });
  });

  it('per swipe: each take keeps its own room', () => {
    const msg: StMessage = { swipe_id: 0, swipe_info: [{}, {}] };
    const late = withStamp(msg, stamp('lowlight-intake', 'late'));
    const onSecond = withStamp({ ...late, swipe_id: 1 }, stamp('lowlight-intake', 'storm'));
    expect(stampOf({ ...onSecond, swipe_id: 1 })?.mood).toBe('storm');
    expect(stampOf({ ...onSecond, swipe_id: 0 })?.mood).toBe('late');
  });

  it('after a delete: the previous stamp', () => {
    const chat: StMessage[] = [withStamp({}, stamp('lowlight-intake')), withStamp({}, stamp('ribbon-rooftop'))];
    expect(roomFromChat(chat.slice(0, 1), null)).toMatchObject({ room: 'lowlight-intake' });
  });

  it('falls back to the home room, then to nothing', () => {
    expect(roomFromChat([{}, { is_user: true }], 'the-tilt')).toEqual({ room: 'the-tilt' });
    expect(roomFromChat([{}], null)).toBeNull();
  });

  it('withStamp keeps other extras and copies nothing it was given by reference', () => {
    const msg: StMessage = { extra: { reasoning: 'thought' } };
    const out = withStamp(msg, stamp('lowlight-intake'));
    expect(out.extra?.reasoning).toBe('thought');
    expect(msg.extra?.lowlight).toBeUndefined();
  });

  it('a swipe with no stamp of its own falls back to the message stamp', () => {
    const msg = withStamp({}, stamp('lowlight-intake', 'quiet'));
    expect(stampOf({ ...msg, swipe_id: 2, swipe_info: [{}, {}, {}] })?.mood).toBe('quiet');
  });
});
