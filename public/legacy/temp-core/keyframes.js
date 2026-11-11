// TEMP-CORE（暫時，3.3 移除）：舊專案核心原樣副本，僅供 3.2 過渡期的舊 Client 在瀏覽器執行。
// 正式核心是 server-only 的 lib/core/（ES module）；只由 public/legacy/index.html 以 script 載入，不得被 lib/、app/ 引用，也不得修改。
// 含本目錄的 build 不得部署（見 docs/client-server-boundary.md D0、next.config.mjs 部署防線）。
// ==========================================
// 週期關鍵幀（cycleKeyframes）：播放器端的讀取、內插與退回
// 純函式，不碰 DOM。契約見 docs/analysis-json-contract.md
// 載入順序：須在 biomechanics.js 之後、analyzer.js 之前
// ==========================================

const CYCLE_KEYFRAME_NUMERIC_FIELDS = [
  "trunk",
  "rThigh",
  "rKnee",
  "rAnkle",
  "lThigh",
  "lKnee",
  "lAnkle",
  "rShoulder",
  "rElbow",
  "lShoulder",
  "lElbow",
  "comOffset",
];
const CYCLE_KEYFRAME_MIN_FRAMES = 21;

// 驗證 cycleKeyframes 格式，回傳 { ok, keyframes, errors }
function normalizeCycleKeyframes(ck) {
  const errors = [];
  if (!ck || typeof ck !== "object" || Array.isArray(ck)) {
    return { ok: false, keyframes: null, errors: ["cycleKeyframes 必須是物件"] };
  }
  if (ck.model !== "angles-sagittal-v1")
    errors.push("model 必須是 angles-sagittal-v1");
  if (ck.interpolation !== "linear") errors.push("interpolation 必須是 linear");
  if (ck.phaseBasis !== "animationCycle")
    errors.push("phaseBasis 必須是 animationCycle");
  const frames = ck.frames;
  if (!Array.isArray(frames) || frames.length < CYCLE_KEYFRAME_MIN_FRAMES) {
    errors.push(`frames 至少需要 ${CYCLE_KEYFRAME_MIN_FRAMES} 幀`);
  } else {
    let prevP = -Infinity;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (!f || typeof f !== "object") {
        errors.push(`frames[${i}] 不是物件`);
        break;
      }
      if (!Number.isFinite(f.p) || f.p <= prevP) {
        errors.push(`frames[${i}].p 必須是嚴格遞增的有限數字`);
        break;
      }
      prevP = f.p;
      const badField = CYCLE_KEYFRAME_NUMERIC_FIELDS.find(
        (k) => !Number.isFinite(f[k]),
      );
      if (badField) {
        errors.push(`frames[${i}].${badField} 必須是有限數字`);
        break;
      }
      if (typeof f.rIsStance !== "boolean" || typeof f.lIsStance !== "boolean") {
        errors.push(`frames[${i}] 的 rIsStance／lIsStance 必須是 boolean`);
        break;
      }
    }
    if (errors.length === 0) {
      if (frames[0].p !== 0) errors.push("首幀 p 必須為 0");
      if (frames[frames.length - 1].p !== 1) errors.push("末幀 p 必須為 1");
    }
  }
  if (errors.length > 0) return { ok: false, keyframes: null, errors };
  return { ok: true, keyframes: ck, errors: [] };
}

// 以二分搜尋找相鄰兩幀，數值欄位線性內插；*IsStance 取前一幀
function sampleCycleKeyframes(keyframes, p) {
  const frames = keyframes.frames;
  // 不用 ((p % 1) + 1) % 1：加 1 會損失浮點精度，使恰在關鍵幀上的 p 落到前一幀
  const q = p - Math.floor(p);
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].p <= q) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.p - a.p;
  const t = span > 0 ? (q - a.p) / span : 0;
  const out = {};
  for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) {
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  out.rIsStance = a.rIsStance;
  out.lIsStance = a.lIsStance;
  return out;
}

// 渲染層取骨架的單一入口：有關鍵幀就內插，否則退回本地運動學
function evaluateProfileAngles(profile, p) {
  if (profile.cycleKeyframes) {
    return sampleCycleKeyframes(profile.cycleKeyframes, p);
  }
  return generatePoseMethodAlignedCycle(p, profile.summary, profile.cadence);
}
