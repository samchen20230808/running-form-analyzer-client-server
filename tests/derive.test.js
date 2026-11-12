// deriveRequest 測試：R 組永遠執行；K 組需 .temp 樣本（REQUIRE_BASELINE=1 時缺樣本直接失敗）。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as core from "../lib/core/index.js";
import { deriveRequest, DERIVE_ERRORS } from "../lib/server/derive.js";
import { analyzeRequest } from "../lib/server/analyze.js";
import { BUILTIN_PROFILES } from "../lib/profiles/builtin.js";
import { BAKED_CYCLE_KEYFRAMES } from "../lib/profiles/baked-keyframes.js";

const plain = (v) => JSON.parse(JSON.stringify(v));
const DIR = new URL("../.temp/json/", import.meta.url);
const has = (f) => existsSync(new URL(f, DIR));
const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const REQUIRE = process.env.REQUIRE_BASELINE === "1";
const HAS_SAMPLES = has("running-form_captured-2026-10-29-walk.json");
const kIt = REQUIRE ? it : it.skipIf(!HAS_SAMPLES);

const SUMMARY = {
  trunkAngle: 9.8,
  comOffsetCm: 1.5,
  touchdownKnee: 170,
  minSwingKnee: 70,
  pushOffExtensionDeg: 16.4,
  avgElbow: 125,
  footStrikeAngle: 2,
  hipRomDeg: 62,
  strideMeters: 0.36,
  _measuredPixelStride: 0.36,
  measuredStrideMeters: 0.36,
  _autoDetectedStatic: true,
  phaseTiming: { touchPct: 0, posePct: 15, fallPct: 30, pullPct: 84 },
};
const req = (over = {}) => ({ summary: SUMMARY, cadence: 103, ...over });

describe("R1 驗證", () => {
  const bad = [
    null,
    [],
    "x",
    {},
    req({ summary: undefined }),
    req({ cadence: undefined }),
    ...[0, -1, 401, "180", NaN, null].map((cadence) => req({ cadence })),
    req({ heightCm: 49 }),
    req({ heightCm: 251 }),
    req({ cameraMode: "x" }),
    req({ includeKeyframes: "yes" }),
    req({ summary: { ...SUMMARY, trunkAngle: "9" } }),
    req({ summary: { ...SUMMARY, trunkAngle: 1001 } }),
    req({ summary: { ...SUMMARY, trunkAngle: Infinity } }),
    req({ summary: { ...SUMMARY, phaseTiming: { pullPct: 101 } } }),
    req({ summary: { ...SUMMARY, extra: 1 } }),
    req({ summary: { ...SUMMARY, phaseTiming: { x: 1 } } }),
    req({ frames: [] }),
    req({ profileName: "x" }),
    req({ foo: 1 }),
  ];
  it.each(bad.map((b, i) => [i, b]))("案例 %i → invalid_request", (_, body) => {
    const out = deriveRequest(body);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("invalid_request");
    expect(DERIVE_ERRORS).toContain(out.error);
    expect(out.details.length).toBeGreaterThan(0);
    expect(out.details.length).toBeLessThanOrEqual(20);
    for (const d of out.details) expect(d).toBeTypeOf("string");
  });
});

describe("R2–R5, R7", () => {
  it("預設值與 includeKeyframes", () => {
    const { result } = deriveRequest(req());
    expect(result.heightCm).toBe(172);
    expect(result.cameraMode).toBe("auto");
    expect("cycleKeyframes" in result).toBe(false);
    expect("cycleKeyframes" in deriveRequest(req({ includeKeyframes: false })).result).toBe(false);
    expect(deriveRequest(req({ includeKeyframes: true })).result.cycleKeyframes.frames).toHaveLength(101);
  });

  it("空 summary 與 null 欄位皆 ok，且等於核心直接呼叫", () => {
    for (const s of [{}, { trunkAngle: null, avgElbow: null, hipRomDeg: null, phaseTiming: null }]) {
      const out = deriveRequest(req({ summary: s }));
      expect(out.ok).toBe(true);
      expect(out.result.metrics.gct).toStrictEqual(plain(core.computeGctMetrics(s, 103)));
      expect(out.result.phaseTiming).toStrictEqual(plain(core.computePersonalizedPhaseTiming(s, 103)));
    }
  });

  it("不改寫輸入、可重現、無 timestamp、鍵固定且不含 summary", () => {
    const body = req({ includeKeyframes: true });
    const before = structuredClone(body);
    const a = deriveRequest(body);
    expect(body).toStrictEqual(before);
    expect(JSON.stringify(deriveRequest(body))).toBe(JSON.stringify(a));
    expect(Object.keys(a.result)).toEqual([
      "schemaVersion",
      "version",
      "source",
      "cadence",
      "heightCm",
      "cameraMode",
      "metrics",
      "phaseTiming",
      "stride",
      "autoStrideMeters",
      "cycleKeyframes",
    ]);
  });
});

describe("R6 分支覆蓋", () => {
  const HSU = { ...SUMMARY, trunkAngle: 8, comOffsetCm: 3, touchdownKnee: 150, avgElbow: 90 };
  it.each([
    [{ ...SUMMARY, avgElbow: 90 }, 120, "walking", 17, false],
    [{ ...SUMMARY, avgElbow: 125 }, 120, "walking", 17, true],
    [{ ...SUMMARY, avgElbow: 125 }, 134, "walking", 17, true],
    [{ ...SUMMARY, avgElbow: 125 }, 170, null, 15, false],
    [{ ...SUMMARY, avgElbow: 90 }, 200, null, 15, false],
    [HSU, 184, null, 15, false],
  ])("branch %#", (s, cadence, rating, keys, isWalking) => {
    const { result } = deriveRequest(req({ summary: s, cadence }));
    const g = result.metrics.gct;
    expect(Object.keys(g)).toHaveLength(keys);
    if (rating) expect(g.rating).toBe(rating);
    else expect(g.rating).not.toBe("walking");
    expect(result.metrics.isWalking).toBe(isWalking);
    expect(result.metrics.overallScore).toBe(core.calculateOverallRunningScore(plain(s), cadence));
    expect(g.gctMs).toBe(result.metrics.gctMs);
  });
  it("徐國峰分支 diffMs 為 0", () => {
    expect(deriveRequest(req({ summary: HSU, cadence: 184 })).result.metrics.gct.diffMs).toBe(0);
  });
});

describe("R8 內建 profile", () => {
  it("至少一個 profile，且每個都逐值等於核心", () => {
    expect(Object.keys(BUILTIN_PROFILES).length).toBeGreaterThan(0);
    for (const [key, p] of Object.entries(BUILTIN_PROFILES)) {
      const summary = plain(p.summary);
      const cadence = p.cadence;
      const out = deriveRequest({ summary, cadence, includeKeyframes: true });
      expect(out.ok, key).toBe(true);
      const r = out.result;
      expect(r.metrics.gct, key).toStrictEqual(plain(core.computeGctMetrics(summary, cadence)));
      expect(r.phaseTiming, key).toStrictEqual(plain(core.computePersonalizedPhaseTiming(summary, cadence)));
      const st = core.computeStrideForCameraMode(summary, "auto", 172, cadence);
      expect(r.stride, key).toStrictEqual(
        plain({
          strideMeters: st.strideMeters,
          measuredStrideMeters: st.measuredStrideMeters,
          pixelVal: st.pixelVal,
          strideModeText: st.strideModeText,
        }),
      );
      expect(r.autoStrideMeters, key).toBe(core.computeAutoStrideMeters(summary, 172, cadence));
      expect(JSON.stringify(r.cycleKeyframes), key).toBe(JSON.stringify(BAKED_CYCLE_KEYFRAMES[key]));
    }
  });
});

describe("K 基準逐值對照", () => {
  kIt("K1 walk 樣本三種機位", () => {
    const walk = load("running-form_captured-2026-10-29-walk.json");
    const base = { summary: walk.summary, cadence: walk.cadence };
    const a = deriveRequest(base).result;
    expect(a.metrics.gctMs).toBe(361);
    expect(a.metrics.overallScore).toBe(96);
    expect(a.metrics.gct.rating).toBe("walking");
    expect(Object.keys(a.metrics.gct)).toHaveLength(17);
    expect(a.phaseTiming).toStrictEqual({ touchPct: 0, posePct: 15, fallPct: 30, pullPct: 84 });
    expect(a.stride).toStrictEqual({
      strideMeters: 0.36,
      measuredStrideMeters: 0.36,
      pixelVal: 0.36,
      strideModeText: "📷 靜態機位像素測量",
    });
    expect(a.autoStrideMeters).toBe(0.78);
    expect(deriveRequest({ ...base, cameraMode: "static" }).result.stride).toMatchObject({
      strideMeters: 0.36,
      strideModeText: "📷 手動鎖定靜態機位",
    });
    expect(deriveRequest({ ...base, cameraMode: "tracking" }).result.stride).toStrictEqual({
      strideMeters: 0.78,
      measuredStrideMeters: null,
      pixelVal: 0.36,
      strideModeText: "🚶 手動鎖定跟拍(走路)",
    });
  });

  kIt("K2 關鍵幀樣本逐字相同", () => {
    for (const f of ["kf-walk-101.json", "kf-hsu-101.json"]) {
      const kf = load(f);
      const summary = { ...kf.summary, phaseTiming: kf.phaseTiming ?? kf.summary.phaseTiming };
      const out = deriveRequest({ summary, cadence: kf.cadence, includeKeyframes: true });
      expect(out.ok, f).toBe(true);
      expect(JSON.stringify(out.result.cycleKeyframes), f).toBe(JSON.stringify(kf.cycleKeyframes));
    }
  });

  kIt("K3／K4 三份樣本", () => {
    for (const name of ["woman03", "walkrun-a", "walkrun-b"]) {
      const client = load(`client-${name}.json`);
      const d = deriveRequest({ summary: client.summary, cadence: client.cadence }).result;
      expect(d.metrics.gctMs).toBe(client.metrics.gctMs);
      expect(d.metrics.flightMs).toBe(client.metrics.flightMs);
      expect(d.metrics.overallScore).toBe(client.metrics.overallScore);

      const a = analyzeRequest(load(`landmarks-${name}.json`)).result;
      const d2 = deriveRequest({
        summary: a.summary,
        cadence: a.cadence,
        heightCm: a.heightCm,
        cameraMode: a.cameraMode,
        includeKeyframes: true,
      }).result;
      expect(d2.metrics).toStrictEqual(a.metrics);
      expect(JSON.stringify(d2.cycleKeyframes)).toBe(JSON.stringify(a.cycleKeyframes));
      expect(d2.stride.strideMeters).toBe(a.summary.strideMeters);
    }
  });
});
