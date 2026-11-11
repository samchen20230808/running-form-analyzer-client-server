import "server-only";
// 請求驗證（server-only）：只檢查型別、範圍與筆數，不修正資料。逐字搬自舊專案 server/lib/validate-request.js。
export const LIMITS = {
  maxFrames: 3000,
  maxBodyBytes: 4 * 1024 * 1024,
  minAcceptedFrames: 8,
  maxAcceptedFrames: 55,
  landmarkCount: 33,
  maxFrameSize: 16384, // frameWidth／frameHeight 上限（px）
  heightCm: [50, 250],
  maxTimeSec: 86400,
  coordRange: [-5, 5], // 正規化座標；允許略超出畫面
  maxProfileNameLength: 200,
};

const CAMERA_MODES = ["auto", "static", "tracking"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function validateRequest(body) {
  const details = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: ["body 必須是 JSON 物件"] };
  }

  for (const k of ["frameWidth", "frameHeight"]) {
    if (!isNum(body[k]) || body[k] <= 0 || body[k] > LIMITS.maxFrameSize) {
      details.push(`${k} 必填，須為 0 ~ ${LIMITS.maxFrameSize} 的正數`);
    }
  }
  if (body.heightCm !== undefined) {
    const [lo, hi] = LIMITS.heightCm;
    if (!isNum(body.heightCm) || body.heightCm < lo || body.heightCm > hi) {
      details.push(`heightCm 須介於 ${lo} ~ ${hi}`);
    }
  }
  if (body.cameraMode !== undefined && !CAMERA_MODES.includes(body.cameraMode)) {
    details.push(`cameraMode 須為 ${CAMERA_MODES.join("｜")}`);
  }
  if (body.runDirection !== undefined && body.runDirection !== 1 && body.runDirection !== -1) {
    details.push("runDirection 須為 1 或 -1");
  }
  if (body.isManualDirection !== undefined && typeof body.isManualDirection !== "boolean") {
    details.push("isManualDirection 須為 boolean");
  }
  if (
    body.profileName !== undefined &&
    (typeof body.profileName !== "string" ||
      body.profileName.length > LIMITS.maxProfileNameLength)
  ) {
    details.push(`profileName 須為不超過 ${LIMITS.maxProfileNameLength} 字的字串`);
  }

  if (!Array.isArray(body.frames)) {
    details.push("frames 必填，須為陣列");
  } else if (body.frames.length > LIMITS.maxFrames) {
    return { ok: false, tooLarge: true, details: [`frames 超過 ${LIMITS.maxFrames} 幀`] };
  } else {
    for (let i = 0; i < body.frames.length && details.length < 20; i++) {
      const f = body.frames[i];
      if (!f || typeof f !== "object" || !isNum(f.t) || f.t < 0 || f.t > LIMITS.maxTimeSec) {
        details.push(`frames[${i}].t 須為 0 ~ ${LIMITS.maxTimeSec} 的有限數字`);
        continue;
      }
      if (!Array.isArray(f.lm) || f.lm.length !== LIMITS.landmarkCount) {
        details.push(`frames[${i}].lm 須為 ${LIMITS.landmarkCount} 點`);
        continue;
      }
      for (let j = 0; j < f.lm.length; j++) {
        const p = f.lm[j];
        const [cLo, cHi] = LIMITS.coordRange;
        if (
          !Array.isArray(p) ||
          !isNum(p[0]) ||
          !isNum(p[1]) ||
          p[0] < cLo || p[0] > cHi ||
          p[1] < cLo || p[1] > cHi ||
          !(p[2] === null || p[2] === undefined || (isNum(p[2]) && p[2] >= 0 && p[2] <= 1))
        ) {
          details.push(
            `frames[${i}].lm[${j}] 須為 [x, y, visibility]（x、y 介於 ${cLo} ~ ${cHi}，visibility 介於 0 ~ 1 或 null）`,
          );
          break;
        }
      }
    }
  }
  return details.length ? { ok: false, details } : { ok: true, details };
}
