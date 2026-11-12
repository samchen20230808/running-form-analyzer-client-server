// 舊 Client（public/）的靜態檢查。斷言刻意粗糙（存在性、字串包含）。
// 3.7：temp-core 與部署防線已移除；衍生值改讀 /api/derive，瀏覽器不含任何核心公式。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../lib/config.js";
import { LIMITS } from "../lib/server/validate-request.js";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const CORE_FILES = ["biomechanics.js", "keyframes.js", "landmark-extract.js", "cycle-analysis.js"];

function listFiles(dir, ext) {
  const out = [];
  for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...listFiles(`${p}/`, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const clientFiles = () => [...listFiles("public/js/", ".js"), "public/index.html"];
const importFn = () => {
  const an = read("public/js/analyzer.js");
  return an.slice(an.indexOf("function importAnalysisJSON"), an.indexOf("function exportAnalysisJSON"));
};

describe("M 3.7 temp-core 已移除", () => {
  it("M1 public/legacy/ 不存在；index.html 不含 temp-core、legacy/", () => {
    expect(existsSync(new URL("public/legacy", ROOT))).toBe(false);
    const html = read("public/index.html");
    expect(html).not.toContain("temp-core");
    expect(html).not.toContain("legacy/");
  });

  it("核心檔名不出現在 public/js/", () => {
    const files = readdirSync(new URL("public/js/", ROOT));
    for (const f of CORE_FILES) expect(files).not.toContain(f);
  });

  it("app/、lib/ 不引用 temp-core 或 public/legacy", () => {
    for (const p of [...listFiles("app/", ".js"), ...listFiles("lib/", ".js")]) {
      const src = read(p);
      expect(src, p).not.toContain("temp-core");
      expect(src, p).not.toContain("public/legacy");
    }
  });

  it("M2 next.config.mjs 不含部署防線", () => {
    const src = read("next.config.mjs");
    for (const w of ["VERCEL", "existsSync", "temp-core"]) expect(src).not.toContain(w);
  });

  it("M3 eslint.config.mjs 不含 public/legacy", () => {
    expect(read("eslint.config.mjs")).not.toContain("public/legacy");
  });

  it("M4 public/**（含 modules/）不含核心特有字串或核心函式名", () => {
    const markers = [
      "嚴重跨步煞車或身後推蹬",
      "🚶 行走步態 (雙腳交替支撐 • 零騰空)",
      "overstrideDelay",
      "lazyPullDelay",
      "computeCycleSummaryStats",
      "detectCadenceFromFrames",
      "generatePoseMethodAlignedCycle",
      "computeGctMetrics",
      "calculateOverallRunningScore",
      "computePersonalizedPhaseTiming",
    ];
    for (const p of [...listFiles("public/", ".js"), "public/index.html"]) {
      for (const m of markers) expect(read(p), `${p}: ${m}`).not.toContain(m);
    }
  });
});

describe("舊 Client 的一致性", () => {
  it("config.js 的 version 與 lib/config.js 的 APP_CONFIG.version 相同", () => {
    const m = read("public/js/config.js").match(/version:\s*"([^"]+)"/);
    expect(m?.[1]).toBe(APP_CONFIG.version);
  });

  it("不使用瀏覽器儲存與其他外送通道", () => {
    for (const p of [...listFiles("public/", ".js"), "public/index.html"]) {
      const src = read(p);
      for (const banned of [
        /localStorage/,
        /sessionStorage/,
        /indexedDB/,
        /document\.cookie/,
        /XMLHttpRequest/,
        /sendBeacon/,
        /WebSocket/,
        /EventSource/,
      ]) {
        expect(src, `${p} 含 ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("U2 fetch 恰好兩處：analyzer.js 的 /api/analyze、derive.js 的 /api/derive（相對路徑）", () => {
    const hits = [];
    for (const p of [...listFiles("public/", ".js"), "public/index.html"]) {
      const lines = read(p).split(/\r?\n/);
      lines.forEach((l, i) => {
        if (/\bfetch\s*\(/.test(l)) hits.push({ p, text: `${l} ${lines[i + 1] ?? ""}` });
      });
    }
    expect(hits.map((h) => h.p).sort()).toEqual(["public/js/analyzer.js", "public/js/derive.js"]);
    for (const h of hits) expect(h.text).not.toMatch(/https?:/);
    expect(hits.find((h) => h.p.endsWith("analyzer.js")).text).toContain('"/api/analyze"');
    expect(hits.find((h) => h.p.endsWith("derive.js")).text).toContain('"/api/derive"');
  });

  it("上傳請求不含 profileName（含影片檔名），也不送 z", () => {
    const src = read("public/js/analyzer.js");
    const start = src.indexOf("async function requestServerAnalysis");
    const end = src.indexOf("// 純函式：驗證分析結果 JSON 契約");
    const fn = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(fn).not.toContain("profileName");
    expect(src).toContain("lm.map((p) => [p.x, p.y, p.visibility ?? null])");
  });

  it("上傳上限不超過 Server 的 LIMITS", () => {
    const m = read("public/js/state.js").match(/MAX_UPLOAD_FRAMES\s*=\s*(\d+)/);
    const max = Number(m?.[1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(LIMITS.maxFrames);
    expect(max * 2400).toBeLessThan(LIMITS.maxBodyBytes);
  });

  it("customCycleFrames 死碼已刪除", () => {
    for (const p of listFiles("public/", ".js")) {
      expect(read(p), p).not.toContain("customCycleFrames");
    }
    expect(read("public/index.html")).not.toContain("customCycleFrames");
  });
});

describe("3.4 橋接與切換", () => {
  it("C2 index.html 與 analyzer.js 同一行載入 bridge.js，且只有一次", () => {
    const html = read("public/index.html");
    const tag = '<script type="module" src="modules/bridge.js"></script>';
    expect(html.split(tag)).toHaveLength(2);
    const line = html.split(/\r?\n/).find((l) => l.includes(tag));
    expect(line).toContain('src="js/analyzer.js"');
  });

  it("C3 UI 只能以 RFA. 前綴呼叫已搬出的函式", () => {
    const names = [
      "solveKinematics",
      "extractAnglesFromLandmarks",
      "evaluateCaptureFrame",
      "normalizeCycleKeyframes",
      "parseManualStrideValue",
      "evaluateProfileAngles",
    ];
    for (const p of clientFiles()) {
      const src = read(p);
      for (const n of names) {
        expect(src, `${p}: ${n}`).not.toMatch(new RegExp(`(?<![.\\w])${n}\\s*\\(`));
      }
    }
  });
});

describe("U 3.7 衍生值改讀 /api/derive", () => {
  it("U1 UI 不再呼叫任何核心函式", () => {
    const names = [
      "computeGctMetrics",
      "computeAutoStrideMeters",
      "computeStrideForCameraMode",
      "calculateOverallRunningScore",
      "computePersonalizedPhaseTiming",
      "generatePoseMethodAlignedCycle",
      "buildCycleKeyframesFromSummary",
      "analyzeCapturedFrames",
      "detectCadenceFromFrames",
      "computeCycleSummaryStats",
      "computeMeasuredPixelStride",
      "evaluateProfileCycle",
      "getActiveRunnerTiming",
      "recalculateStrideForCameraMode",
    ];
    for (const p of clientFiles()) {
      const src = read(p);
      for (const n of names) {
        expect(src, `${p}: ${n}`).not.toMatch(new RegExp(`(?<![.\\w])${n}\\s*\\(`));
      }
    }
  });

  it("U3 derive.js 以 RFA.client.buildDeriveBody 組 body，不含 profileName／frames", () => {
    const src = read("public/js/derive.js");
    expect(src).toContain("RFA.client.buildDeriveBody");
    expect(src).not.toContain("profileName");
    expect(src).not.toContain("frames");
    expect(importFn()).toContain("RFA.client.buildDeriveBody");
    expect(importFn()).not.toContain("profileName");
  });

  it("U4 phaseTiming 只在匯入時寫回 summary", () => {
    expect(read("public/js/derive.js")).not.toMatch(/\.phaseTiming\b/);
    const hits = clientFiles().filter((p) => /\.phaseTiming\s*=[^=]/.test(read(p)));
    expect(hits).toEqual(["public/js/analyzer.js"]);
    expect(importFn()).toContain("safeSummary.phaseTiming = r.data.phaseTiming");
  });

  it("U5 手動步頻 debounce", () => {
    const m = read("public/js/derive.js").match(/DERIVE_DEBOUNCE_MS\s*=\s*(\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(250);
    const html = read("public/index.html");
    const fn = html.slice(html.indexOf("function onManualCadenceInput"));
    expect(fn.slice(0, 400)).toContain("scheduleDerive({ delayMs: DERIVE_DEBOUNCE_MS })");
  });

  it("U6 config.js 的 analysisSchemaVersion 等於 lib/config.js（1.1.0）", () => {
    const m = read("public/js/config.js").match(/analysisSchemaVersion:\s*"([^"]+)"/);
    expect(m?.[1]).toBe(APP_CONFIG.analysisSchemaVersion);
    expect(m?.[1]).toBe("1.1.0");
  });

  it("U7 exportAnalysisJSON 帶 metrics 且以 isDerivedCurrent 把關", () => {
    const an = read("public/js/analyzer.js");
    const fn = an.slice(an.indexOf("function exportAnalysisJSON"));
    expect(fn).toContain("if (isDerivedCurrent(profile)) payload.metrics = profile.derived.result.metrics");
  });

  it("U8 updatePhaseTimingUI 無備援；renderer 的 GCT 經 getActiveDerived 且有 null 防護", () => {
    const h = read("public/index.html");
    const fn = h.slice(h.indexOf("function updatePhaseTimingUI"), h.indexOf("function updateTelemetryAndDiagnostics"));
    expect(fn).not.toContain("computeGctMetrics");
    expect(fn).toContain("if (!gct) return");
    const r = read("public/js/renderer.js");
    expect(r.split("getActiveDerived()?.metrics.gct ?? null").length - 1).toBe(2);
    expect(r).toContain("if (!gct) return");
    expect(r).toContain("if (gct) {");
  });

  it("U9 index.html 載入 derive.js 恰好一次，位於 analyzer.js 那一行之前", () => {
    const h = read("public/index.html");
    expect(h.split('<script src="js/derive.js"></script>')).toHaveLength(2);
    expect(h.indexOf('src="js/derive.js"')).toBeLessThan(h.indexOf('src="js/analyzer.js"'));
  });
});

describe("F 3.5 移除的本地解算", () => {
  it("F2 config.js 不含 profile 靜態資料", () => {
    const src = read("public/js/config.js");
    expect(src).not.toContain("touchdownKnee");
    expect(src).not.toContain("phaseTiming");
  });

  it("F3 DOMContentLoaded 先 initRunnerProfiles() 再排程 derive 與更新遙測", () => {
    const html = read("public/index.html");
    const body = html.slice(html.indexOf('addEventListener("DOMContentLoaded"'));
    const init = body.indexOf("initRunnerProfiles()");
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(body.indexOf("scheduleDerive()"));
    expect(init).toBeLessThan(body.indexOf("updateTelemetryAndDiagnostics()"));
  });

  it("F4 getActiveProfileTiming 唯讀，不重算 phaseTiming", () => {
    const src = read("public/js/state.js");
    const fn = src.slice(src.indexOf("function getActiveProfileTiming"));
    expect(fn).not.toContain("computePersonalizedPhaseTiming");
    expect(read("public/index.html")).not.toMatch(/\.phaseTiming\s*=\s*computePersonalizedPhaseTiming/);
  });
});

describe("F5 renderer 軌跡取樣依賴關鍵幀", () => {
  it("軌跡與相位標記以 hasKeyframes 把關（即時同步時 evalCycle 仍可能回傳 null）", () => {
    const src = read("public/js/renderer.js");
    expect(src).toContain("const hasKeyframes = Boolean(activeProfile.cycleKeyframes)");
    expect(src).toContain("hasKeyframes && i <= steps");
    expect(src).toContain("hasKeyframes && i < steps");
    expect(src).toContain("(hasKeyframes ? phaseMarkers : [])");
  });
});

describe("E 3.9 頁面位置", () => {
  it("E1 public/legacy 不存在，頁面與資源在 public/ 根目錄", () => {
    expect(existsSync(new URL("public/legacy", ROOT))).toBe(false);
    for (const p of ["index.html", "js", "styles/main.css", "modules/bridge.js"]) {
      expect(existsSync(new URL(`public/${p}`, ROOT)), p).toBe(true);
    }
  });

  it("E3 轉址設定不含 /legacy", () => {
    expect(read("next.config.mjs").match(/source:\s*"\/legacy/g)).toBeNull();
    expect(read("next.config.mjs")).not.toContain('destination: "/legacy');
  });

  it("VERCEL 環境可載入 next.config.mjs，並把 / 導向 /index.html", async () => {
    const saved = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const mod = await import("../next.config.mjs?vercel-on");
      expect(await mod.default.redirects()).toEqual([
        { source: "/", destination: "/index.html", permanent: false },
      ]);
    } finally {
      if (saved === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved;
    }
  });
});

describe("R 3.8 報告匯出", () => {
  const report = () => read("public/js/report.js");

  it("R1 report.js 在 analyzer 之後載入一次，按鈕已啟用", () => {
    const html = read("public/index.html");
    expect(html.match(/src="js\/report\.js"/g)).toHaveLength(1);
    expect(html.indexOf("js/report.js")).toBeGreaterThan(html.indexOf("js/analyzer.js"));
    expect(html).not.toContain("報告匯出於 3.4 提供");
    expect(html).not.toContain("report.js：3.4 搬入");
    expect(html).toContain('onclick="openReport()"');
  });

  it("R2 只讀衍生結果：不發請求、不寫快取與相位", () => {
    const src = report();
    for (const w of ["getActiveDerived()", "getActiveProfileTiming()", "isDerivedCurrent", "deriveStatus"]) {
      expect(src).toContain(w);
    }
    for (const w of ["fetch", "scheduleDerive", "postDerive", "computeGctMetrics", "computePersonalizedPhaseTiming"]) {
      expect(src, w).not.toContain(w);
    }
    expect(src).not.toMatch(/\.(derived|phaseTiming)\s*=[^=]/);
  });

  it("R3 報告讀取的 DOM id 皆存在於 index.html", () => {
    const html = read("public/index.html");
    const ids = ["topCadenceInput", "bannerStrideInput", "topPaceVal", "topSpeedVal", "overallScoreNum", "overallGradeBadge", "overallScoreSummary", "diagnosticCardsContainer", "gctRangeBadge", "gctDetailText", "gctCompareBadge", "gctStatusText"];
    for (const id of ids) {
      expect(report(), id).toContain(id);
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("R4 main.css 含列印樣式", () => {
    const css = read("public/styles/main.css");
    for (const w of ["@media print", "@page { size: A4 portrait", "print-color-adjust: exact", "body.report-open > *:not(#reportOverlay)"]) {
      expect(css, w).toContain(w);
    }
  });

  it("R5 report.js 不含 console.error", () => {
    expect(report()).not.toContain("console.error");
  });
});

describe("匯出 JSON 檔名（buildExportFileName）", () => {
  // 從 analyzer.js 原始碼取出純函式本體，不載入整支 script
  const src = read("public/js/analyzer.js");
  const start = src.indexOf("function buildExportFileName");
  const body = src.slice(start, src.indexOf("\nfunction exportAnalysisJSON"));
  const build = new Function(`${body}\nreturn buildExportFileName;`)();
  const day = new Date(2026, 0, 5, 23, 59); // 本機時區 2026-01-05

  it("X1 影片擷取：影片名去掉前綴與副檔名，加本機日期", () => {
    expect(build({ name: "🎥 影片: woman03 - Trim.mp4" }, "custom_captured", day)).toBe("woman03 - Trim-2026-01-05.json");
  });
  it("X2 內建 profile：用 profileKey", () => {
    expect(build({ name: "★ 徐國峰教練 (關鍵跑姿黃金標準)" }, "hsu_pose_method", day)).toBe("hsu_pose_method-2026-01-05.json");
  });
  it("X3 匯入檔：去掉副檔名與既有日期尾巴，不重複日期", () => {
    expect(build({ name: "📄 woman03-2026-01-01.json" }, "json_1", day)).toBe("woman03-2026-01-05.json");
  });
  it("X4 檔名非法字元換成底線；名稱為空退回 profileKey", () => {
    expect(build({ name: '🎥 影片: a/b:c*d.mp4' }, "custom_captured", day)).toBe("a_b_c_d-2026-01-05.json");
    expect(build({ name: "" }, "custom_captured", day)).toBe("custom_captured-2026-01-05.json");
  });
  it("X5 exportAnalysisJSON 使用該函式", () => {
    expect(src).toContain("a.download = buildExportFileName(profile, activeProfileKey, new Date());");
  });
});
