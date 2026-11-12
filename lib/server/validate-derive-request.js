import "server-only";
// /api/derive 請求驗證（server-only）：只檢查、不修正；缺欄位維持缺。
export const DERIVE_LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxCadence: 400,
  heightCm: [50, 250],
  maxSummaryAbs: 1000,
  maxDetails: 20,
};

const CAMERA_MODES = ["auto", "static", "tracking"];
export const TOP_KEYS = ["summary", "cadence", "heightCm", "cameraMode", "includeKeyframes"];
export const SUMMARY_NUMBER_KEYS = [
  "trunkAngle",
  "comOffsetCm",
  "touchdownKnee",
  "minSwingKnee",
  "pushOffExtensionDeg",
  "avgElbow",
  "footStrikeAngle",
  "hipRomDeg",
  "strideMeters",
  "_measuredPixelStride",
  "measuredStrideMeters",
];
export const SUMMARY_KEYS = [...SUMMARY_NUMBER_KEYS, "_autoDetectedStatic", "phaseTiming"];
export const PHASE_KEYS = ["touchPct", "posePct", "fallPct", "pullPct"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateDeriveRequest(body) {
  const details = [];
  const add = (m) => {
    if (details.length < DERIVE_LIMITS.maxDetails) details.push(m);
  };
  if (!isObj(body)) return { ok: false, details: ["body 必須是 JSON 物件"] };

  for (const k of Object.keys(body)) {
    if (!TOP_KEYS.includes(k)) add(`不支援的欄位：${k}`);
  }
  if (!isNum(body.cadence) || body.cadence <= 0 || body.cadence > DERIVE_LIMITS.maxCadence) {
    add(`cadence 必填，須為 0 ~ ${DERIVE_LIMITS.maxCadence} 的正數`);
  }
  if (body.heightCm !== undefined) {
    const [lo, hi] = DERIVE_LIMITS.heightCm;
    if (!isNum(body.heightCm) || body.heightCm < lo || body.heightCm > hi) {
      add(`heightCm 須介於 ${lo} ~ ${hi}`);
    }
  }
  if (body.cameraMode !== undefined && !CAMERA_MODES.includes(body.cameraMode)) {
    add(`cameraMode 須為 ${CAMERA_MODES.join("｜")}`);
  }
  if (body.includeKeyframes !== undefined && typeof body.includeKeyframes !== "boolean") {
    add("includeKeyframes 須為 boolean");
  }

  const s = body.summary;
  if (!isObj(s)) {
    add("summary 必填，須為物件");
  } else {
    for (const k of Object.keys(s)) {
      if (!SUMMARY_KEYS.includes(k)) add(`summary 不支援的欄位：${k}`);
    }
    for (const k of SUMMARY_NUMBER_KEYS) {
      const v = s[k];
      if (v === undefined || v === null) continue;
      if (!isNum(v) || Math.abs(v) > DERIVE_LIMITS.maxSummaryAbs) {
        add(`summary.${k} 須為有限數字（絕對值不超過 ${DERIVE_LIMITS.maxSummaryAbs}）或 null`);
      }
    }
    const a = s._autoDetectedStatic;
    if (a !== undefined && a !== null && typeof a !== "boolean") {
      add("summary._autoDetectedStatic 須為 boolean 或 null");
    }
    const pt = s.phaseTiming;
    if (pt !== undefined && pt !== null) {
      if (!isObj(pt)) {
        add("summary.phaseTiming 須為物件或 null");
      } else {
        for (const k of Object.keys(pt)) {
          if (!PHASE_KEYS.includes(k)) add(`summary.phaseTiming 不支援的欄位：${k}`);
        }
        for (const k of PHASE_KEYS) {
          const v = pt[k];
          if (v === undefined || v === null) continue;
          if (!isNum(v) || v < 0 || v > 100) add(`summary.phaseTiming.${k} 須為 0 ~ 100 的數字或 null`);
        }
      }
    }
  }
  return details.length ? { ok: false, details } : { ok: true, details };
}
