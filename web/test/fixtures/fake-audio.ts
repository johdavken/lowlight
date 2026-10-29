/**
 * A recording stand-in for the Web Audio API, just enough for the sound engine: nodes remember
 * what they're connected to, `AudioParam`s remember every scheduled change, and the context's
 * `suspend()` / `resume()` can be made to reject. Nothing makes sound.
 */

export interface ParamEvent {
  type: 'set' | 'ramp' | 'target' | 'cancel';
  value?: number;
  time: number;
  timeConstant?: number;
}

export class FakeParam {
  readonly events: ParamEvent[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number): this {
    this.events.push({ type: 'set', value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ type: 'ramp', value, time });
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    this.events.push({ type: 'target', value, time, timeConstant });
    this.value = value;
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events.push({ type: 'cancel', time });
    return this;
  }
  /** The last value this param was ramped, set or targeted to. */
  get last(): number | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.type !== 'cancel') return e.value;
    }
    return undefined;
  }
}

export class FakeNode {
  readonly connections: FakeNode[] = [];
  started = false;
  stopped = false;
  disconnected = false;
  type = '';
  loop = false;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {
    ctx.nodes.push(this);
  }
  connect<T>(n: T): T {
    this.connections.push(n as unknown as FakeNode);
    return n;
  }
  disconnect(): void {
    this.connections.length = 0;
    this.disconnected = true;
  }
  /** When `start(when)` scheduled it (0 = now). */
  startAt = 0;
  start(when = 0): void {
    this.started = true;
    this.startAt = when;
  }
  stop(): void {
    if (this.stopped) throw new Error('already stopped');
    this.stopped = true;
    this.onended?.();
  }
}

class GainNode extends FakeNode {
  readonly gain = new FakeParam(1);
}
class BiquadNode extends FakeNode {
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}
class OscNode extends FakeNode {
  readonly frequency = new FakeParam(440);
}
class PannerNode extends FakeNode {
  readonly pan = new FakeParam(0);
}
class CompressorNode extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly ratio = new FakeParam(12);
  readonly knee = new FakeParam(30);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

export class FakeAudioContext {
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  currentTime = 0;
  sampleRate = 8000;
  state: 'running' | 'suspended' | 'closed' = 'running';
  rejectResume = false;
  resumeCalls = 0;
  suspendCalls = 0;

  constructor() {
    this.destination = new FakeNode('destination', this);
  }
  createGain(): GainNode {
    return new GainNode('gain', this);
  }
  createBiquadFilter(): BiquadNode {
    return new BiquadNode('biquad', this);
  }
  createOscillator(): OscNode {
    return new OscNode('oscillator', this);
  }
  createStereoPanner(): PannerNode {
    return new PannerNode('panner', this);
  }
  createDynamicsCompressor(): CompressorNode {
    return new CompressorNode('compressor', this);
  }
  createBufferSource(): FakeNode {
    return new FakeNode('buffer-source', this);
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  }
  async decodeAudioData(_b: ArrayBuffer) {
    return this.createBuffer(1, 8, this.sampleRate);
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    if (this.rejectResume) throw new Error('resume refused');
    this.state = 'running';
  }
  async suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = 'suspended';
  }
  async close(): Promise<void> {
    this.state = 'closed';
  }
  /** Nodes of one kind, in creation order. */
  of(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }
}
