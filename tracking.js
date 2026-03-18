let THREE;

const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1';
const MODELS = {
  face: './models/face_landmarker.task',
  hand: './models/hand_landmarker.task',
  pose: './models/pose_landmarker_lite.task',
};
const HAND_CONN = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];
const POSE_CONN = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [15,17],[15,19],[17,19],[16,18],[16,20],[18,20],
  [27,29],[29,31],[28,30],[30,32],
];

let mp, faceL, handL, poseL;
let renderer, scene, cam;
let faceO, lHandO, rHandO, poseO;
let video, container, animId;
let lastVT = -1;
const opts = { face: true, hands: true, pose: true };
const latest = { face: null, leftHand: null, rightHand: null, pose: null };

// Simple FPS measurement for debug HUD
let fpsLastTime = 0;
let fpsFrames = 0;

// 垂直校正：WebGL 原点在左下，MediaPipe 在左上，需翻转 y
// 同时微调 offset 以匹配视频显示
const OVERLAY_Y_FLIP = true;
const OVERLAY_Y_OFFSET = 0.05;

export function setOptions(o) { Object.assign(opts, o); }
export function getLatestLandmarks() { return latest; }

export async function initModels(onStatus) {
  onStatus?.('下載 Three.js 3D 引擎…');
  THREE = await import('three');

  onStatus?.('下載 MediaPipe 運行時…');
  mp = await import(MP_CDN + '/+esm');

  onStatus?.('初始化 AI 引擎…');
  const vision = await mp.FilesetResolver.forVisionTasks(MP_CDN + '/wasm');

  onStatus?.('載入面部識別模型…');
  faceL = await mp.FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELS.face, delegate: 'GPU' },
    runningMode: 'VIDEO', numFaces: 1,
  });

  onStatus?.('載入手部追蹤模型…');
  handL = await mp.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELS.hand, delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.3,
  });

  onStatus?.('載入身體追蹤模型…');
  poseL = await mp.PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODELS.pose, delegate: 'GPU' },
    runningMode: 'VIDEO', numPoses: 1,
  });

  onStatus?.('AI 模型就緒');
}

export function createOverlay(containerEl) {
  container = containerEl;
  const canvas = document.createElement('canvas');
  canvas.className = 'tracking-canvas';
  container.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 10);
  cam.position.z = 1;

  faceO  = mkObj(478, [],        0x00ffc8, 2.5);
  lHandO = mkObj(21,  HAND_CONN, 0xff6644, 4);
  rHandO = mkObj(21,  HAND_CONN, 0x4488ff, 4);
  poseO  = mkObj(33,  POSE_CONN, 0xffdd00, 5);
  [faceO, lHandO, rHandO, poseO].forEach(o => scene.add(o.g));

  new ResizeObserver(fit).observe(container);
}

export function startTracking(videoEl) {
  video = videoEl;
  lastVT = -1;
  fit();
  tick();
}

export function stopTracking() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
}

/* ── Internal ── */

function mkObj(n, conns, color, sz) {
  const g = new THREE.Group();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  pg.setDrawRange(0, 0);
  g.add(new THREE.Points(pg, new THREE.PointsMaterial({
    color, size: sz, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthTest: false,
  })));
  let lines = null;
  if (conns.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(conns.length * 6), 3));
    lg.setDrawRange(0, 0);
    lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.45, depthTest: false,
    }));
    g.add(lines);
  }
  return { g, pts: g.children[0], lines, conns };
}

function fit() {
  if (!video?.videoWidth || !renderer || !container) return;
  const rect = container.getBoundingClientRect();
  const vw = rect.width, vh = rect.height;
  renderer.setSize(vw, vh);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const videoAspect = video.videoWidth / video.videoHeight;
  const viewAspect = vw / vh;
  /* 与 object-fit: contain 一致；OVERLAY_Y_FLIP 时需 top>bottom 以匹配 WebGL 坐标系 */
  if (viewAspect > videoAspect) {
    const crop = (1 - videoAspect / viewAspect) / 2;
    cam.left = crop; cam.right = 1 - crop;
    cam.top = OVERLAY_Y_FLIP ? 1 : 0;
    cam.bottom = OVERLAY_Y_FLIP ? 0 : 1;
  } else {
    const crop = (1 - viewAspect / videoAspect) / 2;
    cam.left = 0; cam.right = 1;
    cam.top = OVERLAY_Y_FLIP ? 1 - crop : crop;
    cam.bottom = OVERLAY_Y_FLIP ? crop : 1 - crop;
  }
  cam.updateProjectionMatrix();
}

function tick() {
  animId = requestAnimationFrame(tick);
  if (!video || video.currentTime === lastVT) {
    updateDebugHUD();
    renderer.render(scene, cam);
    return;
  }
  lastVT = video.currentTime;
  const ts = performance.now();

  // FPS debug
  fpsFrames++;
  if (!fpsLastTime) fpsLastTime = ts;
  const dt = ts - fpsLastTime;
  if (dt >= 500) { // update roughly every 0.5s
    const fps = (fpsFrames * 1000) / dt;
    fpsFrames = 0;
    fpsLastTime = ts;
    if (window.DebugHUD && typeof window.DebugHUD.setFPS === 'function') {
      window.DebugHUD.setFPS(fps);
    }
  }

  if (opts.face && faceL) {
    const r = faceL.detectForVideo(video, ts);
    const lm = r.faceLandmarks?.[0] || null;
    latest.face = lm;
    setLM(faceO, lm);
  } else { clr(faceO); latest.face = null; }

  if (opts.hands && handL) {
    const r = handL.detectForVideo(video, ts);
    let L = null, R = null;
    (r.landmarks || []).forEach((lm, i) => {
      if (r.handednesses?.[i]?.[0]?.categoryName === 'Left') L = lm;
      else R = lm;
    });
    latest.leftHand = L;
    latest.rightHand = R;
    setLM(lHandO, L);
    setLM(rHandO, R);
  } else { clr(lHandO); clr(rHandO); latest.leftHand = null; latest.rightHand = null; }

  if (opts.pose && poseL) {
    const r = poseL.detectForVideo(video, ts);
    const lm = r.landmarks?.[0] || null;
    latest.pose = lm;
    setLM(poseO, lm);
  } else { clr(poseO); latest.pose = null; }

  updateDebugHUD();
  renderer.render(scene, cam);
}

function updateDebugHUD() {
  if (!window.DebugHUD) return;
  if (typeof window.DebugHUD.setTracking === 'function') {
    window.DebugHUD.setTracking({
      face: !!latest.face,
      leftHand: !!latest.leftHand,
      rightHand: !!latest.rightHand,
      pose: !!latest.pose,
    });
  }
  if (typeof window.DebugHUD.setGesture === 'function') {
    const gestures = [];
    [latest.leftHand, latest.rightHand].forEach((lm, i) => {
      if (!lm?.length) return;
      const g = inferHandGesture(lm);
      if (g) gestures.push((i === 0 ? 'L:' : 'R:') + g);
    });
    window.DebugHUD.setGesture(gestures.length ? gestures.join(' · ') : null);
  }
}

function inferHandGesture(lm) {
  if (!lm || lm.length < 21) return null;
  const dist = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const tip = (i) => lm[i];
  const mcp = (i) => lm[i - 3]; // 8->5, 12->9, 16->13, 20->17
  const extended = (tipIdx) => tip(tipIdx).y < mcp(tipIdx).y - 0.02;
  const curled = (tipIdx) => tip(tipIdx).y > mcp(tipIdx).y + 0.02;

  // Thumbs up: thumb tip above thumb IP
  if (tip(4).y < tip(3).y - 0.03) return '👍 大拇指 Thumbs up';
  // Peace: index & middle extended, others curled
  if (extended(8) && extended(12) && curled(16) && curled(20)) return '✌️ 剪刀手 Peace';
  // Heart/比心: thumb tip + index tip close (放宽阈值便于识别)
  if (dist(4, 8) < 0.15) return '❤️ 比心 Heart';
  // Fist: all fingers curled
  if ([8, 12, 16, 20].every(curled)) return '✊ 握拳 Fist';
  // Open palm: all extended
  if ([8, 12, 16, 20].every(extended)) return '🖐️ 张开 Open palm';
  return null;
}

function mapY(y) {
  const flipped = OVERLAY_Y_FLIP ? 1 - y : y;
  return flipped + OVERLAY_Y_OFFSET;
}

function setLM(o, lm) {
  if (!lm?.length) { clr(o); return; }
  const pos = o.pts.geometry.attributes.position.array;
  for (let i = 0; i < lm.length; i++) {
    pos[i * 3]     = lm[i].x;
    pos[i * 3 + 1] = mapY(lm[i].y);
    pos[i * 3 + 2] = -(lm[i].z || 0);
  }
  o.pts.geometry.attributes.position.needsUpdate = true;
  o.pts.geometry.setDrawRange(0, lm.length);
  if (o.lines && o.conns.length) {
    const lp = o.lines.geometry.attributes.position.array;
    let ci = 0;
    for (const [a, b] of o.conns) {
      if (a < lm.length && b < lm.length) {
        lp[ci++] = lm[a].x; lp[ci++] = mapY(lm[a].y); lp[ci++] = -(lm[a].z || 0);
        lp[ci++] = lm[b].x; lp[ci++] = mapY(lm[b].y); lp[ci++] = -(lm[b].z || 0);
      }
    }
    o.lines.geometry.attributes.position.needsUpdate = true;
    o.lines.geometry.setDrawRange(0, o.conns.length * 2);
  }
}

function clr(o) {
  o.pts.geometry.setDrawRange(0, 0);
  if (o.lines) o.lines.geometry.setDrawRange(0, 0);
}
