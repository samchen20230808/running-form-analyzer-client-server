// baseline 骨架：只驗證樣本檔案存在且格式正確，不執行核心演算法（核心在 Feature 1.1）。
// 樣本放在 .temp/json/（已 gitignore，來源：舊專案 .temp/json/）。
// 路徑相對於本檔，與執行時的 cwd 無關。
// 設 REQUIRE_BASELINE=1 時，樣本缺少會直接失敗（Epic 1 起建議使用）。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = new URL("../.temp/json/", import.meta.url);
const available = existsSync(DIR);
const required = process.env.REQUIRE_BASELINE === "1";

// 基準值（舊專案 V3.29 實測）
const BASELINE = {
  walkSummary: { file: "running-form_captured-2026-10-29-walk.json", cadence: 103 },
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
