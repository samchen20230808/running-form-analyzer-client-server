import "server-only";

// ============================================================================
// ★ 核心解算與防護層 (V3.18 原始幾何解算 100% 絕對保留)
// ============================================================================

export function computePersonalizedPhaseTiming(summary, cadence = 180) {
  if (
    summary &&
    summary.phaseTiming &&
    typeof summary.phaseTiming.posePct === "number"
  ) {
    const rawPull = summary.phaseTiming.pullPct || 75;
    const normalizedPull =
      rawPull < 68 ? Math.min(85, rawPull + 20) : rawPull;
    return {
      touchPct: summary.phaseTiming.touchPct ?? 0,
      posePct: summary.phaseTiming.posePct,
      fallPct: summary.phaseTiming.fallPct,
      pullPct: normalizedPull,
    };
  }
  const s = summary || {};
  const comOffset = s.comOffsetCm ?? 3.2;
  const trunk = s.trunkAngle ?? 8.2;
  const swingKnee = s.minSwingKnee ?? 76;

  const overstrideDelay = Math.max(0, (comOffset - 4.5) * 0.7);
  const uprightDelay = Math.max(0, (7.5 - trunk) * 0.65);
  const lazyPullDelay =
    Math.max(0, (swingKnee - 78) * 0.16) +
    Math.max(0, (180 - cadence) * 0.12);

  const posePct = Math.round(
    Math.min(25, Math.max(12, 15 + overstrideDelay)),
  );
  const fallPct = Math.round(
    Math.min(
      42,
      Math.max(posePct + 11, 30 + overstrideDelay * 0.8 + uprightDelay),
    ),
  );
  const pullPct = Math.round(
    Math.min(86, Math.max(72, 75 + lazyPullDelay)),
  );

  return { touchPct: 0, posePct, fallPct, pullPct };
}

/**
 * ★ 核心力學升級：精確計算觸地時間 (GCT in ms) 與著地區間佔比
 * 依據步頻、重心落點 (comOffsetCm)、膝角過直煞車 (touchdownKnee) 與後蹬拖延 (pushOffExtension)
 * 與徐國峰教練 180~200ms 短觸地黃金標準深度比對！
 */
export function computeGctMetrics(summary, cadence = 180) {
  const s = summary || {};
  const c = Math.max(60, Math.min(240, cadence || 180));
  const stepMs = 60000 / c;
  const cycleMs = stepMs * 2;

  // ★ 若為行走步態 (Cadence < 135)：雙腳交替接地，零騰空飛行期 (Double Support)
  if (c < 135) {
    const walkGctMs = Math.round(stepMs * 0.62);
    const walkFlightMs = 0;
    const walkStancePct = Math.round((walkGctMs / cycleMs) * 100);
    return {
      cadence: c,
      stepMs: Math.round(stepMs),
      cycleMs: Math.round(cycleMs),
      gctMs: walkGctMs,
      flightMs: walkFlightMs,
      stancePct: walkStancePct,
      flightPct: 50 - walkStancePct,
      hsuGctMs: Math.round(stepMs * 0.56),
      hsuFlightMs: 0,
      hsuStancePct: walkStancePct,
      diffMs: 0,
      // 行走與徐國峰跑步基準不可比：diffMs 維持 0 供下游診斷沿用，UI 以 skipHsuCompare 改顯示「不比對」
      skipHsuCompare: true,
      // 行走時該區段是雙腳同時著地的重疊期，不是騰空；UI 以此取代「騰空 0ms」標籤
      flightLabel: "雙腳支撐",
      rating: "walking",
      ratingText: "🚶 行走步態 (雙腳交替支撐 • 零騰空)",
      ratingColor: "text-purple-300",
      advice: "散步/健走步態，重心平穩轉換，無騰空衝擊。",
    };
  }

  // 徐國峰 / 頂尖菁英跑者標準：觸地約佔單步的 56% (如 180spm 時約 186ms，195spm 時約 172ms)
  const hsuGctMs = Math.round(stepMs * 0.56);
  const hsuFlightMs = Math.round(stepMs - hsuGctMs);
  const hsuStancePct = Math.round((hsuGctMs / cycleMs) * 100);

  // 判斷是否為徐國峰黃金基準 profile
  const isHsu =
    (s.trunkAngle >= 7.8 && s.trunkAngle <= 8.6) &&
    (s.comOffsetCm <= 3.5) &&
    (s.touchdownKnee <= 156);

  if (isHsu && (!s.comOffsetCm || s.comOffsetCm <= 3.5)) {
    return {
      cadence: c,
      stepMs: Math.round(stepMs),
      cycleMs: Math.round(cycleMs),
      gctMs: hsuGctMs,
      flightMs: hsuFlightMs,
      stancePct: hsuStancePct,
      flightPct: 50 - hsuStancePct,
      hsuGctMs,
      hsuFlightMs,
      hsuStancePct,
      diffMs: 0,
      rating: "elite",
      ratingText: "✅ 頂尖短觸地 (菁英彈性)",
      ratingColor: "text-emerald-400",
      advice: "完美觸地彈性，零跨步煞車！",
    };
  }

  // 計算個人因姿勢偏差產生的額外觸地延遲
  const overstrideDelay = Math.max(0, ((s.comOffsetCm ?? 3.2) - 4.5) * 4.5);
  const kneeStraightDelay = Math.max(0, ((s.touchdownKnee ?? 155) - 158) * 2.8);
  const pushOffDelay = Math.max(0, ((s.pushOffExtensionDeg ?? 14.5) - 15.0) * 2.5);
  const uprightDelay = Math.max(0, (7.5 - (s.trunkAngle ?? 8.0)) * 2.0);

  const totalDelayMs = overstrideDelay + kneeStraightDelay + pushOffDelay + uprightDelay;
  const gctMs = Math.round(Math.min(380, Math.max(160, hsuGctMs + totalDelayMs)));
  const flightMs = Math.max(30, Math.round(stepMs - gctMs));
  const stancePct = Math.min(48, Math.max(28, Math.round((gctMs / cycleMs) * 100)));
  const flightPct = 50 - stancePct;
  const diffMs = gctMs - hsuGctMs;

  let rating = "good";
  let ratingText = "🟢 良好觸地 (進階跑者)";
  let ratingColor = "text-emerald-400";
  let advice = "觸地節奏流暢，維持輕快提踝！";

  if (diffMs > 55) {
    rating = "excessive";
    ratingText = `🚨 觸地過長 (+${diffMs}ms)`;
    ratingColor = "text-rose-400";
    advice = "嚴重跨步煞車或身後推蹬，建議縮小落點至臀下！";
  } else if (diffMs > 25) {
    rating = "long";
    ratingText = `⚠️ 觸地偏長 (+${diffMs}ms)`;
    ratingColor = "text-amber-400";
    advice = "略有煞車或推蹬拖延，注意前腳勿前踢！";
  } else if (diffMs <= 10) {
    rating = "elite";
    ratingText = "✅ 頂尖短觸地 (菁英彈性)";
    ratingColor = "text-emerald-400";
    advice = "如蜻蜓點水，彈性格外優異！";
  }

  return {
    cadence: c,
    stepMs: Math.round(stepMs),
    cycleMs: Math.round(cycleMs),
    gctMs,
    flightMs,
    stancePct,
    flightPct,
    hsuGctMs,
    hsuFlightMs,
    hsuStancePct,
    diffMs,
    rating,
    ratingText,
    ratingColor,
    advice,
  };
}

export function generatePoseMethodAlignedCycle(p, params, cadence = 180) {
  const pSummary = params || {};
  const isBiomechanicalRunner =
    (pSummary.avgElbow != null && pSummary.avgElbow <= 100) &&
    ((pSummary.hipRomDeg || 38) >= 36);
  const isWalking = cadence < 135 && !isBiomechanicalRunner;
  const timing = computePersonalizedPhaseTiming(pSummary, cadence);
  const poseP = (timing.posePct || 15) / 100;
  const fallP = (timing.fallPct || 30) / 100;
  const pullP = (timing.pullPct || 75) / 100;

  const rad = p * Math.PI * 2;
  const fallLeanBoost =
    !isWalking && p >= poseP + 0.04 && p <= fallP + 0.08 ? 1.2 : 0;
  const baseTrunk = pSummary.trunkAngle ?? (isWalking ? 2.5 : 8.2);
  const trunk = isWalking
    ? Math.max(0.5, Math.min(5.0, baseTrunk)) + 0.25 * Math.sin(rad * 2)
    : baseTrunk + fallLeanBoost + 0.5 * Math.sin(rad * 2);

  // ★ 若為行走步態 (cadence < 135)，採用高真實度生物力學「倒單擺雙腿支撐行走模型」
  // 具備完整的 60% 支撐期、40% 擺盪期、足廓清提腿高度 (50°~56°屈膝離地) 與雙腿支撐期 (Double Support)！
  if (isWalking) {
    const hipRom = pSummary.hipRomDeg || 36;
    const maxFwdThigh = Math.min(24, Math.max(12, hipRom * 0.44));
    const maxBackThigh = Math.min(20, Math.max(10, hipRom * 0.36));

    function solveWalkingLeg(phase) {
      let thigh, knee, ankle, isStance;
      if (phase < 0.6) {
        isStance = true;
        const t = phase / 0.6;
        if (t < 0.2) {
          // 1. 著地至承重期 (Initial Contact -> Loading Response): 腳跟著地，膝微屈 6° -> 15° 吸震
          const s = t / 0.2;
          thigh = maxFwdThigh * (1 - s) + maxFwdThigh * 0.45 * s;
          knee = 6 * (1 - s) + 15 * s;
          ankle = 6 * (1 - s) + 0 * s;
        } else if (t < 0.6) {
          // 2. 單腿支撐期 (Mid-Stance): 大腿過垂直線，膝伸展至 6°
          const s = (t - 0.2) / 0.4;
          thigh =
            maxFwdThigh * 0.45 * (1 - s) - maxBackThigh * 0.4 * s;
          knee = 15 * (1 - s) + 6 * s;
          ankle = 0;
        } else if (t < 0.85) {
          // 3. 支撐末期 (Terminal Stance): 後腿向後伸展，足跟提起
          const s = (t - 0.6) / 0.25;
          thigh = -(maxBackThigh * 0.4) * (1 - s) - maxBackThigh * s;
          knee = 6 * (1 - s) + 10 * s;
          ankle = 0 * (1 - s) + 10 * s;
        } else {
          // 4. 擺盪前期推離 (Pre-Swing / Toe-off): 膝關節迅速屈曲至 38° 準備離地
          const s = (t - 0.85) / 0.15;
          thigh = -maxBackThigh * (1 - s) - maxBackThigh * 0.65 * s;
          knee = 10 * (1 - s) + 38 * s;
          ankle = 10 * (1 - s) + 14 * s;
        }
      } else {
        isStance = false;
        const t = (phase - 0.6) / 0.4;
        if (t < 0.4) {
          // 5. 早期擺盪 (Initial Swing): 腳掌離地！膝關節屈曲至峰值 56° 提供足廓清淨空高度
          const s = t / 0.4;
          thigh = -(maxBackThigh * 0.65) * (1 - s) + 0 * s;
          knee = 38 * (1 - s) + 56 * s;
          ankle = 14 * (1 - s) - 4 * s;
        } else if (t < 0.75) {
          // 6. 中期擺盪 (Mid-Swing): 大腿向前擺盪，小腿向前下落
          const s = (t - 0.4) / 0.35;
          thigh = 0 * (1 - s) + maxFwdThigh * s;
          knee = 56 * (1 - s) + 22 * s;
          ankle = -4 * (1 - s) - 2 * s;
        } else {
          // 7. 末期擺盪 (Terminal Swing): 膝關節伸直至 6° 準備腳跟著地
          const s = (t - 0.75) / 0.25;
          thigh = maxFwdThigh * (1 - s) + maxFwdThigh * s;
          knee = 22 * (1 - s) + 6 * s;
          ankle = -2 * (1 - s) + 6 * s;
        }
      }
      return { thigh, knee, ankle, isStance };
    }

    const right = solveWalkingLeg(p);
    const left = solveWalkingLeg((p + 0.5) % 1.0);

    const avgElbow = pSummary.avgElbow ?? 125;
    const elbowFlexFromStraight = Math.max(
      15,
      Math.min(130, 180 - avgElbow),
    );
    const shoulderAmp = 14;
    const rShoulder = shoulderAmp * Math.cos(rad);
    const lShoulder = shoulderAmp * Math.cos(rad + Math.PI);
    const rElbow = elbowFlexFromStraight - 3 * Math.sin(rad);
    const lElbow = elbowFlexFromStraight - 3 * Math.sin(rad + Math.PI);

    return {
      trunk,
      rThigh: right.thigh,
      rKnee: right.knee,
      rAnkle: right.ankle,
      rIsStance: right.isStance,
      lThigh: left.thigh,
      lKnee: left.knee,
      lAnkle: left.ankle,
      lIsStance: left.isStance,
      rShoulder,
      rElbow,
      lShoulder,
      lElbow,
      comOffset: pSummary.comOffsetCm ?? 1.5,
      phaseTiming: timing,
    };
  }

  const strideBonusDeg = ((pSummary.strideMeters || 0.95) - 1.0) * 10;
  const comOffset = pSummary.comOffsetCm ?? 3.2;

  const tdThigh = Math.min(
    32,
    Math.max(13, 10 + comOffset * 1.15 + strideBonusDeg * 0.3),
  );
  const fallBackThigh = Math.min(
    26,
    Math.max(
      12,
      14 +
        (pSummary.pushOffExtensionDeg
          ? (pSummary.pushOffExtensionDeg - 14) * 0.8
          : 0),
    ),
  );
  const tdKneeFlex = Math.max(
    14,
    Math.min(34, 180 - (pSummary.touchdownKnee ?? 155)),
  );
  const maxPullKneeFlex = Math.max(
    58,
    Math.min(115, 180 - (pSummary.minSwingKnee ?? 76)),
  );

  function solveRightLegAsProtagonist(phase) {
    let thigh,
      knee,
      ankle,
      isStance = false;

    if (phase <= poseP) {
      const t = phase / Math.max(0.05, poseP);
      const ease = Math.sin(t * (Math.PI * 0.5));
      thigh = -10 * (1 - t) + 11.5 * t;
      knee = maxPullKneeFlex * 0.7 * (1 - ease) + maxPullKneeFlex * ease;
      ankle = 6 * (1 - ease) - 5 * ease;
    } else if (phase < 0.5) {
      const t = (phase - poseP) / Math.max(0.1, 0.5 - poseP);
      thigh = 11.5 * (1 - t) + tdThigh * t;
      knee =
        maxPullKneeFlex * Math.pow(1 - t, 1.35) +
        tdKneeFlex * (1 - Math.pow(1 - t, 1.35));
      ankle = -5 * (1 - t) + (comOffset > 8 ? 12 : 0) * t;
    } else if (phase < 0.64) {
      isStance = true;
      const t = (phase - 0.5) / 0.14;
      thigh = tdThigh * (1 - t) + 4.0 * t;
      knee = tdKneeFlex * (1 - t) + (tdKneeFlex + 8) * t;
      ankle = (comOffset > 8 ? 12 : 0) * (1 - t) + 5 * t;
    } else if (phase < 0.72) {
      isStance = true;
      const t = (phase - 0.64) / 0.08;
      thigh = 4.0 - t * (4.0 + fallBackThigh);
      knee = (tdKneeFlex + 8) * (1 - t) + 18 * t;
      ankle = 5 + t * 8;
    } else {
      const t = (phase - 0.72) / 0.28;
      thigh = -fallBackThigh * (1 - t) + -10 * t;
      knee = 18 + Math.pow(t, 0.85) * (maxPullKneeFlex * 0.7 - 18);
      ankle = 13 * (1 - t) + 6 * t;
    }
    return { thigh, knee, ankle, isStance };
  }

  const right = solveRightLegAsProtagonist(p);
  const left = solveRightLegAsProtagonist((p + 0.5) % 1.0);

  const avgElbow = pSummary.avgElbow ?? 86;
  const elbowFlexFromStraight = Math.max(
    40,
    Math.min(130, 180 - avgElbow),
  );
  const rShoulder = 23 * Math.cos(rad) + (avgElbow < 75 ? 6 : -3);
  const lShoulder =
    23 * Math.cos(rad + Math.PI) + (avgElbow < 75 ? 6 : -3);
  const rElbow = elbowFlexFromStraight - 6 * Math.sin(rad);
  const lElbow = elbowFlexFromStraight - 6 * Math.sin(rad + Math.PI);

  return {
    trunk,
    rThigh: right.thigh,
    rKnee: right.knee,
    rAnkle: right.ankle,
    rIsStance: right.isStance,
    lThigh: left.thigh,
    lKnee: left.knee,
    lAnkle: left.ankle,
    lIsStance: left.isStance,
    rShoulder,
    rElbow,
    lShoulder,
    lElbow,
    comOffset,
    phaseTiming: timing,
  };
}

export function computeAutoStrideMeters(profileSummary, heightCm, cadence = 180) {
  const legLengthMeters = (heightCm / 100) * 0.5;
  const hipRomDeg =
    profileSummary && profileSummary.hipRomDeg
      ? profileSummary.hipRomDeg
      : 38;
  const hipRomRad = (hipRomDeg * Math.PI) / 180;
  const swingChord = 2 * legLengthMeters * Math.sin(hipRomRad * 0.5);
  const trunk =
    profileSummary && typeof profileSummary.trunkAngle === "number"
      ? profileSummary.trunkAngle
      : 4.0;

  // ★ 走跑雙模自適應 (Walking vs Running Stride Model)
  const isBiomechanicalRunner =
    profileSummary &&
    profileSummary.avgElbow != null &&
    profileSummary.avgElbow <= 100 &&
    hipRomDeg >= 36;

  let flightBonus = 1.25 + (trunk - 4.0) * 0.025;
  let minStride = 0.55;
  let maxStride = 1.85;

  if (cadence < 135 && !isBiomechanicalRunner) {
    // 🚶 行走步態：雙腳持續接地，零騰空期，步幅為跨步投影 (約 0.85 ~ 0.92 弦長)
    flightBonus = 0.88;
    minStride = 0.35;
    maxStride = 0.85;
  } else if (cadence < 165) {
    // 🏃 超慢跑 / 慢跑過渡步態：微小騰空
    const ratio = (cadence - 135) / 30; // 0 ~ 1
    flightBonus = 0.95 + ratio * 0.25;
    minStride = 0.45;
    maxStride = 1.35;
  } else if (hipRomDeg < 28) {
    flightBonus = 0.65;
    minStride = 0.18;
  }

  const estimated = swingChord * flightBonus;
  return Number(
    Math.max(minStride, Math.min(maxStride, estimated)).toFixed(2),
  );
}

/**
 * 依據選擇的機位模式重新計算步幅
 */
export function computeStrideForCameraMode(s, cameraMode, heightCm, curCadence) {
  // 靜態像素測量值：優先取已保存的 _measuredPixelStride
  const pixelVal =
    typeof s._measuredPixelStride === "number"
      ? s._measuredPixelStride
      : (typeof s.measuredStrideMeters === "number" && s.measuredStrideMeters > 0
          ? s.measuredStrideMeters
          : null);

  const isStatic =
    cameraMode === "static" ||
    (cameraMode === "auto" && Boolean(s._autoDetectedStatic));

  if (isStatic && typeof pixelVal === "number") {
    // 📷 走像素測量
    return {
      pixelVal,
      strideMeters: pixelVal,
      measuredStrideMeters: pixelVal,
      strideModeText:
        cameraMode === "static"
          ? "📷 手動鎖定靜態機位"
          : "📷 靜態機位像素測量",
    };
  }
  // 🏃 走擺腿角度推算 (跟拍/跑步機/走路自適應)
  return {
    pixelVal,
    strideMeters: computeAutoStrideMeters(s, heightCm, curCadence),
    measuredStrideMeters: null,
    strideModeText:
      cameraMode === "tracking"
        ? (curCadence < 135 ? "🚶 手動鎖定跟拍(走路)" : "🏃 手動鎖定動態跟拍")
        : (curCadence < 135 ? "🤖 AI依步態推算 (散步/健走)" : "🤖 AI依擺腿推算 (動態跟拍)"),
  };
}

export function parseManualStrideValue(val) {
  const parsed = parseFloat(val);
  if (isNaN(parsed) || parsed < 0.05 || parsed > 2.5) return null;
  return Number(parsed.toFixed(2));
}

export function solveKinematics(angles, originX, groundY, scale = 1.0) {
  const d2r = Math.PI / 180;
  const hipX = originX;

  const trunkLen = 96 * scale;
  const headLen = 26 * scale;
  const thighLen = 78 * scale;
  const shankLen = 76 * scale;
  const footLen = 28 * scale;
  const upperArmLen = 54 * scale;
  const forearmLen = 50 * scale;

  const dir = 1;

  function computeLegRelative(
    thighDeg = 0,
    kneeFlexDeg = 20,
    ankleDeg = 0,
  ) {
    const tRad = thighDeg * d2r;
    const kneeDX = dir * Math.sin(tRad) * thighLen;
    const kneeDY = Math.cos(tRad) * thighLen;

    const safeKneeFlex = Math.max(4, Math.min(125, kneeFlexDeg));
    const sRad = (thighDeg - safeKneeFlex) * d2r;
    const ankleDX = kneeDX + dir * Math.sin(sRad) * shankLen;
    const ankleDY = kneeDY + Math.cos(sRad) * shankLen;

    const footGlobalDeg = Math.max(
      -25,
      Math.min(35, (thighDeg - safeKneeFlex) * 0.25 + (ankleDeg || 0)),
    );
    const fRad = (82 + footGlobalDeg) * d2r;
    const toeDX = ankleDX + dir * Math.sin(fRad) * (footLen * 0.72);
    const toeDY = ankleDY + Math.cos(fRad) * (footLen * 0.72);
    const heelDX = ankleDX - dir * Math.sin(fRad) * (footLen * 0.28);
    const heelDY = ankleDY - Math.cos(fRad) * (footLen * 0.28);

    return {
      kneeDX,
      kneeDY,
      ankleDX,
      ankleDY,
      toeDX,
      toeDY,
      heelDX,
      heelDY,
    };
  }

  const rRel = computeLegRelative(
    angles.rThigh,
    angles.rKnee,
    angles.rAnkle,
  );
  const lRel = computeLegRelative(
    angles.lThigh,
    angles.lKnee,
    angles.lAnkle,
  );

  const rMaxDY = Math.max(rRel.ankleDY, rRel.toeDY, rRel.heelDY);
  const lMaxDY = Math.max(lRel.ankleDY, lRel.toeDY, lRel.heelDY);
  const lowestFootDY = Math.max(rMaxDY, lMaxDY);

  let hipY;
  if (angles.lIsStance && angles.rIsStance) {
    // 雙腳支撐期 (Double Support): 以支撐高度較高的腿鎖定骨盆，避免後腿拖曳時骨盆被拉至地面
    hipY = groundY - 3 - Math.max(lMaxDY, rMaxDY);
  } else if (angles.lIsStance) {
    hipY = groundY - 3 - lMaxDY;
  } else if (angles.rIsStance) {
    hipY = groundY - 3 - rMaxDY;
  } else {
    hipY = Math.min(groundY - 8 - lowestFootDY, groundY - 148 * scale);
  }

  const trunkAngle = angles.trunk ?? 8.2;
  const trunkRad = trunkAngle * d2r;
  const shoulderX = hipX + dir * Math.sin(trunkRad) * trunkLen;
  const shoulderY = hipY - Math.cos(trunkRad) * trunkLen;

  const headX = shoulderX + dir * Math.sin(trunkRad * 0.85) * headLen;
  const headY = shoulderY - Math.cos(trunkRad * 0.85) * headLen;

  const buildAbsLeg = (rel) => ({
    knee: { x: hipX + rel.kneeDX, y: hipY + rel.kneeDY },
    ankle: { x: hipX + rel.ankleDX, y: hipY + rel.ankleDY },
    toe: { x: hipX + rel.toeDX, y: hipY + rel.toeDY },
    heel: { x: hipX + rel.heelDX, y: hipY + rel.heelDY },
  });

  function solveArm(shoulderDeg = 0, elbowFlexDeg = 80) {
    const sRad = (shoulderDeg - trunkAngle) * d2r;
    const elbowX = shoulderX + dir * Math.sin(sRad) * upperArmLen;
    const elbowY = shoulderY + Math.cos(sRad) * upperArmLen;
    const safeElbowFlex = Math.max(25, Math.min(135, elbowFlexDeg));
    const eRad = (shoulderDeg - trunkAngle + safeElbowFlex) * d2r;
    const wristX = elbowX + dir * Math.sin(eRad) * forearmLen;
    const wristY = elbowY + Math.cos(eRad) * forearmLen;
    return {
      elbow: { x: elbowX, y: elbowY },
      wrist: { x: wristX, y: wristY },
    };
  }

  return {
    hip: { x: hipX, y: hipY },
    shoulder: { x: shoulderX, y: shoulderY },
    head: { x: headX, y: headY },
    rightLeg: buildAbsLeg(rRel),
    leftLeg: buildAbsLeg(lRel),
    rightArm: solveArm(angles.rShoulder, angles.rElbow),
    leftArm: solveArm(angles.lShoulder, angles.lElbow),
  };
}
