// Procedural Web Audio API High-Performance Race Car Sound Engine for TurboMania
// Features:
// - Multi-Harmonic High-Rev Racing Combustion Engine (Detuned Sawtooths + Octave Screamer + Sub-Rumble)
// - WaveShaper Saturation & Overdrive (throaty, metallic, internal-combustion exhaust rasp)
// - Acoustic Exhaust Pipe Resonance Formant Filter & Dynamic Throttle-Tracking Air Intake
// - Straight-Cut Dogbox Racing Transmission Gear Whine (scales with speed & gear ratio)
// - Turbocharger Spool Whine (whistling turbo boost under load)
// - Sequential Gear-Shift Ignition Cuts & Exhaust Shift Pops
// - Deceleration Overrun Pops & Crackles (anti-lag exhaust flames on lift-off / braking)
// - Aerodynamic High-Speed Wind Rush (subtle immersive cabin rush above 160+ km/h)
// - Multi-Surface Tire Screech (screaming rubber on asphalt, gravel churn on dirt, glassy hiss on ice)
// - Layered Impact Crunch & Low-End Bass Punch for Barrier Hits
// - Master Dynamics Compressor for broadcast-quality mix with zero digital clipping

function clampFinite(val, min, max, fallback) {
  if (!Number.isFinite(val)) return fallback;
  return val < min ? min : val > max ? max : val;
}

function makeDistortionCurve(amount = 2.2) {
  const n_samples = 1025;
  const curve = new Float32Array(n_samples);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i / 512) - 1;
    curve[i] = Math.tanh(amount * x) / norm;
  }
  return curve;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = typeof localStorage !== 'undefined' ? localStorage.getItem('tm_muted') === '1' : false;
    this.initialized = false;

    // Master Compressor & Destination
    this.masterCompressor = null;
    this.masterGain = null;

    // Multi-Harmonic Racing Engine Nodes (Harmonically Phase-Locked, Zero Detuning Beating)
    this.engineOsc1 = null;    // Fundamental cylinder combustion pulse (sawtooth, 1x)
    this.engineOsc2 = null;    // Exhaust collector octave harmonic (sawtooth, 2x)
    this.engineOsc3 = null;    // High-rev intake screamer (triangle, 3x)
    this.voiceGain1 = null;
    this.voiceGain2 = null;
    this.voiceGain3 = null;
    this.enginePreGain = null;
    this.engineShaper = null;   // WaveShaper soft-clip saturation (warm analog tanh curve)
    this.exhaustFilter = null;  // Peaking exhaust header resonant formant (smooth Q)
    this.engineFilter = null;   // Main dynamic throttle/RPM lowpass filter
    this.engineHighpass = null; // Clean low-cut filter at 82Hz (eliminates DC offset, 30-70Hz rumble & quill)
    this.engineGain = null;     // Master engine level

    // Straight-Cut Dogbox Racing Gearbox Whine
    this.gearWhineOsc = null;
    this.gearWhineFilter = null;
    this.gearWhineGain = null;

    // Turbocharger Spool Whine
    this.turboOsc = null;
    this.turboGain = null;

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
    this.curBaseFreq = 95;
    this.curExhaustFreq = 750;
    this.curFilterFreq = 1200;
    this.curEngineVol = 0;
    this.curGearWhineVol = 0;
    this.curTurboVol = 0;
    this.curWindVol = 0;
    this.curDriftVol = 0;
    this.curScreechFreq = 1100;

    // Race Engine Dynamics & Overrun State
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

      // 1. Master Dynamics Compressor (Broadcast-quality limiter/glue)
      // 25ms attack prevents waveform distortion on low frequencies (no buzzing / quill)
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -12;
      this.masterCompressor.knee.value = 14;
      this.masterCompressor.ratio.value = 3.0;
      this.masterCompressor.attack.value = 0.025;
      this.masterCompressor.release.value = 0.18;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0.0 : 1.0;

      this.masterCompressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // 2. Multi-Harmonic Racing Engine Synthesizer (Harmonically Locked - Zero Beating / Zero Quill)
      this.engineOsc1 = this.ctx.createOscillator(); // 1x Fundamental combustion pulse (sawtooth)
      this.engineOsc2 = this.ctx.createOscillator(); // 2x Exhaust collector octave harmonic (sawtooth)
      this.engineOsc3 = this.ctx.createOscillator(); // 3x High-RPM valve & intake screamer (triangle)

      this.voiceGain1 = this.ctx.createGain();
      this.voiceGain2 = this.ctx.createGain();
      this.voiceGain3 = this.ctx.createGain();
      this.enginePreGain = this.ctx.createGain();

      // Clean integer harmonic voicing with zero detuning beat
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 95;
      this.voiceGain1.gain.value = 0.40;

      this.engineOsc2.type = 'sawtooth';
      this.engineOsc2.frequency.value = 190; // Exactly 2x fundamental (octave harmonic)
      this.voiceGain2.gain.value = 0.25;

      this.engineOsc3.type = 'triangle';
      this.engineOsc3.frequency.value = 285; // Exactly 3x fundamental (intake scream)
      this.voiceGain3.gain.value = 0.18;

      this.enginePreGain.gain.value = 0.46; // Musical headroom into WaveShaper

      // Connect voices to pre-gain
      this.engineOsc1.connect(this.voiceGain1);
      this.engineOsc2.connect(this.voiceGain2);
      this.engineOsc3.connect(this.voiceGain3);

      this.voiceGain1.connect(this.enginePreGain);
      this.voiceGain2.connect(this.enginePreGain);
      this.voiceGain3.connect(this.enginePreGain);

      // Soft-Clipping Saturation / Waveshaper Stage (Warm Analog Saturation without IMD Buzz)
      this.engineShaper = this.ctx.createWaveShaper();
      this.engineShaper.curve = makeDistortionCurve(2.2);
      this.engineShaper.oversample = '2x';
      this.enginePreGain.connect(this.engineShaper);

      // Acoustic Exhaust Header Resonant Formant Filter (Natural smooth Q)
      this.exhaustFilter = this.ctx.createBiquadFilter();
      this.exhaustFilter.type = 'peaking';
      this.exhaustFilter.frequency.value = 750;
      this.exhaustFilter.Q.value = 1.2;
      this.exhaustFilter.gain.value = 3.0; // Smooth +3dB tuned exhaust pipe warmth

      // Dynamic Throttle/RPM Lowpass Filter
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 1200;
      this.engineFilter.Q.value = 1.0;

      // Highpass Clean-Cut Filter (Eliminates sub-audible DC drift, 30-70Hz rumble & low-frequency quill)
      this.engineHighpass = this.ctx.createBiquadFilter();
      this.engineHighpass.type = 'highpass';
      this.engineHighpass.frequency.value = 82;
      this.engineHighpass.Q.value = 0.707; // Standard Butterworth flat passband

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      this.engineShaper.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.engineFilter);
      this.engineFilter.connect(this.engineHighpass);
      this.engineHighpass.connect(this.engineGain);
      this.engineGain.connect(this.masterCompressor);

      this.engineOsc1.start();
      this.engineOsc2.start();
      this.engineOsc3.start();

      // 3. Straight-Cut Dogbox Racing Gearbox Whine (Smoothed & Lowpass Filtered)
      this.gearWhineOsc = this.ctx.createOscillator();
      this.gearWhineFilter = this.ctx.createBiquadFilter();
      this.gearWhineGain = this.ctx.createGain();

      this.gearWhineOsc.type = 'sine';
      this.gearWhineOsc.frequency.value = 220;

      this.gearWhineFilter.type = 'lowpass';
      this.gearWhineFilter.frequency.value = 2400;
      this.gearWhineFilter.Q.value = 0.7;

      this.gearWhineGain.gain.value = 0.0;

      this.gearWhineOsc.connect(this.gearWhineFilter);
      this.gearWhineFilter.connect(this.gearWhineGain);
      this.gearWhineGain.connect(this.masterCompressor);
      this.gearWhineOsc.start();

      // 4. Turbocharger Spool Whine
      this.turboOsc = this.ctx.createOscillator();
      this.turboGain = this.ctx.createGain();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 2400;
      this.turboGain.gain.value = 0.0;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.masterCompressor);
      this.turboOsc.start();

      // 5. High-Speed Aerodynamic Wind Rush Noise (DC-Free, Highpass Filtered, Seamless Looping)
      const windBufferSize = Math.floor(this.ctx.sampleRate * 2.0);
      const windBuffer = this.ctx.createBuffer(1, windBufferSize, this.ctx.sampleRate);
      const windData = windBuffer.getChannelData(0);
      let lastVal = 0;
      let sumVal = 0;
      for (let i = 0; i < windBufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastVal = 0.90 * lastVal + 0.10 * white; // Pink-filtered noise
        windData[i] = lastVal;
        sumVal += lastVal;
      }
      const dcVal = sumVal / windBufferSize;
      for (let i = 0; i < windBufferSize; i++) {
        windData[i] = (windData[i] - dcVal) * 1.8;
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
      this.windHighpass.frequency.value = 220; // Zero sub-rumble from wind

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

      // 6. Multi-Surface Tire Screech & Drift Noise
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
      this.driftFilter2.frequency.value = 2400;
      this.driftFilter2.Q.value = 2.0;
      this.driftFilter2.gain.value = 4.5;

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
      this.curGearWhineVol = 0;
      this.curTurboVol = 0;
      this.curWindVol = 0;
      this.curDriftVol = 0;
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.gearWhineGain) this.gearWhineGain.gain.value = 0;
      if (this.turboGain) this.turboGain.gain.value = 0;
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
      this.curGearWhineVol += (0 - this.curGearWhineVol) * 0.25;
      this.curTurboVol += (0 - this.curTurboVol) * 0.25;
      this.curWindVol += (0 - this.curWindVol) * 0.25;
      this.curDriftVol += (0 - this.curDriftVol) * 0.25;

      if (this.engineGain) this.engineGain.gain.value = this.curEngineVol < 0.0005 ? 0 : this.curEngineVol;
      if (this.gearWhineGain) this.gearWhineGain.gain.value = this.curGearWhineVol < 0.0005 ? 0 : this.curGearWhineVol;
      if (this.turboGain) this.turboGain.gain.value = this.curTurboVol < 0.0005 ? 0 : this.curTurboVol;
      if (this.windGain) this.windGain.gain.value = this.curWindVol < 0.0005 ? 0 : this.curWindVol;
      if (this.driftGain) this.driftGain.gain.value = this.curDriftVol < 0.0005 ? 0 : this.curDriftVol;
      return;
    }

    const safeRpm = clampFinite(rawRpm, 0.20, 1.25, 0.25);
    const safeSpeed = clampFinite(Math.abs(rawSpeed), 0, 560, 0);
    const safeBoost = clampFinite(rawBoost, 0, 2, 0);

    // 1. Sequential Gear Shift Detection & Ignition Cut
    if (gear !== this.lastGear && safeSpeed > 28 && !isEngineOff) {
      if (gear > this.lastGear) {
        // Crisp ignition cut & shift pop on upshift!
        this.shiftCutTimer = 0.038;
        this.playShiftPop();
      }
      this.lastGear = gear;
    }

    if (this.shiftCutTimer > 0) {
      this.shiftCutTimer = Math.max(0, this.shiftCutTimer - dt);
    }

    // 2. Deceleration Exhaust Overrun & Backfire Crackles
    // When driver lifts off throttle at high RPM or brakes hard, unburnt fuel detonates in exhaust
    if (this.prevThrottle > 0.2 && throttle === 0 && safeRpm > 0.45 && safeSpeed > 45 && !isEngineOff) {
      this.overrunTimer = 0.55 + Math.random() * 0.55;
    }
    this.prevThrottle = throttle;

    if (this.overrunTimer > 0) {
      this.overrunTimer = Math.max(0, this.overrunTimer - dt);
      this.nextPopTimer -= dt;
      if (this.nextPopTimer <= 0) {
        this.nextPopTimer = 0.08 + Math.random() * 0.14;
        const popIntensity = clampFinite((safeRpm - 0.2) / 0.8, 0.25, 1.0, 0.5);
        this.playOverrunPop(popIntensity);
      }
    }

    // 3. Multi-Harmonic Engine Frequencies (Harmonically Phase-Locked, Zero Detuning Beating)
    // High-rev race car fundamental pitch: 86Hz idle burble up to 450Hz redline scream (and 550Hz on super boost)
    const targetBaseFreq = clampFinite(
      86 + safeRpm * 300 + safeBoost * 50 + (safeSpeed / 420) * 34,
      80,
      620,
      95
    );

    // Dynamic Intake / Exhaust Filter tracking throttle & RPM
    // Wide open throttle opens the lowpass filter to 7500+ Hz for an intense un-muffled race scream!
    const throttleOpen = throttle > 0 ? 1.0 : 0.25;
    const targetFilterFreq = clampFinite(
      800 + safeRpm * 3200 * throttleOpen + safeBoost * 1800 + (safeSpeed / 400) * 900,
      550,
      9500,
      1200
    );

    // Peaking exhaust resonator formant frequency
    const targetExhaustFreq = clampFinite(
      640 + safeRpm * 400 + safeBoost * 120,
      580,
      1350,
      760
    );

    // Master Engine Volume with ignition cut dip on shifts
    let targetEngineVol = clampFinite(
      0.060 + Math.min(0.08, (safeSpeed / 320) * 0.07) + (throttle > 0 ? 0.024 : 0) + safeBoost * 0.02,
      0.045,
      0.17,
      0.07
    );
    if (this.shiftCutTimer > 0) {
      targetEngineVol *= 0.35; // volume drop on shift cut
    }

    // 4. Straight-Cut Transmission Gearbox Whine (Subtle & Lowpass Filtered)
    const targetGearWhineFreq = clampFinite(
      220 + safeSpeed * 4.2 + gear * 45,
      180,
      2600,
      350
    );
    const targetGearWhineVol = clampFinite(
      safeSpeed > 35 ? Math.min(0.028, ((safeSpeed - 35) / 280) * 0.024 * (throttle > 0 ? 1.2 : 0.7)) : 0,
      0,
      0.030,
      0
    );

    // 5. Turbocharger Spool Whine
    // High whistling frequency that spools when boosting or under heavy acceleration
    const targetTurboFreq = clampFinite(
      2200 + safeRpm * 1900 + safeBoost * 950,
      2000,
      5200,
      2600
    );
    const isTurboSpooling = safeBoost > 0 || (safeRpm > 0.62 && throttle > 0.5 && safeSpeed > 60);
    const targetTurboVol = isTurboSpooling
      ? clampFinite(0.012 + safeBoost * 0.016 + (safeRpm - 0.5) * 0.014, 0, 0.036, 0)
      : 0;

    // 6. High-Speed Aerodynamic Wind Rush
    // Gentle pink/white noise whoosh that builds above 160 km/h and roars up to 450+ km/h
    const targetWindFreq = clampFinite(550 + (safeSpeed / 400) * 850, 450, 1600, 750);
    const targetWindVol = clampFinite(
      safeSpeed > 150 ? Math.min(0.045, ((safeSpeed - 150) / 250) * 0.042) : 0,
      0,
      0.048,
      0
    );

    // 7. Surface-Specific Tire Screech & Friction
    const isScreeching = Boolean(isGrounded && isDrifting && safeSpeed > 45);
    const targetDriftVol = isScreeching
      ? clampFinite(Math.min(0.065, ((safeSpeed - 40) / 220) * 0.058), 0, 0.07, 0)
      : 0;

    let targetScreechFreq = 1050;
    if (surface === 'ice') {
      targetScreechFreq = 3600; // Glassy high-frequency ice hiss
    } else if (surface === 'dirt') {
      targetScreechFreq = 480;  // Low gravel churn
    }

    // Smooth parameter transitions in JS and assign directly to AudioParam.value
    // (Preserves silky 60/120 FPS performance and prevents WebAudio event queue overflow)
    const smooth = 0.24;
    this.curBaseFreq += (targetBaseFreq - this.curBaseFreq) * smooth;
    this.curFilterFreq += (targetFilterFreq - this.curFilterFreq) * smooth;
    this.curExhaustFreq += (targetExhaustFreq - this.curExhaustFreq) * smooth;
    this.curEngineVol += (targetEngineVol - this.curEngineVol) * (this.shiftCutTimer > 0 ? 0.6 : 0.2);
    this.curGearWhineVol += (targetGearWhineVol - this.curGearWhineVol) * 0.22;
    this.curTurboVol += (targetTurboVol - this.curTurboVol) * 0.16;
    this.curWindVol += (targetWindVol - this.curWindVol) * 0.18;
    this.curDriftVol += (targetDriftVol - this.curDriftVol) * 0.25;
    this.curScreechFreq += (targetScreechFreq - this.curScreechFreq) * 0.25;

    // Apply to Engine Oscillators & Filters (Phase-locked integer multiples, zero detuning beating)
    const f1 = clampFinite(this.curBaseFreq, 50, 650, 95);
    this.engineOsc1.frequency.value = f1;
    this.engineOsc2.frequency.value = f1 * 2.0; // Phase-locked octave - zero beating / zero flutter
    this.engineOsc3.frequency.value = f1 * 3.0; // Phase-locked 3rd harmonic screamer - zero beating

    // High screamer voice gain opens with throttle & RPM for authentic Formula 1 shriek
    if (this.voiceGain3) {
      this.voiceGain3.gain.value = clampFinite(0.08 + safeRpm * 0.24 * throttleOpen + safeBoost * 0.08, 0.06, 0.38, 0.18);
    }

    this.exhaustFilter.frequency.value = clampFinite(this.curExhaustFreq, 480, 1500, 750);
    this.exhaustFilter.gain.value = throttle > 0 ? 3.5 : 1.2;

    this.engineFilter.frequency.value = clampFinite(this.curFilterFreq, 450, 10500, 1200);
    this.engineGain.gain.value = clampFinite(this.curEngineVol, 0, 0.18, 0.06);

    // Apply to Transmission Gear Whine
    if (this.gearWhineOsc && this.gearWhineGain) {
      this.gearWhineOsc.frequency.value = targetGearWhineFreq;
      this.gearWhineGain.gain.value = this.curGearWhineVol < 0.0005 ? 0 : this.curGearWhineVol;
    }

    // Apply to Turbocharger
    if (this.turboOsc && this.turboGain) {
      this.turboOsc.frequency.value = targetTurboFreq;
      this.turboGain.gain.value = this.curTurboVol < 0.0005 ? 0 : this.curTurboVol;
    }

    // Apply to Aerodynamic Wind Rush
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
   * Crisp, punchy ignition-cut exhaust pop during sequential upshifts
   */
  playShiftPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.045);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(680, now);
      filter.Q.setValueAtTime(2.2, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor || this.ctx.destination);

      noise.start(now);
      noise.stop(now + 0.05);
    } catch (_) {}
  }

  /**
   * Realistic exhaust overrun pops, bangs & crackles on throttle lift-off / deceleration
   */
  playOverrunPop(intensity = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const safeInt = clampFinite(intensity, 0.2, 1.0, 0.5);
      const dur = 0.035 + Math.random() * 0.025;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const centerFreq = 480 + Math.random() * 420;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerFreq, now);
      filter.Q.setValueAtTime(2.8, now);

      const gain = this.ctx.createGain();
      const popVol = 0.04 + safeInt * 0.045;
      gain.gain.setValueAtTime(popVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      // Punchy exhaust pop thud (tight 120Hz to 55Hz decay, zero 32Hz sub rumble)
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(120, now);
      thudOsc.frequency.exponentialRampToValueAtTime(55, now + dur);
      thudGain.gain.setValueAtTime(popVol * 0.45, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterCompressor || this.ctx.destination);

      thudOsc.connect(thudGain);
      thudGain.connect(this.masterCompressor || this.ctx.destination);

      noise.start(now);
      thudOsc.start(now);
      noise.stop(now + dur + 0.01);
      thudOsc.stop(now + dur + 0.01);
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
      // Formula 1 Green Go Signal: crisp dual-tone celebratory chime
      this.playTone(987.77, 0.35, 'triangle', 0.16, 1318.5);
      setTimeout(() => this.playTone(1567.98, 0.30, 'sine', 0.14), 45);
    } else {
      // Formula 1 Red Light sequence: sharp 520Hz tone
      this.playTone(520, 0.15, 'triangle', 0.14);
    }
  }

  playBoost(level = 1) {
    if (level === 2) {
      // Super Boost Reactor Pad: massive surging rising power chord
      this.playTone(220, 0.45, 'sawtooth', 0.11, 880);
      this.playTone(330, 0.45, 'triangle', 0.11, 1320);
      this.playTone(550, 0.35, 'sine', 0.08, 1760);
    } else {
      // Standard Turbo Boost: rising futuristic turbine charge
      this.playTone(190, 0.30, 'triangle', 0.10, 680);
      this.playTone(285, 0.30, 'sine', 0.08, 1020);
    }
  }

  playCheckpoint(isAhead = true) {
    if (isAhead) {
      // Crisp affirmative high-tech split chime (Green / Ahead)
      this.playTone(659.25, 0.11, 'triangle', 0.13);
      setTimeout(() => this.playTone(987.77, 0.22, 'triangle', 0.14), 70);
    } else {
      // Warning split tone (Red / Behind)
      this.playTone(523.25, 0.11, 'triangle', 0.11);
      setTimeout(() => this.playTone(440, 0.20, 'triangle', 0.11), 70);
    }
  }

  playFinish(isNewRecord = false) {
    const notes = isNewRecord
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
      : [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.26, 'triangle', 0.14), idx * 75);
    });
  }

  /**
   * Heavy barrier impact: low-frequency punch + metallic body crunch
   */
  playWallHit(intensity = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    try {
      const now = this.ctx.currentTime;
      const safeInt = clampFinite(intensity, 0.1, 1.0, 0.5);
      const vol = clampFinite(0.06 + safeInt * 0.12, 0.05, 0.20, 0.1);
      const dur = 0.14 + safeInt * 0.06;

      // 1. Low bass chassis thump
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + dur);
      oscGain.gain.setValueAtTime(vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      // 2. Metallic crunch transient noise
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.07);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1300, now);
      filter.Q.setValueAtTime(2.5, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(vol * 0.75, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(oscGain);
      oscGain.connect(this.masterCompressor || this.ctx.destination);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterCompressor || this.ctx.destination);

      osc.start(now);
      noise.start(now);
      osc.stop(now + dur + 0.01);
      noise.stop(now + 0.08);
    } catch (_) {}
  }
}
