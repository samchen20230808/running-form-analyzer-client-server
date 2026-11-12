// 3.7：lib/client/（瀏覽器共用的 derive 請求組裝與匯入補值）。L 組永遠執行；K 組需 .temp 樣本。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as core from "../lib/core/index.js";
import {
  DERIVE_INPUT_LIMITS,
  DERIVE_SUMMARY_KEYS,
  PHASE_KEYS,
  buildDeriveBody,
  buildImportSummary,
  checkImportInputs,
  deriveKey,
} from "../lib/client/index.js";
import { deriveRequest } from "../lib/server/derive.js";
import {
  DERIVE_LIMITS,
  PHASE_KEYS as SERVER_PHASE_KEYS,
  SUMMARY_KEYS,
  TOP_KEYS,
  validateDeriveRequest,
} from "../lib/server/validate-derive-request.js";
import { BUILTIN_PROFILES } from "../lib/profiles/builtin.js";

const DIR = new URL("../.temp/json/", import.meta.url);
const has = (f) => existsSync(new URL(f, DIR));
const load = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const REQUIRE = process.env.REQUIRE_BASELINE === "1";
const kIt = REQUIRE ? it : it.skipIf(!has("kf-walk-101.json"));

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

describe("L1 常數與 Server 一致", () => {
  it("欄位清單、上限相同", () => {
    expect(DERIVE_SUMMARY_KEYS).toEqual(SUMMARY_KEYS);
    expect(PHASE_KEYS).toEqual(SERVER_PHASE_KEYS);
    expect(DERIVE_INPUT_LIMITS.maxCadence).toBe(DERIVE_LIMITS.maxCadence);
    expect(DERIVE_INPUT_LIMITS.maxSummaryAbs).toBe(DERIVE_LIMITS.maxSummaryAbs);
    expect(DERIVE_INPUT_LIMITS.heightCm).toEqual(DERIVE_LIMITS.heightCm);
  });

  it("buildDeriveBody 輸出的頂層鍵 ⊆ TOP_KEYS", () => {
    const b = buildDeriveBody(SUMMARY, { cadence: 103, heightCm: 172, cameraMode: "auto", includeKeyframes: true });
    for (const k of Object.keys(b)) expect(TOP_KEYS).toContain(k);
  });
});

describe("L2 buildDeriveBody", () => {
  it("白名單、非有限數字轉 null、不改寫輸入", () => {
    const input = {
      ...SUMMARY,
      comOffsetCm: NaN,
      trunkAngle: Infinity,
      hipRomDeg: -Infinity,
      avgElbow: undefined,
      extra: 1,
      profileName: "x",
      frames: [],
      phaseTiming: { touchPct: 0, posePct: 101, fallPct: "15", pullPct: NaN, junk: 1 },
    };
    const snapshot = structuredClone(input);
    const body = buildDeriveBody(input, { cadence: 150 });
    expect(input).toEqual(snapshot);
    expect(body.summary.comOffsetCm).toBeNull();
    expect(body.summary.trunkAngle).toBeNull();
    expect(body.summary.hipRomDeg).toBeNull();
    expect("avgElbow" in body.summary).toBe(false);
    expect("extra" in body.summary).toBe(false);
    expect(body.summary.phaseTiming).toEqual({ touchPct: 0, posePct: null, fallPct: null, pullPct: null });
    expect(JSON.stringify(body)).not.toMatch(/profileName|frames|profileKey|"name"/);
  });

  it("phaseTiming 非物件不送；includeKeyframes 只在 true 時出現", () => {
    expect("phaseTiming" in buildDeriveBody({ ...SUMMARY, phaseTiming: "x" }, { cadence: 1 }).summary).toBe(false);
    expect("includeKeyframes" in buildDeriveBody(SUMMARY, { cadence: 1 })).toBe(false);
    expect(buildDeriveBody(SUMMARY, { cadence: 1, includeKeyframes: true }).includeKeyframes).toBe(true);
  });
});

describe("L3／L4 與 Server 驗證、本地核心", () => {
  const nanSummary = { ...SUMMARY, comOffsetCm: NaN, trunkAngle: NaN };
  const cases = [
    ...Object.values(BUILTIN_PROFILES).map((p) => [p.name, p.summary, p.cadence]),
    ["含 NaN", nanSummary, 120],
    ["空 summary 匯入", buildImportSummary({ summary: {} }), 180],
  ];
  it.each(cases)("L3 %s 經 buildDeriveBody 後 validateDeriveRequest ok", (_, s, cadence) => {
    expect(validateDeriveRequest(buildDeriveBody(s, { cadence, heightCm: 172, cameraMode: "auto" })).ok).toBe(true);
  });

  it("L4 derive 結果等於本地核心（不含 NaN 的輸入）", () => {
    for (const p of Object.values(BUILTIN_PROFILES)) {
      for (const cameraMode of ["auto", "static", "tracking"]) {
        for (const heightCm of [160, 172, 190]) {
          for (const cadence of [120, 150, 184]) {
            const body = buildDeriveBody(p.summary, { cadence, heightCm, cameraMode });
            const out = deriveRequest(body);
            expect(out.ok).toBe(true);
            const s = structuredClone(p.summary);
            const r = out.result;
            const plain = (v) => JSON.parse(JSON.stringify(v));
            expect(r.metrics.gct).toEqual(plain(core.computeGctMetrics(s, cadence)));
            expect(r.metrics.overallScore).toBe(core.calculateOverallRunningScore(s, cadence));
            expect(r.stride.strideMeters).toBe(core.computeStrideForCameraMode(s, cameraMode, heightCm, cadence).strideMeters);
            expect(r.autoStrideMeters).toBe(core.computeAutoStrideMeters(s, heightCm, cadence));
          }
        }
      }
    }
  });

  it("L5 NaN 差異：本地核心產生 NaN，derive 走預設值", () => {
    const s = { ...SUMMARY, comOffsetCm: NaN };
    const local = core.computeGctMetrics(s, 150);
    const viaDerive = deriveRequest(buildDeriveBody(s, { cadence: 150 })).result.metrics.gct;
    const asNull = core.computeGctMetrics({ ...SUMMARY, comOffsetCm: null }, 150);
    expect(Number.isNaN(local.gctMs)).toBe(true);
    expect(viaDerive.gctMs).toBe(asNull.gctMs);
    expect(Number.isFinite(viaDerive.gctMs)).toBe(true);
  });
});

describe("L6 buildImportSummary", () => {
  it("空 summary 套用預設值，不含 phaseTiming", () => {
    expect(buildImportSummary({ summary: {} })).toEqual({
      trunkAngle: 7.4,
      comOffsetCm: 3.0,
      touchdownKnee: 155,
      minSwingKnee: 74,
      pushOffExtensionDeg: 14.5,
      avgElbow: 84,
      footStrikeAngle: 2,
      hipRomDeg: 38,
      strideMeters: 0.95,
      _measuredPixelStride: null,
      _autoDetectedStatic: false,
      measuredStrideMeters: null,
    });
  });

  it("phaseTiming top-level 優先；strideMeters 優先取 top-level；壞值保留 NaN", () => {
    const s = buildImportSummary({
      strideMeters: 1.1,
      phaseTiming: { posePct: 20 },
      summary: { strideMeters: 0.5, phaseTiming: { posePct: 10 }, trunkAngle: "abc" },
    });
    expect(s.phaseTiming).toEqual({ posePct: 20 });
    expect(s.strideMeters).toBe(1.1);
    expect(Number.isNaN(s.trunkAngle)).toBe(true);
  });
});

describe("L7 checkImportInputs", () => {
  it("cadence 與數值範圍", () => {
    for (const c of [0, -1, 401, NaN]) expect(checkImportInputs(SUMMARY, c).length, String(c)).toBeGreaterThan(0);
    expect(checkImportInputs({ ...SUMMARY, trunkAngle: 1001 }, 150)).toHaveLength(1);
    expect(checkImportInputs({ ...SUMMARY, trunkAngle: -1001 }, 150)).toHaveLength(1);
    expect(checkImportInputs(SUMMARY, 150)).toEqual([]);
  });
});

describe("L8 deriveKey", () => {
  it("同 body 相同、任一輸入改變就不同", () => {
    const o = { cadence: 150, heightCm: 172, cameraMode: "auto" };
    const k = deriveKey(buildDeriveBody(SUMMARY, o));
    expect(deriveKey(buildDeriveBody(SUMMARY, o))).toBe(k);
    expect(deriveKey(buildDeriveBody(SUMMARY, { ...o, cadence: 151 }))).not.toBe(k);
    expect(deriveKey(buildDeriveBody(SUMMARY, { ...o, heightCm: 173 }))).not.toBe(k);
    expect(deriveKey(buildDeriveBody(SUMMARY, { ...o, cameraMode: "static" }))).not.toBe(k);
    expect(deriveKey(buildDeriveBody({ ...SUMMARY, trunkAngle: 9.9 }, o))).not.toBe(k);
  });
});

describe("K 基準逐值對照（模擬匯入）", () => {
  const simulate = (data) => {
    const summary = buildImportSummary(data);
    const cadence = Number(data.cadence || 180);
    const body = buildDeriveBody(summary, { cadence, includeKeyframes: true });
    const out = deriveRequest(body);
    expect(out.ok).toBe(true);
    return { summary, cadence, r: out.result };
  };

  kIt("K1 walk 樣本：關鍵幀與 kf-walk-101 逐字相同；361／96", () => {
    const { r } = simulate(load("running-form_captured-2026-10-29-walk.json"));
    expect(JSON.stringify(r.cycleKeyframes)).toBe(JSON.stringify(load("kf-walk-101.json").cycleKeyframes));
    expect(r.phaseTiming).toEqual({ touchPct: 0, posePct: 15, fallPct: 30, pullPct: 84 });
    expect(r.metrics.gctMs).toBe(361);
    expect(r.metrics.overallScore).toBe(96);
  });

  kIt("K2 kf-hsu-101 去掉關鍵幀：與檔內關鍵幀逐字相同", () => {
    const data = load("kf-hsu-101.json");
    const expected = JSON.stringify(data.cycleKeyframes);
    delete data.cycleKeyframes;
    const { r } = simulate(data);
    expect(JSON.stringify(r.cycleKeyframes)).toBe(expected);
  });

  kIt("K3 三份 client-*.json：metrics 與 phaseTiming 等於本地路徑", () => {
    const expected = { "client-woman03.json": 66, "client-walkrun-a.json": 90, "client-walkrun-b.json": 75 };
    for (const [f, score] of Object.entries(expected)) {
      const data = load(f);
      const { cadence, r } = simulate(data);
      expect(r.metrics.overallScore, f).toBe(score);
      expect(r.metrics.gctMs, f).toBe(data.metrics.gctMs);
      expect(r.metrics.flightMs, f).toBe(data.metrics.flightMs);
      const local = core.computePersonalizedPhaseTiming({ phaseTiming: data.summary.phaseTiming }, cadence);
      expect(r.phaseTiming).toEqual(JSON.parse(JSON.stringify(local)));
    }
  });
});

describe("K4 phaseTiming 不冪等的防護", () => {
  it("pullPct 40 → 匯入時 60；寫回後再送兩次，Client 端 summary 不變", () => {
    const data = { cadence: 150, summary: { ...SUMMARY, phaseTiming: { touchPct: 0, posePct: 15, fallPct: 30, pullPct: 40 } } };
    const summary = buildImportSummary(data);
    const first = deriveRequest(buildDeriveBody(summary, { cadence: 150 })).result;
    expect(first.phaseTiming.pullPct).toBe(60);
    summary.phaseTiming = first.phaseTiming; // 匯入時唯一一次寫回
    for (let i = 0; i < 2; i++) {
      deriveRequest(buildDeriveBody(summary, { cadence: 150 })); // 之後的 derive 一律不寫回
      expect(summary.phaseTiming.pullPct).toBe(60);
    }
  });
});
