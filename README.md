# AI 健身体型扫描仪 · AI Fitness Body Scanner

**中文：** 基于浏览器的互动体验：结合基础身体数据与摄像头 AI 追踪，可视化当前体态，并模拟目标体重下的体型变化；含燃脂小游戏与「形象画廊·回忆录」记录进度。

**English:** A browser-based interactive experience: combine basic body metrics with camera AI tracking to visualize your current silhouette and a simulated target-weight shape; includes fat-burn mini games and an **Avatar Gallery · Memoir** for progress.

**在线演示 Live demo (GitHub Pages):** [https://siauguo-beep.github.io/fitness/](https://siauguo-beep.github.io/fitness/)

**动作追踪页 Motion tracker:** [https://siauguo-beep.github.io/fitness/tracker.html](https://siauguo-beep.github.io/fitness/tracker.html)

---

## 项目定位与说明 · Project scope & disclaimer

**中文**

- **体验向演示**：展示计算机视觉、3D 可视化与运动交互在健身 / wellness 场景中的可能形态。
- **非医疗建议**：BMI、体脂估算、体态与「未来体型」均为示意与动画效果，不能替代专业体检或教练指导。

**English**

- **Experience-first demo:** Showcases how computer vision, 3D visualization, and motion interaction can work in fitness / wellness contexts.
- **Not medical advice:** BMI, body-fat hints, posture, and “future body” visuals are illustrative animations only—not a substitute for clinical exams or professional coaching.

---

## 技术概要 · Tech stack

| | 中文 | English |
|---|------|---------|
| **前端 Front-end** | 原生 HTML / CSS / JavaScript（模块化） | Vanilla HTML / CSS / JavaScript (ES modules) |
| **3D** | [Three.js](https://threejs.org/)（import map + CDN） | [Three.js](https://threejs.org/) via import map / CDN |
| **视觉 AI Vision** | [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) — 面部 / 手 / 姿态关键点 | [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) — face / hands / pose landmarks |
| **存储 Storage** | 回忆录与部分设置使用 `localStorage` | Memoir and some settings use `localStorage` |

---

## 界面结构（`index.html`）· UI layout

**中文**

页面分为 **顶栏** 与 **三栏主体**：

1. **顶栏** — 标题；**全屏**；**形象画廊·回忆录**（目标、 streak、历史截图等）。
2. **左栏 · 基本信息** — 身高/体重滑块、出生年份、性别、活动量；**燃脂小游戏**入口（水果切切乐、拳击、姿态模仿等，需摄像头）。
3. **中栏 · AI 体态扫描** — **启动摄像头** / **上传照片**；扫描动画与状态；**今日身体数据卡片**；回忆录入口。
4. **右栏 · 体型可视化** — **目标体重**滑块：当前 vs 目标体态示意对比；随窗口自动重布局。

首次访问有 **Onboarding** 引导；清除站点数据后可再次看到。

**English**

The page has a **top bar** and a **three-column main area**:

1. **Top bar** — Title; **Fullscreen**; **Avatar Gallery · Memoir** (goals, streak, snapshot history).
2. **Left · Basic info** — Height/weight sliders, birth year, sex, activity; **mini games** entry (fruit slash, punch trainer, pose mimic—camera required).
3. **Center · AI body scan** — **Enable camera** / **Upload photo**; scan animation & status; **today’s stats card**; memoir shortcut.
4. **Right · Visualization** — **Target weight** slider: illustrative current vs target comparison; reflows on resize.

**Onboarding** runs on first visit; clear site data to see it again.

---

## 推荐操作流程 · Suggested workflow

**中文**

1. 在左侧填写 **身高、体重、出生年份、性别、活动量**，观察指标与中栏卡片。
2. **授权摄像头**或上传照片，完成扫描/形象流程；若拒绝权限，仍可只用滑块与右侧模拟。
3. 在右侧调整 **目标体重**，查看体态对比。
4. 打开 **形象画廊·回忆录** 记录形象与进度（目标体重 / 天数）。
5. 进入 **燃脂小游戏**，按游戏内说明用手势或姿势互动。

**English**

1. Set **height, weight, birth year, sex, activity** on the left; watch metrics and the center card update.
2. **Allow the camera** or upload a photo for scan/avatar flows; if denied, sliders and right-panel simulation still work.
3. Adjust **target weight** on the right for the visualization compare.
4. Open **Avatar Gallery · Memoir** for snapshots and progress (weight goal / day goal).
5. Launch **mini games** and follow on-screen instructions for hands/pose interaction.

---

## `tracker.html` · AI Motion Tracker

**中文** — 轻量 **摄像头 + 画布叠加** 页：标题 **AI Motion Tracker**；右侧开关 **面/手/身** 追踪、**FPS**、**麦克风电平**；适合单独调试叠加或嵌入流程。

**English** — Lightweight **camera + canvas overlay** page: **AI Motion Tracker** title; toggles for **face/hands/pose**, **FPS**, and **mic level**; good for debugging overlays or opening from another flow.

---

## 本地运行 · Local development

**中文** — 用 HTTP 服务打开项目根目录（避免 `file://` 下 ES 模块限制）：

**English** — Serve the repo root over HTTP (ES modules may not load from `file://`):

```bash
cd fitness
python3 -m http.server 8765
```

浏览器 / Open: `http://127.0.0.1:8765/`

### AI 模型文件 · Model files

**中文** — `.gitignore` 忽略 `models/*.task`。完整离线关键点检测需将 MediaPipe 任务模型放入 `models/`，文件名与 `tracking.js` 一致：

**English** — `.gitignore` excludes `models/*.task`. For full local landmark detection, place MediaPipe task models under `models/` with the names expected by `tracking.js`:

- `face_landmarker.task`
- `hand_landmarker.task`
- `pose_landmarker_lite.task`

**中文** — 无模型时实时追踪可能不可用；纯表单与部分界面仍可浏览。

**English** — Without models, live tracking may fail; forms and some UI still work.

---

## 部署 · Deploy (GitHub Pages)

**中文** — 已配置 **GitHub Actions**。在仓库 **Settings → Pages** 将 **Source** 设为 **GitHub Actions**，推送 `main` 将触发 **Deploy GitHub Pages**。

**English** — **GitHub Actions** is configured. Set **Settings → Pages → Source** to **GitHub Actions**; pushes to `main` trigger **Deploy GitHub Pages**.

---

## 作者 · Author

**郭曉玥 · Guo Xiaoyue**（`mc569254`）

---

## 许可与声明 · Legal & privacy note

**中文** — 仅供学习与演示。使用摄像头/麦克风须遵守法规与隐私，勿未经同意拍摄他人。

**English** — For learning and demonstration only. Follow local laws and privacy norms for camera/microphone use; do not record others without consent.
