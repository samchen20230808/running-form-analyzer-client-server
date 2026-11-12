import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../lib/config.js";

describe("APP_CONFIG", () => {
  it("與預期的 V4.0 設定值逐欄一致", () => {
    expect(APP_CONFIG).toEqual({
      version: "V4.0",
      analysisSchemaVersion: "1.1.0",
      versionName:
        "高速跑姿防漏格與單腳步頻校正版 (動態模糊視野放寬 • 走跑多維智能辨識 • 雙步倍頻重校)",
      systemName: "AI 跑姿生物力學與骨架循環分析系統",
      subtitle:
        "右腿主角視角 • 高速防漏格採樣 • 走跑多維智能辨識 • 雙步倍頻重校 • 實體觸地區間 (Stance)",
      heroTitle:
        "🎯 高速跑姿動態模糊採樣放寬 ＋ 單腳雙步倍頻自適應校正（告別跑姿誤判慢走）",
      heroDesc:
        "針對手持跟拍與黑色緊身褲等高速動態模糊場景，全面放寬腳踝過嚴遮蔽門檻，引入單腳步頻（Stride Rate）倍頻智慧辨識與多維度走跑特徵判定，徹底杜絕高速跑姿被誤殺為散步！",
      updatedAt: "2026-11-02",
      defaults: {
        cadence: 180,
        heightCm: 172,
        cameraMode: "auto",
      },
    });
  });
});
