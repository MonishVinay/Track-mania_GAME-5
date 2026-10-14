// Procedural 3D Spline-Ribbon Track Compiler & 5 Action-Packed (1-2 Min) Campaign Tracks

const DEG2RAD = Math.PI / 180;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
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

/**
 * Compiles a high-level block-based track definition into:
 * - slices: continuous 3D cross-sections with orthonormal frames (P, F, U, R)
 * - segments: solid driveable quads between consecutive slices (with deco & obstacle metadata)
 * - spatialGrid: fast 2D hash map for O(1) physics & collision queries
 * - checkpoints: ordered list of checkpoint gate transforms & respawn points
 * - arches: start, checkpoint, finish, plus special 3D track structures (turbines, grandstands)
 */
export function compileTrack(trackDef) {
  const ds = 3.0;
  const slices = [];
  const segments = [];
  const checkpoints = [];
  const arches = [];

  let pos = { x: 0, y: 10.0, z: 0 };
  let yaw = 0; // 0 = -Z
  let currPitchDeg = 0;
  let currBankDeg = 0;
  let currHalfWidth = 15.2;
  let totalDist = 0;

  function makeBasis(yawRad, pitchRad, bankRad) {
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);
    const sinY = Math.sin(yawRad);
    const cosY = Math.cos(yawRad);

    const F = normalize({
      x: -sinY * cosP,
      y: sinP,
      z: -cosY * cosP
    });

    const R0 = normalize({
      x: cosY,
      y: 0,
      z: -sinY
    });

    const U0 = normalize(cross(R0, F));

    const cosB = Math.cos(bankRad);
    const sinB = Math.sin(bankRad);

    const R = normalize({
      x: R0.x * cosB + U0.x * sinB,
      y: R0.y * cosB + U0.y * sinB,
      z: R0.z * cosB + U0.z * sinB
    });

    const U = normalize({
      x: -R0.x * sinB + U0.x * cosB,
      y: -R0.y * sinB + U0.y * cosB,
      z: -R0.z * sinB + U0.z * cosB
    });

    return { F, U, R };
  }

  const initBasis = makeBasis(0, 0, 0);
  slices.push({
    index: 0,
    p: { ...pos },
    f: initBasis.F,
    u: initBasis.U,
    r: initBasis.R,
    yaw,
    pitch: 0,
    bank: 0,
    halfWidth: currHalfWidth,
    surface: 'asphalt',
    walls: 'both',
    deco: null,
    turnSign: 0,
    isGap: false,
    dist: 0,
    blockIndex: 0
  });

  const blocks =
    Array.isArray(trackDef.blocks) && trackDef.blocks.length > 0
      ? trackDef.blocks
      : [{ length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', finish: true }];

  const isCampaign = String(trackDef.id || '').startsWith('track_');
  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const b = blocks[bIdx];
    const isGap = Boolean(b.isGap);
    const rawLen = clamp(Number(b.length) || 60, 10, 600);
    const turnDeg = clamp(Number(b.turn) || 0, -270, 270);
    const absTurn = Math.abs(turnDeg);

    // Adaptive campaign block scaling:
    // Straights stay long & fast for high top speeds (350+ km/h), while sharp turns remain tight
    // and technical to require genuine braking, drift-timing, and racing lines!
    let length = rawLen;
    if (isCampaign && !isGap) {
      if (absTurn === 0) {
        length = Math.round(rawLen * 1.28);
      } else if (absTurn <= 35) {
        length = Math.round(rawLen * 1.18);
      } else if (absTurn <= 75) {
        length = Math.round(rawLen * 1.08);
      } else {
        length = Math.round(rawLen * 1.00);
      }
    }

    let targetPitchDeg = clamp(Number(b.pitch) || 0, -40, 40);
    const targetBankDeg = clamp(Number(b.bank) || 0, -48, 48);
    const deco = b.deco || null;

    // Responsive track width tuning:
    // Slightly wider tracks across all maps for exciting side-by-side racing, overtaking, and drift room
    const isSharpTurn = absTurn >= 60;
    const isMediumTurn = absTurn >= 30;
    const defaultW = deco === 'split_island'
      ? 19.5
      : isSharpTurn
        ? 13.6
        : isMediumTurn
          ? 14.4
          : 15.2;
    const rawW = b.width ? Number(b.width) * 1.22 : defaultW;
    const minW = deco === 'split_island' ? 18.0 : 12.5;
    const targetHalfWidth = clamp(rawW, minW, 26);
    const surface = b.surface === 'no_engine' ? 'boost' : b.surface || 'asphalt';
    const walls = b.walls || (b.isGap ? 'none' : 'both');
    const turnSign = absTurn >= 65 ? (turnDeg > 0 ? 1 : -1) : 0;

    // Prevent downhill blocks from diving into the stadium base when banked
    if (!isGap) {
      const minSafeCenterY =
        6.5 + targetHalfWidth * Math.abs(Math.sin(targetBankDeg * DEG2RAD));
      const estEndY = pos.y + Math.sin(targetPitchDeg * DEG2RAD) * length;
      if (estEndY < minSafeCenterY && targetPitchDeg < 0) {
        const neededSin = clamp((minSafeCenterY - pos.y) / length, -0.45, 0.25);
        targetPitchDeg = Math.asin(neededSin) / DEG2RAD;
      }
    }

    const steps = Math.max(2, Math.round(length / ds));
    const stepLen = length / steps;
    const dYaw = (turnDeg * DEG2RAD) / steps;

    const startPitchDeg = currPitchDeg;
    const startBankDeg = currBankDeg;
    const startHalfWidth = currHalfWidth;

    const nextBlock = bIdx + 1 < blocks.length ? blocks[bIdx + 1] : null;
    const nextBankRaw = nextBlock ? clamp(Number(nextBlock.bank) || 0, -48, 48) : 0;
    const exitBankDeg =
      targetBankDeg !== 0 &&
      nextBankRaw !== 0 &&
      Math.sign(targetBankDeg) === Math.sign(nextBankRaw)
        ? 0.5 * (targetBankDeg + nextBankRaw)
        : 0;

    const cpSliceTarget = b.checkpoint ? Math.floor(steps * 0.7) : -1;
    const midSliceTarget = Math.floor(steps * 0.5);

    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * u);

      yaw += dYaw;
      currPitchDeg = lerp(startPitchDeg, targetPitchDeg, ease);
      if (u <= 0.25) {
        const tIn = 0.5 - 0.5 * Math.cos(Math.PI * (u / 0.25));
        currBankDeg = lerp(startBankDeg, targetBankDeg, tIn);
      } else if (u <= 0.75) {
        currBankDeg = targetBankDeg;
      } else {
        const tOut = 0.5 - 0.5 * Math.cos(Math.PI * ((u - 0.75) / 0.25));
        currBankDeg = lerp(targetBankDeg, exitBankDeg, tOut);
      }
      currHalfWidth = lerp(startHalfWidth, targetHalfWidth, ease);

      const pitchRad = currPitchDeg * DEG2RAD;
      const bankRad = currBankDeg * DEG2RAD;

      const basis = makeBasis(yaw, pitchRad, bankRad);

      pos = {
        x: pos.x + basis.F.x * stepLen,
        y: pos.y + basis.F.y * stepLen,
        z: pos.z + basis.F.z * stepLen
      };
      totalDist += stepLen;

      const sliceIndex = slices.length;
      const activeDeco =
        deco === 'split_island' && (u < 0.12 || u > 0.88) ? null : deco;

      const slice = {
        index: sliceIndex,
        p: { ...pos },
        f: basis.F,
        u: basis.U,
        r: basis.R,
        yaw,
        pitch: pitchRad,
        bank: bankRad,
        halfWidth: currHalfWidth,
        surface,
        walls,
        deco: activeDeco,
        turnSign,
        isGap,
        dist: totalDist,
        blockIndex: bIdx
      };
      slices.push(slice);

      const prev = slices[sliceIndex - 1];
      if (!isGap) {
        const dx = slice.p.x - prev.p.x;
        const dy = slice.p.y - prev.p.y;
        const dz = slice.p.z - prev.p.z;
        const segLenSq = dx * dx + dy * dy + dz * dz || 1;
        const maxW = Math.max(prev.halfWidth, slice.halfWidth) + 2.5;

        const seg = {
          index: segments.length,
          s0: prev,
          s1: slice,
          dir: { x: dx, y: dy, z: dz },
          lenSq: segLenSq,
          len: Math.sqrt(segLenSq),
          surface,
          deco: activeDeco,
          turnSign,
          hasLeftWall: walls === 'both' || walls === 'left',
          hasRightWall: walls === 'both' || walls === 'right',
          minX: Math.min(prev.p.x, slice.p.x) - maxW,
          maxX: Math.max(prev.p.x, slice.p.x) + maxW,
          minY: Math.min(prev.p.y, slice.p.y) - 8.0,
          maxY: Math.max(prev.p.y, slice.p.y) + 38.0,
          minZ: Math.min(prev.p.z, slice.p.z) - maxW,
          maxZ: Math.max(prev.p.z, slice.p.z) + maxW
        };
        segments.push(seg);
      }

      if (s === midSliceTarget && !isGap && (deco === 'turbine' || deco === 'grandstand')) {
        arches.push({ type: deco, cpIndex: 0, slice });
      }

      if (s === cpSliceTarget && !isGap) {
        const cpIndex = checkpoints.length + 1;
        const cpObj = {
          index: cpIndex,
          sliceIndex,
          p: { ...slice.p },
          f: { ...slice.f },
          u: { ...slice.u },
          r: { ...slice.r },
          yaw: slice.yaw,
          pitch: slice.pitch,
          bank: slice.bank,
          halfWidth: slice.halfWidth,
          dist: slice.dist
        };
        checkpoints.push(cpObj);
        arches.push({ type: 'checkpoint', cpIndex, slice: cpObj });
      }
    }
  }

  // Ensure the lowest banked edge + slab underside across the entire track sits >= 3.0m above the stadium base
  let minLowestSlabY = Infinity;
  for (let i = 0; i < slices.length; i++) {
    const sl = slices[i];
    const edgeLowY = sl.p.y - sl.halfWidth * Math.abs(Math.sin(sl.bank)) - 1.5;
    if (edgeLowY < minLowestSlabY) minLowestSlabY = edgeLowY;
  }
  if (minLowestSlabY < 3.0) {
    const liftY = 3.0 - minLowestSlabY;
    for (let i = 0; i < slices.length; i++) {
      slices[i].p.y += liftY;
    }
    for (let i = 0; i < segments.length; i++) {
      segments[i].minY += liftY;
      segments[i].maxY += liftY;
    }
    for (let i = 0; i < checkpoints.length; i++) {
      checkpoints[i].p.y += liftY;
    }
  }

  const spawnSlice = slices[Math.min(2, slices.length - 1)];
  const startGateSlice = slices[Math.min(5, slices.length - 1)];
  const finishSlice = slices[Math.max(0, slices.length - 4)];

  arches.unshift({ type: 'start', cpIndex: 0, slice: startGateSlice });
  arches.push({ type: 'finish', cpIndex: checkpoints.length + 1, slice: finishSlice });

  const cellSize = 20;
  const spatialGrid = new Map();

  let minTrackY = 0;
  let minTrackX = Infinity, maxTrackX = -Infinity;
  let minTrackZ = Infinity, maxTrackZ = -Infinity;

  for (let i = 0; i < slices.length; i++) {
    const p = slices[i].p;
    if (p.y < minTrackY) minTrackY = p.y;
    if (p.x < minTrackX) minTrackX = p.x;
    if (p.x > maxTrackX) maxTrackX = p.x;
    if (p.z < minTrackZ) minTrackZ = p.z;
    if (p.z > maxTrackZ) maxTrackZ = p.z;
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const gx0 = Math.floor(seg.minX / cellSize);
    const gx1 = Math.floor(seg.maxX / cellSize);
    const gz0 = Math.floor(seg.minZ / cellSize);
    const gz1 = Math.floor(seg.maxZ / cellSize);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = `${gx},${gz}`;
        let bucket = spatialGrid.get(key);
        if (!bucket) {
          bucket = [];
          spatialGrid.set(key, bucket);
        }
        bucket.push(seg);
      }
    }
  }

  return {
    id: trackDef.id || 'custom',
    name: trackDef.name || 'Custom Stadium Track',
    subtitle: trackDef.subtitle || 'Custom Trackmania Circuit',
    difficulty: trackDef.difficulty || 'Custom',
    theme: trackDef.theme || 'stadium_day',
    medals: trackDef.medals || {
      author: Math.round((totalDist / 78) * 1000),
      gold: Math.round((totalDist / 71) * 1000),
      silver: Math.round((totalDist / 62) * 1000),
      bronze: Math.round((totalDist / 50) * 1000)
    },
    totalLength: Math.round(totalDist),
    boundsCenter: {
      x: (minTrackX + maxTrackX) * 0.5,
      z: (minTrackZ + maxTrackZ) * 0.5
    },
    boundsBox: { minX: minTrackX, maxX: maxTrackX, minZ: minTrackZ, maxZ: maxTrackZ },
    slices,
    segments,
    checkpoints,
    arches,
    spatialGrid,
    cellSize,
    startTransform: {
      p: {
        x: spawnSlice.p.x + spawnSlice.u.x * 0.55,
        y: spawnSlice.p.y + spawnSlice.u.y * 0.55,
        z: spawnSlice.p.z + spawnSlice.u.z * 0.55
      },
      yaw: spawnSlice.yaw,
      pitch: spawnSlice.pitch,
      bank: spawnSlice.bank,
      f: { ...spawnSlice.f },
      u: { ...spawnSlice.u },
      r: { ...spawnSlice.r }
    },
    finishGate: finishSlice,
    outOfBoundsY: minTrackY - 30
  };
}

/**
 * 5 Action-Packed Default Tracks (~1 to 2 Minutes per Lap)
 * Packed with frequent turns, S-chicanes, hairpins, 14-18 boosters, neon tunnels,
 * split-lane center islands, spinning turbines, laser gates & stadium grandstands!
 */
export const CAMPAIGN_TRACKS = [
  {
    id: 'track_01',
    name: '01 - Turbo Stadium GP',
    subtitle: 'High-speed stadium action: neon tunnels, split-lane islands, 15 boosters & banked hairpins (~1m 15s)',
    difficulty: 'Beginner',
    theme: 'stadium_day',
    medals: {
      author: 69000,
      gold: 75000,
      silver: 84000,
      bronze: 98000
    },
    blocks: [
      // Sector 1: Grandstand Turbo Launch & Snappy S-Chicane
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 95, turn: 75, pitch: 6, bank: 18, surface: 'asphalt' },
      { length: 95, turn: -110, pitch: -4, bank: -22, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 90, turn: 65, pitch: 0, bank: 16, surface: 'asphalt', checkpoint: true },

      // Sector 2: Split-Island Highway & Banked Carousel
      { length: 115, turn: 0, pitch: 4, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 120, turn: -125, pitch: 8, bank: -26, surface: 'asphalt', width: 14.5 },
      { length: 85, turn: 95, pitch: 0, bank: 20, surface: 'asphalt', width: 14 },
      { length: 70, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 3: Reactor Jump & Neon Cyber Tunnel
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 8, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 95, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 17.5 },
      { length: 135, turn: -90, pitch: -6, bank: -20, surface: 'asphalt', deco: 'tunnel' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 115, turn: 90, pitch: 0, bank: 20, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 4: Rapid Dirt Switchbacks & Boost Exit
      { length: 95, turn: -80, pitch: -4, bank: -14, surface: 'dirt', width: 15.5 },
      { length: 95, turn: 110, pitch: 0, bank: 16, surface: 'dirt', width: 15.5 },
      { length: 95, turn: -80, pitch: 4, bank: -14, surface: 'dirt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 75, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 5: Rollercoaster Climb & Corkscrew Plunge
      { length: 50, turn: 0, pitch: 10, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 110, turn: 85, pitch: 16, bank: 22, surface: 'asphalt' },
      { length: 110, turn: -115, pitch: -14, bank: -24, surface: 'asphalt' },
      { length: 50, turn: 0, pitch: -8, bank: 0, surface: 'super_boost' },
      { length: 110, turn: 85, pitch: 0, bank: 20, surface: 'asphalt', checkpoint: true },

      // Sector 6: Twin Split-Island Slalom & Hairpin
      { length: 110, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18 },
      { length: 145, turn: -145, pitch: 4, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 130, turn: 115, pitch: -4, bank: 22, surface: 'asphalt', width: 15 },
      { length: 75, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 7: Second Sky Leap & Laser Tunnel
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 8, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 95, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 17.5 },
      { length: 110, turn: -75, pitch: 0, bank: -18, surface: 'asphalt', deco: 'laser_rings' },
      { length: 110, turn: 75, pitch: 0, bank: 18, surface: 'asphalt', checkpoint: true },

      // Sector 8: High-Speed Rhythm S-Bends
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 90, turn: -70, pitch: -5, bank: -18, surface: 'asphalt' },
      { length: 90, turn: 90, pitch: 0, bank: 20, surface: 'asphalt' },
      { length: 90, turn: -70, pitch: 5, bank: -18, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 9: Banked Tunnel Bowl & Rollercoaster Climb
      { length: 135, turn: 110, pitch: -6, bank: 26, surface: 'asphalt', deco: 'tunnel' },
      { length: 135, turn: -110, pitch: 8, bank: -26, surface: 'asphalt', checkpoint: true },

      // Sector 10: High-Speed Laser-Ring S-Chicane
      { length: 55, turn: 0, pitch: 6, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 105, turn: -85, pitch: 8, bank: -22, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 105, turn: 105, pitch: -6, bank: 24, surface: 'asphalt' },
      { length: 105, turn: -85, pitch: 0, bank: -22, surface: 'asphalt', checkpoint: true },

      // Sector 11: Third Stadium Sky-Jump & Split Highway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 12: Neon Tunnel Drift Hairpin & Turbine Slalom
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 145, turn: 145, pitch: 6, bank: 26, surface: 'asphalt', deco: 'tunnel' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 145, turn: -145, pitch: -6, bank: -26, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 13: Dirt & Asphalt Crossover Switchbacks
      { length: 100, turn: -85, pitch: 0, bank: -18, surface: 'dirt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 100, turn: 85, pitch: 0, bank: 18, surface: 'dirt', width: 16.5 },
      { length: 120, turn: -110, pitch: 4, bank: -24, surface: 'asphalt' },
      { length: 120, turn: 110, pitch: 0, bank: 24, surface: 'asphalt', checkpoint: true },

      // Sector 14: Grandstand Reactor Finale
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'grandstand', width: 16 },
      { length: 60, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings', width: 16 },
      { length: 140, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16 }
    ]
  },
  {
    id: 'track_02',
    name: '02 - Neon Drift Touge',
    subtitle: 'Relentless canyon drift corners, cyber tunnels, split islands & 25 turbo boosts (~1m 15s)',
    difficulty: 'Intermediate',
    theme: 'cyber_sunset',
    medals: {
      author: 68000,
      gold: 74500,
      silver: 84000,
      bronze: 98000
    },
    blocks: [
      // Sector 1: Cyber Launch & Immediate S-Drift
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 105, turn: -95, pitch: 6, bank: -18, surface: 'asphalt', width: 15 },
      { length: 105, turn: 120, pitch: -4, bank: 20, surface: 'asphalt', width: 15 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 85, turn: -65, pitch: 0, bank: -14, surface: 'asphalt', checkpoint: true },

      // Sector 2: Twin Hairpin Touge Switchbacks
      { length: 145, turn: 155, pitch: 6, bank: 20, surface: 'asphalt', width: 16 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 145, turn: -155, pitch: -6, bank: -20, surface: 'asphalt', width: 16 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 3: Neon Cyber Tunnel & Split Highway
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 120, turn: 85, pitch: 8, bank: 22, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: -85, pitch: 0, bank: -22, surface: 'asphalt', deco: 'tunnel' },
      { length: 115, turn: 0, pitch: -4, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 4: Rapid-Fire Canyon S-Curves
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 85, turn: -75, pitch: -6, bank: -18, surface: 'asphalt', width: 15 },
      { length: 85, turn: 95, pitch: 0, bank: 18, surface: 'asphalt', width: 15 },
      { length: 85, turn: -95, pitch: 6, bank: -18, surface: 'asphalt', width: 15 },
      { length: 85, turn: 75, pitch: 0, bank: 18, surface: 'asphalt', width: 15, checkpoint: true },

      // Sector 5: Dirt Rally Hairpin & Reactor Jump
      { length: 120, turn: -115, pitch: -4, bank: -14, surface: 'dirt', width: 16 },
      { length: 120, turn: 115, pitch: 4, bank: 14, surface: 'dirt', width: 16 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 6: Downhill Touge Corkscrew
      { length: 130, turn: 125, pitch: -10, bank: 24, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: -4, bank: 0, surface: 'boost' },
      { length: 130, turn: -125, pitch: 0, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 7: Laser-Ring Turbo Coaster & Split Island
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 105, turn: -65, pitch: 6, bank: -18, surface: 'boost', deco: 'laser_rings', width: 15.5 },
      { length: 105, turn: 65, pitch: 0, bank: 18, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 8: High-Speed Neon Tube Chicanes
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 110, turn: -115, pitch: 6, bank: -22, surface: 'asphalt', deco: 'tunnel' },
      { length: 110, turn: 135, pitch: 0, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 110, turn: -115, pitch: -4, bank: -22, surface: 'asphalt', checkpoint: true },

      // Sector 9: Second Sunset Canyon Jump & Banked Bowl
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 130, turn: 145, pitch: 4, bank: 24, surface: 'asphalt', width: 16 },
      { length: 130, turn: -145, pitch: 0, bank: -24, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 10: Sunset Ridge Rollercoaster & Split Highway
      { length: 50, turn: 0, pitch: 8, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 115, turn: -95, pitch: 10, bank: -22, surface: 'asphalt' },
      { length: 115, turn: 95, pitch: -8, bank: 22, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 11: Cyber Tunnel Hairpin Complex
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'tunnel' },
      { length: 135, turn: 135, pitch: 4, bank: 26, surface: 'asphalt', deco: 'tunnel' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 135, turn: -135, pitch: -4, bank: -26, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 12: Final Touge Switchbacks & Dual-Boost Sprint
      { length: 115, turn: 95, pitch: 0, bank: 20, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: -95, pitch: 0, bank: -20, surface: 'asphalt', width: 15.5, checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16 },
      { length: 140, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16 }
    ]
  },
  {
    id: 'track_03',
    name: '03 - Skybridge Acrobatics',
    subtitle: 'High-altitude rollercoaster: 4 canyon jumps, spinning turbines, aero loops & 26 boosters (~1m 14s)',
    difficulty: 'Intermediate',
    theme: 'sky_acrobat',
    medals: {
      author: 66000,
      gold: 72000,
      silver: 81000,
      bronze: 95000
    },
    blocks: [
      // Sector 1: Rocket Sky Climb & Aero Curves
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 55, turn: 0, pitch: 10, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 120, turn: -85, pitch: 14, bank: -22, surface: 'asphalt' },
      { length: 120, turn: 110, pitch: 6, bank: 24, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 2: First Cloud Leap & Split Skybridge
      { length: 105, turn: -75, pitch: 4, bank: -18, surface: 'asphalt' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 3: Stratosphere Banked Spiral
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 135, turn: 125, pitch: 8, bank: 28, surface: 'asphalt', width: 15.5 },
      { length: 135, turn: -125, pitch: -8, bank: -28, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 4: Sky Tunnel & Laser Boost Dive
      { length: 115, turn: -90, pitch: 6, bank: -22, surface: 'asphalt', deco: 'tunnel' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'tunnel' },
      { length: 115, turn: 90, pitch: -8, bank: 20, surface: 'boost', deco: 'laser_rings' },
      { length: 95, turn: -60, pitch: 0, bank: -16, surface: 'asphalt', checkpoint: true },

      // Sector 5: Second Canyon Jump & Turbine Chicane
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 100, turn: 85, pitch: 0, bank: 20, surface: 'asphalt' },
      { length: 100, turn: -85, pitch: 0, bank: -20, surface: 'asphalt', checkpoint: true },

      // Sector 6: Cloud-Top Rapid S-Bends
      { length: 50, turn: 0, pitch: 6, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 90, turn: 80, pitch: 6, bank: 20, surface: 'asphalt' },
      { length: 90, turn: -100, pitch: -6, bank: -22, surface: 'asphalt' },
      { length: 90, turn: 80, pitch: 0, bank: 20, surface: 'asphalt' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 7: Third Acrobat Jump & Split Runway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 8: High-Speed Viaduct Hairpins
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 135, turn: -130, pitch: 4, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 135, turn: 130, pitch: 0, bank: 24, surface: 'asphalt', width: 15.5, checkpoint: true },

      // Sector 9: Aero Tunnel Corkscrew & Fourth Sky Leap
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'tunnel' },
      { length: 120, turn: 110, pitch: 6, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: -110, pitch: 0, bank: -24, surface: 'asphalt', deco: 'tunnel' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 10: Stratosphere Slalom & Split Bridge
      { length: 105, turn: -90, pitch: 4, bank: -22, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 105, turn: 90, pitch: -4, bank: 22, surface: 'asphalt' },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 11: Final Cloud Dive & Reactor Finish
      { length: 115, turn: -75, pitch: -6, bank: -20, surface: 'asphalt', deco: 'tunnel' },
      { length: 115, turn: 75, pitch: 0, bank: 20, surface: 'asphalt', checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16 },
      { length: 135, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16 }
    ]
  },
  {
    id: 'track_04',
    name: '04 - Frostbite Ice & Turbo',
    subtitle: 'Sub-zero bobsled banking, ice tunnels, chasm jumps, split highways & 26 boosters (~1m 16s)',
    difficulty: 'Advanced',
    theme: 'arctic_turbo',
    medals: {
      author: 69000,
      gold: 75500,
      silver: 85000,
      bronze: 99000
    },
    blocks: [
      // Sector 1: Arctic Reactor Launch & First Ice Bobsled
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 140, turn: 105, pitch: 4, bank: 30, surface: 'ice', width: 17 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 120, turn: -85, pitch: 6, bank: -22, surface: 'asphalt', width: 15.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 2: Snow Ridge Chicanes & Split Island
      { length: 95, turn: 75, pitch: 8, bank: 18, surface: 'asphalt' },
      { length: 95, turn: -95, pitch: 0, bank: -20, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 3: Twin Ice Bobsled Tube
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 145, turn: 125, pitch: -4, bank: 32, surface: 'ice', width: 17, deco: 'tunnel' },
      { length: 70, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 16 },
      { length: 145, turn: -125, pitch: 4, bank: -32, surface: 'ice', width: 17, deco: 'tunnel' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 4: Glacier Chasm Leap
      { length: 100, turn: 65, pitch: 6, bank: 16, surface: 'asphalt' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 5: Frozen Dirt Switchbacks
      { length: 105, turn: -90, pitch: -4, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 105, turn: 110, pitch: 0, bank: 16, surface: 'dirt', width: 16.5 },
      { length: 105, turn: -90, pitch: 4, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 75, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 6: Sub-Zero Hairpin & Reactor Straight
      { length: 160, turn: 150, pitch: 4, bank: 32, surface: 'ice', width: 17.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 7: Second Ice Ridge Jump
      { length: 110, turn: -85, pitch: 6, bank: -20, surface: 'asphalt', width: 15.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 8: Polar Slalom Chicanes & Hairpin Bowl
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 130, turn: 135, pitch: -4, bank: 28, surface: 'ice', width: 17 },
      { length: 130, turn: -135, pitch: 4, bank: -28, surface: 'ice', width: 17 },
      { length: 125, turn: 140, pitch: 0, bank: 24, surface: 'asphalt', deco: 'tunnel', width: 16 },
      { length: 125, turn: -140, pitch: 0, bank: -24, surface: 'asphalt', deco: 'tunnel', width: 16 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 9: Third Glacier Jump & Aurora Laser Chicanes
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 100, turn: -85, pitch: 4, bank: -22, surface: 'asphalt', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 100, turn: 85, pitch: 0, bank: 22, surface: 'asphalt', deco: 'laser_rings', checkpoint: true },

      // Sector 10: Final Glacier Sprint & Split Highway
      { length: 135, turn: -125, pitch: -4, bank: -22, surface: 'asphalt', width: 15.5 },
      { length: 135, turn: 125, pitch: 0, bank: 22, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16 },
      { length: 140, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16 }
    ]
  },
  {
    id: 'track_05',
    name: '05 - World Championship Finale',
    subtitle: 'Ultimate night GP: all surfaces, neon tunnels, split islands, 3 jumps & 27 boosters (~1m 18s)',
    difficulty: 'Expert',
    theme: 'grand_prix_night',
    medals: {
      author: 70000,
      gold: 76500,
      silver: 86000,
      bronze: 101000
    },
    blocks: [
      // Sector 1: Floodlit Reactor Launch & Turn 1 Complex
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 115, turn: -95, pitch: 8, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 115, pitch: 0, bank: 24, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 2: Technical Dirt S-Curves & Split Highway
      { length: 110, turn: -85, pitch: -4, bank: -15, surface: 'dirt', width: 16.5 },
      { length: 110, turn: 105, pitch: 0, bank: 15, surface: 'dirt', width: 16.5 },
      { length: 110, turn: -85, pitch: 4, bank: -15, surface: 'dirt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 3: Night Climb & First Grand Prix Jump
      { length: 55, turn: 0, pitch: 8, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 125, turn: 85, pitch: 12, bank: 22, surface: 'asphalt', deco: 'tunnel' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 4: Floodlit Ice Bobsled Bowl
      { length: 150, turn: 130, pitch: -4, bank: 32, surface: 'ice', width: 17 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 150, turn: -110, pitch: 0, bank: -28, surface: 'ice', width: 17 },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 5: Laser Coaster Plunge & Split Island
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 115, turn: -75, pitch: -8, bank: -18, surface: 'boost', deco: 'laser_rings', width: 15.5 },
      { length: 115, turn: 75, pitch: 0, bank: 18, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 6: Championship Drift Hairpin Complex
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 150, turn: -145, pitch: 6, bank: -22, surface: 'asphalt', width: 16.5 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 150, turn: 145, pitch: -4, bank: 22, surface: 'asphalt', width: 16.5 },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 7: Second Championship Jump & Neon Tube
      { length: 110, turn: -65, pitch: 6, bank: -16, surface: 'asphalt' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 8: Neon Tunnel S-Chicanes
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 110, turn: 95, pitch: 4, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 110, turn: -110, pitch: -4, bank: -24, surface: 'asphalt', deco: 'tunnel' },
      { length: 110, turn: 95, pitch: 0, bank: 24, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 9: Third Night Sky-Jump & Split Expressway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 10: Floodlit Banked Carousel & Chicanes
      { length: 135, turn: 135, pitch: 6, bank: 26, surface: 'asphalt', width: 16 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 135, turn: -135, pitch: -6, bank: -26, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 11: High-Speed Sweeper & Reactor Finale
      { length: 135, turn: -95, pitch: 0, bank: -24, surface: 'asphalt', width: 16 },
      { length: 135, turn: 95, pitch: 0, bank: 24, surface: 'asphalt', width: 16, checkpoint: true },
      { length: 70, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'grandstand', width: 16.5 },
      { length: 150, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  },
  {
    id: 'track_06',
    name: '06 - Desert Mirage Canyon',
    subtitle: 'Sun-baked canyon bridges, dirt hairpins, twin split highways, 3 jumps & 26 boosters (~1m 16s)',
    difficulty: 'Intermediate',
    theme: 'desert_canyon',
    medals: {
      author: 68000,
      gold: 74500,
      silver: 84000,
      bronze: 98000
    },
    blocks: [
      // Sector 1: Mirage Grandstand Launch & Canyon S-Bend
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 105, turn: 85, pitch: 8, bank: 20, surface: 'asphalt', width: 15.5 },
      { length: 105, turn: -105, pitch: -4, bank: -22, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 85, turn: 65, pitch: 0, bank: 16, surface: 'asphalt', checkpoint: true },

      // Sector 2: Red-Rock Dirt Switchbacks & Split Highway
      { length: 115, turn: -115, pitch: 6, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 115, turn: 115, pitch: -4, bank: 16, surface: 'dirt', width: 16.5 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 3: Canyon Rim Jump & Sandstone Tunnel
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 120, turn: -95, pitch: 4, bank: -22, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: 95, pitch: 0, bank: 22, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 4: Dune Rollercoaster & Hairpin Bowl
      { length: 50, turn: 0, pitch: 8, bank: 0, surface: 'boost' },
      { length: 145, turn: -145, pitch: 6, bank: -24, surface: 'asphalt', width: 16.5 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 145, turn: 145, pitch: -6, bank: 24, surface: 'asphalt', width: 16.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 5: Mesa Rapid Chicanes
      { length: 90, turn: 80, pitch: 0, bank: 18, surface: 'asphalt' },
      { length: 90, turn: -100, pitch: 4, bank: -20, surface: 'asphalt' },
      { length: 90, turn: 80, pitch: 0, bank: 18, surface: 'asphalt' },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 6: Oasis Laser Coaster & Split Island
      { length: 110, turn: -75, pitch: -6, bank: -18, surface: 'boost', deco: 'laser_rings', width: 16 },
      { length: 110, turn: 75, pitch: 0, bank: 18, surface: 'asphalt', width: 16 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 7: Second Canyon Leap & Dirt Rally
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: 105, pitch: 4, bank: 16, surface: 'dirt', width: 16.5 },
      { length: 115, turn: -105, pitch: 0, bank: -16, surface: 'dirt', width: 16.5, checkpoint: true },

      // Sector 8: Mirage Tunnel Corkscrew
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 120, turn: -115, pitch: 6, bank: -24, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: 115, pitch: -4, bank: 24, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 9: Third Mesa Sky-Jump & Sandstone Bowl
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 130, turn: 135, pitch: 4, bank: 24, surface: 'asphalt', width: 16 },
      { length: 130, turn: -135, pitch: 0, bank: -24, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 10: Final Desert Sweeper & Reactor Finish
      { length: 125, turn: 85, pitch: 0, bank: 22, surface: 'asphalt', width: 16 },
      { length: 125, turn: -85, pitch: 0, bank: -22, surface: 'asphalt', width: 16, checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16.5 },
      { length: 140, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  },
  {
    id: 'track_07',
    name: '07 - Volcano Magma Core',
    subtitle: 'High-heat caldera circuit: 4 magma leaps, reactor tunnels, turbine portals & 27 boosters (~1m 16s)',
    difficulty: 'Advanced',
    theme: 'volcano_core',
    medals: {
      author: 68000,
      gold: 74500,
      silver: 84000,
      bronze: 98000
    },
    blocks: [
      // Sector 1: Caldera Reactor Launch & Obsidian Curves
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 50, turn: 0, pitch: 8, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 115, turn: -105, pitch: 10, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 125, pitch: -4, bank: 24, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 2: First Magma Chasm Jump & Split Bridge
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 3: Lava Tube S-Tunnels
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 115, turn: 95, pitch: 6, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 115, turn: -115, pitch: -4, bank: -24, surface: 'asphalt', deco: 'tunnel' },
      { length: 115, turn: 95, pitch: 0, bank: 24, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 4: Volcanic Ash Dirt Hairpins
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 130, turn: -135, pitch: 4, bank: -18, surface: 'dirt', width: 16.5 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 130, turn: 135, pitch: -4, bank: 18, surface: 'dirt', width: 16.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 5: Second Magma Leap & Reactor Coaster
      { length: 95, turn: -75, pitch: 6, bank: -18, surface: 'asphalt' },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19, checkpoint: true },

      // Sector 6: Basalt Banked Slalom & Split Island
      { length: 100, turn: 85, pitch: 0, bank: 22, surface: 'asphalt' },
      { length: 100, turn: -105, pitch: 4, bank: -22, surface: 'asphalt' },
      { length: 100, turn: 85, pitch: 0, bank: 22, surface: 'asphalt' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 7: Third Crater Jump & Laser Plunge
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: -85, pitch: -6, bank: -18, surface: 'boost', deco: 'laser_rings', width: 16 },
      { length: 115, turn: 85, pitch: 0, bank: 18, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 8: Magma Core Hairpin Bowl
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 145, turn: -145, pitch: 6, bank: -26, surface: 'asphalt', width: 16.5 },
      { length: 145, turn: 145, pitch: 0, bank: 26, surface: 'asphalt', width: 16.5, checkpoint: true },

      // Sector 9: Fourth Caldera Leap & Obsidian Tunnel
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 120, turn: 115, pitch: 4, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: -115, pitch: 0, bank: -24, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 10: Final Eruption Sprint
      { length: 110, turn: -70, pitch: 0, bank: -18, surface: 'asphalt', deco: 'tunnel' },
      { length: 110, turn: 70, pitch: 0, bank: 18, surface: 'asphalt', checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16.5 },
      { length: 140, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  },
  {
    id: 'track_08',
    name: '08 - Neon Tokyo Expressway',
    subtitle: 'Midnight Wangan highway: multi-tunnel tollways, split-lane islands, 27 boosters & tight hairpins (~1m 18s)',
    difficulty: 'Advanced',
    theme: 'tokyo_neon',
    medals: {
      author: 69000,
      gold: 75500,
      silver: 85000,
      bronze: 99000
    },
    blocks: [
      // Sector 1: Shibuya Tollgate Launch & Split Expressway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 115, turn: 0, pitch: 4, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5 },
      { length: 115, turn: 95, pitch: 6, bank: 22, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: -95, pitch: 0, bank: -22, surface: 'asphalt', width: 15.5, checkpoint: true },

      // Sector 2: Wangan Neon Tunnel Spiral
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 135, turn: -135, pitch: 6, bank: -26, surface: 'asphalt', deco: 'tunnel', width: 16 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 135, turn: 135, pitch: -4, bank: 26, surface: 'asphalt', deco: 'tunnel', width: 16 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 3: Overpass Leap & Cyber Laser Chicanes
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 95, turn: 85, pitch: 0, bank: 20, surface: 'asphalt', deco: 'laser_rings' },
      { length: 95, turn: -85, pitch: 0, bank: -20, surface: 'asphalt', deco: 'laser_rings', checkpoint: true },

      // Sector 4: Twin Split-Highway Toll Plaza
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost' },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5 },
      { length: 110, turn: -90, pitch: 4, bank: -20, surface: 'asphalt', width: 15.5 },
      { length: 110, turn: 90, pitch: 0, bank: 20, surface: 'asphalt', width: 15.5 },
      { length: 120, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 5: Dockyard Drift Hairpins
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 150, turn: 150, pitch: 6, bank: 24, surface: 'asphalt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 150, turn: -150, pitch: -4, bank: -24, surface: 'asphalt', width: 16.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 6: Skyway Jump & Laser Viaduct
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 110, turn: -75, pitch: -6, bank: -18, surface: 'boost', deco: 'laser_rings', width: 15.5 },
      { length: 110, turn: 75, pitch: 0, bank: 18, surface: 'asphalt', width: 15.5, checkpoint: true },

      // Sector 7: Subterranean Neon Tube S-Curves
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 105, turn: 95, pitch: 4, bank: 22, surface: 'asphalt', deco: 'tunnel' },
      { length: 105, turn: -115, pitch: 0, bank: -22, surface: 'asphalt', deco: 'tunnel' },
      { length: 105, turn: 95, pitch: -4, bank: 22, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 8: Third Tokyo Bay Jump & Split Highway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 120, turn: -115, pitch: 4, bank: -24, surface: 'asphalt', width: 16 },
      { length: 120, turn: 115, pitch: 0, bank: 24, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 9: Rainbow Bridge Rhythm Curves & Reactor Finale
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 120, turn: -115, pitch: 6, bank: -24, surface: 'asphalt', width: 16 },
      { length: 120, turn: 115, pitch: 0, bank: 24, surface: 'asphalt', width: 16, checkpoint: true },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5 },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16.5 },
      { length: 145, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  },
  {
    id: 'track_09',
    name: '09 - Emerald Forest Rallycross',
    subtitle: 'Alpine stadium rally: mixed dirt & asphalt switchbacks, 3 viaduct leaps, tunnels & 26 boosters (~1m 18s)',
    difficulty: 'Advanced',
    theme: 'emerald_forest',
    medals: {
      author: 70000,
      gold: 76500,
      silver: 86000,
      bronze: 100000
    },
    blocks: [
      // Sector 1: Alpine Arena Launch & Sweeping S-Bends
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings' },
      { length: 110, turn: -90, pitch: 8, bank: -20, surface: 'asphalt', width: 15.5 },
      { length: 110, turn: 110, pitch: -4, bank: 22, surface: 'asphalt', width: 15.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 2: Forest Dirt Rallycross Switchbacks
      { length: 115, turn: -110, pitch: 6, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 115, turn: 130, pitch: 0, bank: 18, surface: 'dirt', width: 16.5 },
      { length: 115, turn: -110, pitch: -4, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 3: Timber Viaduct Jump & Split Highway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 4: Mountain Tunnel Hairpin
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 145, turn: 145, pitch: 6, bank: 24, surface: 'asphalt', deco: 'tunnel', width: 16.5 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 145, turn: -145, pitch: -4, bank: -24, surface: 'asphalt', deco: 'tunnel', width: 16.5 },
      { length: 80, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 5: Laser Valley Glider
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 110, turn: 80, pitch: -6, bank: 18, surface: 'boost', deco: 'laser_rings', width: 16 },
      { length: 110, turn: -80, pitch: 0, bank: -18, surface: 'asphalt', width: 16 },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 6: Second Gorge Leap & Dirt Bowl
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 130, turn: -120, pitch: 4, bank: -18, surface: 'dirt', width: 16.5 },
      { length: 130, turn: 120, pitch: 0, bank: 18, surface: 'dirt', width: 16.5, checkpoint: true },

      // Sector 7: Emerald Ridge Chicanes & Split Island
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 95, turn: 85, pitch: 4, bank: 20, surface: 'asphalt' },
      { length: 95, turn: -105, pitch: 0, bank: -22, surface: 'asphalt' },
      { length: 95, turn: 85, pitch: -4, bank: 20, surface: 'asphalt' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 8: Third Alpine Sky-Jump & Tunnel Corkscrew
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 125, turn: 120, pitch: 4, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 125, turn: -120, pitch: 0, bank: -24, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 9: High-Speed Banked Carousel & Final Valley Sprint
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 135, turn: -125, pitch: 4, bank: -26, surface: 'asphalt', width: 16 },
      { length: 135, turn: 125, pitch: 0, bank: 26, surface: 'asphalt', width: 16, checkpoint: true },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'grandstand', width: 16.5 },
      { length: 145, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  },
  {
    id: 'track_10',
    name: '10 - Solar Eclipse Hyperdome',
    subtitle: 'Ultimate finale: all surfaces, 4 sky leaps, ice bobsleds, neon tunnels, split islands & 28 boosters (~1m 20s)',
    difficulty: 'Championship',
    theme: 'solar_eclipse',
    medals: {
      author: 72000,
      gold: 78500,
      silver: 88000,
      bronze: 103000
    },
    blocks: [
      // Sector 1: Hyperdome Reactor Launch & Split Highway
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 },
      { length: 55, turn: 0, pitch: 6, bank: 0, surface: 'super_boost', deco: 'laser_rings', width: 16.5 },
      { length: 115, turn: 0, pitch: 4, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5 },
      { length: 115, turn: -105, pitch: 8, bank: -24, surface: 'asphalt', width: 15.5 },
      { length: 115, turn: 105, pitch: 0, bank: 24, surface: 'asphalt', width: 15.5, checkpoint: true },

      // Sector 2: Eclipse Neon Tunnel Corkscrew
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 120, turn: 115, pitch: 6, bank: 26, surface: 'asphalt', deco: 'tunnel' },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 120, turn: -115, pitch: -4, bank: -26, surface: 'asphalt', deco: 'tunnel', checkpoint: true },

      // Sector 3: First Solar Flare Jump & Ice Bobsled
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 145, turn: 130, pitch: 0, bank: 32, surface: 'ice', width: 17 },
      { length: 145, turn: -130, pitch: 0, bank: -32, surface: 'ice', width: 17, checkpoint: true },

      // Sector 4: Dirt Rally Switchbacks & Split Island
      { length: 45, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 115, turn: -105, pitch: 4, bank: -16, surface: 'dirt', width: 16.5 },
      { length: 115, turn: 105, pitch: 0, bank: 16, surface: 'dirt', width: 16.5 },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 5: Second Hyperdome Jump & Laser Coaster
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 115, turn: -80, pitch: -6, bank: -18, surface: 'boost', deco: 'laser_rings', width: 16 },
      { length: 115, turn: 80, pitch: 0, bank: 18, surface: 'asphalt', width: 16, checkpoint: true },

      // Sector 6: Twin Hairpin Arena
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'turbine' },
      { length: 150, turn: 150, pitch: 6, bank: 24, surface: 'asphalt', width: 16.5 },
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost' },
      { length: 150, turn: -150, pitch: -4, bank: -24, surface: 'asphalt', width: 16.5 },
      { length: 85, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', checkpoint: true },

      // Sector 7: Third Eclipse Jump & Laser Chicanes
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'laser_rings' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 100, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 95, turn: -85, pitch: 0, bank: -20, surface: 'asphalt', deco: 'laser_rings' },
      { length: 95, turn: 85, pitch: 0, bank: 20, surface: 'asphalt', deco: 'laser_rings', checkpoint: true },

      // Sector 8: Tunnel S-Curve & Split Highway
      { length: 50, turn: 0, pitch: 0, bank: 0, surface: 'boost', deco: 'tunnel' },
      { length: 120, turn: 135, pitch: 4, bank: 24, surface: 'asphalt', deco: 'tunnel' },
      { length: 120, turn: -135, pitch: 0, bank: -24, surface: 'asphalt', deco: 'tunnel' },
      { length: 115, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'split_island', width: 18.5, checkpoint: true },

      // Sector 9: Fourth Solar Leap & Championship Bowl
      { length: 55, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine' },
      { length: 45, turn: 0, pitch: 7, bank: 0, surface: 'asphalt', walls: 'none' },
      { length: 26, turn: 0, pitch: -5, bank: 0, isGap: true },
      { length: 105, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', width: 19 },
      { length: 125, turn: -135, pitch: 4, bank: -24, surface: 'asphalt', width: 16 },
      { length: 125, turn: 135, pitch: 0, bank: 24, surface: 'asphalt', width: 16 },
      { length: 110, turn: -95, pitch: 0, bank: -20, surface: 'asphalt', width: 15.5 },
      { length: 110, turn: 95, pitch: 0, bank: 20, surface: 'asphalt', width: 15.5, checkpoint: true },
      { length: 70, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'turbine', width: 16.5 },
      { length: 65, turn: 0, pitch: 0, bank: 0, surface: 'super_boost', deco: 'grandstand', width: 16.5 },
      { length: 150, turn: 0, pitch: 0, bank: 0, surface: 'asphalt', deco: 'grandstand', width: 16.5 }
    ]
  }
];

export function getTrackDefinitionById(trackId, customTrack = null) {
  if (trackId === 'custom' && customTrack) {
    return customTrack;
  }
  return CAMPAIGN_TRACKS.find((t) => t.id === trackId) || CAMPAIGN_TRACKS[0];
}
