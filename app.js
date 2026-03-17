// Global error visualization (dev)
window.addEventListener('error', (e) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#900;color:#fff;padding:8px 12px;font:13px monospace;z-index:99999;white-space:pre-wrap;max-height:30vh;overflow:auto';
  d.textContent = '[JS Error] ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || '');
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 15000);
});
window.addEventListener('unhandledrejection', (e) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#906;color:#fff;padding:8px 12px;font:13px monospace;z-index:99999;white-space:pre-wrap;max-height:30vh;overflow:auto';
  d.textContent = '[Promise Error] ' + (e.reason?.message || e.reason || 'unknown');
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 15000);
});

// Lazy-load tracking module (avoid Three.js blocking the page)
let trackingModule = null;
async function loadTrackingModule() {
  if (!trackingModule) trackingModule = await import('./tracking.js');
  return trackingModule;
}

let _refreshScannerStats = null;

// Simple state
const state = {
  height: 168,
  weight: 55,
  birthYear: 2002,
  gender: 'female',
  activity: 'medium',
  targetWeight: 55,
  goalType: 'weight', // 'weight' | 'days'
  goalDays: 30,
  memoirStartDate: null, // Memoir start date (for streak days)
  memoir: [], // { date, imageDataUrl, weight, expression, style }[]
  gameCaloriesToday: 0,
  gameCaloriesDate: null, // YYYY-MM-DD used to reset "today"
};
const MEMOIR_KEY = 'fitness_avatar_memoir';
const GAME_CALORIES_KEY = 'fitness_game_calories';
const MEMOIR_GOAL_KEY = 'fitness_memoir_goal';
function loadMemoir() {
  try {
    const raw = localStorage.getItem(MEMOIR_KEY);
    if (raw) state.memoir = JSON.parse(raw);
    const goal = localStorage.getItem(MEMOIR_GOAL_KEY);
    if (goal) {
      const o = JSON.parse(goal);
      state.goalType = o.goalType || 'weight';
      state.goalDays = o.goalDays || 30;
      state.memoirStartDate = o.memoirStartDate || null;
    }
    const gc = localStorage.getItem(GAME_CALORIES_KEY);
    if (gc) {
      const o = JSON.parse(gc);
      const today = new Date().toISOString().slice(0, 10);
      if (o.date === today) state.gameCaloriesToday = o.calories || 0;
      state.gameCaloriesDate = o.date;
    }
  } catch (_) {}
}
function saveMemoir() {
  localStorage.setItem(MEMOIR_KEY, JSON.stringify(state.memoir));
  localStorage.setItem(MEMOIR_GOAL_KEY, JSON.stringify({
    goalType: state.goalType,
    goalDays: state.goalDays,
    memoirStartDate: state.memoirStartDate,
  }));
}
function saveGameCalories() {
  const date = new Date().toISOString().slice(0, 10);
  localStorage.setItem(GAME_CALORIES_KEY, JSON.stringify({ date, calories: state.gameCaloriesToday }));
}
function updateGameCaloriesBadge() {
  const el = document.getElementById('game-calories-badge');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  if (state.gameCaloriesDate !== today) state.gameCaloriesToday = 0;
  if (state.gameCaloriesToday > 0) {
    el.textContent = '今日游戏 ~' + (typeof state.gameCaloriesToday === 'number' ? state.gameCaloriesToday.toFixed(1) : state.gameCaloriesToday) + ' kcal';
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

// ——— Advanced Interactive Device API ———
const DeviceFeatures = {
  wakeLock: null,
  motionTilt: { x: 0, y: 0 },
  micLevel: 0,

  vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  },

  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch (_) {}
  },

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  },

  async requestFullscreen(el) {
    const target = el || document.documentElement;
    try {
      if (target.requestFullscreen) await target.requestFullscreen();
      else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
      else if (target.msRequestFullscreen) await target.msRequestFullscreen();
      return true;
    } catch (_) { return false; }
  },

  async exitFullscreen() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      else if (document.msExitFullscreen) await document.msExitFullscreen();
      return true;
    } catch (_) { return false; }
  },

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  },

  async initMotion(onTilt, onShake) {
    const addListeners = () => {
      window.addEventListener('devicemotion', (e) => this._handleMotion(e, onTilt, onShake));
      window.addEventListener('deviceorientation', (e) => this._handleOrientation(e, onTilt));
    };
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') return false;
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
          const oPerm = await DeviceOrientationEvent.requestPermission();
          if (oPerm !== 'granted') { addListeners(); return true; }
        }
        addListeners();
        return true;
      } catch (_) { return false; }
    }
    addListeners();
    return true;
  },

  _handleOrientation(e, onTilt) {
    const b = e.beta != null ? e.beta : 0;
    const g = e.gamma != null ? e.gamma : 0;
    this.motionTilt.x = Math.max(-1, Math.min(1, (g || 0) / 45));
    this.motionTilt.y = Math.max(-1, Math.min(1, (b || 0) / 45));
    if (onTilt) onTilt(this.motionTilt.x, this.motionTilt.y);
  },

  _lastAcc: { x: 0, y: 0, z: 0 },
  _lastShake: 0,
  _handleMotion(e, onTilt, onShake) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const x = a.x || 0, y = a.y || 0, z = a.z || 0;
    const dx = x - this._lastAcc.x, dy = y - this._lastAcc.y, dz = z - this._lastAcc.z;
    this._lastAcc = { x, y, z };
    const strength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (onShake && strength > 25 && Date.now() - this._lastShake > 800) {
      this._lastShake = Date.now();
      this.vibrate([60, 40, 60]);
      onShake();
    }
  },

  async initMic(stream, onLevel) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        this.micLevel = sum / data.length / 255;
        if (onLevel) onLevel(this.micLevel);
      };
      setInterval(tick, 100);
      return true;
    } catch (_) { return false; }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) DeviceFeatures.releaseWakeLock();
});

function getCurrentAge() {
  const year = new Date().getFullYear();
  return Math.max(16, Math.min(100, year - state.birthYear));
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function computeBMI(heightCm, weightKg) {
  const h = heightCm / 100;
  if (!h) return 0;
  return weightKg / (h * h);
}

// Rough body fat estimation (simplified)
function estimateBodyFat({ bmi, age, gender }) {
  const sex = gender === 'male' ? 1 : 0;
  const fat = 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4;
  return clamp(fat, 5, 50);
}

function classifyBMI(bmi) {
  if (bmi < 18.5) return { label: '偏瘦 Underweight', color: '#38bdf8' };
  if (bmi < 24) return { label: '正常 Normal', color: '#4ade80' };
  if (bmi < 28) return { label: '偏胖 Overweight', color: '#fbbf24' };
  return { label: '肥胖 Obese', color: '#fb7185' };
}

function createElement(tag, className, children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (children !== undefined) {
    if (Array.isArray(children)) {
      children.forEach((c) => c && el.appendChild(c));
    } else if (children instanceof Node) {
      el.appendChild(children);
    } else {
      el.textContent = String(children);
    }
  }
  return el;
}

// Input Panel
function mountInputPanel(root) {
  const container = createElement('div', 'section-body');

  const heightGroup = renderSliderField({
    label: '身高 Height (cm)',
    min: 140,
    max: 200,
    step: 1,
    get: () => state.height,
    set: (v) => {
      state.height = v;
      notifyUpdate();
    },
    format: (v) => `${v.toFixed(0)} cm`,
  });

  const weightGroup = renderSliderField({
    label: '当前体重 Weight (kg)',
    min: 40,
    max: 110,
    step: 0.5,
    get: () => state.weight,
    set: (v) => {
      state.weight = v;
      if (state.targetWeight > v - 2) {
        state.targetWeight = Math.max(v - 2, 40);
      }
      notifyUpdate();
    },
    format: (v) => `${v.toFixed(1)} kg`,
  });

  const birthYearGroup = renderBirthYearSelect();
  const genderGroup = renderGenderToggle();
  const activityGroup = renderActivityChips();
  const gameGrid = renderGameSelection();

  container.appendChild(heightGroup);
  container.appendChild(weightGroup);
  container.appendChild(birthYearGroup);
  container.appendChild(genderGroup);
  container.appendChild(activityGroup);
  container.appendChild(gameGrid);

  root.innerHTML = '';
  root.appendChild(container);
}

function renderSliderField({ label, min, max, step, get, set, format }) {
  const group = createElement('div', 'field-group');

  const header = createElement('div', 'field-header');
  const labelEl = createElement('div', 'field-label', label);
  const valueEl = createElement('div', 'field-value', format(get()));
  header.appendChild(labelEl);
  header.appendChild(valueEl);

  const input = createElement('input', 'slider');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(get());
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    set(v);
    valueEl.textContent = format(v);
    renderMetricsCards(true);
    renderVisualization(true);
    if (_refreshScannerStats) _refreshScannerStats();
  });

  group.appendChild(header);
  group.appendChild(input);
  return group;
}

function renderBirthYearSelect() {
  const group = createElement('div', 'field-group');
  const header = createElement('div', 'field-header');
  const labelEl = createElement('div', 'field-label', '出生年份 Birth Year');
  const valueEl = createElement('div', 'field-value', `${state.birthYear} · ${getCurrentAge()}岁 Age ${getCurrentAge()}`);
  header.appendChild(labelEl);
  header.appendChild(valueEl);

  const select = createElement('select', 'year-select');
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 80;
  const maxYear = currentYear - 16;
  for (let y = maxYear; y >= minYear; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y}`;
    if (y === state.birthYear) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    state.birthYear = parseInt(select.value, 10);
    valueEl.textContent = `${state.birthYear} · ${getCurrentAge()}岁 Age ${getCurrentAge()}`;
    notifyUpdate();
  });

  group.appendChild(header);
  group.appendChild(select);
  return group;
}

function renderGenderToggle() {
  const group = createElement('div', 'field-group');
  const header = createElement('div', 'field-header');
  header.appendChild(createElement('div', 'field-label', '性别 Sex'));
  group.appendChild(header);

  const pill = createElement('div', 'pill-toggle');
  const male = createElement('div', 'pill-option');
  male.innerHTML = '<span class="pill-icon">♂</span> 男 Male';
  const female = createElement('div', 'pill-option');
  female.innerHTML = '<span class="pill-icon">♀</span> 女 Female';

  function sync() {
    male.classList.toggle('is-active', state.gender === 'male');
    female.classList.toggle('is-active', state.gender === 'female');
  }

  male.addEventListener('click', () => {
    state.gender = 'male';
    sync();
    notifyUpdate();
  });
  female.addEventListener('click', () => {
    state.gender = 'female';
    sync();
    notifyUpdate();
  });

  sync();
  pill.appendChild(male);
  pill.appendChild(female);
  group.appendChild(pill);
  return group;
}

function renderActivityChips() {
  const group = createElement('div', 'field-group');
  const header = createElement('div', 'field-header');
  header.appendChild(createElement('div', 'field-label', '活动量 Activity Level'));
  group.appendChild(header);

  const wrapper = createElement('div', 'activity-options');
  const options = [
    { key: 'low', label: '久坐 Sedentary', icon: '🛋️' },
    { key: 'medium', label: '适中 Moderate', icon: '🏃' },
    { key: 'high', label: '活跃 Active', icon: '🔥' },
  ];

  const chips = [];
  options.forEach((opt) => {
    const chip = createElement('button', 'activity-chip');
    chip.innerHTML = `<span class="activity-icon">${opt.icon}</span>${opt.label}`;
    chip.type = 'button';
    chip.dataset.key = opt.key;
    chip.addEventListener('click', () => {
      state.activity = opt.key;
      chips.forEach(c => c.classList.toggle('is-active', c.dataset.key === opt.key));
      notifyUpdate();
    });
    chip.classList.toggle('is-active', state.activity === opt.key);
    chips.push(chip);
    wrapper.appendChild(chip);
  });

  group.appendChild(wrapper);
  return group;
}

// --- Mini-Game Selection Grid ---
const MINI_GAMES = [
  {
    id: 'fruit-slash',
    icon: '🍉',
    name: '水果切切乐 Fruit Slash',
    desc: '挥动双手切水果 Slice fruits with hand movements',
    tag: '手部追踪 Hand Tracking',
    tagColor: '#4ade80',
    available: true,
    howToPlay: '挥动你的手在摄像头前切水果，连击得分更高！支持单手/双手操作，注意提示切换左右手获取额外加分。\nWave your hands in front of the camera to slice fruits. Combos score higher! Single/dual hand supported; follow hand prompts for bonus points.',
  },
  {
    id: 'punch-trainer',
    icon: '🥊',
    name: '拳击训练 Punch Trainer',
    desc: '用拳头击打目标 Hit targets with your fists',
    tag: '手部追踪 Hand Tracking',
    tagColor: '#fb923c',
    available: true,
    howToPlay: '屏幕上会出现目标圆圈，用拳头对准并击打它们。速度越快得分越高，锻炼反应力和手臂力量！\nTargets appear on screen — punch them with your fists! Faster hits score more. Great for reflexes and arm strength!',
  },
  {
    id: 'dodge-master',
    icon: '⚡',
    name: '闪避大师 Dodge Master',
    desc: '移动身体躲避障碍 Dodge obstacles with your body',
    tag: '身体追踪 Body Tracking',
    tagColor: '#a78bfa',
    available: true,
    howToPlay: '障碍物从屏幕上方掉落，移动你的身体来躲避！碰撞会扣血量，血量归零游戏结束。锻炼全身灵活性！\nObstacles fall from above — move your body to dodge! Collisions cost HP; zero HP ends the game. Great for agility!',
  },
  {
    id: 'pose-challenge',
    icon: '🧘',
    name: '姿势挑战 Pose Challenge',
    desc: '匹配屏幕上的健身姿势 Match fitness poses on screen',
    tag: '身体追踪 Body Tracking',
    tagColor: '#38bdf8',
    available: true,
    howToPlay: '屏幕会显示目标姿势（如T-Pose、举手、深蹲等），你需要模仿并保持姿势直到进度条填满。越快匹配得分越高！\nTarget poses appear (T-Pose, Arms Up, Squat, etc.) — match and hold until the bar fills. Faster matches score more!',
  },
];

function renderGameSelection() {
  const wrap = createElement('div', 'game-selection');
  const header = createElement('div', 'game-selection-header');
  header.appendChild(createElement('span', 'game-selection-title', '燃脂小游戏 Fat Burn Mini Games'));
  header.appendChild(createElement('span', 'game-selection-sub', '动起来消耗卡路里 Move your body to burn calories'));
  wrap.appendChild(header);

  const grid = createElement('div', 'game-grid');
  MINI_GAMES.forEach((game) => {
    const card = createElement('div', 'game-card' + (game.available ? '' : ' coming-soon'));
    const iconEl = createElement('div', 'game-card-icon', game.icon);
    const info = createElement('div', 'game-card-info');
    const nameEl = createElement('div', 'game-card-name', game.name);
    const descEl = createElement('div', 'game-card-desc', game.desc);
    const tag = createElement('span', 'game-card-tag', game.available ? game.tag : '即将推出 Coming Soon');
    tag.style.borderColor = game.available ? game.tagColor : 'rgba(148,163,184,0.3)';
    tag.style.color = game.available ? game.tagColor : 'var(--text-muted)';
    info.appendChild(nameEl);
    info.appendChild(descEl);
    info.appendChild(tag);
    card.appendChild(iconEl);
    card.appendChild(info);
    card.style.position = 'relative';
    let hoverTimer = null;
    const tooltip = createElement('div', 'game-card-tooltip');
    tooltip.textContent = game.howToPlay || '';
    card.appendChild(tooltip);
    card.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        tooltip.classList.add('visible');
      }, 3000);
    });
    card.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      tooltip.classList.remove('visible');
    });
    card.addEventListener('click', () => {
      clearTimeout(hoverTimer);
      tooltip.classList.remove('visible');
      if (game.id === 'fruit-slash') openGameModal();
      else if (game.id === 'punch-trainer') openPunchGame();
      else if (game.id === 'dodge-master') openDodgeGame();
      else if (game.id === 'pose-challenge') openPoseGame();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

let _comingSoonTimer = 0;
function showComingSoonToast(name) {
  let toast = document.querySelector('.coming-soon-toast');
  if (!toast) {
    toast = createElement('div', 'coming-soon-toast');
    document.body.appendChild(toast);
  }
  clearTimeout(_comingSoonTimer);
  toast.textContent = `${name} — 即将推出 Coming Soon!`;
  toast.classList.add('visible');
  _comingSoonTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// Metrics (kept for compatibility)
let metricsContainer;

function renderMetricsCards(onlyUpdate) {
  const root = metricsContainer || createElement('div', 'metrics-grid');
  const bmi = computeBMI(state.height, state.weight);
  const fat = estimateBodyFat({ bmi, age: getCurrentAge(), gender: state.gender });
  const bmiClass = classifyBMI(bmi);

  const progress = clamp(((bmi - 15) / (35 - 15)) * 100, 0, 100);
  root.style.setProperty('--progress', String(progress));

  if (!onlyUpdate) {
    root.innerHTML = '';
    const bmiCard = createMetricRingCard({
      label: 'BMI',
      value: bmi.toFixed(1),
      subtitle: bmiClass.label,
      color: bmiClass.color,
    });
    const fatCard = createMetricSmallCard({
      label: '体脂率 Est. Body Fat',
      value: `${fat.toFixed(1)}%`,
      subtitle: '仅为视觉估算 Visual estimate only',
    });
    const categoryCard = createMetricSmallCard({
      label: '体型 Body Type',
      value: bmiClass.label,
      subtitle: '基于BMI Based on BMI',
    });

    root.appendChild(bmiCard);
    const rightCol = createElement('div');
    rightCol.appendChild(fatCard);
    rightCol.appendChild(categoryCard);
    root.appendChild(rightCol);
    metricsContainer = root;
  } else {
    const ringValue = root.querySelector('.metric-ring-value');
    const tag = root.querySelector('.metric-tag');
    const tagDot = tag && tag.querySelector('.metric-tag-dot');
    const fatVal = root.querySelector('[data-metric-fat]');
    const categoryVal = root.querySelector('[data-metric-category]');

    if (ringValue) ringValue.textContent = bmi.toFixed(1);
    if (fatVal) fatVal.textContent = `${fat.toFixed(1)}%`;
    if (categoryVal) categoryVal.textContent = bmiClass.label;
    if (tag) tag.style.borderColor = bmiClass.color;
    if (tagDot) tagDot.style.backgroundColor = bmiClass.color;
  }

  return root;
}

function createMetricRingCard({ label, value, subtitle, color }) {
  const card = createElement('div', 'metric-card');
  const header = createElement('div', 'metric-header');
  header.appendChild(createElement('div', null, label));
  header.appendChild(createElement('div', null, subtitle));

  const ring = createElement('div', 'metric-ring');
  const circle = createElement('div', 'metric-ring-circle');
  const inner = createElement('div', 'metric-ring-inner');
  const labelEl = createElement('div', 'metric-ring-label', label);
  const valueEl = createElement('div', 'metric-ring-value', value);

  const tag = createElement('div', 'metric-tag');
  const dot = createElement('span', 'metric-tag-dot');
  dot.style.backgroundColor = color;
  tag.style.borderColor = color;
  tag.appendChild(dot);
  tag.appendChild(createElement('span', null, subtitle));

  inner.appendChild(labelEl);
  inner.appendChild(valueEl);
  ring.appendChild(circle);
  ring.appendChild(inner);
  card.appendChild(header);
  card.appendChild(ring);
  card.appendChild(tag);
  return card;
}

function createMetricSmallCard({ label, value, subtitle }) {
  const card = createElement('div', 'metric-card');
  const header = createElement('div', 'metric-header');
  header.appendChild(createElement('div', null, label));
  card.appendChild(header);

  const valueEl = createElement('div', 'metric-value', value);
  if (label.includes('Body Fat')) {
    valueEl.dataset.metricFat = 'true';
    valueEl.setAttribute('data-metric-fat', 'true');
  }
  if (label.includes('Body Type')) {
    valueEl.dataset.metricCategory = 'true';
    valueEl.setAttribute('data-metric-category', 'true');
  }

  const sub = createElement('div', 'metric-sub', subtitle);
  card.appendChild(valueEl);
  card.appendChild(sub);
  return card;
}

// Body type presets mapping to body norm (0=slimmest, 1=fullest)
const BODY_PRESETS = { slim: 0.2, standard: 0.5, full: 0.85, bmi: null };

// Expression-to-emoji map (auto-applied during face recognition)
const EXPRESSION_EMOJI = { happy: '😊', calm: '😐', focus: '😤', energy: '🔥' };
const EMOJI_PACK = ['😊', '😐', '😤', '🔥', '❤️', '😂', '🥳', '😎'];

// Avatar generation (optional useEmoji + emojiChar to use emoji as face)
function generateCartoonDataUrl(expression, style, hair, bodyPreset, useEmoji, emojiChar) {
  const size = 200;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const normFromBmi = clamp((computeBMI(state.height, state.weight) - 18) / (30 - 18), 0, 1);
  const norm = bodyPreset && BODY_PRESETS[bodyPreset] != null ? BODY_PRESETS[bodyPreset] : normFromBmi;
  const waist = 0.2 + norm * 0.12;
  const hip = 0.24 + norm * 0.08;
  const cx = size / 2;
  const headR = size * 0.18;
  const top = size * 0.08;
  const bodyH = size * 0.7;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  const styleColors = { simple: '#38bdf8', sport: '#4ade80', casual: '#a78bfa' };
  const outfitColor = styleColors[style] || styleColors.simple;
  ctx.fillStyle = outfitColor;
  ctx.shadowColor = outfitColor;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  const shoulderW = size * 0.28;
  const waistW = size * waist;
  const hipW = size * hip;
  ctx.moveTo(cx - shoulderW, top + headR * 2);
  ctx.quadraticCurveTo(cx - shoulderW, top + bodyH * 0.4, cx - waistW, top + bodyH * 0.55);
  ctx.quadraticCurveTo(cx - hipW, top + bodyH * 0.75, cx - hipW * 0.85, top + bodyH);
  ctx.lineTo(cx + hipW * 0.85, top + bodyH);
  ctx.quadraticCurveTo(cx + hipW, top + bodyH * 0.75, cx + waistW, top + bodyH * 0.55);
  ctx.quadraticCurveTo(cx + shoulderW, top + bodyH * 0.4, cx + shoulderW, top + headR * 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hair (drawn above/around the head)
  const hairColors = { short: '#4a3728', long: '#2c1810', ponytail: '#3d2316', curly: '#5c4033', bald: null };
  const hairColor = hairColors[hair] || hairColors.short;
  if (hairColor) {
    ctx.fillStyle = hairColor;
    ctx.strokeStyle = hairColor;
    ctx.lineWidth = 1.5;
    const headTop = top + headR - headR * 0.3;
    if (hair === 'short') {
      ctx.beginPath();
      ctx.ellipse(cx, headTop - 4, headR * 0.95, headR * 0.4, 0, Math.PI * 0.5, Math.PI * 0.5 + Math.PI);
      ctx.fill();
      ctx.stroke();
    } else if (hair === 'long') {
      ctx.beginPath();
      ctx.ellipse(cx, headTop - 2, headR * 1.0, headR * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - headR * 0.9, top + headR + 2);
      ctx.quadraticCurveTo(cx - headR, top + bodyH * 0.5, cx - headR * 0.6, top + bodyH * 0.6);
      ctx.lineTo(cx + headR * 0.6, top + bodyH * 0.6);
      ctx.quadraticCurveTo(cx + headR, top + bodyH * 0.5, cx + headR * 0.9, top + headR + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (hair === 'ponytail') {
      ctx.beginPath();
      ctx.ellipse(cx, headTop - 4, headR * 0.9, headR * 0.35, 0, Math.PI * 0.4, Math.PI * 0.6 + Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + headR * 0.85, top + headR - 8, headR * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (hair === 'curly') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const rx = 12 + (i % 3) * 4;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * headR * 0.7, headTop + Math.sin(a) * headR * 0.5, rx, rx * 1.2, a * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  const headCenterY = top + headR;
  if (useEmoji && emojiChar) {
    ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiChar, cx, headCenterY);
  } else {
    const eyeY = headCenterY - 8;
    const mouthY = headCenterY + 12;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (expression === 'happy') {
      ctx.beginPath();
      ctx.arc(cx - 14, eyeY, 4, 0, Math.PI * 2);
      ctx.arc(cx + 14, eyeY, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, mouthY, 10, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else if (expression === 'calm') {
      ctx.beginPath();
      ctx.moveTo(cx - 18, eyeY);
      ctx.lineTo(cx - 10, eyeY);
      ctx.moveTo(cx + 10, eyeY);
      ctx.lineTo(cx + 18, eyeY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8, mouthY);
      ctx.lineTo(cx + 8, mouthY);
      ctx.stroke();
    } else if (expression === 'focus') {
      ctx.beginPath();
      ctx.arc(cx - 14, eyeY, 5, 0, Math.PI * 2);
      ctx.arc(cx + 14, eyeY, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, mouthY + 4);
      ctx.lineTo(cx + 6, mouthY + 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx - 14, eyeY - 2, 4, 0, Math.PI * 2);
      ctx.arc(cx + 14, eyeY - 2, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, mouthY, 8, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/png');
}

// Camera Recognition Modal (dedicated popup for full-body / half-body)
function openCameraModal(onCapture) {
  const overlay = createElement('div', 'cam-modal-overlay');
  const modal = createElement('div', 'cam-modal');

  const header = createElement('div', 'cam-modal-header');
  const title = createElement('h3', 'cam-modal-title', '摄像头识别 Camera Recognition');
  const closeBtn = createElement('button', 'cam-modal-close', '×');
  closeBtn.type = 'button';
  header.appendChild(title);
  header.appendChild(closeBtn);

  const modeRow = createElement('div', 'cam-modal-mode-row');
  let selectedMode = 'half';

  const halfCard = createElement('div', 'cam-mode-card active');
  halfCard.innerHTML = '<span class="cam-mode-icon">🤳</span><span class="cam-mode-label">半身 Half Body</span><span class="cam-mode-desc">仅上半身 · 用于生成形象 Upper body only · For avatar creation</span>';
  const fullCard = createElement('div', 'cam-mode-card');
  fullCard.innerHTML = '<span class="cam-mode-icon">🧍</span><span class="cam-mode-label">全身 Full Body</span><span class="cam-mode-desc">从头到脚 · 体脂/体型分析必需 Head to toe · Required for body fat & shape analysis</span>';
  modeRow.appendChild(halfCard);
  modeRow.appendChild(fullCard);

  const body = createElement('div', 'cam-modal-body');
  const placeholder = createElement('div', 'cam-modal-placeholder');
  placeholder.innerHTML = '<span class="cam-ph-icon">📸</span>点击「启动摄像头」开始 Click "Start Camera" to begin';
  body.appendChild(placeholder);

  const guideOverlay = createElement('div', 'cam-modal-guide');
  const guideSil = createElement('div', 'cam-guide-silhouette half-body');
  const guideLabel = createElement('div', 'cam-guide-label', '请将上半身对齐到框内 Align your upper body within the frame');
  guideSil.appendChild(guideLabel);
  guideOverlay.appendChild(guideSil);
  guideOverlay.style.display = 'none';
  body.appendChild(guideOverlay);

  const notice = createElement('div', 'cam-modal-notice', '请将自己摆在画面中 Position yourself in the frame');

  const footer = createElement('div', 'cam-modal-footer');
  const cancelBtn = createElement('button', 'cam-modal-cancel', '取消 Cancel');
  cancelBtn.type = 'button';
  const startBtn = createElement('button', 'primary-btn', '启动摄像头 Start Camera');
  startBtn.type = 'button';
  const captureGroup = createElement('div', 'cam-capture-group');
  captureGroup.style.display = 'none';
  const cap5Btn = createElement('button', 'cam-capture-btn', '5秒拍照 5s Capture');
  cap5Btn.type = 'button';
  cap5Btn.dataset.seconds = '5';
  const cap10Btn = createElement('button', 'cam-capture-btn', '10秒拍照 10s Capture');
  cap10Btn.type = 'button';
  cap10Btn.dataset.seconds = '10';
  captureGroup.appendChild(cap5Btn);
  captureGroup.appendChild(cap10Btn);
  footer.appendChild(cancelBtn);
  footer.appendChild(startBtn);
  footer.appendChild(captureGroup);

  modal.appendChild(header);
  modal.appendChild(modeRow);
  modal.appendChild(body);
  modal.appendChild(notice);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let camStream = null;
  let videoEl = null;

  function updateMode(mode) {
    selectedMode = mode;
    halfCard.classList.toggle('active', mode === 'half');
    fullCard.classList.toggle('active', mode === 'full');
    guideSil.className = 'cam-guide-silhouette ' + (mode === 'half' ? 'half-body' : 'full-body');
    guideLabel.textContent = mode === 'half'
      ? '请将上半身对齐到框内 Align your upper body within the frame'
      : '请退后，露出全身 Stand back so your full body is visible';
    notice.textContent = mode === 'full'
      ? '全身模式 — 体脂/体型分析必需 Full body mode — required for body fat & shape analysis'
      : '半身模式 — 用于生成形象和穿搭识别 Half body mode — for avatar creation & outfit recognition';
    notice.className = 'cam-modal-notice' + (mode === 'full' ? ' warn' : '');
  }

  halfCard.addEventListener('click', () => updateMode('half'));
  fullCard.addEventListener('click', () => updateMode('full'));

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = '启动中... Starting...';
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.className = 'cam-modal-video';
      videoEl.srcObject = camStream;
      body.replaceChildren(videoEl, guideOverlay);
      guideOverlay.style.display = 'flex';
      try { await videoEl.play(); } catch (_) {}
      startBtn.style.display = 'none';
      captureGroup.style.display = 'flex';
    } catch (e) {
      notice.textContent = '摄像头失败 Camera failed: ' + (e.message || 'Check permissions');
      notice.className = 'cam-modal-notice warn';
      startBtn.disabled = false;
      startBtn.textContent = '启动摄像头 Start Camera';
    }
  });

  function showCaptureResult() {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = videoEl.videoWidth || 640;
    snapCanvas.height = videoEl.videoHeight || 480;
    const snapCtx = snapCanvas.getContext('2d');
    snapCtx.save();
    snapCtx.translate(snapCanvas.width, 0);
    snapCtx.scale(-1, 1);
    snapCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);
    snapCtx.restore();
    const photoDataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);

    title.textContent = '生成你的形象 Generate Your Avatar';
    modeRow.style.display = 'none';
    notice.style.display = 'none';
    footer.innerHTML = '';

    const resultWrap = createElement('div', 'cam-result-wrap');

    const photoSide = createElement('div', 'cam-result-photo');
    const photoImg = document.createElement('img');
    photoImg.src = photoDataUrl;
    photoImg.className = 'cam-result-img';
    const photoLabel = createElement('div', 'cam-result-label', '拍摄照片 Captured Photo');
    photoSide.appendChild(photoImg);
    photoSide.appendChild(photoLabel);

    const avatarSide = createElement('div', 'cam-result-avatar');
    const avatarImg = document.createElement('img');
    let chosenEmoji = null;
    function regenerateAvatar() {
      const dataUrl = generateCartoonDataUrl('happy', 'simple', 'short', undefined, !!chosenEmoji, chosenEmoji || '😊');
      avatarImg.src = dataUrl;
    }
    regenerateAvatar();
    avatarImg.className = 'cam-result-avatar-img';
    const avatarLabel = createElement('div', 'cam-result-label', '你的形象 Your Avatar');
    avatarSide.appendChild(avatarImg);
    avatarSide.appendChild(avatarLabel);

    resultWrap.appendChild(photoSide);
    resultWrap.appendChild(avatarSide);

    const emojiSection = createElement('div', 'cam-result-emoji-section');
    const emojiTitle = createElement('div', 'cam-result-emoji-title', '选择表情 Choose Face Emoji');
    emojiSection.appendChild(emojiTitle);
    const emojiGrid = createElement('div', 'cam-result-emoji-grid');
    const allEmojis = ['😊', '😐', '😤', '🔥', '❤️', '😂', '🥳', '😎', '🤩', '😇', '🥰', '💪', '🧘', '🏃', '🤔', '😴'];
    allEmojis.forEach((em) => {
      const btn = createElement('button', 'cam-emoji-btn', em);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        emojiGrid.querySelectorAll('.cam-emoji-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chosenEmoji = em;
        regenerateAvatar();
      });
      emojiGrid.appendChild(btn);
    });
    const noneBtn = createElement('button', 'cam-emoji-btn cam-emoji-none', '无 None');
    noneBtn.type = 'button';
    noneBtn.classList.add('active');
    noneBtn.addEventListener('click', () => {
      emojiGrid.querySelectorAll('.cam-emoji-btn').forEach(b => b.classList.remove('active'));
      noneBtn.classList.add('active');
      chosenEmoji = null;
      regenerateAvatar();
    });
    emojiGrid.insertBefore(noneBtn, emojiGrid.firstChild);
    emojiSection.appendChild(emojiGrid);

    body.classList.add('result-mode');
    body.replaceChildren(resultWrap, emojiSection);
    guideOverlay.style.display = 'none';

    const retakeBtn = createElement('button', 'cam-modal-cancel', '重拍 Retake');
    retakeBtn.type = 'button';
    const confirmBtn = createElement('button', 'primary-btn', '保存并继续 Save & Continue');
    confirmBtn.type = 'button';
    footer.appendChild(retakeBtn);
    footer.appendChild(confirmBtn);

    retakeBtn.addEventListener('click', () => {
      title.textContent = '摄像头识别 Camera Recognition';
      modeRow.style.display = '';
      notice.style.display = '';
      body.classList.remove('result-mode');
      body.replaceChildren(videoEl, guideOverlay);
      guideOverlay.style.display = 'flex';
      footer.innerHTML = '';
      footer.appendChild(cancelBtn);
      captureGroup.style.display = 'flex';
      footer.appendChild(captureGroup);
      countdownActive = false;
      cap5Btn.disabled = false;
      cap10Btn.disabled = false;
    });

    confirmBtn.addEventListener('click', () => {
      if (onCapture) onCapture({
        mode: selectedMode,
        stream: camStream,
        videoEl,
        avatarDataUrl: avatarImg.src,
        photoDataUrl,
        emoji: chosenEmoji
      });
      overlay.remove();
    });
  }

  let countdownActive = false;
  function startCountdown(seconds) {
    if (countdownActive) return;
    countdownActive = true;
    cap5Btn.disabled = true;
    cap10Btn.disabled = true;

    const countEl = document.createElement('div');
    countEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none';
    const numEl = document.createElement('div');
    numEl.style.cssText = 'font-size:96px;font-weight:800;color:#fff;text-shadow:0 0 40px rgba(56,189,248,0.6),0 4px 20px rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s,transform 0.2s;transform:scale(1.5)';
    countEl.appendChild(numEl);

    const progRing = document.createElement('svg');
    progRing.setAttribute('width', '180');
    progRing.setAttribute('height', '180');
    progRing.style.cssText = 'position:absolute;pointer-events:none';
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const r = 80, circ = 2 * Math.PI * r;
    circle.setAttribute('cx', '90');
    circle.setAttribute('cy', '90');
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'rgba(56,189,248,0.5)');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('stroke-dasharray', String(circ));
    circle.setAttribute('stroke-dashoffset', '0');
    circle.setAttribute('stroke-linecap', 'round');
    circle.style.transition = 'stroke-dashoffset 1s linear';
    circle.style.transform = 'rotate(-90deg)';
    circle.style.transformOrigin = '50% 50%';
    progRing.appendChild(circle);
    countEl.appendChild(progRing);
    body.appendChild(countEl);

    let sec = seconds;
    const total = seconds;
    function tick() {
      if (sec <= 0) {
        countEl.remove();
        const flashEl = document.createElement('div');
        flashEl.style.cssText = 'position:absolute;inset:0;background:#fff;z-index:10;opacity:0.8;transition:opacity 0.3s';
        body.appendChild(flashEl);
        requestAnimationFrame(() => { flashEl.style.opacity = '0'; });
        setTimeout(() => { flashEl.remove(); }, 350);
        showCaptureResult();
        return;
      }
      numEl.textContent = sec;
      numEl.style.opacity = '0';
      numEl.style.transform = 'scale(1.5)';
      requestAnimationFrame(() => {
        numEl.style.opacity = '1';
        numEl.style.transform = 'scale(1)';
        circle.setAttribute('stroke-dashoffset', String(circ * (1 - (sec - 1) / total)));
      });
      setTimeout(() => { numEl.style.opacity = '0'; }, 700);
      sec--;
      setTimeout(tick, 1000);
    }
    tick();
  }
  cap5Btn.addEventListener('click', () => startCountdown(5));
  cap10Btn.addEventListener('click', () => startCountdown(10));

  function cleanup() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    overlay.remove();
  }

  closeBtn.addEventListener('click', cleanup);
  cancelBtn.addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
}

// Scanner panel: scan / upload + preset selection + avatar generation + memoir
function mountScannerPanel(root) {
  const shell = createElement('div', 'scanner-shell');

  const placeholder = createElement(
    'div',
    'camera-placeholder',
    '选择「启动摄像头」或「上传照片」生成你的个人形象。\nChoose "Enable Camera" or "Upload Photo" to generate your avatar.'
  );
  const contentArea = createElement('div', 'scanner-content');
  contentArea.appendChild(placeholder);
  shell.appendChild(contentArea);

  const overlay = createElement('div', 'scanner-overlay');
  const hud = createElement('div', 'scanner-hud');
  const line = createElement('div', 'scanner-line');
  const badge = createElement('div', 'scanner-badge', '体态扫描 Body Scan');
  const status = createElement('div', 'scanner-status', '待机 Standby');
  overlay.appendChild(hud);
  overlay.appendChild(line);
  overlay.appendChild(badge);
  overlay.appendChild(status);

  shell.appendChild(overlay);

  const controls = createElement('div', 'scanner-controls');

  const sourceRow = createElement('div', 'source-row');
  const btnCamera = createElement('button', 'primary-btn source-btn', '启动摄像头 Enable Camera');
  btnCamera.type = 'button';
  const btnUpload = createElement('button', 'primary-btn source-btn secondary', '上传照片 Upload Photo');
  btnUpload.type = 'button';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'upload-input';
  fileInput.style.display = 'none';
  sourceRow.appendChild(btnCamera);
  sourceRow.appendChild(btnUpload);
  sourceRow.appendChild(fileInput);

  const memoirBtn = createElement('button', 'memoir-btn', '形象画廊·回忆录 Avatar Gallery · Memoir');
  memoirBtn.type = 'button';

  let stream;
  let videoEl;
  let uploadedImgUrl = null;

  // --- Today's Body Stats Card ---
  const statsCard = createElement('div', 'scanner-stats-card');
  function refreshScannerStats() {
    const bmi = computeBMI(state.height, state.weight);
    const cls = classifyBMI(bmi);
    const fat = estimateBodyFat({ bmi, age: getCurrentAge(), gender: state.gender });
    const gap = state.targetWeight - state.weight;
    const cal = state.gameCaloriesToday || 0;
    statsCard.innerHTML = `
      <div class="sstat-row">
        <div class="sstat-item">
          <span class="sstat-label">BMI 体质指数</span>
          <span class="sstat-value">${bmi.toFixed(1)}</span>
          <span class="sstat-badge" style="background:${cls.color}22;color:${cls.color}">${cls.label}</span>
        </div>
        <div class="sstat-item">
          <span class="sstat-label">体脂率 Body Fat</span>
          <span class="sstat-value">${fat.toFixed(1)}%</span>
          <div class="sstat-bar"><div class="sstat-bar-fill" style="width:${clamp(fat, 5, 50)}%;background:${fat < 20 ? '#4ade80' : fat < 30 ? '#fbbf24' : '#fb7185'}"></div></div>
        </div>
      </div>
      <div class="sstat-row">
        <div class="sstat-item">
          <span class="sstat-label">目标差距 Target Gap</span>
          <span class="sstat-value ${gap < 0 ? 'neg' : 'pos'}">${gap > 0 ? '+' : ''}${gap.toFixed(1)} kg</span>
        </div>
        <div class="sstat-item">
          <span class="sstat-label">游戏消耗 Game Calories</span>
          <span class="sstat-value cal">${cal > 0 ? cal.toFixed(1) + ' kcal' : '—'}</span>
        </div>
      </div>`;
  }
  refreshScannerStats();
  _refreshScannerStats = refreshScannerStats;

  // --- Scan Tips Carousel ---
  const SCAN_TIPS = [
    '💡 距摄像头1.5米以获得最佳全身扫描 Stand 1.5m from camera for best full-body scan',
    '👕 穿贴身衣物以提高体型检测准确度 Wear fitted clothing for more accurate body shape detection',
    '☀️ 良好光线可提高AI识别精度 Good lighting improves AI recognition accuracy',
    '📏 使用全身模式进行体脂/体型分析 Use full-body mode for body fat & shape analysis',
    '🍉 试试水果切切乐燃烧额外卡路里！Try the Fruit Slash game to burn extra calories!',
    '📸 每日保存扫描记录追踪你的进步 Save daily scans to track your progress over time',
    '🧘 坚持每日追踪效果更好 Consistent daily tracking leads to better results',
    '🏃 扫描配合运动，打造完整健身旅程 Pair scanning with exercise for a complete fitness journey',
  ];
  const tipsCarousel = createElement('div', 'scanner-tips-carousel');
  const tipText = createElement('div', 'scanner-tip-text', SCAN_TIPS[0]);
  tipsCarousel.appendChild(tipText);
  let tipIdx = 0;
  let tipInterval = setInterval(() => {
    tipIdx = (tipIdx + 1) % SCAN_TIPS.length;
    tipText.style.opacity = '0';
    setTimeout(() => {
      tipText.textContent = SCAN_TIPS[tipIdx];
      tipText.style.opacity = '1';
    }, 300);
  }, 6000);

  // --- Activity Summary Row ---
  const activityRow = createElement('div', 'scanner-activity-row');
  function refreshActivityRow() {
    loadMemoir();
    const total = state.memoir.length;
    const lastEntry = state.memoir[0];
    const lastDate = lastEntry ? lastEntry.date : null;
    let streak = 0;
    if (total > 0) {
      const dates = [...new Set(state.memoir.map(e => e.date))].sort().reverse();
      const today = new Date();
      for (let i = 0; i < dates.length; i++) {
        const d = new Date(dates[i]);
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        if (d.toISOString().slice(0, 10) === expected.toISOString().slice(0, 10)) {
          streak++;
        } else break;
      }
    }
    activityRow.innerHTML = `
      <div class="sact-chip"><span class="sact-icon">🔥</span><span class="sact-num">${streak}</span><span class="sact-label">连续天数 Day Streak</span></div>
      <div class="sact-chip"><span class="sact-icon">🖼️</span><span class="sact-num">${total}</span><span class="sact-label">形象 Avatars</span></div>
      <div class="sact-chip"><span class="sact-icon">📅</span><span class="sact-num">${lastDate || '—'}</span><span class="sact-label">上次扫描 Last Scan</span></div>`;
  }
  refreshActivityRow();

  // --- Upload Photo: auto-generate avatar inline ---
  const uploadPreview = createElement('div', 'scanner-upload-preview');
  uploadPreview.style.display = 'none';
  const uploadAvatarImg = document.createElement('img');
  uploadAvatarImg.className = 'scanner-upload-avatar-img';
  const uploadSaveBtn = createElement('button', 'primary-btn scanner-upload-save', '保存到回忆录 Save to Memoir');
  uploadSaveBtn.type = 'button';
  uploadPreview.appendChild(uploadAvatarImg);
  uploadPreview.appendChild(uploadSaveBtn);
  let uploadAvatarDataUrl = null;

  uploadSaveBtn.addEventListener('click', () => {
    if (!uploadAvatarDataUrl) return;
    const date = new Date().toISOString().slice(0, 10);
    state.memoir.unshift({
      date,
      imageDataUrl: uploadAvatarDataUrl,
      weight: state.weight,
      expression: 'happy',
      style: 'simple',
      hair: 'short',
    });
    if (!state.memoirStartDate) state.memoirStartDate = date;
    saveMemoir();
    uploadPreview.style.display = 'none';
    uploadAvatarDataUrl = null;
    refreshActivityRow();
    DeviceFeatures.vibrate([80, 40, 80]);
  });

  memoirBtn.addEventListener('click', openMemoirModal);

  const btnFullscreen = document.getElementById('btn-fullscreen');
  const scannerSection = root.closest('.scanner-panel');
  if (btnFullscreen && scannerSection) {
    btnFullscreen.addEventListener('click', async () => {
      if (DeviceFeatures.isFullscreen()) {
        await DeviceFeatures.exitFullscreen();
        btnFullscreen.textContent = '⛶';
        btnFullscreen.title = '全屏 Fullscreen';
      } else {
        const ok = await DeviceFeatures.requestFullscreen(scannerSection);
        if (ok) {
          btnFullscreen.textContent = '✕';
          btnFullscreen.title = '退出全屏 Exit Fullscreen';
        }
      }
    });
  }

  // Motion sensor and mic level removed (emoji follower no longer in this panel)

  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (uploadedImgUrl) URL.revokeObjectURL(uploadedImgUrl);
    uploadedImgUrl = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.src = uploadedImgUrl;
    img.alt = 'Upload Preview';
    img.className = 'scanner-upload-img';
    contentArea.replaceChildren(img);
    status.textContent = '照片已上传 · 体脂分析请使用全身照 Photo uploaded · For body fat analysis, use a full-body photo';
    fileInput.value = '';
    DeviceFeatures.requestWakeLock();
    uploadAvatarDataUrl = generateCartoonDataUrl('happy', 'simple', 'short', undefined, false, '😊');
    uploadAvatarImg.src = uploadAvatarDataUrl;
    uploadPreview.style.display = 'flex';
  });

  btnCamera.addEventListener('click', () => {
    if (stream) return;
    openCameraModal(({ mode, stream: camStream, videoEl: camVideo, avatarDataUrl, emoji }) => {
      stream = camStream;
      videoEl = camVideo;
      videoEl.className = '';
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      contentArea.replaceChildren(videoEl);
      DeviceFeatures.requestWakeLock();
      status.textContent = mode === 'full'
        ? '全身模式 · AI体态扫描中 Full body mode · AI body scan active'
        : '半身模式 · 摄像头就绪 Half body mode · Camera ready';
      if (avatarDataUrl) {
        const date = new Date().toISOString().slice(0, 10);
        state.memoir.unshift({
          date,
          imageDataUrl: avatarDataUrl,
          weight: state.weight,
          expression: 'happy',
          style: 'simple',
          hair: 'short',
          emojiChar: emoji,
        });
        if (!state.memoirStartDate) state.memoirStartDate = date;
        saveMemoir();
        refreshActivityRow();
      }
      trackingRow.classList.add('visible');
      loadTrackingModule().then(async (tk) => {
        await tk.initModels((msg) => { status.textContent = msg; });
        tk.createOverlay(contentArea);
        tk.startTracking(videoEl);
        status.textContent = '追踪中 · AI面部/手部/身体检测已激活 Tracking · AI face/hand/body detection active';
      }).catch((err) => {
        console.error('Tracking init failed:', err);
        status.textContent = '摄像头正常 · AI追踪失败 Camera OK · AI tracking failed: ' + err.message;
      });
    });
  });

  // AI tracking toggles
  const trackingRow = createElement('div', 'tracking-row');
  const trackInfo = [
    { key: 'face',  label: '面部 Face', color: '#00ffc8' },
    { key: 'hands', label: '手部 Hands', color: '#ff6644' },
    { key: 'pose',  label: '身体 Body', color: '#ffdd00' },
  ];
  trackInfo.forEach(({ key, label, color }) => {
    const btn = createElement('button', 'track-toggle active', '');
    btn.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'track-dot';
    dot.style.background = color;
    dot.style.boxShadow = '0 0 6px ' + color;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(label));
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const isOn = btn.classList.contains('active');
      dot.style.opacity = isOn ? '1' : '0.25';
      dot.style.boxShadow = isOn ? '0 0 6px ' + color : 'none';
      if (trackingModule) trackingModule.setOptions({ [key]: isOn });
    });
    trackingRow.appendChild(btn);
  });

  controls.appendChild(sourceRow);
  controls.appendChild(trackingRow);
  controls.appendChild(statsCard);
  controls.appendChild(tipsCarousel);
  controls.appendChild(activityRow);
  controls.appendChild(uploadPreview);
  controls.appendChild(memoirBtn);

  const container = createElement('div', 'section-body');
  container.appendChild(shell);
  container.appendChild(controls);

  root.innerHTML = '';
  root.appendChild(container);
}

// Memoir modal: goal settings + daily avatar gallery
function openMemoirModal() {
  loadMemoir();
  const wrap = createElement('div', 'memoir-modal-wrap');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Avatar Memoir');

  const back = createElement('div', 'memoir-modal-backdrop');
  const panel = createElement('div', 'memoir-modal-panel');

  const header = createElement('div', 'memoir-modal-header');
  const title = createElement('h2', 'memoir-modal-title', '形象画廊·回忆录 Avatar Gallery · Memoir');
  const closeBtn = createElement('button', 'memoir-close-btn', '×');
  closeBtn.type = 'button';
  header.appendChild(title);
  header.appendChild(closeBtn);

  const goalSection = createElement('div', 'memoir-goal-section');
  const goalLabel = createElement('div', 'memoir-goal-label', '目标 Goals');
  const goalTabs = createElement('div', 'memoir-goal-tabs');
  const weightTab = createElement('button', 'memoir-tab', '目标体重 Target Weight');
  weightTab.type = 'button';
  const daysTab = createElement('button', 'memoir-tab', '连续天数 Streak Days');
  daysTab.type = 'button';
  if (state.goalType === 'weight') weightTab.classList.add('active');
  else daysTab.classList.add('active');
  goalTabs.appendChild(weightTab);
  goalTabs.appendChild(daysTab);

  const goalValue = createElement('div', 'memoir-goal-value');
  const weightGoalText = createElement('span', 'memoir-goal-text');
  weightGoalText.textContent = `目标 ${state.targetWeight} kg · 当前 ${state.weight} kg${state.weight <= state.targetWeight ? ' · 已达成 Achieved' : ` · 还差 ${(state.weight - state.targetWeight).toFixed(1)} kg remaining`}`;
  const daysInputWrap = createElement('div', 'memoir-days-wrap');
  daysInputWrap.style.display = state.goalType === 'days' ? 'block' : 'none';
  const daysInput = document.createElement('input');
  daysInput.type = 'number';
  daysInput.min = '1';
  daysInput.max = '365';
  daysInput.value = String(state.goalDays);
  daysInput.className = 'memoir-days-input';
  const daysLabel = createElement('span', null, '天 days');
  daysInputWrap.appendChild(daysInput);
  daysInputWrap.appendChild(daysLabel);
  const daysProgress = createElement('div', 'memoir-days-progress');
  const startDate = state.memoirStartDate || new Date().toISOString().slice(0, 10);
  const passed = state.memoirStartDate ? Math.floor((Date.now() - new Date(state.memoirStartDate).getTime()) / 86400000) : 0;
  daysProgress.textContent = `${passed}天 / 目标: ${state.goalDays}天 ${passed} days / Goal: ${state.goalDays} days`;
  goalValue.appendChild(weightGoalText);
  goalValue.appendChild(daysInputWrap);
  goalValue.appendChild(daysProgress);
  goalSection.appendChild(goalLabel);
  goalSection.appendChild(goalTabs);
  goalSection.appendChild(goalValue);

  if (state.goalType === 'weight') daysProgress.style.display = 'none';
  else weightGoalText.style.display = 'none';

  weightTab.addEventListener('click', () => {
    state.goalType = 'weight';
    weightTab.classList.add('active');
    daysTab.classList.remove('active');
    daysInputWrap.style.display = 'none';
    daysProgress.style.display = 'none';
    weightGoalText.style.display = 'block';
    weightGoalText.textContent = `目标 ${state.targetWeight} kg · 当前 ${state.weight} kg${state.weight <= state.targetWeight ? ' · 已达成 Achieved' : ` · 还差 ${(state.weight - state.targetWeight).toFixed(1)} kg remaining`}`;
    saveMemoir();
  });
  daysTab.addEventListener('click', () => {
    state.goalType = 'days';
    daysTab.classList.add('active');
    weightTab.classList.remove('active');
    daysInputWrap.style.display = 'block';
    daysProgress.style.display = 'block';
    weightGoalText.style.display = 'none';
    const p = state.memoirStartDate ? Math.floor((Date.now() - new Date(state.memoirStartDate).getTime()) / 86400000) : 0;
    daysProgress.textContent = `${p}天 / 目标: ${state.goalDays}天 ${p} days / Goal: ${state.goalDays} days`;
    saveMemoir();
  });
  daysInput.addEventListener('change', () => {
    state.goalDays = Math.max(1, parseInt(daysInput.value, 10) || 30);
    saveMemoir();
    const p = state.memoirStartDate ? Math.floor((Date.now() - new Date(state.memoirStartDate).getTime()) / 86400000) : 0;
    daysProgress.textContent = `${p}天 / 目标: ${state.goalDays}天 ${p} days / Goal: ${state.goalDays} days`;
  });

  // Weight chart
  const weightChart = document.createElement('canvas');
  weightChart.className = 'memoir-weight-chart';
  function drawWeightChart() {
    const entries = [...state.memoir].reverse().filter(e => e.weight != null);
    const rect = weightChart.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    weightChart.width = rect.width * dpr;
    weightChart.height = rect.height * dpr;
    weightChart.style.width = rect.width + 'px';
    weightChart.style.height = rect.height + 'px';
    const wCtx = weightChart.getContext('2d');
    wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wCtx.clearRect(0, 0, rect.width, rect.height);
    if (entries.length < 2) {
      wCtx.fillStyle = '#9ca3af';
      wCtx.font = '12px system-ui';
      wCtx.textAlign = 'center';
      wCtx.fillText('至少需要2条记录绘制趋势 At least 2 records needed', rect.width / 2, rect.height / 2);
      return;
    }
    const weights = entries.map(e => e.weight);
    const minW = Math.min(...weights) - 1;
    const maxW = Math.max(...weights) + 1;
    const range = maxW - minW || 1;
    const pad = { l: 36, r: 12, t: 14, b: 18 };
    const cw = rect.width - pad.l - pad.r;
    const ch = rect.height - pad.t - pad.b;
    wCtx.strokeStyle = 'rgba(148,163,184,0.15)';
    wCtx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (ch / 3) * i;
      wCtx.beginPath(); wCtx.moveTo(pad.l, y); wCtx.lineTo(pad.l + cw, y); wCtx.stroke();
    }
    const pts = entries.map((e, i) => ({
      x: pad.l + (cw / (entries.length - 1)) * i,
      y: pad.t + ch - ((e.weight - minW) / range) * ch
    }));
    const grad = wCtx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, 'rgba(56,189,248,0.25)');
    grad.addColorStop(1, 'rgba(56,189,248,0.02)');
    wCtx.beginPath();
    wCtx.moveTo(pts[0].x, pad.t + ch);
    pts.forEach(p => wCtx.lineTo(p.x, p.y));
    wCtx.lineTo(pts[pts.length - 1].x, pad.t + ch);
    wCtx.closePath();
    wCtx.fillStyle = grad;
    wCtx.fill();
    wCtx.beginPath();
    pts.forEach((p, i) => i === 0 ? wCtx.moveTo(p.x, p.y) : wCtx.lineTo(p.x, p.y));
    wCtx.strokeStyle = '#38bdf8';
    wCtx.lineWidth = 2;
    wCtx.lineJoin = 'round';
    wCtx.stroke();
    pts.forEach(p => {
      wCtx.beginPath(); wCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      wCtx.fillStyle = '#38bdf8'; wCtx.fill();
      wCtx.strokeStyle = '#0b1120'; wCtx.lineWidth = 1.5; wCtx.stroke();
    });
    wCtx.fillStyle = '#9ca3af'; wCtx.font = '9px system-ui'; wCtx.textAlign = 'right';
    wCtx.fillText(maxW.toFixed(0) + 'kg', pad.l - 4, pad.t + 8);
    wCtx.fillText(minW.toFixed(0) + 'kg', pad.l - 4, pad.t + ch);
    if (state.targetWeight) {
      const ty = pad.t + ch - ((state.targetWeight - minW) / range) * ch;
      if (ty > pad.t && ty < pad.t + ch) {
        wCtx.setLineDash([4, 4]);
        wCtx.strokeStyle = 'rgba(74,222,128,0.5)';
        wCtx.lineWidth = 1;
        wCtx.beginPath(); wCtx.moveTo(pad.l, ty); wCtx.lineTo(pad.l + cw, ty); wCtx.stroke();
        wCtx.setLineDash([]);
        wCtx.fillStyle = '#4ade80'; wCtx.font = '9px system-ui'; wCtx.textAlign = 'left';
        wCtx.fillText('目标Goal', pad.l + cw + 2, ty + 3);
      }
    }
  }

  // Heatmap
  const heatmapWrap = createElement('div', 'memoir-heatmap-wrap');
  const heatmapLabel = createElement('div', 'memoir-heatmap-label', '记录日历 Record Calendar (最近8周 Last 8 Weeks)');
  const heatmap = createElement('div', 'memoir-heatmap');
  const memoirDates = new Set(state.memoir.map(e => e.date));
  const today = new Date();
  for (let i = 55; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const cell = createElement('div', 'memoir-heatmap-cell');
    cell.title = ds;
    if (memoirDates.has(ds)) {
      const count = state.memoir.filter(e => e.date === ds).length;
      cell.classList.add(count > 1 ? 'has-data-strong' : 'has-data');
    }
    heatmap.appendChild(cell);
  }
  heatmapWrap.appendChild(heatmapLabel);
  heatmapWrap.appendChild(heatmap);

  // Goal progress bar
  const progressBar = createElement('div', 'memoir-progress-bar');
  const progressFill = createElement('div', 'memoir-progress-fill');
  if (state.goalType === 'weight') {
    const totalDiff = state.weight - state.targetWeight;
    const pct = totalDiff > 0 ? clamp(((state.weight - state.weight) / totalDiff) * 100, 0, 100) : 100;
    progressFill.style.width = pct + '%';
  } else {
    const p2 = state.memoirStartDate ? Math.floor((Date.now() - new Date(state.memoirStartDate).getTime()) / 86400000) : 0;
    progressFill.style.width = clamp((p2 / state.goalDays) * 100, 0, 100) + '%';
  }
  progressBar.appendChild(progressFill);

  // Timeline
  const listLabel = createElement('div', 'memoir-list-label', '成长时间线 · 点击卡片编辑 Growth Timeline · Click cards to edit');
  const timeline = createElement('div', 'memoir-timeline');

  function renderTimelineItems() {
    timeline.innerHTML = '';
    state.memoir.forEach((entry, index) => {
      const item = createElement('div', 'memoir-timeline-item');
      const dateEl = createElement('div', 'memoir-timeline-date', entry.date);
      const card = createElement('div', 'memoir-card');
      const img = document.createElement('img');
      img.src = entry.imageDataUrl;
      img.alt = entry.date;
      img.className = 'memoir-card-img';
      const info = createElement('div', 'memoir-card-info');
      const meta = createElement('div', 'memoir-card-meta');
      meta.textContent = entry.weight != null ? `${entry.weight} kg` : '—';
      info.appendChild(meta);
      if (index < state.memoir.length - 1 && entry.weight != null) {
        const prev = state.memoir[index + 1];
        if (prev && prev.weight != null) {
          const diff = entry.weight - prev.weight;
          if (diff !== 0) {
            const change = createElement('div', 'memoir-card-weight-change ' + (diff < 0 ? 'loss' : 'gain'));
            change.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg`;
            info.appendChild(change);
          }
        }
      }
      const actions = createElement('div', 'memoir-card-actions');
      const editBtn = createElement('button', 'memoir-card-btn edit-btn', '编辑 Edit');
      editBtn.type = 'button';
      const delBtn = createElement('button', 'memoir-card-btn del-btn', '删除 Delete');
      delBtn.type = 'button';

      delBtn.addEventListener('click', () => {
        state.memoir.splice(index, 1);
        saveMemoir();
        renderTimelineItems();
      });

      editBtn.addEventListener('click', () => {
        const pop = createElement('div', 'memoir-edit-pop');
        const title = createElement('div', 'memoir-edit-title', '编辑外观 Edit Outfit');
        const presetE = createElement('select', 'cartoon-select');
        presetE.innerHTML = '<option value="bmi">按体重 By My Weight</option><option value="slim">纤细 Slim</option><option value="standard">标准 Standard</option><option value="full">丰满 Full</option>';
        presetE.value = entry.bodyPreset || 'bmi';
        const hairE = createElement('select', 'cartoon-select');
        hairE.innerHTML = '<option value="short">短发 Short</option><option value="long">长发 Long</option><option value="ponytail">马尾 Ponytail</option><option value="curly">卷发 Curly</option><option value="bald">光头 Bald</option>';
        hairE.value = entry.hair || 'short';
        const exprE = createElement('select', 'cartoon-select');
        exprE.innerHTML = '<option value="happy">开心 Happy</option><option value="calm">平静 Calm</option><option value="focus">专注 Focus</option><option value="energy">活力 Energy</option>';
        exprE.value = entry.expression || 'happy';
        const styleE = createElement('select', 'cartoon-select');
        styleE.innerHTML = '<option value="simple">简约 Simple</option><option value="sport">运动 Sport</option><option value="casual">休闲 Casual</option>';
        styleE.value = entry.style || 'simple';
        const emojiRow = createElement('div', 'memoir-edit-row emoji-row');
        emojiRow.appendChild(createElement('span', null, '表情包 Emoji Pack'));
        const emojiWrapE = createElement('div', 'emoji-pack-wrap');
        let editSelectedEmoji = entry.emojiChar || null;
        EMOJI_PACK.forEach((emoji) => {
          const eb = createElement('button', 'emoji-pack-btn' + (entry.emojiChar === emoji ? ' active' : ''), emoji);
          eb.type = 'button';
          eb.addEventListener('click', () => {
            editSelectedEmoji = emoji;
            emojiWrapE.querySelectorAll('.emoji-pack-btn').forEach(b => b.classList.remove('active'));
            eb.classList.add('active');
          });
          emojiWrapE.appendChild(eb);
        });
        const drawEB = createElement('button', 'emoji-pack-btn draw-face-btn' + (!entry.emojiChar ? ' active' : ''), '绘制 Draw');
        drawEB.type = 'button';
        drawEB.addEventListener('click', () => {
          editSelectedEmoji = null;
          emojiWrapE.querySelectorAll('.emoji-pack-btn').forEach(b => b.classList.remove('active'));
          drawEB.classList.add('active');
        });
        emojiWrapE.appendChild(drawEB);
        emojiRow.appendChild(emojiWrapE);
        const applyBtn = createElement('button', 'primary-btn', '应用 Apply');
        applyBtn.type = 'button';
        const cancelBtn = createElement('button', 'memoir-card-btn', '取消 Cancel');
        cancelBtn.type = 'button';
        const row0 = createElement('div', 'memoir-edit-row');
        row0.appendChild(createElement('span', null, '体型 Body')); row0.appendChild(presetE);
        const row1 = createElement('div', 'memoir-edit-row');
        row1.appendChild(createElement('span', null, '发型 Hair')); row1.appendChild(hairE);
        const row2 = createElement('div', 'memoir-edit-row');
        row2.appendChild(createElement('span', null, '表情 Expression')); row2.appendChild(exprE);
        const row3 = createElement('div', 'memoir-edit-row');
        row3.appendChild(createElement('span', null, '穿搭 Outfit')); row3.appendChild(styleE);
        const row4 = createElement('div', 'memoir-edit-row');
        row4.appendChild(applyBtn); row4.appendChild(cancelBtn);
        pop.appendChild(title); pop.appendChild(row0); pop.appendChild(row1);
        pop.appendChild(row2); pop.appendChild(row3); pop.appendChild(emojiRow); pop.appendChild(row4);
        panel.appendChild(pop);
        cancelBtn.addEventListener('click', () => pop.remove());
        applyBtn.addEventListener('click', () => {
          const bodyPreset = presetE.value === 'bmi' ? undefined : presetE.value;
          const useEmoji = !!editSelectedEmoji;
          const newUrl = generateCartoonDataUrl(exprE.value, styleE.value, hairE.value, bodyPreset, useEmoji, editSelectedEmoji || undefined);
          state.memoir[index] = { ...entry, imageDataUrl: newUrl, expression: exprE.value, style: styleE.value, hair: hairE.value, bodyPreset: presetE.value, emojiChar: editSelectedEmoji };
          saveMemoir();
          renderTimelineItems();
          pop.remove();
        });
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(img);
      card.appendChild(info);
      card.appendChild(actions);
      item.appendChild(dateEl);
      item.appendChild(card);
      timeline.appendChild(item);
    });

    if (state.memoir.length === 0) {
      const empty = createElement('div', 'memoir-empty', '还没有保存的形象。在扫描面板生成一个并"保存到回忆录"。\nNo avatars saved yet. Generate one in the scan panel and "Save to Memoir".');
      timeline.appendChild(empty);
    }
  }
  renderTimelineItems();

  panel.appendChild(header);
  panel.appendChild(goalSection);
  panel.appendChild(progressBar);
  panel.appendChild(weightChart);
  panel.appendChild(heatmapWrap);
  panel.appendChild(listLabel);
  panel.appendChild(timeline);

  requestAnimationFrame(drawWeightChart);

  back.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  function close() {
    wrap.remove();
  }

  wrap.appendChild(back);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
}

// Body visualization + future simulation
let vizMounted = false;

function mountVisualization(root) {
  const shell = createElement('div', 'visualization-shell');

  const currentPanel = createSilhouettePanel('Current', 'Current Scan', 'current');
  const futurePanel = createSilhouettePanel('Target', 'Target Simulation', 'future');

  shell.appendChild(currentPanel);
  shell.appendChild(futurePanel);

  const futureControls = renderFutureControls();

  const wrapper = createElement('div', 'section-body');
  wrapper.appendChild(shell);
  wrapper.appendChild(futureControls);

  root.innerHTML = '';
  root.appendChild(wrapper);

  vizMounted = true;
  renderVisualization();
}

function createSilhouettePanel(shortLabel, tagText, key) {
  const panel = createElement('div', 'silhouette-panel');
  const header = createElement('div', 'silhouette-header');
  const label = createElement('div', 'silhouette-label', shortLabel);
  const tag = createElement('div', 'silhouette-tag', tagText);
  header.appendChild(label);
  header.appendChild(tag);

  const shell = createElement('div', 'silhouette-canvas-shell');
  const grid = createElement('div', 'silhouette-grid');
  const canvas = document.createElement('canvas');
  canvas.className = 'silhouette-canvas';
  canvas.dataset.role = key;
  shell.appendChild(grid);
  shell.appendChild(canvas);

  panel.appendChild(header);
  panel.appendChild(shell);
  return panel;
}

function renderFutureControls() {
  const container = createElement('div', 'future-controls');
  const header = createElement('div', 'future-header');

  const left = createElement('div', null, '目标体重 Target Weight (kg)');
  const right = createElement(
    'div',
    'future-target',
    () => `目标: ${state.targetWeight.toFixed(1)} kg`
  );

  const rightSpan = createElement(
    'span',
    'future-target',
    `目标: ${state.targetWeight.toFixed(1)} kg`
  );

  header.appendChild(left);
  header.appendChild(rightSpan);

  const slider = createElement('input', 'slider');
  slider.type = 'range';
  slider.min = '40';
  slider.max = String(state.weight - 2);
  slider.step = '0.5';
  slider.value = String(state.targetWeight);

  const changeRow = createElement('div', null);
  const diff = state.targetWeight - state.weight;
  const changeChip = createChangeChip(diff);
  changeRow.appendChild(changeChip);

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    state.targetWeight = v;
    rightSpan.textContent = `Target: ${state.targetWeight.toFixed(1)} kg`;

    const diffNow = state.targetWeight - state.weight;
    const newChip = createChangeChip(diffNow);
    changeRow.innerHTML = '';
    changeRow.appendChild(newChip);

    renderVisualization(true);
    if (_refreshScannerStats) _refreshScannerStats();
  });

  container.appendChild(header);
  container.appendChild(slider);
  container.appendChild(changeRow);
  return container;
}

function createChangeChip(diff) {
  const chip = createElement(
    'div',
    'change-chip ' + (diff < 0 ? 'negative' : diff > 0 ? 'positive' : ''),
    null
  );
  const dot = createElement('span', 'change-dot');
  dot.style.backgroundColor = diff < 0 ? '#f97373' : diff > 0 ? '#4ade80' : '#9ca3af';
  const txt =
    diff === 0 ? '与当前体重相同 Same as current weight' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg 距当前 from current`;
  chip.appendChild(dot);
  chip.appendChild(createElement('span', null, txt));
  return chip;
}

function renderVisualization(skipMount) {
  if (!vizMounted && !skipMount) return;
  const canvases = document.querySelectorAll('canvas.silhouette-canvas');
  canvases.forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Adjust body shape
    const baseBMI = computeBMI(state.height, state.weight);
    const targetBMI =
      canvas.dataset.role === 'current'
        ? baseBMI
        : computeBMI(state.height, state.targetWeight);

    drawSilhouette(ctx, rect.width, rect.height, baseBMI, targetBMI, canvas.dataset.role);
  });
}

let _silBreathPhase = 0;
let _silBreathRAF = 0;
(function startBreathLoop() {
  function tick() {
    _silBreathPhase = (performance.now() % 4000) / 4000;
    _silBreathRAF = requestAnimationFrame(tick);
  }
  tick();
})();

function drawSilhouette(ctx, w, h, baseBMI, targetBMI, role) {
  const REF_W = 160;
  const REF_H = 320;
  const scale = Math.min(w / REF_W, h / REF_H) * 0.88;
  const cx = w / 2;
  const bodyH = REF_H * scale;
  const bodyW = REF_W * scale;
  const top = (h - bodyH) / 2;
  const bottom = top + bodyH;
  const height = bodyH;

  const norm = clamp((targetBMI - 18) / (30 - 18), 0, 1);
  const breathScale = 1 + Math.sin(_silBreathPhase * Math.PI * 2) * 0.008;

  const waistHalf = bodyW * (0.17 + 0.10 * norm) * breathScale;
  const hipHalf = bodyW * (0.21 + 0.07 * norm) * breathScale;
  const shoulderHalf = bodyW * 0.23 * breathScale;
  const headR = height * 0.09;
  const neckW = headR * 0.45;
  const neckH = height * 0.04;
  const armLen = height * 0.38;
  const armW = bodyW * 0.04;

  const isFuture = role === 'future';
  const hue1 = isFuture ? 'rgba(34,211,238,' : 'rgba(56,189,248,';
  const hue2 = isFuture ? 'rgba(99,102,241,' : 'rgba(129,140,248,';

  ctx.save();

  const headCy = top + headR;
  const shoulderY = headCy + headR + neckH;
  const waistY = top + height * 0.48;
  const hipY = top + height * 0.65;

  function bodyPath() {
    ctx.beginPath();
    ctx.moveTo(cx - neckW, headCy + headR);
    ctx.lineTo(cx - neckW, shoulderY - 2);
    ctx.lineTo(cx - shoulderHalf, shoulderY);
    ctx.quadraticCurveTo(cx - shoulderHalf * 1.04, top + height * 0.32, cx - waistHalf, waistY);
    ctx.quadraticCurveTo(cx - hipHalf * 1.05, hipY, cx - hipHalf * 0.88, bottom);
    ctx.lineTo(cx - hipHalf * 0.35, bottom);
    ctx.lineTo(cx - hipHalf * 0.35, bottom - height * 0.005);
    ctx.lineTo(cx + hipHalf * 0.35, bottom - height * 0.005);
    ctx.lineTo(cx + hipHalf * 0.35, bottom);
    ctx.lineTo(cx + hipHalf * 0.88, bottom);
    ctx.quadraticCurveTo(cx + hipHalf * 1.05, hipY, cx + waistHalf, waistY);
    ctx.quadraticCurveTo(cx + shoulderHalf * 1.04, top + height * 0.32, cx + shoulderHalf, shoulderY);
    ctx.lineTo(cx + neckW, shoulderY - 2);
    ctx.lineTo(cx + neckW, headCy + headR);
    ctx.closePath();
  }

  const grad = ctx.createLinearGradient(cx, top, cx, bottom);
  grad.addColorStop(0, hue1 + '0.25)');
  grad.addColorStop(0.4, hue2 + '0.18)');
  grad.addColorStop(1, hue1 + '0.08)');
  bodyPath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = hue1 + '0.5)';
  ctx.shadowBlur = 22;
  ctx.strokeStyle = hue1 + '0.7)';
  ctx.lineWidth = 1.8;
  bodyPath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  const headGrad = ctx.createRadialGradient(cx, headCy - headR * 0.3, 0, cx, headCy, headR);
  headGrad.addColorStop(0, hue1 + '0.2)');
  headGrad.addColorStop(1, hue1 + '0.08)');
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.shadowColor = hue1 + '0.4)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = hue1 + '0.65)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = hue1 + '0.35)';
  ctx.lineWidth = 1;
  const armStartY = shoulderY + 4;
  const armEndY = armStartY + armLen;
  [[-1, cx - shoulderHalf], [1, cx + shoulderHalf]].forEach(([side, sx]) => {
    const elbowX = sx + side * armW * 2.5;
    const elbowY = armStartY + armLen * 0.5;
    const handX = elbowX + side * armW * 0.8;
    const handY = armEndY;
    ctx.beginPath();
    ctx.moveTo(sx, armStartY);
    ctx.quadraticCurveTo(sx + side * armW * 3, elbowY - armLen * 0.08, elbowX, elbowY);
    ctx.quadraticCurveTo(elbowX + side * armW * 0.2, handY - armLen * 0.1, handX, handY);
    ctx.stroke();
  });

  const legSep = hipHalf * 0.35;
  const legBottom = bottom + height * 0.01;
  ctx.strokeStyle = hue1 + '0.3)';
  [[-1, cx - legSep], [1, cx + legSep]].forEach(([side, lx]) => {
    ctx.beginPath();
    ctx.moveTo(lx, bottom);
    ctx.lineTo(lx + side * legSep * 0.15, legBottom);
    ctx.stroke();
  });

  ctx.lineWidth = 0.6;
  ctx.strokeStyle = hue1 + '0.2)';
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(cx - waistHalf * 0.95, waistY);
  ctx.lineTo(cx + waistHalf * 0.95, waistY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (isFuture) {
    const sparkle = Math.sin(_silBreathPhase * Math.PI * 6) * 0.3 + 0.5;
    ctx.fillStyle = `rgba(34,211,238,${sparkle * 0.4})`;
    const pts = [[cx, top + headR * 0.3], [cx - shoulderHalf * 0.6, shoulderY + 10], [cx + shoulderHalf * 0.6, shoulderY + 10]];
    pts.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}

// Notify update (mainly used to re-render across different sections)
function notifyUpdate() {
  renderMetricsCards(true);
  renderVisualization(true);
  if (_refreshScannerStats) _refreshScannerStats();
}

// ——— Fruit Slash Game (hand tracking + camera) ———
const GAME_ITEMS = [
  { emoji: '🍉', bonus: 0.08 },
  { emoji: '🍎', bonus: 0.04 },
  { emoji: '🍋', bonus: 0.03 },
  { emoji: '🥝', bonus: 0.05 },
  { emoji: '🍊', bonus: 0.04 },
  { emoji: '🍇', bonus: 0.06 },
  { emoji: '🥑', bonus: 0.07 },
  { emoji: '🍓', bonus: 0.02 },
];
const GAME_DURATION_MS = 60000;
const GAME_SPAWN_INTERVAL = 40;
const GAME_FALL_SPEED = 2.0;

// MET (Metabolic Equivalent): maps movement intensity to energy expenditure
// Reference: Ainsworth BE et al. "Compendium of Physical Activities" (2011)
// Light arm waving ≈ 2.3 MET, moderate gesturing ≈ 3.5 MET,
// vigorous arm exercise ≈ 5.0 MET, intense whole-body ≈ 6.5 MET
// Only counts active movement; returns 0 when idle so no calories accumulate
function estimateMET(normalizedSpeed, isFullBody) {
  if (normalizedSpeed < 0.005) return 0;
  let met;
  if (normalizedSpeed < 0.03) met = 1.8;
  else if (normalizedSpeed < 0.10) met = 2.5;
  else if (normalizedSpeed < 0.25) met = 3.5;
  else if (normalizedSpeed < 0.50) met = 4.5;
  else met = 5.5;
  if (isFullBody) met += 0.8;
  return met;
}
const GAME_MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1';

function createGameBGM() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const master = ac.createGain();
  master.gain.value = 0.22;
  master.connect(ac.destination);
  const BPM = 130;
  const eighth = 60 / BPM / 2;

  function osc(t, freq, dur, type, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.15);
  }
  function hat(t, vol) {
    const len = Math.floor(ac.sampleRate * 0.04);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), g = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;
    s.buffer = buf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(hp); hp.connect(g); g.connect(master);
    s.start(t);
  }

  const bassLine = [130.81, 130.81, 164.81, 164.81, 146.83, 146.83, 196, 196];
  const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46,
                   523.25, 783.99, 659.25, 523.25, 587.33, 880, 783.99, 587.33];
  let nextT = ac.currentTime + 0.1;
  let bar = 0;
  let running = true;

  function scheduleBar() {
    for (let i = 0; i < 8; i++) {
      const t = nextT + i * eighth;
      if (i % 2 === 0) kick(t);
      if (i % 4 === 2) hat(t, 0.12);
      if (i % 2 === 1) hat(t, 0.05);
      if (i % 4 === 0) osc(t, bassLine[(bar * 2 + Math.floor(i / 4)) % bassLine.length], eighth * 3, 'sawtooth', 0.06);
      const m = melody[(bar * 8 + i) % melody.length];
      if (m && i % 2 === 0) osc(t, m, eighth * 1.4, 'square', 0.035);
    }
    nextT += eighth * 8;
    bar++;
  }
  for (let i = 0; i < 4; i++) scheduleBar();
  const tid = setInterval(() => {
    if (!running) return;
    while (nextT < ac.currentTime + 2) scheduleBar();
  }, 400);
  return {
    stop() {
      running = false;
      clearInterval(tid);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3);
      setTimeout(() => ac.close().catch(() => {}), 500);
    }
  };
}

const ACHIEVEMENTS_KEY = 'fitness_achievements';
const ACHIEVEMENT_DEFS = [
  { id: 'first10', name: '初级切手 Beginner Slicer', desc: '一局切10个水果 Slash 10 fruits in one round', icon: '🍎', check: (s) => s.fruitsHit >= 10 },
  { id: 'combo5', name: '连击大师 Combo Master', desc: '达到5连击 Reach a 5x combo', icon: '🔥', check: (s) => s.maxCombo >= 5 },
  { id: 'both_hands', name: '双手齐下 Dual Wielder', desc: '检测到双手 Both hands detected', icon: '🤲', check: (s) => s.bothHandsUsed },
  { id: 'cal50', name: '挥汗如雨 Sweat It Out', desc: '游戏中共消耗50千卡 Burn 50 kcal total in games', icon: '💦', check: (s) => s.totalCal >= 50 },
  { id: 'first30', name: '水果猎手 Fruit Hunter', desc: '一局切30个水果 Slash 30 fruits in one round', icon: '🏆', check: (s) => s.fruitsHit >= 30 },
  { id: 'combo10', name: '势不可挡 Unstoppable', desc: '达到10连击 Reach a 10x combo', icon: '⚡', check: (s) => s.maxCombo >= 10 },
];

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || []; }
  catch { return []; }
}
function saveAchievement(id) {
  const arr = loadAchievements();
  if (!arr.includes(id)) { arr.push(id); localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(arr)); }
}

function createSliceSFX() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const master = ac.createGain();
    master.gain.value = 0.3;
    master.connect(ac.destination);
    let pitchOffset = 0;
    return {
      slice(combo) {
        const baseFreq = 800 + Math.min(combo, 8) * 80;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(baseFreq, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ac.currentTime + 0.06);
        g.gain.setValueAtTime(0.2, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
        o.connect(g); g.connect(master);
        o.start(ac.currentTime); o.stop(ac.currentTime + 0.12);
      },
      success() {
        [0, 0.08, 0.16].forEach((delay, i) => {
          const freq = [523.25, 659.25, 783.99][i];
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.15, ac.currentTime + delay);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.15);
          o.connect(g); g.connect(master);
          o.start(ac.currentTime + delay); o.stop(ac.currentTime + delay + 0.15);
        });
      },
      close() { ac.close().catch(() => {}); }
    };
  } catch { return { slice() {}, success() {}, close() {} }; }
}

function openGameModal() {
  loadMemoir();
  const wrap = createElement('div', 'game-modal-wrap');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Fruit Slash');

  const panel = createElement('div', 'game-modal-panel');
  const header = createElement('div', 'game-header');
  const title = createElement('h2', 'game-title', '🍉 水果切切乐 Fruit Slash');
  const sub = createElement('p', 'game-sub', '挥动双手切水果 · 燃烧卡路里！Slash fruits with your hands · Burn calories!');
  const scoreRow = createElement('div', 'game-score-row');
  const scoreLabel = createElement('span', 'game-score-label', '本轮 This round');
  const scoreVal = createElement('span', 'game-score-value', '0.0');
  const scoreUnit = createElement('span', 'game-score-unit', ' kcal');
  const timeLeft = createElement('span', 'game-time', '60s');
  scoreRow.appendChild(scoreLabel);
  scoreRow.appendChild(scoreVal);
  scoreRow.appendChild(scoreUnit);
  scoreRow.appendChild(timeLeft);
  const scoreDetail = createElement('div', 'game-score-detail');
  scoreDetail.textContent = '运动 Move 0.0 + 奖励 Bonus 0.0';
  const metIndicator = createElement('div', 'game-met-indicator');
  metIndicator.textContent = 'MET 1.3 · 待机 Standby';
  header.appendChild(title);
  header.appendChild(sub);
  header.appendChild(scoreRow);
  header.appendChild(scoreDetail);
  header.appendChild(metIndicator);

  const toolbar = createElement('div', 'game-toolbar');
  const fullscreenBtn = createElement('button', 'game-tool-btn', '⛶ 全屏 Fullscreen');
  fullscreenBtn.type = 'button';
  const halfBodyBtn = createElement('button', 'game-tool-btn active', '🤲 半身 Half Body');
  halfBodyBtn.type = 'button';
  const fullBodyBtn = createElement('button', 'game-tool-btn', '🧍 全身 Full Body');
  fullBodyBtn.type = 'button';
  toolbar.appendChild(fullscreenBtn);
  toolbar.appendChild(halfBodyBtn);
  toolbar.appendChild(fullBodyBtn);

  const statusBar = createElement('div', 'game-status-bar', '正在启动摄像头... Starting camera...');

  let bodyMode = 'half';
  let isFullscreen = false;

  const gameArea = createElement('div', 'game-area');
  const videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.className = 'game-video';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas-overlay';
  const GAME_W = 640, GAME_H = 480;
  canvas.width = GAME_W;
  canvas.height = GAME_H;
  gameArea.appendChild(videoEl);
  gameArea.appendChild(canvas);

  const footer = createElement('div', 'game-footer');
  const closeBtn = createElement('button', 'game-close-btn', '返回 Back');
  closeBtn.type = 'button';
  footer.appendChild(closeBtn);

  panel.appendChild(header);
  panel.appendChild(toolbar);
  panel.appendChild(statusBar);
  panel.appendChild(gameArea);
  panel.appendChild(footer);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  let items = [];
  let leftSlash = [];
  let rightSlash = [];
  let particles = [];
  let moveCalories = 0;
  let bonusCalories = 0;
  let fruitsHit = 0;
  let startTime = null;
  let animId = null;
  let gameOver = false;
  let stream = null;
  let handL = null;
  let bgm = null;
  let handReady = false;
  let lastVT = -1;
  let handCursors = [];
  let comboCount = 0;
  let comboTimer = 0;
  let maxCombo = 0;
  let bothHandsUsed = false;
  let handMoveAccum = 0;
  let prevLeftPos = null;
  let prevRightPos = null;
  let currentMET = 0;
  let detectedHands = { left: false, right: false };
  let sfx = createSliceSFX();

  const HAND_PROMPTS = [
    { text: '👈 举起左手！Raise your left hand!', icon: '👈', require: 'left' },
    { text: '👉 举起右手！Raise your right hand!', icon: '👉', require: 'right' },
    { text: '🙌 双手齐切！Slash with both hands!', icon: '🙌', require: 'both' },
    { text: '👈 挥动左手！Wave your left hand!', icon: '👈', require: 'left' },
    { text: '👉 挥动右手！Wave your right hand!', icon: '👉', require: 'right' },
    { text: '🙌 挥动双手！Wave both hands!', icon: '🙌', require: 'both' },
  ];
  let currentPrompt = null;
  let promptTimer = 0;
  let promptCooldown = 150;
  let promptFlash = 0;

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      videoEl.srcObject = stream;
      try { await videoEl.play(); } catch (_) {}
      statusBar.textContent = '摄像头就绪 · 加载手部追踪... Camera ready · Loading hand tracking model...';
    } catch (e) {
      statusBar.textContent = '摄像头失败 Camera failed: ' + e.message + ' · 使用鼠标操作 Use mouse to play';
    }
  }

  async function loadHandTracker() {
    try {
      const mp = await import(GAME_MP_CDN + '/+esm');
      const vision = await mp.FilesetResolver.forVisionTasks(GAME_MP_CDN + '/wasm');
      handL = await mp.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: './models/hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
      });
      handReady = true;
      statusBar.textContent = '✋ 手部追踪就绪 · 开始切水果！Hand tracking ready · Slash fruits!';
      setTimeout(() => { statusBar.style.opacity = '0'; }, 2500);
    } catch (e) {
      statusBar.textContent = '手部追踪失败 · 使用鼠标/触摸操作 Hand tracking failed · Use mouse/touch to play';
      console.error('Hand tracking failed:', e);
    }
  }

  function distSeg(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 0.001;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
  }

  function spawnItem() {
    const info = GAME_ITEMS[Math.floor(Math.random() * GAME_ITEMS.length)];
    items.push({
      x: Math.random() * (GAME_W - 80) + 40,
      y: -50,
      vx: (Math.random() - 0.5) * 1.5,
      vy: GAME_FALL_SPEED + Math.random() * 0.5,
      emoji: info.emoji,
      bonus: info.bonus,
      radius: 32,
      rot: Math.random() * 6.28,
      rotV: (Math.random() - 0.5) * 0.12,
    });
  }

  const PARTICLE_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0'];

  function burst(x, y, emoji) {
    const count = 14 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const speed = 2 + Math.random() * 4;
      const isEmoji = i < 4;
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 1.5,
        life: 1,
        text: isEmoji ? emoji : '',
        sz: isEmoji ? 12 + Math.random() * 12 : 3 + Math.random() * 5,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        isCircle: !isEmoji,
      });
    }
  }

  function hitTestSlash(slash) {
    for (let i = slash.length - 1; i >= 1; i--) {
      const a = slash[i], b = slash[i - 1];
      for (let j = items.length - 1; j >= 0; j--) {
        const it = items[j];
        if (distSeg(a.x, a.y, b.x, b.y, it.x, it.y) < it.radius + 8) {
          bonusCalories += it.bonus;
          fruitsHit++;
          comboCount++;
          if (comboCount > maxCombo) maxCombo = comboCount;
          comboTimer = 60;
          burst(it.x, it.y, it.emoji);
          items.splice(j, 1);
          sfx.slice(comboCount);
          DeviceFeatures.vibrate(30);
        }
      }
    }
  }
  function hitTest() {
    hitTestSlash(leftSlash);
    hitTestSlash(rightSlash);
  }

  function detectHands() {
    if (!handReady || !handL || !videoEl.videoWidth) return;
    if (videoEl.currentTime === lastVT) return;
    lastVT = videoEl.currentTime;
    try {
      const r = handL.detectForVideo(videoEl, performance.now());
      handCursors = [];
      let foundLeft = false, foundRight = false;
      if (r.landmarks && r.landmarks.length > 0) {
        for (let hi = 0; hi < r.landmarks.length; hi++) {
          const hand = r.landmarks[hi];
          const label = r.handednesses?.[hi]?.[0]?.categoryName || '';
          const isLeft = label === 'Right';
          const tip = hand[8];
          const pos = mapHandToGame(tip.x, tip.y);
          const side = isLeft ? 'left' : 'right';
          handCursors.push({ x: pos.x, y: pos.y, side });

          const prev = isLeft ? prevLeftPos : prevRightPos;
          const slash = isLeft ? leftSlash : rightSlash;
          if (prev) {
            const dx = pos.x - prev.x;
            const dy = pos.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
              slash.push({ x: pos.x, y: pos.y });
              handMoveAccum += dist;
            } else {
              slash.length = 0;
            }
          }
          if (isLeft) { prevLeftPos = pos; foundLeft = true; }
          else { prevRightPos = pos; foundRight = true; }
        }
      }
      if (!foundLeft) { prevLeftPos = null; leftSlash.length = 0; }
      if (!foundRight) { prevRightPos = null; rightSlash.length = 0; }
      detectedHands = { left: foundLeft, right: foundRight };
      if (foundLeft && foundRight) bothHandsUsed = true;
    } catch (_) {}
  }

  let fc = 0;
  function gameLoop(ts) {
    if (gameOver) return;
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;
    const remain = Math.ceil((GAME_DURATION_MS - elapsed) / 1000);
    timeLeft.textContent = remain + 's';
    if (elapsed >= GAME_DURATION_MS) {
      gameOver = true;
      cancelAnimationFrame(animId);
      endGame();
      return;
    }

    fc++;
    if (fc % GAME_SPAWN_INTERVAL === 0) spawnItem();

    detectHands();

    ctx.clearRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    items = items.filter((it) => {
      it.x += it.vx;
      it.y += it.vy;
      it.rot += it.rotV;
      if (it.y > GAME_H + 60) return false;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.font = '44px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, 0, 0);
      ctx.restore();
      return true;
    });

    particles = particles.filter((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.life -= 0.02;
      p.vx *= 0.99;
      if (p.life <= 0) return false;
      ctx.globalAlpha = p.life;
      if (p.isCircle) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.font = p.sz + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      return true;
    });

    hitTest();

    function drawSlash(slash, color, shadow) {
      if (slash.length > 1) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = shadow;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(slash[0].x, slash[0].y);
        for (let i = 1; i < slash.length; i++) ctx.lineTo(slash[i].x, slash[i].y);
        ctx.stroke();
        ctx.restore();
      }
      if (slash.length > 16) slash.splice(0, slash.length - 10);
    }
    drawSlash(leftSlash, 'rgba(56, 189, 248, 0.85)', '#38bdf8');
    drawSlash(rightSlash, 'rgba(255, 140, 50, 0.85)', '#ff8c32');

    for (const c of handCursors) {
      const isL = c.side === 'left';
      const fill = isL ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 140, 50, 0.3)';
      const stroke = isL ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255, 140, 50, 0.8)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.save();
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(isL ? 'L' : 'R', c.x, c.y - 26);
      ctx.restore();
    }

    if (comboTimer > 0) {
      comboTimer--;
      if (comboCount >= 2) {
        ctx.save();
        ctx.font = 'bold 28px system-ui';
        ctx.fillStyle = '#ffdd00';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 10;
        ctx.fillText('COMBO x' + comboCount + '!', GAME_W / 2, 50);
        ctx.restore();
      }
    } else {
      comboCount = 0;
    }

    // Hand prompt system
    if (handReady) {
      if (promptFlash > 0) {
        promptFlash--;
        ctx.save();
        ctx.font = 'bold 32px system-ui';
        ctx.fillStyle = 'rgba(74, 222, 128,' + Math.min(1, promptFlash / 20) + ')';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 16;
        ctx.fillText('✅ Great job!', GAME_W / 2, GAME_H / 2 - 20);
        ctx.restore();
      } else if (currentPrompt) {
        promptTimer--;
        let ok = false;
        if (currentPrompt.require === 'left') ok = detectedHands.left;
        else if (currentPrompt.require === 'right') ok = detectedHands.right;
        else ok = detectedHands.left && detectedHands.right;

        if (ok) {
          bonusCalories += 0.1;
          promptFlash = 40;
          currentPrompt = null;
          promptCooldown = 180;
        } else if (promptTimer <= 0) {
          currentPrompt = null;
          promptCooldown = 100;
        } else {
          const pulse = 0.9 + 0.1 * Math.sin(fc * 0.15);
          const alpha = promptTimer < 30 ? promptTimer / 30 : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = `bold ${Math.round(30 * pulse)}px system-ui`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 8;
          ctx.fillText(currentPrompt.text, GAME_W / 2, GAME_H / 2 - 10);
          const barW = 160, barH = 6;
          const pct = promptTimer / 180;
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(GAME_W / 2 - barW / 2, GAME_H / 2 + 14, barW, barH);
          ctx.fillStyle = pct > 0.3 ? '#38bdf8' : '#f97373';
          ctx.fillRect(GAME_W / 2 - barW / 2, GAME_H / 2 + 14, barW * pct, barH);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      } else {
        promptCooldown--;
        if (promptCooldown <= 0) {
          currentPrompt = HAND_PROMPTS[Math.floor(Math.random() * HAND_PROMPTS.length)];
          promptTimer = 180;
        }
      }
    }

    // MET-based calorie calculation every ~30 frames (~0.5s)
    if (fc % 30 === 0 && startTime) {
      const canvasDiag = Math.sqrt(GAME_W * GAME_W + GAME_H * GAME_H);
      const normalizedSpeed = handMoveAccum / canvasDiag;
      handMoveAccum = 0;
      currentMET = estimateMET(normalizedSpeed, bodyMode === 'full');
      if (currentMET > 0) {
        const calThisHalfSec = currentMET * state.weight / 3600 * 0.5;
        moveCalories += calThisHalfSec;
      }

      const metLabels = ['静止 Idle', '轻度 Light', '中度 Moderate', '高强度 High', '剧烈 Intense'];
      const metIdx = currentMET < 0.5 ? 0 : currentMET < 2.2 ? 1 : currentMET < 3.2 ? 2 : currentMET < 4.8 ? 3 : 4;
      metIndicator.textContent = currentMET > 0
        ? `MET ${currentMET.toFixed(1)} · ${metLabels[metIdx]} · 体重 ${state.weight}kg`
        : `静止 · 挥手开始 · 体重 ${state.weight}kg`;
      metIndicator.style.color = metIdx <= 1 ? 'var(--text-muted)' : metIdx <= 2 ? 'var(--accent)' : 'var(--ok)';
    }

    if (remain <= 10 && remain > 0) {
      const flash = Math.sin(fc * 0.25) * 0.15 + 0.15;
      ctx.fillStyle = `rgba(249,115,115,${flash})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      if (remain <= 5) {
        ctx.save();
        ctx.font = 'bold 60px system-ui';
        ctx.fillStyle = `rgba(249,115,115,${0.3 + flash})`;
        ctx.textAlign = 'center';
        ctx.fillText(remain, GAME_W / 2, GAME_H / 2 + 80);
        ctx.restore();
      }
    }

    const total = moveCalories + bonusCalories;
    scoreVal.textContent = total.toFixed(1);
    scoreDetail.textContent = `运动 ${moveCalories.toFixed(1)} + 奖励 ${bonusCalories.toFixed(1)} · ${fruitsHit} 次命中`;
    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    const total = Math.round((moveCalories + bonusCalories) * 10) / 10;
    const today = new Date().toISOString().slice(0, 10);
    if (state.gameCaloriesDate !== today) state.gameCaloriesToday = 0;
    state.gameCaloriesDate = today;
    state.gameCaloriesToday = Math.round((state.gameCaloriesToday + total) * 10) / 10;
    saveGameCalories();
    if (bgm) { bgm.stop(); bgm = null; }
    sfx.success();

    const sessionStats = { fruitsHit, maxCombo, bothHandsUsed, totalCal: state.gameCaloriesToday };
    const unlocked = loadAchievements();
    const newUnlocks = [];
    ACHIEVEMENT_DEFS.forEach(a => {
      if (!unlocked.includes(a.id) && a.check(sessionStats)) {
        saveAchievement(a.id);
        newUnlocks.push(a);
      }
    });

    const achieveHTML = newUnlocks.length > 0
      ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.2)">
          <div style="font-size:12px;color:var(--accent-strong);margin-bottom:6px;font-weight:600">🏅 成就解锁！Achievements Unlocked!</div>
          ${newUnlocks.map(a => `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;border:1px solid rgba(74,222,128,0.4);background:rgba(74,222,128,0.1);font-size:11px;margin:3px 2px"><span>${a.icon}</span><strong>${a.name}</strong><span style="color:var(--text-muted)">${a.desc}</span></div>`).join('')}
        </div>` : '';

    const allUnlocked = loadAchievements();
    const badgeHTML = allUnlocked.length > 0
      ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">已收集 Collected ${allUnlocked.length}/${ACHIEVEMENT_DEFS.length} 成就: ${ACHIEVEMENT_DEFS.filter(a => allUnlocked.includes(a.id)).map(a => a.icon).join(' ')}</div>` : '';

    timeLeft.textContent = '完成 Done';
    const result = createElement('div', 'game-result');
    result.innerHTML = `
      <p class="game-result-title">🎉 消耗约 Burned approx. <strong>${total.toFixed(1)}</strong> kcal</p>
      <p class="game-result-sub">
        🏃 运动 Movement <strong>${moveCalories.toFixed(1)}</strong> kcal (MET × ${state.weight}kg)<br>
        🍉 ${fruitsHit} 个水果 · 最高连击 ${maxCombo} · 奖励 <strong>${bonusCalories.toFixed(1)}</strong> kcal<br>
        📊 今日合计 Today's total ~ <strong>${state.gameCaloriesToday.toFixed(1)}</strong> kcal
      </p>
      ${achieveHTML}${badgeHTML}
      <button type="button" class="primary-btn" id="game-again" style="margin-top:14px">再来一局 Play Again</button>`;
    panel.appendChild(result);
    document.getElementById('game-again').addEventListener('click', () => {
      cleanup();
      wrap.remove();
      openGameModal();
    });
    DeviceFeatures.vibrate([80, 40, 80]);
    updateGameCaloriesBadge();
  }

  function addSlashPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const pt = {
      x: ((clientX - r.left) / r.width) * GAME_W,
      y: ((clientY - r.top) / r.height) * GAME_H,
    };
    rightSlash.push(pt);
  }
  canvas.addEventListener('mousedown', (e) => {
    if (gameOver) return;
    rightSlash.length = 0;
    addSlashPoint(e.clientX, e.clientY);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (gameOver || e.buttons !== 1) return;
    addSlashPoint(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameOver) return;
    rightSlash.length = 0;
    if (e.touches.length) addSlashPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length && !gameOver) addSlashPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // Fullscreen toggle
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });
  function onFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
    fullscreenBtn.textContent = isFullscreen ? '⛶ 窗口 Window' : '⛶ 全屏 Fullscreen';
    wrap.classList.toggle('game-fullscreen', isFullscreen);
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // Full body / half body toggle
  function mapHandToGame(tipX, tipY) {
    const vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    const rect = gameArea.getBoundingClientRect();
    const cw = rect.width || 1, ch = rect.height || 1;
    const videoAspect = vw / vh;
    const containerAspect = cw / ch;
    let gx, gy;
    if (containerAspect > videoAspect) {
      const visH = videoAspect / containerAspect;
      const cropY = (1 - visH) / 2;
      gx = (1 - tipX) * GAME_W;
      gy = ((tipY - cropY) / visH) * GAME_H;
    } else {
      const visW = containerAspect / videoAspect;
      const cropX = (1 - visW) / 2;
      gx = (((1 - tipX) - cropX) / visW) * GAME_W;
      gy = tipY * GAME_H;
    }
    return {
      x: Math.max(0, Math.min(GAME_W, gx)),
      y: Math.max(0, Math.min(GAME_H, gy)),
    };
  }

  halfBodyBtn.addEventListener('click', () => {
    if (bodyMode === 'half') return;
    bodyMode = 'half';
    halfBodyBtn.classList.add('active');
    fullBodyBtn.classList.remove('active');
    gameArea.classList.remove('game-area-fullbody');
  });
  fullBodyBtn.addEventListener('click', () => {
    if (bodyMode === 'full') return;
    bodyMode = 'full';
    fullBodyBtn.classList.add('active');
    halfBodyBtn.classList.remove('active');
    gameArea.classList.add('game-area-fullbody');
  });

  function cleanup() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    if (bgm) { bgm.stop(); bgm = null; }
    if (sfx) { sfx.close(); sfx = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (handL) { try { handL.close(); } catch (_) {} handL = null; }
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  closeBtn.addEventListener('click', () => {
    cleanup();
    updateGameCaloriesBadge();
    wrap.remove();
  });

  startCamera().then(() => loadHandTracker()).then(() => {
    try { bgm = createGameBGM(); } catch (_) {}
  });
  animId = requestAnimationFrame(gameLoop);
}

// Onboarding flow
// ——— Punch Trainer Game (hand tracking) ———
function openPunchGame() {
  const wrap = createElement('div', 'game-modal-wrap');
  wrap.setAttribute('role', 'dialog');
  const panel = createElement('div', 'game-modal-panel');

  const header = createElement('div', 'game-header');
  header.innerHTML = '<h2 class="game-title">🥊 拳击训练 Punch Trainer</h2><p class="game-sub">用拳头击打目标！Hit the targets with your fists!</p>';
  const scoreRow = createElement('div', 'game-score-row');
  const scoreVal = createElement('span', 'game-score-value', '0');
  const timeLeft = createElement('span', 'game-time', '45s');
  scoreRow.innerHTML = '<span class="game-score-label">命中 Hits</span>';
  scoreRow.appendChild(scoreVal);
  scoreRow.appendChild(timeLeft);
  header.appendChild(scoreRow);

  const toolbar = createElement('div', 'game-toolbar');
  const fullscreenBtn = createElement('button', 'game-tool-btn', '⛶ 全屏 Fullscreen');
  fullscreenBtn.type = 'button';
  toolbar.appendChild(fullscreenBtn);

  const statusBar = createElement('div', 'game-status-bar', '正在启动摄像头... Starting camera...');
  const gameArea = createElement('div', 'game-area');
  const videoEl = document.createElement('video');
  videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
  videoEl.className = 'game-video';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas-overlay';
  const GW = 640, GH = 480;
  canvas.width = GW; canvas.height = GH;
  gameArea.appendChild(videoEl); gameArea.appendChild(canvas);

  const footer = createElement('div', 'game-footer');
  const closeBtn = createElement('button', 'game-close-btn', '返回 Back');
  closeBtn.type = 'button';
  footer.appendChild(closeBtn);

  panel.appendChild(header); panel.appendChild(toolbar); panel.appendChild(statusBar);
  panel.appendChild(gameArea); panel.appendChild(footer);
  wrap.appendChild(panel); document.body.appendChild(wrap);

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) wrap.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });
  function onFsChange() {
    const fs = !!document.fullscreenElement;
    fullscreenBtn.textContent = fs ? '⛶ 窗口 Window' : '⛶ 全屏 Fullscreen';
    wrap.classList.toggle('game-fullscreen', fs);
  }
  document.addEventListener('fullscreenchange', onFsChange);

  const ctx = canvas.getContext('2d');
  let targets = [], particles = [], hits = 0, startTime = null, animId = null, gameOver = false;
  let stream = null, handL = null, handReady = false, calories = 0;

  function spawnTarget() {
    targets.push({
      x: 60 + Math.random() * (GW - 120),
      y: 60 + Math.random() * (GH - 120),
      r: 35 + Math.random() * 15,
      life: 2.5,
      maxLife: 2.5,
      color: ['#fb923c','#f87171','#a78bfa','#4ade80','#fbbf24'][Math.floor(Math.random()*5)],
    });
  }

  function burst(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(a) * (2 + Math.random() * 3), vy: Math.sin(a) * (2 + Math.random() * 3), life: 0.6, color, r: 3 + Math.random() * 3 });
    }
  }

  async function startGame() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: GW }, height: { ideal: GH } }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      statusBar.textContent = '加载手部追踪... Loading hand tracking...';
    } catch (e) { statusBar.textContent = '摄像头失败 Camera failed: ' + e.message; return; }

    try {
      const mp = await import(GAME_MP_CDN + '/+esm');
      const vision = await mp.FilesetResolver.forVisionTasks(GAME_MP_CDN + '/wasm');
      handL = await mp.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: './models/hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
      });
      handReady = true;
      statusBar.textContent = '击打目标！Punch the targets!';
    } catch (e) { statusBar.textContent = '手部追踪失败 Hand tracking failed: ' + e.message; return; }

    startTime = performance.now();
    for (let i = 0; i < 3; i++) spawnTarget();
    gameLoop();
  }

  function detectHands() {
    if (!handReady || !handL || videoEl.readyState < 2) return [];
    const t = performance.now();
    try {
      const res = handL.detectForVideo(videoEl, t);
      if (!res.landmarks || !res.landmarks.length) return [];
      return res.landmarks.map(lm => {
        const wrist = lm[0];
        return { x: (1 - wrist.x) * GW, y: wrist.y * GH };
      });
    } catch { return []; }
  }

  function gameLoop() {
    if (gameOver) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const remain = Math.max(0, 45 - elapsed);
    timeLeft.textContent = Math.ceil(remain) + 's';
    if (remain <= 0) { endGame(); return; }

    const hands = detectHands();

    ctx.clearRect(0, 0, GW, GH);

    const dt = 1 / 60;
    if (Math.random() < 0.025 && targets.length < 5) spawnTarget();

    targets.forEach(t => { t.life -= dt; });
    targets = targets.filter(t => t.life > 0);

    hands.forEach(h => {
      targets.forEach(t => {
        const dx = h.x - t.x, dy = h.y - t.y;
        if (Math.sqrt(dx * dx + dy * dy) < t.r + 20) {
          hits++;
          calories += 0.15;
          scoreVal.textContent = hits;
          burst(t.x, t.y, t.color);
          t.life = 0;
        }
      });
    });
    targets = targets.filter(t => t.life > 0);

    targets.forEach(t => {
      const pct = t.life / t.maxLife;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = t.color + Math.round(pct * 60).toString(16).padStart(2, '0');
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = t.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👊', t.x, t.y);
    });

    hands.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,146,60,0.4)';
      ctx.fill();
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= dt; p.vy += 2 * dt; });
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (remain <= 10) {
      ctx.fillStyle = 'rgba(239,68,68,0.15)';
      ctx.fillRect(0, 0, GW, GH);
    }

    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    state.gameCaloriesToday += calories;
    saveGameCalories();
    updateGameCaloriesBadge();
    if (_refreshScannerStats) _refreshScannerStats();

    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, GW, GH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('时间到！Time\'s Up!', GW / 2, GH / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText(`${hits} 次命中 Hits · ${calories.toFixed(1)} kcal`, GW / 2, GH / 2 + 10);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('点击「返回」退出 Click "Back" to exit', GW / 2, GH / 2 + 50);
  }

  function cleanup() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (handL) { handL.close(); handL = null; }
    document.removeEventListener('fullscreenchange', onFsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    wrap.remove();
  }

  closeBtn.addEventListener('click', cleanup);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) cleanup(); });
  startGame();
}

// ——— Dodge Master Game (body tracking) ———
function openDodgeGame() {
  const wrap = createElement('div', 'game-modal-wrap');
  wrap.setAttribute('role', 'dialog');
  const panel = createElement('div', 'game-modal-panel');

  const header = createElement('div', 'game-header');
  header.innerHTML = '<h2 class="game-title">⚡ 闪避大师 Dodge Master</h2><p class="game-sub">移动身体躲避障碍！Move your body to dodge obstacles!</p>';
  let hp = 5, maxHp = 5;

  const scoreRow = createElement('div', 'game-score-row');
  const scoreVal = createElement('span', 'game-score-value', '0');
  const timeLeft = createElement('span', 'game-time', '45s');
  const hpBar = createElement('span', 'game-hp-bar');
  function updateHpBar() {
    hpBar.innerHTML = '<span style="color:#f87171;font-size:11px;margin-right:4px">HP</span>' + '❤️'.repeat(hp) + '🖤'.repeat(maxHp - hp);
  }
  updateHpBar();
  scoreRow.innerHTML = '<span class="game-score-label">闪避 Dodged</span>';
  scoreRow.appendChild(scoreVal);
  scoreRow.appendChild(hpBar);
  scoreRow.appendChild(timeLeft);
  header.appendChild(scoreRow);

  const toolbar = createElement('div', 'game-toolbar');
  const fullscreenBtn = createElement('button', 'game-tool-btn', '⛶ 全屏 Fullscreen');
  fullscreenBtn.type = 'button';
  toolbar.appendChild(fullscreenBtn);

  const statusBar = createElement('div', 'game-status-bar', '正在启动摄像头... Starting camera...');
  const gameArea = createElement('div', 'game-area');
  const videoEl = document.createElement('video');
  videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
  videoEl.className = 'game-video';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas-overlay';
  const GW = 640, GH = 480;
  canvas.width = GW; canvas.height = GH;
  gameArea.appendChild(videoEl); gameArea.appendChild(canvas);

  const footer = createElement('div', 'game-footer');
  const closeBtn = createElement('button', 'game-close-btn', '返回 Back');
  closeBtn.type = 'button';
  footer.appendChild(closeBtn);

  panel.appendChild(header); panel.appendChild(toolbar); panel.appendChild(statusBar);
  panel.appendChild(gameArea); panel.appendChild(footer);
  wrap.appendChild(panel); document.body.appendChild(wrap);

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) wrap.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });
  function onFsChange() {
    const fs = !!document.fullscreenElement;
    fullscreenBtn.textContent = fs ? '⛶ 窗口 Window' : '⛶ 全屏 Fullscreen';
    wrap.classList.toggle('game-fullscreen', fs);
  }
  document.addEventListener('fullscreenchange', onFsChange);

  const ctx = canvas.getContext('2d');
  let obstacles = [], particles = [], dodged = 0, startTime = null, animId = null, gameOver = false;
  let stream = null, poseL = null, poseReady = false, calories = 0;
  let playerX = GW / 2, playerY = GH * 0.6;
  let spawnInterval = 1.2;
  let shakeTimer = 0, shakeIntensity = 0;
  let flashTimer = 0;
  let invincibleTimer = 0;

  const OBSTACLE_ICONS = ['🔴', '💣', '🪨', '☄️', '⛔'];

  function spawnObstacle() {
    const fromLeft = Math.random() < 0.5;
    const lane = Math.random();
    const targetY = GH * (0.3 + lane * 0.5);
    obstacles.push({
      x: fromLeft ? -30 : GW + 30,
      y: targetY - 60 + Math.random() * 120,
      vx: (fromLeft ? 1 : -1) * (3 + Math.random() * 3),
      vy: (Math.random() - 0.5) * 1.5,
      r: 22 + Math.random() * 10,
      icon: OBSTACLE_ICONS[Math.floor(Math.random() * OBSTACLE_ICONS.length)],
      passed: false,
    });
  }

  function burst(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.4, color: '#a78bfa', r: 3 });
    }
  }

  async function startGame() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: GW }, height: { ideal: GH } }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      statusBar.textContent = '加载身体追踪... Loading body tracking...';
    } catch (e) { statusBar.textContent = '摄像头失败 Camera failed: ' + e.message; return; }

    try {
      const mp = await import(GAME_MP_CDN + '/+esm');
      const vision = await mp.FilesetResolver.forVisionTasks(GAME_MP_CDN + '/wasm');
      poseL = await mp.PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: './models/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      poseReady = true;
      statusBar.textContent = '躲避障碍！Dodge the obstacles!';
    } catch (e) { statusBar.textContent = '身体追踪失败 Body tracking failed: ' + e.message; return; }

    startTime = performance.now();
    gameLoop();
  }

  function detectPose() {
    if (!poseReady || !poseL || videoEl.readyState < 2) return null;
    try {
      const res = poseL.detectForVideo(videoEl, performance.now());
      if (!res.landmarks || !res.landmarks.length) return null;
      const lm = res.landmarks[0];
      const nose = lm[0];
      return { x: (1 - nose.x) * GW, y: nose.y * GH };
    } catch { return null; }
  }

  function gameLoop() {
    if (gameOver) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const remain = Math.max(0, 45 - elapsed);
    timeLeft.textContent = Math.ceil(remain) + 's';
    if (remain <= 0) { endGame(); return; }

    const pose = detectPose();
    if (pose) {
      playerX += (pose.x - playerX) * 0.3;
      playerY += (pose.y - playerY) * 0.3;
    }

    ctx.clearRect(0, 0, GW, GH);
    const dt = 1 / 60;

    spawnInterval = Math.max(0.5, 1.2 - elapsed * 0.015);
    if (Math.random() < dt / spawnInterval) spawnObstacle();

    obstacles.forEach(o => { o.x += o.vx; o.y += o.vy; });

    if (invincibleTimer > 0) invincibleTimer -= dt;
    if (shakeTimer > 0) shakeTimer -= dt;
    if (flashTimer > 0) flashTimer -= dt;

    obstacles.forEach(o => {
      if (invincibleTimer > 0) return;
      const dx = playerX - o.x, dy = playerY - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < o.r + 25) {
        hp--;
        updateHpBar();
        shakeTimer = 0.4;
        shakeIntensity = 10;
        flashTimer = 0.3;
        invincibleTimer = 1.0;
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const spd = 3 + Math.random() * 5;
          particles.push({ x: o.x, y: o.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.6, color: i % 2 === 0 ? '#f87171' : '#fbbf24', r: 2 + Math.random() * 4, type: 'spark' });
        }
        particles.push({ x: playerX, y: playerY, vx: 0, vy: 0, life: 0.5, color: '#f87171', r: 60, type: 'ring' });
        o.passed = true;
        DeviceFeatures.vibrate([100, 50, 100]);
        if (hp <= 0) { endGame(); return; }
      }
    });

    obstacles.forEach(o => {
      if (!o.passed && ((o.vx > 0 && o.x > GW + 40) || (o.vx < 0 && o.x < -40))) {
        dodged++;
        calories += 0.12;
        scoreVal.textContent = dodged;
        o.passed = true;
      }
    });
    obstacles = obstacles.filter(o => !o.passed && o.x > -60 && o.x < GW + 60);

    // Screen shake offset
    let shakeX = 0, shakeY = 0;
    if (shakeTimer > 0) {
      const pct = shakeTimer / 0.4;
      shakeX = (Math.random() - 0.5) * shakeIntensity * pct;
      shakeY = (Math.random() - 0.5) * shakeIntensity * pct;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Red flash on hit
    if (flashTimer > 0) {
      const fPct = flashTimer / 0.3;
      ctx.fillStyle = `rgba(239,68,68,${0.25 * fPct})`;
      ctx.fillRect(-10, -10, GW + 20, GH + 20);
    }

    // Draw safe zone guide
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(167,139,250,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(playerX - 35, playerY - 35, 70, 70);
    ctx.setLineDash([]);

    // Draw player (blink when invincible)
    const showPlayer = invincibleTimer <= 0 || Math.floor(invincibleTimer * 10) % 2 === 0;
    if (showPlayer) {
      ctx.beginPath();
      ctx.arc(playerX, playerY, 22, 0, Math.PI * 2);
      ctx.fillStyle = invincibleTimer > 0 ? 'rgba(248,113,113,0.3)' : 'rgba(167,139,250,0.3)';
      ctx.fill();
      ctx.strokeStyle = invincibleTimer > 0 ? '#f87171' : '#a78bfa';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(invincibleTimer > 0 ? '😵' : '🏃', playerX, playerY);
    }

    // Draw obstacles
    obstacles.forEach(o => {
      ctx.font = `${Math.round(o.r * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.icon, o.x, o.y);
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw particles
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= dt; if (p.type === 'spark') p.vy += 3 * dt; });
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      if (p.type === 'ring') {
        const pct = 1 - p.life / 0.5;
        const ringR = p.r * pct;
        ctx.globalAlpha = p.life / 0.5 * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - pct);
        ctx.stroke();
      } else {
        ctx.globalAlpha = p.life / 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // HP danger overlay
    if (hp <= 2 && hp > 0) {
      const pulse = Math.sin(elapsed * 4) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(239,68,68,${0.05 + 0.05 * pulse})`;
      ctx.fillRect(-10, -10, GW + 20, GH + 20);
    }

    if (remain <= 10) {
      ctx.fillStyle = 'rgba(167,139,250,0.1)';
      ctx.fillRect(-10, -10, GW + 20, GH + 20);
    }

    ctx.restore();

    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    state.gameCaloriesToday += calories;
    saveGameCalories();
    updateGameCaloriesBadge();
    if (_refreshScannerStats) _refreshScannerStats();

    const reason = hp <= 0 ? '被击倒 K.O.!' : '时间到！Time\'s Up!';
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, GW, GH);
    if (hp <= 0) {
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥', GW / 2, GH / 2 - 70);
    }
    ctx.fillStyle = hp <= 0 ? '#f87171' : '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(reason, GW / 2, GH / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${dodged} 次闪避 Dodged · ${calories.toFixed(1)} kcal`, GW / 2, GH / 2 + 20);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('点击「返回」退出 Click "Back" to exit', GW / 2, GH / 2 + 60);
  }

  function cleanup() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (poseL) { poseL.close(); poseL = null; }
    document.removeEventListener('fullscreenchange', onFsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    wrap.remove();
  }

  closeBtn.addEventListener('click', cleanup);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) cleanup(); });
  startGame();
}

// ——— Pose Challenge Game (body tracking) ———
// MediaPipe landmarks use anatomical labels on raw (unmirrored) image.
// On a mirrored selfie cam: user's screen-left = anatomical left = lm[15].
const POSE_DEFS = [
  { name: 'T型姿势 T-Pose', icon: '🤸', check: (lm) => {
    const ls = lm[11], rs = lm[12], lw = lm[15], rw = lm[16];
    const armSpread = Math.abs(lw.x - rw.x);
    const lLevel = Math.abs(ls.y - lw.y) < 0.15;
    const rLevel = Math.abs(rs.y - rw.y) < 0.15;
    return armSpread > 0.4 && lLevel && rLevel;
  }},
  { name: '双手举起 Hands Up', icon: '🙌', check: (lm) => {
    const lw = lm[15], rw = lm[16], nose = lm[0];
    return lw.y < nose.y && rw.y < nose.y;
  }},
  { name: '举左手 Left Arm Up', icon: '🤚', check: (lm) => {
    const lw = lm[15], nose = lm[0], rw = lm[16], rs = lm[12];
    return lw.y < nose.y && rw.y > rs.y;
  }},
  { name: '举右手 Right Arm Up', icon: '✋', check: (lm) => {
    const rw = lm[16], nose = lm[0], lw = lm[15], ls = lm[11];
    return rw.y < nose.y && lw.y > ls.y;
  }},
  { name: '深蹲 Squat', icon: '🏋️', check: (lm) => {
    const lh = lm[23], rh = lm[24], lk = lm[25], rk = lm[26];
    const hipY = (lh.y + rh.y) / 2;
    const kneeY = (lk.y + rk.y) / 2;
    return hipY > kneeY - 0.1;
  }},
  { name: '交叉手臂 Arms Cross', icon: '🤞', check: (lm) => {
    const lw = lm[15], rw = lm[16], ls = lm[11], rs = lm[12];
    const midX = (ls.x + rs.x) / 2;
    return lw.x < midX && rw.x > midX && lw.y > ls.y * 0.95 && rw.y > rs.y * 0.95;
  }},
];

function openPoseGame() {
  const wrap = createElement('div', 'game-modal-wrap');
  wrap.setAttribute('role', 'dialog');
  const panel = createElement('div', 'game-modal-panel');

  const header = createElement('div', 'game-header');
  header.innerHTML = '<h2 class="game-title">🧘 姿势挑战 Pose Challenge</h2><p class="game-sub">匹配屏幕上的健身姿势！Match the fitness poses shown on screen!</p>';
  const scoreRow = createElement('div', 'game-score-row');
  const scoreVal = createElement('span', 'game-score-value', '0');
  const timeLeft = createElement('span', 'game-time', '60s');
  scoreRow.innerHTML = '<span class="game-score-label">得分 Score</span>';
  scoreRow.appendChild(scoreVal);
  scoreRow.appendChild(timeLeft);
  header.appendChild(scoreRow);

  const toolbar = createElement('div', 'game-toolbar');
  const fullscreenBtn = createElement('button', 'game-tool-btn', '⛶ 全屏 Fullscreen');
  fullscreenBtn.type = 'button';
  toolbar.appendChild(fullscreenBtn);

  const statusBar = createElement('div', 'game-status-bar', '正在启动摄像头... Starting camera...');
  const gameArea = createElement('div', 'game-area');
  const videoEl = document.createElement('video');
  videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
  videoEl.className = 'game-video';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas-overlay';
  const GW = 640, GH = 480;
  canvas.width = GW; canvas.height = GH;
  gameArea.appendChild(videoEl); gameArea.appendChild(canvas);

  const footer = createElement('div', 'game-footer');
  const closeBtn = createElement('button', 'game-close-btn', '返回 Back');
  closeBtn.type = 'button';
  footer.appendChild(closeBtn);

  panel.appendChild(header); panel.appendChild(toolbar); panel.appendChild(statusBar);
  panel.appendChild(gameArea); panel.appendChild(footer);
  wrap.appendChild(panel); document.body.appendChild(wrap);

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) wrap.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });
  function onFsChange() {
    const fs = !!document.fullscreenElement;
    fullscreenBtn.textContent = fs ? '⛶ 窗口 Window' : '⛶ 全屏 Fullscreen';
    wrap.classList.toggle('game-fullscreen', fs);
  }
  document.addEventListener('fullscreenchange', onFsChange);

  const ctx = canvas.getContext('2d');
  let score = 0, startTime = null, animId = null, gameOver = false;
  let stream = null, poseL = null, poseReady = false, calories = 0;
  let currentPose = null, poseTimer = 0, holdTime = 0, holdTarget = 2.0;
  let poseSuccess = false, pauseUntil = 0, particles = [];

  function nextPose() {
    const idx = Math.floor(Math.random() * POSE_DEFS.length);
    currentPose = POSE_DEFS[idx];
    holdTime = 0;
    poseSuccess = false;
    holdTarget = 1.5 + Math.random() * 1.0;
  }

  function burst(x, y) {
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(a) * (3 + Math.random() * 2), vy: Math.sin(a) * (3 + Math.random() * 2), life: 0.5, color: '#38bdf8', r: 3 + Math.random() * 3 });
    }
  }

  async function startGame() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: GW }, height: { ideal: GH } }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      statusBar.textContent = '加载身体追踪... Loading body tracking...';
    } catch (e) { statusBar.textContent = '摄像头失败 Camera failed: ' + e.message; return; }

    try {
      const mp = await import(GAME_MP_CDN + '/+esm');
      const vision = await mp.FilesetResolver.forVisionTasks(GAME_MP_CDN + '/wasm');
      poseL = await mp.PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: './models/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      poseReady = true;
      statusBar.textContent = '匹配姿势！Match the pose!';
    } catch (e) { statusBar.textContent = '身体追踪失败 Body tracking failed: ' + e.message; return; }

    startTime = performance.now();
    nextPose();
    gameLoop();
  }

  function detectPose() {
    if (!poseReady || !poseL || videoEl.readyState < 2) return null;
    try {
      const res = poseL.detectForVideo(videoEl, performance.now());
      if (!res.landmarks || !res.landmarks.length) return null;
      return res.landmarks[0];
    } catch { return null; }
  }

  function gameLoop() {
    if (gameOver) return;
    const now = performance.now();
    const elapsed = (now - startTime) / 1000;
    const remain = Math.max(0, 60 - elapsed);
    timeLeft.textContent = Math.ceil(remain) + 's';
    if (remain <= 0) { endGame(); return; }

    const lm = detectPose();
    const dt = 1 / 60;

    ctx.clearRect(0, 0, GW, GH);

    if (now < pauseUntil) {
      ctx.fillStyle = 'rgba(56,189,248,0.08)';
      ctx.fillRect(0, 0, GW, GH);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ 很棒 Nice!', GW / 2, GH / 2);
    } else if (currentPose) {
      let matching = false;
      if (lm && currentPose.check(lm)) {
        holdTime += dt;
        matching = true;
        calories += dt * 0.05;
      } else {
        holdTime = Math.max(0, holdTime - dt * 0.5);
      }

      if (holdTime >= holdTarget && !poseSuccess) {
        poseSuccess = true;
        score += 10;
        scoreVal.textContent = score;
        burst(GW / 2, GH / 2);
        pauseUntil = now + 1200;
        setTimeout(() => nextPose(), 1200);
      }

      // Draw pose prompt
      ctx.fillStyle = 'rgba(2,6,23,0.6)';
      ctx.fillRect(GW / 2 - 120, 20, 240, 70);
      ctx.strokeStyle = matching ? '#4ade80' : 'rgba(56,189,248,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(GW / 2 - 120, 20, 240, 70);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${currentPose.icon} ${currentPose.name}`, GW / 2, 50);

      // Hold progress bar
      const pct = clamp(holdTime / holdTarget, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(GW / 2 - 80, 66, 160, 8);
      const barColor = matching ? '#4ade80' : '#38bdf8';
      ctx.fillStyle = barColor;
      ctx.fillRect(GW / 2 - 80, 66, 160 * pct, 8);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('保持姿势！Hold the pose!', GW / 2, 100);

      // Draw skeleton hint if landmarks
      if (lm) {
        const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28]];
        ctx.strokeStyle = matching ? 'rgba(74,222,128,0.5)' : 'rgba(56,189,248,0.3)';
        ctx.lineWidth = 2;
        connections.forEach(([a, b]) => {
          const pa = lm[a], pb = lm[b];
          ctx.beginPath();
          ctx.moveTo((1 - pa.x) * GW, pa.y * GH);
          ctx.lineTo((1 - pb.x) * GW, pb.y * GH);
          ctx.stroke();
        });
        [11,12,13,14,15,16,23,24,25,26,27,28].forEach(i => {
          const p = lm[i];
          ctx.beginPath();
          ctx.arc((1 - p.x) * GW, p.y * GH, 4, 0, Math.PI * 2);
          ctx.fillStyle = matching ? '#4ade80' : '#38bdf8';
          ctx.fill();
        });
      }
    }

    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= dt; p.vy += 1.5 * dt; });
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    state.gameCaloriesToday += calories;
    saveGameCalories();
    updateGameCaloriesBadge();
    if (_refreshScannerStats) _refreshScannerStats();

    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(0, 0, GW, GH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('时间到！Time\'s Up!', GW / 2, GH / 2 - 40);
    ctx.font = '20px sans-serif';
    ctx.fillText(`得分 Score: ${score} · ${calories.toFixed(1)} kcal`, GW / 2, GH / 2 + 10);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('点击「返回」退出 Click "Back" to exit', GW / 2, GH / 2 + 50);
  }

  function cleanup() {
    gameOver = true;
    if (animId) cancelAnimationFrame(animId);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (poseL) { poseL.close(); poseL = null; }
    document.removeEventListener('fullscreenchange', onFsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    wrap.remove();
  }

  closeBtn.addEventListener('click', cleanup);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) cleanup(); });
  startGame();
}

const ONBOARDING_KEY = 'fitness_onboarding_done';
const ONBOARDING_STEPS = [
  {
    icon: '✨',
    title: '欢迎来到AI健身 Welcome to AI Fitness',
    desc: '智能健身塑形助手，结合AI追踪技术帮你可视化身体变化、设定目标、追踪进度。\nAn intelligent fitness body shaping assistant, combining AI tracking technology to help you visualize body changes, set goals, and track progress.',
  },
  {
    icon: '📊',
    title: '输入你的信息 Enter Your Info',
    desc: '使用左侧面板的滑块设置身高、体重和年龄。系统会计算BMI、体脂率并生成你的体型轮廓。\nUse the sliders on the left panel to set your height, weight, and age. The system will calculate BMI, body fat, and generate your body silhouette.',
  },
  {
    icon: '📸',
    title: '开始AI扫描 Start AI Scan',
    desc: '点击「启动摄像头」或上传照片开始面部、手部和身体追踪。你还可以生成个性化形象。\nClick "Enable Camera" or upload a photo to start face, hand, and body tracking. You can also generate your personalized avatar.',
  },
  {
    icon: '🎮',
    title: '开始你的旅程！Begin Your Journey!',
    desc: '设定目标体重，玩小游戏消耗卡路里，在回忆录中记录每日进步。出发吧！\nSet your target weight, play mini games to burn calories, and record your daily progress in the memoir. Let\'s go!',
  },
];

function showOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY)) return;

  let step = 0;
  const overlay = createElement('div', 'onboarding-overlay');

  function render() {
    const s = ONBOARDING_STEPS[step];
    overlay.innerHTML = '';
    const card = createElement('div', 'onboarding-card');

    const icon = createElement('span', 'onboarding-icon', s.icon);
    const title = createElement('h2', 'onboarding-title', s.title);
    const desc = createElement('p', 'onboarding-desc', s.desc);

    const dots = createElement('div', 'onboarding-steps');
    ONBOARDING_STEPS.forEach((_, i) => {
      const dot = createElement('div', 'onboarding-dot' + (i === step ? ' active' : ''));
      dots.appendChild(dot);
    });

    const actions = createElement('div', 'onboarding-actions');
    const isLast = step === ONBOARDING_STEPS.length - 1;
    const nextBtn = createElement('button', 'onboarding-next', isLast ? '开始使用 Get Started' : '下一步 Next');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
      if (isLast) {
        localStorage.setItem(ONBOARDING_KEY, '1');
        overlay.remove();
      } else {
        step++;
        render();
      }
    });

    if (!isLast) {
      const skipBtn = createElement('button', 'onboarding-skip', '跳过 Skip');
      skipBtn.type = 'button';
      skipBtn.addEventListener('click', () => {
        localStorage.setItem(ONBOARDING_KEY, '1');
        overlay.remove();
      });
      actions.appendChild(skipBtn);
    }
    actions.appendChild(nextBtn);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(dots);
    card.appendChild(actions);
    overlay.appendChild(card);
  }

  render();
  document.body.appendChild(overlay);
}

// Initialize
function init() {
  loadMemoir();
  const inputRoot = document.getElementById('input-panel-root');
  const scannerRoot = document.getElementById('scanner-panel-root');
  const vizRoot = document.getElementById('visualization-root');

  if (inputRoot) mountInputPanel(inputRoot);
  if (scannerRoot) mountScannerPanel(scannerRoot);
  if (vizRoot) mountVisualization(vizRoot);

  document.getElementById('header-memoir-btn')?.addEventListener('click', openMemoirModal);
  updateGameCaloriesBadge();

  window.addEventListener('resize', () => renderVisualization(true));

  showOnboarding();
}

window.addEventListener('DOMContentLoaded', init);

