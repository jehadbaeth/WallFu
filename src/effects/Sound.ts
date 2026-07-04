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

  /** Small random pitch variance so repeated sounds never feel machine-gun identical. */
  private vary(freq: number, amount = 0.12): number {
    return freq * (1 + (Math.random() * 2 - 1) * amount);
  }

  jump(): void {
    this.tone(this.vary(420), 0.11, { type: "square", endFreq: 760, gain: 0.14 });
    this.tone(this.vary(840), 0.07, { type: "sine", endFreq: 1200, gain: 0.06 });
  }

  land(strength: number): void {
    this.noiseHit(0.07 + strength * 0.05, { gain: 0.18 + strength * 0.22, filterFreq: this.vary(220) });
    if (strength > 0.4) this.tone(this.vary(70), 0.12, { type: "sine", endFreq: 40, gain: 0.2 });
  }

  dash(): void {
    this.tone(this.vary(220), 0.13, { type: "sawtooth", endFreq: 60, gain: 0.12 });
    this.noiseHit(0.09, { gain: 0.12, filterFreq: this.vary(3000), type: "highpass" });
  }

  hit(heavy: boolean, blocked: boolean, kick = false): void {
    if (blocked) {
      this.noiseHit(0.08, { gain: 0.22, filterFreq: this.vary(2400) });
      this.tone(this.vary(320), 0.06, { type: "square", gain: 0.1 });
      return;
    }
    // Three layers: sub thump for weight, mid crack for texture, high snap transient.
    const sub = kick ? (heavy ? 62 : 95) : heavy ? 85 : 130;
    const crack = kick ? (heavy ? 300 : 520) : heavy ? 480 : 1000;
    this.tone(this.vary(sub), heavy ? 0.26 : 0.12, { type: "sine", endFreq: 32, gain: heavy ? 0.5 : 0.26 });
    this.noiseHit(heavy ? 0.16 : 0.08, { gain: heavy ? 0.42 : 0.26, filterFreq: this.vary(crack) });
    this.noiseHit(0.03, { gain: heavy ? 0.3 : 0.2, filterFreq: this.vary(4500), type: "highpass" });
  }

  /** Rising two-tone stinger for announcements (FIGHT!, FIRST BLOOD, ...). */
  announce(excitement = 1): void {
    const base = this.vary(340, 0.05) * (0.9 + excitement * 0.15);
    this.tone(base, 0.14, { type: "square", endFreq: base * 1.5, gain: 0.16 });
    this.tone(base * 1.5, 0.22, { type: "square", endFreq: base * 2.2, gain: 0.14, attack: 0.03 });
    this.noiseHit(0.12, { gain: 0.1, filterFreq: 1800 });
  }

  whoosh(big: boolean): void {
    this.noiseHit(big ? 0.14 : 0.08, { gain: big ? 0.13 : 0.08, filterFreq: big ? 900 : 1500 });
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
