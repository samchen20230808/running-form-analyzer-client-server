// 內建 profile 的靜態資料（單一來源，非 server-only）。
// 3.5：由 public/js/config.js 的 RUNNER_PROFILES 字面值搬入（不含 evalCycle）。
// 修改本檔後須執行 npm run bake:profiles（重新烘焙關鍵幀與模擬擷取資料並同步到 public/modules/）。

export const BUILTIN_PROFILE_KEYS = ["hsu_pose_method", "night_track_runner", "custom_captured"];
export const REFERENCE_PROFILE_KEY = "hsu_pose_method"; // 虛影／波形參考
export const SIM_CAPTURE_SOURCE_KEY = "night_track_runner"; // 模擬擷取的合成來源

function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const BUILTIN_PROFILES = deepFreeze({
  hsu_pose_method: {
    name: "★ 徐國峰教練 (關鍵跑姿黃金標準)",
    cadence: 184,
    appearance: {
      capColor: "#F8FAFC",
      shirtColor: "#2563EB",
      shortsColor: "#0F172A",
      shoeColor: "#1E293B",
      soleColor: "#334155",
    },
    summary: {
      trunkAngle: 8.2,
      comOffsetCm: 3.2,
      touchdownKnee: 155,
      minSwingKnee: 76,
      avgElbow: 86,
      pushOffExtensionDeg: 14.0,
      footStrikeAngle: -1,
      hipRomDeg: 38,
      strideMeters: 1.12,
      phaseTiming: { touchPct: 0, posePct: 15, fallPct: 30, pullPct: 75 },
    },
  },
  night_track_runner: {
    name: "歷史紀錄：夜間跑道舊影片 (跨步與晚拉腿實測對照)",
    cadence: 166,
    appearance: {
      capColor: null,
      shirtColor: "#64748B",
      shortsColor: "#0F172A",
      shoeColor: "#F8FAFC",
      soleColor: "#38BDF8",
    },
    summary: {
      trunkAngle: 3.5,
      comOffsetCm: 13.2,
      touchdownKnee: 162,
      minSwingKnee: 108,
      avgElbow: 64,
      pushOffExtensionDeg: 28.5,
      footStrikeAngle: 14,
      hipRomDeg: 46,
      strideMeters: 0.96,
      phaseTiming: { touchPct: 0, posePct: 21, fallPct: 38, pullPct: 82 },
    },
  },
  custom_captured: {
    name: "🎥 實測影片分析檔 (您上傳的影片)",
    cadence: 180,
    appearance: {
      capColor: null,
      shirtColor: "#06B6D4",
      shortsColor: "#0F172A",
      shoeColor: "#F8FAFC",
      soleColor: "#10B981",
    },
    summary: {
      trunkAngle: 7.4,
      comOffsetCm: 2.8,
      touchdownKnee: 155,
      minSwingKnee: 74,
      avgElbow: 84,
      pushOffExtensionDeg: 15.0,
      footStrikeAngle: 2,
      hipRomDeg: 38,
      strideMeters: 0.95,
      phaseTiming: { touchPct: 0, posePct: 15, fallPct: 30, pullPct: 75 },
    },
  },
});
