// High-Performance Three.js Renderer for TurboMania Online
import * as THREE from '/vendor/three/build/three.module.js';
import { GLTFLoader } from '/vendor/three/examples/jsm/loaders/GLTFLoader.js';

export const CAR_MODELS = [
  { id: 'race', name: 'Apex Formula 1', file: 'race.glb', category: 'Formula', desc: 'Sleek open-wheel racer with authentic downforce lines.' },
  { id: 'race-future', name: 'Cyber Hypercar', file: 'race-future.glb', category: 'Futuristic', desc: 'Futuristic aerodynamic reactor hypercar concept.' },
  { id: 'sedan-sports', name: 'Tuner GT Drift', file: 'sedan-sports.glb', category: 'Sports', desc: 'Widebody sports tuner sedan engineered for sideways drift.' },
  { id: 'hatchback-sports', name: 'Pocket Rocket Rally', file: 'hatchback-sports.glb', category: 'Rally', desc: 'Nimble, high-revving turbo rally hot hatch.' },
  { id: 'kart-oobi', name: 'Super Go-Kart', file: 'kart-oobi.glb', category: 'Kart', desc: 'Arcade go-kart with animated driver character — pure fun with friends!' },
  { id: 'police', name: 'Police Interceptor', file: 'police.glb', category: 'Pursuit', desc: 'Highway pursuit cruiser with flashing blue & red roof sirens!' },
  { id: 'taxi', name: 'Crazy Taxi Cab', file: 'taxi.glb', category: 'City', desc: 'High-speed yellow checkerboard cab ready for supersonic laps.' },
  { id: 'suv-luxury', name: 'Apex Luxury SUV', file: 'suv-luxury.glb', category: 'SUV', desc: 'Muscular luxury performance SUV with aggressive road presence.' },
  { id: 'firetruck', name: 'Turbo Firetruck', file: 'firetruck.glb', category: 'Heavy', desc: 'Emergency response monster with rooftop strobe beacons!' },
  { id: 'van', name: 'Express Delivery Van', file: 'van.glb', category: 'Van', desc: 'Heavyweight speed delivery van built for powerslides.' },
  { id: 'ambulance', name: 'Rapid Response Ambulance', file: 'ambulance.glb', category: 'Emergency', desc: 'Paramedic interceptor equipped with flashing rooftop emergency strobes!' },
  { id: 'garbage-truck', name: 'Heavy Titan Hauler', file: 'garbage-truck.glb', category: 'Heavy', desc: 'Gigantic heavyweight hauler engineered for bumper-to-bumper multiplayer mayhem!' }
];

const gltfLoader = new GLTFLoader();
const modelCache = new Map();

export async function loadGLB(url) {
  if (modelCache.has(url)) {
    return modelCache.get(url).clone(true);
  }
  return new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => {
        modelCache.set(url, gltf.scene);
        resolve(gltf.scene.clone(true));
      },
      undefined,
      (err) => {
        console.warn('Failed to load GLB model:', url, err);
        resolve(null);
      }
    );
  });
}

const THEMES = {
  stadium_day: {
    skyTop: 0x1558b0,
    skyHorizon: 0x89cff0,
    fogColor: 0x7ec0ee,
    groundColor: 0x1f6b3b,
    gridColor: 0x298249,
    sunColor: 0xfff7e0,
    ambientColor: 0x8ab4f8,
    wallColor: [0.92, 0.95, 0.98],
    kerbA: [0.92, 0.18, 0.22],
    kerbB: [0.96, 0.97, 0.99]
  },
  cyber_sunset: {
    skyTop: 0x12062c,
    skyHorizon: 0xd93870,
    fogColor: 0x3b1245,
    groundColor: 0x110926,
    gridColor: 0x6c1d85,
    sunColor: 0xff77aa,
    ambientColor: 0x8855cc,
    wallColor: [0.18, 0.88, 0.98],
    kerbA: [0.98, 0.2, 0.6],
    kerbB: [0.1, 0.95, 0.98]
  },
  sky_acrobat: {
    skyTop: 0x0b3878,
    skyHorizon: 0xa6dcff,
    fogColor: 0x92ceff,
    groundColor: 0x1b5278,
    gridColor: 0x2c72a1,
    sunColor: 0xffffff,
    ambientColor: 0x9ecaff,
    wallColor: [0.98, 0.82, 0.22],
    kerbA: [0.12, 0.58, 0.98],
    kerbB: [0.98, 0.98, 0.99]
  },
  arctic_turbo: {
    skyTop: 0x0f2547,
    skyHorizon: 0x8ce8ff,
    fogColor: 0x6ec6e6,
    groundColor: 0xd8eff8,
    gridColor: 0x9fd0e6,
    sunColor: 0xe6f9ff,
    ambientColor: 0x99ddff,
    wallColor: [0.25, 0.85, 0.98],
    kerbA: [0.05, 0.68, 0.95],
    kerbB: [0.95, 0.99, 1.0]
  },
  grand_prix_night: {
    skyTop: 0x050814,
    skyHorizon: 0x162447,
    fogColor: 0x0d152b,
    groundColor: 0x0b1320,
    gridColor: 0x1b2d48,
    sunColor: 0xdbeafe,
    ambientColor: 0x6082b6,
    wallColor: [0.98, 0.75, 0.15],
    kerbA: [0.95, 0.72, 0.1],
    kerbB: [0.18, 0.22, 0.28]
  },
  desert_canyon: {
    skyTop: 0x8c2d19,
    skyHorizon: 0xfdba74,
    fogColor: 0xf59e0b,
    groundColor: 0x7c2d12,
    gridColor: 0xb45309,
    sunColor: 0xffedd5,
    ambientColor: 0xfdba74,
    wallColor: [0.98, 0.92, 0.82],
    kerbA: [0xea / 255, 0x58 / 255, 0x0c / 255],
    kerbB: [0.98, 0.96, 0.9]
  },
  volcano_core: {
    skyTop: 0x180505,
    skyHorizon: 0x991b1b,
    fogColor: 0x450a0a,
    groundColor: 0x1c0a09,
    gridColor: 0x7f1d1d,
    sunColor: 0xfca5a5,
    ambientColor: 0xef4444,
    wallColor: [0.98, 0.38, 0.12],
    kerbA: [0.98, 0.22, 0.08],
    kerbB: [0.2, 0.18, 0.18]
  },
  tokyo_neon: {
    skyTop: 0x090418,
    skyHorizon: 0x3b0764,
    fogColor: 0x1e0538,
    groundColor: 0x080514,
    gridColor: 0x7e22ce,
    sunColor: 0xf0abfc,
    ambientColor: 0xa855f7,
    wallColor: [0.05, 0.94, 0.98],
    kerbA: [0.95, 0.15, 0.85],
    kerbB: [0.05, 0.95, 1.0]
  },
  emerald_forest: {
    skyTop: 0x064e3b,
    skyHorizon: 0x6ee7b7,
    fogColor: 0x34d399,
    groundColor: 0x064e3b,
    gridColor: 0x059669,
    sunColor: 0xecfdf5,
    ambientColor: 0x6ee7b7,
    wallColor: [0.92, 0.98, 0.94],
    kerbA: [0.06, 0.72, 0.5],
    kerbB: [0.98, 0.92, 0.25]
  },
  solar_eclipse: {
    skyTop: 0x090612,
    skyHorizon: 0x7c2d12,
    fogColor: 0x31102f,
    groundColor: 0x0f071e,
    gridColor: 0x9a3412,
    sunColor: 0xfde047,
    ambientColor: 0xf97316,
    wallColor: [1.0, 0.78, 0.12],
    kerbA: [0.98, 0.45, 0.08],
    kerbB: [0.08, 0.92, 0.98]
  }
};

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      68,
      window.innerWidth / window.innerHeight,
      0.25,
      4500
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Camera tracking state
    this.cameraMode = 0; // 0 = Chase, 1 = Close Action, 2 = Bumper/Hood
    this.camPos = new THREE.Vector3(0, 6, 12);
    this.camTarget = new THREE.Vector3(0, 2, -10);
    this.currentFov = 68;
    this.overviewMode = false;
    this.overviewAngle = 0;

    // Groups
    this.trackGroup = new THREE.Group();
    this.envGroup = new THREE.Group();
    this.actorsGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();

    this.scene.add(this.envGroup);
    this.scene.add(this.trackGroup);
    this.scene.add(this.actorsGroup);
    this.scene.add(this.fxGroup);

    // Checkpoint banner material references for live color switching
    this.cpBannerMeshes = new Map();
    this.animatedRotors = [];
    this.animatedBlimps = [];

    // Local Player Car
    const savedCarModel = (typeof localStorage !== 'undefined' && localStorage.getItem('tm_car_model')) || 'race';
    this.localCar = this.createCarMesh('#00f0ff', false, null, savedCarModel);
    this.actorsGroup.add(this.localCar.group);

    // Personal Best Ghost Car & Room Record Ghost Car
    this.pbGhostCar = this.createCarMesh('#00ffcc', true, 'PB GHOST', savedCarModel);
    this.pbGhostCar.group.visible = false;
    this.actorsGroup.add(this.pbGhostCar.group);

    this.recordGhostCar = this.createCarMesh('#ffd700', true, 'GLOBAL #1 GHOST', 'race');
    this.recordGhostCar.group.visible = false;
    this.actorsGroup.add(this.recordGhostCar.group);

    // Remote Multiplayer Cars: Map<playerId, CarObject>
    this.remoteCars = new Map();
    this.cameraShake = 0;

    // 3D Flying Crash Debris System
    this.activeDebris = [];
    this.debrisMeshTemplates = [];
    this.initDebrisTemplates();

    // Lighting & Environment
    this.setupLights();
    this.setupParticlesAndSkids();

    window.addEventListener('resize', () => this.onResize());
  }

  async initDebrisTemplates() {
    const debrisFiles = [
      '/models/cars/debris-tire.glb',
      '/models/cars/debris-spoiler-a.glb',
      '/models/cars/debris-spoiler-b.glb',
      '/models/cars/debris-bumper.glb',
      '/models/cars/debris-plate-a.glb'
    ];
    for (const url of debrisFiles) {
      const scene = await loadGLB(url);
      if (scene) {
        scene.scale.set(1.75, 1.75, 1.75);
        this.debrisMeshTemplates.push(scene);
      }
    }
  }

  spawnCrashDebris(pos, intensity = 0.5, side = 1) {
    if (!this.debrisMeshTemplates || this.debrisMeshTemplates.length === 0) return;
    const count = intensity > 0.6 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const template = this.debrisMeshTemplates[Math.floor(Math.random() * this.debrisMeshTemplates.length)];
      const mesh = template.clone(true);
      mesh.position.set(
        pos.x + (side || 1) * 0.8 + (Math.random() - 0.5) * 0.6,
        pos.y + 0.5 + Math.random() * 0.4,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      this.fxGroup.add(mesh);

      const vel = new THREE.Vector3(
        -(side || 1) * (5 + Math.random() * 14) + (Math.random() - 0.5) * 6,
        5 + Math.random() * 9,
        (Math.random() - 0.5) * 14
      );

      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );

      this.activeDebris.push({
        mesh,
        vel,
        rotVel,
        life: 0,
        maxLife: 2.2 + Math.random() * 0.8,
        baseScale: 1.75
      });
    }
  }

  triggerCameraShake(amount) {
    this.cameraShake = Math.min(0.65, (this.cameraShake || 0) + amount);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.95);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7e8, 1.55);
    this.dirLight.position.set(140, 240, 120);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 750;
    const d = 220;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
  }

  setupParticlesAndSkids() {
    // 1. Skidmark Ribbon Pool (ring buffer of quads on road surface)
    this.maxSkidQuads = 900;
    this.skidIndex = 0;
    const skidPositions = new Float32Array(this.maxSkidQuads * 6 * 3);
    this.skidGeo = new THREE.BufferGeometry();
    this.skidGeo.setAttribute('position', new THREE.BufferAttribute(skidPositions, 3));
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0a0d12,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.skidMesh = new THREE.Mesh(this.skidGeo, skidMat);
    this.skidMesh.frustumCulled = false;
    this.fxGroup.add(this.skidMesh);
    this.lastSkidLeft = null;
    this.lastSkidRight = null;

    // 2. Particle System (Tire smoke, wall sparks, boost particles)
    this.maxParticles = 260;
    this.particles = [];
    const pGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInstanced.frustumCulled = false;

    const dummyColor = new THREE.Color(0xffffff);
    for (let i = 0; i < this.maxParticles; i++) {
      this.particleInstanced.setColorAt(i, dummyColor);
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        life: 0,
        maxLife: 1,
        color: new THREE.Color(0xffffff)
      });
    }
    this.fxGroup.add(this.particleInstanced);
    this.dummyObj = new THREE.Object3D();
  }

  clearSkidmarks() {
    const arr = this.skidGeo.attributes.position.array;
    arr.fill(0);
    this.skidGeo.attributes.position.needsUpdate = true;
    this.skidIndex = 0;
    this.lastSkidLeft = null;
    this.lastSkidRight = null;
  }

  addSkidmarkPair(leftPt, rightPt) {
    if (!this.lastSkidLeft || !this.lastSkidRight) {
      this.lastSkidLeft = { ...leftPt };
      this.lastSkidRight = { ...rightPt };
      return;
    }

    const distSq =
      (leftPt.x - this.lastSkidLeft.x) ** 2 +
      (leftPt.y - this.lastSkidLeft.y) ** 2 +
      (leftPt.z - this.lastSkidLeft.z) ** 2;

    if (distSq < 0.15) return;
    if (distSq > 16.0) {
      this.lastSkidLeft = { ...leftPt };
      this.lastSkidRight = { ...rightPt };
      return;
    }

    const posArr = this.skidGeo.attributes.position.array;
    const writeQuad = (p0, p1, w) => {
      const idx = (this.skidIndex % this.maxSkidQuads) * 18;
      this.skidIndex++;

      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const len = Math.hypot(dx, dz) || 1;
      const rx = (-dz / len) * w;
      const rz = (dx / len) * w;

      const ax = p0.x - rx, ay = p0.y, az = p0.z - rz;
      const bx = p0.x + rx, by = p0.y, bz = p0.z + rz;
      const cx = p1.x + rx, cy = p1.y, cz = p1.z + rz;
      const dxp = p1.x - rx, dyp = p1.y, dzp = p1.z - rz;

      posArr[idx + 0] = ax; posArr[idx + 1] = ay; posArr[idx + 2] = az;
      posArr[idx + 3] = bx; posArr[idx + 4] = by; posArr[idx + 5] = bz;
      posArr[idx + 6] = cx; posArr[idx + 7] = cy; posArr[idx + 8] = cz;

      posArr[idx + 9] = ax; posArr[idx + 10] = ay; posArr[idx + 11] = az;
      posArr[idx + 12] = cx; posArr[idx + 13] = cy; posArr[idx + 14] = cz;
      posArr[idx + 15] = dxp; posArr[idx + 16] = dyp; posArr[idx + 17] = dzp;
    };

    writeQuad(this.lastSkidLeft, leftPt, 0.16);
    writeQuad(this.lastSkidRight, rightPt, 0.16);

    this.lastSkidLeft = { ...leftPt };
    this.lastSkidRight = { ...rightPt };
    this.skidGeo.attributes.position.needsUpdate = true;
  }

  spawnParticle(pos, vel, colorHex, scale = 0.6, maxLife = 0.45) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.set(pos.x, pos.y, pos.z);
        p.vel.set(vel.x, vel.y, vel.z);
        p.scale = scale;
        p.life = 0;
        p.maxLife = maxLife;
        p.color.set(colorHex);
        this.particleInstanced.setColorAt(i, p.color);
        this.particleInstanced.instanceColor.needsUpdate = true;
        return;
      }
    }
  }

  updateParticles(dt) {
    let anyUpdated = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.dummyObj.position.set(0, -9999, 0);
        this.dummyObj.scale.setScalar(0.001);
        this.dummyObj.updateMatrix();
        this.particleInstanced.setMatrixAt(i, this.dummyObj.matrix);
        continue;
      }

      anyUpdated = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dummyObj.position.set(0, -9999, 0);
        this.dummyObj.scale.setScalar(0.001);
        this.dummyObj.updateMatrix();
        this.particleInstanced.setMatrixAt(i, this.dummyObj.matrix);
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);
      p.vel.y += 1.5 * dt;
      const t = 1.0 - p.life / p.maxLife;
      const s = p.scale * (0.4 + t * 0.9);

      this.dummyObj.position.copy(p.pos);
      this.dummyObj.scale.setScalar(s);
      this.dummyObj.rotation.x += 4 * dt;
      this.dummyObj.rotation.y += 5 * dt;
      this.dummyObj.updateMatrix();
      this.particleInstanced.setMatrixAt(i, this.dummyObj.matrix);
    }

    if (anyUpdated) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
    }

    // Update 3D Flying Crash Debris
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const d = this.activeDebris[i];
      d.life += dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.y -= 26.0 * dt; // Gravity

      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;

      // Road surface bounce
      if (d.mesh.position.y < 0.22) {
        d.mesh.position.y = 0.22;
        d.vel.y = Math.abs(d.vel.y) * 0.45;
        d.vel.x *= 0.72;
        d.vel.z *= 0.72;
        d.rotVel.multiplyScalar(0.75);
      }

      if (d.life >= d.maxLife) {
        this.fxGroup.remove(d.mesh);
        this.activeDebris.splice(i, 1);
      } else if (d.life > d.maxLife - 0.4) {
        const fade = Math.max(0, (d.maxLife - d.life) / 0.4);
        d.mesh.scale.setScalar(d.baseScale * fade);
      }
    }
  }

  /**
   * Builds the 3D environment & track mesh for the compiled track.
   */
  buildTrackScene(track) {
    // Clear existing track & environment meshes
    while (this.trackGroup.children.length > 0) {
      const child = this.trackGroup.children.pop();
      if (child.geometry) child.geometry.dispose();
    }
    while (this.envGroup.children.length > 0) {
      const child = this.envGroup.children.pop();
      if (child.geometry) child.geometry.dispose();
    }
    this.cpBannerMeshes.clear();
    this.animatedRotors = [];
    this.animatedBlimps = [];
    this.clearSkidmarks();

    const theme = THEMES[track.theme] || THEMES.stadium_day;

    // Sky & Fog
    this.scene.background = new THREE.Color(theme.skyHorizon);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, 0.00045);
    this.hemiLight.color.setHex(theme.sunColor);
    this.hemiLight.groundColor.setHex(theme.groundColor);
    this.dirLight.color.setHex(theme.sunColor);

    const centerX = track.boundsCenter ? track.boundsCenter.x : 0;
    const centerZ = track.boundsCenter ? track.boundsCenter.z : -400;

    // 1. Stadium Floor & Grid centered on track
    const floorGeo = new THREE.PlaneGeometry(14000, 14000);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: theme.groundColor,
      roughness: 0.9,
      metalness: 0.05
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(centerX, -0.2, centerZ);
    floorMesh.receiveShadow = true;
    this.envGroup.add(floorMesh);

    const gridHelper = new THREE.GridHelper(10000, 250, theme.gridColor, theme.gridColor);
    gridHelper.position.set(centerX, -0.12, centerZ);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.35;
    this.envGroup.add(gridHelper);

    // 2. Surrounding Stadium Bowl Floodlight Towers & Sky Blimps outside track bounds
    this.buildStadiumBowl(theme, track);

    // 3. Build Combined Road Ribbon + Kerbs + Side Barriers + 3D Track Models BufferGeometry
    const positions = [];
    const normals = [];
    const colors = [];

    const pushTriangle = (a, b, c, color) => {
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      colors.push(
        color[0], color[1], color[2],
        color[0], color[1], color[2],
        color[0], color[1], color[2]
      );
    };

    const pushQuad = (a, b, c, d, color) => {
      pushTriangle(a, b, c, color);
      pushTriangle(a, c, d, color);
    };

    const pt = (slice, latOffset, vertOffset) => ({
      x: slice.p.x + slice.r.x * latOffset + slice.u.x * vertOffset,
      y: slice.p.y + slice.r.y * latOffset + slice.u.y * vertOffset,
      z: slice.p.z + slice.r.z * latOffset + slice.u.z * vertOffset
    });

    const surfaceColors = {
      asphalt: [0.16, 0.19, 0.24],
      asphaltAlt: [0.18, 0.21, 0.27],
      boost: [0.04, 0.72, 0.55],
      super_boost: [0.68, 0.12, 0.85],
      ice: [0.58, 0.88, 0.98],
      dirt: [0.52, 0.36, 0.22],
      no_engine: [0.65, 0.14, 0.18]
    };

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.3
    });

    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i];
      const s0 = seg.s0;
      const s1 = seg.s1;
      const w0 = s0.halfWidth;
      const w1 = s1.halfWidth;
      const kerbW = 1.15;

      const isEven = i % 2 === 0;
      let roadColor = surfaceColors[seg.surface] || surfaceColors.asphalt;
      if (seg.surface === 'asphalt' && isEven) {
        roadColor = surfaceColors.asphaltAlt;
      } else if (seg.surface === 'boost' && isEven) {
        roadColor = [0.08, 0.92, 0.72];
      } else if (seg.surface === 'super_boost' && isEven) {
        roadColor = [0.95, 0.22, 0.98];
      } else if (seg.surface === 'ice' && isEven) {
        roadColor = [0.72, 0.94, 1.0];
      } else if (seg.surface === 'dirt' && isEven) {
        roadColor = [0.47, 0.32, 0.19];
      } else if (seg.surface === 'no_engine' && isEven) {
        roadColor = [0.85, 0.22, 0.22];
      }

      const kerbColor = isEven ? theme.kerbA : theme.kerbB;

      // Main inner road surface
      const r0L = pt(s0, -(w0 - kerbW), 0);
      const r0R = pt(s0, w0 - kerbW, 0);
      const r1R = pt(s1, w1 - kerbW, 0);
      const r1L = pt(s1, -(w1 - kerbW), 0);
      pushQuad(r0L, r0R, r1R, r1L, roadColor);

      // Center racing line dash on asphalt (skip if split_island)
      if (seg.surface === 'asphalt' && seg.deco !== 'split_island' && i % 3 === 0) {
        const c0L = pt(s0, -0.22, 0.02);
        const c0R = pt(s0, 0.22, 0.02);
        const c1R = pt(s1, 0.22, 0.02);
        const c1L = pt(s1, -0.22, 0.02);
        pushQuad(c0L, c0R, c1R, c1L, [0.82, 0.88, 0.95]);
      }

      // Glowing Chevron Arrows on Boost / Super Boost / Freewheel pads
      if (seg.surface === 'boost' || seg.surface === 'super_boost' || seg.surface === 'no_engine') {
        const chevColor =
          seg.surface === 'super_boost'
            ? [1.0, 0.88, 0.25]
            : seg.surface === 'boost'
              ? [0.65, 1.0, 0.92]
              : [1.0, 0.55, 0.2];
        const midSlice = {
          p: {
            x: (s0.p.x + s1.p.x) * 0.5,
            y: (s0.p.y + s1.p.y) * 0.5,
            z: (s0.p.z + s1.p.z) * 0.5
          },
          r: s0.r,
          u: s0.u
        };
        const aL = pt(s0, -w0 * 0.55, 0.04);
        const aTip = pt(s1, 0, 0.04);
        const aR = pt(s0, w0 * 0.55, 0.04);
        const aInner = pt(midSlice, 0, 0.04);
        pushTriangle(aL, aInner, aTip, chevColor);
        pushTriangle(aInner, aR, aTip, chevColor);
      }

      // Left & Right Kerbs
      const k0LL = pt(s0, -w0, 0.03);
      const k1LL = pt(s1, -w1, 0.03);
      pushQuad(k0LL, r0L, r1L, k1LL, kerbColor);

      const k0RR = pt(s0, w0, 0.03);
      const k1RR = pt(s1, w1, 0.03);
      pushQuad(r0R, k0RR, k1RR, r1R, kerbColor);

      // Road slab underside & side trim so elevated sections look solid
      const deckThick = -1.1;
      const b0L = pt(s0, -w0, deckThick);
      const b0R = pt(s0, w0, deckThick);
      const b1R = pt(s1, w1, deckThick);
      const b1L = pt(s1, -w1, deckThick);
      const underColor = [0.12, 0.15, 0.2];
      pushQuad(b0R, b0L, b1L, b1R, underColor);
      pushQuad(b0L, k0LL, k1LL, b1L, [0.22, 0.26, 0.33]);
      pushQuad(k0RR, b0R, b1R, k1RR, [0.22, 0.26, 0.33]);

      // Extruded Side Guardrails / Walls
      const wallH = 1.25;
      const wallThick = 0.45;
      const wallCol = theme.wallColor;
      const neonCol = isEven ? theme.kerbA : [0.1, 0.9, 1.0];

      if (seg.hasLeftWall) {
        const w0InB = pt(s0, -w0, 0);
        const w1InB = pt(s1, -w1, 0);
        const w0InT = pt(s0, -w0, wallH);
        const w1InT = pt(s1, -w1, wallH);
        const w0OutT = pt(s0, -(w0 + wallThick), wallH);
        const w1OutT = pt(s1, -(w1 + wallThick), wallH);
        const w0OutB = pt(s0, -(w0 + wallThick), 0);
        const w1OutB = pt(s1, -(w1 + wallThick), 0);

        pushQuad(w0InB, w1InB, w1InT, w0InT, wallCol);
        pushQuad(w0OutT, w0InT, w1InT, w1OutT, neonCol);
        pushQuad(w0OutB, w0OutT, w1OutT, w1OutB, wallCol);
      }

      if (seg.hasRightWall) {
        const w0InB = pt(s0, w0, 0);
        const w1InB = pt(s1, w1, 0);
        const w0InT = pt(s0, w0, wallH);
        const w1InT = pt(s1, w1, wallH);
        const w0OutT = pt(s0, w0 + wallThick, wallH);
        const w1OutT = pt(s1, w1 + wallThick, wallH);
        const w0OutB = pt(s0, w0 + wallThick, 0);
        const w1OutB = pt(s1, w1 + wallThick, 0);

        pushQuad(w1InB, w0InB, w0InT, w1InT, wallCol);
        pushQuad(w0InT, w0OutT, w1OutT, w1InT, neonCol);
        pushQuad(w1OutB, w1OutT, w0OutT, w0OutB, wallCol);
      }

      // === 3D MODEL 1: Split Highway Center Island Divider (deco === 'split_island') ===
      if (seg.deco === 'split_island') {
        const islW = 0.85;
        const islH = 0.85;
        const islCol = isEven ? [0.95, 0.25, 0.3] : [0.92, 0.95, 0.98];
        const islTopCol = isEven ? [0.08, 0.92, 0.98] : [0.15, 0.2, 0.28];

        const i0LB = pt(s0, -islW, 0);
        const i1LB = pt(s1, -islW, 0);
        const i0LT = pt(s0, -islW * 0.78, islH);
        const i1LT = pt(s1, -islW * 0.78, islH);

        const i0RB = pt(s0, islW, 0);
        const i1RB = pt(s1, islW, 0);
        const i0RT = pt(s0, islW * 0.78, islH);
        const i1RT = pt(s1, islW * 0.78, islH);

        // Left & right angled barrier walls + glowing top median
        pushQuad(i1LB, i0LB, i0LT, i1LT, islCol);
        pushQuad(i0RB, i1RB, i1RT, i0RT, islCol);
        pushQuad(i0LT, i0RT, i1RT, i1LT, islTopCol);
      }

      // === 3D MODEL 2: Futuristic Neon Tunnel (deco === 'tunnel') ===
      if (seg.deco === 'tunnel') {
        const tSideH = 5.4;
        const tPeakH = 8.0;
        const tMidW0 = w0 * 0.58;
        const tMidW1 = w1 * 0.58;
        const tunWallCol = isEven ? [0.12, 0.16, 0.24] : [0.15, 0.2, 0.3];
        const tunRibCol = [0.24, 0.32, 0.44];
        const tunNeonCol = isEven ? theme.kerbA : [0.05, 0.92, 1.0];

        // Left tunnel wall & upper vault
        const tl0B = pt(s0, -w0, wallH);
        const tl1B = pt(s1, -w1, wallH);
        const tl0M = pt(s0, -w0, tSideH);
        const tl1M = pt(s1, -w1, tSideH);
        const tl0T = pt(s0, -tMidW0, tPeakH);
        const tl1T = pt(s1, -tMidW1, tPeakH);

        // Right tunnel wall & upper vault
        const tr0B = pt(s0, w0, wallH);
        const tr1B = pt(s1, w1, wallH);
        const tr0M = pt(s0, w0, tSideH);
        const tr1M = pt(s1, w1, tSideH);
        const tr0T = pt(s0, tMidW0, tPeakH);
        const tr1T = pt(s1, tMidW1, tPeakH);

        // Double-sided tunnel panels (interior & exterior)
        pushQuad(tl0B, tl1B, tl1M, tl0M, tunWallCol);
        pushQuad(tl1B, tl0B, tl0M, tl1M, tunRibCol);

        pushQuad(tl0M, tl1M, tl1T, tl0T, isEven ? tunNeonCol : tunWallCol);
        pushQuad(tl1M, tl0M, tl0T, tl1T, tunRibCol);

        pushQuad(tl0T, tl1T, tr1T, tr0T, isEven ? tunWallCol : tunNeonCol);
        pushQuad(tl1T, tl0T, tr0T, tr1T, tunRibCol);

        pushQuad(tr0T, tr1T, tr1M, tr0M, isEven ? tunNeonCol : tunWallCol);
        pushQuad(tr1T, tr0T, tr0M, tr1M, tunRibCol);

        pushQuad(tr0M, tr1M, tr1B, tr0B, tunWallCol);
        pushQuad(tr1M, tr0M, tr0B, tr1B, tunRibCol);
      }

      // === 3D MODEL 3: Overhead Cyber Laser Speed-Rings (deco === 'laser_rings') ===
      if (seg.deco === 'laser_rings' && i % 2 === 0) {
        const ringH = 6.2;
        const ringTopH = 8.4;
        const ringCol = (i % 4 === 0) ? [0.05, 0.95, 1.0] : theme.kerbA;
        const rl0B = pt(s0, -(w0 + 0.35), wallH);
        const rl1B = pt(s1, -(w1 + 0.35), wallH);
        const rl0M = pt(s0, -(w0 + 0.35), ringH);
        const rl1M = pt(s1, -(w1 + 0.35), ringH);
        const rl0T = pt(s0, -w0 * 0.45, ringTopH);
        const rl1T = pt(s1, -w1 * 0.45, ringTopH);

        const rr0T = pt(s0, w0 * 0.45, ringTopH);
        const rr1T = pt(s1, w1 * 0.45, ringTopH);
        const rr0M = pt(s0, w0 + 0.35, ringH);
        const rr1M = pt(s1, w1 + 0.35, ringH);
        const rr0B = pt(s0, w0 + 0.35, wallH);
        const rr1B = pt(s1, w1 + 0.35, wallH);

        pushQuad(rl0B, rl1B, rl1M, rl0M, ringCol);
        pushQuad(rl1B, rl0B, rl0M, rl1M, ringCol);
        pushQuad(rl0M, rl1M, rl1T, rl0T, ringCol);
        pushQuad(rl1M, rl0M, rl0T, rl1T, ringCol);
        pushQuad(rl0T, rl1T, rr1T, rr0T, ringCol);
        pushQuad(rl1T, rl0T, rr0T, rr1T, ringCol);
        pushQuad(rr0T, rr1T, rr1M, rr0M, ringCol);
        pushQuad(rr1T, rr0T, rr0M, rr1M, ringCol);
        pushQuad(rr0M, rr1M, rr1B, rr0B, ringCol);
        pushQuad(rr1M, rr0M, rr0B, rr1B, ringCol);
      }

      // === 3D MODEL 4: Outer-Curve Neon Chevron Warning Signs (seg.turnSign !== 0) ===
      if (seg.turnSign !== 0 && i % 4 === 0 && seg.deco !== 'tunnel') {
        // Left turn (turnSign > 0) -> outer wall is Right (+w); Right turn (turnSign < 0) -> outer wall is Left (-w)
        const sideSign = seg.turnSign > 0 ? 1 : -1;
        const lat0 = sideSign * (w0 + 0.55);
        const lat1 = sideSign * (w1 + 0.55);
        const signBot = 1.35;
        const signTop = 2.95;
        const signMid = (signBot + signTop) * 0.5;

        const sb0 = pt(s0, lat0, signBot);
        const sb1 = pt(s1, lat1, signBot);
        const st1 = pt(s1, lat1, signTop);
        const st0 = pt(s0, lat0, signTop);
        const sm1 = pt(s1, lat1 - sideSign * 0.06, signMid);

        // Dark backing board (both sides)
        const boardCol = [0.1, 0.14, 0.22];
        pushQuad(sb0, sb1, st1, st0, boardCol);
        pushQuad(sb1, sb0, st0, st1, boardCol);

        // Bright glowing neon chevron triangle pointing forward along the curve
        const chevSignCol = [1.0, 0.85, 0.1];
        const cb0 = pt(s0, lat0 - sideSign * 0.06, signBot + 0.2);
        const ct0 = pt(s0, lat0 - sideSign * 0.06, signTop - 0.2);
        pushTriangle(cb0, sm1, ct0, chevSignCol);
        pushTriangle(ct0, sm1, cb0, chevSignCol);
      }

      // Central Spine Support Pillar strictly below the lowest point of the road slab
      if (i % 20 === 0) {
        const lowestSlabY =
          Math.min(b0L.y, b0R.y, b1L.y, b1R.y, s0.p.y - 1.2, s1.p.y - 1.2) - 0.5;
        if (lowestSlabY > 3.5) {
          // Ensure pillar never lands on or near another road segment
          const gx = Math.floor(s0.p.x / track.cellSize);
          const gz = Math.floor(s0.p.z / track.cellSize);
          let safe = true;
          for (let dx = -1; dx <= 1 && safe; dx++) {
            for (let dz = -1; dz <= 1 && safe; dz++) {
              const bucket = track.spatialGrid.get(`${gx + dx},${gz + dz}`);
              if (!bucket) continue;
              for (const otherSeg of bucket) {
                if (Math.abs(otherSeg.index - i) > 6) {
                  safe = false;
                  break;
                }
              }
            }
          }

          if (safe) {
            const pillarH = lowestSlabY + 0.2;
            const pGeo = new THREE.CylinderGeometry(1.1, 1.45, pillarH, 8);
            const centralPillar = new THREE.Mesh(pGeo, pillarMat);
            centralPillar.position.set(s0.p.x, pillarH * 0.5 - 0.2, s0.p.z);
            this.trackGroup.add(centralPillar);
          }
        }
      }
    }

    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    trackGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    trackGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const trackMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.12
    });

    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.receiveShadow = true;
    trackMesh.castShadow = true;
    this.trackGroup.add(trackMesh);

    // 4. Build Start, Checkpoint, Finish, Turbine & Grandstand 3D Arches
    for (const arch of track.arches) {
      this.buildArchMesh(arch);
    }

    // 5. Populate 3D Kenney Track Props (Start Gantry, Overheads, Street Lights, Barriers, Cones, Pillars)
    this.populate3DTrackProps(track);
  }

  buildArchMesh(arch) {
    const { type, cpIndex, slice } = arch;
    const w = slice.halfWidth + 2.4;
    const h = 9.0;

    const group = new THREE.Group();
    group.position.set(slice.p.x, slice.p.y, slice.p.z);

    // Align group with slice basis (R, U, -F)
    const m = new THREE.Matrix4();
    m.makeBasis(
      new THREE.Vector3(slice.r.x, slice.r.y, slice.r.z),
      new THREE.Vector3(slice.u.x, slice.u.y, slice.u.z),
      new THREE.Vector3(-slice.f.x, -slice.f.y, -slice.f.z)
    );
    group.rotation.setFromRotationMatrix(m);

    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.6
    });

    // === 3D MODEL 5: Animated Overhead Wind-Turbine Gantry (type === 'turbine') ===
    if (type === 'turbine') {
      const turbH = 12.5;
      const colGeo = new THREE.BoxGeometry(1.1, turbH, 1.1);
      const leftCol = new THREE.Mesh(colGeo, pylonMat);
      leftCol.position.set(-w - 0.6, turbH * 0.5, 0);
      const rightCol = new THREE.Mesh(colGeo, pylonMat);
      rightCol.position.set(w + 0.6, turbH * 0.5, 0);

      const crossGeo = new THREE.BoxGeometry(w * 2 + 2.6, 1.2, 1.2);
      const crossBeam = new THREE.Mesh(crossGeo, pylonMat);
      crossBeam.position.set(0, turbH, 0);

      const hubMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12), pylonMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(0, turbH, 0);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, turbH, 1.15);
      const bladeGeo = new THREE.BoxGeometry(0.85, 6.2, 0.18);
      const tipGeo = new THREE.BoxGeometry(0.9, 1.1, 0.22);
      for (let b = 0; b < 4; b++) {
        const bladePivot = new THREE.Group();
        bladePivot.rotation.z = (b * Math.PI) / 2;
        const blade = new THREE.Mesh(bladeGeo, pylonMat);
        blade.position.y = 3.1;
        const tip = new THREE.Mesh(tipGeo, hubMat);
        tip.position.y = 5.8;
        bladePivot.add(blade, tip);
        rotorGroup.add(bladePivot);
      }
      this.animatedRotors.push(rotorGroup);
      group.add(leftCol, rightCol, crossBeam, hub, rotorGroup);
      this.trackGroup.add(group);
      return;
    }

    // === 3D MODEL 6: Trackside Stadium Grandstands & Canopy (type === 'grandstand') ===
    if (type === 'grandstand') {
      const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.4 });
      const crowdCols = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981];

      for (const side of [-1, 1]) {
        const standGroup = new THREE.Group();
        // Position safely outside the road + guardrail
        standGroup.position.set(side * (w + 6.5), 0, 0);

        for (let tier = 0; tier < 3; tier++) {
          const tierGeo = new THREE.BoxGeometry(2.2, 1.4 + tier * 1.35, 18.0);
          const tierMesh = new THREE.Mesh(tierGeo, standMat);
          tierMesh.position.set(side * (tier * 2.2), (1.4 + tier * 1.35) * 0.5, 0);
          standGroup.add(tierMesh);

          const seatMat = new THREE.MeshBasicMaterial({ color: crowdCols[(tier + (side > 0 ? 1 : 0)) % crowdCols.length] });
          const seatGeo = new THREE.BoxGeometry(1.6, 0.35, 17.2);
          const seatMesh = new THREE.Mesh(seatGeo, seatMat);
          seatMesh.position.set(side * (tier * 2.2), 1.4 + tier * 1.35 + 0.2, 0);
          standGroup.add(seatMesh);
        }

        // Angled overhead canopy roof
        const canopyGeo = new THREE.BoxGeometry(8.5, 0.45, 18.8);
        const canopy = new THREE.Mesh(canopyGeo, roofMat);
        canopy.position.set(side * 2.0, 7.8, 0);
        canopy.rotation.z = side * 0.18;
        standGroup.add(canopy);

        const backPillarGeo = new THREE.BoxGeometry(0.8, 7.8, 0.8);
        for (const pz of [-7.5, 7.5]) {
          const bp = new THREE.Mesh(backPillarGeo, standMat);
          bp.position.set(side * 5.2, 3.9, pz);
          standGroup.add(bp);
        }

        group.add(standGroup);
      }
      this.trackGroup.add(group);
      return;
    }

    const pylonColor =
      type === 'start' ? 0x10b981 : type === 'finish' ? 0xf59e0b : 0x0ea5e9;
    const accentMat = new THREE.MeshBasicMaterial({ color: pylonColor });

    const pylonGeo = new THREE.BoxGeometry(0.9, h, 0.9);
    const leftPylon = new THREE.Mesh(pylonGeo, pylonMat);
    leftPylon.position.set(-w, h * 0.5, 0);
    const rightPylon = new THREE.Mesh(pylonGeo, pylonMat);
    rightPylon.position.set(w, h * 0.5, 0);

    const topBeamGeo = new THREE.BoxGeometry(w * 2 + 1.4, 1.35, 1.1);
    const topBeam = new THREE.Mesh(topBeamGeo, pylonMat);
    topBeam.position.set(0, h + 0.3, 0);

    // Holographic Banner across the arch
    const bannerGeo = new THREE.PlaneGeometry(w * 2 - 0.8, 1.8);
    const bannerColor =
      type === 'start' ? 0x10b981 : type === 'finish' ? 0xfbbf24 : 0x00f0ff;
    const bannerMat = new THREE.MeshBasicMaterial({
      color: bannerColor,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, h - 1.1, 0);

    if (type === 'checkpoint') {
      this.cpBannerMeshes.set(cpIndex, bannerMat);
    }

    // Side glowing strips
    const stripGeo = new THREE.BoxGeometry(0.22, h - 0.6, 1.0);
    const leftStrip = new THREE.Mesh(stripGeo, accentMat);
    leftStrip.position.set(-w + 0.4, h * 0.5, 0);
    const rightStrip = new THREE.Mesh(stripGeo, accentMat);
    rightStrip.position.set(w - 0.4, h * 0.5, 0);

    group.add(leftPylon, rightPylon, topBeam, bannerMesh, leftStrip, rightStrip);
    this.trackGroup.add(group);
  }

  async populate3DTrackProps(track) {
    if (!track || !track.slices || track.slices.length === 0) return;

    // Load templates in parallel using modelCache (cached after first load for instant 60 FPS)
    const [
      signDetailed,
      signHighway,
      lightCurved,
      warningSign,
      cone,
      bridgePillar,
      trafficLightHanging,
      stopSign,
      doubleLight,
      constructionFence,
      crateBox
    ] = await Promise.all([
      loadGLB('/models/props/sign-highway-detailed.glb'),
      loadGLB('/models/props/sign-highway.glb'),
      loadGLB('/models/props/light-curved.glb'),
      loadGLB('/models/props/road-sign-warning.glb'),
      loadGLB('/models/props/construction-cone.glb'),
      loadGLB('/models/props/bridge-pillar.glb'),
      loadGLB('/models/props/traffic-light-hanging.glb'),
      loadGLB('/models/props/road-sign-stop.glb'),
      loadGLB('/models/props/light-curved-double.glb'),
      loadGLB('/models/props/construction-fence.glb'),
      loadGLB('/models/cars/box.glb')
    ]);

    const numSlices = track.slices.length;

    // 1. Start Line 3D Overhead Highway Gantry with Hanging Countdown Traffic Lights
    if (signDetailed && track.arches && track.arches.length > 0) {
      const startArch = track.arches.find((a) => a.type === 'start') || track.arches[0];
      if (startArch && startArch.slice) {
        const s = startArch.slice;
        const gantry = signDetailed.clone(true);
        const spanWidth = (s.halfWidth + 2.8) * 2;
        gantry.scale.set(8.0, 14.0, spanWidth);
        gantry.position.set(s.p.x, s.p.y + 0.1, s.p.z);
        const m = new THREE.Matrix4();
        m.makeBasis(
          new THREE.Vector3(s.f.x, s.f.y, s.f.z),
          new THREE.Vector3(s.u.x, s.u.y, s.u.z),
          new THREE.Vector3(s.r.x, s.r.y, s.r.z)
        );
        gantry.rotation.setFromRotationMatrix(m);
        this.trackGroup.add(gantry);

        // Hanging 3D Traffic Countdown Lights below gantry beam
        if (trafficLightHanging) {
          for (const side of [-1, 1]) {
            const tl = trafficLightHanging.clone(true);
            tl.scale.set(7.5, 7.5, 7.5);
            tl.position.set(
              s.p.x + s.r.x * side * (s.halfWidth * 0.45),
              s.p.y + 8.2,
              s.p.z + s.r.z * side * (s.halfWidth * 0.45)
            );
            tl.rotation.setFromRotationMatrix(m);
            this.trackGroup.add(tl);
          }
        }
      }
    }

    // 2. High-Speed Highway Overheads at Boosters
    if (signHighway) {
      const boosterIndices = [];
      for (let i = 0; i < numSlices; i++) {
        if (track.slices[i].type === 'boost') {
          if (boosterIndices.length === 0 || i - boosterIndices[boosterIndices.length - 1] > 35) {
            boosterIndices.push(i);
          }
        }
      }
      for (const idx of boosterIndices) {
        const s = track.slices[idx];
        const gantry = signHighway.clone(true);
        const spanWidth = (s.halfWidth + 2.8) * 2;
        gantry.scale.set(8.0, 13.0, spanWidth);
        gantry.position.set(s.p.x, s.p.y + 0.1, s.p.z);
        const m = new THREE.Matrix4();
        m.makeBasis(
          new THREE.Vector3(s.f.x, s.f.y, s.f.z),
          new THREE.Vector3(s.u.x, s.u.y, s.u.z),
          new THREE.Vector3(s.r.x, s.r.y, s.r.z)
        );
        gantry.rotation.setFromRotationMatrix(m);
        this.trackGroup.add(gantry);
      }
    }

    // 3. Street Light Masts along outer barriers (spaced every ~40 slices)
    if (lightCurved) {
      const lampStep = 40;
      for (let i = 15; i < numSlices - 15; i += lampStep) {
        const s = track.slices[i];
        const side = (i / lampStep) % 2 === 0 ? 1 : -1;
        const lamp = lightCurved.clone(true);
        lamp.scale.set(14, 14, 14);

        const offset = s.halfWidth + 2.5;
        lamp.position.set(
          s.p.x + s.r.x * side * offset,
          s.p.y + s.r.y * side * offset + 0.1,
          s.p.z + s.r.z * side * offset
        );

        const m = new THREE.Matrix4();
        const fVec = side > 0 ? s.f : new THREE.Vector3(-s.f.x, -s.f.y, -s.f.z);
        const rVec = side > 0 ? s.r : new THREE.Vector3(-s.r.x, -s.r.y, -s.r.z);
        m.makeBasis(
          new THREE.Vector3(fVec.x, fVec.y, fVec.z),
          new THREE.Vector3(s.u.x, s.u.y, s.u.z),
          new THREE.Vector3(rVec.x, rVec.y, rVec.z)
        );
        lamp.rotation.setFromRotationMatrix(m);
        this.trackGroup.add(lamp);
      }
    }

    // 4. Sharp Turn / Hairpin Hazard Warning Signs
    if (warningSign) {
      for (let i = 20; i < numSlices - 20; i += 25) {
        const s = track.slices[i];
        const turn = s.turnAngle || 0;
        if (Math.abs(turn) > 0.038) {
          const outerSide = turn > 0 ? -1 : 1;
          const sign = warningSign.clone(true);
          sign.scale.set(7, 7, 7);
          const offset = s.halfWidth + 2.2;
          sign.position.set(
            s.p.x + s.r.x * outerSide * offset,
            s.p.y + s.r.y * outerSide * offset + 0.1,
            s.p.z + s.r.z * outerSide * offset
          );
          const m = new THREE.Matrix4();
          m.makeBasis(
            new THREE.Vector3(s.r.x, s.r.y, s.r.z),
            new THREE.Vector3(s.u.x, s.u.y, s.u.z),
            new THREE.Vector3(-s.f.x, -s.f.y, -s.f.z)
          );
          sign.rotation.setFromRotationMatrix(m);
          this.trackGroup.add(sign);
        }
      }
    }

    // 5. Elevated Bridge Pillars (with strict spatial clearance and deck-recessed height)
    if (bridgePillar) {
      const pillarStep = 32;
      for (let i = 20; i < numSlices - 20; i += pillarStep) {
        const s = track.slices[i];
        if (s.p.y > 6.0) {
          const gx = Math.floor(s.p.x / track.cellSize);
          const gz = Math.floor(s.p.z / track.cellSize);
          let safe = true;
          for (let dx = -2; dx <= 2 && safe; dx++) {
            for (let dz = -2; dz <= 2 && safe; dz++) {
              const bucket = track.spatialGrid.get(`${gx + dx},${gz + dz}`);
              if (!bucket) continue;
              for (const otherSeg of bucket) {
                if (Math.abs(otherSeg.index - i) > 6) {
                  const segMidX = (otherSeg.s0.p.x + otherSeg.s1.p.x) * 0.5;
                  const segMidZ = (otherSeg.s0.p.z + otherSeg.s1.p.z) * 0.5;
                  const dist2D = Math.hypot(s.p.x - segMidX, s.p.z - segMidZ);
                  if (dist2D < otherSeg.s0.halfWidth + 4.0) {
                    safe = false;
                    break;
                  }
                }
              }
            }
          }

          if (safe) {
            const pillar = bridgePillar.clone(true);
            const pillarHeight = Math.max(1.0, s.p.y - 2.0);
            pillar.scale.set(22, pillarHeight * 2.0, 22);
            pillar.position.set(s.p.x, 0, s.p.z);
            this.trackGroup.add(pillar);
          }
        }
      }
    }

    // 6. Apex Cones at Apexes
    if (cone) {
      for (let i = 30; i < numSlices - 30; i += 60) {
        const s = track.slices[i];
        const turn = s.turnAngle || 0;
        if (Math.abs(turn) > 0.035) {
          const innerSide = turn > 0 ? 1 : -1;
          for (let c = -1; c <= 1; c++) {
            const coneMesh = cone.clone(true);
            coneMesh.scale.set(9, 9, 9);
            const dist = s.halfWidth + 0.35;
            coneMesh.position.set(
              s.p.x + s.r.x * innerSide * dist + s.f.x * (c * 2.2),
              s.p.y + s.r.y * innerSide * dist + 0.05,
              s.p.z + s.r.z * innerSide * dist + s.f.z * (c * 2.2)
            );
            this.trackGroup.add(coneMesh);
          }
        }
      }
    }

    // 7. Finish Line 3D Stop Signs (placed symmetrically on left and right borders of finish line)
    if (stopSign && track.arches && track.arches.length > 0) {
      const finishArch = track.arches.find((a) => a.type === 'finish');
      if (finishArch && finishArch.slice) {
        const s = finishArch.slice;
        const m = new THREE.Matrix4();
        m.makeBasis(
          new THREE.Vector3(s.r.x, s.r.y, s.r.z),
          new THREE.Vector3(s.u.x, s.u.y, s.u.z),
          new THREE.Vector3(-s.f.x, -s.f.y, -s.f.z)
        );
        for (const side of [-1, 1]) {
          const sign = stopSign.clone(true);
          sign.scale.set(7.5, 7.5, 7.5);
          const offset = s.halfWidth + 2.2;
          sign.position.set(
            s.p.x + s.r.x * side * offset,
            s.p.y + s.r.y * side * offset + 0.1,
            s.p.z + s.r.z * side * offset
          );
          sign.rotation.setFromRotationMatrix(m);
          this.trackGroup.add(sign);
        }
      }
    }

    // 8. Dual-Arm Highway Lights (placed safely on outer barriers instead of driving lane)
    if (doubleLight) {
      for (let i = 20; i < numSlices - 20; i += 45) {
        const s = track.slices[i];
        if (s.deco === 'split_island') {
          for (const side of [-1, 1]) {
            const lamp = doubleLight.clone(true);
            lamp.scale.set(12, 12, 12);
            const offset = s.halfWidth + 2.6;
            lamp.position.set(
              s.p.x + s.r.x * side * offset,
              s.p.y + s.r.y * side * offset + 0.1,
              s.p.z + s.r.z * side * offset
            );
            const m = new THREE.Matrix4();
            m.makeBasis(
              new THREE.Vector3(s.r.x, s.r.y, s.r.z),
              new THREE.Vector3(s.u.x, s.u.y, s.u.z),
              new THREE.Vector3(-s.f.x, -s.f.y, -s.f.z)
            );
            lamp.rotation.setFromRotationMatrix(m);
            this.trackGroup.add(lamp);
          }
        }
      }
    }

    // 9. Chicane & Runoff Construction Safety Fences
    if (constructionFence) {
      for (let i = 25; i < numSlices - 25; i += 65) {
        const s = track.slices[i];
        const turn = s.turnAngle || 0;
        if (Math.abs(turn) > 0.042 && !s.isGap) {
          const outerSide = turn > 0 ? -1 : 1;
          const fence = constructionFence.clone(true);
          fence.scale.set(10, 10, 10);
          const offset = s.halfWidth + 2.2;
          fence.position.set(
            s.p.x + s.r.x * outerSide * offset,
            s.p.y + s.r.y * outerSide * offset + 0.1,
            s.p.z + s.r.z * outerSide * offset
          );
          const m = new THREE.Matrix4();
          m.makeBasis(
            new THREE.Vector3(s.r.x, s.r.y, s.r.z),
            new THREE.Vector3(s.u.x, s.u.y, s.u.z),
            new THREE.Vector3(-s.f.x, -s.f.y, -s.f.z)
          );
          fence.rotation.setFromRotationMatrix(m);
          this.trackGroup.add(fence);
        }
      }
    }

    // 10. Trackside Wooden Pit Crates near Grandstands
    if (crateBox) {
      for (let i = 15; i < numSlices - 15; i += 50) {
        const s = track.slices[i];
        if (s.deco === 'grandstand') {
          for (let b = -1; b <= 1; b++) {
            const box = crateBox.clone(true);
            box.scale.set(1.6, 1.6, 1.6);
            const dist = s.halfWidth + 3.0;
            box.position.set(
              s.p.x + s.r.x * dist + s.f.x * (b * 1.8),
              s.p.y + s.r.y * dist + 0.05,
              s.p.z + s.r.z * dist + s.f.z * (b * 1.8)
            );
            this.trackGroup.add(box);
          }
        }
      }
    }
  }

  markCheckpointPassed(cpIndex) {
    const mat = this.cpBannerMeshes.get(cpIndex);
    if (mat) {
      mat.color.setHex(0x22c55e);
      mat.opacity = 0.8;
    }
  }

  resetCheckpointBanners() {
    for (const mat of this.cpBannerMeshes.values()) {
      mat.color.setHex(0x00f0ff);
      mat.opacity = 0.65;
    }
  }

  buildStadiumBowl(theme, track) {
    // Compute outer bounds of the entire track so floodlight towers never intersect any road
    let minX = -200, maxX = 200, minZ = -600, maxZ = 200;
    if (track && track.slices) {
      for (const s of track.slices) {
        if (s.p.x < minX) minX = s.p.x;
        if (s.p.x > maxX) maxX = s.p.x;
        if (s.p.z < minZ) minZ = s.p.z;
        if (s.p.z > maxZ) maxZ = s.p.z;
      }
    }
    const margin = 180;
    const towerCoords = [
      [minX - margin, minZ - margin],
      [maxX + margin, minZ - margin],
      [minX - margin, maxZ + margin],
      [maxX + margin, maxZ + margin]
    ];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
    const lightPanelMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });

    for (const [tx, tz] of towerCoords) {
      const tower = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.2, 110, 8), poleMat);
      pole.position.y = 55;
      const head = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 4), lightPanelMat);
      head.position.y = 112;
      head.lookAt(0, 20, -80);
      tower.add(pole, head);
      tower.position.set(tx, 0, tz);
      this.envGroup.add(tower);
    }

    // === 3D MODEL 7: Floating Stadium Airships / Blimps in the Sky ===
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const spanX = Math.max(400, (maxX - minX) * 0.55);
    const spanZ = Math.max(400, (maxZ - minZ) * 0.55);
    const blimpHullMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.2 });
    const blimpStripeColors = [0x00f0ff, 0xf43f5e, 0xf59e0b, 0x10b981, 0xa855f7];

    for (let b = 0; b < 5; b++) {
      const angle = (b / 5) * Math.PI * 2 + 0.4;
      const bx = cx + Math.cos(angle) * spanX;
      const bz = cz + Math.sin(angle) * spanZ;
      const by = 145 + (b % 3) * 24;

      const blimp = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), blimpHullMat);
      hull.scale.set(1.0, 0.85, 2.6);

      const stripeMat = new THREE.MeshBasicMaterial({ color: blimpStripeColors[b % blimpStripeColors.length] });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 10.6, 6, 16), stripeMat);
      band.rotation.x = Math.PI / 2;

      const gondola = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 11), poleMat);
      gondola.position.set(0, -10.5, 0);

      const finV = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 8), stripeMat);
      finV.position.set(0, 2, -24);
      const finH = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 8), stripeMat);
      finH.position.set(0, 0, -24);

      blimp.add(hull, band, gondola, finV, finH);
      blimp.position.set(bx, by, bz);
      blimp.rotation.y = angle + Math.PI * 0.5;
      this.envGroup.add(blimp);
      this.animatedBlimps.push({ group: blimp, baseY: by, phase: b * 1.3 });
    }
  }

  /**
   * Creates a stylized Trackmania Open-Wheel Formula / Stadium Car Mesh.
   * Can load and display any of the 10 3D Kenney vehicle models seamlessly.
   */
  createCarMesh(colorHex = '#00f0ff', isGhost = false, labelText = null, initialModelId = 'race') {
    const group = new THREE.Group();
    const chassis = new THREE.Group();
    group.add(chassis);

    // Group for procedural fallback mesh (instant rendering while GLB loads)
    const proceduralGroup = new THREE.Group();
    chassis.add(proceduralGroup);

    // Group for 3D Kenney GLB model
    const modelGroup = new THREE.Group();
    chassis.add(modelGroup);

    const mainColor = new THREE.Color(colorHex);
    const bodyMat = isGhost
      ? new THREE.MeshBasicMaterial({
          color: mainColor,
          transparent: true,
          opacity: 0.38,
          wireframe: false
        })
      : new THREE.MeshStandardMaterial({
          color: mainColor,
          roughness: 0.25,
          metalness: 0.55
        });

    const darkMat = isGhost
      ? new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.28 })
      : new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.4 });

    const accentMat = new THREE.MeshBasicMaterial({
      color: mainColor,
      transparent: isGhost,
      opacity: isGhost ? 0.55 : 1.0
    });

    // Main central fuselage + nose cone
    const bodyCore = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 3.4), bodyMat);
    bodyCore.position.set(0, 0.22, 0.1);
    bodyCore.castShadow = !isGhost;
    proceduralGroup.add(bodyCore);

    const noseCone = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 1.15), bodyMat);
    noseCone.position.set(0, 0.14, -1.75);
    proceduralGroup.add(noseCone);

    // Sidepods
    const sidePodGeo = new THREE.BoxGeometry(1.75, 0.34, 1.85);
    const sidePods = new THREE.Mesh(sidePodGeo, darkMat);
    sidePods.position.set(0, 0.18, 0.35);
    proceduralGroup.add(sidePods);

    // Cockpit canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 1.15), darkMat);
    canopy.position.set(0, 0.52, 0.15);
    proceduralGroup.add(canopy);

    // Front Splitter Wing
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.55), bodyMat);
    frontWing.position.set(0, 0.05, -2.05);
    proceduralGroup.add(frontWing);

    // Rear Spoiler Wing + Supports
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.55), bodyMat);
    rearWing.position.set(0, 0.72, 1.68);
    proceduralGroup.add(rearWing);

    const wingMount = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.35), darkMat);
    wingMount.position.set(0, 0.48, 1.62);
    proceduralGroup.add(wingMount);

    // Rear LED Tail/Brake strip
    const tailLightMat = new THREE.MeshBasicMaterial({
      color: 0xff1e42,
      transparent: isGhost,
      opacity: isGhost ? 0.45 : 1.0
    });
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.08), tailLightMat);
    tailLight.position.set(0, 0.3, 1.82);
    proceduralGroup.add(tailLight);

    // Dual Boost Exhaust Flames (attached to chassis)
    const flameGeo = new THREE.ConeGeometry(0.18, 0.95, 8);
    flameGeo.rotateX(Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.88
    });
    const flameL = new THREE.Mesh(flameGeo, flameMat);
    flameL.position.set(-0.32, 0.2, 2.25);
    flameL.visible = false;
    const flameR = new THREE.Mesh(flameGeo, flameMat);
    flameR.position.set(0.32, 0.2, 2.25);
    flameR.visible = false;
    chassis.add(flameL, flameR);

    // 4 Procedural Wheels
    const wheelPivots = [];
    const wheelMeshes = [];
    const wheelCoords = [
      [-1.02, 0.1, -1.32, true],
      [1.02, 0.1, -1.32, true],
      [-1.06, 0.14, 1.25, false],
      [1.06, 0.14, 1.25, false]
    ];

    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.4, 10);
    rimGeo.rotateZ(Math.PI / 2);

    for (const [wx, wy, wz, isFront] of wheelCoords) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, wy, wz);
      const wheelSpinGroup = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, darkMat);
      const rim = new THREE.Mesh(rimGeo, accentMat);
      wheelSpinGroup.add(tire, rim);
      pivot.add(wheelSpinGroup);
      proceduralGroup.add(pivot);

      if (isFront) wheelPivots.push(pivot);
      wheelMeshes.push(wheelSpinGroup);
    }

    // Floating Name Label Sprite if provided
    let labelSprite = null;
    if (labelText) {
      labelSprite = this.createNameSprite(labelText, colorHex);
      labelSprite.position.set(0, 1.75, 0);
      group.add(labelSprite);
    }

    const carObj = {
      group,
      chassis,
      proceduralGroup,
      modelGroup,
      modelWheels: [],
      sirenLights: null,
      currentModelId: initialModelId,
      bodyMat,
      accentMat,
      flameL,
      flameR,
      flameMat,
      wheelPivots,
      wheelMeshes,
      labelSprite,
      colorHex,
      isGhost
    };

    this.attach3DCarModel(carObj, initialModelId, colorHex, isGhost);

    return carObj;
  }

  async attach3DCarModel(carObj, modelId, colorHex, isGhost = false) {
    const modelInfo = CAR_MODELS.find((m) => m.id === modelId) || CAR_MODELS[0];
    const url = `/models/cars/${modelInfo.file}`;
    const glbScene = await loadGLB(url);
    if (!glbScene) return;

    if (carObj.currentModelId !== modelId) return;

    while (carObj.modelGroup.children.length > 0) {
      carObj.modelGroup.children.pop();
    }
    carObj.modelWheels = [];
    if (carObj.sirenLights) {
      if (carObj.sirenLights.red) carObj.chassis.remove(carObj.sirenLights.red);
      if (carObj.sirenLights.blue) carObj.chassis.remove(carObj.sirenLights.blue);
      carObj.sirenLights = null;
    }

    let scale = 1.75;
    if (modelId === 'kart-oobi') scale = 1.55;
    if (modelId === 'firetruck' || modelId === 'garbage-truck') scale = 1.65;
    glbScene.scale.set(scale, scale, scale);
    glbScene.rotation.y = Math.PI;
    glbScene.position.set(0, -0.36, 0);

    const mainColor = new THREE.Color(colorHex);

    glbScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = !isGhost;
        child.receiveShadow = !isGhost;

        if (isGhost) {
          child.material = new THREE.MeshBasicMaterial({
            color: mainColor,
            transparent: true,
            opacity: 0.38
          });
        }

        const name = child.name.toLowerCase();
        if (name.includes('wheel')) {
          const isFront = name.includes('front');
          const isLeft = name.includes('left');
          carObj.modelWheels.push({
            mesh: child,
            isFront,
            isLeft,
            baseRotationY: child.rotation.y
          });
        }
      }
    });

    if (modelId === 'police' && !isGhost) {
      const redLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff0022 })
      );
      redLight.position.set(-0.35, 1.45, 0.05);

      const blueLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x0088ff })
      );
      blueLight.position.set(0.35, 1.45, 0.05);

      carObj.chassis.add(redLight, blueLight);
      carObj.sirenLights = { red: redLight, blue: blueLight, type: 'police' };
    } else if (modelId === 'firetruck' && !isGhost) {
      const amberLightL = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.16, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xff3300 })
      );
      amberLightL.position.set(-0.55, 1.75, 0.4);

      const amberLightR = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.16, 0.25),
        new THREE.MeshBasicMaterial({ color: 0xff9900 })
      );
      amberLightR.position.set(0.55, 1.75, 0.4);

      carObj.chassis.add(amberLightL, amberLightR);
      carObj.sirenLights = { red: amberLightL, blue: amberLightR, type: 'firetruck' };
    } else if (modelId === 'ambulance' && !isGhost) {
      const beaconL = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.15, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff0022 })
      );
      beaconL.position.set(-0.35, 1.62, 0.2);

      const beaconR = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.15, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      beaconR.position.set(0.35, 1.62, 0.2);

      carObj.chassis.add(beaconL, beaconR);
      carObj.sirenLights = { red: beaconL, blue: beaconR, type: 'ambulance' };
    }

    carObj.modelGroup.add(glbScene);
    carObj.proceduralGroup.visible = false;
  }

  setCarModel(carObj, modelId) {
    if (!carObj || !modelId) return;
    if (carObj.currentModelId === modelId && carObj.modelGroup.children.length > 0) return;
    carObj.currentModelId = modelId;
    if (carObj.sirenLights) {
      if (carObj.sirenLights.red) carObj.chassis.remove(carObj.sirenLights.red);
      if (carObj.sirenLights.blue) carObj.chassis.remove(carObj.sirenLights.blue);
      carObj.sirenLights = null;
    }
    this.attach3DCarModel(carObj, modelId, carObj.colorHex, carObj.isGhost);
  }

  updateCarColor(carObj, colorHex, labelText = null) {
    carObj.colorHex = colorHex;
    carObj.bodyMat.color.set(colorHex);
    carObj.accentMat.color.set(colorHex);
    if (carObj.isGhost && carObj.modelGroup) {
      const mainColor = new THREE.Color(colorHex);
      carObj.modelGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material.color) {
          child.material.color.copy(mainColor);
        }
      });
    }
    if (labelText && carObj.labelSprite) {
      carObj.group.remove(carObj.labelSprite);
      carObj.labelSprite.material.map.dispose();
      carObj.labelSprite.material.dispose();
      carObj.labelSprite = this.createNameSprite(labelText, colorHex);
      carObj.labelSprite.position.set(0, 1.75, 0);
      carObj.group.add(carObj.labelSprite);
    }
  }

  createNameSprite(text, colorHex = '#00f0ff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 15, 28, 0.78)';
    ctx.beginPath();
    ctx.roundRect(16, 10, 224, 44, 10);
    ctx.fill();

    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text).slice(0, 16), 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.8, 1);
    return sprite;
  }

  /**
   * Applies interpolated physics state to a car mesh.
   */
  applyCarTransform(carObj, state, emitEffects = false) {
    const { group, chassis, wheelPivots, wheelMeshes, flameL, flameR, flameMat } = carObj;
    group.position.set(state.x, state.y, state.z);

    if (state.forward && state.up && state.right) {
      const m = new THREE.Matrix4();
      m.makeBasis(
        new THREE.Vector3(state.right.x, state.right.y, state.right.z),
        new THREE.Vector3(state.up.x, state.up.y, state.up.z),
        new THREE.Vector3(-state.forward.x, -state.forward.y, -state.forward.z)
      );
      group.rotation.setFromRotationMatrix(m);
    } else {
      group.rotation.order = 'YXZ';
      group.rotation.set(state.pitch || 0, state.yaw || 0, state.roll || 0);
    }

    // Apply drift slip angle to chassis
    chassis.rotation.y = -(state.driftAngle || 0);

    // Steer front wheels & spin all 4 wheels
    const steer = state.steerAngle || 0;
    const spin = state.wheelRotation || 0;

    if (carObj.proceduralGroup && carObj.proceduralGroup.visible) {
      for (const pivot of wheelPivots) {
        pivot.rotation.y = steer * 0.42;
      }
      for (const wm of wheelMeshes) {
        wm.rotation.x = -spin;
      }
    }

    // 3D GLB Model wheel animation
    if (carObj.modelWheels && carObj.modelWheels.length > 0) {
      for (const w of carObj.modelWheels) {
        w.mesh.rotation.x = -spin;
        if (w.isFront) {
          w.mesh.rotation.y = (w.baseRotationY || 0) - steer * 0.45;
        }
      }
    }

    // Emergency Flashing Sirens for Police & Firetruck
    if (carObj.sirenLights) {
      const flash = Math.floor(performance.now() / 140) % 2 === 0;
      if (carObj.sirenLights.red) carObj.sirenLights.red.visible = flash;
      if (carObj.sirenLights.blue) carObj.sirenLights.blue.visible = !flash;
    }

    // Boost exhaust flames
    const boostLevel = state.boostLevel || 0;
    const showFlames = boostLevel > 0 || (state.speedKmh || 0) > 255;
    flameL.visible = showFlames;
    flameR.visible = showFlames;
    if (showFlames) {
      flameMat.color.setHex(boostLevel === 2 ? 0xff22ee : boostLevel === 1 ? 0x00ffcc : 0x38bdf8);
      const s = (boostLevel === 2 ? 1.55 : boostLevel === 1 ? 1.25 : 0.75) * (0.85 + Math.random() * 0.3);
      flameL.scale.set(1, 1, s);
      flameR.scale.set(1, 1, s);
    }

    // Emit Skidmarks & Drift Smoke for local player car
    if (emitEffects) {
      if (state.grounded && (state.drifting || Math.abs(state.driftAngle || 0) > 0.14)) {
        const rx = state.right.x, ry = state.right.y, rz = state.right.z;
        const fx = state.forward.x, fy = state.forward.y, fz = state.forward.z;
        const ux = state.up.x, uy = state.up.y, uz = state.up.z;

        const backDist = -1.25;
        const sideDist = 1.02;
        const groundYOffset = -0.46;

        const leftPt = {
          x: state.x + fx * backDist - rx * sideDist + ux * groundYOffset,
          y: state.y + fy * backDist - ry * sideDist + uy * groundYOffset,
          z: state.z + fz * backDist - rz * sideDist + uz * groundYOffset
        };
        const rightPt = {
          x: state.x + fx * backDist + rx * sideDist + ux * groundYOffset,
          y: state.y + fy * backDist + ry * sideDist + uy * groundYOffset,
          z: state.z + fz * backDist + rz * sideDist + uz * groundYOffset
        };
        this.addSkidmarkPair(leftPt, rightPt);

        if (Math.random() < 0.65) {
          const smokeColor = state.surface === 'dirt' ? 0xb48454 : state.surface === 'ice' ? 0xcffafe : 0xe2e8f0;
          this.spawnParticle(
            leftPt,
            { x: (Math.random() - 0.5) * 2, y: 1.2, z: (Math.random() - 0.5) * 2 },
            smokeColor,
            0.55,
            0.38
          );
          this.spawnParticle(
            rightPt,
            { x: (Math.random() - 0.5) * 2, y: 1.2, z: (Math.random() - 0.5) * 2 },
            smokeColor,
            0.55,
            0.38
          );
        }
      } else {
        this.lastSkidLeft = null;
        this.lastSkidRight = null;
      }
    }
  }

  /**
   * Smoothly updates the camera to follow `targetState` (local car or spectated remote car).
   */
  updateCamera(targetState, dt) {
    if (this.overviewMode) {
      this.overviewAngle += dt * 0.18;
      const radius = 240;
      this.camera.position.set(
        Math.cos(this.overviewAngle) * radius,
        145,
        Math.sin(this.overviewAngle) * radius - 90
      );
      this.camera.lookAt(0, 12, -90);
      return;
    }

    const fx = targetState.forward ? targetState.forward.x : -Math.sin(targetState.yaw);
    const fy = targetState.forward ? targetState.forward.y : Math.sin(targetState.pitch || 0);
    const fz = targetState.forward ? targetState.forward.z : -Math.cos(targetState.yaw);

    const ux = targetState.up ? targetState.up.x : 0;
    const uy = targetState.up ? targetState.up.y : 1;
    const uz = targetState.up ? targetState.up.z : 0;

    // Dynamic FOV based on speed & boost
    const speedRatio = Math.min(1.3, (targetState.speedKmh || 0) / 300);
    const boostExtra = (targetState.boostLevel || 0) * 5;
    const desiredFov = 66 + speedRatio * 15 + boostExtra;
    this.currentFov += (desiredFov - this.currentFov) * Math.min(1, 8 * dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraMode === 2) {
      // Hood / Bumper Cam
      this.localCar.group.visible = false;
      this.camera.position.set(
        targetState.x + fx * 0.9 + ux * 0.65,
        targetState.y + fy * 0.9 + uy * 0.65,
        targetState.z + fz * 0.9 + uz * 0.65
      );
      this.camera.lookAt(
        targetState.x + fx * 28 + ux * 0.4,
        targetState.y + fy * 28 + uy * 0.4,
        targetState.z + fz * 28 + uz * 0.4
      );
      return;
    }

    this.localCar.group.visible = true;

    const distBack = this.cameraMode === 1 ? 6.4 : 8.6;
    const heightUp = this.cameraMode === 1 ? 2.45 : 3.45;
    const lookAhead = this.cameraMode === 1 ? 8.5 : 10.5;

    const idealPos = new THREE.Vector3(
      targetState.x - fx * distBack + ux * heightUp,
      targetState.y - fy * distBack + uy * heightUp,
      targetState.z - fz * distBack + uz * heightUp
    );

    const idealLook = new THREE.Vector3(
      targetState.x + fx * lookAhead + ux * 0.9,
      targetState.y + fy * lookAhead + uy * 0.9,
      targetState.z + fz * lookAhead + uz * 0.9
    );

    const posFollowRate = Math.min(1, 16 * dt);
    const lookFollowRate = Math.min(1, 22 * dt);

    this.camPos.lerp(idealPos, posFollowRate);
    this.camTarget.lerp(idealLook, lookFollowRate);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    if (this.cameraShake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 1.2;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.9;
      this.camera.position.z += (Math.random() - 0.5) * this.cameraShake * 1.2;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 3.8);
    }

    // Move directional shadow frustum to follow player
    this.dirLight.target.position.set(targetState.x, targetState.y, targetState.z);
    this.dirLight.position.set(targetState.x + 120, targetState.y + 220, targetState.z + 100);
    this.dirLight.target.updateMatrixWorld();
  }

  cycleCameraMode() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    const names = ['Standard Chase Cam', 'Close Action Cam', 'Hood / Bumper Cam'];
    return names[this.cameraMode];
  }

  render() {
    const now = performance.now() * 0.001;
    if (this.animatedRotors && this.animatedRotors.length > 0) {
      for (const rotor of this.animatedRotors) {
        rotor.rotation.z = now * 1.85;
      }
    }
    if (this.animatedBlimps && this.animatedBlimps.length > 0) {
      for (const blimp of this.animatedBlimps) {
        blimp.group.position.y = blimp.baseY + Math.sin(now * 0.8 + blimp.phase) * 3.5;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
