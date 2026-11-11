import "server-only";
import {
  computePersonalizedPhaseTiming,
  computeStrideForCameraMode,
} from "./biomechanics.js";

// ==========================================
// 週期解算純函式：評分、步頻偵測、週期統計、像素步幅、整段幀分析
// 純函式，不碰 DOM、不讀寫 state.js 全域；ES module（server-only）。
// 相依 biomechanics.js（呼叫 computeStrideForCameraMode 等）
// ==========================================

export function calculateOverallRunningScore(s, cadence) {
  let score = 100;
  const isBiomechanicalRunner =
    (s.avgElbow != null && s.avgElbow <= 100) &&
    ((s.hipRomDeg || 38) >= 36);
  const isWalking = cadence < 135 && !isBiomechanicalRunner;

  if (isWalking) {
    // ★ 行走步態評分標準 (Walking Biomechanics)
    if (s.comOffsetCm > 5.5) {
      score -= Math.min(25, (s.comOffsetCm - 5.5) * 3.5);
    }
    if (s.touchdownKnee < 155) {
      score -= Math.min(15, (155 - s.touchdownKnee) * 1.5);
    }
    if (s.trunkAngle > 8.0) {
      score -= Math.min(15, (s.trunkAngle - 8.0) * 2.5);
    }
    return Math.round(Math.max(65, Math.min(98, score)));
  }

  // 跑姿評分標準 (Running Pose Method)
  if (s.comOffsetCm > 6.5) {
    score -= Math.min(30, (s.comOffsetCm - 6.5) * 3.8);
  }

  if (s.touchdownKnee > 158) {
    score -= Math.min(18, (s.touchdownKnee - 158) * 2.2);
  }

  const pushExt = s.pushOffExtensionDeg || 14.0;
  if (pushExt > 18.0) {
    score -= Math.min(22, (pushExt - 18.0) * 1.8);
  }

  if (s.trunkAngle < 6.5)
    score -= Math.min(16, (6.5 - s.trunkAngle) * 3.2);
  else if (s.trunkAngle > 12.0)
    score -= Math.min(10, (s.trunkAngle - 12.0) * 2.2);

  if (s.minSwingKnee > 85)
    score -= Math.min(18, (s.minSwingKnee - 85) * 0.6);

  if (s.avgElbow < 76) score -= Math.min(10, (76 - s.avgElbow) * 0.75);
  else if (s.avgElbow > 108)
    score -= Math.min(8, (s.avgElbow - 108) * 0.6);

  if (cadence >= 135 && cadence < 175)
    score -= Math.min(10, (175 - cadence) * 0.7);

  return Math.round(Math.max(35, Math.min(99, score)));
}

export function detectCadenceFromFrames(frames) {
  // =========================================================================
  // ★ 核心升級 A：拋物線亞影格內插法 (Sub-frame Parabolic Interpolation) 算步頻
  // 解決 30fps 差 1 格就從 180 掉到 165 spm 的離散誤差！
  // =========================================================================
  const thighDiffs = frames.map(
    (f) =>
      ((f.rThigh || 0) - (f.lThigh || 0)) +
      ((f.lAnkleY || 0) - (f.rAnkleY || 0)) * 0.25,
  );
  const times = frames.map(
    (f, i) => f.videoTime || i * (1 / 30),
  );

  const smoothed = thighDiffs.map((curr, i, arr) => {
    const prev = arr[Math.max(0, i - 1)];
    const next = arr[Math.min(arr.length - 1, i + 1)];
    return (prev + curr + next) / 3;
  });

  const peakTimes = [];
  for (let i = 2; i < smoothed.length - 2; i++) {
    const isPeak =
      smoothed[i] > smoothed[i - 1] &&
      smoothed[i] >= smoothed[i - 2] &&
      smoothed[i] > smoothed[i + 1] &&
      smoothed[i] >= smoothed[i + 2] &&
      smoothed[i] > 1.8;
    const isValley =
      smoothed[i] < smoothed[i - 1] &&
      smoothed[i] <= smoothed[i - 2] &&
      smoothed[i] < smoothed[i + 1] &&
      smoothed[i] <= smoothed[i + 2] &&
      smoothed[i] < -1.8;

    if (isPeak || isValley) {
      // 拋物線三點內插：找出波峰在 i-1 與 i+1 之間的精確小數點偏移量 delta (-0.5 ~ +0.5)
      const y1 = smoothed[i - 1],
        y2 = smoothed[i],
        y3 = smoothed[i + 1];
      const denom = 2 * (2 * y2 - y1 - y3);
      const delta =
        Math.abs(denom) > 1e-4
          ? Math.max(-0.5, Math.min(0.5, (y3 - y1) / denom))
          : 0;
      const dtFrame =
        i < times.length - 1 ? times[i + 1] - times[i] : 1 / 30;
      const exactTime = times[i] + delta * dtFrame;

      if (
        peakTimes.length === 0 ||
        exactTime - peakTimes[peakTimes.length - 1] > 0.18
      ) {
        peakTimes.push(exactTime);
      }
    }
  }

  let detectedCadence = null;
  if (peakTimes.length >= 2) {
    const stepIntervals = [];
    for (let j = 1; j < peakTimes.length; j++) {
      const dt = peakTimes[j] - peakTimes[j - 1];
      // ★ 放寬全速域支援：0.20s (300spm) 到 1.10s (55spm)，涵蓋健走、慢步、超慢跑與衝刺！
      if (dt >= 0.20 && dt <= 1.10) {
        stepIntervals.push(dt);
      }
    }
    if (stepIntervals.length > 0) {
      stepIntervals.sort((a, b) => a - b);
      const medianStepSec =
        stepIntervals[Math.floor(stepIntervals.length * 0.5)];
      detectedCadence = Math.round(60 / medianStepSec);
    }
  }

  // 若波峰數不足未能偵測，設定安全兜底值
  if (detectedCadence === null) {
    detectedCadence = 180;
  }

  // ★ 核心升級：單腳雙步跨度（Stride Rate）倍頻自適應校正 (Half-Cadence Auto-Correction)
  // 在單側手持跟拍或對側腿遮擋情況下，波峰有時只抓到同側腳（間隔約 0.55s~0.75s，算出來步頻落在 75~118 spm）；
  // 若此時人體手肘夾角 <= 100° 且大腿擺幅 >= 36°（顯著高階跑姿特徵），說明此頻率實為單腳 Stride Rate，
  // 必須自動倍頻為雙腳 Step Rate 步頻 (例如 93 -> 186 spm, 98 -> 196 spm)！
  const sortedElbowsForCadence = [
    ...frames.map((f) => f.rElbowInterior || 82),
  ].sort((a, b) => a - b);
  const estMedianElbow =
    sortedElbowsForCadence[
      Math.floor(sortedElbowsForCadence.length * 0.5)
    ] || 85;
  const sortedHipRomForCadence = [
    ...frames.map((f) => f.hipSeparationDeg || 38),
  ].sort((a, b) => b - a);
  const estMaxHipRom =
    sortedHipRomForCadence[
      Math.floor(sortedHipRomForCadence.length * 0.15)
    ] || 38;

  const isBiomechanicalRunning =
    estMedianElbow <= 100 && estMaxHipRom >= 36;

  if (
    detectedCadence >= 70 &&
    detectedCadence <= 118 &&
    isBiomechanicalRunning
  ) {
    detectedCadence = Math.round(detectedCadence * 2);
  }

  // 支援 60 ~ 240 spm 全速域
  detectedCadence = Math.max(60, Math.min(240, detectedCadence));

  return { detectedCadence, isBiomechanicalRunning };
}

export function computeCycleSummaryStats(
  frames,
  detectedCadence,
  isBiomechanicalRunning,
  runDir,
) {
  // =========================================================================
  // ★ 核心升級 B：真實觸地瞬間偵測 (地面高度閾值 + 水平急煞 Foot Braking)
  // 徹底排除「空中擺盪最前端 (+20.7cm / 164°)」的假性跨步誤判！
  // =========================================================================
  const allLowY = frames
    .flatMap((f) => [f.lFootLowY || f.lAnkleY, f.rFootLowY || f.rAnkleY])
    .filter(Boolean)
    .sort((a, b) => b - a);
  const groundBaselineY =
    allLowY
      .slice(0, Math.max(1, Math.floor(allLowY.length * 0.15)))
      .reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(allLowY.length * 0.15));
  const avgBodyH =
    frames.reduce(
      (s, f) => s + (f.runnerPixelHeight || 240),
      0,
    ) / frames.length;
  // 腳底距離地面基準線在身高 4% 以內，才視為真正貼地
  const groundThresholdY = groundBaselineY - avgBodyH * 0.04;

  const trueTouchdownOffsets = [];
  const trueTouchdownKnees = [];

  for (let i = 1; i < frames.length - 1; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    const next = frames[i + 1];

    // 檢測左腳真實觸地
    const lY = curr.lFootLowY || curr.lAnkleY;
    const lVxPrev =
      ((curr.lStrikeCenterX ?? curr.lAnkleX) -
        (prev.lStrikeCenterX ?? prev.lAnkleX)) *
      runDir;
    const lVxNext =
      ((next.lStrikeCenterX ?? next.lAnkleX) -
        (curr.lStrikeCenterX ?? curr.lAnkleX)) *
      runDir;
    if (
      lY >= groundThresholdY &&
      curr.lThigh > 0 &&
      (lVxNext <= lVxPrev * 0.45 || Math.abs(lVxNext) < avgBodyH * 0.015)
    ) {
      trueTouchdownOffsets.push(curr.lComOffsetCm ?? curr.comOffset);
      trueTouchdownKnees.push(curr.lKneeInterior || 180 - curr.lKnee);
    }

    // 檢測右腳真實觸地
    const rY = curr.rFootLowY || curr.rAnkleY;
    const rVxPrev =
      ((curr.rStrikeCenterX ?? curr.rAnkleX) -
        (prev.rStrikeCenterX ?? prev.rAnkleX)) *
      runDir;
    const rVxNext =
      ((next.rStrikeCenterX ?? next.rAnkleX) -
        (curr.rStrikeCenterX ?? curr.rAnkleX)) *
      runDir;
    if (
      rY >= groundThresholdY &&
      curr.rThigh > 0 &&
      (rVxNext <= rVxPrev * 0.45 || Math.abs(rVxNext) < avgBodyH * 0.015)
    ) {
      trueTouchdownOffsets.push(curr.rComOffsetCm ?? curr.comOffset);
      trueTouchdownKnees.push(curr.rKneeInterior || 180 - curr.rKnee);
    }
  }

  // 取所有真實觸地幀的「中位數 (Median)」，不再受單一影格抖動影響！
  const getMedian = (arr, fallback) => {
    if (!arr || arr.length === 0) return fallback;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.5)];
  };

  const stableComOffset = getMedian(trueTouchdownOffsets, 4.8);
  const initialContactKnee = getMedian(trueTouchdownKnees, 154);

  const isWalkCadence = detectedCadence < 135 && !isBiomechanicalRunning;

  const sortedTrunks = [...frames.map((f) => f.trunk)].sort(
    (a, b) => a - b,
  );
  // 慢走步態軀幹前傾穩定，取中位數避免單一瞬時雜訊；跑步時取 75 百分位數反映落下前傾衝刺量
  const fallPhaseTrunk = isWalkCadence
    ? sortedTrunks[Math.floor(sortedTrunks.length * 0.5)] || 3.0
    : sortedTrunks[Math.floor(sortedTrunks.length * 0.75)] || 8.0;

  // ★ 走跑雙模擺盪膝角 (Swing Knee) 自適應過濾：
  // 跑步時 (cadence >= 135)，選手會將小腿折疊至 70°~90°，取 15% 分位數抓最大折疊；
  // 走路時 (cadence < 135)，膝蓋僅輕微彎曲 (130°~155°)，雙腿交疊易產生 MediaPipe 遮擋雜訊，
  // 應取中位數 (50%) 避免誤抓遮擋跳動，且放寬至真實走路的 125°~165°，還原自然鐘擺！
  const allSwingKnees = frames
    .flatMap((f) => [
      f.rKneeInterior || 180 - f.rKnee,
      f.lKneeInterior || 180 - f.lKnee,
    ])
    .sort((a, b) => a - b);
  const swingPercentile = isWalkCadence ? 0.5 : 0.15;
  const rawSwingVal =
    allSwingKnees[Math.floor(allSwingKnees.length * swingPercentile)] ||
    (isWalkCadence ? 145 : 80);
  const minSwingKnee = isWalkCadence
    ? Math.max(120, Math.min(165, rawSwingVal))
    : Math.max(68, Math.min(125, rawSwingVal));

  const sortedPushOffs = [
    ...frames.map((f) => f.pushOffAngle || 12.0),
  ].sort((a, b) => a - b);
  const maxPushOffExt = Math.max(
    8.0,
    Math.min(
      35.0,
      sortedPushOffs[Math.floor(sortedPushOffs.length * 0.82)],
    ),
  );

  const sortedElbows = [
    ...frames.map((f) => f.rElbowInterior || 82),
  ].sort((a, b) => a - b);
  const medianElbow = Math.max(
    50,
    Math.min(125, sortedElbows[Math.floor(sortedElbows.length * 0.5)]),
  );
  const sortedHipRom = [
    ...frames.map((f) => f.hipSeparationDeg || 38),
  ].sort((a, b) => b - a);
  const maxHipRom = Math.max(
    25,
    Math.min(
      62,
      sortedHipRom[Math.floor(sortedHipRom.length * 0.15)] || 38,
    ),
  );

  return {
    trunkAngle: Number(fallPhaseTrunk.toFixed(1)),
    comOffsetCm: Number(
      Math.max(1.5, Math.min(22.0, stableComOffset)).toFixed(1),
    ),
    touchdownKnee: Math.round(
      Math.max(145, Math.min(170, initialContactKnee)),
    ),
    minSwingKnee: Math.round(minSwingKnee),
    pushOffExtensionDeg: Number(maxPushOffExt.toFixed(1)),
    avgElbow: Math.round(medianElbow),
    footStrikeAngle: 2,
    hipRomDeg: Math.round(maxHipRom),
  };
}

export function computeMeasuredPixelStride(
  frames,
  detectedCadence,
  heightCm,
  canvasW,
) {
  const firstF = frames[0];
  const lastF = frames[frames.length - 1];
  const pixelDeltaX = Math.abs(
    (lastF.midHipX || 0) - (firstF.midHipX || 0),
  );
  const horizontalSpanRatio = pixelDeltaX / canvasW;

  // 1. 先把「像素算出來的真實位移」算好存起來備用
  const sampleDuration =
    Math.abs(lastF.videoTime - firstF.videoTime) || 1.2;
  const avgPixelH =
    frames.reduce(
      (sum, f) => sum + (f.runnerPixelHeight || 280),
      0,
    ) / frames.length;
  const metersPerPx = ((heightCm * 0.93) / 100) / Math.max(60, avgPixelH);
  const realMeters = pixelDeltaX * metersPerPx;
  const stepsCount = (detectedCadence / 60) * sampleDuration;
  const measuredPixelStride = Number(
    Math.max(
      0.08,
      Math.min(2.2, realMeters / Math.max(0.4, stepsCount)),
    ).toFixed(2),
  );

  // ★ 2. 智慧機位判定：
  // 在固定機位 (Static) 下，人物會持續穿過畫面；慢速走路 1.5s 跨度比例 >= 6% 即視為固定機位！
  // 只有在跑步機 (Treadmill) 或跟拍 (Tracking) 畫面中央靜止時 (跨度 < 6%)，才判定為跟拍。
  const isAutoDetectedStatic = horizontalSpanRatio >= 0.06;

  return { measuredPixelStride, isAutoDetectedStatic };
}

/**
 * 擷取完成後的解算本體（原 finalizeCycleExtraction 的純計算部分）。
 * 步幅以「偵測到的步頻」計算；Client 之後仍會依作用中 Profile 重算並覆寫（見 analyzer.js）。
 * @param {Array} frames 擷取到的幀（extractAnglesFromLandmarks 的回傳）
 * @param {{heightCm:number, cameraMode:string, canvasW:number, runDirection:number}} opts
 * @returns {{cadence:number, summary:object}}
 */
export function analyzeCapturedFrames(frames, opts) {
  const { heightCm, cameraMode, canvasW, runDirection: runDir } = opts;
  const { detectedCadence, isBiomechanicalRunning } =
    detectCadenceFromFrames(frames);

  const summary = {
    ...computeCycleSummaryStats(
      frames,
      detectedCadence,
      isBiomechanicalRunning,
      runDir,
    ),
    strideMeters: null,
  };

  const { measuredPixelStride, isAutoDetectedStatic } =
    computeMeasuredPixelStride(
      frames,
      detectedCadence,
      heightCm,
      canvasW || 640,
    );
  summary._measuredPixelStride = measuredPixelStride;
  summary._autoDetectedStatic = isAutoDetectedStatic;

  const stride = computeStrideForCameraMode(
    summary,
    cameraMode,
    heightCm,
    detectedCadence,
  );
  summary.strideMeters = stride.strideMeters;
  summary.measuredStrideMeters = stride.measuredStrideMeters;

  summary.phaseTiming = computePersonalizedPhaseTiming(
    summary,
    detectedCadence,
  );
  return { cadence: detectedCadence, summary };
}
