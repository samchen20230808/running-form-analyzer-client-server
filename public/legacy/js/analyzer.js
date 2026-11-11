function extractExactAnglesWithAspectCorrection(lm, W, H) {
  const { extracted, runDirection: dir } = extractAnglesFromLandmarks(lm, W, H, {
    runDirection,
    isManualDirection,
    heightCm:
      parseFloat(document.getElementById("runnerHeightInput")?.value) || 172,
    videoTime: sourceVideo.currentTime || 0,
  });
  if (dir !== runDirection) {
    setRunDirection(dir, false);
  }
  return extracted;
}

function onPoseResults(results) {
  const W = videoCanvas.width;
  const H = videoCanvas.height;
  videoCtx.save();
  videoCtx.clearRect(0, 0, W, H);
  videoCtx.drawImage(results.image, 0, 0, W, H);

  if (results.poseLandmarks) {
    const lm = sanitizeLandmarks(results.poseLandmarks);
    if (
      typeof drawConnectors !== "undefined" &&
      typeof POSE_CONNECTIONS !== "undefined"
    ) {
      drawConnectors(videoCtx, lm, POSE_CONNECTIONS, {
        color: "#06B6D4",
        lineWidth: 3.5,
      });
      drawLandmarks(videoCtx, lm, {
        color: "#10B981",
        lineWidth: 1.5,
        radius: 4,
      });
    }

    const extracted = extractExactAnglesWithAspectCorrection(lm, W, H);
    document.getElementById("liveVideoTrunk").textContent =
      `${extracted.trunk.toFixed(1)}°`;
    document.getElementById("liveVideoKnee").textContent =
      `${Math.round(extracted.rKneeInterior)}°`;
    document.getElementById("liveVideoElbow").textContent =
      `${Math.round(extracted.rElbowInterior)}°`;

    if (document.getElementById("liveSyncToggle").checked) {
      livePoseOverride = extracted;
    }

    if (isCapturingCycle) {
      const gate = evaluateCaptureFrame(
        extracted,
        capturedRawFrames,
        lockedSubjectHipX === null
          ? null
          : { x: lockedSubjectHipX, y: lockedSubjectHipY },
      );
      lockedSubjectHipX = gate.lockedHip ? gate.lockedHip.x : null;
      lockedSubjectHipY = gate.lockedHip ? gate.lockedHip.y : null;

      if (gate.action === "finalize") {
        finalizeCycleExtraction();
        videoCtx.restore();
        return;
      }

      if (gate.action === "accept") {
        capturedRawFrames.push(extracted);

        const btn = document.getElementById("captureCycleBtn");
        if (btn) {
          btn.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span><span>🔴 正在擷取黃金區間步態 (${capturedRawFrames.length}/55 格)...</span>`;
        }

        // 收集滿 55 個「不重複的真實影格」(約 1.8 秒 = 跑步 5~6 步、慢走 2~3 步) 即可精準結算
        if (capturedRawFrames.length >= 55) {
          finalizeCycleExtraction();
        }
      }
    }
  }
  videoCtx.restore();
}

function triggerCycleExtraction() {
  capturedRawFrames = [];
  lockedSubjectHipX = null;
  lockedSubjectHipY = null;
  isCapturingCycle = true;

  const btn = document.getElementById("captureCycleBtn");
  btn.className =
    "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 shadow-md transition flex items-center gap-1.5 animate-pulse";
  btn.innerHTML =
    '<span class="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span><span>🔴 正在擷取黃金區間步態 (0.25x 掃描中...)</span>';

  if (sourceVideo.src) {
    savedVideoPlaybackRate = sourceVideo.playbackRate || 0.5;
    sourceVideo.playbackRate = 0.25;
    document.getElementById("videoRateSelect").value = "0.25";

    // ★ 自動防呆：如果使用者停在太後面 (剩不到 2.0 秒，人快跑出畫面)，自動退回黃金進場點 (0.45s) 開始掃描！
    if (
      sourceVideo.duration &&
      sourceVideo.currentTime > sourceVideo.duration - 2.0
    ) {
      sourceVideo.currentTime = Math.min(0.45, Math.max(0, sourceVideo.duration - 2.4));
    }
    sourceVideo.play();
    syncVideoPlayButtonUI();
    processVideoFrameLoop();
  } else {
    // 模擬訊號 Fallback 保持不變
    const srcProfile = RUNNER_PROFILES.night_track_runner;
    for (let i = 0; i < 45; i++) {
      const a = evaluateProfileCycle(srcProfile, i / 45);
      a.rKneeInterior = 180 - a.rKnee;
      a.lKneeInterior = 180 - a.lKnee;
      a.rElbowInterior = 180 - a.rElbow;
      a.hipSeparationDeg = Math.abs(a.rThigh - a.lThigh);
      a.lAnkleX = Math.sin((i / 45) * Math.PI * 4) * 45 + 320;
      a.rAnkleX = -Math.sin((i / 45) * Math.PI * 4) * 45 + 320;
      a.lAnkleY = Math.cos((i / 45) * Math.PI * 4) * 50 + 300;
      a.rAnkleY = Math.cos((i / 45 + 0.5) * Math.PI * 4) * 50 + 300;
      a.videoTime = i * (1.5 / 45);
      a.pushOffAngle = 18.0;
      a.midHipX = 320;
      capturedRawFrames.push(a);
    }
    setTimeout(finalizeCycleExtraction, 450);
  }
}

function finalizeCycleExtraction() {
  if (!isCapturingCycle && capturedRawFrames.length === 0) return;
  isCapturingCycle = false;
  livePoseOverride = null;
  document.getElementById("liveSyncToggle").checked = false;

  if (sourceVideo.src) {
    sourceVideo.playbackRate = savedVideoPlaybackRate;
    document.getElementById("videoRateSelect").value = String(
      savedVideoPlaybackRate,
    );
  }

  const btn = document.getElementById("captureCycleBtn");
  btn.className =
    "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition flex items-center gap-1.5";
  btn.innerHTML =
    '<span class="w-2 h-2 rounded-full bg-slate-950"></span><span>✅ 步態週期已精準解析！</span>';
  setTimeout(() => {
    btn.innerHTML =
      '<span class="w-2 h-2 rounded-full bg-slate-950"></span><span>🟢 智慧擷取個人步態 (從當前影格開始)</span>';
  }, 2500);

  if (capturedRawFrames.length < 8) return;
  const heightCm =
    parseFloat(document.getElementById("runnerHeightInput").value) || 172;

  // 純計算交給 cycle-analysis.js（Client 與 Server 共用）
  const { cadence: detectedCadence, summary: newSummary } =
    analyzeCapturedFrames(capturedRawFrames, {
      heightCm,
      cameraMode: selectedCameraMode,
      canvasW: videoCanvas.width,
      runDirection,
    });

  // 依據手動設定或自動偵測決定步幅（含 strideModeText、輸入框等 UI 副作用）
  recalculateStrideForCameraMode(newSummary);

  RUNNER_PROFILES.custom_captured.cadence = detectedCadence;
  RUNNER_PROFILES.custom_captured.summary = newSummary;

  const alignedSampled = [];
  for (let i = 0; i <= 20; i++) {
    alignedSampled.push(
      evaluateProfileCycle(RUNNER_PROFILES.custom_captured, i / 20),
    );
  }
  RUNNER_PROFILES.custom_captured.customCycleFrames = alignedSampled;

  document.getElementById("customVideoProfileOption").disabled = false;
  document.getElementById("profileSelect").value = "custom_captured";
  switchProfile("custom_captured");
}

function buildSafeSummaryFromJSON(data, cadenceVal) {
  const safeSummary = {
    trunkAngle: Number(data.summary.trunkAngle ?? 7.4),
    comOffsetCm: Number(data.summary.comOffsetCm ?? 3.0),
    touchdownKnee: Number(data.summary.touchdownKnee ?? 155),
    minSwingKnee: Number(data.summary.minSwingKnee ?? 74),
    pushOffExtensionDeg: Number(
      data.summary.pushOffExtensionDeg ?? 14.5,
    ),
    avgElbow: Number(data.summary.avgElbow ?? 84),
    footStrikeAngle: Number(data.summary.footStrikeAngle ?? 2),
    hipRomDeg: Number(data.summary.hipRomDeg ?? 38),
    strideMeters: Number(
      data.strideMeters ?? data.summary.strideMeters ?? 0.95,
    ),
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

  if (data.phaseTiming || data.summary.phaseTiming) {
    safeSummary.phaseTiming = computePersonalizedPhaseTiming(
      { phaseTiming: data.phaseTiming || data.summary.phaseTiming },
      cadenceVal,
    );
  } else {
    safeSummary.phaseTiming = computePersonalizedPhaseTiming(
      safeSummary,
      cadenceVal,
    );
  }

  return safeSummary;
}

// 純函式：驗證分析結果 JSON 契約（不碰 DOM，可供 Server 共用）
function validateAnalysisJSON(data) {
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

function importAnalysisJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const validation = validateAnalysisJSON(data);
      if (!validation.ok) {
        console.error("分析 JSON 驗證失敗：", validation.errors);
        alert("此 JSON 版本較新或格式不符，請更新系統");
        return;
      }
      if (validation.warnings.length) {
        console.warn("分析 JSON 驗證警告：", validation.warnings);
      }
      if (data.summary) {
        const dynamicKey = `json_${Date.now()}`;
        const displayName = `📄 ${file.name}`;
        const cadenceVal = Number(data.cadence || 180);

        // 1. 還原機位模式選擇
        if (
          data.cameraMode &&
          ["auto", "static", "tracking"].includes(data.cameraMode)
        ) {
          selectedCameraMode = data.cameraMode;
          const camSelect = document.getElementById("cameraModeSelect");
          if (camSelect) camSelect.value = data.cameraMode;
        }

        // 2. 構建完整防護的 safeSummary，完整保留相機與測量欄位
        const safeSummary = buildSafeSummaryFromJSON(data, cadenceVal);

        RUNNER_PROFILES[dynamicKey] = {
          name: displayName,
          cadence: cadenceVal,
          appearance: {
            capColor: "#F8FAFC",
            shirtColor: "#8B5CF6",
            shortsColor: "#0F172A",
            shoeColor: "#F8FAFC",
            soleColor: "#C084FC",
          },
          summary: safeSummary,
          evalCycle: function (p) {
            return evaluateProfileAngles(this, p);
          },
        };

        // 2.2：合法的 cycleKeyframes 掛到 Profile；不合法則警告並退回本地運動學
        if (data.cycleKeyframes !== undefined) {
          const ckResult = normalizeCycleKeyframes(data.cycleKeyframes);
          if (ckResult.ok) {
            RUNNER_PROFILES[dynamicKey].cycleKeyframes = ckResult.keyframes;
            console.info(
              `已載入 cycleKeyframes（${ckResult.keyframes.frames.length} 幀）`,
            );
          } else {
            console.warn(
              "cycleKeyframes 不合法，退回本地運動學：",
              ckResult.errors,
            );
          }
        }

        const selectEl = document.getElementById("profileSelect");
        const newOpt = document.createElement("option");
        newOpt.value = dynamicKey;
        newOpt.text = displayName;
        selectEl.add(newOpt);

        if (data.heightCm) {
          document.getElementById("runnerHeightInput").value =
            data.heightCm;
        }

        // 3. 還原步幅模式（手動 vs 靜態測量 vs 動態擺腿）
        const hasManual = Boolean(data.isManualStride);
        const measuredVal =
          typeof safeSummary.measuredStrideMeters === "number" &&
          safeSummary.measuredStrideMeters > 0
            ? safeSummary.measuredStrideMeters
            : typeof safeSummary._measuredPixelStride === "number" &&
                safeSummary._measuredPixelStride > 0
              ? safeSummary._measuredPixelStride
              : null;

        if (hasManual) {
          isManualStride = true;
          manualStrideValue = Number(
            data.strideMeters ?? data.summary.strideMeters ?? 0.95,
          );
          safeSummary.strideMeters = manualStrideValue;
          strideModeText = "✏️ 手動自訂步幅";
        } else {
          isManualStride = false;
          if (
            measuredVal !== null &&
            (selectedCameraMode === "static" ||
              (selectedCameraMode === "auto" &&
                safeSummary._autoDetectedStatic))
          ) {
            safeSummary.strideMeters = measuredVal;
            safeSummary.measuredStrideMeters = measuredVal;
            manualStrideValue = measuredVal;
            strideModeText =
              selectedCameraMode === "static"
                ? "📷 手動鎖定靜態機位"
                : "📷 靜態機位像素測量";
          }
        }

        selectEl.value = dynamicKey;
        switchProfile(dynamicKey);

        // 4. 確保介面步幅數據與模式標籤正確同步且永不調用 null.toFixed()
        const finalStride =
          safeSummary.strideMeters ??
          safeSummary.measuredStrideMeters ??
          manualStrideValue ??
          0.95;
        const formattedStride = Number(finalStride).toFixed(2);
        const customEl = document.getElementById("customStrideInput");
        const bannerEl = document.getElementById("bannerStrideInput");
        if (customEl) customEl.value = formattedStride;
        if (bannerEl) bannerEl.value = formattedStride;
        updateStrideModeUI();
        updateTelemetryAndDiagnostics();
      } else {
        alert("此 JSON 檔案缺少 summary 跑姿數據欄位");
      }
    } catch (err) {
      console.error("JSON 格式解析失敗：", err);
      alert("JSON 格式解析失敗：" + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function exportAnalysisJSON() {
  const profile =
    RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
  const heightCm =
    parseFloat(document.getElementById("runnerHeightInput").value) || 172;
  const payload = {
    schemaVersion: APP_CONFIG.analysisSchemaVersion,
    version: APP_CONFIG.version,
    timestamp: new Date().toISOString(),
    profileKey: activeProfileKey,
    profileName: profile.name,
    cameraMode: selectedCameraMode,
    heightCm,
    cadence: profile.cadence,
    strideMeters: profile.summary.strideMeters,
    isManualStride,
    phaseTiming: getActiveRunnerTiming(),
    summary: profile.summary,
  };
  if (profile.cycleKeyframes) payload.cycleKeyframes = profile.cycleKeyframes;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `running-biomech-${activeProfileKey}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
