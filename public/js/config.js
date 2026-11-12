// ============================================================================
// ★ 系統全域版本與設定 (Single Source of Truth)
// ============================================================================
const APP_CONFIG = {
  version: "V4.0",
  analysisSchemaVersion: "1.1.0", // 分析結果 JSON 契約版本（見 docs/analysis-json-contract.md）
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


// 3.5：內建 profile 的靜態資料與烘焙關鍵幀在 lib/profiles（經 modules/bridge.js 的 RFA.profiles）
const RUNNER_PROFILES = {};

function attachEvalCycle(profile) {
  profile.evalCycle = function (p) {
    return RFA.player.evaluateProfileAngles(this, p);
  };
  return profile;
}

function initRunnerProfiles() {
  const built = RFA.profiles.createBuiltinProfiles();
  for (const key of RFA.profiles.BUILTIN_PROFILE_KEYS) {
    RUNNER_PROFILES[key] = attachEvalCycle(built[key]);
  }
}
