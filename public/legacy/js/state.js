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

// 3.3：影片擷取上傳（POST /api/analyze）
const MAX_UPLOAD_FRAMES = 1500; // 約 3 MB，低於 Server 的 maxFrames／maxBodyBytes
const UPLOAD_TIMEOUT_MS = 30000;
let capturedLandmarkFrames = []; // 擷取期間每一幀的 sanitized landmarks（含被閘門拒絕的幀）
let captureStart = null; // 擷取開始時的方向／身高，Server 從同一起點重跑
let captureSeq = 0; // 換影片或重新擷取就遞增，用來丟棄過時回應
let isAnalyzingRemote = false;
