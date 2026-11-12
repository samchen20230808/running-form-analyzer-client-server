const simCanvas = document.getElementById("simCanvas");
const simCtx = simCanvas.getContext("2d");

function getRightLegTrailColor(tp, timing) {
  const poseP = (timing.posePct || 15) / 100;
  const bPoseStart = Math.max(0.05, poseP - 0.07);
  const bFallStart = poseP + 0.06;
  const bPullTransition = 0.64;

  if (tp >= bPoseStart && tp <= bFallStart) {
    return "#F59E0B";
  } else if (tp > bFallStart && tp < bPullTransition) {
    return "#38BDF8";
  } else if (tp >= bPullTransition && tp <= 0.94) {
    return "#C084FC";
  } else {
    return "#F43F5E";
  }
}

function drawSimulator() {
  const W = simCanvas.width;
  const H = simCanvas.height;
  simCtx.clearRect(0, 0, W, H);

  const groundY = 462;
  const originX = W * 0.48;
  const p = (((cyclePct % 100) + 100) % 100) / 100;

  const grad = simCtx.createLinearGradient(0, groundY, 0, H);
  grad.addColorStop(0, "rgba(30, 41, 59, 0.92)");
  grad.addColorStop(1, "rgba(15, 23, 42, 0.99)");
  simCtx.fillStyle = grad;
  simCtx.fillRect(0, groundY, W, H - groundY);

  simCtx.strokeStyle = "#F8FAFC";
  simCtx.lineWidth = 2;
  simCtx.beginPath();
  simCtx.moveTo(0, groundY);
  simCtx.lineTo(W, groundY);
  simCtx.stroke();

  const activeProfile =
    RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
  const timing = getActiveProfileTiming();
  const useLiveOverride =
    livePoseOverride && document.getElementById("liveSyncToggle").checked;
  const activeAngles = useLiveOverride
    ? livePoseOverride
    : activeProfile.evalCycle(p);

  const refProfile = RUNNER_PROFILES.hsu_pose_method;
  const refAngles = refProfile.evalCycle(p);

  // 3.5：缺關鍵幀時 evalCycle 回傳 null → 不畫主角骨架並提示
  const hasActive = Boolean(activeAngles);
  // 軌跡與相位標記取樣整個週期，依賴關鍵幀（即時同步時 hasActive 為 true 但 profile 可能沒有關鍵幀）
  const hasKeyframes = Boolean(activeProfile.cycleKeyframes);
  const activePose = hasActive
    ? RFA.player.solveKinematics(activeAngles, originX, groundY, 1.0)
    : null;
  const refPose = RFA.player.solveKinematics(refAngles, originX, groundY, 1.0);

  if (layers.trail) {
    const steps = 80;
    simCtx.save();
    simCtx.setLineDash([4, 4]);
    simCtx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tp = i / steps;
      const rPose = RFA.player.solveKinematics(
        refProfile.evalCycle(tp),
        originX,
        groundY,
        1.0,
      );
      if (i === 0)
        simCtx.moveTo(rPose.rightLeg.ankle.x, rPose.rightLeg.ankle.y);
      else simCtx.lineTo(rPose.rightLeg.ankle.x, rPose.rightLeg.ankle.y);
    }
    simCtx.closePath();
    simCtx.strokeStyle = "rgba(226, 232, 240, 0.40)";
    simCtx.lineWidth = 2.0;
    simCtx.stroke();
    simCtx.restore();

    const trailPoints = [];
    for (let i = 0; hasKeyframes && i <= steps; i++) {
      const tp = (i % steps) / steps;
      const tPose = RFA.player.solveKinematics(
        activeProfile.evalCycle(tp),
        originX,
        groundY,
        1.0,
      );
      trailPoints.push({
        x: tPose.rightLeg.ankle.x,
        y: tPose.rightLeg.ankle.y,
        tp,
      });
    }

    simCtx.save();
    simCtx.lineCap = "round";
    simCtx.lineJoin = "round";
    for (let i = 0; hasKeyframes && i < steps; i++) {
      const p1 = trailPoints[i];
      const p2 = trailPoints[i + 1];
      simCtx.beginPath();
      simCtx.moveTo(p1.x, p1.y);
      simCtx.lineTo(p2.x, p2.y);
      simCtx.strokeStyle = getRightLegTrailColor(p1.tp, timing);
      simCtx.lineWidth = 3.8;
      simCtx.stroke();
    }

    const phaseMarkers = [
      {
        pct: timing.touchPct / 100,
        color: "#F43F5E",
        label: `①0%觸地`,
        dx: -44,
        dy: -6,
      },
      {
        pct: timing.posePct / 100,
        color: "#F59E0B",
        label: `②Pose(${timing.posePct}%)`,
        dx: -12,
        dy: -12,
      },
      {
        pct: timing.fallPct / 100,
        color: "#38BDF8",
        label: `③落下(${timing.fallPct}%)`,
        dx: 10,
        dy: -4,
      },
      {
        pct: timing.pullPct / 100,
        color: "#C084FC",
        label: `④拉起(${timing.pullPct}%)`,
        dx: -48,
        dy: 14,
      },
    ];
    (hasKeyframes ? phaseMarkers : []).forEach((m) => {
      const mPose = RFA.player.solveKinematics(
        activeProfile.evalCycle(m.pct),
        originX,
        groundY,
        1.0,
      );
      const ax = mPose.rightLeg.ankle.x;
      const ay = mPose.rightLeg.ankle.y;
      simCtx.beginPath();
      simCtx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      simCtx.fillStyle = m.color;
      simCtx.fill();
      simCtx.lineWidth = 1.5;
      simCtx.strokeStyle = "#0B0F19";
      simCtx.stroke();

      simCtx.fillStyle = m.color;
      simCtx.font = 'bold 10px "Noto Sans TC"';
      simCtx.fillText(m.label, ax + m.dx, ay + m.dy);
    });
    simCtx.restore();
  }

  if (layers.ghost) {
    drawSkeletonFigure(simCtx, refPose, {
      isGhost: true,
      mainColor: "rgba(16, 185, 129, 0.65)",
      farColor: "rgba(16, 185, 129, 0.38)",
    });
  }

  if (hasActive) {
    drawRunnerSilhouette(simCtx, activePose, activeProfile.appearance);
    drawSkeletonFigure(simCtx, activePose, {
      isGhost: false,
      mainColor: "#06B6D4",
      farColor: "#94A3B8",
    });
  }
  if (!hasKeyframes) drawNoKeyframesNotice(simCtx, W, 200);

  if (hasActive && layers.trail) {
    simCtx.save();
    const curPhaseColor = getRightLegTrailColor(p, timing);
    simCtx.beginPath();
    simCtx.arc(
      activePose.rightLeg.ankle.x,
      activePose.rightLeg.ankle.y,
      9.5,
      0,
      Math.PI * 2,
    );
    simCtx.strokeStyle = curPhaseColor;
    simCtx.lineWidth = 2.8;
    simCtx.stroke();
    simCtx.restore();
  }

  if (hasActive) {
    drawBiomechAnnotations(
      simCtx,
      activePose,
      refPose,
      activeAngles,
      groundY,
      p,
      W,
      timing,
    );
  }

  // ★ 骨架模擬器即時觸地/騰空狀態指示牌 (Stance vs Flight HUD)
  const gct = computeGctMetrics(activeProfile.summary, activeProfile.cadence);
  const stanceP = (gct.stancePct || 35) / 100;
  let isStance = false;
  let legName = "";
  if (p < stanceP) {
    isStance = true;
    legName = "左腳";
  } else if (p >= 0.5 && p < 0.5 + stanceP) {
    isStance = true;
    legName = "右腳";
  }

  simCtx.save();
  const badgeW = 180;
  const badgeH = 26;
  const badgeX = W - badgeW - 12;
  // 右上角已有 HTML 資訊卡（循環播放中／階段標題），狀態牌移到地面線上方避免被遮住
  const badgeY = 462 - badgeH - 8;

  simCtx.fillStyle = isStance
    ? "rgba(244, 63, 94, 0.20)"
    : "rgba(16, 185, 129, 0.20)";
  simCtx.strokeStyle = isStance
    ? "rgba(244, 63, 94, 0.60)"
    : "rgba(16, 185, 129, 0.60)";
  simCtx.lineWidth = 1.2;
  simCtx.beginPath();
  if (simCtx.roundRect) {
    simCtx.roundRect(badgeX, badgeY, badgeW, badgeH, 13);
  } else {
    simCtx.rect(badgeX, badgeY, badgeW, badgeH);
  }
  simCtx.fill();
  simCtx.stroke();

  // 圓點狀態指示燈
  simCtx.beginPath();
  simCtx.arc(badgeX + 14, badgeY + badgeH / 2, 4.5, 0, Math.PI * 2);
  simCtx.fillStyle = isStance ? "#F43F5E" : "#10B981";
  simCtx.fill();

  simCtx.font = 'bold 10.5px "Noto Sans TC"';
  simCtx.fillStyle = isStance ? "#FDA4AF" : "#6EE7B7";
  simCtx.textAlign = "left";
  simCtx.textBaseline = "middle";
  const badgeText = isStance
    ? `${legName}著地中 (Stance • ${gct.gctMs}ms)`
    : gct.flightLabel
      ? `${gct.flightLabel}中 (Double Support)`
      : `雙腳騰空中 (Flight • ${gct.flightMs}ms)`;
  simCtx.fillText(badgeText, badgeX + 24, badgeY + badgeH / 2);
  simCtx.restore();
}

// 3.5：作用中 profile 沒有骨架關鍵幀（例如匯入舊格式分析檔）時的提示；遙測與診斷數值不受影響
function drawNoKeyframesNotice(ctx, W, y) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 14px "Noto Sans TC"';
  ctx.fillStyle = "#FCD34D";
  ctx.fillText("此分析檔缺少骨架關鍵幀，無法顯示動畫", W / 2, y);
  ctx.font = '12px "Noto Sans TC"';
  ctx.fillStyle = "#94A3B8";
  ctx.fillText("遙測與診斷數值不受影響", W / 2, y + 22);
  ctx.restore();
}

function drawRunnerSilhouette(ctx, pose, app) {
  if (!app) return;
  ctx.save();
  ctx.strokeStyle = app.shirtColor || "#2563EB";
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pose.shoulder.x, pose.shoulder.y + 4);
  ctx.lineTo(pose.hip.x, pose.hip.y - 2);
  ctx.stroke();

  ctx.strokeStyle = app.shortsColor || "#0F172A";
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(pose.hip.x, pose.hip.y);
  ctx.lineTo(
    (pose.hip.x + pose.rightLeg.knee.x) * 0.5,
    (pose.hip.y + pose.rightLeg.knee.y) * 0.5,
  );
  ctx.moveTo(pose.hip.x, pose.hip.y);
  ctx.lineTo(
    (pose.hip.x + pose.leftLeg.knee.x) * 0.5,
    (pose.hip.y + pose.leftLeg.knee.y) * 0.5,
  );
  ctx.stroke();

  if (app.capColor) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = app.capColor;
    ctx.beginPath();
    ctx.arc(pose.head.x, pose.head.y - 3, 14, Math.PI, 0);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = app.capColor;
    ctx.beginPath();
    ctx.moveTo(pose.head.x + 2, pose.head.y - 3);
    ctx.lineTo(pose.head.x + 24, pose.head.y - 1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSkeletonFigure(ctx, pose, opts) {
  ctx.save();
  if (opts.isGhost) ctx.setLineDash([5, 5]);

  const bone = (a, b, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  bone(
    pose.hip,
    pose.leftLeg.knee,
    opts.farColor,
    opts.isGhost ? 3.2 : 6.5,
  );
  bone(
    pose.leftLeg.knee,
    pose.leftLeg.ankle,
    opts.farColor,
    opts.isGhost ? 2.8 : 6,
  );
  bone(
    pose.leftLeg.heel,
    pose.leftLeg.toe,
    opts.farColor,
    opts.isGhost ? 2.8 : 5.5,
  );
  bone(
    pose.shoulder,
    pose.leftArm.elbow,
    opts.farColor,
    opts.isGhost ? 2.5 : 4.5,
  );
  bone(
    pose.leftArm.elbow,
    pose.leftArm.wrist,
    opts.farColor,
    opts.isGhost ? 2 : 4,
  );

  bone(
    pose.hip,
    pose.shoulder,
    opts.isGhost ? opts.mainColor : "#38BDF8",
    opts.isGhost ? 3.5 : 7,
  );

  ctx.beginPath();
  ctx.arc(
    pose.head.x,
    pose.head.y,
    opts.isGhost ? 11 : 13,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = opts.mainColor;
  ctx.lineWidth = opts.isGhost ? 2 : 3;
  ctx.stroke();

  bone(
    pose.hip,
    pose.rightLeg.knee,
    opts.mainColor,
    opts.isGhost ? 3.5 : 7.5,
  );
  bone(
    pose.rightLeg.knee,
    pose.rightLeg.ankle,
    opts.mainColor,
    opts.isGhost ? 3 : 6.5,
  );
  bone(
    pose.rightLeg.heel,
    pose.rightLeg.toe,
    opts.isGhost ? opts.mainColor : "#F8FAFC",
    opts.isGhost ? 3 : 6,
  );
  bone(
    pose.shoulder,
    pose.rightArm.elbow,
    opts.isGhost ? opts.mainColor : "#22D3EE",
    opts.isGhost ? 3 : 5.5,
  );
  bone(
    pose.rightArm.elbow,
    pose.rightArm.wrist,
    opts.isGhost ? opts.mainColor : "#22D3EE",
    opts.isGhost ? 2.5 : 5,
  );

  if (!opts.isGhost) {
    [pose.leftLeg.knee, pose.leftLeg.ankle].forEach((j) => {
      ctx.beginPath();
      ctx.arc(j.x, j.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#0B0F19";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#94A3B8";
      ctx.stroke();
    });
    [
      pose.shoulder,
      pose.hip,
      pose.rightLeg.knee,
      pose.rightLeg.ankle,
      pose.rightArm.elbow,
    ].forEach((j) => {
      ctx.beginPath();
      ctx.arc(j.x, j.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0B0F19";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#22D3EE";
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawBiomechAnnotations(
  ctx,
  pose,
  refPose,
  angles,
  groundY,
  p,
  W,
  timing,
) {
  ctx.save();
  const activeProfile =
    RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(248, 250, 252, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pose.hip.x, pose.shoulder.y - 25);
  ctx.lineTo(pose.hip.x, groundY);
  ctx.stroke();
  ctx.setLineDash([]);

  const s = activeProfile.summary || {};
  const isBiomechanicalRunner =
    (s.avgElbow != null && s.avgElbow <= 100) &&
    ((s.hipRomDeg || 38) >= 36);
  const isWalkGait = (activeProfile.cadence || 180) < 135 && !isBiomechanicalRunner;
  const trunkVal = angles.trunk ?? (isWalkGait ? 2.5 : 8.2);
  const trunkGood = isWalkGait
    ? trunkVal <= 6.0
    : trunkVal >= 6.0 && trunkVal <= 11.5;
  ctx.fillStyle = trunkGood ? "#10B981" : "#F59E0B";
  ctx.font = 'bold 11px "JetBrains Mono"';
  ctx.fillText(
    isWalkGait
      ? `軀幹前傾 ${trunkVal.toFixed(1)}°`
      : `落下前傾 ${trunkVal.toFixed(1)}°`,
    pose.shoulder.x + 16,
    pose.shoulder.y + 8,
  );

  const elbowInterior = Math.round(180 - (angles.rElbow ?? 80));
  ctx.fillStyle = "#22D3EE";
  ctx.font = '10px "JetBrains Mono"';
  ctx.fillText(
    `手肘 ${elbowInterior}°`,
    pose.rightArm.elbow.x - 45,
    pose.rightArm.elbow.y + 4,
  );

  ctx.textAlign = "center";
  const bannerY = groundY + 14;
  const poseP = (timing.posePct || 15) / 100;
  const bPoseStart = Math.max(0.05, poseP - 0.07);
  const bFallStart = poseP + 0.06;
  const bPullTransition = 0.64;

  if (p < bPoseStart || p > 0.94) {
    const offsetCm = angles.comOffset || 3.2;
    const isOverstride = offsetCm > 7.5;
    const color = isOverstride ? "#F43F5E" : "#10B981";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pose.hip.x, groundY - 8);
    ctx.lineTo((pose.leftLeg.ankle.x + pose.leftLeg.toe.x) * 0.5, groundY - 8);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 11.5px "Noto Sans TC"';
    ctx.fillText(
      `① 1.開始觸地 (0% 🔴紅段)：左腳中足實體觸地 (+${offsetCm.toFixed(1)}cm)，主角【右腿】在後預備！`,
      W * 0.5,
      bannerY,
    );
  } else if (p >= bPoseStart && p <= bFallStart) {
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pose.leftLeg.ankle.x, groundY - 3);
    ctx.lineTo(pose.shoulder.x, pose.head.y - 10);
    ctx.stroke();

    ctx.fillStyle = "#F59E0B";
    ctx.font = 'bold 11.5px "Noto Sans TC"';
    ctx.fillText(
      `★ ② 2.關鍵跑姿 (個人 ${timing.posePct}% vs 徐國峰 15% • 🟠黃段)：左腳支撐，主角【右腿】勾在左膝旁呈「4字型」！`,
      W * 0.5,
      bannerY,
    );
  } else if (p > bFallStart && p < bPullTransition) {
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pose.leftLeg.ankle.x, groundY - 3);
    ctx.lineTo(pose.shoulder.x, pose.shoulder.y);
    ctx.stroke();

    ctx.fillStyle = "#38BDF8";
    ctx.font = 'bold 11.5px "Noto Sans TC"';
    ctx.fillText(
      `★ ③ 3.落下 (個人 ${timing.fallPct}% vs 徐 30% • 🔵藍段)：右腿下落並銜接 Ground 前半段支點推進！`,
      W * 0.5,
      bannerY,
    );
  } else {
    const pullKneeAngle = Math.round(180 - (angles.rKnee ?? 76));
    ctx.fillStyle = "#C084FC";
    ctx.font = 'bold 11.5px "Noto Sans TC"';
    ctx.fillText(
      `★ ④ 4.拉起 (個人 ${timing.pullPct}% vs 徐 75% • 🟣紫段)：右腿 Ground 後半段垂直抽腿往臀下拉起 (膝角 ${pullKneeAngle}°)`,
      W * 0.5,
      bannerY,
    );
  }
  ctx.restore();
}

const waveCanvas = document.getElementById("waveCanvas");
const waveCtx = waveCanvas.getContext("2d");

function drawWaveform() {
  const W = waveCanvas.width;
  const H = waveCanvas.height;
  waveCtx.clearRect(0, 0, W, H);

  const padL = 32,
    padR = 14,
    padT = 16,
    padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const activeProfile =
    RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
  const gct = computeGctMetrics(
    activeProfile.summary,
    activeProfile.cadence,
  );
  const stancePct = gct.stancePct || 35;

  // ★ 繪製觸地支撐期 (Stance 🔴) 與 騰空飛行期 (Flight 🔵) 區域色帶
  // 階段 1：左腳著地 (0% ~ stancePct%)
  const xStance1 = padL;
  const wStance1 = (stancePct / 100) * plotW;
  waveCtx.fillStyle = "rgba(244, 63, 94, 0.13)";
  waveCtx.fillRect(xStance1, padT, wStance1, plotH);

  // 階段 2：騰空期 (stancePct% ~ 50%)
  const xFlight1 = xStance1 + wStance1;
  const wFlight1 = ((50 - stancePct) / 100) * plotW;
  waveCtx.fillStyle = "rgba(56, 189, 248, 0.08)";
  waveCtx.fillRect(xFlight1, padT, wFlight1, plotH);

  // 階段 3：右腳著地 (50% ~ 50% + stancePct%)
  const xStance2 = padL + 0.5 * plotW;
  const wStance2 = (stancePct / 100) * plotW;
  waveCtx.fillStyle = "rgba(244, 63, 94, 0.13)";
  waveCtx.fillRect(xStance2, padT, wStance2, plotH);

  // 階段 4：騰空期 (50% + stancePct% ~ 100%)
  const xFlight2 = xStance2 + wStance2;
  const wFlight2 = ((50 - stancePct) / 100) * plotW;
  waveCtx.fillStyle = "rgba(56, 189, 248, 0.08)";
  waveCtx.fillRect(xFlight2, padT, wFlight2, plotH);

  // 頂部標註著地與騰空文字
  waveCtx.save();
  waveCtx.font = 'bold 9px "Noto Sans TC"';
  waveCtx.fillStyle = "rgba(244, 63, 94, 0.9)";
  waveCtx.fillText(`👟 左腳著地 ${gct.gctMs}ms`, xStance1 + 4, padT + 11);
  waveCtx.fillText(`👟 右腳著地 ${gct.gctMs}ms`, xStance2 + 4, padT + 11);
  waveCtx.fillStyle = "rgba(56, 189, 248, 0.85)";
  const flightText = gct.flightLabel || `🕊️ 騰空 ${gct.flightMs}ms`;
  waveCtx.fillText(flightText, xFlight1 + 4, padT + 11);
  waveCtx.fillText(flightText, xFlight2 + 4, padT + 11);
  waveCtx.restore();

  waveCtx.strokeStyle = "#1E293B";
  waveCtx.lineWidth = 1;
  [0, 0.5, 1].forEach((r) => {
    const y = padT + r * plotH;
    waveCtx.beginPath();
    waveCtx.moveTo(padL, y);
    waveCtx.lineTo(W - padR, y);
    waveCtx.stroke();
  });

  const timing = getActiveProfileTiming();
  const keyMarks = [
    {
      pct: timing.touchPct,
      label: `①觸地(${timing.touchPct}%)`,
      color: "#F43F5E",
    },
    {
      pct: timing.posePct,
      label: `②Pose(${timing.posePct}%)`,
      color: "#F59E0B",
    },
    {
      pct: timing.fallPct,
      label: `③落下(${timing.fallPct}%)`,
      color: "#38BDF8",
    },
    {
      pct: timing.pullPct,
      label: `④拉起(${timing.pullPct}%)`,
      color: "#C084FC",
    },
  ];
  keyMarks.forEach((m) => {
    const mx = padL + (m.pct / 100) * plotW;
    waveCtx.save();
    waveCtx.setLineDash([2, 3]);
    waveCtx.strokeStyle = m.color;
    waveCtx.globalAlpha = 0.45;
    waveCtx.beginPath();
    waveCtx.moveTo(mx, padT);
    waveCtx.lineTo(mx, padT + plotH);
    waveCtx.stroke();
    waveCtx.globalAlpha = 1.0;
    waveCtx.fillStyle = m.color;
    waveCtx.font = 'bold 10px "Noto Sans TC"';
    waveCtx.fillText(m.label, mx + 2, padT + plotH + 14);
    waveCtx.restore();
  });

  const refProfile = RUNNER_PROFILES.hsu_pose_method;

  waveCtx.save();
  waveCtx.setLineDash([4, 4]);
  waveCtx.strokeStyle = "rgba(16, 185, 129, 0.5)";
  waveCtx.lineWidth = 1.5;
  waveCtx.beginPath();
  for (let i = 0; i <= 100; i += 2) {
    const a = refProfile.evalCycle(i / 100);
    const x = padL + (i / 100) * plotW;
    const y = padT + plotH - ((a.rKnee + 25) / 140) * plotH;
    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
  waveCtx.restore();

  waveCtx.strokeStyle = "#10B981";
  waveCtx.lineWidth = 2.5;
  waveCtx.beginPath();
  // 3.5：缺關鍵幀時主角曲線不畫
  for (let i = 0; activeProfile.cycleKeyframes && i <= 100; i += 2) {
    const a = activeProfile.evalCycle(i / 100);
    const x = padL + (i / 100) * plotW;
    const y = padT + plotH - ((a.rKnee + 25) / 140) * plotH;
    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();

  waveCtx.strokeStyle = "#38BDF8";
  waveCtx.lineWidth = 2;
  waveCtx.beginPath();
  // 3.5：缺關鍵幀時主角曲線不畫
  for (let i = 0; activeProfile.cycleKeyframes && i <= 100; i += 2) {
    const a = activeProfile.evalCycle(i / 100);
    const x = padL + (i / 100) * plotW;
    const y = padT + plotH - ((a.rThigh + 35) / 100) * plotH;
    if (i === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();

  const curX = padL + ((((cyclePct % 100) + 100) % 100) / 100) * plotW;
  waveCtx.strokeStyle = "#F8FAFC";
  waveCtx.lineWidth = 1.8;
  waveCtx.beginPath();
  waveCtx.moveTo(curX, padT);
  waveCtx.lineTo(curX, padT + plotH);
  waveCtx.stroke();
}

// ★ 100% 還原原始版本的動畫迴圈與速度係數 (dt * 42 * simSpeed * cadenceFactor)
function animateLoop(now) {
  const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
  lastTimestamp = now;

  if (simPlaying) {
    const profile =
      RUNNER_PROFILES[activeProfileKey] ||
      RUNNER_PROFILES.hsu_pose_method;
    const cadenceFactor = (profile.cadence || 180) / 180;
    cyclePct = (cyclePct + dt * 42 * simSpeed * cadenceFactor) % 100;
    document.getElementById("cycleSlider").value = Math.round(cyclePct);
    updateSimPhaseHUD();
  }

  drawSimulator();
  drawWaveform();
  requestAnimationFrame(animateLoop);
}
