let activeProfileKey = "hsu_pose_method";
let simPlaying = true;
let simSpeed = 0.5;
let cyclePct = 15;
let lastTimestamp = performance.now();
let runDirection = 1;
let isManualDirection = false;
let nightBoostEnabled = false;

let isManualStride = true;
let manualStrideValue = 0.95;
let strideModeText = "🤖 AI依擺腿推算";
let selectedCameraMode = "auto"; // 'auto' | 'static' | 'tracking'

let livePoseOverride = null;
let prevValidLandmarks = null;
let layers = { ghost: true, trail: true };

let poseDetector = null;
let isUsingSimulatedFeed = false;
let isCapturingCycle = false;
let capturedRawFrames = [];
let savedVideoPlaybackRate = 0.5;

let lockedSubjectHipX = null;
let lockedSubjectHipY = null;
