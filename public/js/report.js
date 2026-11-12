// Feature 3.8：匯出分析報告（瀏覽器列印另存 PDF）
// 只讀目前畫面與 3.7 的 derive 快取／唯讀相位；不發請求、不寫任何狀態、不含核心公式。

function escapeReportHtml(str) {
  return String(str == null ? "" : str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function getReportVideoName(profile) {
  return String(profile.name || "").replace(/^(🎥\s*影片:|📄)\s*/, "");
}

// 取樣指定循環百分比的骨架圖；強制顯示徐骨架與水滴軌跡，結束後還原使用者狀態。
function captureSkeletonSnapshots(pcts) {
  const saved = {
    cyclePct,
    ghost: layers.ghost,
    trail: layers.trail,
    live: livePoseOverride,
  };
  const out = [];
  try {
    layers.ghost = true;
    layers.trail = true;
    livePoseOverride = null;
    pcts.forEach((pct) => {
      cyclePct = pct;
      drawSimulator();
      const off = document.createElement("canvas");
      off.width = simCanvas.width;
      off.height = simCanvas.height;
      const ctx = off.getContext("2d");
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, off.width, off.height);
      ctx.drawImage(simCanvas, 0, 0);
      out.push(off.toDataURL("image/png"));
    });
  } finally {
    cyclePct = saved.cyclePct;
    layers.ghost = saved.ghost;
    layers.trail = saved.trail;
    livePoseOverride = saved.live;
    drawSimulator();
  }
  return out;
}

function buildReportHtml(displayName) {
  const derived = getActiveDerived();
  const gct = derived && derived.metrics ? derived.metrics.gct : null;
  if (!gct) throw new Error("尚無觸地時間資料，請稍候再匯出");
  const isWalk = !!gct.skipHsuCompare;
  const timing = getActiveProfileTiming();
  const text = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : "";
  };

  // 無相位時（理論上不會發生）只取 15% 一張
  const phases = timing
    ? [
        ["①觸地", timing.touchPct],
        ["②關鍵跑姿", timing.posePct],
        ["③落下", timing.fallPct],
        ["④拉起", timing.pullPct],
      ]
    : [["骨架", 15]];
  const shotIdx = !timing ? [0] : isWalk ? [1] : [0, 1, 2, 3];
  const shots = captureSkeletonSnapshots(phases.map((p) => p[1]));
  const skeletonHtml = `
    <section class="rp-section">
      <h2>骨架圖（個人骨架＋水滴軌跡＋徐國峰骨架疊圖）</h2>
      <div class="rp-shots ${shotIdx.length === 1 ? "rp-shots-one" : ""}">
        ${shotIdx
          .map(
            (i) => `<figure><img src="${shots[i]}" alt="${phases[i][0]}" />
              <figcaption>${phases[i][0]}（${phases[i][1]}%）</figcaption></figure>`,
          )
          .join("")}
      </div>
    </section>`;

  const basicHtml = `
    <section class="rp-section">
      <h2>基本資訊</h2>
      <div class="rp-basic">
        <div><span>步頻</span><b>${escapeReportHtml(document.getElementById("topCadenceInput").value)}</b> spm</div>
        <div><span>步幅</span><b>${escapeReportHtml(document.getElementById("bannerStrideInput").value)}</b> 公尺/步</div>
        <div><span>換算配速</span><b>${escapeReportHtml(text("topPaceVal"))}</b> /km（${escapeReportHtml(text("topSpeedVal"))}）</div>
      </div>
    </section>`;

  let analysisHtml = "";
  if (!isWalk) {
    const cards = Array.from(
      document.querySelectorAll("#diagnosticCardsContainer > div"),
    ).map((c) => {
      const spans = c.querySelectorAll("span");
      const theme = /card-glow-(\w+)/.exec(c.className);
      return `<div class="rp-card rp-${theme ? theme[1] : "emerald"}">
        <div class="rp-card-head"><span>${spans[0] ? escapeReportHtml(spans[0].textContent) : ""}</span><span class="rp-badge">${spans[1] ? escapeReportHtml(spans[1].textContent) : ""}</span></div>
        <h3>${escapeReportHtml(c.querySelector("h3")?.textContent)}</h3>
        <div class="rp-metric">${escapeReportHtml(c.querySelector(".font-mono.font-bold")?.textContent)}</div>
        <p>${c.querySelector("p")?.innerHTML || ""}</p></div>`;
    });
    analysisHtml = `
    <section class="rp-section">
      <h2>綜合評分</h2>
      <div class="rp-score">
        <div class="rp-score-num">${escapeReportHtml(text("overallScoreNum"))}<small>/ 100</small></div>
        <div><b>${escapeReportHtml(text("overallGradeBadge"))}</b>
        <p>${escapeReportHtml(text("overallScoreSummary"))}</p></div>
      </div>
    </section>
    <section class="rp-section">
      <h2>7 大指標與教練診斷</h2>
      <div class="rp-cards">${cards.join("")}</div>
    </section>
    <section class="rp-section">
      <h2>觸地時間（GCT）</h2>
      <div class="rp-gct-bar">
        <div style="width:${gct.stancePct}%;background:#f43f5e">左著地 ${gct.gctMs}ms</div>
        <div style="width:${50 - gct.stancePct}%;background:#0ea5e9">${escapeReportHtml(gct.flightLabel || `騰空 ${gct.flightMs}ms`)}</div>
        <div style="width:${gct.stancePct}%;background:#f43f5e">右著地 ${gct.gctMs}ms</div>
        <div style="width:${50 - gct.stancePct}%;background:#0ea5e9">${escapeReportHtml(gct.flightLabel || `騰空 ${gct.flightMs}ms`)}</div>
      </div>
      <p>${escapeReportHtml(text("gctRangeBadge"))}</p>
      <p>${escapeReportHtml(text("gctDetailText"))}　${escapeReportHtml(text("gctCompareBadge"))}　${escapeReportHtml(text("gctStatusText"))}</p>
    </section>`;
  }

  const notes = isWalk
    ? "本影片判定為行走步態，僅提供基本資訊，不做跑姿評分與徐國峰標準比對。"
    : "步幅與配速為依影片與身高推算的估計值，非實測 GPS；單支側拍影片受拍攝角度、鏡頭位移與動態模糊影響，數值僅供姿勢調整參考。";
  const today = new Date().toLocaleDateString("zh-TW");

  return `
    <header class="rp-header">
      <div class="rp-kicker">${escapeReportHtml(APP_CONFIG.systemName)}　${escapeReportHtml(APP_CONFIG.version)}</div>
      <h1 id="reportTitleText">${escapeReportHtml(displayName)}</h1>
      <div class="rp-meta">分析日期：${escapeReportHtml(today)}　類型：${isWalk ? "行走步態" : "跑步"}</div>
    </header>
    ${basicHtml}
    ${skeletonHtml}
    ${analysisHtml}
    <footer class="rp-notes"><b>備註：</b>${escapeReportHtml(notes)}</footer>`;
}

// 瀏覽器「另存為 PDF」預設檔名取自 document.title：改為「影片名 跑姿分析-日期」
let reportOriginalTitle = null;
function setReportDocTitle(name) {
  if (reportOriginalTitle === null) reportOriginalTitle = document.title;
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const safe = String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  document.title = `${safe ? safe + " " : ""}跑姿分析-${ymd}`;
}

function openReport() {
  const profile = RUNNER_PROFILES[activeProfileKey];
  // 報告的 GCT 讀快取、其他數值讀 DOM，兩者必須來自同一份輸入
  if (!isDerivedCurrent(profile) || deriveStatus === "pending") {
    alert("數值更新中或更新失敗，請稍候再匯出");
    return;
  }
  try {
    openReportUnsafe();
  } catch (err) {
    console.warn("匯出報告失敗", err);
    alert("匯出報告失敗：" + (err && err.message ? err.message : err));
  }
}

function openReportUnsafe() {
  const profile =
    RUNNER_PROFILES[activeProfileKey] || RUNNER_PROFILES.hsu_pose_method;
  const defaultName = getReportVideoName(profile);
  let overlay = document.getElementById("reportOverlay");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "reportOverlay";
  // 內嵌關鍵樣式：即使 main.css 被瀏覽器快取成舊版，浮層仍會蓋滿畫面
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:100;overflow:auto;background:rgba(2,6,23,.94);padding:16px";
  overlay.innerHTML = `
    <div class="rp-toolbar">
      <label>顯示名稱 <input id="reportNameInput" type="text" /></label>
      <button type="button" id="reportPrintBtn">🖨️ 列印／另存 PDF</button>
      <button type="button" id="reportCloseBtn">✕ 關閉</button>
    </div>
    <article id="reportPage" class="rp-page"></article>`;
  // 先組出內容再掛上浮層：失敗時不留下無法關閉的空浮層
  const html = buildReportHtml(defaultName);
  document.body.appendChild(overlay);
  document.getElementById("reportPage").innerHTML = html;
  const nameInput = document.getElementById("reportNameInput");
  nameInput.value = defaultName;
  setReportDocTitle(defaultName);
  nameInput.addEventListener("input", () => {
    document.getElementById("reportTitleText").textContent = nameInput.value;
    setReportDocTitle(nameInput.value);
  });
  document.getElementById("reportPrintBtn").onclick = () => window.print();
  document.getElementById("reportCloseBtn").onclick = closeReport;
  document.body.classList.add("report-open");
}

function closeReport() {
  const overlay = document.getElementById("reportOverlay");
  if (overlay) overlay.remove();
  document.body.classList.remove("report-open");
  if (reportOriginalTitle !== null) {
    document.title = reportOriginalTitle;
    reportOriginalTitle = null;
  }
}
