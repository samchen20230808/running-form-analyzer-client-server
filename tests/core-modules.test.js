// 核心模組結構檢查：不需要樣本，永遠執行。
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as core from "../lib/core/index.js";
import { computeGctMetrics } from "../lib/core/biomechanics.js";

const CORE_DIR = new URL("../lib/core/", import.meta.url);
const LIB_DIR = new URL("../lib/", import.meta.url);
const SERVER_DIR = new URL("../lib/server/", import.meta.url);
const CONTRACT_DIR = new URL("../lib/contract/", import.meta.url);
const serverFiles = readdirSync(SERVER_DIR).filter((f) => f.endsWith(".js"));
const contractFiles = readdirSync(CONTRACT_DIR).filter((f) => f.endsWith(".js"));
const stripComments = (src) =>
  src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const coreFiles = readdirSync(CORE_DIR).filter((f) => f.endsWith(".js"));

describe("lib/core 對外入口", () => {
  it("恰好匯出 9 個名稱", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        "APP_CONFIG",
        "CYCLE_KEYFRAME_NUMERIC_FIELDS",
        "analyzeCapturedFrames",
        "buildCycleKeyframesFromSummary",
        "calculateOverallRunningScore",
        "computeGctMetrics",
        "evaluateCaptureFrame",
        "extractAnglesFromLandmarks",
        "generatePoseMethodAlignedCycle",
      ].sort(),
    );
  });

  it("型別正確，關鍵幀欄位為 12 個", () => {
    for (const [name, v] of Object.entries(core)) {
      if (name === "APP_CONFIG") expect(v).toBeTypeOf("object");
      else if (name === "CYCLE_KEYFRAME_NUMERIC_FIELDS")
        expect(v).toEqual([
          "trunk",
          "rThigh",
          "rKnee",
          "rAnkle",
          "lThigh",
          "lKnee",
          "lAnkle",
          "rShoulder",
          "rElbow",
          "lShoulder",
          "lElbow",
          "comOffset",
        ]);
      else expect(v, name).toBeTypeOf("function");
    }
  });

  it("冒煙值：computeGctMetrics({}, 103)", () => {
    const m = computeGctMetrics({}, 103);
    expect(m.gctMs).toBe(361);
    expect(m.flightMs).toBe(0);
    expect(m.rating).toBe("walking");
  });
});

describe("server-only 與環境隔離", () => {
  it.each(coreFiles)('%s 第一個 statement 是 import "server-only"', (f) => {
    const src = readFileSync(new URL(f, CORE_DIR), "utf8");
    expect(src.startsWith('import "server-only";')).toBe(true);
  });

  it.each(serverFiles)('lib/server/%s 第一個 statement 是 import "server-only"', (f) => {
    const src = readFileSync(new URL(f, SERVER_DIR), "utf8");
    expect(src.startsWith('import "server-only";')).toBe(true);
  });

  it("lib/server、lib/contract 不出現 document／window 識別字", () => {
    for (const [dir, files] of [
      [SERVER_DIR, serverFiles],
      [CONTRACT_DIR, contractFiles],
    ]) {
      for (const f of files) {
        const code = stripComments(readFileSync(new URL(f, dir), "utf8"));
        expect(code, f).not.toMatch(/\b(document|window)\b/);
      }
    }
  });

  it("lib/server 只經由 ../core/index.js 使用核心", () => {
    for (const f of serverFiles) {
      const src = readFileSync(new URL(f, SERVER_DIR), "utf8");
      // 涵蓋 from "…"、side-effect import "…" 與動態 import("…")
      for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*)["'](\.\.\/core\/[^"']*)["']/g)) {
        expect(m[1], f).toBe("../core/index.js");
      }
    }
  });

  it("lib/contract 非 server-only，且只 import ../config.js", () => {
    for (const f of contractFiles) {
      const src = readFileSync(new URL(f, CONTRACT_DIR), "utf8");
      expect(stripComments(src), f).not.toMatch(/server-only/);
      const imports = [...src.matchAll(/(?:from\s+|import\s*\(?\s*)["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      expect(imports, f).toEqual(["../config.js"]);
    }
  });

  it("lib/ 不使用 node:vm", () => {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)],
      );
    for (const url of walk(LIB_DIR).filter((u) => u.pathname.endsWith(".js"))) {
      const src = readFileSync(url, "utf8");
      expect(src, url.pathname).not.toMatch(/node:vm|from\s+["']vm["']/);
    }
  });

  it("lib/core 不出現 document／window 識別字", () => {
    for (const f of coreFiles) {
      const code = readFileSync(new URL(f, CORE_DIR), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(code, f).not.toMatch(/\b(document|window)\b/);
    }
  });
});
