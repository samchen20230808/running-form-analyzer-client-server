// 契約 v1.0.0 驗證（純函式，不碰 DOM，只依賴 APP_CONFIG；非 server-only，Epic 3 的 JSON 匯入會在瀏覽器使用）。
// 逐字搬自舊專案 js/analyzer.js 的 validateAnalysisJSON。不得 import lib/core 或 lib/server。
import { APP_CONFIG } from "../config.js";

export function validateAnalysisJSON(data) {
  const result = {
    ok: true,
    legacy: false,
    schemaVersion: null,
    errors: [],
    warnings: [],
  };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    result.ok = false;
    result.errors.push("JSON 根節點必須是物件");
    return result;
  }
  if (data.schemaVersion === undefined || data.schemaVersion === null) {
    result.legacy = true;
    return result;
  }
  result.schemaVersion = String(data.schemaVersion);
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(result.schemaVersion);
  if (!m) {
    result.ok = false;
    result.errors.push("schemaVersion 格式不符：" + result.schemaVersion);
    return result;
  }
  const supportedMajor = Number(
    String(APP_CONFIG.analysisSchemaVersion).split(".")[0],
  );
  if (Number(m[1]) > supportedMajor) {
    result.ok = false;
    result.errors.push(
      "不支援的 schemaVersion 主版本：" + result.schemaVersion,
    );
    return result;
  }
  if (typeof data.cadence !== "number") {
    result.warnings.push("缺少必填欄位 cadence，將使用預設值");
  }
  if (data.summary && typeof data.summary === "object") {
    [
      "trunkAngle",
      "comOffsetCm",
      "touchdownKnee",
      "minSwingKnee",
      "pushOffExtensionDeg",
      "avgElbow",
      "hipRomDeg",
      "strideMeters",
    ].forEach((k) => {
      if (typeof data.summary[k] !== "number") {
        result.warnings.push("summary 缺少必填欄位 " + k + "，將使用預設值");
      }
    });
  }
  return result;
}
