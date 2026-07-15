/**
 * Game audio: procedural SFX + samples from `/soundeffects/`.
 */
export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let volume = 0.55;
  let musicVolume = 0.018;
  let hitmarkerBuf: AudioBuffer | null = null;
  let reloadBuf: AudioBuffer | null = null;
  let musicBuf: AudioBuffer | null = null;
  let walkBuf: AudioBuffer | null = null;
  let samplesLoading: Promise<void> | null = null;
  let reloadSource: AudioBufferSourceNode | null = null;
  let reloadGain: GainNode | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let walkSource: AudioBufferSourceNode | null = null;
  let walkGain: GainNode | null = null;
  let musicWanted = false;
  let walkWanted = false;

  function ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicVolume;
      musicBus.connect(ctx.destination);
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
    if (!musicBuf) {
      musicBuf = await loadOne("/soundeffects/backgroundmusic.mp3");
    }
    if (!walkBuf) {
      walkBuf = await loadOne("/soundeffects/walking.mp3");
    }
    if (musicWanted) startMusicInternal();
    if (walkWanted) startWalkInternal();
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

  function setMusicVolume(v: number): void {
    musicVolume = Math.max(0, Math.min(1, v));
    ensure();
    if (musicBus) musicBus.gain.value = musicVolume;
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

  function startMusicInternal(): void {
    const ac = ensure();
    if (!ac || !musicBus || !musicBuf || musicSource) return;
    const src = ac.createBufferSource();
    src.buffer = musicBuf;
    src.loop = true;
    src.connect(musicBus);
    src.start();
    musicSource = src;
  }

  function startMusic(): void {
    musicWanted = true;
    unlock();
    void (samplesLoading ?? loadSamples()).then(() => startMusicInternal());
  }

  function stopMusic(): void {
    musicWanted = false;
    if (musicSource) {
      try {
        musicSource.stop();
      } catch {
        /* already stopped */
      }
      musicSource = null;
    }
  }

  let walkRate = 1;
  let walkRateSmoothed = 1;

  function startWalkInternal(): void {
    const ac = ensure();
    if (!ac || !master || !walkBuf || walkSource) return;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    src.buffer = walkBuf;
    src.loop = true;
    src.playbackRate.value = walkRateSmoothed;
    g.gain.value = 0.2;
    src.connect(g);
    g.connect(master);
    src.start();
    walkSource = src;
    walkGain = g;
  }

  /**
   * Loop walking.mp3 while active. `playbackRate` scales with speed / sprint.
   * Rate is smoothed so walk→sprint doesn't click.
   */
  function setWalking(active: boolean, playbackRate = 1): void {
    walkRate = Math.max(0.7, Math.min(2.2, playbackRate));
    if (active) {
      walkWanted = true;
      walkRateSmoothed += (walkRate - walkRateSmoothed) * 0.18;
      if (walkSource) {
        walkSource.playbackRate.value = walkRateSmoothed;
        if (walkGain) {
          const ac = ensure();
          if (ac) {
            const g = 0.168 + Math.min(0.112, (walkRateSmoothed - 1) * 0.144);
            walkGain.gain.setTargetAtTime(g, ac.currentTime, 0.05);
          }
        }
        return;
      }
      unlock();
      void (samplesLoading ?? loadSamples()).then(() => {
        if (walkWanted) startWalkInternal();
      });
      return;
    }
    walkWanted = false;
    walkRateSmoothed = 1;
    if (walkSource) {
      try {
        walkSource.stop();
      } catch {
        /* already stopped */
      }
      walkSource = null;
      walkGain = null;
    }
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

  function shoot(
    local: boolean,
    weapon?: {
      id?: string;
      projectile?: string;
      fireRate?: number;
      pellets?: number;
      meleeCone?: number;
      explosionRadius?: number;
    } | null,
  ): void {
    const id = weapon?.id ?? "";
    if (weapon?.meleeCone != null) {
      if (id === "gg_slap") {
        noiseBurst(local ? 0.08 : 0.05, local ? 0.16 : 0.08, 900);
        tone(local ? 160 : 140, 0.07, "sine", local ? 0.1 : 0.05, 90);
        return;
      }
      // Hammers / board — heavy whoosh + thud
      noiseBurst(local ? 0.12 : 0.08, local ? 0.2 : 0.1, 500);
      tone(local ? 70 : 55, 0.14, "sawtooth", local ? 0.12 : 0.06, 25);
      setTimeout(() => noiseBurst(0.08, local ? 0.12 : 0.06, 300), 50);
      return;
    }
    if (weapon?.projectile === "rocket") {
      noiseBurst(local ? 0.18 : 0.12, local ? 0.22 : 0.1, 600);
      tone(local ? 90 : 70, 0.2, "sawtooth", local ? 0.12 : 0.06, 30);
      setTimeout(() => noiseBurst(0.25, local ? 0.18 : 0.08, 350), 40);
      return;
    }
    if (id === "gg_chicken") {
      tone(local ? 420 : 360, 0.05, "square", local ? 0.08 : 0.04);
      tone(local ? 280 : 240, 0.08, "sawtooth", local ? 0.07 : 0.035, 120);
      noiseBurst(local ? 0.06 : 0.04, local ? 0.1 : 0.05, 1200);
      return;
    }
    if (id === "gg_soaker" || id === "gg_bubble") {
      noiseBurst(local ? 0.09 : 0.06, local ? 0.12 : 0.06, 800);
      tone(local ? 500 : 420, 0.04, "sine", local ? 0.05 : 0.03);
      return;
    }
    if (id === "gg_thunder" || id === "gg_pointer") {
      noiseBurst(local ? 0.05 : 0.03, local ? 0.1 : 0.05, 2800);
      tone(local ? 880 : 720, 0.05, "sawtooth", local ? 0.07 : 0.035, 200);
      return;
    }
    if (weapon?.pellets && weapon.pellets > 1) {
      noiseBurst(local ? 0.1 : 0.07, local ? 0.18 : 0.08, 1400);
      tone(local ? 120 : 100, 0.08, "square", local ? 0.08 : 0.04, 45);
      return;
    }
    if (weapon?.fireRate && weapon.fireRate >= 10) {
      noiseBurst(local ? 0.04 : 0.03, local ? 0.1 : 0.045, 2200);
      tone(local ? 220 : 180, 0.035, "square", local ? 0.045 : 0.022, 80);
      return;
    }
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
    setWalking(false);
    tone(200, 0.25, "sawtooth", 0.08, 50);
    noiseBurst(0.3, 0.07, 300);
  }

  return {
    unlock,
    setVolume,
    setMusicVolume,
    startMusic,
    stopMusic,
    setWalking,
    shoot,
    hitConfirm,
    hurt,
    reload,
    stopReload,
    death,
  };
}
