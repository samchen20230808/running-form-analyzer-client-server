// ============================================================================
// ★ 系統全域版本與設定 (Single Source of Truth)
// ============================================================================
const APP_CONFIG = {
  version: "V3.29",
  analysisSchemaVersion: "1.0.0", // 分析結果 JSON 契約版本（見 docs/analysis-json-contract.md）
  versionName: "高速跑姿防漏格與單腳步頻校正版 (動態模糊視野放寬 • 走跑多維智能辨識 • 雙步倍頻重校)",
  systemName: "AI 跑姿生物力學與骨架循環分析系統",
  subtitle:
    "右腿主角視角 • 高速防漏格採樣 • 走跑多維智能辨識 • 雙步倍頻重校 • 實體觸地區間 (Stance)",
  heroTitle:
    "🎯 高速跑姿動態模糊採樣放寬 ＋ 單腳雙步倍頻自適應校正（告別跑姿誤判慢走）",
  heroDesc:
    "針對手持跟拍與黑色緊身褲等高速動態模糊場景，全面放寬腳踝過嚴遮蔽門檻，引入單腳步頻（Stride Rate）倍頻智慧辨識與多維度走跑特徵判定，徹底杜絕高速跑姿被誤殺為散步！",
  updatedAt: "2026-11-02",
  defaults: {
    cadence: 180,
    heightCm: 172,
    cameraMode: "auto",
  },
};

function applyAppConfig() {
  document.title = `${APP_CONFIG.systemName} ${APP_CONFIG.version} (${APP_CONFIG.versionName})`;
  const navTitle = document.getElementById("navSystemTitle");
  if (navTitle) navTitle.textContent = APP_CONFIG.systemName;
  const navBadge = document.getElementById("navVersionBadge");
  if (navBadge) navBadge.textContent = `${APP_CONFIG.version} 核心升級版`;
  const navSub = document.getElementById("navSubtitle");
  if (navSub) navSub.textContent = APP_CONFIG.subtitle;
  const heroBadge = document.getElementById("heroVersionBadge");
  if (heroBadge) heroBadge.textContent = APP_CONFIG.version;
  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) heroTitle.textContent = APP_CONFIG.heroTitle;
  const heroDesc = document.getElementById("heroDesc");
  if (heroDesc) heroDesc.textContent = APP_CONFIG.heroDesc;
  const footerText = document.getElementById("footerVersionText");
  if (footerText)
    footerText.textContent = `${APP_CONFIG.systemName} ${APP_CONFIG.version} • ${APP_CONFIG.versionName}`;
}


const RUNNER_PROFILES = {
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
    evalCycle: function (p) {
      return evaluateProfileAngles(this, p);
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
    evalCycle: function (p) {
      return evaluateProfileAngles(this, p);
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
    evalCycle: function (p) {
      return evaluateProfileAngles(this, p);
    },
  },
};
