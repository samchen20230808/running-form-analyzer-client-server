import { BUILTIN_PROFILES, BUILTIN_PROFILE_KEYS } from "./builtin.js";
import { BAKED_CYCLE_KEYFRAMES } from "./baked-keyframes.js";

export * from "./builtin.js";
export { BAKED_CYCLE_KEYFRAMES } from "./baked-keyframes.js";
export { SIM_CAPTURE_REQUEST, SIM_CAPTURE_META } from "./sim-capture.js";

// 回傳可改寫的深複本（執行期狀態），每個內建 profile 附上烘焙關鍵幀。靜態資料保持凍結。
export function createBuiltinProfiles() {
  const out = {};
  for (const key of BUILTIN_PROFILE_KEYS) {
    out[key] = {
      ...structuredClone(BUILTIN_PROFILES[key]),
      cycleKeyframes: structuredClone(BAKED_CYCLE_KEYFRAMES[key]),
    };
  }
  return out;
}
