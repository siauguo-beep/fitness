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
  if (viewAspect > videoAspect) {
    const crop = (1 - videoAspect / viewAspect) / 2;
    cam.left = 0; cam.right = 1;
    cam.top = crop; cam.bottom = 1 - crop;
  } else {
    const crop = (1 - viewAspect / videoAspect) / 2;
    cam.left = crop; cam.right = 1 - crop;
    cam.top = 0; cam.bottom = 1;
  }
  cam.updateProjectionMatrix();
}

function tick() {
  animId = requestAnimationFrame(tick);
  if (!video || video.currentTime === lastVT) {
    renderer.render(scene, cam);
    return;
  }
  lastVT = video.currentTime;
  const ts = performance.now();

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

  renderer.render(scene, cam);
}

function setLM(o, lm) {
  if (!lm?.length) { clr(o); return; }
  const pos = o.pts.geometry.attributes.position.array;
  for (let i = 0; i < lm.length; i++) {
    pos[i * 3]     = lm[i].x;
    pos[i * 3 + 1] = lm[i].y;
    pos[i * 3 + 2] = -(lm[i].z || 0);
  }
  o.pts.geometry.attributes.position.needsUpdate = true;
  o.pts.geometry.setDrawRange(0, lm.length);
  if (o.lines && o.conns.length) {
    const lp = o.lines.geometry.attributes.position.array;
    let ci = 0;
    for (const [a, b] of o.conns) {
      if (a < lm.length && b < lm.length) {
        lp[ci++] = lm[a].x; lp[ci++] = lm[a].y; lp[ci++] = -(lm[a].z || 0);
        lp[ci++] = lm[b].x; lp[ci++] = lm[b].y; lp[ci++] = -(lm[b].z || 0);
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
