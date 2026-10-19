// Procedural Web Audio API Engine for TurboMania
// Authentic Normal Internal Combustion Engine (ICE) Audio Synthesis:
// - Deep, throaty 4-stroke gasoline combustion pulses (Sawtooth + Octave Triangle + Sub-Bass Sine)
// - Dynamic throttle tracking: muffled warm idle purr on coast, rich throaty roar under acceleration
// - Exhaust body resonance formant (180 Hz) & acoustic muffler lowpass filtering (zero electric whine)
// - Smooth upshift ignition cuts and gentle deceleration exhaust overrun burbles
// - Responsive multi-surface tire screech (asphalt, gravel, ice)
// - Subtle aerodynamic cabin rush at high speeds (> 160 km/h)
// - Master dynamics compressor for clean, punchy broadcast output with zero distortion

function clampFinite(val, min, max, fallback) {
  if (!Number.isFinite(val)) return fallback;
  return val < min ? min : val > max ? max : val;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = typeof localStorage !== 'undefined' ? localStorage.getItem('tm_muted') === '1' : false;
    this.initialized = false;

    // Master Compressor & Destination
    this.masterCompressor = null;
    this.masterGain = null;

    // Normal Internal Combustion Engine (ICE) Nodes
    this.engineOsc1 = null;      // Primary combustion firing pulse (sawtooth, 1x)
    this.engineOsc2 = null;      // Cylinder chamber octave resonance (triangle, 2x)
    this.engineSubOsc = null;    // Deep mechanical engine block rumble (sine, 0.5x)
    this.voiceGain1 = null;
    this.voiceGain2 = null;
    this.voiceSubGain = null;
    this.exhaustResonator = null;// Exhaust pipe acoustic body formant (180 Hz)
    this.engineFilter = null;    // Dynamic throttle-tracking muffler lowpass filter
    this.engineGain = null;      // Master engine volume

    // Aerodynamic Wind Rush at High Speeds
    this.windNoiseNode = null;
    this.windHighpass = null;
    this.windFilter = null;
    this.windGain = null;

    // Tire Screech / Surface Friction
    this.driftNoiseNode = null;
    this.driftFilter1 = null;
    this.driftFilter2 = null;
    this.driftGain = null;

    // Internal Audio State & Smoothing
    this.curBaseFreq = 75;
    this.curFilterFreq = 420;
    this.curEngineVol = 0;
    this.curWindVol = 0;
    this.curDriftVol = 0;
    this.curScreechFreq = 1100;

    // Dynamics & Overrun State
    this.lastGear = 1;
    this.prevThrottle = 0;
    this.overrunTimer = 0;
    this.nextPopTimer = 0;
    this.shiftCutTimer = 0;
    this.lastResumeAttempt = 0;

    // Unlock/resume AudioContext on any user interaction
    if (typeof window !== 'undefined') {
      const resumeHandler = () => {
        if (!this.initialized) {
          this.init();
        } else if (this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', resumeHandler, { passive: true });
      window.addEventListener('keydown', resumeHandler, { passive: true });
      window.addEventListener('touchstart', resumeHandler, { passive: true });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.ctx && this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
          }
        });
      }
    }
  }

  init() {
    if (this.initialized && this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // 1. Master Dynamics Compressor (Transparent limiter/glue, no cycle distortion)
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -12;
      this.masterCompressor.knee.value = 14;
      this.masterCompressor.ratio.value = 2.8;
      this.masterCompressor.attack.value = 0.030; // 30ms attack prevents low-frequency waveform distortion
      this.masterCompressor.release.value = 0.20;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0.0 : 1.0;

      this.masterCompressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // 2. Normal Internal Combustion Engine (Phase-Locked, Warm Mechanical Tone)
      this.engineOsc1 = this.ctx.createOscillator(); // 1x Fundamental combustion pulse (sawtooth)
      this.engineOsc2 = this.ctx.createOscillator(); // 2x Cylinder octave resonance (triangle)
      this.engineSubOsc = this.ctx.createOscillator(); // 0.5x Engine block rumble (sine)

      this.voiceGain1 = this.ctx.createGain();
      this.voiceGain2 = this.ctx.createGain();
      this.voiceSubGain = this.ctx.createGain();

      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 75;
      this.voiceGain1.gain.value = 0.44;

      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.value = 150; // Exact 2x octave harmonic
      this.voiceGain2.gain.value = 0.36;

      this.engineSubOsc.type = 'sine';
      this.engineSubOsc.frequency.value = 37.5; // Exact 0.5x deep sub rumble
      this.voiceSubGain.gain.value = 0.34;

      // Exhaust Pipe Acoustic Resonator (Gentle warm body boost around 180 Hz)
      this.exhaustResonator = this.ctx.createBiquadFilter();
      this.exhaustResonator.type = 'peaking';
      this.exhaustResonator.frequency.value = 180;
      this.exhaustResonator.Q.value = 1.2;
      this.exhaustResonator.gain.value = 2.5;

      // Dynamic Throttle/RPM Muffler Lowpass Filter (Natural acoustic rolloff)
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineFilter.Q.value = 1.2;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      // Connect engine voices into exhaust resonator & muffler filter
      this.engineOsc1.connect(this.voiceGain1);
      this.engineOsc2.connect(this.voiceGain2);
      this.engineSubOsc.connect(this.voiceSubGain);

      this.voiceGain1.connect(this.exhaustResonator);
      this.voiceGain2.connect(this.exhaustResonator);
      this.voiceSubGain.connect(this.exhaustResonator);

      this.exhaustResonator.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterCompressor);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.engineSubOsc.start();

      // 3. High-Speed Aerodynamic Cabin Wind Rush
      const windBufferSize = Math.floor(this.ctx.sampleRate * 2.0);
      const windBuffer = this.ctx.createBuffer(1, windBufferSize, this.ctx.sampleRate);
      const windData = windBuffer.getChannelData(0);
      let lastVal = 0;
      let sumVal = 0;
      for (let i = 0; i < windBufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastVal = 0.92 * lastVal + 0.08 * white;
        windData[i] = lastVal;
        sumVal += lastVal;
      }
      const dcVal = sumVal / windBufferSize;
      for (let i = 0; i < windBufferSize; i++) {
        windData[i] = (windData[i] - dcVal) * 1.6;
      }
      const loopFadeLen = 2048;
      for (let i = 0; i < loopFadeLen; i++) {
        const f = i / loopFadeLen;
        windData[i] *= f;
        windData[windBufferSize - 1 - i] *= f;
      }
      this.windNoiseNode = this.ctx.createBufferSource();
      this.windNoiseNode.buffer = windBuffer;
      this.windNoiseNode.loop = true;

      this.windHighpass = this.ctx.createBiquadFilter();
      this.windHighpass.type = 'highpass';
      this.windHighpass.frequency.value = 240;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 750;
      this.windFilter.Q.value = 0.8;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;

      this.windNoiseNode.connect(this.windHighpass);
      this.windHighpass.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterCompressor);
      this.windNoiseNode.start();

      // 4. Multi-Surface Tire Screech & Drift Noise
      const driftBufferSize = Math.floor(this.ctx.sampleRate * 2.0);
      const driftBuffer = this.ctx.createBuffer(1, driftBufferSize, this.ctx.sampleRate);
      const driftData = driftBuffer.getChannelData(0);
      for (let i = 0; i < driftBufferSize; i++) {
        driftData[i] = (Math.random() * 2 - 1) * 0.75;
      }
      const driftFadeLen = 2048;
      for (let i = 0; i < driftFadeLen; i++) {
        const f = i / driftFadeLen;
        driftData[i] *= f;
        driftData[driftBufferSize - 1 - i] *= f;
      }
      this.driftNoiseNode = this.ctx.createBufferSource();
      this.driftNoiseNode.buffer = driftBuffer;
      this.driftNoiseNode.loop = true;

      this.driftFilter1 = this.ctx.createBiquadFilter();
      this.driftFilter1.type = 'bandpass';
      this.driftFilter1.frequency.value = 1050;
      this.driftFilter1.Q.value = 2.2;

      this.driftFilter2 = this.ctx.createBiquadFilter();
      this.driftFilter2.type = 'peaking';
      this.driftFilter2.frequency.value = 2200;
      this.driftFilter2.Q.value = 1.8;
      this.driftFilter2.gain.value = 4.0;

      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.value = 0.0;

      this.driftNoiseNode.connect(this.driftFilter1);
      this.driftFilter1.connect(this.driftFilter2);
      this.driftFilter2.connect(this.driftGain);
      this.driftGain.connect(this.masterCompressor);
      this.driftNoiseNode.start();

      this.initialized = true;
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
    } catch (_) {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tm_muted', this.muted ? '1' : '0');
    }
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0.0 : 1.0;
    }
    if (this.muted) {
      this.curEngineVol = 0;
      this.curWindVol = 0;
      this.curDriftVol = 0;
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.windGain) this.windGain.gain.value = 0;
      if (this.driftGain) this.driftGain.gain.value = 0;
    }
    return this.muted;
  }

  updateEngine(rpmOrOpts, speedKmh, drifting, grounded, boostLevel, engineOff, paused) {
    if (!this.initialized || !this.ctx) return;

    // Auto-recover if AudioContext was suspended by browser tab focus
    if (this.ctx.state !== 'running') {
      const nowMs = performance.now();
      if (nowMs - this.lastResumeAttempt > 800) {
        this.lastResumeAttempt = nowMs;
        this.ctx.resume().catch(() => {});
      }
    }

    // Flexible arguments support (options object or positional)
    let rawRpm, rawSpeed, isDrifting, isGrounded, rawBoost, isEngineOff, isPaused;
    let gear = 1, throttle = 1, brake = 0, surface = 'asphalt', dt = 1 / 60;

    if (typeof rpmOrOpts === 'object' && rpmOrOpts !== null) {
      rawRpm = rpmOrOpts.rpm;
      rawSpeed = rpmOrOpts.speedKmh;
      isDrifting = rpmOrOpts.drifting;
      isGrounded = rpmOrOpts.grounded;
      rawBoost = rpmOrOpts.boostLevel;
      isEngineOff = rpmOrOpts.engineOff;
      isPaused = rpmOrOpts.paused;
      gear = clampFinite(Number(rpmOrOpts.gear) || 1, 1, 5, 1);
      throttle = clampFinite(Number(rpmOrOpts.throttle) || 0, 0, 1, 1);
      brake = clampFinite(Number(rpmOrOpts.brake) || 0, 0, 1, 0);
      surface = typeof rpmOrOpts.surface === 'string' ? rpmOrOpts.surface : 'asphalt';
      dt = clampFinite(Number(rpmOrOpts.dt) || (1 / 60), 0.001, 0.1, 1 / 60);
    } else {
      rawRpm = rpmOrOpts;
      rawSpeed = speedKmh;
      isDrifting = drifting;
      isGrounded = grounded;
      rawBoost = boostLevel;
      isEngineOff = engineOff;
      isPaused = paused;
      gear = Math.max(1, Math.min(5, Math.floor(Math.abs(speedKmh || 0) / 70) + 1));
      throttle = 1;
      brake = 0;
      surface = 'asphalt';
      dt = 1 / 60;
    }

    if (this.muted || isPaused) {
      this.curEngineVol += (0 - this.curEngineVol) * 0.25;
      this.curWindVol += (0 - this.curWindVol) * 0.25;
      this.curDriftVol += (0 - this.curDriftVol) * 0.25;

      if (this.engineGain) this.engineGain.gain.value = this.curEngineVol < 0.0005 ? 0 : this.curEngineVol;
      if (this.windGain) this.windGain.gain.value = this.curWindVol < 0.0005 ? 0 : this.curWindVol;
      if (this.driftGain) this.driftGain.gain.value = this.curDriftVol < 0.0005 ? 0 : this.curDriftVol;
      return;
    }

    const safeRpm = clampFinite(rawRpm, 0.18, 1.25, 0.22);
    const safeSpeed = clampFinite(Math.abs(rawSpeed), 0, 560, 0);
    const safeBoost = clampFinite(rawBoost, 0, 2, 0);

    // 1. Gear Shift Detection (Smooth ignition drop on upshifts)
    if (gear !== this.lastGear && safeSpeed > 28 && !isEngineOff) {
      if (gear > this.lastGear) {
        this.shiftCutTimer = 0.035;
        this.playShiftPop();
      }
      this.lastGear = gear;
    }

    if (this.shiftCutTimer > 0) {
      this.shiftCutTimer = Math.max(0, this.shiftCutTimer - dt);
    }

    // 2. Deceleration Exhaust Burble (Gentle, muffled burble when lifting throttle at speed)
    if (this.prevThrottle > 0.2 && throttle === 0 && safeRpm > 0.45 && safeSpeed > 45 && !isEngineOff) {
      this.overrunTimer = 0.45 + Math.random() * 0.45;
    }
    this.prevThrottle = throttle;

    if (this.overrunTimer > 0) {
      this.overrunTimer = Math.max(0, this.overrunTimer - dt);
      this.nextPopTimer -= dt;
      if (this.nextPopTimer <= 0) {
        this.nextPopTimer = 0.09 + Math.random() * 0.15;
        const popIntensity = clampFinite((safeRpm - 0.2) / 0.8, 0.2, 0.8, 0.4);
        this.playOverrunPop(popIntensity);
      }
    }

    // 3. Normal Gasoline Engine Pitch
    // Natural firing rate: 80 Hz idle purr to 220-250 Hz redline roar
    const targetBaseFreq = clampFinite(
      52 + safeRpm * 145 + safeBoost * 32 + (safeSpeed / 400) * 24,
      45,
      320,
      75
    );

    // Dynamic Throttle/RPM Muffler Lowpass Filter:
    // Warm, muffled purr on coast (350-550 Hz), throaty combustion roar on gas (1200-1900 Hz)
    const throttleOpen = throttle > 0 ? 1.0 : 0.35;
    const targetFilterFreq = clampFinite(
      350 + safeRpm * 950 * throttleOpen + safeBoost * 350 + (safeSpeed / 400) * 250,
      260,
      2200,
      450
    );

    // Master Engine Volume
    let targetEngineVol = clampFinite(
      0.048 + Math.min(0.07, (safeSpeed / 340) * 0.06) + (throttle > 0 ? 0.025 : 0) + safeBoost * 0.015,
      0.035,
      0.14,
      0.05
    );
    if (this.shiftCutTimer > 0) {
      targetEngineVol *= 0.45; // Subtle drop on gear change
    }

    // 4. High-Speed Aerodynamic Cabin Wind Rush (> 160 km/h)
    const targetWindFreq = clampFinite(500 + (safeSpeed / 400) * 800, 420, 1500, 700);
    const targetWindVol = clampFinite(
      safeSpeed > 160 ? Math.min(0.040, ((safeSpeed - 160) / 240) * 0.038) : 0,
      0,
      0.042,
      0
    );

    // 5. Multi-Surface Tire Screech & Friction
    const isScreeching = Boolean(isGrounded && isDrifting && safeSpeed > 45);
    const targetDriftVol = isScreeching
      ? clampFinite(Math.min(0.055, ((safeSpeed - 40) / 220) * 0.050), 0, 0.06, 0)
      : 0;

    let targetScreechFreq = 1050;
    if (surface === 'ice') {
      targetScreechFreq = 3200; // Glassy ice hiss
    } else if (surface === 'dirt') {
      targetScreechFreq = 480;  // Low gravel crunch
    }

    // Smooth parameter transitions
    const smooth = 0.22;
    this.curBaseFreq += (targetBaseFreq - this.curBaseFreq) * smooth;
    this.curFilterFreq += (targetFilterFreq - this.curFilterFreq) * smooth;
    this.curEngineVol += (targetEngineVol - this.curEngineVol) * (this.shiftCutTimer > 0 ? 0.5 : 0.18);
    this.curWindVol += (targetWindVol - this.curWindVol) * 0.18;
    this.curDriftVol += (targetDriftVol - this.curDriftVol) * 0.22;
    this.curScreechFreq += (targetScreechFreq - this.curScreechFreq) * 0.22;

    // Apply exact integer harmonic frequencies (Strictly 1x, 2x, 0.5x - zero detuning beating)
    const f1 = clampFinite(this.curBaseFreq, 45, 340, 75);
    this.engineOsc1.frequency.value = f1;
    this.engineOsc2.frequency.value = f1 * 2.0; // Octave chamber harmonic
    if (this.engineSubOsc) {
      this.engineSubOsc.frequency.value = f1 * 0.5; // Deep sub-bass block rumble
    }

    this.engineFilter.frequency.value = clampFinite(this.curFilterFreq, 250, 2400, 450);
    this.engineGain.gain.value = clampFinite(this.curEngineVol, 0, 0.16, 0.05);

    // Apply to Wind Rush
    if (this.windFilter && this.windGain) {
      this.windFilter.frequency.value = targetWindFreq;
      this.windGain.gain.value = this.curWindVol < 0.0005 ? 0 : this.curWindVol;
    }

    // Apply to Tire Screech / Drift
    if (this.driftFilter1 && this.driftGain) {
      this.driftFilter1.frequency.value = this.curScreechFreq;
      this.driftGain.gain.value = this.curDriftVol < 0.0005 ? 0 : this.curDriftVol;
    }
  }

  /**
   * Subtle, muffled exhaust pop during gear shifts
   */
  playShiftPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.040);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.040);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor || this.ctx.destination);

      noise.start(now);
      noise.stop(now + 0.045);
    } catch (_) {}
  }

  /**
   * Realistic, gentle exhaust burble on deceleration
   */
  playOverrunPop(intensity = 0.4) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const safeInt = clampFinite(intensity, 0.1, 0.8, 0.4);
      const dur = 0.030 + Math.random() * 0.020;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.30));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380 + Math.random() * 150, now);

      const gain = this.ctx.createGain();
      const popVol = 0.025 + safeInt * 0.030;
      gain.gain.setValueAtTime(popVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor || this.ctx.destination);

      noise.start(now);
      noise.stop(now + dur + 0.01);
    } catch (_) {}
  }

  playTone(freq, duration = 0.15, type = 'sine', vol = 0.12, slideToFreq = null) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    const safeFreq = clampFinite(freq, 30, 6000, 440);
    const safeDur = clampFinite(duration, 0.04, 1.5, 0.15);
    const safeVol = clampFinite(vol, 0.005, 0.25, 0.1);

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(safeFreq, now);
      if (slideToFreq && Number.isFinite(slideToFreq) && slideToFreq > 20) {
        osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + safeDur);
      }

      gain.gain.setValueAtTime(safeVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + safeDur);

      osc.connect(gain);
      gain.connect(this.masterCompressor || this.ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      };

      osc.start(now);
      osc.stop(now + safeDur + 0.02);
    } catch (_) {}
  }

  playCountdownBeep(isGo = false) {
    if (isGo) {
      this.playTone(880, 0.32, 'triangle', 0.16, 1174.66);
      setTimeout(() => this.playTone(1318.5, 0.25, 'sine', 0.12), 40);
    } else {
      this.playTone(440, 0.14, 'sine', 0.12);
    }
  }

  playBoost(level = 1) {
    if (level === 2) {
      this.playTone(220, 0.42, 'sawtooth', 0.10, 880);
      this.playTone(330, 0.42, 'triangle', 0.10, 1320);
    } else {
      this.playTone(190, 0.28, 'triangle', 0.09, 620);
    }
  }

  playCheckpoint(isAhead = true) {
    if (isAhead) {
      this.playTone(587.33, 0.12, 'triangle', 0.12);
      setTimeout(() => this.playTone(880, 0.22, 'triangle', 0.12), 75);
    } else {
      this.playTone(523.25, 0.12, 'triangle', 0.10);
      setTimeout(() => this.playTone(440, 0.22, 'triangle', 0.10), 75);
    }
  }

  playFinish(isNewRecord = false) {
    const notes = isNewRecord
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.24, 'triangle', 0.13), idx * 80);
    });
  }

  playWallHit(intensity = 0.5) {
    const vol = Math.min(0.14, 0.04 + intensity * 0.10);
    this.playTone(115, 0.12, 'square', vol, 45);
  }
}
