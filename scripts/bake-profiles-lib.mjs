// 3.5 烘焙邏輯（純函式，無 I/O，可重現）：產生 lib/profiles 的兩個產生檔內容。
// CLI（bake-profiles.mjs）與 tests/profiles-bake.test.js 共用。
import { buildCycleKeyframesFromSummary, generatePoseMethodAlignedCycle } from "../lib/core/index.js";
import { solveKinematics } from "../lib/player/index.js";
import {
  BUILTIN_PROFILES,
  BUILTIN_PROFILE_KEYS,
  SIM_CAPTURE_SOURCE_KEY,
} from "../lib/profiles/builtin.js";

const plain = (v) => JSON.parse(JSON.stringify(v));
const round = (v, d) => Number(v.toFixed(d));

export const SIM_PARAMS = { fps: 30, frameCount: 60, width: 640, height: 400, hipY: 370, scale: 0.95 };

const HEADER = (name) =>
  `// 由 npm run bake:profiles 產生（scripts/bake-profiles-lib.mjs），請勿手改。\n// ${name}\n`;

export function buildSimCapture() {
  const { fps, frameCount, width: W, height: H, hipY, scale } = SIM_PARAMS;
  const src = BUILTIN_PROFILES[SIM_CAPTURE_SOURCE_KEY];
  const period = 120 / src.cadence; // 一個週期兩步（秒）
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    const p = (t / period) % 1;
    const a = generatePoseMethodAlignedCycle(p, src.summary, src.cadence);
    const k = solveKinematics(a, W * 0.5, hipY, scale);
    const lm = Array.from({ length: 33 }, () => null);
    const set = (idx, pt, dx = 0) => {
      lm[idx] = [round((pt.x + dx) / W, 5), round(pt.y / H, 5), 0.99];
    };
    const head = k.head;
    set(0, head, 6);
    for (const idx of [1, 2, 3, 4, 5, 6, 9, 10]) set(idx, head, -4);
    set(7, head, -6);
    set(8, head, -6);
    set(11, k.shoulder);
    set(12, k.shoulder);
    set(13, k.leftArm.elbow);
    set(14, k.rightArm.elbow);
    set(15, k.leftArm.wrist);
    set(16, k.rightArm.wrist);
    for (const idx of [17, 19, 21]) set(idx, k.leftArm.wrist);
    for (const idx of [18, 20, 22]) set(idx, k.rightArm.wrist);
    set(23, k.hip);
    set(24, k.hip);
    set(25, k.leftLeg.knee);
    set(26, k.rightLeg.knee);
    set(27, k.leftLeg.ankle);
    set(28, k.rightLeg.ankle);
    set(29, k.leftLeg.heel);
    set(30, k.rightLeg.heel);
    set(31, k.leftLeg.toe);
    set(32, k.rightLeg.toe);
    frames.push({ t: round(t, 4), lm });
  }
  return {
    request: {
      frameWidth: W,
      frameHeight: H,
      runDirection: 1,
      isManualDirection: true,
      frames,
    },
    meta: { sourceProfileKey: SIM_CAPTURE_SOURCE_KEY, cadence: src.cadence, fps, frameCount },
  };
}

export function renderBakedModules() {
  const kf = {};
  for (const key of BUILTIN_PROFILE_KEYS) {
    const prof = BUILTIN_PROFILES[key];
    kf[key] = plain(buildCycleKeyframesFromSummary(prof.summary, prof.cadence, 100));
  }
  const kfLines = BUILTIN_PROFILE_KEYS.map((key) => {
    const c = kf[key];
    const rows = c.frames.map((f) => `      ${JSON.stringify(f)}`).join(",\n");
    return (
      `  ${JSON.stringify(key)}: {\n` +
      `    model: ${JSON.stringify(c.model)},\n    interpolation: ${JSON.stringify(c.interpolation)},\n    phaseBasis: ${JSON.stringify(c.phaseBasis)},\n` +
      `    frames: [\n${rows},\n    ],\n  }`
    );
  });
  const kfText =
    HEADER("內建 profile 的 101 幀烘焙關鍵幀（由核心依 summary 與 cadence 產生）") +
    `\nexport const BAKED_CYCLE_KEYFRAMES = {\n${kfLines.join(",\n")},\n};\n`;

  const sim = buildSimCapture();
  const rows = sim.request.frames.map((f) => `    ${JSON.stringify(f)}`).join(",\n");
  const simText =
    HEADER("模擬擷取用的合成 landmarks（非使用者資料；來源：night_track_runner 的骨架）") +
    `\nexport const SIM_CAPTURE_META = ${JSON.stringify(sim.meta)};\n\n` +
    `export const SIM_CAPTURE_REQUEST = {\n` +
    `  frameWidth: ${sim.request.frameWidth},\n  frameHeight: ${sim.request.frameHeight},\n` +
    `  runDirection: ${sim.request.runDirection},\n  isManualDirection: ${sim.request.isManualDirection},\n` +
    `  frames: [\n${rows},\n  ],\n};\n`;

  return {
    "lib/profiles/baked-keyframes.js": kfText,
    "lib/profiles/sim-capture.js": simText,
  };
}
