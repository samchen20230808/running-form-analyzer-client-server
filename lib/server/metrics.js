import "server-only";
// /api/analyze 與 /api/derive 共用：契約 1.1.0 的 metrics（鍵順序固定）。
import * as core from "../core/index.js";

const plain = (v) => JSON.parse(JSON.stringify(v));

export function buildMetrics(summary, cadence) {
  const gct = core.computeGctMetrics(summary, cadence);
  const isBiomechanicalRunner =
    summary.avgElbow != null && summary.avgElbow <= 100 && (summary.hipRomDeg || 38) >= 36;
  return {
    gctMs: gct.gctMs,
    flightMs: gct.flightMs,
    isWalking: cadence < 135 && !isBiomechanicalRunner,
    overallScore: core.calculateOverallRunningScore(summary, cadence),
    gct: plain(gct),
  };
}
