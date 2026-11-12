// Feature 3.5：內建 profile 烘焙一致性、模擬擷取（合成 landmarks）通過標準 S1–S7、靜態資料結構。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CYCLE_KEYFRAME_NUMERIC_FIELDS,
  evaluateCaptureFrame,
  extractAnglesFromLandmarks,
  generatePoseMethodAlignedCycle,
} from "../lib/core/index.js";
import { normalizeCycleKeyframes, sampleCycleKeyframes } from "../lib/player/index.js";
import {
  BAKED_CYCLE_KEYFRAMES,
  BUILTIN_PROFILES,
  BUILTIN_PROFILE_KEYS,
  SIM_CAPTURE_META,
  SIM_CAPTURE_REQUEST,
  SIM_CAPTURE_SOURCE_KEY,
  createBuiltinProfiles,
} from "../lib/profiles/index.js";
import { analyzeRequest } from "../lib/server/analyze.js";
import { LIMITS, validateRequest } from "../lib/server/validate-request.js";
import { validateAnalysisJSON } from "../lib/contract/validate-analysis-json.js";
import { renderBakedModules } from "../scripts/bake-profiles-lib.mjs";

const ROOT = new URL("../", import.meta.url);
const norm = (t) => t.replace(/\r\n/g, "\n");
const noTs = (o) => ({ ...o, timestamp: 0 });

describe("P1 烘焙一致性（烘焙檔 == 核心重新計算）", () => {
  const baked = renderBakedModules();
  it.each(Object.keys(baked))("%s 與磁碟檔逐字相同", (rel) => {
    const disk = norm(readFileSync(new URL(rel, ROOT), "utf8"));
    expect(disk, `${rel} 已過期，請執行 npm run bake:profiles`).toBe(baked[rel]);
  });
});

describe("P2 烘焙關鍵幀", () => {
  it.each(BUILTIN_PROFILE_KEYS)("%s：合法、101 幀、節點值與核心一致", (key) => {
    const ck = BAKED_CYCLE_KEYFRAMES[key];
    expect(normalizeCycleKeyframes(ck).ok).toBe(true);
    expect(ck.frames).toHaveLength(101);
    const prof = BUILTIN_PROFILES[key];
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const direct = generatePoseMethodAlignedCycle(p, prof.summary, prof.cadence);
      const sampled = sampleCycleKeyframes(ck, p);
      for (const k of CYCLE_KEYFRAME_NUMERIC_FIELDS) {
        expect(Math.abs(sampled[k] - direct[k]), `${key} ${k} @${p}`).toBeLessThanOrEqual(1e-9);
      }
      expect(sampled.rIsStance).toBe(direct.rIsStance);
      expect(sampled.lIsStance).toBe(direct.lIsStance);
    }
  });

  const SAMPLE = ".temp/json/kf-hsu-101.json";
  const required = process.env.REQUIRE_BASELINE === "1";
  it.skipIf(!required && !existsSync(new URL(SAMPLE, ROOT)))("hsu 與舊專案樣本逐字相同", () => {
    const j = JSON.parse(readFileSync(new URL(SAMPLE, ROOT), "utf8"));
    expect(JSON.stringify(BAKED_CYCLE_KEYFRAMES.hsu_pose_method)).toBe(JSON.stringify(j.cycleKeyframes));
  });
});

describe("P3 模擬擷取（合成 landmarks）S1–S7", () => {
  const req = (o = {}) => ({ ...SIM_CAPTURE_REQUEST, heightCm: 172, cameraMode: "auto", ...o });
  const r = analyzeRequest(req());

  it("S1 請求合法且大小在限制內", () => {
    expect(r.ok).toBe(true);
    expect(validateRequest(req()).ok).toBe(true);
    expect(SIM_CAPTURE_REQUEST.frames.length).toBeLessThanOrEqual(LIMITS.maxFrames);
    expect(JSON.stringify(req()).length).toBeLessThanOrEqual(200 * 1024);
  });

  it("S2 閘門接受足夠幀數，前 55 幀無 skip／finalize", () => {
    let rd = 1;
    let locked = null;
    const accepted = [];
    for (const f of SIM_CAPTURE_REQUEST.frames) {
      const lm = f.lm.map(([x, y, v]) => ({ x, y, visibility: v }));
      const res = extractAnglesFromLandmarks(lm, SIM_CAPTURE_REQUEST.frameWidth, SIM_CAPTURE_REQUEST.frameHeight, {
        runDirection: rd,
        isManualDirection: true,
        heightCm: 172,
        videoTime: f.t,
      });
      rd = res.runDirection;
      const g = evaluateCaptureFrame(res.extracted, accepted, locked);
      locked = g.lockedHip;
      expect(g.action, `frame t=${f.t}`).toBe("accept");
      accepted.push(res.extracted);
      if (accepted.length >= LIMITS.maxAcceptedFrames) break;
    }
    expect(accepted.length).toBe(LIMITS.maxAcceptedFrames);
  });

  it("S3 步頻接近來源 profile，且不是行走", () => {
    expect(Math.abs(r.result.cadence - BUILTIN_PROFILES[SIM_CAPTURE_SOURCE_KEY].cadence)).toBeLessThanOrEqual(3);
    expect(r.result.metrics.isWalking).toBe(false);
  });

  it("S4 結果通過契約驗證，關鍵幀合法", () => {
    const v = validateAnalysisJSON(r.result);
    expect(v.errors ?? []).toEqual([]);
    expect(v.warnings ?? []).toEqual([]);
    expect(v.ok).toBe(true);
    const pt = r.result.phaseTiming;
    expect(pt.touchPct).toBeLessThanOrEqual(pt.posePct);
    expect(pt.posePct).toBeLessThanOrEqual(pt.fallPct);
    expect(pt.fallPct).toBeLessThanOrEqual(pt.pullPct);
    expect(normalizeCycleKeyframes(r.result.cycleKeyframes).ok).toBe(true);
  });

  it("S5 與舊本地模擬同量級（總分 35 ± 10）", () => {
    expect(Math.abs(r.result.metrics.overallScore - 35)).toBeLessThanOrEqual(10);
  });

  it("S6 可重現，且不依賴方向自動偵測", () => {
    expect(noTs(analyzeRequest(req()).result)).toStrictEqual(noTs(r.result));
    const auto = analyzeRequest(req({ isManualDirection: false })).result;
    expect(noTs(auto)).toStrictEqual(noTs(r.result));
  });

  it("S7 各身高與機位都成功且不是行走", () => {
    for (const heightCm of [160, 190]) {
      for (const cameraMode of ["auto", "static", "tracking"]) {
        const out = analyzeRequest(req({ heightCm, cameraMode }));
        expect(out.ok, `${heightCm}/${cameraMode}`).toBe(true);
        expect(out.result.metrics.isWalking).toBe(false);
      }
    }
  });

  it("172／auto 逐值快照", () => {
    expect(SIM_CAPTURE_META.sourceProfileKey).toBe(SIM_CAPTURE_SOURCE_KEY);
    expect(r.result.cadence).toBe(166);
    expect(r.result.metrics).toStrictEqual({ gctMs: 257, flightMs: 104, isWalking: false, overallScore: 35 });
    expect(r.result.summary).toStrictEqual({
      trunkAngle: 4.3,
      comOffsetCm: 11.2,
      touchdownKnee: 159,
      minSwingKnee: 116,
      avgElbow: 65,
      footStrikeAngle: 2,
      pushOffExtensionDeg: 21.2,
      hipRomDeg: 37,
      strideMeters: 0.69,
      _measuredPixelStride: 0.08,
      _autoDetectedStatic: false,
      measuredStrideMeters: null,
      phaseTiming: { touchPct: 0, posePct: 20, fallPct: 36, pullPct: 83 },
    });
  });
});

describe("P4 靜態資料", () => {
  it("BUILTIN_PROFILES 深度凍結", () => {
    const p = BUILTIN_PROFILES.hsu_pose_method;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.summary)).toBe(true);
    expect(Object.isFrozen(p.summary.phaseTiming)).toBe(true);
    expect(() => {
      p.summary.trunkAngle = 99;
    }).toThrow();
    expect(p.summary.trunkAngle).toBe(8.2);
  });

  it("createBuiltinProfiles 回傳新的深複本且帶關鍵幀", () => {
    const a = createBuiltinProfiles();
    a.hsu_pose_method.summary.trunkAngle = 99;
    a.hsu_pose_method.cycleKeyframes.frames[0].trunk = 99;
    const b = createBuiltinProfiles();
    expect(b.hsu_pose_method.summary.trunkAngle).toBe(8.2);
    expect(b.hsu_pose_method.cycleKeyframes.frames[0].trunk).not.toBe(99);
    for (const k of BUILTIN_PROFILE_KEYS) expect(b[k].cycleKeyframes.frames).toHaveLength(101);
    expect(BUILTIN_PROFILE_KEYS).toEqual(Object.keys(BUILTIN_PROFILES));
  });
});

describe("P5 搬家數值對照（來自原 public/js/config.js）", () => {
  const EXPECT = {
    hsu_pose_method: { cadence: 184, trunkAngle: 8.2, comOffsetCm: 3.2, touchdownKnee: 155, minSwingKnee: 76, avgElbow: 86, pushOffExtensionDeg: 14, footStrikeAngle: -1, hipRomDeg: 38, strideMeters: 1.12, pt: [0, 15, 30, 75] },
    night_track_runner: { cadence: 166, trunkAngle: 3.5, comOffsetCm: 13.2, touchdownKnee: 162, minSwingKnee: 108, avgElbow: 64, pushOffExtensionDeg: 28.5, footStrikeAngle: 14, hipRomDeg: 46, strideMeters: 0.96, pt: [0, 21, 38, 82] },
    custom_captured: { cadence: 180, trunkAngle: 7.4, comOffsetCm: 2.8, touchdownKnee: 155, minSwingKnee: 74, avgElbow: 84, pushOffExtensionDeg: 15, footStrikeAngle: 2, hipRomDeg: 38, strideMeters: 0.95, pt: [0, 15, 30, 75] },
  };
  it.each(Object.keys(EXPECT))("%s", (key) => {
    const { cadence, pt, ...sum } = EXPECT[key];
    const p = BUILTIN_PROFILES[key];
    expect(p.cadence).toBe(cadence);
    const { phaseTiming, ...rest } = p.summary;
    expect(rest).toStrictEqual(sum);
    expect(Object.values(phaseTiming)).toStrictEqual(pt);
  });
  it("name", () => {
    expect(BUILTIN_PROFILES.hsu_pose_method.name).toBe("★ 徐國峰教練 (關鍵跑姿黃金標準)");
    expect(BUILTIN_PROFILES.night_track_runner.name).toBe("歷史紀錄：夜間跑道舊影片 (跨步與晚拉腿實測對照)");
    expect(BUILTIN_PROFILES.custom_captured.name).toBe("🎥 實測影片分析檔 (您上傳的影片)");
  });
});
