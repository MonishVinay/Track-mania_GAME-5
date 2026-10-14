// Procedural Web Audio API Sound Engine for TurboMania Online
// Uses direct smoothed parameter updates (no AudioParam automation queue buildup)
// and automatic AudioContext resume + node cleanup so car audio never cuts out.

function clampFinite(val, min, max, fallback) {
  if (!Number.isFinite(val)) return fallback;
  return val < min ? min : val > max ? max : val;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('tm_muted') === '1';
    this.initialized = false;

    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineSubOsc = null;
    this.engineGain = null;
    this.engineFilter = null;

    this.driftNoiseNode = null;
    this.driftFilter = null;
    this.driftGain = null;

    // Smoothed state to avoid scheduling thousands of setTargetAtTime events
    this.curFreq1 = 65;
    this.curFreq2 = 130;
    this.curSubFreq = 32.5;
    this.curFilterFreq = 380;
    this.curEngineVol = 0;
    this.curDriftVol = 0;
    this.lastResumeAttempt = 0;

    // Unlock/resume AudioContext on any user interaction
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
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
    });
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

      // Master Engine Synth (dual detuned sawtooth/triangle + sub-octave sine through stable lowpass filter)
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineGain = this.ctx.createGain();
      const subGain = this.ctx.createGain();

      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';
      this.engineSubOsc.type = 'sine';

      this.engineOsc1.frequency.value = 65;
      this.engineOsc2.frequency.value = 130;
      this.engineSubOsc.frequency.value = 32.5;
      subGain.gain.value = 0.45;

      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineFilter.Q.value = 1.2; // Low Q prevents BiquadFilter denormal/NaN lockups

      this.engineGain.gain.value = 0.0;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineSubOsc.connect(subGain);
      subGain.connect(this.engineFilter);

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.engineSubOsc.start();

      // Tire Screech / Drift Bandpass Noise
      const bufferSize = Math.floor(this.ctx.sampleRate * 2.0);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.8;
      }

      this.driftNoiseNode = this.ctx.createBufferSource();
      this.driftNoiseNode.buffer = noiseBuffer;
      this.driftNoiseNode.loop = true;

      this.driftFilter = this.ctx.createBiquadFilter();
      this.driftFilter.type = 'bandpass';
      this.driftFilter.frequency.value = 1100;
      this.driftFilter.Q.value = 1.8;

      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.value = 0.0;

      this.driftNoiseNode.connect(this.driftFilter);
      this.driftFilter.connect(this.driftGain);
      this.driftGain.connect(this.ctx.destination);
      this.driftNoiseNode.start();

      this.initialized = true;
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
    } catch (_) {
      // Ignore audio errors if blocked by browser policy
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('tm_muted', this.muted ? '1' : '0');
    if (this.muted && this.engineGain && this.driftGain) {
      this.curEngineVol = 0;
      this.curDriftVol = 0;
      this.engineGain.gain.value = 0;
      this.driftGain.gain.value = 0;
    }
    return this.muted;
  }

  updateEngine(rpm, speedKmh, drifting, grounded, boostLevel, engineOff, paused) {
    if (!this.initialized || !this.ctx) return;

    // Auto-recover if AudioContext was suspended by browser
    if (this.ctx.state !== 'running') {
      const nowMs = performance.now();
      if (nowMs - this.lastResumeAttempt > 800) {
        this.lastResumeAttempt = nowMs;
        this.ctx.resume().catch(() => {});
      }
    }

    if (this.muted || paused) {
      this.curEngineVol += (0 - this.curEngineVol) * 0.25;
      this.curDriftVol += (0 - this.curDriftVol) * 0.25;
      this.engineGain.gain.value = this.curEngineVol < 0.0005 ? 0 : this.curEngineVol;
      this.driftGain.gain.value = this.curDriftVol < 0.0005 ? 0 : this.curDriftVol;
      return;
    }

    const safeRpm = clampFinite(rpm, 0.15, 1.2, 0.25);
    const safeSpeed = clampFinite(Math.abs(speedKmh), 0, 550, 0);
    const safeBoost = clampFinite(boostLevel, 0, 2, 0);

    const targetBaseFreq = clampFinite(
      55 + safeRpm * 150 + safeBoost * 32 + (safeSpeed / 400) * 24,
      45,
      360,
      75
    );
    const targetFilterFreq = clampFinite(
      340 + safeRpm * 1100 + safeBoost * 450,
      250,
      2800,
      500
    );

    // Always keep a lively idle purr even at 0 km/h, scaling up smoothly with speed & RPM
    const targetEngineVol = clampFinite(
      0.048 + Math.min(0.065, (safeSpeed / 340) * 0.055) + safeBoost * 0.012,
      0.035,
      0.13,
      0.05
    );

    const isScreeching = Boolean(grounded && drifting && safeSpeed > 65);
    const targetDriftVol = isScreeching
      ? clampFinite(Math.min(0.05, ((safeSpeed - 60) / 240) * 0.045), 0, 0.055, 0)
      : 0;

    // Smooth parameters in JS and assign directly to AudioParam.value (prevents WebAudio event queue overflow)
    const smooth = 0.22;
    this.curFreq1 += (targetBaseFreq - this.curFreq1) * smooth;
    this.curFreq2 = this.curFreq1 * 1.995;
    this.curSubFreq = this.curFreq1 * 0.5;
    this.curFilterFreq += (targetFilterFreq - this.curFilterFreq) * smooth;
    this.curEngineVol += (targetEngineVol - this.curEngineVol) * 0.18;
    this.curDriftVol += (targetDriftVol - this.curDriftVol) * 0.2;

    this.engineOsc1.frequency.value = clampFinite(this.curFreq1, 40, 450, 65);
    this.engineOsc2.frequency.value = clampFinite(this.curFreq2, 80, 900, 130);
    if (this.engineSubOsc) {
      this.engineSubOsc.frequency.value = clampFinite(this.curSubFreq, 20, 225, 32.5);
    }
    this.engineFilter.frequency.value = clampFinite(this.curFilterFreq, 200, 3200, 420);
    this.engineGain.gain.value = clampFinite(this.curEngineVol, 0, 0.15, 0.05);
    this.driftGain.gain.value =
      this.curDriftVol < 0.0005 ? 0 : clampFinite(this.curDriftVol, 0, 0.06, 0);
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
      gain.connect(this.ctx.destination);

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
      this.playTone(220, 0.42, 'sawtooth', 0.1, 880);
      this.playTone(330, 0.42, 'triangle', 0.1, 1320);
    } else {
      this.playTone(190, 0.28, 'triangle', 0.09, 620);
    }
  }

  playCheckpoint(isAhead = true) {
    if (isAhead) {
      this.playTone(587.33, 0.12, 'triangle', 0.12);
      setTimeout(() => this.playTone(880, 0.22, 'triangle', 0.12), 75);
    } else {
      this.playTone(523.25, 0.12, 'triangle', 0.1);
      setTimeout(() => this.playTone(440, 0.22, 'triangle', 0.1), 75);
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
    const vol = Math.min(0.14, 0.04 + intensity * 0.1);
    this.playTone(115, 0.12, 'square', vol, 45);
  }
}
