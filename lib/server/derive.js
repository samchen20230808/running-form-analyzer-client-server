import "server-only";
// 框架無關的衍生值計算：summary＋cadence → metrics／phaseTiming／步幅（不含 landmarks）。
// 核心只能經由 ../core/index.js 使用。
import * as core from "../core/index.js";
import { buildMetrics } from "./metrics.js";
import { validateDeriveRequest, SUMMARY_KEYS } from "./validate-derive-request.js";

export const DERIVE_ERRORS = ["invalid_request"];

const plain = (v) => JSON.parse(JSON.stringify(v));

// 白名單複製（缺欄位維持缺，null 原樣保留）；不改寫 body
function pickSummary(src) {
  const out = {};
  for (const k of SUMMARY_KEYS) {
    if (src[k] === undefined) continue;
    out[k] = k === "phaseTiming" && src[k] !== null ? { ...src[k] } : src[k];
  }
  return out;
}

/**
 * @returns {{ok:true, result:object} | {ok:false, error:string, details?:string[]}}
 */
export function deriveRequest(body) {
  const check = validateDeriveRequest(body);
  if (!check.ok) return { ok: false, error: "invalid_request", details: check.details };

  const heightCm = body.heightCm ?? core.APP_CONFIG.defaults.heightCm;
  const cameraMode = body.cameraMode ?? core.APP_CONFIG.defaults.cameraMode;
  const summary = pickSummary(body.summary);
  const { cadence } = body;
  const stride = core.computeStrideForCameraMode(summary, cameraMode, heightCm, cadence);

  return {
    ok: true,
    result: {
      schemaVersion: core.APP_CONFIG.analysisSchemaVersion,
      version: core.APP_CONFIG.version,
      source: "server",
      cadence,
      heightCm,
      cameraMode,
      metrics: buildMetrics(summary, cadence),
      phaseTiming: plain(core.computePersonalizedPhaseTiming(summary, cadence)),
      stride: {
        strideMeters: stride.strideMeters,
        measuredStrideMeters: stride.measuredStrideMeters,
        pixelVal: stride.pixelVal,
        strideModeText: stride.strideModeText,
      },
      autoStrideMeters: core.computeAutoStrideMeters(summary, heightCm, cadence),
      ...(body.includeKeyframes
        ? { cycleKeyframes: plain(core.buildCycleKeyframesFromSummary(summary, cadence, 100)) }
        : {}),
    },
  };
}
