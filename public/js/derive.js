// 3.7：衍生值（遙測、總分、GCT、步幅）一律向 Server 的 POST /api/derive 取得；瀏覽器不再有核心公式。
// 渲染維持同步，讀 profile.derived 快取；不在繪圖路徑發請求。
// derive 回應的 phaseTiming 只在匯入時（importAnalysisJSON）寫回 summary，這裡刻意不讀、不寫。
const DERIVE_DEBOUNCE_MS = 400; // 手動步頻 oninput
const DERIVE_TIMEOUT_MS = 10000;
let deriveSeq = 0; // 每次送出遞增；回應的 seq 不是最新 → 丟棄
let deriveTimer = null;
let deriveAbort = null;
let inflightApplyStride = false; // 進行中請求的 applyStride；被同 profile 新請求取代時併入
let inflightProfileKey = null;
let pendingApplyStride = false; // debounce 期間合併（OR）
let deriveStatus = "idle"; // idle | pending | error
let deriveErrorMessage = "";

function currentDeriveInputs(profile) {
  return {
    cadence: profile.cadence || 180,
    heightCm:
      parseFloat(document.getElementById("runnerHeightInput").value) || 172,
    cameraMode: selectedCameraMode,
  };
}

function buildProfileDeriveBody(profile) {
  return RFA.client.buildDeriveBody(profile.summary, currentDeriveInputs(profile));
}

// 記憶鍵排除 summary.strideMeters：不要求骨架時回應與它無關（手動步幅、自動步幅寫回都會改它）
function keyOf(body) {
  const { strideMeters, ...rest } = body.summary; // eslint-disable-line no-unused-vars
  return RFA.client.deriveKey({ ...body, summary: rest });
}

function getActiveDerived() {
  const profile = RUNNER_PROFILES[activeProfileKey];
  return profile && profile.derived ? profile.derived.result : null;
}

// 快取是否與目前輸入相同（匯出 metrics 把關）
function isDerivedCurrent(profile) {
  if (!profile || !profile.derived) return false;
  return profile.derived.key === keyOf(buildProfileDeriveBody(profile));
}

// signal 由呼叫端管理（一般 derive 與匯入各自獨立）；逾時與被取代分開回報
async function postDerive(body, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DERIVE_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch("/api/derive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload = {};
    try {
      payload = await res.json();
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
    }
    if (res.ok) {
      if (payload && payload.metrics && payload.stride) return { ok: true, data: payload };
      return { ok: false, message: "分析服務回應格式錯誤" };
    }
    if (res.status === 429) {
      return { ok: false, status: 429, message: `請求過於頻繁，請 ${res.headers.get("Retry-After") || "數"} 秒後再試` };
    }
    if (res.status === 400) {
      console.warn("derive 400：", payload.details);
      return { ok: false, status: 400, message: "數值超出範圍（例如身高須介於 50–250 cm）" };
    }
    return { ok: false, status: res.status, message: `分析服務暫時無法使用（${res.status}）` };
  } catch (err) {
    console.warn("derive 請求失敗：", err);
    if (err && err.name === "AbortError") {
      return timedOut
        ? { ok: false, message: "衍生值計算逾時" }
        : { ok: false, aborted: true, message: "衍生值計算已被取代" };
    }
    return { ok: false, message: "無法連線到分析服務" };
  } finally {
    clearTimeout(timer);
  }
}

// 把 derive 的 stride 寫回 summary 與步幅 UI（原 recalculateStrideForCameraMode 的寫回本體）
function applyStrideResult(s, stride) {
  if (typeof s._measuredPixelStride !== "number" && typeof stride.pixelVal === "number") {
    s._measuredPixelStride = stride.pixelVal;
  }
  s.strideMeters = stride.strideMeters;
  s.measuredStrideMeters = stride.measuredStrideMeters;
  strideModeText = stride.strideModeText;
  isManualStride = false;
  manualStrideValue = s.strideMeters;
  const finalStride = Number(s.strideMeters || 0.95).toFixed(2);
  const customEl = document.getElementById("customStrideInput");
  if (customEl) customEl.value = finalStride;
  const bannerEl = document.getElementById("bannerStrideInput");
  if (bannerEl) bannerEl.value = finalStride;
  updateStrideModeUI();
}

function applyDerivedResult(profileKey, result, applyStride) {
  const profile = RUNNER_PROFILES[profileKey];
  if (!profile) return;
  if (applyStride && isManualStride === false) {
    applyStrideResult(profile.summary, result.stride);
    // 寫回改變了 summary；以寫回後的輸入重新取鍵，切回此 profile 才不會重送
    profile.derived.key = keyOf(buildProfileDeriveBody(profile));
  }
  if (profileKey !== activeProfileKey) return;
  refreshAfterDerive();
}

function refreshAfterDerive() {
  updateTelemetryAndDiagnostics();
  drawWaveform();
  if (!simPlaying) drawSimulator();
}

// applyStride：回應到達時（或命中記憶時）是否套用 stride（僅非手動步幅）
function scheduleDerive({ applyStride = false, delayMs = 0 } = {}) {
  pendingApplyStride = pendingApplyStride || applyStride;
  if (deriveTimer) clearTimeout(deriveTimer);
  if (delayMs > 0) {
    deriveStatus = "pending";
    deriveTimer = setTimeout(runDerive, delayMs);
  } else {
    deriveTimer = null;
    runDerive();
  }
}

async function runDerive() {
  deriveTimer = null;
  let applyStride = pendingApplyStride;
  pendingApplyStride = false;
  const profileKey = activeProfileKey;
  // 取代同一 profile 進行中的請求時，保留它的 applyStride
  if (inflightProfileKey === profileKey && inflightApplyStride) applyStride = true;
  const profile = RUNNER_PROFILES[profileKey];
  if (!profile || !profile.summary) return;

  const body = buildProfileDeriveBody(profile);
  const key = keyOf(body);
  if (profile.derived && profile.derived.key === key) {
    deriveSeq++;
    if (deriveAbort) deriveAbort.abort();
    deriveStatus = "idle";
    applyDerivedResult(profileKey, profile.derived.result, applyStride);
    return;
  }

  const seq = ++deriveSeq;
  if (deriveAbort) deriveAbort.abort();
  const controller = new AbortController();
  deriveAbort = controller;
  inflightProfileKey = profileKey;
  inflightApplyStride = applyStride;
  deriveStatus = "pending";
  updateTelemetryAndDiagnostics();
  const r = await postDerive(body, controller.signal);
  if (seq !== deriveSeq) return; // 過時回應：丟棄
  inflightProfileKey = null;
  inflightApplyStride = false;
  if (profileKey !== activeProfileKey) return;
  if (r.ok) {
    deriveStatus = "idle";
    deriveErrorMessage = "";
    profile.derived = { key, result: r.data };
    applyDerivedResult(profileKey, r.data, applyStride);
  } else {
    deriveStatus = "error";
    deriveErrorMessage = r.message;
    refreshAfterDerive();
  }
}
