// baseline：樣本格式檢查，加上 Feature 1.1 起對核心的逐值比對（walk summary、關鍵幀、landmarks）。
// 樣本放在 .temp/json/（已 gitignore，來源：舊專案 .temp/json/）。
// 路徑相對於本檔，與執行時的 cwd 無關。
// 設 REQUIRE_BASELINE=1 時，樣本缺少會直接失敗（Epic 1 起建議使用）。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APP_CONFIG,
  buildCycleKeyframesFromSummary,
  calculateOverallRunningScore,
  computeGctMetrics,
  generatePoseMethodAlignedCycle,
  CYCLE_KEYFRAME_NUMERIC_FIELDS,
} from "../lib/core/index.js";
import { POST } from "../app/api/analyze/route.js";
import { analyzeRequest } from "../lib/server/analyze.js";
import { validateAnalysisJSON } from "../lib/contract/validate-analysis-json.js";

const plain = (v) => JSON.parse(JSON.stringify(v));

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
    "walkrun-a": { cadence: 176, gctMs: 192, flightMs: 149, overallScore: 90 },
    "walkrun-b": { cadence: 150, gctMs: 230, flightMs: 170, overallScore: 75 },
    woman03: { cadence: 193, gctMs: 193, flightMs: 118, overallScore: 66 },
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

  for (const [name, { cadence }] of Object.entries(BASELINE.landmarks)) {
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

  const TOP_KEYS = [
    "schemaVersion",
    "version",
    "source",
    "timestamp",
    "profileKey",
    "cameraMode",
    "heightCm",
    "cadence",
    "strideMeters",
    "isManualStride",
    "phaseTiming",
    "summary",
    "metrics",
    "cycleKeyframes",
  ];

  // 產生端義務（契約 §2.2、§2.3、§2.5）；舊核心若本來就不符，記錄、不修核心
  function expectProducerContract(r) {
    const s = r.summary;
    expect(r.cadence).toBeGreaterThanOrEqual(60);
    expect(r.cadence).toBeLessThanOrEqual(240);
    for (const k of ["touchdownKnee", "minSwingKnee", "avgElbow"]) {
      expect(s[k], k).toBeGreaterThanOrEqual(0);
      expect(s[k], k).toBeLessThanOrEqual(180);
    }
    expect(s.strideMeters).toBeGreaterThan(0);
    const pt = r.phaseTiming;
    expect(pt.touchPct).toBeLessThanOrEqual(pt.posePct);
    expect(pt.posePct).toBeLessThanOrEqual(pt.fallPct);
    expect(pt.fallPct).toBeLessThanOrEqual(pt.pullPct);
    const fr = r.cycleKeyframes.frames;
    for (let i = 1; i < fr.length; i++) expect(fr[i].p).toBeGreaterThan(fr[i - 1].p);
    expect(fr[0].p).toBe(0);
    expect(fr[fr.length - 1].p).toBe(1);
    for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) {
      expect(fr[fr.length - 1][k], k).toBe(fr[0][k]);
    }
  }

  for (const [name, expected] of Object.entries(BASELINE.landmarks)) {
    it(`landmarks-${name}：analyzeRequest 步頻 ${expected.cadence}，與 client 完全相同`, () => {
      const req = load(`landmarks-${name}.json`);
      const out = analyzeRequest(req);
      expect(out.ok, name).toBe(true);
      const { result } = out;
      const client = load(`client-${name}.json`);
      expect(result.cadence, name).toBe(expected.cadence);
      expect(result.cadence, name).toBe(client.cadence);
      expect(result.summary, name).toStrictEqual(client.summary);
      const { gct, ...rest } = result.metrics;
      expect(rest, name).toStrictEqual({
        gctMs: expected.gctMs,
        flightMs: expected.flightMs,
        isWalking: false,
        overallScore: expected.overallScore,
      });
      expect(Object.keys(result.metrics), name).toEqual(["gctMs", "flightMs", "isWalking", "overallScore", "gct"]);
      expect(gct, name).toStrictEqual(plain(computeGctMetrics(result.summary, result.cadence)));
      expect(gct.gctMs, name).toBe(result.metrics.gctMs);
      expect(gct.flightMs, name).toBe(result.metrics.flightMs);
      expect(result.metrics.gctMs, name).toBe(client.metrics.gctMs);
      expect(result.metrics.flightMs, name).toBe(client.metrics.flightMs);
      expect(result.metrics.overallScore, name).toBe(client.metrics.overallScore);

      expect(JSON.stringify(result.cycleKeyframes), name).toBe(
        JSON.stringify(plain(buildCycleKeyframesFromSummary(result.summary, result.cadence, 100))),
      );
      expect(result.cycleKeyframes.frames).toHaveLength(101);
      for (const fr of result.cycleKeyframes.frames) {
        const a = generatePoseMethodAlignedCycle(fr.p, client.summary, client.cadence);
        for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) {
          expect(Math.abs(fr[k] - a[k]), `${name} p=${fr.p} ${k}`).toBeLessThanOrEqual(1e-9);
        }
        expect(fr.rIsStance).toBe(a.rIsStance);
        expect(fr.lIsStance).toBe(a.lIsStance);
      }

      expect(Object.keys(result), name).toEqual(TOP_KEYS);
      expect(result.schemaVersion).toBe("1.1.0");
      expect(result.schemaVersion).toBe(APP_CONFIG.analysisSchemaVersion);
      expect(result.version).toBe(APP_CONFIG.version);
      expect(result.source).toBe("server");
      expect(result.profileKey).toBe("custom_captured");
      expect(result.cameraMode).toBe(req.cameraMode ?? APP_CONFIG.defaults.cameraMode);
      expect(result.heightCm).toBe(req.heightCm ?? APP_CONFIG.defaults.heightCm);
      expect(result.strideMeters).toBe(result.summary.strideMeters);
      expect(result.isManualStride).toBe(false);
      expect(result.phaseTiming).toStrictEqual(result.summary.phaseTiming);
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      expect(plain(result)).toStrictEqual(result);

      expect(validateAnalysisJSON(result)).toStrictEqual({
        ok: true,
        legacy: false,
        schemaVersion: "1.1.0",
        errors: [],
        warnings: [],
      });
      expectProducerContract(result);
    });
  }

  it("profileName 原樣帶回，其餘與無 profileName 的結果相同", () => {
    const req = load("landmarks-woman03.json");
    const a = analyzeRequest(req).result;
    const b = analyzeRequest({ ...req, profileName: "測試" }).result;
    expect(b.profileName).toBe("測試");
    const strip = ({ profileName: _p, timestamp: _t, ...rest }) => rest;
    expect(strip(b)).toStrictEqual(strip(a));
  });
});

describe.skipIf(!available)("POST /api/analyze 與 analyzeRequest 一致", () => {
  const noTs = (o) => {
    const c = structuredClone(o);
    delete c.timestamp;
    return c;
  };
  it.each(Object.keys(BASELINE.landmarks))("%s", async (name) => {
    const req = load(`landmarks-${name}.json`);
    const res = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = await res.json();
    const b = BASELINE.landmarks[name];
    expect(json.cadence).toBe(b.cadence);
    expect(json.metrics.gctMs).toBe(b.gctMs);
    expect(json.metrics.flightMs).toBe(b.flightMs);
    expect(json.metrics.overallScore).toBe(b.overallScore);
    expect(json.metrics.isWalking).toBe(false);
    const direct = plain(analyzeRequest(req).result);
    expect(noTs(json)).toStrictEqual(noTs(direct));
    expect(Object.keys(json)).toEqual(Object.keys(direct));
    expect(json.summary).toStrictEqual(load(`client-${name}.json`).summary);
    const v = validateAnalysisJSON(json);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });
});
