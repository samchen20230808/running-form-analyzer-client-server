import "server-only";
// 框架無關的主流程（server-only ES module）：landmarks 請求 → 契約 v1.0.0 分析結果。
// 不做 HTTP；Route Handler（Feature 1.3）負責把錯誤類型對應成狀態碼。
// 核心只能經由 ../core/index.js 使用。
import * as core from "../core/index.js";
import { validateRequest, LIMITS } from "./validate-request.js";
import { buildMetrics } from "./metrics.js";

// 錯誤類型；1.3 據此對應 400／413／422（非預期例外不攔截，由 1.3 轉成 500）
export const ANALYZE_ERRORS = ["invalid_request", "payload_too_large", "insufficient_frames"];

// 轉成純 JSON 值（去除 undefined、NaN 轉 null 等），讓計算與回應都使用序列化後的同一份 summary
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * @returns {{ok:true, result:object} | {ok:false, error:string, details?:string[], acceptedFrames?:number}}
 */
export function analyzeRequest(body) {
  const check = validateRequest(body);
  if (!check.ok) {
    return check.tooLarge
      ? { ok: false, error: "payload_too_large", details: check.details }
      : { ok: false, error: "invalid_request", details: check.details };
  }

  const heightCm = body.heightCm ?? core.APP_CONFIG.defaults.heightCm;
  const cameraMode = body.cameraMode ?? core.APP_CONFIG.defaults.cameraMode;
  const isManualDirection = body.isManualDirection ?? false;

  // 重跑方向偵測與擷取閘門（與 Client onPoseResults 同一份邏輯）
  let runDirection = body.runDirection ?? 1;
  let lockedHip = null;
  const frames = [];
  for (const f of body.frames) {
    const lm = f.lm.map(([x, y, v]) => ({
      x,
      y,
      visibility: v === null ? undefined : v,
    }));
    const res = core.extractAnglesFromLandmarks(lm, body.frameWidth, body.frameHeight, {
      runDirection,
      isManualDirection,
      heightCm,
      videoTime: f.t,
    });
    runDirection = res.runDirection;

    const gate = core.evaluateCaptureFrame(res.extracted, frames, lockedHip);
    lockedHip = gate.lockedHip;
    if (gate.action === "finalize") break;
    if (gate.action === "accept") {
      frames.push(res.extracted);
      if (frames.length >= LIMITS.maxAcceptedFrames) break;
    }
  }

  if (frames.length < LIMITS.minAcceptedFrames) {
    return { ok: false, error: "insufficient_frames", acceptedFrames: frames.length };
  }

  const { cadence, summary: rawSummary } = core.analyzeCapturedFrames(frames, {
    heightCm,
    cameraMode,
    canvasW: body.frameWidth,
    runDirection,
  });
  const summary = plain(rawSummary);

  const result = {
    schemaVersion: core.APP_CONFIG.analysisSchemaVersion,
    version: core.APP_CONFIG.version,
    source: "server",
    timestamp: new Date().toISOString(),
    profileKey: "custom_captured",
    ...(body.profileName !== undefined ? { profileName: body.profileName } : {}),
    cameraMode,
    heightCm,
    cadence,
    strideMeters: summary.strideMeters,
    isManualStride: false,
    phaseTiming: summary.phaseTiming,
    summary,
    metrics: buildMetrics(summary, cadence),
    cycleKeyframes: plain(core.buildCycleKeyframesFromSummary(summary, cadence, 100)),
  };
  return { ok: true, result };
}
