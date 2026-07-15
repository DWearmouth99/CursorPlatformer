/**
 * Game audio: procedural SFX + samples from `/soundeffects/`.
 */
export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = 0.85;
  let hitmarkerBuf: AudioBuffer | null = null;
  let reloadBuf: AudioBuffer | null = null;
  let samplesLoading: Promise<void> | null = null;
  let reloadSource: AudioBufferSourceNode | null = null;
  let reloadGain: GainNode | null = null;

  function ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  async function loadSamples(): Promise<void> {
    const ac = ensure();
    if (!ac) return;
    const loadOne = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const raw = await res.arrayBuffer();
        return await ac.decodeAudioData(raw.slice(0));
      } catch (err) {
        console.warn(`[audio] failed to load ${url}`, err);
        return null;
      }
    };
    if (!hitmarkerBuf) {
      hitmarkerBuf = await loadOne("/soundeffects/hitmarker.mp3");
    }
    if (!reloadBuf) {
      reloadBuf = await loadOne("/soundeffects/reload.mp3");
    }
  }

  function unlock(): void {
    ensure();
    if (!samplesLoading) samplesLoading = loadSamples();
  }

  function setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v));
    ensure();
    if (master) master.gain.value = volume;
  }

  function playBuffer(
    buffer: AudioBuffer,
    gain = 0.5,
    rate = 1,
  ): AudioBufferSourceNode | null {
    const ac = ensure();
    if (!ac || !master) return null;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
    return src;
  }

  function stopReload(): void {
    if (reloadSource) {
      try {
        reloadSource.stop();
      } catch {
        /* already stopped */
      }
      reloadSource = null;
    }
    reloadGain = null;
  }

  function tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain = 0.12,
    freqEnd?: number,
  ): void {
    const ac = ensure();
    if (!ac || !master) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(freqEnd, 20),
        t0 + duration,
      );
    }
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst(duration: number, gain = 0.08, filterFreq = 2000): void {
    const ac = ensure();
    if (!ac || !master) return;
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
    g.connect(master);
    src.start(t0);
    src.stop(t0 + duration);
  }

  function shoot(local: boolean): void {
    noiseBurst(local ? 0.07 : 0.05, local ? 0.14 : 0.06, 1800);
    tone(local ? 180 : 140, 0.06, "square", local ? 0.06 : 0.03, 60);
  }

  function hitConfirm(headshot: boolean): void {
    void (samplesLoading ?? loadSamples()).then(() => {
      if (hitmarkerBuf) {
        playBuffer(hitmarkerBuf, headshot ? 0.7 : 0.55, headshot ? 1.12 : 1);
        return;
      }
      tone(headshot ? 880 : 660, 0.05, "triangle", 0.1);
      if (headshot) tone(1320, 0.04, "sine", 0.07);
    });
  }

  function hurt(): void {
    tone(120, 0.15, "sawtooth", 0.1, 40);
    noiseBurst(0.12, 0.06, 400);
  }

  /** Play reload.mp3 for roughly `durationMs` (trimmed / faded to match reload time). */
  function reload(durationMs = 2000): void {
    void (samplesLoading ?? loadSamples()).then(() => {
      const ac = ensure();
      if (!ac || !master) return;
      stopReload();

      if (!reloadBuf) {
        tone(320, 0.08, "square", 0.05);
        setTimeout(() => tone(240, 0.1, "square", 0.05), 120);
        setTimeout(() => tone(400, 0.06, "triangle", 0.06), 400);
        return;
      }

      const src = ac.createBufferSource();
      const g = ac.createGain();
      reloadSource = src;
      reloadGain = g;
      src.buffer = reloadBuf;
      const sampleLen = reloadBuf.duration;
      const want = Math.max(0.35, durationMs / 1000);
      // Stretch/compress mildly so it covers the weapon reload window
      src.playbackRate.value = Math.max(0.75, Math.min(1.6, sampleLen / want));
      const playFor = sampleLen / src.playbackRate.value;
      const t0 = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.04);
      g.gain.setValueAtTime(0.55, t0 + Math.max(0.05, playFor - 0.12));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + playFor);
      src.connect(g);
      g.connect(master);
      src.onended = () => {
        if (reloadSource === src) reloadSource = null;
      };
      src.start(t0);
      src.stop(t0 + playFor + 0.02);
    });
  }

  function death(): void {
    stopReload();
    tone(200, 0.25, "sawtooth", 0.08, 50);
    noiseBurst(0.3, 0.07, 300);
  }

  function footstep(): void {
    noiseBurst(0.04, 0.035, 250);
  }

  return {
    unlock,
    setVolume,
    shoot,
    hitConfirm,
    hurt,
    reload,
    stopReload,
    death,
    footstep,
  };
}
