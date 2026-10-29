import type { Transition } from '../../../shared/types';
import { flickerFactor } from '../renderer/flicker';
import type { Mix } from './mix';
import { defaultSoundCheck, MissingSound } from './present';
import { bedVoice, humVoice, neonVoice, rainVoice, recordedRainVoice, staticBurst, windVoice, type NeonVoiceNode, type RainVoice, type RecordedRainVoice, type Voice, type WindVoice } from './voices';

export type Channel = 'weather' | 'room' | 'lights' | 'music';
export const CHANNELS: Channel[] = ['weather', 'room', 'lights', 'music'];

export interface EngineState {
  available: boolean;
  unlocked: boolean;
  context: string;
  voices: string[];
  mix: Mix | null;
  /** Which rain is playing: the recordings, the synthesized fallback, or none yet. */
  rain?: 'recorded' | 'synth' | null;
  /** The music track: fetching, playing, failed to load, or none. */
  music?: 'loading' | 'playing' | 'error' | null;
  /** The track asked for (null when silent, or after a once-only track ended). */
  musicUrl?: string | null;
  /** Tracks started so far (a song carried on between rooms doesn't count again). */
  musicStarts?: number;
  /** Thunder takes played so far. */
  thunders?: number;
}

/** How long rolling thunder fades out when the room changes. */
const THUNDER_FADE_SECONDS = 0.5;

/** The shared rain recordings (light and heavy loops), served from web/public/sound/. */
export const RAIN_URLS = { light: '/sound/rain-light.ogg', heavy: '/sound/rain-heavy.ogg' };
const RAIN_SWAP_SECONDS = 1;

const FADE_SECONDS = 1.2;
const GLITCH_SECONDS = 0.15;
const GLITCH_RETURN_SECONDS = 0.02;
const BED_MIN_FADE = 0.05;
const LEVEL_SECONDS = 0.1;
const CRACKLE_TIME_CONSTANT = 0.01;

async function defaultFetch(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function defaultContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/**
 * The room's sound: plain Web Audio. Nothing exists until `unlock()` (call it from a click or
 * key — browsers require a gesture). `apply()` glides every voice to a new `Mix` over the room
 * change's duration; `tick()` drives the neon crackle each frame.
 *
 *   voices → channel gains (weather / room / lights) → fog high-shelf → compressor → master → out
 *   music  → channel gain (music) → musicOut → out
 *
 * Music has its own output: the player's volume and mute apply, but not the landing's scale, the fog or
 * the glitch dip (the theme plays straight through a glitch transition).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private available = true;
  private needsResume = false;
  private master!: GainNode;
  private musicOut!: GainNode;
  private fog!: BiquadFilterNode;
  private readonly channels = new Map<Channel, GainNode>();
  private readonly voices = new Map<string, Voice>();
  private readonly neon = new Map<string, { node: NeonVoiceNode; flicker: number; seed: number }>();
  private mix: Mix | null = null;
  private volume = 0.6;
  private muted = false;
  private scale = 1;
  private readonly channelLevels: Record<Channel, number> = { weather: 1, room: 1, lights: 1, music: 1 };
  private bedUrl: string | null = null;
  private bedToken = 0;
  private readonly failedBeds = new Set<string>();
  private musicUrl: string | null = null;
  private musicToken = 0;
  private musicKind: 'loading' | 'playing' | 'error' | null = null;
  private musicLevel = 0;
  private musicSeconds = 0;
  private readonly musicBuffers = new Map<string, Promise<AudioBuffer>>();
  private readonly failedMusic = new Set<string>();
  private musicStarts = 0;
  /** The current track plays once (a room's song): its decoded audio is let go when it's over. */
  private musicOnce = false;
  private readonly musicEndedFns: Array<(url: string, failed: boolean) => void> = [];
  /** Decoded samples for `oneShot`, by url; a failed load resolves `null` and warns once. */
  private readonly oneShotBuffers = new Map<string, Promise<AudioBuffer | null>>();
  /** The last `oneShot` source still playing per url, so a repeat (held key, fast taps) stops it first. */
  private readonly oneShotSources = new Map<string, AudioBufferSourceNode>();
  /** Thunder takes scheduled or rolling; `thunderGen` bumps on a room change so loading ones never play. */
  private readonly thunders = new Set<{ src: AudioBufferSourceNode; out: GainNode; at: number }>();
  private thunderGen = 0;
  private thunderCount = 0;
  /** Each param's current glide, so a new one starts from where the sound really is (not `param.value`). */
  private readonly ramps = new WeakMap<AudioParam, { from: number; to: number; t0: number; t1: number }>();
  private readonly stateListeners = new Set<() => void>();
  private readonly rainUrls: { light: string; heavy: string } | null;
  private rainBuffers: { light: AudioBuffer; heavy: AudioBuffer } | null = null;
  private rainKind: 'recorded' | 'synth' | null = null;
  private readonly createContext: () => AudioContext | null;
  private readonly fetchBuffer: (ctx: AudioContext, url: string) => Promise<AudioBuffer>;
  private readonly warn: (msg: string) => void;
  private readonly quiet: (err: unknown) => boolean;

  constructor(
    opts: {
      createContext?: () => AudioContext | null;
      fetchBuffer?: (ctx: AudioContext, url: string) => Promise<AudioBuffer>;
      /** Whether a url's sound is on disk; a missing one is never fetched. Default: the server's list (the plain fetch only). */
      present?: (url: string) => Promise<boolean>;
      warn?: (msg: string) => void;
      /** The rain recordings; null plays synthesized rain only. */
      rainUrls?: { light: string; heavy: string } | null;
    } = {},
  ) {
    this.rainUrls = opts.rainUrls === undefined ? RAIN_URLS : opts.rainUrls;
    this.createContext = opts.createContext ?? defaultContext;
    const fetchBuffer = opts.fetchBuffer ?? defaultFetch;
    const present = opts.present ?? (opts.fetchBuffer ? null : defaultSoundCheck);
    this.fetchBuffer = present
      ? async (ctx, url) => {
          if (!(await present(url))) throw new MissingSound(url);
          return fetchBuffer(ctx, url);
        }
      : fetchBuffer;
    const warn = opts.warn ?? ((m: string) => console.warn(`[audio] ${m}`));
    // A sound that isn't on disk (a public build) is skipped quietly; every other failure warns.
    this.warn = warn;
    this.quiet = (err) => err instanceof MissingSound;
  }

  /** Creates (or resumes) the audio context. False when Web Audio isn't available. */
  unlock(): boolean {
    if (!this.available) return false;
    if (this.ctx) {
      if (this.needsResume || this.ctx.state === 'suspended') this.resume();
      return true;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = this.createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) {
      this.available = false;
      return false;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.knee.value = 12;
    this.fog = ctx.createBiquadFilter();
    this.fog.type = 'highshelf';
    this.fog.frequency.value = 3000;
    this.fog.gain.value = 0;
    this.fog.connect(comp).connect(this.master).connect(ctx.destination);
    this.musicOut = ctx.createGain();
    this.musicOut.gain.value = this.musicTarget();
    this.musicOut.connect(ctx.destination);
    for (const ch of CHANNELS) {
      const g = ctx.createGain();
      g.gain.value = this.channelLevels[ch];
      g.connect(ch === 'music' ? this.musicOut : this.fog);
      this.channels.set(ch, g);
    }
    ctx.onstatechange = () => {
      for (const fn of this.stateListeners) fn();
    };
    if (ctx.state === 'suspended') this.resume();
    this.loadRain(ctx);
    return true;
  }

  /** Fetches the rain recordings; synthesized rain plays until (and unless) they arrive. */
  private loadRain(ctx: AudioContext): void {
    const urls = this.rainUrls;
    if (!urls) return;
    Promise.all([this.fetchBuffer(ctx, urls.light), this.fetchBuffer(ctx, urls.heavy)]).then(
      ([light, heavy]) => {
        if (this.ctx !== ctx) return;
        this.rainBuffers = { light, heavy };
        const synth = this.voices.get('rain');
        if (this.rainKind === 'synth' && synth) {
          // Crossfade from the synthesized rain to the recordings.
          const now = ctx.currentTime;
          this.glide(synth.level, 0, RAIN_SWAP_SECONDS, now);
          synth.stop(now + RAIN_SWAP_SECONDS + 0.05);
          this.voices.delete('rain');
          this.rainKind = null;
          if (this.mix) this.applyRain(this.mix, RAIN_SWAP_SECONDS, now);
        }
      },
      (err: unknown) => {
        if (!this.quiet(err)) this.warn(`rain recordings failed to load (${err instanceof Error ? err.message : String(err)}); playing synthesized rain`);
      },
    );
  }

  /** Called whenever the context starts, suspends or resumes (the HUD follows it). */
  onStateChange(fn: () => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  apply(mix: Mix, duration: number, transition?: Transition): void {
    this.mix = mix;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const d = transition === 'fade' ? Math.max(duration, FADE_SECONDS) : duration;

    if (transition === 'glitch') {
      // The static stands in front of the dropout: its own gain (at the master level, so mute holds)
      // straight to the output, while the room is held silent for the burst and comes back quickly.
      this.playBurst(ctx);
      const g = this.master.gain;
      const target = this.masterTarget();
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.setValueAtTime(0, now + GLITCH_SECONDS);
      g.linearRampToValueAtTime(target, now + GLITCH_SECONDS + GLITCH_RETURN_SECONDS);
      this.ramps.set(g, { from: 0, to: target, t0: now + GLITCH_SECONDS, t1: now + GLITCH_SECONDS + GLITCH_RETURN_SECONDS });
    }

    this.glide(this.fog.gain, mix.fogDb, d, now);

    this.applyRain(mix, d, now);
    if (mix.wind.level > 0 || this.voices.has('wind')) {
      const wind = this.voice('wind', () => windVoice(ctx, this.channel('weather'))) as WindVoice;
      this.glide(wind.level, mix.wind.level, d, now);
      this.glide(wind.gustDepth, 150 + 250 * mix.wind.gust, d, now);
      this.glide(wind.crackle, 0.2 * mix.wind.crackle, d, now);
      this.glide(wind.glass, mix.wind.indoor ? 900 : 18000, d, now);
    }

    const humLevel = mix.bed && this.failedBeds.has(mix.bed.url) ? mix.hum.fallback : mix.hum.level;
    if (humLevel > 0 || this.voices.has('hum')) {
      const hum = this.voice('hum', () => humVoice(ctx, this.channel('room')));
      this.glide(hum.level, humLevel, d, now);
    }

    this.applyBed(mix, d, now);

    const wanted = new Set(mix.neon.map((n) => n.id));
    for (const [id, v] of this.neon) {
      if (!wanted.has(id)) this.glide(v.node.level, 0, d, now);
    }
    for (const n of mix.neon) {
      let v = this.neon.get(n.id);
      if (!v) {
        if (n.level <= 0) continue;
        const node = neonVoice(ctx, this.channel('lights'), n.pan);
        this.voices.set(`neon:${n.id}`, node);
        v = { node, flicker: n.flicker, seed: n.seed };
        this.neon.set(n.id, v);
      }
      v.flicker = n.flicker;
      v.seed = n.seed;
      this.glide(v.node.level, n.level, d, now);
      this.glide(v.node.pan, n.pan, d, now);
    }
  }

  /** The static burst alone, at the master level — no room dropout, no mix change. */
  burst(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.playBurst(ctx);
  }

  /** The static burst's own gain and node, straight to the output. */
  private playBurst(ctx: AudioContext): void {
    const burstOut = ctx.createGain();
    burstOut.gain.value = this.masterTarget();
    burstOut.connect(ctx.destination);
    staticBurst(ctx, burstOut, GLITCH_SECONDS);
  }

  /**
   * Plays a one-shot sample at `this.masterTarget() * level`, straight to the output (no room
   * dropout, no mix change — like `burst()`, but a decoded sample rather than synthesized static).
   * With a `channel` (a room's own sounds), it plays at `level` through that channel instead.
   * Each url is fetched and decoded once; a failed load warns once and resolves to silence.
   */
  oneShot(url: string, level = 1, channel?: Channel): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.sample(ctx, url).then((b) => {
      if (!b || this.ctx !== ctx) return; // the context closed (or was replaced) before it decoded
      const prev = this.oneShotSources.get(url);
      if (prev) {
        try {
          prev.stop();
        } catch {
          // already stopped (or finished on its own): nothing to do
        }
      }
      const out = ctx.createGain();
      // Through a channel it follows the master, the mute and that channel's slider; a UI cue goes straight out.
      if (channel) {
        out.gain.value = level;
        out.connect(this.channel(channel));
      } else {
        out.gain.value = this.masterTarget() * level;
        out.connect(ctx.destination);
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(out);
      src.onended = () => {
        src.disconnect();
        out.disconnect();
        if (this.oneShotSources.get(url) === src) this.oneShotSources.delete(url);
      };
      this.oneShotSources.set(url, src);
      src.start();
    });
  }

  /** A sample's decoded buffer, fetched once per url; a failed load warns once and resolves `null`. */
  private sample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    let buffer = this.oneShotBuffers.get(url);
    if (!buffer) {
      buffer = this.fetchBuffer(ctx, url).catch((err: unknown) => {
        if (!this.quiet(err)) this.warn(`sound ${url} failed to load (${err instanceof Error ? err.message : String(err)})`);
        return null;
      });
      this.oneShotBuffers.set(url, buffer);
    }
    return buffer;
  }

  /**
   * A thunder take, once, `delay` s from now, at `level` on the weather channel (so it follows the
   * master volume, the landing scale and the weather mixer); indoors through the same 900 Hz low-pass
   * as the rain's glass. A take that fails to load is silent.
   */
  thunder(url: string, level: number, delay: number, indoor: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const gen = this.thunderGen;
    const at = ctx.currentTime + delay;
    this.sample(ctx, url).then((b) => {
      if (!b || this.ctx !== ctx || gen !== this.thunderGen) return; // cancelled (a room change) or no sound
      const src = ctx.createBufferSource();
      src.buffer = b;
      const out = ctx.createGain();
      out.gain.value = level;
      if (indoor) {
        const glass = ctx.createBiquadFilter();
        glass.type = 'lowpass';
        glass.frequency.value = 900;
        src.connect(glass);
        glass.connect(out);
      } else {
        src.connect(out);
      }
      out.connect(this.channel('weather'));
      const take = { src, out, at: Math.max(at, ctx.currentTime) };
      this.thunders.add(take);
      src.onended = () => {
        src.disconnect();
        out.disconnect();
        this.thunders.delete(take);
      };
      this.thunderCount++;
      src.start(take.at);
    });
  }

  /** A room change: thunder still waiting never plays; thunder already rolling fades out over 0.5 s. */
  cancelThunder(): void {
    const ctx = this.ctx;
    this.thunderGen++;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const take of [...this.thunders]) {
      try {
        if (take.at > now) take.src.stop();
        else {
          this.glide(take.out.gain, 0, THUNDER_FADE_SECONDS, now);
          take.src.stop(now + THUNDER_FADE_SECONDS);
        }
      } catch {
        // already stopped: nothing to do
      }
    }
  }

  /** Fetches (and caches) `url`'s buffer without playing it, so the first `oneShot` is instant. A no-op without a context. */
  preload(url: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.oneShotBuffers.has(url)) return;
    const buffer = this.fetchBuffer(ctx, url).catch((err: unknown) => {
      if (!this.quiet(err)) this.warn(`sound ${url} failed to load (${err instanceof Error ? err.message : String(err)})`);
      return null;
    });
    this.oneShotBuffers.set(url, buffer);
  }

  /** Per frame: each neon sign's buzz crackles with the same flicker as its glow. */
  tick(tSec: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.neon.values()) {
      v.node.crackle.setTargetAtTime(flickerFactor(tSec, v.flicker, v.seed), ctx.currentTime, CRACKLE_TIME_CONSTANT);
    }
  }

  /**
   * Plays `url` on a loop on the music channel, gliding to `level` over `seconds`. The same url
   * only glides; a new one fades the old track out; null fades out and stops. A track that loads
   * after it was dropped is never played; one that fails warns once and reports `music: 'error'`.
   */
  music(url: string | null, level: number, seconds: number, opts: { loop?: boolean } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // A track still loading glides to the latest request once it arrives.
    this.musicLevel = level;
    this.musicSeconds = seconds;
    const current = this.voices.get('music');
    if (url === this.musicUrl) {
      if (current) this.glide(current.level, level, seconds, now);
      return;
    }
    if (current) {
      const fade = Math.max(seconds, BED_MIN_FADE);
      // Off the books before stop(): a stopped source fires onended too, and must not read as played out.
      this.voices.delete('music');
      this.glide(current.level, 0, fade, now);
      current.stop(now + fade + 0.05);
    }
    // A song is decoded float audio (~90 MB for 4 minutes): only a looped track (the theme) stays cached.
    if (this.musicOnce && this.musicUrl) this.musicBuffers.delete(this.musicUrl);
    this.musicUrl = url;
    const token = ++this.musicToken;
    if (!url) {
      this.musicKind = null;
      return;
    }
    const loop = opts.loop !== false;
    this.musicOnce = !loop;
    if (this.failedMusic.has(url)) {
      this.musicKind = 'error';
      // A song (played once) that is known to fail still ends, so the playlist moves on.
      if (!loop) queueMicrotask(() => token === this.musicToken && this.endMusic(url, true));
      return;
    }
    this.musicKind = 'loading';
    let buffer = this.musicBuffers.get(url);
    if (!buffer) {
      buffer = this.fetchBuffer(ctx, url);
      this.musicBuffers.set(url, buffer);
    }
    buffer.then(
      (b) => {
        if (token !== this.musicToken || this.ctx !== ctx) return; // dropped before it decoded
        const voice: Voice = bedVoice(ctx, this.channel('music'), b, {
          loop,
          // Only a song that played out: a faded, replaced or dropped one has a newer token or voice.
          onEnded: () => {
            if (token === this.musicToken && this.voices.get('music') === voice) this.endMusic(url, false);
          },
        });
        this.voices.set('music', voice);
        this.musicStarts++;
        this.musicKind = 'playing';
        this.glide(voice.level, this.musicLevel, this.musicSeconds, ctx.currentTime);
      },
      (err: unknown) => {
        this.musicBuffers.delete(url);
        if (this.failedMusic.has(url)) {
          if (token === this.musicToken && !loop) this.endMusic(url, true);
          return;
        }
        this.failedMusic.add(url);
        if (!this.quiet(err)) this.warn(`music ${url} failed to load (${err instanceof Error ? err.message : String(err)})`);
        if (token === this.musicToken) {
          this.musicKind = 'error';
          if (!loop) this.endMusic(url, true);
        }
      },
    );
  }

  setMaster(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    this.updateMaster();
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.updateMaster();
  }

  setChannel(ch: Channel, level: number): void {
    this.channelLevels[ch] = level;
    const g = this.channels.get(ch);
    if (g && this.ctx) this.glide(g.gain, level, LEVEL_SECONDS, this.ctx.currentTime);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.needsResume = false;
    ctx.resume().catch(() => {
      this.needsResume = true;
    });
  }

  /** Calls `fn` when a once-only track ends: played out, or (`failed`) never loaded. */
  onMusicEnded(fn: (url: string, failed: boolean) => void): void {
    this.musicEndedFns.push(fn);
  }

  /** The audio clock in seconds (it stands still while the context is suspended); 0 before unlock. */
  clock(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** A once-only track is over: silent again, so the same url can start anew. */
  private endMusic(url: string, failed: boolean): void {
    this.voices.delete('music');
    this.musicBuffers.delete(url);
    this.musicUrl = null;
    this.musicKind = failed ? 'error' : null;
    for (const fn of this.musicEndedFns) fn(url, failed);
  }

  state(): EngineState {
    return {
      available: this.available,
      unlocked: this.ctx !== null,
      context: this.ctx?.state ?? 'none',
      voices: [...this.voices.keys()],
      mix: this.mix,
      rain: this.rainKind,
      music: this.musicKind,
      musicUrl: this.musicUrl,
      musicStarts: this.musicStarts,
      thunders: this.thunderCount,
    };
  }

  /** Read-only handles on the graph's parameters, for tests and the dev panel. */
  debug(): {
    master: AudioParam | undefined;
    musicOut: AudioParam | undefined;
    fog: AudioParam | undefined;
    channel: Record<Channel, AudioParam | undefined>;
    voice(name: string): AudioParam | undefined;
    crackle(id: string): AudioParam | undefined;
    rainBlend(which: 'light' | 'heavy'): AudioParam | undefined;
    rainGlass(): AudioParam | undefined;
  } {
    return {
      master: this.ctx ? this.master.gain : undefined,
      musicOut: this.ctx ? this.musicOut.gain : undefined,
      fog: this.ctx ? this.fog.gain : undefined,
      channel: {
        weather: this.channels.get('weather')?.gain,
        room: this.channels.get('room')?.gain,
        lights: this.channels.get('lights')?.gain,
        music: this.channels.get('music')?.gain,
      },
      voice: (name) => this.voices.get(name)?.level,
      crackle: (id) => this.neon.get(id)?.node.crackle,
      rainBlend: (which) => (this.voices.get('rain') as Partial<RecordedRainVoice> | undefined)?.[which],
      rainGlass: () => (this.voices.get('rain') as Partial<RecordedRainVoice> | undefined)?.glass,
    };
  }

  dispose(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.musicToken++;
    this.musicUrl = null;
    this.musicKind = null;
    this.musicBuffers.clear();
    this.oneShotBuffers.clear();
    this.oneShotSources.clear();
    this.voices.clear();
    this.neon.clear();
    this.channels.clear();
  }

  /** Glides `param` to `target` over `seconds` (0 = jump), starting from where its last glide has got to. */
  private glide(param: AudioParam, target: number, seconds: number, now: number): void {
    const r = this.ramps.get(param);
    const from = !r ? param.value : now >= r.t1 ? r.to : now <= r.t0 ? r.from : r.from + ((r.to - r.from) * (now - r.t0)) / (r.t1 - r.t0);
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    if (seconds > 0) param.linearRampToValueAtTime(target, now + seconds);
    else param.setValueAtTime(target, now);
    this.ramps.set(param, { from, to: target, t0: now, t1: now + Math.max(0, seconds) });
  }

  private applyRain(mix: Mix, d: number, now: number): void {
    const ctx = this.ctx!;
    if (!(mix.rain.level > 0 || this.voices.has('rain'))) return;
    let voice = this.voices.get('rain');
    if (!voice) {
      if (this.rainBuffers) {
        voice = recordedRainVoice(ctx, this.channel('weather'), this.rainBuffers.light, this.rainBuffers.heavy);
        this.rainKind = 'recorded';
      } else {
        voice = rainVoice(ctx, this.channel('weather'));
        this.rainKind = 'synth';
      }
      this.voices.set('rain', voice);
    }
    const r = voice as RainVoice & Partial<RecordedRainVoice>;
    this.glide(r.level, mix.rain.level, d, now);
    this.glide(r.glass, mix.rain.indoor ? 900 : 18000, d, now);
    this.glide(r.resonance, mix.rain.indoor ? 3 : 0, d, now);
    if (this.rainKind === 'recorded') {
      this.glide(r.light!, 1 - mix.rain.heavy, d, now);
      this.glide(r.heavy!, mix.rain.heavy, d, now);
    } else {
      this.glide(r.patterRate, 6 + 20 * mix.rain.level, d, now);
    }
  }

  private masterTarget(): number {
    return this.muted ? 0 : this.volume * this.scale;
  }

  /** Music follows the player's volume and mute, not the landing scale. */
  private musicTarget(): number {
    return this.muted ? 0 : this.volume;
  }

  private updateMaster(): void {
    if (!this.ctx) return;
    this.glide(this.master.gain, this.masterTarget(), LEVEL_SECONDS, this.ctx.currentTime);
    this.glide(this.musicOut.gain, this.musicTarget(), LEVEL_SECONDS, this.ctx.currentTime);
  }

  private channel(ch: Channel): GainNode {
    return this.channels.get(ch)!;
  }

  private voice(name: string, make: () => Voice): Voice {
    let v = this.voices.get(name);
    if (!v) {
      v = make();
      this.voices.set(name, v);
    }
    return v;
  }

  /** Swaps the recorded bed when the scene's changes. A bed that loads after the player moved on is dropped. */
  private applyBed(mix: Mix, d: number, now: number): void {
    const ctx = this.ctx!;
    const url = mix.bed?.url ?? null;
    const current = this.voices.get('bed');
    if (url === this.bedUrl) {
      if (current && mix.bed) this.glide(current.level, mix.bed.level, d, now);
      return;
    }
    if (current) {
      const fade = Math.max(d, BED_MIN_FADE); // never an instant step, even on a restore or glitch
      this.glide(current.level, 0, fade, now);
      current.stop(now + fade + 0.05);
      this.voices.delete('bed');
    }
    this.bedUrl = url;
    const token = ++this.bedToken;
    if (!url || !mix.bed || this.failedBeds.has(url)) return;
    const level = mix.bed.level;
    this.fetchBuffer(ctx, url).then(
      (buffer) => {
        if (token !== this.bedToken || this.ctx !== ctx) return; // the player already moved on
        const bed = bedVoice(ctx, this.channel('room'), buffer);
        this.voices.set('bed', bed);
        this.glide(bed.level, level, d, ctx.currentTime);
      },
      (err: unknown) => {
        if (token !== this.bedToken) return;
        this.failedBeds.add(url);
        if (!this.quiet(err)) this.warn(`sound bed ${url} failed to load (${err instanceof Error ? err.message : String(err)}); playing the room hum instead`);
        if (this.mix) {
          this.bedUrl = null;
          this.apply(this.mix, d);
        }
      },
    );
  }
}
