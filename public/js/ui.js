const sourceVideo = document.getElementById("sourceVideo");
const preprocessCanvas = document.getElementById("preprocessCanvas");
const preprocessCtx = preprocessCanvas.getContext("2d");
const videoCanvas = document.getElementById("videoOverlayCanvas");
const videoCtx = videoCanvas.getContext("2d");
const videoDropZone = document.getElementById("videoDropZone");
const coreOneCard = document.getElementById("coreOneCard");
const dragHoverBanner = document.getElementById("dragHoverBanner");

function syncVideoPlayButtonUI() {
  const btn = document.getElementById("videoPlayBtn");
  const isPlaying =
    (sourceVideo.src && !sourceVideo.paused && !sourceVideo.ended) ||
    isUsingSimulatedFeed;
  if (isPlaying) {
    btn.textContent = "⏸ 暫停影片";
    btn.className =
      "px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-md";
  } else {
    btn.textContent = "▶ 播放影片";
    btn.className =
      "px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md";
  }
}

sourceVideo.addEventListener("play", syncVideoPlayButtonUI);
sourceVideo.addEventListener("pause", syncVideoPlayButtonUI);
sourceVideo.addEventListener("ended", () => {
  syncVideoPlayButtonUI();
  if (isCapturingCycle && capturedRawFrames.length >= 15) {
    finalizeCycleExtraction();
  }
});

function updateNightBoostBtnUI(reasonText = "") {
  const btn = document.getElementById("nightBoostBtn");
  if (nightBoostEnabled) {
    btn.textContent = `🔆 夜間增亮補強: 開啟${reasonText}`;
    btn.className =
      "px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 transition";
  } else {
    btn.textContent = `☀️ 明亮背景: 關閉增亮防過曝${reasonText}`;
    btn.className =
      "px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 transition";
  }
}

function toggleNightBoost() {
  nightBoostEnabled = !nightBoostEnabled;
  updateNightBoostBtnUI(" (手動)");
  if (sourceVideo.src && sourceVideo.paused)
    sendCurrentVideoFrameToPose(true);
}

// ★ 阻擋瀏覽器預設把拖拉進來的影片直接在新視窗打開
window.addEventListener("dragover", (e) => e.preventDefault(), false);
window.addEventListener("drop", (e) => e.preventDefault(), false);

// ★ 綁定在整個核心一區域，徹底解決子層遮擋拖拉的問題
[coreOneCard, videoDropZone].forEach((zone) => {
  if (!zone) return;
  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoDropZone.classList.add("drag-over-active");
    dragHoverBanner.classList.remove("hidden");
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoDropZone.classList.add("drag-over-active");
    dragHoverBanner.classList.remove("hidden");
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.contains(e.relatedTarget)) {
      videoDropZone.classList.remove("drag-over-active");
      dragHoverBanner.classList.add("hidden");
    }
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoDropZone.classList.remove("drag-over-active");
    dragHoverBanner.classList.add("hidden");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      loadVideoFile(files[0]);
    }
  });
});

function handleHeaderVideoUpload(event) {
  const file = event.target.files[0];
  if (file) loadVideoFile(file);
  event.target.value = "";
}
function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (file) loadVideoFile(file);
  event.target.value = "";
}

function loadVideoFile(file) {
  if (
    !file.type.startsWith("video/") &&
    !file.name.match(/\.(mp4|mov|webm|m4v|avi)$/i)
  ) {
    alert("請上傳影片檔案 (.mp4, .mov, .webm)");
    return;
  }
  // 作廢進行中的上傳（回應回來時丟棄），並還原按鈕
  captureSeq++;
  if (isCapturingCycle) {
    // 擷取中途換影片：放棄舊幀，避免兩支影片的資料混在一起
    isCapturingCycle = false;
    capturedRawFrames = [];
    capturedLandmarkFrames = [];
    if (sourceVideo.src) sourceVideo.playbackRate = savedVideoPlaybackRate;
    resetCaptureButton();
  }
  if (isAnalyzingRemote) {
    isAnalyzingRemote = false;
    resetCaptureButton();
  }
  isUsingSimulatedFeed = false;
  isManualDirection = false;
  livePoseOverride = null;
  prevValidLandmarks = null;
  lockedSubjectHipX = null;
  lockedSubjectHipY = null;
  const url = URL.createObjectURL(file);
  sourceVideo.src = url;
  sourceVideo.playbackRate = parseFloat(
    document.getElementById("videoRateSelect").value || 0.5,
  );
  document.getElementById("videoEmptyOverlay").classList.add("hidden");

  sourceVideo.onloadeddata = async () => {
    const vw = sourceVideo.videoWidth || 640;
    const vh = sourceVideo.videoHeight || 400;
    videoCanvas.width = vw;
    videoCanvas.height = vh;
    preprocessCanvas.width = vw;
    preprocessCanvas.height = vh;

    autoDetectVideoBrightness();

    document.getElementById("aiEngineStateText").textContent =
      `載入 Heavy 模型中...`;
    await initMediaPipePose();
    document.getElementById("aiEngineStateText").textContent =
      `追蹤中 (${vw}x${vh})`;

    RUNNER_PROFILES.custom_captured.name = `🎥 影片: ${file.name}`;
    const customOpt = document.getElementById("customVideoProfileOption");
    customOpt.disabled = false;
    customOpt.textContent = `🎥 影片: ${file.name}`;
    document.getElementById("profileSelect").value = "custom_captured";
    switchProfile("custom_captured");

    sourceVideo.play();
    syncVideoPlayButtonUI();
    processVideoFrameLoop();
  };
}

function setRunDirection(dir, isManual = false) {
  runDirection = dir;
  if (isManual) isManualDirection = true;
  document.getElementById("dirLeftToRight").className =
    dir === 1
      ? "px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-medium"
      : "px-2 py-0.5 rounded text-slate-400 hover:text-white";
  document.getElementById("dirRightToLeft").className =
    dir === -1
      ? "px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-medium"
      : "px-2 py-0.5 rounded text-slate-400 hover:text-white";
  const badge = document.getElementById("autoDirBadge");
  if (badge) {
    badge.textContent = `方向: ${dir === 1 ? "左➔右" : "右➔左"}${isManual ? "(手動)" : "(AI自動)"}`;
  }
}

function updateFrameCounterHUD() {
  const curT = sourceVideo.currentTime || 0;
  const estFrame = Math.round(curT * 30);
  document.getElementById("liveFrameCounter").textContent =
    `#${estFrame} (${curT.toFixed(2)}s)`;
}

function switchProfile(key) {
  if (!RUNNER_PROFILES[key]) return;
  activeProfileKey = key;
  livePoseOverride = null;
  document.getElementById("liveSyncToggle").checked = false;
  if (!isManualStride) {
    const s = RUNNER_PROFILES[key].summary;
    if (s) {
      recalculateStrideForCameraMode(s);
    }
  }
  updateTelemetryAndDiagnostics();
  if (!simPlaying) {
    const timing = getActiveRunnerTiming();
    jumpToCyclePct(timing.posePct);
  } else {
    drawSimulator();
    drawWaveform();
  }
}

function toggleLayer(name) {
  layers[name] = !layers[name];
  const btnMap = {
    ghost: { id: "toggleGhostBtn", label: "👻 徐國峰虛線" },
    trail: { id: "toggleTrailBtn", label: "〰️ 水滴分色軌跡" },
  };
  const btn = document.getElementById(btnMap[name].id);
  btn.textContent = `${btnMap[name].label}: ${layers[name] ? "開啟" : "關閉"}`;
  btn.style.opacity = layers[name] ? "1" : "0.5";
  drawSimulator();
}

function setSimPlayState(playing) {
  simPlaying = playing;
  if (!playing) {
    livePoseOverride = null;
    document.getElementById("liveSyncToggle").checked = false;
  }
  const btn = document.getElementById("simPlayBtn");
  const dot = document.getElementById("simPlayDot");
  const stateLabel = document.getElementById("simStateLabel");
  if (simPlaying) {
    btn.textContent = "⏸ 暫停循環";
    btn.className =
      "px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-md";
    dot.className =
      "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0";
    stateLabel.textContent = "循環播放中";
  } else {
    btn.textContent = "▶ 播放循環";
    btn.className =
      "px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md";
    dot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0";
    stateLabel.textContent = "⏸ 已定格暫停";
  }
}

function toggleSimPlay() {
  setSimPlayState(!simPlaying);
  drawSimulator();
  drawWaveform();
}
function stepSimCycle(deltaPct) {
  setSimPlayState(false);
  cyclePct = (((cyclePct + deltaPct) % 100) + 100) % 100;
  document.getElementById("cycleSlider").value = Math.round(cyclePct);
  updateSimPhaseHUD();
  drawSimulator();
  drawWaveform();
}
function setSimSpeed(spd) {
  simSpeed = spd;
  ["025", "050", "100"].forEach(
    (k) =>
      (document.getElementById("spd" + k).className =
        "px-2 py-0.5 rounded text-slate-400"),
  );
  document.getElementById(
    spd === 0.25 ? "spd025" : spd === 0.5 ? "spd050" : "spd100",
  ).className =
    "px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold";
}
function manualScrubCycle(val) {
  setSimPlayState(false);
  cyclePct = parseFloat(val);
  updateSimPhaseHUD();
  drawSimulator();
  drawWaveform();
}

function jumpToRunnerPhase(phaseType) {
  const timing = getActiveRunnerTiming();
  const map = {
    touch: timing.touchPct,
    pose: timing.posePct,
    fall: timing.fallPct,
    pull: timing.pullPct,
  };
  jumpToCyclePct(map[phaseType] ?? 15);
}

function jumpToCyclePct(pct) {
  setSimPlayState(false);
  cyclePct = pct;
  document.getElementById("cycleSlider").value = pct;
  updateSimPhaseHUD();
  drawSimulator();
  drawWaveform();
}

function updateSimPhaseHUD() {
  const pct = Math.round(((cyclePct % 100) + 100) % 100);
  document.getElementById("simPctText").textContent = `${pct}%`;

  const timing = getActiveRunnerTiming();
  const bPoseStart = Math.max(5, timing.posePct - 7);
  const bFallStart = timing.posePct + 6;
  const bPullTransition = 64;

  const btnIds = ["phaseBtn0", "phaseBtn15", "phaseBtn30", "phaseBtn55"];
  btnIds.forEach((id) =>
    document.getElementById(id)?.classList.remove("phase-btn-active"),
  );

  let title = "";
  const titleEl = document.getElementById("simPhaseTitle");
  if (pct < bPoseStart || pct > 94) {
    title = `1. 開始觸地 (${timing.touchPct}% 🔴紅段 • 前腳尖觸地/右腿在後)`;
    titleEl.className = "text-[11px] font-bold text-rose-400";
    document
      .getElementById("phaseBtn0")
      ?.classList.add("phase-btn-active");
  } else if (pct >= bPoseStart && pct <= bFallStart) {
    title = `★ 2. 關鍵跑姿 (右腿 ${timing.posePct}% vs 徐 15% • 🟠黃段4字型)`;
    titleEl.className = "text-[11px] font-bold text-amber-400";
    document
      .getElementById("phaseBtn15")
      ?.classList.add("phase-btn-active");
  } else if (pct > bFallStart && pct < bPullTransition) {
    title = `3. 落下 (右腿下落+Ground前段 ${timing.fallPct}% vs 徐 30% • 🔵藍段)`;
    titleEl.className = "text-[11px] font-bold text-sky-400";
    document
      .getElementById("phaseBtn30")
      ?.classList.add("phase-btn-active");
  } else {
    title = `4. 拉起 (Ground後段抽腿 ${timing.pullPct}% vs 徐 75% • 🟣紫段)`;
    titleEl.className = "text-[11px] font-bold text-purple-400";
    document
      .getElementById("phaseBtn55")
      ?.classList.add("phase-btn-active");
  }
  titleEl.textContent = title;
}

function toggleVideoPlay() {
  if (!sourceVideo.src) {
    startSimulatedVideoFeed();
    return;
  }
  if (sourceVideo.paused) {
    sourceVideo.play();
    syncVideoPlayButtonUI();
    processVideoFrameLoop();
  } else {
    sourceVideo.pause();
    syncVideoPlayButtonUI();
    updateFrameCounterHUD();
  }
}

function stepVideoFrame(dir) {
  if (!sourceVideo.src) {
    stepSimCycle(dir * 2);
    return;
  }
  isUsingSimulatedFeed = false;
  sourceVideo.pause();
  syncVideoPlayButtonUI();
  const targetTime = Math.max(
    0,
    Math.min(
      (sourceVideo.duration || 10) - 0.01,
      sourceVideo.currentTime + dir * (1 / 30),
    ),
  );
  sourceVideo.onseeked = async () => {
    sourceVideo.onseeked = null;
    if (sourceVideo.duration)
      document.getElementById("videoSeekSlider").value =
        (sourceVideo.currentTime / sourceVideo.duration) * 100;
    updateFrameCounterHUD();
    await sendCurrentVideoFrameToPose(true);
  };
  sourceVideo.currentTime = targetTime;
}

function seekVideo(val) {
  if (!sourceVideo.src || !sourceVideo.duration) return;
  sourceVideo.pause();
  syncVideoPlayButtonUI();
  const targetTime = (val / 100) * sourceVideo.duration;
  sourceVideo.onseeked = async () => {
    sourceVideo.onseeked = null;
    updateFrameCounterHUD();
    await sendCurrentVideoFrameToPose(true);
  };
  sourceVideo.currentTime = targetTime;
}

function changeVideoRate(val) {
  const rate = parseFloat(val);
  sourceVideo.playbackRate = rate;
  savedVideoPlaybackRate = rate;
}

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")
    return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (sourceVideo.src && !isUsingSimulatedFeed) stepVideoFrame(-1);
    else stepSimCycle(-2);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (sourceVideo.src && !isUsingSimulatedFeed) stepVideoFrame(1);
    else stepSimCycle(2);
  } else if (e.key === " ") {
    e.preventDefault();
    if (sourceVideo.src && !isUsingSimulatedFeed) toggleVideoPlay();
    else toggleSimPlay();
  }
});
