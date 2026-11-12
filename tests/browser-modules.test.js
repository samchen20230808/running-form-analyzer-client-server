// 3.4：瀏覽器共用模組（lib/player、lib/landmarks）的結構、同一性、冒煙值與 public/modules 副本一致性。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as core from "../lib/core/index.js";
import * as player from "../lib/player/index.js";
import * as landmarks from "../lib/landmarks/index.js";
import * as profiles from "../lib/profiles/index.js";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const norm = (s) => s.replace(/\r\n/g, "\n");
const MANAGED = ["player", "landmarks", "profiles"];

function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...listFiles(`${p}/`));
    else out.push(p);
  }
  return out.sort();
}
const stripComments = (src) =>
  src
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const libFiles = MANAGED.flatMap((d) => listFiles(`lib/${d}/`));

const SERVER_ONLY_MARKERS = [
  "generatePoseMethodAlignedCycle",
  "computeGctMetrics",
  "computePersonalizedPhaseTiming",
  "calculateOverallRunningScore",
  "analyzeCapturedFrames",
  "detectCadenceFromFrames",
  "computeStrideForCameraMode",
  "computeAutoStrideMeters",
  "buildCycleKeyframesFromSummary",
  "嚴重跨步煞車或身後推蹬",
  "🚶 行走步態 (雙腳交替支撐 • 零騰空)",
  "📷 手動鎖定靜態機位",
];

describe("A1 結構：lib/player、lib/landmarks 可在瀏覽器執行", () => {
  it("不含 server-only／document／window，import 只能是同目錄樹內的相對路徑", () => {
    for (const f of libFiles) {
      const code = stripComments(read(f));
      expect(code, f).not.toContain("server-only");
      expect(code, f).not.toMatch(/\b(document|window)\b/);
      expect(code, f).not.toContain("node:");
      expect(code, f).not.toMatch(/\bimport\s*\(/);
      expect(code, f).not.toMatch(/(^|\n)\s*import\s*["']/);
      for (const m of code.matchAll(/from\s+["']([^"']+)["']/g)) {
        expect(m[1], f).toMatch(/^\.\/[\w-]+\.js$/);
      }
    }
  });

  it("A2 不含 server-only 核心的識別字與字串", () => {
    for (const f of libFiles) {
      const src = read(f);
      for (const marker of SERVER_ONLY_MARKERS) expect(src, `${f}: ${marker}`).not.toContain(marker);
    }
  });
});

describe("A3 同一性：Server 與瀏覽器用同一份", () => {
  it("lib/core 轉匯出的就是新模組的同一個物件", () => {
    expect(core.CYCLE_KEYFRAME_NUMERIC_FIELDS).toBe(player.CYCLE_KEYFRAME_NUMERIC_FIELDS);
    expect(core.extractAnglesFromLandmarks).toBe(landmarks.extractAnglesFromLandmarks);
    expect(core.evaluateCaptureFrame).toBe(landmarks.evaluateCaptureFrame);
  });

  it("匯出名稱固定", () => {
    expect(Object.keys(player).sort()).toEqual([
      "CYCLE_KEYFRAME_MIN_FRAMES",
      "CYCLE_KEYFRAME_NUMERIC_FIELDS",
      "evaluateProfileAngles",
      "normalizeCycleKeyframes",
      "parseManualStrideValue",
      "sampleCycleKeyframes",
      "solveKinematics",
    ]);
    expect(Object.keys(landmarks).sort()).toEqual(["evaluateCaptureFrame", "extractAnglesFromLandmarks"]);
    expect(Object.keys(profiles).sort()).toEqual([
      "BAKED_CYCLE_KEYFRAMES",
      "BUILTIN_PROFILES",
      "BUILTIN_PROFILE_KEYS",
      "REFERENCE_PROFILE_KEY",
      "SIM_CAPTURE_META",
      "SIM_CAPTURE_REQUEST",
      "SIM_CAPTURE_SOURCE_KEY",
      "createBuiltinProfiles",
    ]);
  });

  it("evaluateProfileAngles 只看關鍵幀，沒有就回傳 null（B3）", () => {
    expect(player.evaluateProfileAngles({}, 0.3)).toBeNull();
    expect(player.evaluateProfileAngles(null, 0.3)).toBeNull();
    const prof = profiles.createBuiltinProfiles().hsu_pose_method;
    expect(player.evaluateProfileAngles(prof, 0.3)).toStrictEqual(
      player.sampleCycleKeyframes(prof.cycleKeyframes, 0.3),
    );
  });
});

describe("A4 冒煙值（搬遷前後逐值相同）", () => {
  const KF_PATH = ".temp/json/kf-walk-101.json";
  const required = process.env.REQUIRE_BASELINE === "1";
  const hasKf = existsSync(new URL(KF_PATH, ROOT));
  const load = () => {
    const j = JSON.parse(read(KF_PATH));
    return j.cycleKeyframes ?? j;
  };

  it("normalizeCycleKeyframes 壞資料回傳對應錯誤", () => {
    const r = player.normalizeCycleKeyframes({});
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      "model 必須是 angles-sagittal-v1",
      "interpolation 必須是 linear",
      "phaseBasis 必須是 animationCycle",
      "frames 至少需要 21 幀",
    ]);
    expect(player.normalizeCycleKeyframes(null).errors).toEqual(["cycleKeyframes 必須是物件"]);
  });

  it("parseManualStrideValue", () => {
    expect(player.parseManualStrideValue("1.234")).toBe(1.23);
    expect(player.parseManualStrideValue("0.04")).toBeNull();
    expect(player.parseManualStrideValue("abc")).toBeNull();
    expect(player.parseManualStrideValue("2.5")).toBe(2.5);
  });

  it.runIf(required || hasKf)("kf-walk-101：normalize、sample、solveKinematics", () => {
    const ck = load();
    expect(player.normalizeCycleKeyframes(ck).ok).toBe(true);
    const at = (p) => player.sampleCycleKeyframes(ck, p);
    expect(at(0).trunk).toBe(5);
    expect(at(0).rKnee).toBe(6);
    expect(at(0).lKnee).toBe(9.733333333333334);
    expect(at(1).lKnee).toBe(9.733333333333334);
    expect(at(0.37).trunk).toBe(4.750493317892932);
    expect(at(0.37).lKnee).toBe(29.285714285714285);
    expect(at(1.25).rKnee).toBe(10.125);
    const k = player.solveKinematics(at(0.37), 300, 360, 1.0);
    expect(k.hip).toEqual({ x: 300, y: 202.64951766452123 });
    expect(k.head).toEqual({ x: 309.7812448887199, y: 81.04383856421653 });
    expect(k.rightLeg.toe).toEqual({ x: 288.09431394701545, y: 357 });
  });
});

describe("B1 public/modules 與 lib 同步", () => {
  it("檔案清單與內容（換行正規化後）相同", () => {
    const hint = "請執行 npm run sync:legacy";
    const copies = MANAGED.flatMap((d) => listFiles(`public/modules/${d}/`));
    expect(
      copies.map((f) => f.replace("public/modules/", "lib/")),
      hint,
    ).toEqual(libFiles);
    for (const f of libFiles) {
      const copy = f.replace("lib/", "public/modules/");
      expect(norm(read(copy)), `${copy}：${hint}`).toBe(norm(read(f)));
    }
  });

  it("modules/ 只有受管理子目錄與 bridge.js；bridge.js 只 import 三個 index.js", () => {
    expect(readdirSync(new URL("public/modules/", ROOT)).sort()).toEqual(
      ["bridge.js", ...MANAGED].sort(),
    );
    const imports = [...read("public/modules/bridge.js").matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(["./player/index.js", "./landmarks/index.js", "./profiles/index.js"]);
  });
});
