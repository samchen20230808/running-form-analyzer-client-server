// baseline：樣本格式檢查，加上 Feature 1.1 起對核心的逐值比對（walk summary、關鍵幀、landmarks）。
// 樣本放在 .temp/json/（已 gitignore，來源：舊專案 .temp/json/）。
// 路徑相對於本檔，與執行時的 cwd 無關。
// 設 REQUIRE_BASELINE=1 時，樣本缺少會直接失敗（Epic 1 起建議使用）。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCycleKeyframesFromSummary,
  calculateOverallRunningScore,
  computeGctMetrics,
  generatePoseMethodAlignedCycle,
  CYCLE_KEYFRAME_NUMERIC_FIELDS,
} from "../lib/core/index.js";
import { plain, runLandmarksPipeline } from "./helpers/landmarks-pipeline.js";

const DIR = new URL("../.temp/json/", import.meta.url);
const available = existsSync(DIR);
const required = process.env.REQUIRE_BASELINE === "1";

// 基準值（舊專案 V3.29 實測）
const BASELINE = {
  walkSummary: {
    file: "running-form_captured-2026-10-29-walk.json",
    cadence: 103,
    gctMs: 361,
    flightMs: 0,
    overallScore: 96,
  },
  keyframes: { "kf-walk-101.json": 103, "kf-hsu-101.json": 184 },
  landmarks: {
    "walkrun-a": 176,
    "walkrun-b": 150,
    woman03: 193,
  },
};

function load(name) {
  return JSON.parse(readFileSync(new URL(name, DIR), "utf8"));
}

if (!available) {
  console.warn(
    "[baseline] 找不到 .temp/json/，樣本格式測試已略過。請從舊專案複製樣本（見 context/features/0-2）；設 REQUIRE_BASELINE=1 可讓缺樣本直接失敗。",
  );
}

describe.runIf(required)("baseline 樣本必須存在（REQUIRE_BASELINE=1）", () => {
  it(".temp/json/ 存在", () => {
    expect(available).toBe(true);
  });
});

describe.skipIf(!available)("baseline 樣本格式", () => {
  it("walk summary 匯出檔含基準步頻", () => {
    const j = load(BASELINE.walkSummary.file);
    expect(j.cadence).toBe(BASELINE.walkSummary.cadence);
    expect(j.summary).toBeTypeOf("object");
  });

  for (const [name, cadence] of Object.entries(BASELINE.landmarks)) {
    it(`landmarks-${name}：請求格式正確，client 基準步頻 ${cadence}`, () => {
      const req = load(`landmarks-${name}.json`);
      expect(req.frameWidth).toBeGreaterThan(0);
      expect(req.frameHeight).toBeGreaterThan(0);
      expect(req.frames.length).toBeGreaterThan(0);
      expect(req.frames[0].lm).toHaveLength(33);

      const client = load(`client-${name}.json`);
      expect(client.cadence).toBe(cadence);
      expect(client.metrics).toBeTypeOf("object");
    });
  }

  for (const f of ["kf-walk-101.json", "kf-hsu-101.json"]) {
    it(`${f}：cycleKeyframes 含 101 幀`, () => {
      const kf = load(f);
      expect(kf.cycleKeyframes.frames).toHaveLength(101);
    });
  }
});

describe.skipIf(!available)("核心逐值比對", () => {
  it("walk summary 路徑：步頻 103／觸地 361ms／總分 96", () => {
    const w = load(BASELINE.walkSummary.file);
    const summary = { ...w.summary, phaseTiming: w.phaseTiming };
    const gct = computeGctMetrics(summary, w.cadence);
    expect(w.cadence).toBe(BASELINE.walkSummary.cadence);
    expect(gct.gctMs).toBe(BASELINE.walkSummary.gctMs);
    expect(gct.flightMs).toBe(BASELINE.walkSummary.flightMs);
    expect(calculateOverallRunningScore(summary, w.cadence)).toBe(
      BASELINE.walkSummary.overallScore,
    );
  });

  for (const [f, cadence] of Object.entries(BASELINE.keyframes)) {
    it(`${f}：關鍵幀 JSON 字串逐字相同`, () => {
      const kf = load(f);
      const summary = {
        ...kf.summary,
        ...(kf.phaseTiming ? { phaseTiming: kf.phaseTiming } : {}),
      };
      const built = plain(buildCycleKeyframesFromSummary(summary, kf.cadence, 100));
      expect(kf.cadence).toBe(cadence);
      expect(built.frames).toHaveLength(101);
      expect(JSON.stringify(built), f).toBe(JSON.stringify(kf.cycleKeyframes));
    });
  }

  for (const [name, cadence] of Object.entries(BASELINE.landmarks)) {
    it(`landmarks-${name}：步頻 ${cadence}，summary／metrics 與 client 完全相同`, () => {
      const out = runLandmarksPipeline(load(`landmarks-${name}.json`));
      const client = load(`client-${name}.json`);
      expect(out.cadence, name).toBe(cadence);
      expect(out.cadence, name).toBe(client.cadence);
      expect(out.summary, name).toStrictEqual(client.summary);
      expect(out.metrics, name).toStrictEqual({
        gctMs: client.metrics.gctMs,
        flightMs: client.metrics.flightMs,
        overallScore: client.metrics.overallScore,
      });

      const built = buildCycleKeyframesFromSummary(out.summary, out.cadence, 100);
      expect(built.frames).toHaveLength(101);
      for (const fr of built.frames) {
        const a = generatePoseMethodAlignedCycle(fr.p, client.summary, client.cadence);
        for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) {
          expect(Math.abs(fr[k] - a[k]), `${name} p=${fr.p} ${k}`).toBeLessThanOrEqual(1e-9);
        }
        expect(fr.rIsStance).toBe(a.rIsStance);
        expect(fr.lIsStance).toBe(a.lIsStance);
      }
    });
  }
});
