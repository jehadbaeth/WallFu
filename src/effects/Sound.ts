// Sample-based SFX engine using Kenney's CC0 sound packs (see public/sfx/CREDITS.md),
// layered with light Web Audio synthesis for sub-bass weight. Until samples finish
// loading (they load lazily after the first user gesture), synthesis fills in.
type OscType = "sine" | "square" | "sawtooth" | "triangle";

const SFX_FILES = [
  "kfhit-med-000.m4a",
  "kfhit-med-001.m4a",
  "kfhit-med-002.m4a",
  "kfhit-med-003.m4a",
  "kfhit-med-004.m4a",
  "kfhit-heavy-000.m4a",
  "kfhit-heavy-001.m4a",
  "kfhit-heavy-002.m4a",
  "kfhit-heavy-003.m4a",
  "impactpunch-medium-000.ogg",
  "impactpunch-medium-001.ogg",
  "impactpunch-medium-002.ogg",
  "impactpunch-medium-003.ogg",
  "impactpunch-medium-004.ogg",
  "impactpunch-heavy-000.ogg",
  "impactpunch-heavy-001.ogg",
  "impactpunch-heavy-002.ogg",
  "impactpunch-heavy-003.ogg",
  "impactpunch-heavy-004.ogg",
  "impactsoft-medium-000.ogg",
  "impactsoft-medium-001.ogg",
  "impactsoft-medium-002.ogg",
  "impactsoft-heavy-000.ogg",
  "impactsoft-heavy-001.ogg",
  "impactsoft-heavy-002.ogg",
  "impactplank-medium-000.ogg",
  "impactplank-medium-001.ogg",
  "footstep-concrete-000.ogg",
  "footstep-concrete-001.ogg",
  "footstep-concrete-002.ogg",
  "cloth1.ogg",
  "cloth2.ogg",
  "cloth3.ogg",
  "cloth4.ogg",
  "knifeslice.ogg",
  "knifeslice2.ogg",
  "click-001.ogg",
  "click-002.ogg",
  "confirmation-001.ogg",
  "vo-fight.ogg",
  "vo-ready.ogg",
  "vo-round-1.ogg",
  "vo-round-2.ogg",
  "vo-round-3.ogg",
  "vo-round-4.ogg",
  "vo-round-5.ogg",
  "vo-final-round.ogg",
  "vo-player-1.ogg",
  "vo-player-2.ogg",
  "vo-winner.ogg",
  "vo-you-win.ogg",
  "vo-you-lose.ogg",
  "vo-flawless-victory.ogg",
  "vo-game-over.ogg",
  "vo-combo.ogg",
  "vo-combo-breaker.ogg",
  "vo-prepare-yourself.ogg",
  "vo-time.ogg",
  "vo-sudden-death.ogg",
  "vo-it-s-a-tie.ogg",
  "vo-2.ogg",
  "vo-3.ogg",
  "vo-4.ogg",
  "vo-5.ogg",
  "vo-6.ogg",
  "vo-7.ogg",
  "vo-8.ogg",
  "vo-9.ogg",
  "vo-10.ogg",
] as const;

// Movie-style hits (Independent.nu "37 hits/punches", CC0 via OpenGameArt):
// full-scale dubbed impacts with the boom and tail already baked in.
const KF_MEDIUM = ["kfhit-med-000", "kfhit-med-001", "kfhit-med-002", "kfhit-med-003", "kfhit-med-004"];
const KF_HEAVY = ["kfhit-heavy-000", "kfhit-heavy-001", "kfhit-heavy-002", "kfhit-heavy-003"];
const PUNCH_MEDIUM = ["impactpunch-medium-000", "impactpunch-medium-001", "impactpunch-medium-002", "impactpunch-medium-003", "impactpunch-medium-004"];
const PUNCH_HEAVY = ["impactpunch-heavy-000", "impactpunch-heavy-001", "impactpunch-heavy-002", "impactpunch-heavy-003", "impactpunch-heavy-004"];
const SOFT_MEDIUM = ["impactsoft-medium-000", "impactsoft-medium-001", "impactsoft-medium-002"];
const SOFT_HEAVY = ["impactsoft-heavy-000", "impactsoft-heavy-001", "impactsoft-heavy-002"];
const PLANK = ["impactplank-medium-000", "impactplank-medium-001"];
const FOOTSTEPS = ["footstep-concrete-000", "footstep-concrete-001", "footstep-concrete-002"];
const WHOOSHES = ["cloth1", "cloth2", "cloth3", "cloth4"];
const SLICES = ["knifeslice", "knifeslice2"];
const CLICKS = ["click-001", "click-002"];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Old kung fu dub whip-cracks: swept bandpass noise recipes, rotated per hit
// like a dubbing studio's foley shelf so no two hits sound identical.
interface CrackRecipe {
  f0: number; // sweep start (Hz)
  f1: number; // sweep end
  q: number; // bandpass resonance
  dur: number; // seconds
}

const PUNCH_CRACKS: CrackRecipe[] = [
  { f0: 2600, f1: 900, q: 7, dur: 0.09 },
  { f0: 3100, f1: 1250, q: 6, dur: 0.07 },
  { f0: 2100, f1: 650, q: 8, dur: 0.12 },
  { f0: 2800, f1: 800, q: 9, dur: 0.1 },
];
const KICK_CRACKS: CrackRecipe[] = [
  { f0: 1700, f1: 500, q: 7, dur: 0.12 },
  { f0: 1400, f1: 420, q: 8, dur: 0.14 },
  { f0: 2000, f1: 600, q: 6, dur: 0.1 },
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loadStarted = false;
  private volume = 0.7;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Must be called from inside a user-gesture handler (click/keydown) to satisfy autoplay policy. */
  unlock(): void {
    this.ensureContext();
    this.loadSamples();
  }

  private echo: DelayNode | null = null;

  private ensureContext(): AudioContext | null {
    if (this.volume <= 0 && !this.ctx) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // Master compressor glues the mix and lets hits slam without clipping.
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.16;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      // Short feedback echo bus: announcer lines and KOs get arcade-hall space.
      this.echo = this.ctx.createDelay(0.5);
      this.echo.delayTime.value = 0.17;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.26;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.echo.connect(feedback);
      feedback.connect(this.echo);
      this.echo.connect(wet);
      wet.connect(this.master);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private loadSamples(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    const ctx = this.ensureContext();
    if (!ctx) {
      this.loadStarted = false;
      return;
    }
    const base = `${import.meta.env.BASE_URL}sfx/`;
    for (const file of SFX_FILES) {
      fetch(base + file)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(file.replace(/\.(ogg|m4a)$/, ""), buffer))
        .catch(() => {
          // Missing sample: synthesis fallback keeps working.
        });
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Plays a sample by name. Returns false if not loaded (caller may fall back to synthesis). */
  private sample(name: string, opts?: { volume?: number; rate?: number; rateVar?: number; when?: number; echo?: boolean }): boolean {
    const ctx = this.ensureContext();
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const rateVar = opts?.rateVar ?? 0.06;
    src.playbackRate.value = (opts?.rate ?? 1) * (1 + (Math.random() * 2 - 1) * rateVar);
    const gain = ctx.createGain();
    gain.gain.value = opts?.volume ?? 1;
    src.connect(gain);
    gain.connect(this.master);
    if (opts?.echo && this.echo) gain.connect(this.echo);
    src.start(ctx.currentTime + (opts?.when ?? 0));
    return true;
  }

  /** Plays announcer lines back to back (e.g. "round one" ... "fight") with arcade echo. */
  voice(names: string[], opts?: { volume?: number; gap?: number }): boolean {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;
    const buffers = names.map((n) => this.buffers.get(n));
    if (buffers.some((b) => !b)) return false;
    let when = 0;
    for (const buffer of buffers as AudioBuffer[]) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = opts?.volume ?? 1;
      src.connect(gain);
      gain.connect(this.master);
      if (this.echo) gain.connect(this.echo);
      src.start(ctx.currentTime + when);
      when += buffer.duration + (opts?.gap ?? 0.08);
    }
    return true;
  }

  private tone(freq: number, duration: number, opts?: { type?: OscType; endFreq?: number; gain?: number; attack?: number; echo?: boolean; when?: number }): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime + (opts?.when ?? 0);
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
    if (opts?.echo && this.echo) gain.connect(this.echo);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * The Shaw Brothers whip-crack: a resonant bandpass sweep over a noise
   * burst, sent hot into the slapback echo. THE dubbed-kung-fu hit sound.
   */
  private kungfuCrack(recipe: CrackRecipe, opts?: { gain?: number; when?: number; echoSend?: number }): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const now = ctx.currentTime + (opts?.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = recipe.q;
    bp.frequency.setValueAtTime(this.vary(recipe.f0, 0.08), now);
    bp.frequency.exponentialRampToValueAtTime(recipe.f1, now + recipe.dur);
    const gain = ctx.createGain();
    const peak = opts?.gain ?? 0.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    if (this.echo) {
      const send = ctx.createGain();
      send.gain.value = opts?.echoSend ?? 0.55;
      gain.connect(send);
      send.connect(this.echo);
    }
    src.start(now);
    src.stop(now + recipe.dur + 0.03);
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

  private vary(freq: number, amount = 0.12): number {
    return freq * (1 + (Math.random() * 2 - 1) * amount);
  }

  jump(): void {
    if (!this.sample(pick(WHOOSHES), { volume: 0.9, rate: 1.55, rateVar: 0.12 })) {
      this.tone(this.vary(420), 0.11, { type: "square", endFreq: 760, gain: 0.14 });
    }
  }

  land(strength: number): void {
    const hard = strength > 0.45;
    if (!this.sample(pick(hard ? SOFT_HEAVY : FOOTSTEPS), { volume: 0.6 + strength * 0.5, rate: hard ? 0.9 : 1.1 })) {
      this.noiseHit(0.07 + strength * 0.05, { gain: 0.18 + strength * 0.22, filterFreq: this.vary(220) });
    }
    if (hard) this.tone(this.vary(70), 0.12, { type: "sine", endFreq: 40, gain: 0.24 });
  }

  dash(): void {
    if (!this.sample(pick(WHOOSHES), { volume: 1, rate: 1.15, rateVar: 0.1 })) {
      this.tone(this.vary(220), 0.13, { type: "sawtooth", endFreq: 60, gain: 0.12 });
    }
  }

  whoosh(big: boolean): void {
    if (!this.sample(pick(WHOOSHES), { volume: big ? 1 : 0.7, rate: big ? 0.85 : 1.35, rateVar: 0.12 })) {
      this.noiseHit(big ? 0.14 : 0.08, { gain: big ? 0.13 : 0.08, filterFreq: big ? 900 : 1500 });
    }
  }

  /** Blade swing/impact for the thrown sword. */
  slice(): void {
    if (!this.sample(pick(SLICES), { volume: 1, rateVar: 0.1 })) {
      this.noiseHit(0.1, { gain: 0.3, filterFreq: this.vary(3200), type: "highpass" });
    }
  }

  hit(heavy: boolean, blocked: boolean, kick = false): void {
    if (blocked) {
      // Blocked: dry wooden knock with just a hint of crack, no echo drama.
      if (!this.sample(pick(PLANK), { volume: 0.65, rate: 1.25 })) {
        this.noiseHit(0.08, { gain: 0.22, filterFreq: this.vary(2400) });
      }
      this.kungfuCrack({ f0: 1500, f1: 950, q: 4, dur: 0.05 }, { gain: 0.7, echoSend: 0.15 });
      return;
    }
    // Real movie hit samples ARE the sound now - nothing else layered loud
    // enough to mask them. Kicks pitch down a touch; sub tone adds chest
    // weight on real speakers.
    const played = this.sample(pick(heavy ? KF_HEAVY : KF_MEDIUM), {
      volume: heavy ? 1.2 : 1.0,
      rate: kick ? 0.88 : 1,
      rateVar: 0.06,
    });
    if (!played) {
      // Samples still loading: synth whip-crack fallback.
      const recipe = pick(kick ? KICK_CRACKS : PUNCH_CRACKS);
      this.kungfuCrack(recipe, { gain: heavy ? 3.2 : 2.4 });
      this.sample(pick(heavy ? PUNCH_HEAVY : PUNCH_MEDIUM), { volume: heavy ? 0.9 : 0.7, rate: 0.8, rateVar: 0.08 });
    }
    const sub = kick ? (heavy ? 55 : 85) : heavy ? 75 : 110;
    this.tone(this.vary(sub), heavy ? 0.26 : 0.12, { type: "sine", endFreq: 28, gain: heavy ? 0.5 : 0.26 });
  }

  wallJump(): void {
    this.sample(pick(FOOTSTEPS), { volume: 0.6, rate: 1.2 });
    if (!this.sample(pick(WHOOSHES), { volume: 0.6, rate: 1.4 })) {
      this.tone(this.vary(500), 0.1, { type: "square", endFreq: 900, gain: 0.15 });
    }
  }

  wallBounce(): void {
    if (!this.sample(pick(SOFT_MEDIUM), { volume: 0.8, rate: 0.9 })) {
      this.noiseHit(0.12, { gain: 0.3, filterFreq: 700 });
    }
    this.tone(this.vary(220), 0.16, { type: "triangle", endFreq: 480, gain: 0.16 });
  }

  ko(): void {
    // The finisher: the biggest movie hit slowed down, doubled, all echo.
    if (!this.sample(pick(KF_HEAVY), { volume: 1.3, rate: 0.8, echo: true })) {
      this.kungfuCrack({ f0: 2400, f1: 600, q: 8, dur: 0.16 }, { gain: 3.4, echoSend: 0.8 });
    }
    this.sample(pick(KF_HEAVY), { volume: 0.8, rate: 0.62, when: 0.07, echo: true });
    this.tone(170, 0.3, { type: "sine", endFreq: 40, gain: 0.7 });
    this.tone(520, 0.55, { type: "sawtooth", endFreq: 35, gain: 0.24 });
    this.noiseHit(0.3, { gain: 0.2, filterFreq: 280 });
  }

  click(): void {
    if (!this.sample(pick(CLICKS), { volume: 0.7 })) {
      this.tone(600, 0.05, { type: "square", gain: 0.12 });
    }
  }

  confirm(): void {
    if (!this.sample("confirmation-001", { volume: 0.8 })) {
      this.tone(660, 0.16, { type: "triangle", endFreq: 880, gain: 0.18 });
    }
  }

  thunder(): void {
    this.noiseHit(0.06, { gain: 0.5, filterFreq: 5000, type: "highpass" });
    this.noiseHit(0.7, { gain: 0.45, filterFreq: 140, type: "lowpass" });
    this.tone(this.vary(60), 0.6, { type: "sine", endFreq: 30, gain: 0.35 });
  }

  lava(): void {
    this.noiseHit(0.9, { gain: 0.3, filterFreq: 220, type: "lowpass" });
    this.noiseHit(0.4, { gain: 0.15, filterFreq: 2600, type: "highpass" });
    this.tone(this.vary(90), 0.5, { type: "triangle", endFreq: 50, gain: 0.2 });
  }

  /** Rising two-tone stinger; used when an announcement has no voice line. */
  announce(excitement = 1): void {
    const base = this.vary(340, 0.05) * (0.9 + excitement * 0.15);
    this.tone(base, 0.14, { type: "square", endFreq: base * 1.5, gain: 0.16 });
    this.tone(base * 1.5, 0.22, { type: "square", endFreq: base * 2.2, gain: 0.14, attack: 0.03 });
    this.noiseHit(0.12, { gain: 0.1, filterFreq: 1800 });
  }
}

export const sound = new SoundEngine();
