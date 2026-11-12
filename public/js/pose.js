function autoDetectVideoBrightness() {
  try {
    const W = Math.min(160, sourceVideo.videoWidth || 160);
    const H = Math.min(100, sourceVideo.videoHeight || 100);
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = W;
    tmpCanvas.height = H;
    const tmpCtx = tmpCanvas.getContext("2d");
    tmpCtx.drawImage(sourceVideo, 0, 0, W, H);
    const imgData = tmpCtx.getImageData(0, 0, W, H).data;
    let totalLuma = 0;
    const count = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 16) {
      totalLuma +=
        0.299 * imgData[i] +
        0.587 * imgData[i + 1] +
        0.114 * imgData[i + 2];
    }
    const avgLuma = totalLuma / (count / 4);
    if (avgLuma > 135) {
      nightBoostEnabled = false;
      updateNightBoostBtnUI(" (AI自動感光)");
    } else {
      nightBoostEnabled = true;
      updateNightBoostBtnUI(" (AI夜間感光)");
    }
  } catch (e) {
    nightBoostEnabled = false;
    updateNightBoostBtnUI();
  }
}

async function initMediaPipePose() {
  if (poseDetector) return poseDetector;
  if (typeof Pose === "undefined") return null;
  poseDetector = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });
  poseDetector.setOptions({
    modelComplexity: 2,
    smoothLandmarks: true,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65,
  });
  poseDetector.onResults(onPoseResults);
  return poseDetector;
}

async function sendCurrentVideoFrameToPose(isStaticStep = false) {
  if (!poseDetector || !sourceVideo.src) return;
  const W = videoCanvas.width;
  const H = videoCanvas.height;
  preprocessCtx.save();
  if (nightBoostEnabled)
    preprocessCtx.filter =
      "brightness(1.28) contrast(1.22) saturate(1.1)";
  else preprocessCtx.filter = "none";
  preprocessCtx.drawImage(sourceVideo, 0, 0, W, H);
  preprocessCtx.restore();

  await poseDetector.send({ image: preprocessCanvas });
  if (isStaticStep) await poseDetector.send({ image: preprocessCanvas });
}

async function processVideoFrameLoop() {
  if (isUsingSimulatedFeed) return;
  if (!sourceVideo.paused && !sourceVideo.ended) {
    await sendCurrentVideoFrameToPose(false);
    if (sourceVideo.duration)
      document.getElementById("videoSeekSlider").value =
        (sourceVideo.currentTime / sourceVideo.duration) * 100;
    updateFrameCounterHUD();
    requestAnimationFrame(processVideoFrameLoop);
  }
}

function sanitizeLandmarks(lm) {
  if (!prevValidLandmarks) {
    prevValidLandmarks = JSON.parse(JSON.stringify(lm));
    return lm;
  }
  const cleaned = lm.map((pt, idx) => {
    const prev = prevValidLandmarks[idx];
    if (idx >= 25 && idx <= 32) {
      const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      if (
        (pt.visibility !== undefined && pt.visibility < 0.52) ||
        dist > 0.18
      ) {
        return {
          x: prev.x * 0.65 + pt.x * 0.35,
          y: prev.y * 0.65 + pt.y * 0.35,
          z: pt.z,
          visibility: pt.visibility,
        };
      }
    }
    return pt;
  });
  prevValidLandmarks = JSON.parse(JSON.stringify(cleaned));
  return cleaned;
}
