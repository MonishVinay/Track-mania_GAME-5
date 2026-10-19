// 120Hz Deterministic-Feel Custom Trackmania 3D Physics & Surface Engine
// Engineered for zero sudden slowdowns on slopes, crests, boost decays, jump landings, or wall brushes.

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function lerpVec(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const RIDE_HEIGHT = 0.52;
const CAR_HALF_WIDTH = 1.1;
const GRAVITY = 26.0;

export class CarPhysics {
  constructor(track) {
    this.track = null;
    this.events = [];

    // Transform & kinematics
    this.pos = { x: 0, y: 2, z: 0 };
    this.prevPos = { x: 0, y: 2, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };

    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    this.forward = { x: 0, y: 0, z: -1 };
    this.up = { x: 0, y: 1, z: 0 };
    this.right = { x: 1, y: 0, z: 0 };

    // Driving states
    this.grounded = true;
    this.airTime = 0;
    this.surface = 'asphalt';
    this.lastSegIndex = 0;
    this.trackProgressDist = 0;

    this.boostTimer = 0;
    this.boostLevel = 0; // 0 = none, 1 = turbo, 2 = super_boost
    this.engineOff = false;
    this.engineOffTimer = 0;
    this.wallHitCooldown = 0;

    this.drifting = false;
    this.driftAngle = 0;
    this.steerAngle = 0;
    this.wheelRotation = 0;
    this.suspensionOffset = 0;
    this.suspensionVel = 0;

    // Persistent surface-tangent speeds prevent geometric projection losses on hills & crests
    this.speedMs = 0;
    this.speedKmh = 0;
    this.forwardSpeedMs = 0;
    this.lateralSpeedMs = 0;
    this.gear = 1;
    this.rpm = 0.22;

    // Race progression
    this.passedCheckpoints = new Set();
    this.lastCheckpointIndex = 0;
    this.checkpointSplits = [];
    this.finished = false;
    this.finishTimeMs = 0;
    this.raceElapsedMs = 0;
    this.controlsLocked = false;

    if (track) {
      this.setTrack(track);
    }
  }

  setTrack(track) {
    this.track = track;
    this.resetToStart();
  }

  resetToStart() {
    if (!this.track) return;
    const st = this.track.startTransform;
    this.pos = { ...st.p };
    this.prevPos = { ...st.p };
    this.vel = { x: 0, y: 0, z: 0 };

    this.yaw = st.yaw;
    this.pitch = st.pitch;
    this.roll = st.bank;

    this.forward = { ...st.f };
    this.up = { ...st.u };
    this.right = { ...st.r };

    this.grounded = true;
    this.airTime = 0;
    this.surface = 'asphalt';
    this.lastSegIndex = 0;
    this.trackProgressDist = 0;

    this.boostTimer = 0;
    this.boostLevel = 0;
    this.engineOff = false;
    this.engineOffTimer = 0;
    this.wallHitCooldown = 0;

    this.drifting = false;
    this.driftAngle = 0;
    this.steerAngle = 0;
    this.wheelRotation = 0;
    this.suspensionOffset = 0;
    this.suspensionVel = 0;

    this.speedMs = 0;
    this.speedKmh = 0;
    this.forwardSpeedMs = 0;
    this.lateralSpeedMs = 0;
    this.gear = 1;
    this.rpm = 0.22;

    this.passedCheckpoints.clear();
    this.lastCheckpointIndex = 0;
    this.checkpointSplits = [];
    this.finished = false;
    this.finishTimeMs = 0;
    this.raceElapsedMs = 0;
    this.events.length = 0;
  }

  respawnAtCheckpoint() {
    if (!this.track) return;
    if (this.lastCheckpointIndex <= 0 || this.lastCheckpointIndex > this.track.checkpoints.length) {
      const st = this.track.startTransform;
      this.pos = { ...st.p };
      this.prevPos = { ...st.p };
      this.vel = { x: 0, y: 0, z: 0 };
      this.yaw = st.yaw;
      this.pitch = st.pitch;
      this.roll = st.bank;
      this.forward = { ...st.f };
      this.up = { ...st.u };
      this.right = { ...st.r };
      this.lastSegIndex = 0;
    } else {
      const cp = this.track.checkpoints[this.lastCheckpointIndex - 1];
      this.pos = {
        x: cp.p.x + cp.u.x * (RIDE_HEIGHT + 0.05),
        y: cp.p.y + cp.u.y * (RIDE_HEIGHT + 0.05),
        z: cp.p.z + cp.u.z * (RIDE_HEIGHT + 0.05)
      };
      this.prevPos = { ...this.pos };
      this.vel = { x: 0, y: 0, z: 0 };
      this.yaw = cp.yaw;
      this.pitch = cp.pitch;
      this.roll = cp.bank;
      this.forward = { ...cp.f };
      this.up = { ...cp.u };
      this.right = { ...cp.r };
      this.lastSegIndex = Math.max(0, cp.sliceIndex - 2);
    }

    this.grounded = true;
    this.airTime = 0;
    this.surface = 'asphalt';
    this.boostTimer = 0;
    this.boostLevel = 0;
    this.engineOff = false;
    this.engineOffTimer = 0;
    this.wallHitCooldown = 0;
    this.drifting = false;
    this.driftAngle = 0;
    this.speedMs = 0;
    this.speedKmh = 0;
    this.forwardSpeedMs = 0;
    this.lateralSpeedMs = 0;
    this.events.push({ type: 'respawn' });
  }

  consumeEvents() {
    if (this.events.length === 0) return [];
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /**
   * Finds the closest valid road segment beneath or near `pos`.
   */
  findBestSegment(pos) {
    const track = this.track;
    if (!track || track.segments.length === 0) return null;

    const candidates = new Set();

    // 1. Temporal window around lastSegIndex for bridge continuity and jump landings
    const startIdx = Math.max(0, this.lastSegIndex - 10);
    const endIdx = Math.min(track.segments.length - 1, this.lastSegIndex + 26);
    for (let i = startIdx; i <= endIdx; i++) {
      candidates.add(track.segments[i]);
    }

    // 2. Spatial Hash Grid lookup around (pos.x, pos.z)
    const gx = Math.floor(pos.x / track.cellSize);
    const gz = Math.floor(pos.z / track.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = track.spatialGrid.get(`${gx + dx},${gz + dz}`);
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            candidates.add(bucket[i]);
          }
        }
      }
    }

    let bestHit = null;
    let bestScore = Infinity;

    for (const seg of candidates) {
      if (
        pos.x < seg.minX ||
        pos.x > seg.maxX ||
        pos.z < seg.minZ ||
        pos.z > seg.maxZ ||
        pos.y < seg.minY ||
        pos.y > seg.maxY
      ) {
        continue;
      }

      const vx = pos.x - seg.s0.p.x;
      const vy = pos.y - seg.s0.p.y;
      const vz = pos.z - seg.s0.p.z;

      const rawT = (vx * seg.dir.x + vy * seg.dir.y + vz * seg.dir.z) / seg.lenSq;
      if (rawT < -0.45 || rawT > 1.45) continue;

      const t = clamp(rawT, 0, 1);
      const P = lerpVec(seg.s0.p, seg.s1.p, t);
      const U = normalize(lerpVec(seg.s0.u, seg.s1.u, t));
      const R = normalize(lerpVec(seg.s0.r, seg.s1.r, t));
      const F = normalize(lerpVec(seg.s0.f, seg.s1.f, t));
      const W = lerp(seg.s0.halfWidth, seg.s1.halfWidth, t);

      const rel = { x: pos.x - P.x, y: pos.y - P.y, z: pos.z - P.z };
      const lat = dot(rel, R);
      const vert = dot(rel, U);
      const lon = dot(rel, F);

      if (Math.abs(lat) > W + 7.5) continue;
      if (Math.abs(lon) > seg.len * 0.75 + 3.0) continue;
      if (vert < -8.5 || vert > 45.0) continue;

      // Prefer segments vertically close to RIDE_HEIGHT and sequentially continuous
      const indexDelta = Math.abs(seg.index - this.lastSegIndex);
      const continuityPenalty = indexDelta > 26 ? 4.0 : indexDelta * 0.025;
      const vertDist = Math.abs(vert - RIDE_HEIGHT);
      const latPenalty = Math.max(0, Math.abs(lat) - W) * 2.0;

      const score = vertDist + continuityPenalty + latPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestHit = {
          seg,
          t,
          P,
          U,
          R,
          F,
          W,
          lat,
          vert,
          dist: lerp(seg.s0.dist, seg.s1.dist, t)
        };
      }
    }

    return bestHit;
  }

  /**
   * Advances physics by a fixed dt (e.g. 1/120 s).
   */
  step(dt, input) {
    if (!this.track) return;

    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    this.prevPos.z = this.pos.z;

    if (!this.controlsLocked && !this.finished) {
      this.raceElapsedMs += dt * 1000;
    }

    if (this.wallHitCooldown > 0) {
      this.wallHitCooldown = Math.max(0, this.wallHitCooldown - dt);
    }

    const throttle = this.controlsLocked ? 0 : (input.forward ? 1 : 0);
    const brake = this.controlsLocked ? 0 : (input.backward || input.brake ? 1 : 0);
    const rawSteer = this.controlsLocked ? 0 : (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const airBrake = !this.controlsLocked && Boolean(input.brake || input.space);

    // Smooth steering wheel response
    const steerTarget = rawSteer;
    const steerSmoothRate = rawSteer !== 0 ? 11.5 : 15.0;
    this.steerAngle = lerp(this.steerAngle, steerTarget, clamp(steerSmoothRate * dt, 0, 1));

    // Boost timer
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (this.boostTimer === 0) {
        this.boostLevel = 0;
      }
    }

    // Never lock out engine throttle
    this.engineOff = false;
    this.engineOffTimer = 0;

    // Suspension spring-damper animation
    const suspForce = -140 * this.suspensionOffset - 18 * this.suspensionVel;
    this.suspensionVel += suspForce * dt;
    this.suspensionOffset += this.suspensionVel * dt;

    // 1. Check current surface / ground contact before integration
    const hit = this.findBestSegment(this.pos);

    if (this.grounded && hit) {
      this.lastSegIndex = hit.seg.index;
      this.trackProgressDist = hit.dist;
      const prevSurface = this.surface;
      this.surface = hit.seg.surface === 'no_engine' ? 'asphalt' : hit.seg.surface;

      // Trigger surface boost effects with generous durations so speed carries smoothly
      if (this.surface === 'boost') {
        if (this.boostLevel < 1 || this.boostTimer < 2.0) {
          if (prevSurface !== 'boost') {
            this.events.push({ type: 'boost', level: 1 });
          }
          this.boostLevel = Math.max(this.boostLevel, 1);
          this.boostTimer = Math.max(this.boostTimer, 2.5);
        }
      } else if (this.surface === 'super_boost') {
        if (prevSurface !== 'super_boost') {
          this.events.push({ type: 'boost', level: 2 });
        }
        this.boostLevel = 2;
        this.boostTimer = 3.1;
      }

      // Use persistent surface-relative velocities (vF, vR) so pitch/slope changes never bleed speed!
      let vF = this.forwardSpeedMs;
      let vR = this.lateralSpeedMs;

      // Determine Steering & Drift
      const speedAbs = Math.abs(vF);
      const speedFactor = clamp(1.0 - (speedAbs / 140) * 0.34, 0.62, 1.0);
      let baseTurnRate = 2.72 * speedFactor;

      // Trackmania Drift logic: initiate drift when tapping brake while steering at speed
      if (this.surface === 'ice') {
        this.drifting = speedAbs > 12 && Math.abs(this.steerAngle) > 0.1;
      } else if (!this.drifting) {
        if (
          speedAbs > 24 &&
          Math.abs(rawSteer) > 0.25 &&
          (brake > 0 || airBrake || Math.abs(vR) > 7.0)
        ) {
          this.drifting = true;
          this.events.push({ type: 'drift_start' });
        }
      } else {
        if (speedAbs < 16 || (Math.abs(rawSteer) < 0.08 && Math.abs(vR) < 2.2)) {
          this.drifting = false;
        }
      }

      if (this.drifting) {
        baseTurnRate *= 1.32;
      }

      // Apply yaw steering (invert when reversing)
      const dirSign = vF >= -0.5 ? 1 : -1;
      const moveFactor = clamp(speedAbs / 3.5, 0, 1);
      const dYaw = this.steerAngle * baseTurnRate * dirSign * moveFactor * dt;
      this.yaw = wrapAngle(this.yaw + dYaw);

      // Recompute carF and carR on the road surface tangent plane
      const U = hit.U;
      const newHoriz = { x: -Math.sin(this.yaw), y: 0, z: -Math.cos(this.yaw) };
      const newDotHU = dot(newHoriz, U);
      const carF = normalize({
        x: newHoriz.x - U.x * newDotHU,
        y: newHoriz.y - U.y * newDotHU,
        z: newHoriz.z - U.z * newDotHU
      });
      const carR = normalize(cross(carF, U));

      // Smoothly transfer lateral slip during steering without losing forward momentum
      if (this.surface === 'ice') {
        vR += -Math.sin(dYaw) * vF * 0.55;
      } else if (this.drifting) {
        vR += -Math.sin(dYaw) * vF * 0.35;
      } else {
        vR += -Math.sin(dYaw) * vF * 0.12;
      }

      // Visual slip angle for chassis rendering
      const targetDriftAngle =
        this.surface === 'ice'
          ? clamp(-vR * 0.026 + this.steerAngle * 0.28, -0.46, 0.46)
          : this.drifting
            ? clamp(-vR * 0.02 + this.steerAngle * 0.25, -0.34, 0.34)
            : this.steerAngle * 0.045;
      this.driftAngle = lerp(this.driftAngle, targetDriftAngle, clamp(10 * dt, 0, 1));

      // Longitudinal acceleration, braking & surface speeds (high-speed, smooth & responsive!)
      const normalTopSpeed = this.surface === 'dirt' ? 81 : 86; // ~292 km/h dirt, ~310 km/h asphalt
      const maxSpeed =
        this.boostLevel === 2 ? 126 : this.boostLevel === 1 ? 108 : normalTopSpeed;

      let accel = 0;
      if (throttle > 0 && vF < normalTopSpeed) {
        const ratio = clamp(vF / normalTopSpeed, 0, 1.0);
        const surfaceAccelMult =
          this.surface === 'dirt' ? 0.92 : this.surface === 'ice' ? 0.82 : 1.0;
        accel += 45.0 * (1.0 - ratio * 0.72) * surfaceAccelMult;
      }

      if (brake > 0) {
        if (vF > 1.5) {
          const brakePower = this.drifting ? 12.0 : 34.0;
          accel -= brakePower;
        } else {
          accel -= 22.0;
        }
      }

      // Boost pad propulsion up to boost cap (389 km/h Turbo, 454 km/h Reactor Super Boost!)
      if (this.boostLevel === 2 && vF < 126) {
        accel += 64.0;
      } else if (this.boostLevel === 1 && vF < 108) {
        accel += 46.0;
      }

      // Gentle slope gravity assistance (capped on uphills when throttle is held so climbs never bog down!)
      let slopeGravityF = -GRAVITY * carF.y;
      if (slopeGravityF < 0 && throttle > 0) {
        slopeGravityF *= 0.28; // Engine torque easily overcomes uphill grade!
      }
      const slopeGravityR = -GRAVITY * carR.y * 0.35;
      accel += slopeGravityF;

      vF += accel * dt;

      // Smooth, gradual aerodynamic drag (zero sudden braking after boost ends!)
      const overSpeedDrag = vF > maxSpeed ? (vF - maxSpeed) * 0.24 : 0;
      const dragCoeff = this.boostTimer > 0 ? 0.0008 : 0.0014;
      const rollingDrag = throttle === 0 ? 2.8 : 0.2;
      const driftScrub = this.drifting ? Math.abs(this.driftAngle) * 1.8 : 0;
      if (vF > 0) {
        vF = Math.max(
          0,
          vF - (vF * vF * dragCoeff + rollingDrag + driftScrub + overSpeedDrag) * dt
        );
      } else if (vF < 0) {
        vF = Math.min(0, Math.max(-30, vF + rollingDrag * dt));
      }

      // Lateral traction
      vR += slopeGravityR * dt;
      const lateralGrip =
        this.surface === 'ice'
          ? 3.2
          : this.surface === 'dirt'
            ? 10.5
            : this.drifting
              ? 8.0
              : 22.0;
      vR *= Math.exp(-lateralGrip * dt);

      this.forwardSpeedMs = vF;
      this.lateralSpeedMs = vR;

      // Pure surface-tangent velocity (no fake normal downforce vector leaking into next step!)
      this.vel.x = carF.x * vF + carR.x * vR;
      this.vel.y = carF.y * vF + carR.y * vR;
      this.vel.z = carF.z * vF + carR.z * vR;

      this.forward = carF;
      this.right = carR;
      this.up = normalize(lerpVec(this.up, U, clamp(18 * dt, 0, 1)));
      this.pitch = Math.asin(clamp(carF.y, -0.98, 0.98));
      this.roll = lerp(hit.seg.s0.bank, hit.seg.s1.bank, hit.t);
    } else {
      // Airborne Physics (during canyon gap jumps)
      this.grounded = false;
      this.surface = 'air';
      this.drifting = false;
      this.airTime += dt;
      this.driftAngle = lerp(this.driftAngle, 0, clamp(5 * dt, 0, 1));

      // Apply gravity
      this.vel.y -= GRAVITY * dt;

      // Minimal air drag so jump distance is consistent and fast
      this.vel.x *= 1 - 0.015 * dt;
      this.vel.z *= 1 - 0.015 * dt;

      // Mid-air control & Trackmania Air-Brake stabilization
      if (airBrake) {
        this.pitch = lerp(this.pitch, 0, clamp(7.0 * dt, 0, 1));
        this.roll = lerp(this.roll, 0, clamp(8.5 * dt, 0, 1));
      } else {
        this.yaw = wrapAngle(this.yaw + this.steerAngle * 0.65 * dt);
        const pitchInput = (input.forward ? -0.35 : 0) + (input.backward ? 0.45 : 0);
        this.pitch = clamp(this.pitch + pitchInput * dt, -0.55, 0.55);
        this.roll = lerp(this.roll, -this.steerAngle * 0.12, clamp(3.5 * dt, 0, 1));
      }

      const cosP = Math.cos(this.pitch);
      this.forward = normalize({
        x: -Math.sin(this.yaw) * cosP,
        y: Math.sin(this.pitch),
        z: -Math.cos(this.yaw) * cosP
      });
      const worldUp = { x: 0, y: 1, z: 0 };
      this.right = normalize(cross(this.forward, worldUp));
      this.up = normalize(cross(this.right, this.forward));
    }

    // 2. Integrate Position
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // 3. Post-integration Surface, Wall & Center-Island Collision Resolution
    const nextHit = this.findBestSegment(this.pos);
    if (nextHit) {
      this.lastSegIndex = nextHit.seg.index;
      this.trackProgressDist = nextHit.dist;
      const { P, U, R, F, W, seg, vert, lat } = nextHit;

      // Side Wall & Center Split Island Physics (Tangible crash slowdown & realistic wall-scrape drag!)
      if (vert >= -6.0 && vert <= 16.0) {
        const isBankedIce =
          (this.surface === 'ice' || seg.surface === 'ice') &&
          (Math.abs(seg.s0.bank) > 0.15 || Math.abs(seg.s1.bank) > 0.15);
        const wallScrapeFriction = isBankedIce ? 0.35 : 1.6;
        const maxLat = W - CAR_HALF_WIDTH;
        if (seg.hasRightWall && lat > maxLat) {
          const penetration = lat - maxLat;
          this.pos.x -= R.x * penetration;
          this.pos.y -= R.y * penetration;
          this.pos.z -= R.z * penetration;

          // Continuous wall-scraping friction drag while brushing/grinding against barrier
          this.forwardSpeedMs *= Math.max(0.4, 1.0 - wallScrapeFriction * dt);

          const vWall = dot(this.vel, R);
          if (vWall > 0) {
            this.vel.x -= R.x * vWall * 1.08;
            this.vel.y -= R.y * vWall * 1.08;
            this.vel.z -= R.z * vWall * 1.08;
            this.lateralSpeedMs = Math.min(0, this.lateralSpeedMs);

            // Gently guide car yaw parallel to the wall so it deflects cleanly without spinning 180
            const segYaw = lerp(seg.s0.yaw, seg.s1.yaw, nextHit.t);
            const yawDiff = wrapAngle(segYaw - this.yaw);
            const steerGuidance = isBankedIce ? 8.5 : 5.5;
            this.yaw = wrapAngle(this.yaw + yawDiff * clamp(steerGuidance * dt, 0, 0.45));

            // Instant crash speed reduction proportional to impact velocity
            const minImpactSpd = isBankedIce ? 5.5 : 3.0;
            if (vWall > minImpactSpd && this.wallHitCooldown <= 0) {
              this.wallHitCooldown = 0.20;
              const crashPenalty = isBankedIce
                ? clamp(0.04 + ((vWall - minImpactSpd) / 36) * 0.12, 0.04, 0.16)
                : clamp(0.08 + ((vWall - 3.0) / 28) * 0.20, 0.08, 0.28);
              this.forwardSpeedMs *= (1.0 - crashPenalty);

              if (this.grounded && this.forward) {
                const curSpd = Math.hypot(this.vel.x, this.vel.z);
                if (curSpd > 0.01) {
                  const scale = Math.max(0, this.forwardSpeedMs / curSpd);
                  this.vel.x *= scale;
                  this.vel.z *= scale;
                }
              } else {
                this.vel.x *= (1.0 - crashPenalty);
                this.vel.z *= (1.0 - crashPenalty);
              }

              this.events.push({
                type: 'wall_hit',
                intensity: clamp(vWall / 26, 0.2, 1.0),
                side: 1
              });
            }
          }
        } else if (seg.hasLeftWall && lat < -maxLat) {
          const penetration = -maxLat - lat;
          this.pos.x += R.x * penetration;
          this.pos.y += R.y * penetration;
          this.pos.z += R.z * penetration;

          // Continuous wall-scraping friction drag
          this.forwardSpeedMs *= Math.max(0.4, 1.0 - wallScrapeFriction * dt);

          const vWall = dot(this.vel, R);
          if (vWall < 0) {
            this.vel.x -= R.x * vWall * 1.08;
            this.vel.y -= R.y * vWall * 1.08;
            this.vel.z -= R.z * vWall * 1.08;
            this.lateralSpeedMs = Math.max(0, this.lateralSpeedMs);

            const segYaw = lerp(seg.s0.yaw, seg.s1.yaw, nextHit.t);
            const yawDiff = wrapAngle(segYaw - this.yaw);
            const steerGuidance = isBankedIce ? 8.5 : 5.5;
            this.yaw = wrapAngle(this.yaw + yawDiff * clamp(steerGuidance * dt, 0, 0.45));

            const minImpactSpd = isBankedIce ? 5.5 : 3.0;
            if (Math.abs(vWall) > minImpactSpd && this.wallHitCooldown <= 0) {
              this.wallHitCooldown = 0.20;
              const crashPenalty = isBankedIce
                ? clamp(0.04 + ((Math.abs(vWall) - minImpactSpd) / 36) * 0.12, 0.04, 0.16)
                : clamp(0.08 + ((Math.abs(vWall) - 3.0) / 28) * 0.20, 0.08, 0.28);
              this.forwardSpeedMs *= (1.0 - crashPenalty);

              if (this.grounded && this.forward) {
                const curSpd = Math.hypot(this.vel.x, this.vel.z);
                if (curSpd > 0.01) {
                  const scale = Math.max(0, this.forwardSpeedMs / curSpd);
                  this.vel.x *= scale;
                  this.vel.z *= scale;
                }
              } else {
                this.vel.x *= (1.0 - crashPenalty);
                this.vel.z *= (1.0 - crashPenalty);
              }

              this.events.push({
                type: 'wall_hit',
                intensity: clamp(Math.abs(vWall) / 26, 0.2, 1.0),
                side: -1
              });
            }
          }
        }

        // Center Divider Island Smooth Deflection & Penalty (`deco === 'split_island'`)
        if (seg.deco === 'split_island') {
          const islandHalfW = 0.85 + CAR_HALF_WIDTH;
          if (Math.abs(lat) < islandHalfW) {
            const pushSign = lat >= 0 ? 1 : -1;
            const pen = islandHalfW - Math.abs(lat);
            this.pos.x += R.x * pushSign * pen;
            this.pos.y += R.y * pushSign * pen;
            this.pos.z += R.z * pushSign * pen;

            // Continuous scraping drag against center divider
            this.forwardSpeedMs *= Math.max(0.4, 1.0 - 2.0 * dt);

            const vLat = dot(this.vel, R);
            if (vLat * pushSign < 0) {
              this.vel.x -= R.x * vLat * 1.1;
              this.vel.y -= R.y * vLat * 1.1;
              this.vel.z -= R.z * vLat * 1.1;
              this.lateralSpeedMs = pushSign * 2.0;

              if (Math.abs(vLat) > 2.5 && this.wallHitCooldown <= 0) {
                this.wallHitCooldown = 0.20;
                const islandCrashPenalty = clamp(0.10 + ((Math.abs(vLat) - 2.5) / 24) * 0.18, 0.10, 0.28);
                this.forwardSpeedMs *= (1.0 - islandCrashPenalty);

                if (this.grounded && this.forward) {
                  const curSpd = Math.hypot(this.vel.x, this.vel.z);
                  if (curSpd > 0.01) {
                    const scale = Math.max(0, this.forwardSpeedMs / curSpd);
                    this.vel.x *= scale;
                    this.vel.z *= scale;
                  }
                } else {
                  this.vel.x *= (1.0 - islandCrashPenalty);
                  this.vel.z *= (1.0 - islandCrashPenalty);
                }

                this.events.push({
                  type: 'wall_hit',
                  intensity: clamp(Math.abs(vLat) / 20, 0.3, 0.95),
                  side: pushSign
                });
              }
            }
          }
        }
      }

      // Ground Contact & Ramp Launch Evaluation
      const relAfterWall = {
        x: this.pos.x - P.x,
        y: this.pos.y - P.y,
        z: this.pos.z - P.z
      };
      const newVert = dot(relAfterWall, U);
      const newLat = dot(relAfterWall, R);
      const vNormal = dot(this.vel, U);

      // Keep car glued on walled road blocks over crests; launch cleanly on jump takeoff ramps
      const isJumpRamp = !seg.hasLeftWall && !seg.hasRightWall;
      const isBankedOrIce =
        this.surface === 'ice' ||
        seg.surface === 'ice' ||
        Math.abs(seg.s0.bank) > 0.16 ||
        Math.abs(seg.s1.bank) > 0.16;

      const maxStickGap = this.grounded
        ? (isJumpRamp ? 0.35 : isBankedOrIce ? 3.6 : 1.85)
        : (isJumpRamp ? 0.28 : isBankedOrIce ? 2.8 : 0.45);
      const maxStickNormalVel = isJumpRamp ? 4.5 : isBankedOrIce ? 38.0 : 26.0;

      if (newVert <= RIDE_HEIGHT + maxStickGap && vNormal <= maxStickNormalVel) {
        const diff = RIDE_HEIGHT - newVert;
        this.pos.x += U.x * diff;
        this.pos.y += U.y * diff;
        this.pos.z += U.z * diff;

        if (!this.grounded) {
          // Smooth landing: preserve horizontal flight momentum into forward road speed!
          const horizFlightSpeed = Math.hypot(this.vel.x, this.vel.z);
          const projF = dot(this.vel, F);
          this.forwardSpeedMs = Math.max(this.forwardSpeedMs * 0.96, projF, horizFlightSpeed * 0.94);
          this.lateralSpeedMs = dot(this.vel, R) * 0.45;

          if (this.airTime > 0.16) {
            const impact = clamp(Math.abs(vNormal) / 24, 0.15, 0.85);
            this.suspensionVel -= impact * 3.6;
            this.events.push({ type: 'landed', intensity: impact });
          }
        }

        if (vNormal < 0) {
          this.vel.x -= U.x * vNormal;
          this.vel.y -= U.y * vNormal;
          this.vel.z -= U.z * vNormal;
        }

        this.grounded = true;
        this.airTime = 0;
      } else if (!isJumpRamp && isBankedOrIce && Math.abs(newLat) <= W + 2.5) {
        // Magnetic retention on banked ice / bobsled curves - NEVER fall through or un-ground!
        const diff = RIDE_HEIGHT - newVert;
        this.pos.x += U.x * diff;
        this.pos.y += U.y * diff;
        this.pos.z += U.z * diff;

        if (vNormal < 0) {
          this.vel.x -= U.x * vNormal;
          this.vel.y -= U.y * vNormal;
          this.vel.z -= U.z * vNormal;
        }

        this.grounded = true;
        this.airTime = 0;
      } else {
        this.grounded = false;
      }
    } else {
      this.grounded = false;
    }

    // 4. Out-of-bounds safety detection
    if (this.pos.y < this.track.outOfBoundsY) {
      this.respawnAtCheckpoint();
      return;
    }

    // 5. Update Speedometer, Wheel Spin & Simulated 5-Speed Gearbox
    this.speedMs = this.grounded
      ? Math.hypot(this.forwardSpeedMs, this.lateralSpeedMs)
      : Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    this.speedKmh = Math.round(this.speedMs * 3.6);
    this.wheelRotation += this.forwardSpeedMs * dt * 2.4;

    const gearThresholds = [0, 62, 122, 185, 248, 355];
    let g = 1;
    for (let i = 1; i < gearThresholds.length; i++) {
      if (this.speedKmh >= gearThresholds[i]) g = i + 1;
    }
    this.gear = clamp(g, 1, 5);
    const lowG = gearThresholds[this.gear - 1] || 0;
    const highG = gearThresholds[this.gear] || 340;
    this.rpm = clamp(0.24 + ((this.speedKmh - lowG) / (highG - lowG)) * 0.76, 0.22, 1.0);

    // 6. Check Checkpoints & Finish Gate with sub-frame millisecond precision
    this.checkGates(dt);
  }

  checkGates(dt) {
    if (this.finished || !this.track) return;

    // Check all checkpoints
    for (let i = 0; i < this.track.checkpoints.length; i++) {
      const cp = this.track.checkpoints[i];
      if (this.passedCheckpoints.has(cp.index)) continue;

      const crossingAlpha = this.testGateCrossing(cp);
      if (crossingAlpha !== null) {
        this.passedCheckpoints.add(cp.index);
        this.lastCheckpointIndex = cp.index;

        const exactTimeMs = Math.round(this.raceElapsedMs - (1 - crossingAlpha) * dt * 1000);
        this.checkpointSplits[cp.index - 1] = exactTimeMs;

        this.events.push({
          type: 'checkpoint',
          cpIndex: cp.index,
          totalCps: this.track.checkpoints.length,
          timeMs: exactTimeMs,
          speedKmh: this.speedKmh
        });
      }
    }

    // Check Finish Gate (requires all checkpoints passed!)
    if (this.passedCheckpoints.size >= this.track.checkpoints.length) {
      const fg = this.track.finishGate;
      const crossingAlpha = this.testGateCrossing(fg);
      if (crossingAlpha !== null) {
        this.finished = true;
        const exactFinishMs = Math.max(
          1000,
          Math.round(this.raceElapsedMs - (1 - crossingAlpha) * dt * 1000)
        );
        this.finishTimeMs = exactFinishMs;

        this.events.push({
          type: 'finish',
          timeMs: exactFinishMs,
          splits: this.checkpointSplits.slice(),
          speedKmh: this.speedKmh
        });
      }
    }
  }

  /**
   * Tests whether the segment [prevPos -> pos] crossed a gate slice plane within gate bounds.
   * Returns interpolation fraction alpha in [0, 1] or null.
   */
  testGateCrossing(gateSlice) {
    const rel0 = {
      x: this.prevPos.x - gateSlice.p.x,
      y: this.prevPos.y - gateSlice.p.y,
      z: this.prevPos.z - gateSlice.p.z
    };
    const rel1 = {
      x: this.pos.x - gateSlice.p.x,
      y: this.pos.y - gateSlice.p.y,
      z: this.pos.z - gateSlice.p.z
    };

    const d0 = dot(rel0, gateSlice.f);
    const d1 = dot(rel1, gateSlice.f);

    if (d0 < 0 && d1 >= 0) {
      const lat = Math.abs(dot(rel1, gateSlice.r));
      const vert = dot(rel1, gateSlice.u);
      if (lat <= gateSlice.halfWidth + 3.5 && vert >= -2.5 && vert <= 12.0) {
        const denom = d1 - d0;
        return denom > 1e-5 ? clamp(-d0 / denom, 0, 1) : 1.0;
      }
    }
    return null;
  }

  /**
   * Returns interpolated render state between prevPos and pos for butter-smooth high-refresh rendering.
   */
  getInterpolatedState(alpha = 1.0) {
    return {
      x: lerp(this.prevPos.x, this.pos.x, alpha),
      y: lerp(this.prevPos.y, this.pos.y, alpha) + this.suspensionOffset,
      z: lerp(this.prevPos.z, this.pos.z, alpha),
      yaw: this.yaw,
      pitch: this.pitch,
      roll: this.roll,
      driftAngle: this.driftAngle,
      steerAngle: this.steerAngle,
      wheelRotation: this.wheelRotation,
      speedKmh: this.speedKmh,
      boostLevel: this.boostLevel,
      drifting: this.drifting,
      grounded: this.grounded,
      surface: this.surface,
      up: this.up,
      forward: this.forward,
      right: this.right
    };
  }
}
