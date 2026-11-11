// 核心模組結構檢查：不需要樣本，永遠執行。
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as core from "../lib/core/index.js";
import { computeGctMetrics } from "../lib/core/biomechanics.js";

const CORE_DIR = new URL("../lib/core/", import.meta.url);
const LIB_DIR = new URL("../lib/", import.meta.url);
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
