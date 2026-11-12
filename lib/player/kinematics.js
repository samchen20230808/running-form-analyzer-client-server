// 正向運動學：關節角度 → 骨架座標。純函式，非 server-only，不得 import lib/core 或 lib/server。

export function solveKinematics(angles, originX, groundY, scale = 1.0) {
  const d2r = Math.PI / 180;
  const hipX = originX;

  const trunkLen = 96 * scale;
  const headLen = 26 * scale;
  const thighLen = 78 * scale;
  const shankLen = 76 * scale;
  const footLen = 28 * scale;
  const upperArmLen = 54 * scale;
  const forearmLen = 50 * scale;

  const dir = 1;

  function computeLegRelative(
    thighDeg = 0,
    kneeFlexDeg = 20,
    ankleDeg = 0,
  ) {
    const tRad = thighDeg * d2r;
    const kneeDX = dir * Math.sin(tRad) * thighLen;
    const kneeDY = Math.cos(tRad) * thighLen;

    const safeKneeFlex = Math.max(4, Math.min(125, kneeFlexDeg));
    const sRad = (thighDeg - safeKneeFlex) * d2r;
    const ankleDX = kneeDX + dir * Math.sin(sRad) * shankLen;
    const ankleDY = kneeDY + Math.cos(sRad) * shankLen;

    const footGlobalDeg = Math.max(
      -25,
      Math.min(35, (thighDeg - safeKneeFlex) * 0.25 + (ankleDeg || 0)),
    );
    const fRad = (82 + footGlobalDeg) * d2r;
    const toeDX = ankleDX + dir * Math.sin(fRad) * (footLen * 0.72);
    const toeDY = ankleDY + Math.cos(fRad) * (footLen * 0.72);
    const heelDX = ankleDX - dir * Math.sin(fRad) * (footLen * 0.28);
    const heelDY = ankleDY - Math.cos(fRad) * (footLen * 0.28);

    return {
      kneeDX,
      kneeDY,
      ankleDX,
      ankleDY,
      toeDX,
      toeDY,
      heelDX,
      heelDY,
    };
  }

  const rRel = computeLegRelative(
    angles.rThigh,
    angles.rKnee,
    angles.rAnkle,
  );
  const lRel = computeLegRelative(
    angles.lThigh,
    angles.lKnee,
    angles.lAnkle,
  );

  const rMaxDY = Math.max(rRel.ankleDY, rRel.toeDY, rRel.heelDY);
  const lMaxDY = Math.max(lRel.ankleDY, lRel.toeDY, lRel.heelDY);
  const lowestFootDY = Math.max(rMaxDY, lMaxDY);

  let hipY;
  if (angles.lIsStance && angles.rIsStance) {
    // 雙腳支撐期 (Double Support): 以支撐高度較高的腿鎖定骨盆，避免後腿拖曳時骨盆被拉至地面
    hipY = groundY - 3 - Math.max(lMaxDY, rMaxDY);
  } else if (angles.lIsStance) {
    hipY = groundY - 3 - lMaxDY;
  } else if (angles.rIsStance) {
    hipY = groundY - 3 - rMaxDY;
  } else {
    hipY = Math.min(groundY - 8 - lowestFootDY, groundY - 148 * scale);
  }

  const trunkAngle = angles.trunk ?? 8.2;
  const trunkRad = trunkAngle * d2r;
  const shoulderX = hipX + dir * Math.sin(trunkRad) * trunkLen;
  const shoulderY = hipY - Math.cos(trunkRad) * trunkLen;

  const headX = shoulderX + dir * Math.sin(trunkRad * 0.85) * headLen;
  const headY = shoulderY - Math.cos(trunkRad * 0.85) * headLen;

  const buildAbsLeg = (rel) => ({
    knee: { x: hipX + rel.kneeDX, y: hipY + rel.kneeDY },
    ankle: { x: hipX + rel.ankleDX, y: hipY + rel.ankleDY },
    toe: { x: hipX + rel.toeDX, y: hipY + rel.toeDY },
    heel: { x: hipX + rel.heelDX, y: hipY + rel.heelDY },
  });

  function solveArm(shoulderDeg = 0, elbowFlexDeg = 80) {
    const sRad = (shoulderDeg - trunkAngle) * d2r;
    const elbowX = shoulderX + dir * Math.sin(sRad) * upperArmLen;
    const elbowY = shoulderY + Math.cos(sRad) * upperArmLen;
    const safeElbowFlex = Math.max(25, Math.min(135, elbowFlexDeg));
    const eRad = (shoulderDeg - trunkAngle + safeElbowFlex) * d2r;
    const wristX = elbowX + dir * Math.sin(eRad) * forearmLen;
    const wristY = elbowY + Math.cos(eRad) * forearmLen;
    return {
      elbow: { x: elbowX, y: elbowY },
      wrist: { x: wristX, y: wristY },
    };
  }

  return {
    hip: { x: hipX, y: hipY },
    shoulder: { x: shoulderX, y: shoulderY },
    head: { x: headX, y: headY },
    rightLeg: buildAbsLeg(rRel),
    leftLeg: buildAbsLeg(lRel),
    rightArm: solveArm(angles.rShoulder, angles.rElbow),
    leftArm: solveArm(angles.lShoulder, angles.lElbow),
  };
}
