// 3.2 過渡期：原樣搬入的舊 Client 與暫時核心（temp-core）的隔離與防線。
// 斷言刻意粗糙（存在性、字串包含）。3.3 移除 temp-core 時，本檔須一併改寫。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { APP_CONFIG } from "../lib/config.js";

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

  it("不使用瀏覽器儲存、不呼叫 API（3.3 接 API 時須改這條）", () => {
    const files = [...listFiles("public/legacy/", ".js"), "public/legacy/index.html"];
    for (const p of files) {
      const src = read(p);
      for (const banned of [
        /localStorage/,
        /sessionStorage/,
        /indexedDB/,
        /document\.cookie/,
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /sendBeacon/,
        /WebSocket/,
        /EventSource/,
      ]) {
        expect(src, `${p} 含 ${banned}`).not.toMatch(banned);
      }
    }
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
