import * as THREE from 'three';

/* ── Config ── */

const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1';
const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

const HAND_CONN = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

const POSE_CONN = [
  [11,12],
  [11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [15,17],[15,19],[17,19],
  [16,18],[16,20],[18,20],
  [27,29],[29,31],[28,30],[30,32],
];

/* ── State ── */

const on = { face: true, hands: true, pose: true };
let video, renderer, scene, cam;
let faceL, handL, poseL;
let faceO, lHandO, rHandO, poseO;
let audioCtx, analyser, aBuf;
let lastVT = -1, fps = 0, fc = 0, ft = 0;

/* ── Entry ── */

main();

async function main() {
  try {
    msg('启动摄像头…');
    await initCam();
    initThree();
    initAudio();
    msg('下载 MediaPipe 运行时…');
    await loadMP();
    document.getElementById('loading').style.display = 'none';
    bindUI();
    tick();
  } catch (e) {
    msg('错误: ' + e.message);
    console.error(e);
  }
}

/* ── Camera ── */

async function initCam() {
  video = document.getElementById('video');
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    video.srcObject = s;
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('请允许摄像头和麦克风权限');
    if (e.name === 'NotFoundError') throw new Error('未找到摄像头设备');
    throw e;
  }
  await video.play();
  if (!video.videoWidth) await new Promise(r => (video.onloadeddata = r));
  fit();
}

/* ── Audio ── */

function initAudio() {
  try {
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(video.srcObject);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    aBuf = new Uint8Array(analyser.frequencyBinCount);
  } catch (_) { /* audio optional */ }
  document.addEventListener(
    'click',
    () => audioCtx?.state === 'suspended' && audioCtx.resume(),
    { once: true },
  );
}

/* ── Three.js ── */

function initThree() {
  const canvas = document.getElementById('overlay');
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
  window.addEventListener('resize', fit);
}

function mkObj(n, conns, color, sz) {
  const g = new THREE.Group();

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  pg.setDrawRange(0, 0);
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({
    color, size: sz, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthTest: false,
  }));
  g.add(pts);

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

  return { g, pts, lines, conns };
}

function fit() {
  if (!video?.videoWidth || !renderer) return;
  const vw = innerWidth, vh = innerHeight;
  renderer.setSize(vw, vh);

  const videoAspect = video.videoWidth / video.videoHeight;
  const viewAspect = vw / vh;

  if (viewAspect > videoAspect) {
    const crop = (1 - videoAspect / viewAspect) / 2;
    cam.left = 0;
    cam.right = 1;
    cam.top = crop;
    cam.bottom = 1 - crop;
  } else {
    const crop = (1 - viewAspect / videoAspect) / 2;
    cam.left = crop;
    cam.right = 1 - crop;
    cam.top = 0;
    cam.bottom = 1;
  }
  cam.updateProjectionMatrix();
}

/* ── MediaPipe ── */

async function loadMP() {
  const mp = await import(MP_CDN + '/+esm');
  if (!mp?.FilesetResolver) throw new Error('MediaPipe 初始化失败');

  msg('初始化 AI 引擎…');
  const visionWasm = await mp.FilesetResolver.forVisionTasks(MP_CDN + '/wasm');

  msg('加载面部识别模型…');
  faceL = await mp.FaceLandmarker.createFromOptions(visionWasm, {
    baseOptions: { modelAssetPath: MODELS.face, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  msg('加载手部追踪模型…');
  handL = await mp.HandLandmarker.createFromOptions(visionWasm, {
    baseOptions: { modelAssetPath: MODELS.hand, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  msg('加载身体追踪模型…');
  poseL = await mp.PoseLandmarker.createFromOptions(visionWasm, {
    baseOptions: { modelAssetPath: MODELS.pose, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });

  msg('准备就绪！');
}

/* ── Animation Loop ── */

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();

  fc++;
  if (now - ft >= 1000) {
    fps = fc; fc = 0; ft = now;
    document.getElementById('fps').textContent = fps + ' FPS';
  }

  if (video.currentTime !== lastVT) {
    lastVT = video.currentTime;
    const ts = now;

    if (on.face) {
      const r = faceL.detectForVideo(video, ts);
      setLM(faceO, r.faceLandmarks?.[0]);
    } else clr(faceO);

    if (on.hands) {
      const r = handL.detectForVideo(video, ts);
      let L = null, R = null;
      (r.landmarks || []).forEach((lm, i) => {
        if (r.handednesses?.[i]?.[0]?.categoryName === 'Left') L = lm;
        else R = lm;
      });
      setLM(lHandO, L);
      setLM(rHandO, R);
    } else { clr(lHandO); clr(rHandO); }

    if (on.pose) {
      const r = poseL.detectForVideo(video, ts);
      setLM(poseO, r.landmarks?.[0]);
    } else clr(poseO);
  }

  if (analyser) {
    analyser.getByteFrequencyData(aBuf);
    let s = 0;
    for (let i = 0; i < aBuf.length; i++) s += aBuf[i];
    document.getElementById('audio-bar').style.width =
      (s / aBuf.length / 255 * 100) + '%';
  }

  renderer.render(scene, cam);
}

/* ── Landmark → Three.js ── */

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

/* ── UI ── */

function bindUI() {
  ['face', 'hands', 'pose'].forEach(k => {
    const b = document.getElementById('toggle-' + k);
    b?.addEventListener('click', () => {
      on[k] = !on[k];
      b.classList.toggle('on', on[k]);
    });
  });
}

function msg(t) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = t;
}
