import * as THREE from "three";

/* ================= DOM ================= */
const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const crashPanel = document.getElementById("crash");
const startBtn = document.getElementById("start-btn");
const retryBtn = document.getElementById("retry-btn");
const distanceEl = document.getElementById("distance");
const coinsEl = document.getElementById("coins");
const mountNameEl = document.getElementById("mount-name");
const crashSummary = document.getElementById("crash-summary");
const musicBtn = document.getElementById("music-btn");

/* ================= 常量 ================= */
const LANES = [-2.4, 0, 2.4];
const TILE_LENGTH = 16;
const VISIBLE_TILES = 14;

/* 霓虹遗迹调色板 */
const PAL = {
  sky: 0x04050d,
  fog: 0x140b2e,
  road: 0x1a2440,
  roadCenter: 0x243259,
  lane: 0x4af0ff,
  edge: 0xff3d9a,
  rock: 0xff8b2e,
  pillar: 0xff2f8f,
  beam: 0xff2d55,
  gap: 0xa855f7,
  ruin: 0x1b2340,
  neonA: 0x2ee6ff,
  neonB: 0xff3d9a,
  canopy: 0x1f8f74,
  trunk: 0x2b1d2e,
};

/* 坐骑数值（与玩法一致，勿改） */
const MOUNTS = {
  tricycle: {
    name: "三轮车",
    speed: 18,
    accel: 0.35,
    jump: 6.4,
    gravity: 18,
    width: 0.85,
    height: 1.35,
    smash: false,
    color: 0xff7a2f,
    slideSquash: 0.62,
    slideDrop: 0.26,
    slideTilt: 0.34,
  },
  horse: {
    name: "马",
    speed: 23,
    accel: 0.55,
    jump: 8.2,
    gravity: 20,
    width: 1.05,
    height: 1.55,
    smash: false,
    color: 0xb5622f,
    slideSquash: 0.6,
    slideDrop: 0.3,
    slideTilt: 0.28,
  },
  carriage: {
    name: "马车",
    speed: 16.5,
    accel: 0.22,
    jump: 5.4,
    gravity: 16,
    width: 1.7,
    height: 1.7,
    smash: true,
    color: 0x8a4a24,
    slideSquash: 0.78,
    slideDrop: 0.2,
    slideTilt: 0.16,
  },
};

const state = {
  running: false,
  mountId: "tricycle",
  lane: 1,
  targetLane: 1,
  x: 0,
  y: 0,
  vy: 0,
  sliding: 0,
  slidePose: 0,
  speed: 0,
  distance: 0,
  coins: 0,
  nextSpawnZ: 40,
  tiles: [],
  obstacles: [],
  coins3d: [],
  scenery: [],
  clock: new THREE.Clock(),
};

/* ================= 渲染基础 ================= */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.fog, 30, 122);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 260);

/* 渐变夜空 */
const skyCanvas = document.createElement("canvas");
skyCanvas.width = 8;
skyCanvas.height = 256;
{
  const ctx = skyCanvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#04050d");
  grad.addColorStop(0.42, "#120a2e");
  grad.addColorStop(0.68, "#3a1150");
  grad.addColorStop(0.86, "#0c1f3e");
  grad.addColorStop(1, "#08122a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
}
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(180, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
);
sky.position.y = 24;
scene.add(sky);

/* 星点 */
{
  const count = 280;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 95 + Math.random() * 65;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.46;
    pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    pos[i * 3 + 1] = 24 + Math.cos(phi) * r;
    pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xa9e8ff,
      size: 1.8,
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthWrite: false,
    })
  );
  scene.add(stars);
}

/* 灯光：冷月 + 洋红轮廓 */
const hemi = new THREE.HemisphereLight(0x8fc4ff, 0x1b0e2c, 1.0);
scene.add(hemi);

const moon = new THREE.DirectionalLight(0xbcd4ff, 1.05);
moon.position.set(-14, 24, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -18;
moon.shadow.camera.right = 18;
moon.shadow.camera.top = 34;
moon.shadow.camera.bottom = -34;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 90;
moon.shadow.bias = -0.0008;
scene.add(moon);

const rimLight = new THREE.DirectionalLight(0xff4fa3, 0.55);
rimLight.position.set(10, 7, -18);
scene.add(rimLight);

const world = new THREE.Group();
scene.add(world);

const player = new THREE.Group();
scene.add(player);

/* 坐骑脚下的霓虹补光 */
const footGlow = new THREE.PointLight(0x4d7bff, 5, 7, 2);
footGlow.position.set(0, 0.25, -1.4);
player.add(footGlow);

/* ================= 材质 / 几何工具 ================= */
function stdMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.08, ...opts });
}
function neonMat(color, intensity = 1.8, base) {
  return new THREE.MeshStandardMaterial({
    color: base === undefined ? color : base,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.25,
  });
}
function toonMat(color) {
  return new THREE.MeshToonMaterial({ color });
}
function mk(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** 在两点之间放一根胶囊，用于四肢、车架、车辕 */
function limb(from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 5, 10);
  const m = new THREE.Mesh(geo, material);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function V(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

/* 车轮：轴向沿 X，可滚动 */
const wheelSpinners = [];
function makeWheel(radius, tube, rimColor, spokeColor, spokes = 8) {
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  outer.add(spin);

  const rimMat = stdMat(rimColor, { roughness: 0.55, metalness: 0.15 });
  const spokeMat = stdMat(spokeColor, { roughness: 0.35, metalness: 0.75 });

  spin.add(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 22), rimMat));
  spin.add(mk(new THREE.CylinderGeometry(tube * 1.5, tube * 1.5, tube * 3.4, 12), spokeMat, 0, 0, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < spokes; i++) {
    spin.add(mk(new THREE.BoxGeometry(tube * 0.55, radius * 2, tube * 0.55), spokeMat, 0, 0, 0, 0, 0, (i / spokes) * Math.PI));
  }
  outer.rotation.y = Math.PI / 2;
  outer.userData.spin = spin;
  outer.userData.radius = radius;
  wheelSpinners.push(outer);
  return outer;
}

/* ================= 人物（卡通版真人骑手） ================= */
const SKIN = 0xffd0a6;
const HAIR = 0x241a14;

function makeRider({ jacket = 0x22d3ee, pants = 0x26324f, handZ = -0.4, handY = 0.46 } = {}) {
  const g = new THREE.Group();
  const mSkin = toonMat(SKIN);
  const mHair = toonMat(HAIR);
  const mJacket = toonMat(jacket);
  const mPants = toonMat(pants);
  const mBoot = toonMat(0x141a2b);

  // 髋
  g.add(mk(new THREE.CapsuleGeometry(0.14, 0.16, 6, 12), mPants, 0, 0.08, 0.02, 0, 0, Math.PI / 2));

  // 腿：髋 → 膝 → 踝，向两侧张开搭在坐骑身侧
  for (const s of [-1, 1]) {
    g.add(limb(V(s * 0.13, 0.06, 0.0), V(s * 0.24, -0.04, -0.22), 0.075, mPants));
    g.add(limb(V(s * 0.24, -0.04, -0.22), V(s * 0.27, -0.24, -0.26), 0.062, mPants));
    g.add(mk(new THREE.BoxGeometry(0.13, 0.1, 0.24), mBoot, s * 0.27, -0.3, -0.3));
  }

  // 躯干（微前倾）
  g.add(mk(new THREE.CapsuleGeometry(0.165, 0.3, 6, 14), mJacket, 0, 0.42, 0, -0.13, 0, 0));
  // 胸口发光条
  g.add(mk(new THREE.BoxGeometry(0.06, 0.2, 0.02), neonMat(0x7ef9ff, 2.4), 0, 0.44, 0.17, -0.13, 0, 0));
  // 肩
  for (const s of [-1, 1]) g.add(mk(new THREE.SphereGeometry(0.095, 12, 10), mJacket, s * 0.17, 0.56, 0));
  // 手臂 → 手
  for (const s of [-1, 1]) {
    const shoulder = V(s * 0.18, 0.55, 0);
    const hand = V(s * 0.2, handY, handZ);
    g.add(limb(shoulder, hand, 0.058, mJacket));
    g.add(mk(new THREE.SphereGeometry(0.072, 10, 8), mSkin, hand.x, hand.y, hand.z));
  }

  // 头
  g.add(mk(new THREE.SphereGeometry(0.185, 16, 14), mSkin, 0, 0.76, -0.02));
  const hair = mk(new THREE.SphereGeometry(0.196, 16, 14), mHair, 0, 0.79, 0.035);
  hair.scale.set(1, 0.9, 0.95);
  g.add(hair);
  // 脸（朝 -z 前方）
  for (const s of [-1, 1]) {
    g.add(mk(new THREE.SphereGeometry(0.028, 8, 8), toonMat(0x15101a), s * 0.068, 0.77, -0.175));
    g.add(mk(new THREE.SphereGeometry(0.05, 8, 8), mSkin, s * 0.185, 0.77, 0.0));
  }
  g.add(mk(new THREE.SphereGeometry(0.022, 8, 8), mSkin, 0, 0.72, -0.19));
  return g;
}

/* ================= 坐骑 A：载货三轮车（卡通版真车） ================= */
function makeTricycle() {
  const g = new THREE.Group();
  const frameMat = stdMat(0xff7a2f, { roughness: 0.42, metalness: 0.5 });
  const darkMat = stdMat(0x151a2e, { roughness: 0.6, metalness: 0.3 });
  const chromeMat = stdMat(0xd6e2f2, { roughness: 0.22, metalness: 0.95 });
  const woodMat = stdMat(0xd07a3a, { roughness: 0.7 });

  // 前轮（大）
  const front = makeWheel(0.36, 0.055, 0x0e1322, 0x9fb3d1, 8);
  front.position.set(0, 0.36, -0.8);
  g.add(front);
  // 后轮
  for (const s of [-1, 1]) {
    const w = makeWheel(0.29, 0.05, 0x0e1322, 0x9fb3d1, 8);
    w.position.set(s * 0.46, 0.29, 0.46);
    g.add(w);
  }
  // 后轴
  g.add(mk(new THREE.CylinderGeometry(0.035, 0.035, 0.96, 10), chromeMat, 0, 0.29, 0.46, 0, 0, Math.PI / 2));

  // 主梁
  g.add(limb(V(0, 0.68, 0.3), V(0, 0.52, -0.66), 0.05, frameMat));
  // 前叉
  for (const s of [-1, 1]) g.add(limb(V(s * 0.1, 0.36, -0.8), V(s * 0.1, 1.0, -0.72), 0.032, chromeMat));
  // 车把 + 握把
  g.add(mk(new THREE.CylinderGeometry(0.032, 0.032, 0.64, 10), chromeMat, 0, 1.02, -0.72, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) g.add(mk(new THREE.CylinderGeometry(0.046, 0.046, 0.13, 10), darkMat, s * 0.29, 1.02, -0.72, 0, 0, Math.PI / 2));
  // 车灯
  g.add(mk(new THREE.SphereGeometry(0.085, 12, 10), neonMat(0xfff0b0, 3.2), 0, 0.86, -0.82));

  // 坐垫
  g.add(mk(new THREE.BoxGeometry(0.36, 0.09, 0.44), darkMat, 0, 0.69, 0.16));

  // 车斗（真实三轮车的载货车厢）
  g.add(mk(new THREE.BoxGeometry(0.76, 0.34, 0.62), woodMat, 0, 0.55, 0.52));
  g.add(mk(new THREE.BoxGeometry(0.78, 0.03, 0.64), stdMat(0x2a1a12), 0, 0.73, 0.52));
  for (const s of [-1, 1]) {
    g.add(mk(new THREE.BoxGeometry(0.02, 0.07, 0.52), neonMat(0x35e8ff, 2.6), s * 0.39, 0.55, 0.52));
  }
  g.add(mk(new THREE.BoxGeometry(0.6, 0.06, 0.02), neonMat(0x35e8ff, 2.2), 0, 0.55, 0.84));

  // 车尾霓虹小旗
  g.add(mk(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6), chromeMat, 0.32, 1.3, 0.76));
  const flag = mk(new THREE.BoxGeometry(0.3, 0.16, 0.02), neonMat(PAL.neonB, 2.4), 0.47, 1.78, 0.76);
  g.add(flag);
  g.add(mk(new THREE.SphereGeometry(0.035, 10, 8), neonMat(0x7ef9ff, 3), 0.32, 1.92, 0.76));

  // 挡泥板
  const guard = mk(new THREE.TorusGeometry(0.42, 0.035, 6, 16, Math.PI * 0.7), frameMat, 0, 0.36, -0.8, 0, Math.PI / 2, Math.PI * 0.15);
  g.add(guard);

  const rider = makeRider({ jacket: 0x22d3ee, handZ: -0.62, handY: 0.44 });
  rider.position.set(0, 0.66, -0.02);
  g.add(rider);
  return g;
}

/* ================= 坐骑 B：卡通马 ================= */
function makeHorse(scale = 0.86, jacket = 0xff6ad5) {
  const g = new THREE.Group();
  const coat = toonMat(0xc46a2e);
  const coatLight = toonMat(0xe0945e);
  const mane = toonMat(0x3a1a12);
  const hoof = toonMat(0x241812);

  // 躯干
  g.add(mk(new THREE.CapsuleGeometry(0.27, 0.5, 8, 16), coat, 0, 0.82, 0.04, Math.PI / 2, 0, 0));
  g.add(mk(new THREE.SphereGeometry(0.28, 16, 14), coat, 0, 0.82, -0.28));
  g.add(mk(new THREE.SphereGeometry(0.27, 16, 14), coat, 0, 0.84, 0.3));
  // 胸口浅色
  g.add(mk(new THREE.SphereGeometry(0.16, 12, 10), coatLight, 0, 0.72, -0.38));

  // 脖子（向前上方伸出，头从骑手肩侧露出）
  g.add(limb(V(0, 0.95, -0.3), V(0, 1.46, -0.95), 0.125, coat));
  // 头（大且前伸，从骑手肩上露出）
  const head = mk(new THREE.SphereGeometry(0.16, 14, 12), coat, 0, 1.52, -1.35, 0.36, 0, 0);
  head.scale.set(1.15, 0.95, 1.4);
  g.add(head);
  // 口鼻
  const muzzle = mk(new THREE.SphereGeometry(0.1, 12, 10), coatLight, 0, 1.42, -1.57);
  muzzle.scale.set(1, 0.85, 1.1);
  g.add(muzzle);
  // 鼻孔 + 眼
  for (const s of [-1, 1]) {
    g.add(mk(new THREE.SphereGeometry(0.022, 8, 8), mane, s * 0.05, 1.44, -1.66));
    g.add(mk(new THREE.SphereGeometry(0.03, 8, 8), toonMat(0x120c10), s * 0.13, 1.56, -1.41));
    // 耳朵
    g.add(mk(new THREE.ConeGeometry(0.045, 0.16, 8), coat, s * 0.08, 1.68, -1.31, -0.22, 0, s * 0.3));
  }
  // 鬃毛
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    g.add(mk(new THREE.BoxGeometry(0.055, 0.18, 0.1), mane, 0, 1.06 + t * 0.44, -0.32 - t * 0.86, -0.55, 0, 0));
  }
  // 尾巴
  g.add(limb(V(0, 1.0, 0.54), V(0, 0.58, 0.76), 0.07, mane));

  // 四条腿 + 蹄
  for (const [x, z] of [[-0.17, -0.26], [0.17, -0.26], [-0.17, 0.3], [0.17, 0.3]]) {
    g.add(limb(V(x, 0.78, z), V(x, 0.13, z), 0.062, coat));
    g.add(mk(new THREE.CylinderGeometry(0.068, 0.075, 0.12, 10), hoof, x, 0.07, z));
  }

  // 鞍 + 鞍布
  g.add(mk(new THREE.BoxGeometry(0.44, 0.03, 0.5), toonMat(0x2f4f7a), 0, 1.08, -0.02));
  g.add(mk(new THREE.BoxGeometry(0.38, 0.08, 0.42), toonMat(0x5a2a1a), 0, 1.13, -0.02));

  const rider = makeRider({ jacket, handZ: -0.38, handY: 0.52 });
  rider.scale.setScalar(0.8);
  rider.position.set(0, 1.06, -0.04);
  g.add(rider);

  g.scale.setScalar(scale);
  return g;
}

/* ================= 坐骑 C：卡通马车 ================= */
function makeCarriage() {
  const g = new THREE.Group();
  const wood = stdMat(0x8a4a24, { roughness: 0.72 });
  const woodDark = stdMat(0x4f2a13, { roughness: 0.75 });
  const metal = stdMat(0xbfd0e6, { roughness: 0.3, metalness: 0.9 });
  const cloth = toonMat(0xd94f8a);

  // 两只大车轮
  for (const s of [-1, 1]) {
    const w = makeWheel(0.46, 0.06, 0x0e1322, 0xc9a06a, 10);
    w.position.set(s * 0.72, 0.46, 0.32);
    g.add(w);
  }
  g.add(mk(new THREE.CylinderGeometry(0.05, 0.05, 1.52, 10), metal, 0, 0.46, 0.32, 0, 0, Math.PI / 2));

  // 车厢
  g.add(mk(new THREE.BoxGeometry(1.28, 0.58, 1.1), wood, 0, 0.86, 0.42));
  for (const s of [-1, 1]) {
    g.add(mk(new THREE.BoxGeometry(0.03, 0.09, 1.04), neonMat(0xff3d9a, 1.8), s * 0.65, 0.86, 0.42));
  }
  g.add(mk(new THREE.BoxGeometry(1.28, 0.5, 0.07), woodDark, 0, 0.92, 0.98));
  // 尾灯
  for (const s of [-1, 1]) g.add(mk(new THREE.SphereGeometry(0.07, 10, 8), neonMat(0xff2d55, 3), s * 0.5, 1.02, 1.02));

  // 坐板 + 靠背
  g.add(mk(new THREE.BoxGeometry(0.92, 0.1, 0.36), woodDark, 0, 1.2, 0.74));
  g.add(mk(new THREE.BoxGeometry(0.92, 0.42, 0.08), cloth, 0, 1.4, 0.92));

  // 车辕
  for (const s of [-1, 1]) {
    g.add(limb(V(s * 0.32, 0.72, -0.1), V(s * 0.16, 0.6, -1.3), 0.042, woodDark));
  }
  // 车夫手绳
  g.add(limb(V(0.18, 1.5, 0.2), V(0.1, 0.62, -1.25), 0.012, stdMat(0x6b4a2a)));

  // 马（前方，头要高出车斗）
  const horse = makeHorse(0.9, 0xff8a3d);
  horse.position.set(0, 0, -1.62);
  g.add(horse);

  const rider = makeRider({ jacket: 0xff8a3d, handZ: -0.46, handY: 0.52 });
  rider.scale.setScalar(0.85);
  rider.position.set(0, 1.22, 0.66);
  g.add(rider);

  g.scale.setScalar(0.92);
  return g;
}

const mountMeshes = {
  tricycle: makeTricycle(),
  horse: makeHorse(0.86),
  carriage: makeCarriage(),
};
for (const m of Object.values(mountMeshes)) {
  m.visible = false;
  // 记录模型自身的设计缩放，下滑压身时在此基础上做相对变化
  m.userData.baseScale = m.scale.x;
  player.add(m);
}

/* ================= 随机数 ================= */
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/* ================= 跑道瓦片 ================= */
function makeTile(z, seed) {
  const group = new THREE.Group();
  group.position.z = z;
  const rand = rng(seed);

  // 路面（深蓝，和障碍物暖色形成强对比）
  group.add(mk(new THREE.BoxGeometry(8.2, 0.4, TILE_LENGTH), stdMat(PAL.road, { roughness: 0.92 }), 0, -0.2, 0));
  // 中间车道略亮，强化三条道
  group.add(mk(new THREE.BoxGeometry(2.4, 0.02, TILE_LENGTH), stdMat(PAL.roadCenter, { roughness: 0.88 }), 0, 0.012, 0));

  // 车道分隔虚线（x = ±1.2）
  const dashMat = neonMat(PAL.lane, 1.5, 0x0b2436);
  for (const x of [-1.2, 1.2]) {
    for (let i = 0; i < 5; i++) {
      group.add(mk(new THREE.BoxGeometry(0.16, 0.035, 1.7), dashMat, x, 0.03, -6.4 + i * 3.2));
    }
  }

  // 两侧路缘石 + 发光边线
  for (const s of [-1, 1]) {
    group.add(mk(new THREE.BoxGeometry(0.36, 0.3, TILE_LENGTH), stdMat(0x0c1124), s * 4.28, 0.06, 0));
    group.add(mk(new THREE.BoxGeometry(0.14, 0.06, TILE_LENGTH), neonMat(PAL.edge, 2.0, 0x2a0a1c), s * 4.2, 0.23, 0));
  }

  // 霓虹路桩
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const pz = -4 + i * 8;
      group.add(mk(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 8), stdMat(0x121a30), s * 4.95, 0.5, pz));
      group.add(mk(new THREE.SphereGeometry(0.085, 10, 8), neonMat(s > 0 ? PAL.neonB : PAL.neonA, 2.8), s * 4.95, 1.03, pz));
    }
  }

  // 遗迹残柱
  for (let i = 0; i < 5; i++) {
    const w = 0.7 + rand() * 1.5;
    const h = 1.2 + rand() * 3.6;
    const d = 0.7 + rand();
    const x = (rand() > 0.5 ? 1 : -1) * (5.8 + rand() * 4);
    const zz = (rand() - 0.5) * TILE_LENGTH;
    const ruin = mk(new THREE.BoxGeometry(w, h, d), stdMat(PAL.ruin, { roughness: 0.96 }), x, h / 2 - 0.2, zz);
    group.add(ruin);
    if (rand() > 0.5) {
      group.add(mk(new THREE.BoxGeometry(w * 0.8, 0.07, 0.05), neonMat(rand() > 0.5 ? PAL.neonA : PAL.neonB, 2.0), x, h * 0.7, zz + d / 2 + 0.04));
    }
  }

  // 发光树
  const tx = rand() > 0.5 ? 6.8 : -6.8;
  const tz = (rand() - 0.5) * 10;
  group.add(mk(new THREE.CylinderGeometry(0.11, 0.22, 2.4, 8), stdMat(PAL.trunk), tx, 1.0, tz));
  const canopy = mk(new THREE.SphereGeometry(0.9, 12, 10), stdMat(PAL.canopy, { roughness: 0.85, emissive: 0x0d3a30, emissiveIntensity: 1 }), tx, 2.4, tz);
  canopy.scale.y = 0.92;
  group.add(canopy);

  return group;
}

function spawnWorld() {
  for (const arr of [state.tiles, state.obstacles, state.coins3d, state.scenery]) {
    for (const obj of arr) world.remove(obj);
    arr.length = 0;
  }
  for (let i = 0; i < VISIBLE_TILES; i++) {
    const tile = makeTile(-i * TILE_LENGTH, 1000 + i);
    world.add(tile);
    state.tiles.push(tile);
  }
  state.nextSpawnZ = 72;
}

/* ================= 障碍物（按颜色区分类型） ================= */
function addObstacle(kind, lane, z) {
  const group = new THREE.Group();
  group.position.set(LANES[lane], 0, -z);
  group.userData = { kind, lane, z, smashed: false };

  if (kind === "rock") {
    // 橙色警示石堆 → 跳跃或换道
    const base = mk(new THREE.BoxGeometry(1.15, 0.88, 1.15), stdMat(0x33261a, { roughness: 0.9 }), 0, 0.44, 0, 0, 0.18, 0);
    group.add(base);
    // 条纹略宽于基座，四侧都能看见
    for (let i = 0; i < 3; i++) {
      group.add(mk(new THREE.BoxGeometry(1.24, 0.14, 1.24), neonMat(PAL.rock, 1.9, 0x612808), 0, 0.18 + i * 0.31, 0, 0, 0.18, 0));
    }
    group.add(mk(new THREE.BoxGeometry(0.42, 0.07, 0.42), neonMat(0xffd166, 2.6), 0, 0.94, 0, 0, 0.18, 0));
    group.userData.h = 0.9;
    group.userData.w = 1.05;
    group.userData.low = true;
  } else if (kind === "pillar") {
    // 洋红石柱 → 必须换道
    group.add(mk(new THREE.BoxGeometry(0.9, 2.4, 0.9), stdMat(0x271334, { roughness: 0.88 }), 0, 1.2, 0));
    for (let i = 0; i < 3; i++) {
      group.add(mk(new THREE.BoxGeometry(0.96, 0.08, 0.96), neonMat(PAL.pillar, 1.9), 0, 0.55 + i * 0.74, 0));
    }
    group.add(mk(new THREE.SphereGeometry(0.18, 12, 10), neonMat(PAL.pillar, 3.2), 0, 2.44, 0));
    group.userData.h = 2.4;
    group.userData.w = 0.9;
    group.userData.low = false;
  } else if (kind === "beam") {
    // 红色横梁 → 下滑通过
    group.add(mk(new THREE.BoxGeometry(7.8, 0.32, 0.5), stdMat(0x2a0a14, { roughness: 0.8 }), 0, 1.42, 0));
    group.add(mk(new THREE.BoxGeometry(7.8, 0.09, 0.1), neonMat(PAL.beam, 3.0), 0, 1.31, 0.27));
    group.add(mk(new THREE.BoxGeometry(7.8, 0.05, 0.08), neonMat(0xffd166, 2.0), 0, 1.56, 0.26));
    for (const s of [-1, 1]) {
      group.add(mk(new THREE.SphereGeometry(0.15, 12, 10), neonMat(0xff2d55, 3.4), s * 3.85, 1.42, 0));
      group.add(mk(new THREE.BoxGeometry(0.26, 1.42, 0.26), stdMat(0x180e20), s * 3.9, 0.71, 0));
    }
    group.userData.h = 1.5;
    group.userData.w = 7.4;
    group.userData.high = true;
  } else {
    // 紫色裂缝 → 必须跳跃
    group.add(mk(new THREE.BoxGeometry(2.34, 0.03, 2.44), new THREE.MeshBasicMaterial({ color: 0x02030a }), 0, 0.032, 0));
    const rimMat = neonMat(PAL.gap, 2.4);
    group.add(mk(new THREE.BoxGeometry(2.5, 0.05, 0.13), rimMat, 0, 0.05, -1.25));
    group.add(mk(new THREE.BoxGeometry(2.5, 0.05, 0.13), rimMat, 0, 0.05, 1.25));
    group.add(mk(new THREE.BoxGeometry(0.13, 0.05, 2.5), rimMat, -1.25, 0.05, 0));
    group.add(mk(new THREE.BoxGeometry(0.13, 0.05, 2.5), rimMat, 1.25, 0.05, 0));
    group.userData.h = 0.4;
    group.userData.w = 2.2;
    group.userData.gap = true;
  }
  world.add(group);
  state.obstacles.push(group);
}

/* ================= 金币 ================= */
function addCoin(lane, z) {
  const group = new THREE.Group();
  group.position.set(LANES[lane], 0.95, -z);

  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.07, 20),
    new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffa600,
      emissiveIntensity: 1.0,
      metalness: 0.8,
      roughness: 0.25,
    })
  );
  coin.rotation.z = Math.PI / 2;
  coin.castShadow = true;
  group.add(coin);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.025, 6, 20),
    neonMat(0xffe9a8, 2.4)
  );
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  group.userData = { lane, z, taken: false };
  world.add(group);
  state.coins3d.push(group);
}

function fillAhead() {
  const far = state.distance + 90;
  while (state.nextSpawnZ < far) {
    const z = state.nextSpawnZ;
    const r = rng((z * 17) | 0)();
    const lane = Math.floor(rng((z * 31 + 9) | 0)() * 3);
    if (r < 0.28) addObstacle("rock", lane, z);
    else if (r < 0.5) addObstacle("pillar", (lane + 1) % 3, z);
    else if (r < 0.62 && z > 140) addObstacle("beam", 1, z);
    else if (r < 0.74) addObstacle("gap", lane, z);
    if (r > 0.35) addCoin((lane + 2) % 3, z + 3);
    state.nextSpawnZ += 9 + (z % 5);
  }
}

function setMount(id) {
  state.mountId = id;
  for (const [key, m] of Object.entries(mountMeshes)) m.visible = key === id;
  mountNameEl.textContent = MOUNTS[id].name;
}

/* ================= 节奏音乐（Web Audio 实时合成，无需音频文件） ================= */
const Music = (() => {
  const BPM = 132;
  const STEP = 60 / BPM / 4; // 十六分音符时长
  const ROOT = 110; // A2
  // 和弦进行：Am - F - C - G（相对 A2 的半音偏移）
  const PROG = [
    [0, 3, 7, 12],
    [-4, 0, 5, 8],
    [3, 7, 10, 15],
    [-2, 2, 5, 10],
  ];
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let bar = 0;
  let active = false;
  let muted = false;

  const semi = (n) => ROOT * Math.pow(2, n / 12);

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (err) {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function amp(gain, t, attack, decay, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    amp(g, t, 0.004, 0.24, 0.95);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.32);
  }

  function snare(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    amp(g, t, 0.003, 0.15, 0.42);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.2);
    // 一点木质感
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    amp(og, t, 0.003, 0.08, 0.18);
    o.connect(og);
    og.connect(master);
    o.start(t);
    o.stop(t + 0.14);
  }

  function hat(t, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7800;
    const g = ctx.createGain();
    amp(g, t, 0.001, open ? 0.14 : 0.045, open ? 0.14 : 0.1);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.2);
  }

  function bass(t, freq, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + dur);
    o.type = "sawtooth";
    o.frequency.value = freq;
    amp(g, t, 0.006, dur, 0.3);
    o.connect(lp);
    lp.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function lead(t, freq, dur, peak) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3600;
    o.type = "square";
    o.frequency.value = freq;
    amp(g, t, 0.004, dur, peak);
    o.connect(lp);
    lp.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  function playStep(s, t) {
    const chord = PROG[bar];
    // 鼓：四拍底鼓 + 反拍重音
    if (s % 4 === 0) kick(t);
    if (s === 11) kick(t);
    // 军鼓：二、四拍
    if (s === 4 || s === 12) snare(t);
    // 踩镲：八分音符，每两小节收尾开镲
    if (s % 2 === 1) hat(t, s === 15);
    // 贝斯：八分音符，根音 + 跳八度
    if (s % 2 === 0) {
      const oct = s === 6 || s === 14 ? 12 : 0;
      bass(t, semi(chord[0] + oct), STEP * 1.7);
    }
    // 主旋律：十六分琶音，带停顿制造律动
    if (s % 2 === 0 || s === 5 || s === 9) {
      const seq = [0, 1, 2, 3, 2, 1, 2, 3];
      const idx = seq[(s + bar) % seq.length];
      const accent = s % 8 === 0 ? 0.16 : 0.1;
      lead(t, semi(chord[idx] + 24), STEP * 1.4, accent);
    }
  }

  function schedule() {
    if (!ctx || !active) return;
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      step = (step + 1) % 16;
      if (step === 0) bar = (bar + 1) % PROG.length;
      nextTime += STEP;
    }
  }

  function start() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (active) return;
    active = true;
    step = 0;
    bar = 0;
    nextTime = ctx.currentTime + 0.06;
    clearInterval(timer);
    timer = setInterval(schedule, 25);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.42, ctx.currentTime + 0.6);
  }

  function pause() {
    if (!ctx) return;
    active = false;
    clearInterval(timer);
    timer = null;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
  }

  function toggleMute() {
    muted = !muted;
    if (ctx && active) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0.0001 : 0.42, ctx.currentTime, 0.05);
    }
    return muted;
  }

  return { start, pause, toggleMute, get muted() { return muted; } };
})();

if (musicBtn) {
  musicBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const m = Music.toggleMute();
    musicBtn.classList.toggle("off", m);
    musicBtn.textContent = m ? "🔇" : "🔊";
  });
}

function resetRun() {
  state.running = true;
  state.lane = 1;
  state.targetLane = 1;
  state.x = 0;
  state.y = 0;
  state.vy = 0;
  state.sliding = 0;
  state.slidePose = 0;
  state.speed = 8;
  state.distance = 0;
  state.coins = 0;
  world.position.z = 0;
  spawnWorld();
  fillAhead();
  setMount(state.mountId);
  overlay.classList.add("hidden");
  crashPanel.classList.add("hidden");
  state.clock.getDelta();
  Music.start();
}

function crash(reason) {
  state.running = false;
  Music.pause();
  crashSummary.textContent = `${reason}  距离 ${Math.floor(state.distance)} · 金币 ${state.coins} · 坐骑 ${MOUNTS[state.mountId].name}`;
  crashPanel.classList.remove("hidden");
}

function jump() {
  if (!state.running || state.y > 0.05) return;
  state.vy = MOUNTS[state.mountId].jump;
  state.sliding = 0;
}

function slide() {
  if (!state.running) return;
  if (state.y > 0.05) {
    // 空中按下方向键 → 快速下坠，落地后仍可接下滑
    state.vy = Math.min(state.vy, -17);
    return;
  }
  state.sliding = 0.55;
}

function onKey(e) {
  if (!state.running) {
    if (e.code === "Enter" || e.code === "Space") {
      if (!overlay.classList.contains("hidden")) resetRun();
    }
    return;
  }
  if (e.code === "ArrowLeft" || e.code === "KeyA") state.targetLane = Math.max(0, state.targetLane - 1);
  if (e.code === "ArrowRight" || e.code === "KeyD") state.targetLane = Math.min(2, state.targetLane + 1);
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    jump();
  }
  if (e.code === "ArrowDown" || e.code === "KeyS") slide();
}

let touchStart = null;
canvas.addEventListener(
  "touchstart",
  (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  },
  { passive: true }
);
// 滑动过程中立即响应该方向，不必等手指抬起
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      state.targetLane = THREE.MathUtils.clamp(state.targetLane + (dx > 0 ? 1 : -1), 0, 2);
      touchStart = { x: t.clientX, y: t.clientY };
    } else if (dy < -30) {
      jump();
      touchStart = { x: t.clientX, y: t.clientY };
    } else if (dy > 30) {
      slide();
      touchStart = { x: t.clientX, y: t.clientY };
    }
  },
  { passive: true }
);
canvas.addEventListener(
  "touchend",
  (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) {
      state.targetLane = THREE.MathUtils.clamp(state.targetLane + (dx > 0 ? 1 : -1), 0, 2);
    } else if (dy < -28) jump();
    else if (dy > 28) slide();
    touchStart = null;
  },
  { passive: true }
);

window.addEventListener("keydown", onKey);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

document.querySelectorAll(".mount-card").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mount-card").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.mountId = btn.dataset.mount;
    setMount(state.mountId);
  });
});

function startFromMenu() {
  try {
    resetRun();
  } catch (err) {
    console.error(err);
  }
}

startBtn.addEventListener("click", startFromMenu);
retryBtn.addEventListener("click", () => {
  crashPanel.classList.add("hidden");
  overlay.classList.remove("hidden");
});
window.startGame = startFromMenu;

function collide() {
  const mount = MOUNTS[state.mountId];
  const hitH = state.sliding > 0 ? mount.height * 0.45 : mount.height;
  const px = state.x;
  const py = state.y;
  const pz = 0;
  for (const ob of state.obstacles) {
    if (ob.userData.smashed) continue;
    const relZ = ob.position.z + world.position.z;
    if (Math.abs(relZ - pz) > 1.15) continue;
    if (ob.userData.high) {
      if (state.sliding > 0) continue;
      if (Math.abs(relZ) < 0.9) return "撞上横梁。下滑才能钻过去。";
    }
    const sameLane = Math.abs(ob.position.x - px) < (mount.width + ob.userData.w) * 0.42;
    if (!sameLane && !ob.userData.high) continue;
    if (ob.userData.gap) {
      if (py < 0.55) return "掉进裂缝。跳起来！";
      continue;
    }
    if (ob.userData.low && mount.smash) {
      ob.userData.smashed = true;
      ob.visible = false;
      continue;
    }
    if (py + 0.2 < ob.userData.h && py + hitH > 0.15) {
      return ob.userData.low ? "撞上碎石。换车道或跳跃。" : "撞上石柱。";
    }
  }
  for (const coin of state.coins3d) {
    if (coin.userData.taken) continue;
    const relZ = coin.position.z + world.position.z;
    if (Math.abs(relZ) < 0.8 && Math.abs(coin.position.x - px) < 0.9 && py < 1.6) {
      coin.userData.taken = true;
      coin.visible = false;
      state.coins += 1;
    }
  }
  return null;
}

function spinWheels(dt) {
  const turn = (state.speed * dt) / 1;
  for (const w of wheelSpinners) {
    const s = w.userData.spin;
    if (s) s.rotation.z += turn / w.userData.radius;
  }
}

let elapsed = 0;

function update(dt) {
  elapsed += dt;

  if (!state.running) {
    camera.position.set(1.9, 2.6, 5.6);
    camera.lookAt(0, 1.0, -1.2);
    player.rotation.y = Math.sin(performance.now() * 0.0008) * 0.35 + 0.18;
    player.position.y = Math.sin(performance.now() * 0.0022) * 0.03;
    spinWheels(0);
    renderer.render(scene, camera);
    return;
  }

  const mount = MOUNTS[state.mountId];
  state.speed = Math.min(mount.speed + 8, state.speed + mount.accel * dt * 8);
  state.distance += state.speed * dt;
  world.position.z = state.distance;

  const targetX = LANES[state.targetLane];
  state.x += (targetX - state.x) * Math.min(1, dt * 10);
  state.lane = state.targetLane;
  state.vy -= mount.gravity * dt;
  state.y += state.vy * dt;
  if (state.y < 0) {
    state.y = 0;
    state.vy = 0;
  }
  if (state.sliding > 0) state.sliding -= dt;

  // 下滑姿态：0→1 平滑过渡，压身 + 车头前倾 + 整体下沉
  const slideTarget = state.sliding > 0 ? 1 : 0;
  state.slidePose += (slideTarget - state.slidePose) * Math.min(1, dt * 22);
  if (Math.abs(state.slidePose - slideTarget) < 0.002) state.slidePose = slideTarget;

  player.position.set(state.x, state.y, 0);
  player.rotation.y = 0;
  player.rotation.z = (targetX - state.x) * -0.12;
  const active = mountMeshes[state.mountId];
  const base = active.userData.baseScale || 1;
  const pose = state.slidePose;
  const squashY = 1 - (1 - mount.slideSquash) * pose;
  // 横向略微鼓起，做出卡通压扁的挤压感
  const bulge = 1 + (1 - squashY) * 0.22;
  active.scale.set(base * bulge, base * squashY, base * bulge);
  active.rotation.x = -mount.slideTilt * pose;
  active.position.y =
    -mount.slideDrop * pose +
    (1 - pose) * Math.sin(elapsed * 14) * 0.015;

  spinWheels(dt);
  footGlow.intensity = 4 + Math.sin(elapsed * 6) * 1.2;

  camera.position.lerp(new THREE.Vector3(state.x * 0.35, 3.6 + state.y * 0.2, 8.2), 0.12);
  camera.lookAt(state.x, 1.1 + state.y, -7);

  fillAhead();
  const reason = collide();
  if (reason) crash(reason);

  for (const tile of state.tiles) {
    const worldZ = tile.position.z + world.position.z;
    if (worldZ > TILE_LENGTH * 1.5) {
      const minZ = Math.min(...state.tiles.map((t) => t.position.z));
      tile.position.z = minZ - TILE_LENGTH;
    }
  }
  for (const coin of state.coins3d) coin.rotation.y += dt * 4;

  distanceEl.textContent = String(Math.floor(state.distance));
  coinsEl.textContent = String(state.coins);
  renderer.render(scene, camera);
}

function loop() {
  const dt = Math.min(0.033, state.clock.getDelta());
  update(dt);
  requestAnimationFrame(loop);
}

setMount("tricycle");
spawnWorld();
loop();
