/**
 * The synthesized voices: small Web Audio node chains built from looping noise buffers and
 * oscillators. Each exposes its output `level` (a gain the engine glides) and a `set` for the few
 * parameters the mix controls. No samples needed.
 */

export interface Voice {
  /** The voice's output gain: what the mix level glides. */
  readonly level: AudioParam;
  stop(when: number): void;
}

const noiseCache = new WeakMap<BaseAudioContext, { pink: AudioBuffer; brown: AudioBuffer; white: AudioBuffer }>();

/** Two seconds of white, pink and brown noise per context, made once and looped. */
function noise(ctx: BaseAudioContext): { pink: AudioBuffer; brown: AudioBuffer; white: AudioBuffer } {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  // Paul Kellet's economy pink filter; brown is integrated white noise, leaky so it stays bounded.
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  const out = { pink, brown, white };
  noiseCache.set(ctx, out);
  return out;
}

function loop(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7, gainDb = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start();
  return o;
}

/** Rain: pink noise, band-passed, with a patter shimmer; indoors a low-pass "glass" and a soft resonance. */
export interface RainVoice extends Voice {
  readonly glass: AudioParam; // low-pass cutoff
  readonly resonance: AudioParam; // peaking gain, dB
  readonly patterRate: AudioParam;
}
export function rainVoice(ctx: BaseAudioContext, out: AudioNode): RainVoice {
  const n = noise(ctx);
  const src = loop(ctx, n.pink);
  const band = filter(ctx, 'bandpass', 1500, 0.7);
  const glass = filter(ctx, 'lowpass', 18000, 0.7);
  const res = filter(ctx, 'peaking', 2500, 1.2, 0);
  const patterSrc = loop(ctx, n.white);
  const patterBand = filter(ctx, 'bandpass', 4200, 3);
  const patterGain = gain(ctx, 0.25);
  const patterLfo = osc(ctx, 'sawtooth', 8);
  const lfoDepth = gain(ctx, 0.2);
  patterLfo.connect(lfoDepth).connect(patterGain.gain);
  const level = gain(ctx, 0);
  src.connect(band).connect(glass);
  patterSrc.connect(patterBand).connect(patterGain).connect(glass);
  glass.connect(res).connect(level).connect(out);
  return {
    level: level.gain,
    glass: glass.frequency,
    resonance: res.gain,
    patterRate: patterLfo.frequency,
    stop: (when) => [src, patterSrc, patterLfo].forEach((s) => s.stop(when)),
  };
}

/** Recorded rain: a light and a heavy loop blended by intensity, through the same glass and resonance as the synth. */
export interface RecordedRainVoice extends Voice {
  readonly glass: AudioParam;
  readonly resonance: AudioParam;
  readonly light: AudioParam;
  readonly heavy: AudioParam;
}
export function recordedRainVoice(ctx: BaseAudioContext, out: AudioNode, light: AudioBuffer, heavy: AudioBuffer): RecordedRainVoice {
  const lightSrc = loop(ctx, light);
  const heavySrc = loop(ctx, heavy);
  const lightGain = gain(ctx, 1);
  const heavyGain = gain(ctx, 0);
  const glass = filter(ctx, 'lowpass', 18000, 0.7);
  const res = filter(ctx, 'peaking', 2500, 1.2, 0);
  const level = gain(ctx, 0);
  lightSrc.connect(lightGain).connect(glass);
  heavySrc.connect(heavyGain).connect(glass);
  glass.connect(res).connect(level).connect(out);
  return {
    level: level.gain,
    glass: glass.frequency,
    resonance: res.gain,
    light: lightGain.gain,
    heavy: heavyGain.gain,
    stop: (when) => [lightSrc, heavySrc].forEach((s) => s.stop(when)),
  };
}

/** Wind: brown noise through a band-pass swept by a slow LFO (gusts); optional ash crackle. */
export interface WindVoice extends Voice {
  readonly gustDepth: AudioParam;
  readonly crackle: AudioParam;
  readonly glass: AudioParam;
}
export function windVoice(ctx: BaseAudioContext, out: AudioNode): WindVoice {
  const n = noise(ctx);
  const src = loop(ctx, n.brown);
  const band = filter(ctx, 'bandpass', 420, 1);
  const lfo = osc(ctx, 'sine', 0.11);
  const depth = gain(ctx, 150);
  lfo.connect(depth).connect(band.frequency);
  const glass = filter(ctx, 'lowpass', 18000, 0.7);
  const crackleSrc = loop(ctx, n.white);
  const crackleHp = filter(ctx, 'highpass', 5000, 0.7);
  const crackle = gain(ctx, 0);
  const level = gain(ctx, 0);
  src.connect(band).connect(glass);
  crackleSrc.connect(crackleHp).connect(crackle).connect(glass);
  glass.connect(level).connect(out);
  return {
    level: level.gain,
    gustDepth: depth.gain,
    crackle: crackle.gain,
    glass: glass.frequency,
    stop: (when) => [src, lfo, crackleSrc].forEach((s) => s.stop(when)),
  };
}

/** Room tone: a faint 60/120 Hz hum plus a low-passed air-vent hiss. */
export function humVoice(ctx: BaseAudioContext, out: AudioNode): Voice {
  const level = gain(ctx, 0);
  const o60 = osc(ctx, 'sine', 60);
  const o120 = osc(ctx, 'sine', 120);
  const vent = loop(ctx, noise(ctx).brown);
  const ventLp = filter(ctx, 'lowpass', 320, 0.7);
  o60.connect(gain(ctx, 0.5)).connect(level);
  o120.connect(gain(ctx, 0.22)).connect(level);
  vent.connect(ventLp).connect(gain(ctx, 0.45)).connect(level);
  level.connect(out);
  return { level: level.gain, stop: (when) => [o60, o120, vent].forEach((s) => s.stop(when)) };
}

/** Neon buzz: a 120 Hz sawtooth band-passed, a crackle gain driven per frame, panned to the sign. */
export interface NeonVoiceNode extends Voice {
  readonly crackle: AudioParam;
  readonly pan: AudioParam;
}
export function neonVoice(ctx: BaseAudioContext, out: AudioNode, pan: number): NeonVoiceNode {
  const saw = osc(ctx, 'sawtooth', 120);
  const band = filter(ctx, 'bandpass', 240, 2);
  const hiss = loop(ctx, noise(ctx).white);
  const hissBand = filter(ctx, 'bandpass', 3000, 2);
  const level = gain(ctx, 0);
  const crackle = gain(ctx, 1);
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  saw.connect(band).connect(level);
  hiss.connect(hissBand).connect(gain(ctx, 0.08)).connect(level);
  level.connect(crackle).connect(panner).connect(out);
  return { level: level.gain, crackle: crackle.gain, pan: panner.pan, stop: (when) => [saw, hiss].forEach((s) => s.stop(when)) };
}

/** A recorded loop. */
export function bedVoice(ctx: BaseAudioContext, out: AudioNode, buffer: AudioBuffer, opts: { loop?: boolean; onEnded?: () => void } = {}): Voice {
  let src: AudioBufferSourceNode;
  if (opts.loop === false) {
    // Played once (a room's song): it reports its end. Web Audio also fires onended on stop(), so
    // the caller must tell a song that played out from one it faded away.
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;
    if (opts.onEnded) src.onended = opts.onEnded;
    src.start();
  } else {
    src = loop(ctx, buffer);
  }
  const level = gain(ctx, 0);
  src.connect(level).connect(out);
  return { level: level.gain, stop: (when) => src.stop(when) };
}

/** A short burst of filtered static (glitch transitions). */
export function staticBurst(ctx: BaseAudioContext, out: AudioNode, seconds = 0.15): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx).white;
  const band = filter(ctx, 'bandpass', 2200, 0.8);
  const g = gain(ctx, 0.35);
  src.connect(band).connect(g).connect(out);
  src.start();
  src.stop(ctx.currentTime + seconds);
}
