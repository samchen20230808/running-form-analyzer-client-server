// 5.2 PWA：service worker 註冊與「提示後更新」。一般 script、IIFE，不依賴其他 js/*.js。
(function () {
  "use strict";
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1";
  var params = new URLSearchParams(location.search);

  // 本機開發：預設不註冊（避免 cache-first 殼層讓改動看不到）；?sw=1 註冊、?sw=0 解除。
  if (isLocal) {
    if (params.get("sw") === "0") {
      navigator.serviceWorker
        .getRegistrations()
        .then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
        .then(function () { return caches.keys(); })
        .then(function (names) {
          return Promise.all(
            names.filter(function (n) { return n.indexOf("rfa-") === 0; }).map(function (n) { return caches.delete(n); })
          );
        })
        .catch(function () {});
      return;
    }
    if (params.get("sw") !== "1") return;
  }

  var toast = null;
  var accepted = false;
  var reloaded = false;
  var registration = null;

  function showToast() {
    toast = toast || document.getElementById("swUpdateToast");
    if (toast) toast.classList.remove("hidden");
  }

  function hideToast() {
    if (toast) toast.classList.add("hidden");
  }

  function watch(reg) {
    if (reg.waiting && navigator.serviceWorker.controller) showToast();
    reg.addEventListener("updatefound", function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function () {
        // 沒有 controller ＝ 首次安裝，不提示
        if (worker.state === "installed" && navigator.serviceWorker.controller) showToast();
      });
    });
  }

  function wireButtons() {
    var now = document.getElementById("swUpdateNow");
    var later = document.getElementById("swUpdateLater");
    if (now) {
      now.addEventListener("click", function () {
        accepted = true;
        if (registration && registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      });
    }
    if (later) later.addEventListener("click", hideToast);
  }

  // clients.claim() 在首次安裝也會觸發 controllerchange，以 accepted 旗標避免誤重載
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (accepted && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });

  function start() {
    wireButtons();
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(function (reg) {
        registration = reg;
        watch(reg);
        var lastCheck = Date.now();
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible" && Date.now() - lastCheck >= 60 * 60 * 1000) {
            lastCheck = Date.now();
            reg.update().catch(function () {});
          }
        });
      })
      .catch(function () {
        // 註冊失敗（離線、隱私模式）靜默略過，頁面照常運作
      });
  }

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
