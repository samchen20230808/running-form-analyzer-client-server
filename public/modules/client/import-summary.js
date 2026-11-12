// 3.7：JSON 匯入的 summary 補預設值與前置檢查（瀏覽器共用，純函式）。
// buildImportSummary 為舊 buildSafeSummaryFromJSON 去掉 phaseTiming 正規化（改由 /api/derive 正規化）。
import { DERIVE_INPUT_LIMITS } from "./derive-request.js";

export function buildImportSummary(data) {
  const safeSummary = {
    trunkAngle: Number(data.summary.trunkAngle ?? 7.4),
    comOffsetCm: Number(data.summary.comOffsetCm ?? 3.0),
    touchdownKnee: Number(data.summary.touchdownKnee ?? 155),
    minSwingKnee: Number(data.summary.minSwingKnee ?? 74),
    pushOffExtensionDeg: Number(data.summary.pushOffExtensionDeg ?? 14.5),
    avgElbow: Number(data.summary.avgElbow ?? 84),
    footStrikeAngle: Number(data.summary.footStrikeAngle ?? 2),
    hipRomDeg: Number(data.summary.hipRomDeg ?? 38),
    strideMeters: Number(data.strideMeters ?? data.summary.strideMeters ?? 0.95),
    _measuredPixelStride:
      typeof data.summary._measuredPixelStride === "number"
        ? data.summary._measuredPixelStride
        : typeof data.summary.measuredStrideMeters === "number"
          ? data.summary.measuredStrideMeters
          : null,
    _autoDetectedStatic: Boolean(
      data.summary._autoDetectedStatic ??
        (data.cameraMode === "static" ||
          (data.summary.measuredStrideMeters && !data.isManualStride)),
    ),
    measuredStrideMeters:
      typeof data.summary.measuredStrideMeters === "number"
        ? data.summary.measuredStrideMeters
        : typeof data.summary._measuredPixelStride === "number"
          ? data.summary._measuredPixelStride
          : null,
  };

  const pt = data.phaseTiming || data.summary.phaseTiming;
  if (pt) safeSummary.phaseTiming = pt;
  return safeSummary;
}

// 回傳錯誤字串陣列（空陣列＝可送 derive）
export function checkImportInputs(summary, cadence) {
  const errs = [];
  const { maxCadence, maxSummaryAbs } = DERIVE_INPUT_LIMITS;
  if (typeof cadence !== "number" || !Number.isFinite(cadence) || cadence <= 0 || cadence > maxCadence) {
    errs.push(`cadence 須為 0 ~ ${maxCadence} 的正數`);
  }
  for (const [k, v] of Object.entries(summary || {})) {
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > maxSummaryAbs) {
      errs.push(`summary.${k} 絕對值超過 ${maxSummaryAbs}`);
    }
  }
  return errs;
}
