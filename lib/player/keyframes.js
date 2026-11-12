// ==========================================
// 週期關鍵幀（cycleKeyframes）：驗證與內插
// 純函式，不碰 DOM。契約見 docs/analysis-json-contract.md
// 非 server-only：瀏覽器與 Server 共用的單一來源。不得 import lib/core 或 lib/server。
// ==========================================

export const CYCLE_KEYFRAME_NUMERIC_FIELDS = [
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
export const CYCLE_KEYFRAME_MIN_FRAMES = 21;

// 驗證 cycleKeyframes 格式，回傳 { ok, keyframes, errors }
export function normalizeCycleKeyframes(ck) {
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
export function sampleCycleKeyframes(keyframes, p) {
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

// 渲染層取骨架的單一入口：只看關鍵幀；沒有關鍵幀回傳 null（呼叫端不畫骨架並提示）
export function evaluateProfileAngles(profile, p) {
  if (!profile || !profile.cycleKeyframes) return null;
  return sampleCycleKeyframes(profile.cycleKeyframes, p);
}
