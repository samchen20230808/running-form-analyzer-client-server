// 5.3 手機版三區殼層：手機寬度時把既有節點搬進 #mobileBar／#analysisActions（ID 與事件不變），
// 提供核心一／核心二／分析三個主題切換與步幅「改回 AI 自動」彈出面板。桌面不做任何事。
// 頂層只用 getElementById，不依賴其他腳本的載入順序；不發請求、不使用瀏覽器儲存。
(function () {
  const $ = (id) => document.getElementById(id);
  const mq = window.matchMedia("(max-width: 639.98px)");

  // [節點 id, 手機目的地 id]
  const MOVES = [
    ["runnerHeightInput", "mSlotHeight"],
    ["bannerStrideInput", "mSlotStride"],
    ["topCadenceInput", "mSlotCadence"],
    ["topPaceVal", "mSlotPace"],
    ["profileSelect", "mSlotProfile"],
    ["navUploadLabel", "mSlotUpload"],
    ["navJsonLabel", "mSlotUpload"],
    ["exportJsonBtn", "analysisActions"],
    ["exportReportBtn", "analysisActions"],
  ];
  const homes = new Map(); // 節點 id → 原位佔位註解
  let active = false;
  let currentTab = "one";
  let badgeObserver = null;
  let scrollQueued = false;

  function moveIn() {
    for (const [id, dest] of MOVES) {
      const el = $(id);
      const to = $(dest);
      if (!el || !to || homes.has(id)) continue;
      const marker = document.createComment(`mobile-home:${id}`);
      el.parentNode.insertBefore(marker, el);
      homes.set(id, marker);
      to.appendChild(el);
    }
  }

  function moveOut() {
    for (const [id, marker] of homes) {
      const el = $(id);
      if (el && marker.parentNode) marker.parentNode.insertBefore(el, marker);
      if (marker.parentNode) marker.parentNode.removeChild(marker);
    }
    homes.clear();
  }

  function setPressed(which) {
    const map = { one: "tabCoreOne", two: "tabCoreTwo", analysis: "tabAnalysis" };
    for (const [key, id] of Object.entries(map)) {
      $(id).setAttribute("aria-pressed", key === which ? "true" : "false");
    }
  }

  function showCore(which) {
    currentTab = which;
    $("coreSection").setAttribute("data-mobile-tab", which);
    setPressed(which);
    closePopover();
    // 切換後讓主題區頂端可見（已在上方則不動）
    const bar = $("mobileBar");
    const top = $("coreSection").getBoundingClientRect().top;
    const barBottom = bar.getBoundingClientRect().bottom;
    if (top < barBottom) {
      window.scrollTo({ top: window.scrollY + top - barBottom - 8, behavior: "auto" });
    }
  }

  function showAnalysis() {
    closePopover();
    setPressed("analysis");
    $("analysisActions").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 步幅彈出面板
  function updateChip() {
    const badge = $("strideSourceBadge");
    // 不可用文字判斷：機位「手動鎖定」的來源文案也含「手動」，但步幅仍是 AI 自動
    const manual = typeof isManualStride !== "undefined" && isManualStride === true;
    const chip = $("strideChip");
    chip.textContent = manual ? "手動" : "AI";
    chip.setAttribute("aria-label", manual ? "步幅來源：手動自訂，開啟選項" : "步幅來源：AI 自動，開啟選項");
    chip.setAttribute("data-manual", manual ? "1" : "0");
    $("stridePopoverText").textContent = badge ? badge.textContent.trim() : "";
    $("strideResetBtn").disabled = !manual;
  }

  function closePopover() {
    $("stridePopover").classList.add("hidden");
    $("strideChip").setAttribute("aria-expanded", "false");
  }

  function togglePopover() {
    const pop = $("stridePopover");
    const open = pop.classList.contains("hidden");
    if (open) {
      updateChip();
      pop.classList.remove("hidden");
    } else {
      pop.classList.add("hidden");
    }
    $("strideChip").setAttribute("aria-expanded", open ? "true" : "false");
  }

  // 「分析」錨點的捲動留白 = 常駐區實際高度（避免被 sticky 蓋住）
  function fitAnchorMargin() {
    $("analysisActions").style.scrollMarginTop = `${$("mobileBar").offsetHeight + 8}px`;
  }

  // 依捲動位置高亮：分析區頂端進入常駐區下方 → 「分析」，否則為目前核心
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (!active) return;
      const barBottom = $("mobileBar").getBoundingClientRect().bottom;
      const top = $("analysisActions").getBoundingClientRect().top;
      setPressed(top <= barBottom + 40 ? "analysis" : currentTab);
    });
  }

  function enter() {
    if (active) return;
    active = true;
    moveIn();
    for (const id of ["appHeader", "headerToolbar", "dashBanner"]) {
      const el = $(id);
      if (el) el.setAttribute("data-shell", "on");
    }
    $("mobileBar").classList.remove("hidden");
    $("analysisActions").classList.remove("hidden");
    $("coreSection").setAttribute("data-mobile-tab", currentTab);
    setPressed(currentTab);
    updateChip();
    const badge = $("strideSourceBadge");
    if (badge && !badgeObserver) {
      badgeObserver = new MutationObserver(updateChip);
      badgeObserver.observe(badge, { childList: true, characterData: true, subtree: true, attributes: true });
    }
    fitAnchorMargin();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", fitAnchorMargin);
  }

  function leave() {
    if (!active) return;
    active = false;
    closePopover();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", fitAnchorMargin);
    $("analysisActions").style.scrollMarginTop = "";
    if (badgeObserver) {
      badgeObserver.disconnect();
      badgeObserver = null;
    }
    moveOut();
    for (const id of ["appHeader", "headerToolbar", "dashBanner"]) {
      const el = $(id);
      if (el) el.removeAttribute("data-shell");
    }
    $("mobileBar").classList.add("hidden");
    $("analysisActions").classList.add("hidden");
    $("coreSection").removeAttribute("data-mobile-tab");
  }

  function sync() {
    if (mq.matches) enter();
    else leave();
  }

  $("tabCoreOne").addEventListener("click", () => showCore("one"));
  $("tabCoreTwo").addEventListener("click", () => showCore("two"));
  $("tabAnalysis").addEventListener("click", showAnalysis);
  $("strideChip").addEventListener("click", togglePopover);
  $("strideResetBtn").addEventListener("click", () => {
    resetStrideToAuto();
    closePopover();
  });
  // 第 1 行輸入框視覺只有 28px 高：點整格（約 48px）也聚焦輸入框，維持 44px 觸控目標
  for (const cell of document.querySelectorAll("#mobileRow1 .m-cell")) {
    cell.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const input = cell.querySelector("input");
      if (input && e.target !== input) input.focus();
    });
  }
  document.addEventListener("click", (e) => {
    const pop = $("stridePopover");
    if (pop.classList.contains("hidden")) return;
    if (pop.contains(e.target) || $("strideChip").contains(e.target)) return;
    closePopover();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
  });
  if (mq.addEventListener) mq.addEventListener("change", sync);
  else mq.addListener(sync); // Safari < 14
  sync();
})();
