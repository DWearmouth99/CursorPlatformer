/**
 * Lightweight procedural SFX via Web Audio API (no asset files).
 * Unlock on first user gesture (pointer lock click).
 */
export function createAudio() {
  let ctx: AudioContext | null = null;

  function ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function unlock(): void {
    ensure();
  }

  function tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain = 0.12,
    freqEnd?: number,
  ): void {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t0 + duration);
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst(duration: number, gain = 0.08, filterFreq = 2000): void {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime;
    const len = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + duration);
  }

  function shoot(local: boolean): void {
    noiseBurst(local ? 0.07 : 0.05, local ? 0.14 : 0.06, 1800);
    tone(local ? 180 : 140, 0.06, "square", local ? 0.06 : 0.03, 60);
  }

  function hitConfirm(headshot: boolean): void {
    tone(headshot ? 880 : 660, 0.05, "triangle", 0.1);
    if (headshot) tone(1320, 0.04, "sine", 0.07);
  }

  function hurt(): void {
    tone(120, 0.15, "sawtooth", 0.1, 40);
    noiseBurst(0.12, 0.06, 400);
  }

  function reload(): void {
    tone(320, 0.08, "square", 0.05);
    setTimeout(() => tone(240, 0.1, "square", 0.05), 120);
    setTimeout(() => tone(400, 0.06, "triangle", 0.06), 400);
  }

  function death(): void {
    tone(200, 0.25, "sawtooth", 0.08, 50);
    noiseBurst(0.3, 0.07, 300);
  }

  function footstep(): void {
    noiseBurst(0.04, 0.035, 250);
  }

  return { unlock, shoot, hitConfirm, hurt, reload, death, footstep };
}
