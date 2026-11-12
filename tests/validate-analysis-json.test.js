// validateAnalysisJSON（契約 v1.0.0）單元測試：不需要樣本。
import { describe, expect, it } from "vitest";
import { validateAnalysisJSON } from "../lib/contract/validate-analysis-json.js";

const SUMMARY_KEYS = [
  "trunkAngle",
  "comOffsetCm",
  "touchdownKnee",
  "minSwingKnee",
  "pushOffExtensionDeg",
  "avgElbow",
  "hipRomDeg",
  "strideMeters",
];
const fullSummary = () => Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 1]));

describe("validateAnalysisJSON 1.1.0", () => {
  it("1.1.0 帶 metrics.gct → ok、零 warnings；1.9.0 ok；2.0.0 不支援", () => {
    const base = { cadence: 180, summary: fullSummary(), metrics: { gctMs: 1, gct: { rating: "good" } } };
    expect(validateAnalysisJSON({ ...base, schemaVersion: "1.1.0" })).toStrictEqual({
      ok: true,
      legacy: false,
      schemaVersion: "1.1.0",
      errors: [],
      warnings: [],
    });
    expect(validateAnalysisJSON({ ...base, schemaVersion: "1.9.0" }).ok).toBe(true);
    expect(validateAnalysisJSON({ ...base, schemaVersion: "2.0.0" }).ok).toBe(false);
  });
});

describe("validateAnalysisJSON", () => {
  it.each([null, [], 5])("根節點 %j 不是物件 → ok:false", (v) => {
    const r = validateAnalysisJSON(v);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(["JSON 根節點必須是物件"]);
  });

  it("無 schemaVersion → legacy", () => {
    expect(validateAnalysisJSON({})).toStrictEqual({
      ok: true,
      legacy: true,
      schemaVersion: null,
      errors: [],
      warnings: [],
    });
  });

  it("schemaVersion 為 null 也視為 legacy", () => {
    const r = validateAnalysisJSON({ schemaVersion: null });
    expect(r.legacy).toBe(true);
    expect(r.ok).toBe(true);
  });

  it.each(["1.0", "v1.0.0", 1])("格式錯誤 %j", (sv) => {
    const r = validateAnalysisJSON({ schemaVersion: sv });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/格式不符/);
  });

  it("主版本 2.0.0 不支援", () => {
    const r = validateAnalysisJSON({ schemaVersion: "2.0.0" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/主版本/);
  });

  it.each(["1.5.3", "0.9.0"])("%s ok", (sv) => {
    expect(validateAnalysisJSON({ schemaVersion: sv, cadence: 1, summary: fullSummary() }).ok).toBe(true);
  });

  it("缺 cadence、summary 欄位為字串 → warning", () => {
    const r = validateAnalysisJSON({
      schemaVersion: "1.0.0",
      summary: { ...fullSummary(), avgElbow: "x" },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings.join()).toMatch(/cadence/);
    expect(r.warnings.join()).toMatch(/avgElbow/);
  });

  it("缺 summary → 沒有 summary 相關 warning", () => {
    const r = validateAnalysisJSON({ schemaVersion: "1.0.0", cadence: 100 });
    expect(r.warnings).toEqual([]);
  });
});
