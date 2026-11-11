import "server-only";
import { generatePoseMethodAlignedCycle } from "./biomechanics.js";
import { CYCLE_KEYFRAME_NUMERIC_FIELDS } from "./keyframes.js";

// 以現有運動學產生 n + 1 幀等距關鍵幀（末幀複製首幀並設 p = 1）。
// 原在 Client 的 js/keyframes.js（2.2 暫時／驗證用），2.3 搬到 Server。
// ES module（server-only）：相依 biomechanics.js 與 keyframes.js。
export function buildCycleKeyframesFromSummary(summary, cadence, n = 100) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const a = generatePoseMethodAlignedCycle(i / n, summary, cadence);
    const f = { p: i / n };
    for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) f[k] = a[k];
    f.rIsStance = a.rIsStance;
    f.lIsStance = a.lIsStance;
    frames.push(f);
  }
  frames.push({ ...frames[0], p: 1 });
  return {
    model: "angles-sagittal-v1",
    interpolation: "linear",
    phaseBasis: "animationCycle",
    frames,
  };
}
