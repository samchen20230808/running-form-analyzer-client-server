// analyzeRequest／validateRequest 單元測試：不需要樣本，永遠執行。
import { describe, expect, it } from "vitest";
import { ANALYZE_ERRORS, analyzeRequest } from "../lib/server/analyze.js";
import { LIMITS, validateRequest } from "../lib/server/validate-request.js";

const lm33 = () => Array.from({ length: 33 }, () => [0.5, 0.5, 1]);
const frame = (t = 0) => ({ t, lm: lm33() });
const base = (over = {}) => ({
  frameWidth: 640,
  frameHeight: 480,
  frames: [frame(0), frame(0.03)],
  ...over,
});

describe("LIMITS 與錯誤類型", () => {
  it("LIMITS 與舊專案完全相等", () => {
    expect(LIMITS).toStrictEqual({
      maxFrames: 3000,
      maxBodyBytes: 4 * 1024 * 1024,
      minAcceptedFrames: 8,
      maxAcceptedFrames: 55,
      landmarkCount: 33,
      maxFrameSize: 16384,
      heightCm: [50, 250],
      maxTimeSec: 86400,
      coordRange: [-5, 5],
      maxProfileNameLength: 200,
    });
  });

  it("ANALYZE_ERRORS 恰好三種", () => {
    expect(ANALYZE_ERRORS).toEqual(["invalid_request", "payload_too_large", "insufficient_frames"]);
  });
});

describe("錯誤案例", () => {
  const badLm = (fn) => {
    const f = frame();
    fn(f.lm);
    return base({ frames: [f] });
  };
  const invalid = [
    ["null", null],
    ["陣列", []],
    ["字串", "x"],
    ["frames: 1", base({ frames: 1 })],
    ["lm 少於 33 點", base({ frames: [{ t: 0, lm: lm33().slice(0, 32) }] })],
    ["座標為字串", badLm((lm) => (lm[0] = ["a", 0.5, 1]))],
    ["座標 1e300", badLm((lm) => (lm[0] = [1e300, 0.5, 1]))],
    ["heightCm 1e308", base({ heightCm: 1e308 })],
    ["visibility 2", badLm((lm) => (lm[0] = [0.5, 0.5, 2]))],
    ["cameraMode x", base({ cameraMode: "x" })],
    ["runDirection 0", base({ runDirection: 0 })],
    ['isManualDirection "true"', base({ isManualDirection: "true" })],
    ["profileName 201 字", base({ profileName: "a".repeat(201) })],
  ];
  it.each(invalid)("%s → invalid_request", (_n, body) => {
    const out = analyzeRequest(body);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("invalid_request");
    expect(out.details.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toMatch(/stack/);
  });

  it("null 的 details 含「body 必須是 JSON 物件」", () => {
    expect(analyzeRequest(null).details).toContain("body 必須是 JSON 物件");
  });

  it("3001 幀 → payload_too_large", () => {
    const out = analyzeRequest(base({ frames: Array.from({ length: 3001 }, () => frame()) }));
    expect(out.ok).toBe(false);
    expect(out.error).toBe("payload_too_large");
  });

  it("5 幀同一組 landmarks → insufficient_frames", () => {
    const out = analyzeRequest(base({ frames: Array.from({ length: 5 }, (_, i) => frame(i / 30)) }));
    expect(out.ok).toBe(false);
    expect(out.error).toBe("insufficient_frames");
    expect(out.acceptedFrames).toBeLessThan(8);
    expect(JSON.stringify(out)).not.toMatch(/stack/);
  });

  it("payload_too_large 的 details 指出 frames 上限；剛好 3000 幀不算過大", () => {
    const big = validateRequest(base({ frames: Array.from({ length: 3001 }, () => frame()) }));
    expect(big.tooLarge).toBe(true);
    expect(big.details[0]).toMatch(/3000/);
    const edge = validateRequest(base({ frames: Array.from({ length: 3000 }, () => frame()) }));
    expect(edge.tooLarge).toBeUndefined();
    expect(edge.ok).toBe(true);
  });

  it("details 最多 20 筆", () => {
    const frames = Array.from({ length: 30 }, () => ({ t: -1, lm: [] }));
    const v = validateRequest(base({ frames }));
    expect(v.ok).toBe(false);
    expect(v.details).toHaveLength(20);
  });
});

describe("邊界值通過驗證", () => {
  it.each([
    ["heightCm 50", { heightCm: 50 }],
    ["heightCm 250", { heightCm: 250 }],
    ["frameWidth 16384", { frameWidth: 16384 }],
  ])("%s", (_n, over) => {
    expect(validateRequest(base(over)).ok).toBe(true);
  });

  it("visibility null／0／1 與座標 ±5", () => {
    const f = frame();
    f.lm[0] = [5, -5, null];
    f.lm[1] = [-5, 5, 0];
    f.lm[2] = [0, 0, 1];
    expect(validateRequest(base({ frames: [f] })).ok).toBe(true);
  });
});
