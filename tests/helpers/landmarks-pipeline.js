// 測試專用：重現舊專案 server/lib/analyze.js 的擷取迴圈與 summary 計算（不含請求驗證）。
// 1.2 完成 analyzeRequest 後改用正式實作並刪除本檔，避免兩份流程並存。
import {
  APP_CONFIG,
  analyzeCapturedFrames,
  calculateOverallRunningScore,
  computeGctMetrics,
  evaluateCaptureFrame,
  extractAnglesFromLandmarks,
} from "../../lib/core/index.js";

// 1.2 由 validate 的 LIMITS 取代
const MAX_ACCEPTED_FRAMES = 55;
const MIN_ACCEPTED_FRAMES = 8;

export const plain = (v) => JSON.parse(JSON.stringify(v));

export function runLandmarksPipeline(body) {
  const heightCm = body.heightCm ?? APP_CONFIG.defaults.heightCm;
  const cameraMode = body.cameraMode ?? APP_CONFIG.defaults.cameraMode;
  const isManualDirection = body.isManualDirection ?? false;

  let runDirection = body.runDirection ?? 1;
  let lockedHip = null;
  const frames = [];
  for (const f of body.frames) {
    const lm = f.lm.map(([x, y, v]) => ({
      x,
      y,
      visibility: v === null ? undefined : v,
    }));
    const res = extractAnglesFromLandmarks(lm, body.frameWidth, body.frameHeight, {
      runDirection,
      isManualDirection,
      heightCm,
      videoTime: f.t,
    });
    runDirection = res.runDirection;

    const gate = evaluateCaptureFrame(res.extracted, frames, lockedHip);
    lockedHip = gate.lockedHip;
    if (gate.action === "finalize") break;
    if (gate.action === "accept") {
      frames.push(res.extracted);
      if (frames.length >= MAX_ACCEPTED_FRAMES) break;
    }
  }
  if (frames.length < MIN_ACCEPTED_FRAMES) {
    throw new Error(`insufficient_frames: ${frames.length}`);
  }

  const { cadence, summary: rawSummary } = analyzeCapturedFrames(frames, {
    heightCm,
    cameraMode,
    canvasW: body.frameWidth,
    runDirection,
  });
  const summary = plain(rawSummary);
  const gct = computeGctMetrics(summary, cadence);
  return {
    cadence,
    summary,
    metrics: {
      gctMs: gct.gctMs,
      flightMs: gct.flightMs,
      overallScore: calculateOverallRunningScore(summary, cadence),
    },
  };
}
