// 3.7：組 /api/derive 請求（瀏覽器共用，純函式，無 fetch、無 DOM、不含任何核心公式）。
// 欄位清單與上限與 lib/server/validate-derive-request.js 相同，由 tests/client-modules.test.js L1 把關。
export const DERIVE_SUMMARY_KEYS = [
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
  "_autoDetectedStatic",
  "phaseTiming",
];
export const PHASE_KEYS = ["touchPct", "posePct", "fallPct", "pullPct"];
export const DERIVE_INPUT_LIMITS = { maxCadence: 400, maxSummaryAbs: 1000, heightCm: [50, 250] };

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const finiteOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// 白名單複製 summary：非有限數字（NaN、±Infinity）→ null；undefined 維持缺；不改寫輸入。
function pickSummary(src) {
  const out = {};
  for (const k of DERIVE_SUMMARY_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    if (k === "phaseTiming") {
      if (!isObj(v)) continue;
      const pt = {};
      for (const pk of PHASE_KEYS) {
        const pv = v[pk];
        if (pv === undefined) continue;
        pt[pk] = typeof pv === "number" && Number.isFinite(pv) && pv >= 0 && pv <= 100 ? pv : null;
      }
      out.phaseTiming = pt;
    } else if (k === "_autoDetectedStatic") {
      out[k] = typeof v === "boolean" ? v : null;
    } else {
      out[k] = finiteOrNull(v);
    }
  }
  return out;
}

export function buildDeriveBody(summary, { cadence, heightCm, cameraMode, includeKeyframes } = {}) {
  const body = { summary: pickSummary(isObj(summary) ? summary : {}), cadence };
  if (heightCm !== undefined) body.heightCm = heightCm;
  if (cameraMode !== undefined) body.cameraMode = cameraMode;
  if (includeKeyframes) body.includeKeyframes = true;
  return body;
}

// 記憶鍵：同一 body 必得同一回應（derive 無 timestamp）。
export function deriveKey(body) {
  return JSON.stringify(body);
}
