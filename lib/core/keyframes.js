import "server-only";
import { generatePoseMethodAlignedCycle } from "./biomechanics.js";
import { sampleCycleKeyframes } from "../player/keyframes.js";

// evaluateProfileAngles：渲染層取骨架入口（3.5 拆分並移除退回分支）
// 常數與 sampleCycleKeyframes 的單一來源在 lib/player/keyframes.js
export { CYCLE_KEYFRAME_NUMERIC_FIELDS, CYCLE_KEYFRAME_MIN_FRAMES } from "../player/keyframes.js";

// 渲染層取骨架的單一入口：有關鍵幀就內插，否則退回本地運動學
export function evaluateProfileAngles(profile, p) {
  if (profile.cycleKeyframes) {
    return sampleCycleKeyframes(profile.cycleKeyframes, p);
  }
  return generatePoseMethodAlignedCycle(p, profile.summary, profile.cadence);
}
