// Fully synthesized SFX using the Web Audio API — no external audio assets.
type OscType = "sine" | "square" | "sawtooth" | "triangle";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Must be called from inside a user-gesture handler (click/keydown) to satisfy autoplay policy. */
  unlock(): void {
    this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (this.volume <= 0) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tone(freq: number, duration: number, opts?: { type?: OscType; endFreq?: number; gain?: number; attack?: number }): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = opts?.type ?? "sine";
    osc.frequency.setValueAtTime(freq, now);
    if (opts?.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), now + duration);
    const gain = ctx.createGain();
    const peak = opts?.gain ?? 0.3;
    const attack = opts?.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noiseHit(duration: number, opts?: { gain?: number; filterFreq?: number; type?: BiquadFilterType }): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts?.type ?? "bandpass";
    filter.frequency.value = opts?.filterFreq ?? 1200;
    const gain = ctx.createGain();
    const peak = opts?.gain ?? 0.4;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  jump(): void {
    this.tone(420, 0.11, { type: "square", endFreq: 760, gain: 0.16 });
  }

  land(strength: number): void {
    this.noiseHit(0.07 + strength * 0.05, { gain: 0.18 + strength * 0.22, filterFreq: 220 });
  }

  dash(): void {
    this.tone(220, 0.13, { type: "sawtooth", endFreq: 60, gain: 0.14 });
    this.noiseHit(0.07, { gain: 0.14, filterFreq: 3200 });
  }

  hit(heavy: boolean, blocked: boolean): void {
    if (blocked) {
      this.noiseHit(0.08, { gain: 0.22, filterFreq: 2400 });
      this.tone(320, 0.06, { type: "square", gain: 0.1 });
      return;
    }
    this.noiseHit(heavy ? 0.17 : 0.09, { gain: heavy ? 0.5 : 0.3, filterFreq: heavy ? 450 : 900 });
    this.tone(heavy ? 90 : 170, heavy ? 0.24 : 0.1, { type: "sine", endFreq: heavy ? 35 : 55, gain: heavy ? 0.42 : 0.2 });
  }

  wallJump(): void {
    this.tone(500, 0.1, { type: "square", endFreq: 900, gain: 0.15 });
    this.noiseHit(0.06, { gain: 0.14, filterFreq: 2000 });
  }

  wallBounce(): void {
    this.noiseHit(0.12, { gain: 0.3, filterFreq: 700 });
    this.tone(220, 0.16, { type: "triangle", endFreq: 480, gain: 0.2 });
  }

  ko(): void {
    this.tone(520, 0.55, { type: "sawtooth", endFreq: 35, gain: 0.32 });
    this.noiseHit(0.3, { gain: 0.28, filterFreq: 280 });
  }

  click(): void {
    this.tone(600, 0.05, { type: "square", gain: 0.12 });
  }

  roundStart(): void {
    this.tone(660, 0.16, { type: "triangle", endFreq: 880, gain: 0.18 });
  }
}

export const sound = new SoundEngine();
