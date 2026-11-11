import "server-only";

// ==========================================
// 骨架 landmarks → 角度／位置解算與擷取閘門
// 純函式，不碰 DOM、不讀寫 state.js 全域；ES module（server-only）。
// 方向偵測的結果以回傳值帶出（runDirection），由呼叫端決定是否更新 UI。
// ==========================================

/**
 * @param {Array<{x:number,y:number,visibility?:number}>} lm 33 點正規化 landmarks
 * @param {number} W 畫面寬（px）
 * @param {number} H 畫面高（px）
 * @param {{runDirection:number, isManualDirection:boolean, heightCm:number, videoTime:number}} opts
 * @returns {{extracted:object, runDirection:number}} runDirection 為本幀實際使用的方向
 */
export function extractAnglesFromLandmarks(lm, W, H, opts) {
  const { heightCm, isManualDirection, videoTime } = opts;
  let dir = opts.runDirection;
  const P = (idx) => ({
    x: lm[idx].x * W,
    y: lm[idx].y * H,
    v: lm[idx].visibility || 0,
  });

  if (!isManualDirection && lm[0] && (lm[7] || lm[8])) {
    const noseX = P(0).x;
    const earMidX = (P(7).x + P(8).x) * 0.5;
    const faceDeltaX = noseX - earMidX;
    if (Math.abs(faceDeltaX) > W * 0.012) {
      dir = faceDeltaX > 0 ? 1 : -1;
    }
  }

  const angle3Pt = (A, B, C) => {
    const abx = A.x - B.x,
      aby = A.y - B.y;
    const cbx = C.x - B.x,
      cby = C.y - B.y;
    const dot = abx * cbx + aby * cby;
    const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
    if (mag < 1e-5) return 180;
    return (
      Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI)
    );
  };
  const limbAngleFromVertical = (topPt, botPt) => {
    const dx = (botPt.x - topPt.x) * dir;
    const dy = botPt.y - topPt.y;
    return Math.atan2(dx, dy) * (180 / Math.PI);
  };

  const midShoulder = {
    x: (P(11).x + P(12).x) * 0.5,
    y: (P(11).y + P(12).y) * 0.5,
  };
  const midHip = {
    x: (P(23).x + P(24).x) * 0.5,
    y: (P(23).y + P(24).y) * 0.5,
  };

  const rawTorsoLean =
    Math.atan2(
      (midShoulder.x - midHip.x) * dir,
      -(midShoulder.y - midHip.y),
    ) *
    (180 / Math.PI);

  const leftIsLower = P(27).y >= P(28).y;
  const stanceAnkle = leftIsLower ? P(27) : P(28);
  const rawWholeBodyFallAngle =
    Math.atan2(
      (midShoulder.x - stanceAnkle.x) * dir,
      -(midShoulder.y - stanceAnkle.y),
    ) *
    (180 / Math.PI);

  // ★ 只有當腳踝在臀部垂直投影附近 (真正處於觸地/支撐中心) 時，全身連線才具備落下前傾意義
  // 若在走路雙支撐期，後腳踝拖在身後 (或前腳過度跨出)，連線斜率會被幾何拉大到 15~20°，此時不可用來膨脹前傾！
  const ankleHipDistX = (midHip.x - stanceAnkle.x) * dir;
  const isAnkleUnderHip = Math.abs(ankleHipDistX) < W * 0.045;

  const effectiveLean = isAnkleUnderHip
    ? Math.max(rawTorsoLean, rawWholeBodyFallAngle * 0.92)
    : rawTorsoLean;
  const trunk = Math.max(1.5, Math.min(18, effectiveLean));

  const rKneeInterior = angle3Pt(P(24), P(26), P(28));
  const lKneeInterior = angle3Pt(P(23), P(25), P(27));
  const rThigh = limbAngleFromVertical(P(24), P(26));
  const lThigh = limbAngleFromVertical(P(23), P(25));
  const rShank = limbAngleFromVertical(P(26), P(28));
  const lShank = limbAngleFromVertical(P(25), P(27));

  const rKneeFlex = Math.max(
    8,
    Math.min(120, Math.max(rThigh - rShank, 180 - rKneeInterior)),
  );
  const lKneeFlex = Math.max(
    8,
    Math.min(120, Math.max(lThigh - lShank, 180 - lKneeInterior)),
  );

  const rElbowInterior = angle3Pt(P(12), P(14), P(16));
  const lElbowInterior = angle3Pt(P(11), P(13), P(15));

  // 1. 穩定比例尺：使用垂直身高像素 (鼻尖到最低腳底) 換算公分，避免屈膝時大腿+小腿投影變短導致比例尺膨脹
  const groundFootY = Math.max(
    P(27).y,
    P(28).y,
    P(29).y,
    P(30).y,
    P(31).y,
    P(32).y,
  );
  const headTopY = P(0).y;
  const runnerPixelHeight = Math.max(60, groundFootY - headTopY);
  const userHeightCm = heightCm || 172;
  const cmPerPixel = (userHeightCm * 0.93) / runnerPixelHeight;

  // 2. 修正真實身體質量中心 (True COM X)：75% 髖關節 + 25% 肩關節，抵銷寬鬆衣物造成的臀部節點後移
  const trueComX = midHip.x * 0.75 + midShoulder.x * 0.25;

  // 3. 計算左右腳各自的「中足受力中心 (Strike Center X)」(50% 腳踝 + 25% 腳跟 + 25% 腳尖)，不再單抓鞋尖！
  const lHeel = P(29).v > 0.35 ? P(29) : P(27);
  const rHeel = P(30).v > 0.35 ? P(30) : P(28);
  const lToe = P(31).v > 0.35 ? P(31) : P(27);
  const rToe = P(32).v > 0.35 ? P(32) : P(28);

  const lStrikeCenterX = P(27).x * 0.5 + lHeel.x * 0.25 + lToe.x * 0.25;
  const rStrikeCenterX = P(28).x * 0.5 + rHeel.x * 0.25 + rToe.x * 0.25;

  const lFootLowY = Math.max(P(27).y, lHeel.y, lToe.y);
  const rFootLowY = Math.max(P(28).y, rHeel.y, rToe.y);

  // 分別記錄左右腳若在此刻觸地的重心偏移量 (cm)
  const lComOffsetCm = (lStrikeCenterX - trueComX) * dir * cmPerPixel;
  const rComOffsetCm = (rStrikeCenterX - trueComX) * dir * cmPerPixel;
  const activeComOffsetCm = leftIsLower ? lComOffsetCm : rComOffsetCm;

  const rearThighAngle = Math.max(0, -Math.min(rThigh, lThigh));
  const hipSeparationDeg = Math.abs(rThigh - lThigh);
  const normHipX = midHip.x / W;
  const hipVis = (P(23).v + P(24).v) * 0.5;
  // ★ 高速跑姿與手持跟拍防漏格 (動態模糊視野放寬)：
  // 跑步時腳踝速度高達 20km/h 常有動態模糊 (Motion Blur)，且後腿容易被前腿遮擋；
  // 以穩定無模糊的髖關節 (Hip) 判定人物在畫面中 (邊緣寬容度 6%)，腳踝只需任一隻具有基本特徵 (>0.12)
  const isRunnerCentered =
    normHipX > 0.06 &&
    normHipX < 0.94 &&
    hipVis > 0.35 &&
    (P(27).v > 0.12 || P(28).v > 0.12);

  const extracted = {
    trunk,
    rawTorsoLean,
    rawWholeBodyFallAngle,
    normHipX,
    rThigh,
    rKnee: rKneeFlex,
    rKneeInterior,
    rAnkle: 0,
    rIsStance: !leftIsLower,
    lThigh,
    lKnee: lKneeFlex,
    lKneeInterior,
    lAnkle: 0,
    lIsStance: leftIsLower,
    rShoulder: 0,
    rElbow: Math.max(35, 180 - rElbowInterior),
    rElbowInterior,
    lShoulder: 0,
    lElbow: Math.max(35, 180 - lElbowInterior),
    comOffset: Math.max(1.0, Math.min(24.0, activeComOffsetCm)),
    lComOffsetCm,
    rComOffsetCm,
    lStrikeCenterX,
    rStrikeCenterX,
    lFootLowY,
    rFootLowY,
    pushOffAngle: rearThighAngle,
    hipSeparationDeg,
    midHipX: midHip.x,
    midHipY: midHip.y,
    trueComX,
    runnerPixelHeight,
    rAnkleX: P(28).x,
    lAnkleX: P(27).x,
    rKneeX: P(26).x,
    lKneeX: P(25).x,
    rAnkleY: P(28).y,
    lAnkleY: P(27).y,
    videoTime: videoTime || 0,
    isRunnerCentered,
  };
  return { extracted, runDirection: dir };
}


/**
 * 擷取閘門（原 onPoseResults 內 isCapturingCycle 區塊的判斷本體）。
 * 規則與順序逐條照原邏輯；DOM 與全域寫入由呼叫端處理。
 * @param {object} extracted extractAnglesFromLandmarks 的 extracted
 * @param {Array} capturedFrames 目前已收的幀
 * @param {{x:number,y:number}|null} lockedHip 鎖定的髖部位置
 * @returns {{action:"finalize"|"accept"|"skip", lockedHip:{x:number,y:number}|null}}
 */
export function evaluateCaptureFrame(extracted, capturedFrames, lockedHip) {
  const lastCaptured = capturedFrames[capturedFrames.length - 1];

  // 防護 A：影片 Loop 繞回（時間倒退）或人跑出畫面左右邊緣且已收集足夠步態 → 結算
  const isRunnerExiting =
    extracted.normHipX < 0.06 || extracted.normHipX > 0.94;
  if (
    (lastCaptured && extracted.videoTime < lastCaptured.videoTime - 0.1) ||
    (isRunnerExiting && capturedFrames.length >= 25)
  ) {
    return { action: "finalize", lockedHip };
  }

  // 防護 B：每一格至少間隔 0.024 秒，避免慢放時同一格被重複塞入
  const isNewVideoFrame =
    !lastCaptured ||
    Math.abs(extracted.videoTime - lastCaptured.videoTime) >= 0.024;

  if (extracted.isRunnerCentered && isNewVideoFrame) {
    let locked = lockedHip;
    if (locked === null) {
      locked = { x: extracted.midHipX, y: extracted.midHipY };
    }

    const jumpDist = Math.hypot(
      extracted.midHipX - locked.x,
      extracted.midHipY - locked.y,
    );

    if (jumpDist < 180 || capturedFrames.length < 5) {
      return {
        action: "accept",
        lockedHip: { x: extracted.midHipX, y: extracted.midHipY },
      };
    }
    return { action: "skip", lockedHip: locked };
  }
  return { action: "skip", lockedHip };
}
