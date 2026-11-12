// 3.2 過渡期：原樣搬入的舊 Client 與暫時核心（temp-core）的隔離與防線。
// 斷言刻意粗糙（存在性、字串包含）。3.7 移除 temp-core 時，本檔須一併改寫。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
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

describe("temp-core 隔離與標示", () => {
  it("public/legacy/temp-core/ 恰好有四個核心檔，第一行以 // TEMP-CORE 開頭", () => {
    const files = readdirSync(new URL("public/legacy/temp-core/", ROOT)).sort();
    expect(files).toEqual([...CORE_FILES].sort());
    for (const f of files) {
      expect(read(`public/legacy/temp-core/${f}`).startsWith("// TEMP-CORE")).toBe(true);
    }
  });

  it("核心檔名不出現在 public/legacy/js/", () => {
    const files = readdirSync(new URL("public/legacy/js/", ROOT));
    for (const f of CORE_FILES) expect(files).not.toContain(f);
  });

  it("app/、lib/ 不引用 temp-core 或 public/legacy", () => {
    for (const p of [...listFiles("app/", ".js"), ...listFiles("lib/", ".js")]) {
      const src = read(p);
      expect(src, p).not.toContain("temp-core");
      expect(src, p).not.toContain("public/legacy");
    }
  });

  it("next.config.mjs 只在部署防線處提到 temp-core", () => {
    const hits = read("next.config.mjs")
      .split("\n")
      .filter((l) => l.includes("temp-core"));
    expect(hits.filter((l) => !l.trim().startsWith("//"))).toHaveLength(2);
  });

  it("index.html 以 temp-core/ 載入四個核心，不再引用舊路徑", () => {
    const html = read("public/legacy/index.html");
    for (const f of CORE_FILES) {
      expect(html).toContain(`src="temp-core/${f}"`);
      expect(html).not.toContain(`src="js/${f}"`);
    }
  });
});

describe("舊 Client 的一致性", () => {
  it("config.js 的 version 與 lib/config.js 的 APP_CONFIG.version 相同", () => {
    const m = read("public/legacy/js/config.js").match(/version:\s*"([^"]+)"/);
    expect(m?.[1]).toBe(APP_CONFIG.version);
  });

  it("不使用瀏覽器儲存與其他外送通道", () => {
    const files = [...listFiles("public/legacy/", ".js"), "public/legacy/index.html"];
    for (const p of files) {
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

  it("fetch 只有一處：public/legacy/js/analyzer.js 的相對路徑 /api/analyze", () => {
    const hits = [];
    for (const p of [...listFiles("public/legacy/", ".js"), "public/legacy/index.html"]) {
      const lines = read(p).split(/\r?\n/);
      lines.forEach((l, i) => {
        if (/\bfetch\s*\(/.test(l)) hits.push({ p, text: `${l} ${lines[i + 1] ?? ""}` });
      });
    }
    expect(hits).toHaveLength(1);
    expect(hits[0].p).toBe("public/legacy/js/analyzer.js");
    expect(hits[0].text).toContain('"/api/analyze"');
    expect(hits[0].text).not.toMatch(/https?:/);
  });

  it("上傳請求不含 profileName（含影片檔名），也不送 z", () => {
    const src = read("public/legacy/js/analyzer.js");
    const start = src.indexOf("async function requestServerAnalysis");
    const end = src.indexOf("function buildSafeSummaryFromJSON");
    const fn = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(fn).not.toContain("profileName");
    expect(src).toContain("lm.map((p) => [p.x, p.y, p.visibility ?? null])");
  });

  it("上傳上限不超過 Server 的 LIMITS", () => {
    const m = read("public/legacy/js/state.js").match(/MAX_UPLOAD_FRAMES\s*=\s*(\d+)/);
    const max = Number(m?.[1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(LIMITS.maxFrames);
    expect(max * 2400).toBeLessThan(LIMITS.maxBodyBytes);
  });

  it("customCycleFrames 死碼已刪除", () => {
    for (const p of listFiles("public/legacy/", ".js")) {
      expect(read(p), p).not.toContain("customCycleFrames");
    }
    expect(read("public/legacy/index.html")).not.toContain("customCycleFrames");
  });

  it("public/ 中核心特有字串只出現在 temp-core/", () => {
    const marker = "嚴重跨步煞車或身後推蹬";
    for (const p of listFiles("public/", ".js")) {
      if (p.startsWith("public/legacy/temp-core/")) continue;
      expect(read(p), p).not.toContain(marker);
    }
    expect(read("public/legacy/index.html")).not.toContain(marker);
  });
});

describe("3.4 橋接與切換", () => {
  const norm = (t) => t.replace(/\r\n/g, "\n");
  // 擷取頂層函式／常數：從宣告起，到下一個位於第 0 欄的 } 或 ];
  function extract(src, name) {
    const text = norm(src).replace(/^export /gm, "");
    const start = text.search(new RegExp(`^(function|const)\\s+${name}\\b`, "m"));
    if (start < 0) return null;
    const rest = text.slice(start);
    const firstLine = rest.split("\n")[0];
    if (firstLine.startsWith("const") && firstLine.endsWith(";")) return firstLine;
    const m = rest.match(/\n(\}|\];)\n/);
    return rest.slice(0, m.index + m[0].length);
  }
  const SOURCES = {
    CYCLE_KEYFRAME_NUMERIC_FIELDS: ["lib/player/keyframes.js", "keyframes.js"],
    CYCLE_KEYFRAME_MIN_FRAMES: ["lib/player/keyframes.js", "keyframes.js"],
    normalizeCycleKeyframes: ["lib/player/keyframes.js", "keyframes.js"],
    sampleCycleKeyframes: ["lib/player/keyframes.js", "keyframes.js"],
    evaluateProfileAngles: ["lib/core/keyframes.js", "keyframes.js"],
    extractAnglesFromLandmarks: ["lib/landmarks/landmark-extract.js", "landmark-extract.js"],
    evaluateCaptureFrame: ["lib/landmarks/landmark-extract.js", "landmark-extract.js"],
    parseManualStrideValue: ["lib/player/stride-input.js", "biomechanics.js"],
    solveKinematics: ["lib/player/kinematics.js", "biomechanics.js"],
  };

  it("C1 新模組的函式本體與 temp-core 相同", () => {
    for (const [name, [lib, tc]] of Object.entries(SOURCES)) {
      const a = extract(read(lib), name);
      const b = extract(read(`public/legacy/temp-core/${tc}`), name);
      expect(a, `${name} (lib)`).not.toBeNull();
      expect(a, name).toBe(b);
    }
  });

  it("C2 index.html 與 analyzer.js 同一行載入 bridge.js，且只有一次", () => {
    const html = read("public/legacy/index.html");
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
    ];
    const files = [...listFiles("public/legacy/js/", ".js"), "public/legacy/index.html"];
    for (const p of files) {
      const src = read(p);
      for (const n of names) {
        expect(src, `${p}: ${n}`).not.toMatch(new RegExp(`(?<![.\\w])${n}\\s*\\(`));
      }
    }
  });

  it("C4 modules/ 不含核心特有字串", () => {
    const markers = [
      "嚴重跨步煞車或身後推蹬",
      "generatePoseMethodAlignedCycle",
      "computeGctMetrics",
      "calculateOverallRunningScore",
    ];
    for (const p of listFiles("public/legacy/modules/", ".js")) {
      for (const m of markers) expect(read(p), `${p}: ${m}`).not.toContain(m);
    }
  });
});

describe("部署防線", () => {
  const saved = process.env.VERCEL;
  afterEach(() => {
    if (saved === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = saved;
  });

  it("VERCEL 存在且 temp-core 存在時載入 next.config.mjs 會拋錯", async () => {
    expect(existsSync(new URL("public/legacy/temp-core", ROOT))).toBe(true);
    process.env.VERCEL = "1";
    await expect(import("../next.config.mjs?guard-on")).rejects.toThrow(/temp-core/);
  });

  it("未設定 VERCEL 時正常載入，並把 / 導向 /legacy/index.html", async () => {
    delete process.env.VERCEL;
    const mod = await import("../next.config.mjs?guard-off");
    expect(await mod.default.redirects()).toEqual([
      { source: "/", destination: "/legacy/index.html", permanent: false },
    ]);
  });
});
