function extractExactAnglesWithAspectCorrection(lm, W, H, videoTime) {
  const { extracted, runDirection: dir } = RFA.landmarks.extractAnglesFromLandmarks(lm, W, H, {
    runDirection,
    isManualDirection,
    heightCm:
      parseFloat(document.getElementById("runnerHeightInput")?.value) || 172,
    videoTime,
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

    // t 與傳給角度擷取的 videoTime 必須是同一次讀取（Server 以 t 重算步頻）
    const videoTime = sourceVideo.currentTime || 0;
    const extracted = extractExactAnglesWithAspectCorrection(lm, W, H, videoTime);
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
      // 閘門判斷前先記錄（含觸發 finalize 的那一幀），供上傳給 Server 重跑；不四捨五入、不送 z
      if (sourceVideo.src) {
        capturedLandmarkFrames.push({
          t: videoTime,
          lm: lm.map((p) => [p.x, p.y, p.visibility ?? null]),
        });
      }
      const gate = RFA.landmarks.evaluateCaptureFrame(
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

      if (isCapturingCycle && capturedLandmarkFrames.length >= MAX_UPLOAD_FRAMES) {
        finalizeCycleExtraction();
      }
    }
  }
  videoCtx.restore();
}

function triggerCycleExtraction() {
  if (isAnalyzingRemote) return;
  captureSeq++;
  capturedLandmarkFrames = [];
  captureStart = {
    runDirection,
    isManualDirection,
    heightCm:
      parseFloat(document.getElementById("runnerHeightInput")?.value) || 172,
  };
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
    // 3.5（D9）：無影片時上傳預先烘焙的合成 landmarks，結果與影片擷取走同一條路
    const sim = RFA.profiles.SIM_CAPTURE_REQUEST;
    isCapturingCycle = false;
    startServerAnalysis(captureSeq, {
      frameWidth: sim.frameWidth,
      frameHeight: sim.frameHeight,
      runDirection: sim.runDirection,
      isManualDirection: sim.isManualDirection,
      heightCm: captureStart.heightCm,
      frames: sim.frames,
    });
  }
}

const CAPTURE_BTN_IDLE_HTML =
  '<span class="w-2 h-2 rounded-full bg-slate-950"></span><span>🟢 智慧擷取個人步態 (從當前影格開始)</span>';
const CAPTURE_BTN_IDLE_CLASS =
  "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md transition flex items-center gap-1.5";

function showCaptureDone(btn) {
  btn.className = CAPTURE_BTN_IDLE_CLASS;
  btn.innerHTML =
    '<span class="w-2 h-2 rounded-full bg-slate-950"></span><span>✅ 步態週期已精準解析！</span>';
  setTimeout(() => {
    btn.innerHTML = CAPTURE_BTN_IDLE_HTML;
  }, 2500);
}

function finalizeCycleExtraction() {
  if (!isCapturingCycle) return;
  isCapturingCycle = false;
  livePoseOverride = null;
  document.getElementById("liveSyncToggle").checked = false;

  const isVideo = Boolean(sourceVideo.src);
  if (isVideo) {
    sourceVideo.playbackRate = savedVideoPlaybackRate;
    document.getElementById("videoRateSelect").value = String(
      savedVideoPlaybackRate,
    );
  }

  const btn = document.getElementById("captureCycleBtn");
  if (isVideo && capturedRawFrames.length >= 8) {
    // 影片擷取：上傳 landmarks 給 Server，結果回來才顯示完成
    startServerAnalysis(captureSeq, {
      frameWidth: videoCanvas.width,
      frameHeight: videoCanvas.height,
      runDirection: captureStart.runDirection,
      isManualDirection: captureStart.isManualDirection,
      heightCm: captureStart.heightCm,
      frames: capturedLandmarkFrames,
    });
    return;
  }

  showCaptureDone(btn);
}

// 上傳前先把按鈕切到「上傳分析中」（影片擷取與模擬擷取共用）
function startServerAnalysis(seq, req) {
  const btn = document.getElementById("captureCycleBtn");
  btn.className = CAPTURE_BTN_IDLE_CLASS + " opacity-70 cursor-wait";
  btn.disabled = true;
  btn.innerHTML =
    '<span class="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span><span>☁️ 上傳分析中…</span>';
  requestServerAnalysis(seq, req);
}

// 套用擷取結果：依手動設定或自動偵測決定步幅，建立 custom_captured 並切換
function applyCapturedResult(cadence, summary, cycleKeyframes) {
  // 擷取後一律回到自動步幅；步幅由 switchProfile 觸發的 derive 套用（3.7）
  isManualStride = false;

  RUNNER_PROFILES.custom_captured.cadence = cadence;
  RUNNER_PROFILES.custom_captured.summary = summary;
  // 重新擷取前一律清掉舊關鍵幀，避免新 summary 搭配舊關鍵幀
  delete RUNNER_PROFILES.custom_captured.cycleKeyframes;
  delete RUNNER_PROFILES.custom_captured.derived;
  if (cycleKeyframes !== undefined && cycleKeyframes !== null) {
    const ck = RFA.player.normalizeCycleKeyframes(cycleKeyframes);
    if (ck.ok) {
      RUNNER_PROFILES.custom_captured.cycleKeyframes = ck.keyframes;
    } else {
      console.warn("Server 回傳的 cycleKeyframes 不合法，將不顯示骨架：", ck.errors);
    }
  }

  document.getElementById("customVideoProfileOption").disabled = false;
  document.getElementById("profileSelect").value = "custom_captured";
  switchProfile("custom_captured");
}

function resetCaptureButton() {
  const btn = document.getElementById("captureCycleBtn");
  btn.disabled = false;
  btn.className = CAPTURE_BTN_IDLE_CLASS;
  btn.innerHTML = CAPTURE_BTN_IDLE_HTML;
}

// 上傳擷取期間的 landmarks（同源 POST /api/analyze）；不送 profileName（含影片檔名）
async function requestServerAnalysis(seq, req) {
  isAnalyzingRemote = true;
  const body = JSON.stringify({
    frameWidth: req.frameWidth,
    frameHeight: req.frameHeight,
    heightCm: req.heightCm,
    cameraMode: selectedCameraMode,
    runDirection: req.runDirection,
    isManualDirection: req.isManualDirection,
    frames: req.frames,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let message = null;
  let data = null;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    let payload = {};
    try {
      payload = await res.json();
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
    }
    if (res.ok) {
      if (
        payload &&
        typeof payload.summary === "object" &&
        payload.summary !== null &&
        Number.isFinite(payload.cadence)
      ) {
        data = payload;
      } else {
        message = "分析服務回應格式錯誤";
      }
    } else if (res.status === 422) {
      message = `有效步態影格不足（${payload.acceptedFrames ?? 0}/8），請調整起點或畫面後重試`;
    } else if (res.status === 429) {
      const wait = res.headers.get("Retry-After") || "數";
      message = `請求過於頻繁，請 ${wait} 秒後再試`;
    } else if (res.status === 400) {
      console.warn("analyze 400：", payload.details);
      message = "擷取資料不符格式（例如身高須介於 50–250 cm）";
    } else if (res.status === 413) {
      message = "擷取資料過大，請縮短擷取區間";
    } else {
      message = `分析服務暫時無法使用（${res.status}）`;
    }
  } catch (err) {
    message =
      err && err.name === "AbortError"
        ? "分析逾時，請重試"
        : "無法連線到分析服務";
    console.warn("analyze 請求失敗：", err);
  } finally {
    clearTimeout(timer);
  }

  // 過時回應（期間換了影片或重新擷取）：丟棄，不提示、不改狀態
  if (seq !== captureSeq) return;
  isAnalyzingRemote = false;
  const btn = document.getElementById("captureCycleBtn");
  btn.disabled = false;

  if (data) {
    applyCapturedResult(data.cadence, data.summary, data.cycleKeyframes);
    showCaptureDone(btn);
  } else {
    resetCaptureButton();
    alert(message);
  }
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
  reader.onload = async (e) => {
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

        // 1. 補預設值並前置檢查（derive 驗證較嚴格，壞檔拒絕匯入）
        const safeSummary = RFA.client.buildImportSummary(data);
        const errs = RFA.client.checkImportInputs(safeSummary, cadenceVal);
        if (errs.length) {
          console.warn("匯入檔數值超出可分析範圍：", errs);
          alert("此 JSON 的數值超出可分析範圍");
          return;
        }

        // 2. 向 Server 正規化 phaseTiming；檔案沒有合法關鍵幀時一併取骨架（D7）
        const fileCk =
          data.cycleKeyframes !== undefined
            ? RFA.player.normalizeCycleKeyframes(data.cycleKeyframes)
            : null;
        const needKf = !(fileCk && fileCk.ok);
        const r = await postDerive(
          RFA.client.buildDeriveBody(safeSummary, {
            cadence: cadenceVal,
            includeKeyframes: needKf,
          }),
        );
        if (!r.ok) {
          alert(r.message);
          return;
        }
        // ★ 全專案唯一把 derive 的 phaseTiming 寫回 summary 的地方（phaseTiming 不冪等）
        safeSummary.phaseTiming = r.data.phaseTiming;

        // 3. 還原機位模式選擇
        if (
          data.cameraMode &&
          ["auto", "static", "tracking"].includes(data.cameraMode)
        ) {
          selectedCameraMode = data.cameraMode;
          const camSelect = document.getElementById("cameraModeSelect");
          if (camSelect) camSelect.value = data.cameraMode;
        }

        RUNNER_PROFILES[dynamicKey] = attachEvalCycle({
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
        });

        // 合法的檔案關鍵幀優先；否則用 derive 補的骨架
        let kfSource = fileCk && fileCk.ok ? fileCk : null;
        if (!kfSource && r.data.cycleKeyframes !== undefined) {
          kfSource = RFA.player.normalizeCycleKeyframes(r.data.cycleKeyframes);
        }
        if (kfSource && kfSource.ok) {
          RUNNER_PROFILES[dynamicKey].cycleKeyframes = kfSource.keyframes;
          console.info(
            `已載入 cycleKeyframes（${kfSource.keyframes.frames.length} 幀）`,
          );
        } else {
          console.warn(
            "cycleKeyframes 不合法，將不顯示骨架：",
            kfSource && kfSource.errors,
          );
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

// 匯出檔名：<影片名>-<今日日期>.json（日期為本機時區 YYYY-MM-DD）。
// 內建 profile 沒有影片，用 profileKey；匯入的檔名會去掉副檔名與既有日期尾巴，避免重複。
function buildExportFileName(profile, profileKey, now) {
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  let base = "";
  if (profileKey !== "hsu_pose_method" && profileKey !== "night_track_runner") {
    base = String((profile && profile.name) || "")
      .replace(/^(🎥\s*影片:|📄)\s*/, "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .replace(/-\d{4}-\d{2}-\d{2}$/, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .trim();
  }
  return `${base || profileKey}-${date}.json`;
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
    phaseTiming: getActiveProfileTiming(),
    summary: profile.summary,
  };
  if (isDerivedCurrent(profile)) payload.metrics = profile.derived.result.metrics;
  if (profile.cycleKeyframes) payload.cycleKeyframes = profile.cycleKeyframes;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildExportFileName(profile, activeProfileKey, new Date());
  a.click();
  URL.revokeObjectURL(url);
}
