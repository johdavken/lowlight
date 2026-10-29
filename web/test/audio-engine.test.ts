import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { SILENT, type Mix } from '../src/audio/mix';
import { flickerFactor } from '../src/renderer/flicker';
import { FakeAudioContext, type FakeParam } from './fixtures/fake-audio';

const rainMix = (level: number, extra: Partial<Mix> = {}, heavy = 0, indoor = false): Mix => ({ ...SILENT, rain: { level, indoor, heavy }, ...extra });

function setup(opts: { fetchBuffer?: (ctx: AudioContext, url: string) => Promise<AudioBuffer>; rainUrls?: { light: string; heavy: string } | null } = {}) {
  const ctx = new FakeAudioContext();
  const warn = vi.fn();
  const createContext = vi.fn(() => ctx as unknown as AudioContext);
  const engine = new AudioEngine({ createContext, warn, fetchBuffer: opts.fetchBuffer, rainUrls: opts.rainUrls ?? null });
  const p = (param: AudioParam | undefined) => param as unknown as FakeParam;
  return { ctx, engine, warn, createContext, p };
}

describe('AudioEngine: unlock', () => {
  it('creates nothing before unlock', () => {
    const { engine, createContext, ctx } = setup();
    engine.apply(rainMix(0.5), 1);
    engine.tick(1);
    expect(createContext).not.toHaveBeenCalled();
    expect(ctx.nodes).toHaveLength(1); // only the destination the fake makes for itself
    expect(engine.state()).toMatchObject({ unlocked: false, available: true, voices: [] });
  });

  it('without Web Audio it stays silent and never throws', () => {
    const engine = new AudioEngine({ createContext: () => null });
    expect(engine.unlock()).toBe(false);
    expect(() => {
      engine.apply(rainMix(0.5), 1);
      engine.tick(1);
      engine.setMaster(0.5, false);
      engine.suspend();
      engine.resume();
    }).not.toThrow();
    expect(engine.state()).toMatchObject({ available: false, unlocked: false });
  });
});

describe('AudioEngine: voices and glides', () => {
  it('creates voices lazily, only for what the mix needs, and ramps silent ones down', () => {
    const { engine, p } = setup();
    engine.unlock();
    engine.apply(rainMix(0.5), 0);
    expect(engine.state().voices).toEqual(['rain']);
    engine.apply(SILENT, 0);
    expect(p(engine.debug().voice('rain')).last).toBe(0);
  });

  it('glides each change over the given duration', () => {
    const { engine, ctx, p } = setup();
    engine.unlock();
    ctx.currentTime = 10;
    engine.apply(rainMix(0.5), 2);
    const rain = p(engine.debug().voice('rain'));
    expect(rain.events.at(-1)).toEqual({ type: 'ramp', value: 0.5, time: 12 });
  });

  it('a change mid-glide restarts from where the glide actually is, not the param\'s reported value (Review Focus 2, final review 4)', () => {
    const { engine, ctx, p } = setup();
    engine.unlock();
    engine.apply(rainMix(0.8), 4); // 0 → 0.8 over 4 s
    const rain = p(engine.debug().voice('rain'));
    rain.value = 0.8; // some browsers report the target (or the intrinsic value) mid-automation
    ctx.currentTime = 1; // a quarter of the way: really at 0.2
    engine.apply(rainMix(0.1), 2);
    const tail = rain.events.slice(-3);
    expect(tail[0]).toEqual({ type: 'cancel', time: 1 });
    expect(tail[1].type).toBe('set');
    expect(tail[1].value).toBeCloseTo(0.2);
    expect(tail[2]).toEqual({ type: 'ramp', value: 0.1, time: 3 });
  });

  it('a fade scene change crossfades over at least 1.2 s; a glitch dips the master behind a static burst', () => {
    const { engine, ctx, p } = setup();
    engine.unlock();
    engine.apply(rainMix(0.5), 0, 'fade');
    expect(p(engine.debug().voice('rain')).events.at(-1)).toMatchObject({ type: 'ramp', time: 1.2 });
    const sourcesBefore = ctx.of('buffer-source').length;
    ctx.currentTime = 5;
    engine.apply(rainMix(0.6), 0, 'glitch');
    const master = p(engine.debug().master);
    // Silence held for the burst, then a quick return (final review 3).
    expect(master.events.slice(-3)).toEqual([
      { type: 'set', value: 0, time: 5 },
      { type: 'set', value: 0, time: 5.15 },
      { type: 'ramp', value: 0.6, time: 5.17 },
    ]);
    const burst = ctx.of('buffer-source').slice(sourcesBefore)[0];
    expect(burst).toBeDefined();
    // The burst stands in front of the dip: its chain reaches the output without passing the master gain.
    const reaches = (n: any, target: any, seen = new Set()): boolean =>
      n === target || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => reaches(c, target, seen))));
    const masterNode = ctx.of('gain').find((g: any) => g.gain === engine.debug().master);
    expect(reaches(burst, ctx.destination)).toBe(true);
    const viaMaster = (n: any, seen = new Set()): boolean =>
      n === masterNode || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => viaMaster(c, seen))));
    expect(viaMaster(burst)).toBe(false);
  });

  it('burst() plays a static burst without changing the mix', () => {
    const { engine, ctx, p } = setup();
    engine.unlock();
    engine.apply(rainMix(0.5), 0);
    const master = p(engine.debug().master);
    const masterEventsBefore = master.events.length;
    const rainEventsBefore = p(engine.debug().voice('rain')).events.length;
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.burst();
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore + 1);
    // The master gain and the mix are untouched — only the burst itself plays.
    expect(master.events.length).toBe(masterEventsBefore);
    expect(p(engine.debug().voice('rain')).events.length).toBe(rainEventsBefore);
    const burst = ctx.of('buffer-source').slice(sourcesBefore)[0];
    const reaches = (n: any, target: any, seen = new Set()): boolean =>
      n === target || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => reaches(c, target, seen))));
    expect(reaches(burst, ctx.destination)).toBe(true);
  });

  it('burst() without a context is a no-op', () => {
    const engine = new AudioEngine({ createContext: () => null });
    expect(() => engine.burst()).not.toThrow();
  });
});

describe('AudioEngine: levels', () => {
  it('master volume, mute, channel levels and the landing scale', () => {
    const { engine, p } = setup();
    engine.unlock();
    engine.setMaster(0.6, true);
    expect(p(engine.debug().master).last).toBe(0);
    engine.setMaster(0.6, false);
    expect(p(engine.debug().master).last).toBeCloseTo(0.6);
    engine.setScale(0.25);
    expect(p(engine.debug().master).last).toBeCloseTo(0.15);
    engine.setChannel('weather', 0.5);
    expect(p(engine.debug().channel.weather).last).toBe(0.5);
  });

  it('fog sets the high-shelf cut', () => {
    const { engine, p } = setup();
    engine.unlock();
    engine.apply({ ...SILENT, fogDb: -4.5 }, 0);
    expect(p(engine.debug().fog).last).toBe(-4.5);
  });
});

describe('AudioEngine: neon', () => {
  it('tick crackles each neon voice with the renderer flicker, same seed', () => {
    const { engine, p } = setup();
    engine.unlock();
    const neon = [{ id: 'sign', level: 0.06, flicker: 0.4, seed: 123, pan: -0.3 }];
    engine.apply({ ...SILENT, neon }, 0);
    expect(engine.state().voices).toEqual(['neon:sign']);
    engine.tick(2.5);
    expect(p(engine.debug().crackle('sign')).last).toBeCloseTo(flickerFactor(2.5, 0.4, 123));
    expect(p(engine.debug().voice('neon:sign')).last).toBeCloseTo(0.06);
  });
});

describe('AudioEngine: context state', () => {
  it('reports context state changes to a listener', () => {
    const { engine, ctx } = setup();
    const fn = vi.fn();
    engine.onStateChange(fn);
    engine.unlock();
    (ctx as any).onstatechange?.();
    expect(fn).toHaveBeenCalled();
  });
});

describe('AudioEngine: context lifecycle (Review Focus 3)', () => {
  it('suspend and resume call through; a refused resume is retried on the next unlock', async () => {
    const { engine, ctx } = setup();
    engine.unlock();
    engine.suspend();
    expect(ctx.suspendCalls).toBe(1);
    ctx.rejectResume = true;
    engine.resume();
    await Promise.resolve();
    await Promise.resolve();
    ctx.rejectResume = false;
    expect(engine.unlock()).toBe(true);
    expect(ctx.resumeCalls).toBe(2);
  });
});

describe('AudioEngine: beds (Review Focus 4)', () => {
  it('a bed for a scene the player already left is never played', async () => {
    let resolveA!: (b: AudioBuffer) => void;
    const fetchBuffer = vi.fn((_c: AudioContext, url: string) =>
      url.endsWith('a.ogg') ? new Promise<AudioBuffer>((r) => (resolveA = r)) : Promise.resolve({} as AudioBuffer),
    );
    const { engine } = setup({ fetchBuffer });
    engine.unlock();
    engine.apply({ ...SILENT, bed: { url: '/a.ogg', level: 0.5 } }, 0);
    engine.apply({ ...SILENT, bed: null }, 0);
    resolveA({} as AudioBuffer);
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state().voices).not.toContain('bed');
  });

  it('a bed that fails to load warns once and plays the hum fallback instead', async () => {
    const fetchBuffer = vi.fn(() => Promise.reject(new Error('404')));
    const { engine, warn, p } = setup({ fetchBuffer });
    engine.unlock();
    const mix: Mix = { ...SILENT, bed: { url: '/scenes/x/missing.ogg', level: 0.5 }, hum: { level: 0, fallback: 0.3 } };
    engine.apply(mix, 0);
    await new Promise((r) => setTimeout(r, 0));
    engine.apply(mix, 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('/scenes/x/missing.ogg');
    expect(p(engine.debug().voice('hum')).last).toBe(0.3);
  });

  it('plays a bed that loads, at its level', async () => {
    const { engine, p } = setup({ fetchBuffer: () => Promise.resolve({} as AudioBuffer) });
    engine.unlock();
    engine.apply({ ...SILENT, bed: { url: '/b.ogg', level: 0.4 } }, 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.state().voices).toContain('bed');
    expect(p(engine.debug().voice('bed')).last).toBe(0.4);
  });
});

describe('AudioEngine: state', () => {
  it('reports availability, context state, voices and the last mix', () => {
    const { engine } = setup();
    engine.unlock();
    const mix = rainMix(0.4, { wind: { level: 0.15, gust: 0.3, crackle: 0, indoor: false } });
    engine.apply(mix, 0);
    expect(engine.state()).toEqual({ available: true, unlocked: true, context: 'running', voices: ['rain', 'wind'], mix, rain: 'synth', music: null, musicUrl: null, musicStarts: 0, thunders: 0 });
  });
});

describe('AudioEngine: recorded rain', () => {
  const RAIN = { light: '/sound/rain-light.ogg', heavy: '/sound/rain-heavy.ogg' };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('loads the two rain recordings on unlock and blends them by the heavy weight', async () => {
    const fetchBuffer = vi.fn((_c: AudioContext, _u: string) => Promise.resolve({} as AudioBuffer));
    const { engine, p } = setup({ fetchBuffer, rainUrls: RAIN });
    engine.unlock();
    expect(fetchBuffer.mock.calls.map((c) => c[1]).sort()).toEqual([RAIN.heavy, RAIN.light]);
    await flush();
    engine.apply(rainMix(0.5, {}, 0.75), 0);
    expect(engine.state().rain).toBe('recorded');
    expect(p(engine.debug().rainBlend('light')).last).toBeCloseTo(0.25);
    expect(p(engine.debug().rainBlend('heavy')).last).toBeCloseTo(0.75);
    expect(p(engine.debug().voice('rain')).last).toBeCloseTo(0.5);
  });

  it('indoors the recordings go through the glass filter too', async () => {
    const { engine, p } = setup({ fetchBuffer: () => Promise.resolve({} as AudioBuffer), rainUrls: RAIN });
    engine.unlock();
    await flush();
    engine.apply(rainMix(0.4, {}, 0, true), 0);
    expect(p(engine.debug().rainGlass()).last).toBe(900);
  });

  it('plays synthesized rain until the recordings arrive, then crossfades to them', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchBuffer = vi.fn(async () => {
      await gate;
      return {} as AudioBuffer;
    });
    const { engine, p } = setup({ fetchBuffer, rainUrls: RAIN });
    engine.unlock();
    engine.apply(rainMix(0.6), 0);
    expect(engine.state().rain).toBe('synth');
    const synthLevel = p(engine.debug().voice('rain'));
    release();
    await flush();
    await flush();
    expect(engine.state().rain).toBe('recorded');
    expect(synthLevel.last).toBe(0); // the synth faded out
    expect(p(engine.debug().voice('rain')).last).toBeCloseTo(0.6);
  });

  it('keeps synthesized rain, with one warning, if the recordings fail', async () => {
    const { engine, warn } = setup({ fetchBuffer: () => Promise.reject(new Error('404')), rainUrls: RAIN });
    engine.unlock();
    await flush();
    engine.apply(rainMix(0.6), 0);
    expect(engine.state().rain).toBe('synth');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('rain recordings');
  });
});

describe('AudioEngine: oneShot', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const sample = {} as AudioBuffer;

  it('oneShot plays a sample once at the master level, straight to the output', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx, p } = setup({ fetchBuffer });
    engine.unlock();
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/x.ogg');
    await flush();
    const sources = ctx.of('buffer-source').slice(sourcesBefore);
    expect(sources).toHaveLength(1);
    expect((sources[0] as any).started).toBe(true);
    const reaches = (n: any, target: any, seen = new Set()): boolean =>
      n === target || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => reaches(c, target, seen))));
    expect(reaches(sources[0], ctx.destination)).toBe(true);
    const out = (sources[0] as any).connections[0];
    expect(p(out.gain).value).toBeCloseTo(0.6); // default volume 0.6, scale 1, unmuted
  });

  it("oneShot with a channel goes through that channel's gain, at the sample's own level", async () => {
    const { engine, ctx, p } = setup({ fetchBuffer: vi.fn(() => Promise.resolve(sample)) });
    engine.unlock();
    const before = ctx.of('buffer-source').length;
    engine.oneShot('/door.ogg', 0.4, 'room');
    await flush();
    const src = ctx.of('buffer-source').slice(before)[0] as any;
    const room = ctx.of('gain').find((g: any) => g.gain === engine.debug().channel.room);
    const reaches = (n: any, target: any, seen = new Set()): boolean =>
      n === target || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => reaches(c, target, seen))));
    expect(reaches(src, room)).toBe(true);
    expect(p(src.connections[0].gain).value).toBeCloseTo(0.4);
  });

  it('oneShot decodes each url once', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx } = setup({ fetchBuffer });
    engine.unlock();
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/x.ogg');
    engine.oneShot('/x.ogg');
    await flush();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore + 2);
  });

  it('oneShot before unlock or on a failed load is silent; a failure warns once', async () => {
    const fetchBuffer = vi.fn(() => Promise.reject(new Error('404')));
    const { engine, ctx, warn } = setup({ fetchBuffer });
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/missing.ogg'); // before unlock: no context yet
    await flush();
    expect(fetchBuffer).not.toHaveBeenCalled();
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore);
    engine.unlock();
    engine.oneShot('/missing.ogg');
    engine.oneShot('/missing.ogg'); // same failing url: no second fetch, no second warning
    await flush();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('/missing.ogg');
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore);
  });

  it('oneShot stacking: a repeat call stops the previous still-playing source first', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx } = setup({ fetchBuffer });
    engine.unlock();
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/x.ogg');
    await flush();
    engine.oneShot('/x.ogg');
    const sources = ctx.of('buffer-source').slice(sourcesBefore) as any[];
    expect(sources).toHaveLength(1); // the second hasn't resolved from the (shared, cached) buffer yet
    await flush();
    const all = ctx.of('buffer-source').slice(sourcesBefore) as any[];
    expect(all).toHaveLength(2);
    expect(all[0].stopped).toBe(true); // stopped before (or as) the second started
    expect(all[1].stopped).toBe(false);
  });

  it('a source disconnects itself (and its gain) on ended', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx } = setup({ fetchBuffer });
    engine.unlock();
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/x.ogg');
    await flush();
    const src = ctx.of('buffer-source').slice(sourcesBefore)[0] as any;
    const out = src.connections[0];
    src.onended();
    expect(src.disconnected).toBe(true);
    expect(out.disconnected).toBe(true);
  });

  it('preload fetches and caches the buffer without playing it; a no-op before unlock', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx } = setup({ fetchBuffer });
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.preload('/x.ogg'); // before unlock: no context yet
    await flush();
    expect(fetchBuffer).not.toHaveBeenCalled();
    engine.unlock();
    engine.preload('/x.ogg');
    await flush();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore); // nothing played
    engine.oneShot('/x.ogg'); // already cached: no second fetch
    await flush();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.of('buffer-source').length).toBe(sourcesBefore + 1);
  });

  it('oneShot follows mute', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(sample));
    const { engine, ctx, p } = setup({ fetchBuffer });
    engine.unlock();
    engine.setMaster(0.6, true);
    const sourcesBefore = ctx.of('buffer-source').length;
    engine.oneShot('/x.ogg');
    await flush();
    const source = ctx.of('buffer-source').slice(sourcesBefore)[0] as any;
    const out = source.connections[0];
    expect(p(out.gain).value).toBe(0);
  });
});

describe('AudioEngine: music', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const track = {} as AudioBuffer;

  const lastSource = (ctx: { of(kind: string): unknown[] }) => ctx.of('buffer-source').at(-1) as { loop: boolean; onended: (() => void) | null; stop(t?: number): void };

  it('music loops by default (the splash theme is unchanged)', async () => {
    const { engine, ctx } = setup({ fetchBuffer: () => Promise.resolve(track) });
    engine.unlock();
    engine.music('/t.ogg', 1, 0);
    await settle();
    expect(lastSource(ctx).loop).toBe(true);
  });

  it('a once-only track plays without looping and reports its end', async () => {
    const { engine, ctx } = setup({ fetchBuffer: () => Promise.resolve(track) });
    const ended = vi.fn();
    engine.onMusicEnded(ended);
    engine.unlock();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    const src = lastSource(ctx);
    expect(src.loop).toBe(false);
    expect(engine.state().musicUrl).toBe('/a.ogg');
    src.onended!();
    expect(ended).toHaveBeenCalledExactlyOnceWith('/a.ogg', false);
    expect(engine.state()).toMatchObject({ musicUrl: null, music: null });
    expect(engine.state().voices).not.toContain('music');
  });

  it('the same song plays again after it ended (Review Focus 1)', async () => {
    const { engine, ctx } = setup({ fetchBuffer: () => Promise.resolve(track) });
    engine.unlock();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    const first = lastSource(ctx);
    first.onended!();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    expect(lastSource(ctx)).not.toBe(first);
    expect(engine.state().musicStarts).toBe(2);
  });

  it('a faded or replaced track never reports its end (Review Focus 2)', async () => {
    const { engine, ctx } = setup({ fetchBuffer: () => Promise.resolve(track) });
    const ended = vi.fn();
    engine.onMusicEnded(ended);
    engine.unlock();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    const a = lastSource(ctx);
    engine.music('/b.ogg', 1, 0, { loop: false }); // fades /a.ogg out and stops it (the fake fires onended on stop)
    await settle();
    a.onended?.();
    engine.music(null, 0, 0);
    expect(ended).not.toHaveBeenCalled();
  });

  it('a once-only track that fails to load reports a failed end', async () => {
    const fetchBuffer = vi.fn(() => Promise.reject(new Error('404')));
    const { engine } = setup({ fetchBuffer });
    const ended = vi.fn();
    engine.onMusicEnded(ended);
    engine.unlock();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    expect(ended).toHaveBeenCalledExactlyOnceWith('/a.ogg', true);
    engine.music(null, 0, 0);
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    expect(ended).toHaveBeenCalledTimes(2);
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
  });

  it("a song's decoded audio is let go once it ends or is replaced (task 2 review: memory)", async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(track));
    const { engine, ctx } = setup({ fetchBuffer });
    engine.unlock();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    lastSource(ctx).onended!();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    expect(fetchBuffer).toHaveBeenCalledTimes(2);
    engine.music('/b.ogg', 1, 0, { loop: false }); // replaces /a.ogg
    await settle();
    engine.music('/a.ogg', 1, 0, { loop: false });
    await settle();
    expect(fetchBuffer).toHaveBeenCalledTimes(4);
  });

  it('a looped track keeps its decoded audio (the theme comes back without a fetch)', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(track));
    const { engine } = setup({ fetchBuffer });
    engine.unlock();
    engine.music('/theme.ogg', 1, 0);
    await settle();
    engine.music(null, 0, 0);
    engine.music('/theme.ogg', 1, 0);
    await settle();
    expect(fetchBuffer).toHaveBeenCalledTimes(1);
  });

  it("clock reads the context's time", () => {
    const { engine, ctx } = setup();
    expect(engine.clock()).toBe(0);
    engine.unlock();
    ctx.currentTime = 7;
    expect(engine.clock()).toBe(7);
  });

  it('plays a looping track on the music channel and glides to its level', async () => {
    const fetchBuffer = vi.fn(() => Promise.resolve(track));
    const { engine, p } = setup({ fetchBuffer });
    engine.unlock();
    engine.music('/t.ogg', 1, 0.6);
    expect(engine.state().music).toBe('loading');
    await settle();
    expect(engine.state().music).toBe('playing');
    expect(engine.state().voices).toContain('music');
    expect(p(engine.debug().voice('music')).last).toBe(1);
    engine.music('/t.ogg', 0.35, 2);
    expect(p(engine.debug().voice('music')).events.at(-1)).toMatchObject({ type: 'ramp', value: 0.35 });
    expect(fetchBuffer).toHaveBeenCalledTimes(1); // same url: no refetch, no restart
  });

  it('music ignores the landing scale and the master glitch dip, but obeys volume and mute', () => {
    const { engine, p } = setup();
    engine.unlock();
    engine.setMaster(0.6, false);
    engine.setScale(0.25);
    expect(p(engine.debug().musicOut).last).toBeCloseTo(0.6);
    engine.apply(SILENT, 0, 'glitch');
    expect(p(engine.debug().musicOut).last).toBeCloseTo(0.6);
    engine.setMaster(0.6, true);
    expect(p(engine.debug().musicOut).last).toBe(0);
  });

  it('a track dropped before it decodes never plays (Review Focus 4)', async () => {
    let resolveFetch!: (b: AudioBuffer) => void;
    const { engine } = setup({ fetchBuffer: () => new Promise<AudioBuffer>((r) => (resolveFetch = r)) });
    engine.unlock();
    engine.music('/t.ogg', 1, 0);
    engine.music(null, 0, 0.5);
    resolveFetch(track);
    await settle();
    expect(engine.state().voices).not.toContain('music');
    expect(engine.state().music).toBeNull();
  });

  it('a track that fails to load warns once, reports error, and leaves the room sound alone', async () => {
    const { engine, warn } = setup({ fetchBuffer: () => Promise.reject(new Error('404')) });
    engine.unlock();
    engine.apply(rainMix(0.5), 0);
    engine.music('/missing.ogg', 1, 0);
    await settle();
    engine.music('/missing.ogg', 0.35, 2);
    await settle();
    expect(engine.state().music).toBe('error');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('/missing.ogg');
    expect(engine.state().voices).toContain('rain');
  });

  it('music(null) fades the track out and stops it', async () => {
    const { engine, ctx, p } = setup({ fetchBuffer: () => Promise.resolve(track) });
    engine.unlock();
    engine.music('/t.ogg', 1, 0);
    await settle();
    const level = p(engine.debug().voice('music'));
    ctx.currentTime = 5;
    engine.music(null, 0, 0.5);
    expect(level.events.at(-1)).toEqual({ type: 'ramp', value: 0, time: 5.5 });
    expect(engine.state().voices).not.toContain('music');
    expect(engine.state().music).toBeNull();
  });
});

describe('AudioEngine: thunder', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const sample = {} as AudioBuffer;
  const reaches = (n: any, target: any, seen = new Set()): boolean =>
    n === target || (!seen.has(n) && (seen.add(n), (n.connections ?? []).some((c: any) => reaches(c, target, seen))));

  it('thunder schedules at currentTime + delay through a low-pass when indoor, on the weather channel', async () => {
    const { engine, ctx } = setup({ fetchBuffer: vi.fn(() => Promise.resolve(sample)) });
    engine.unlock();
    ctx.currentTime = 10;
    const before = ctx.of('buffer-source').length;
    engine.thunder('/t.ogg', 0.5, 2, true);
    await flush();
    const src = ctx.of('buffer-source').slice(before)[0] as any;
    expect(src.startAt).toBeCloseTo(12);
    const filter = src.connections[0];
    expect(filter.kind).toBe('biquad');
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(900);
    const weather = ctx.of('gain').find((g: any) => g.gain === engine.debug().channel.weather);
    expect(weather).toBeDefined();
    expect(reaches(src, weather)).toBe(true);
  });

  it('outdoors thunder is not muffled', async () => {
    const { engine, ctx } = setup({ fetchBuffer: vi.fn(() => Promise.resolve(sample)) });
    engine.unlock();
    const before = ctx.of('buffer-source').length;
    engine.thunder('/t.ogg', 0.5, 1, false);
    await flush();
    const src = ctx.of('buffer-source').slice(before)[0] as any;
    expect(src.connections[0].kind).toBe('gain');
  });

  it('cancelThunder stops a pending take', async () => {
    const { engine, ctx } = setup({ fetchBuffer: vi.fn(() => Promise.resolve(sample)) });
    engine.unlock();
    ctx.currentTime = 5;
    const before = ctx.of('buffer-source').length;
    engine.thunder('/t.ogg', 0.5, 3, true);
    await flush();
    engine.cancelThunder();
    expect((ctx.of('buffer-source').slice(before)[0] as any).stopped).toBe(true);
  });

  it('a take still loading when cancelled never plays', async () => {
    let resolve!: (b: AudioBuffer) => void;
    const { engine, ctx } = setup({ fetchBuffer: vi.fn(() => new Promise<AudioBuffer>((r) => (resolve = r))) });
    engine.unlock();
    const before = ctx.of('buffer-source').length;
    engine.thunder('/slow.ogg', 0.5, 1, true);
    engine.cancelThunder();
    resolve(sample);
    await flush();
    expect(ctx.of('buffer-source').length).toBe(before);
  });

  it('thunders counts plays', async () => {
    const { engine } = setup({ fetchBuffer: vi.fn(() => Promise.resolve(sample)) });
    engine.unlock();
    engine.thunder('/a.ogg', 0.5, 1, true);
    engine.thunder('/b.ogg', 0.5, 1, true);
    await flush();
    expect(engine.state().thunders).toBe(2);
  });

  it('a take that fails to load is silent and warns once', async () => {
    const { engine, ctx, warn } = setup({ fetchBuffer: vi.fn(() => Promise.reject(new Error('404'))) });
    engine.unlock();
    const before = ctx.of('buffer-source').length;
    engine.thunder('/gone.ogg', 0.5, 1, true);
    engine.thunder('/gone.ogg', 0.5, 1, true);
    await flush();
    expect(ctx.of('buffer-source').length).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(engine.state().thunders).toBe(0);
  });
});


describe('AudioEngine: sounds that aren\'t on disk', () => {
  const present = async (u: string) => u !== '/sound/ui/move.ogg' && u !== '/scenes/x/missing.ogg';

  function quiet() {
    const ctx = new FakeAudioContext();
    const warn = vi.fn();
    const fetchBuffer = vi.fn((_c: AudioContext, _u: string) => Promise.resolve({} as AudioBuffer));
    const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext, warn, fetchBuffer, present, rainUrls: null });
    engine.unlock();
    return { engine, warn, fetchBuffer, p: (param: AudioParam | undefined) => param as unknown as FakeParam };
  }

  it('a missing cue is never fetched and says nothing', async () => {
    const { engine, warn, fetchBuffer } = quiet();
    engine.oneShot('/sound/ui/move.ogg');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchBuffer).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a present cue fetches as before', async () => {
    const { engine, fetchBuffer } = quiet();
    engine.oneShot('/sound/ui/lock.ogg');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchBuffer.mock.calls.map((c) => c[1])).toEqual(['/sound/ui/lock.ogg']);
  });

  it('a missing bed plays the hum fallback without a warning', async () => {
    const { engine, warn, fetchBuffer, p } = quiet();
    const mix: Mix = { ...SILENT, bed: { url: '/scenes/x/missing.ogg', level: 0.5 }, hum: { level: 0, fallback: 0.3 } };
    engine.apply(mix, 0);
    await new Promise((r) => setTimeout(r, 0));
    engine.apply(mix, 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchBuffer).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(p(engine.debug().voice('hum')).last).toBe(0.3);
  });
});
