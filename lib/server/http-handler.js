import "server-only";
// 框架無關的 HTTP 流程：存取控制 → Content-Type → 串流讀 body（上限）→ JSON → analyzeRequest。
// 只用標準 Web Request／Response API。不記錄請求內容；500 只 log 固定字串。
import { analyzeRequest } from "./analyze.js";
import { LIMITS } from "./validate-request.js";
import { checkAccess as defaultCheckAccess } from "./access-control.js";

// 值須與 next.config.mjs headers() 一致；其餘安全標頭於 Epic 2（2.1）加入
export const RESPONSE_HEADERS = { "Cache-Control": "no-store" };

// key 須與 ANALYZE_ERRORS 完全一致
export const ERROR_STATUS = {
  invalid_request: 400,
  payload_too_large: 413,
  insufficient_frames: 422,
};

const respond = (body, status, extraHeaders) =>
  Response.json(body, { status, headers: { ...RESPONSE_HEADERS, ...extraHeaders } });

const TOO_LARGE = Symbol("too_large");

// 邊讀邊計數；超過上限立即 cancel。Content-Length 只用來提早拒絕，不是唯一防線。
async function readLimitedText(request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.maxBodyBytes) return TOO_LARGE;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.maxBodyBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isJsonContentType(request) {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

export async function handleAnalyzeHttp(
  request,
  { analyze = analyzeRequest, checkAccess = defaultCheckAccess } = {},
) {
  try {
    const access = await checkAccess(request);
    if (!access.ok) {
      // 防呆：status 不是 400–599 的整數時視為實作錯誤，避免以 200 回錯誤
      if (!Number.isInteger(access.status) || access.status < 400 || access.status > 599) {
        throw new Error("invalid access result");
      }
      return respond({ error: access.error }, access.status, access.headers);
    }

    if (!isJsonContentType(request)) {
      return respond(
        { error: "invalid_request", details: ["Content-Type 須為 application/json"] },
        415,
      );
    }

    const text = await readLimitedText(request);
    if (text === TOO_LARGE) return respond({ error: "payload_too_large" }, 413);

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return respond({ error: "invalid_request", details: ["body 不是合法 JSON"] }, 400);
    }

    const out = analyze(body);
    if (out.ok) return respond(out.result, 200);

    const status = ERROR_STATUS[out.error];
    if (!status) return respond({ error: "internal_error" }, 500);
    // 白名單組裝回應，不整個轉送 analyze 的回傳物件
    if (out.error === "invalid_request") {
      return respond({ error: out.error, details: out.details }, status);
    }
    if (out.error === "insufficient_frames") {
      return respond({ error: out.error, acceptedFrames: out.acceptedFrames }, status);
    }
    return respond({ error: out.error }, status);
  } catch {
    console.error("analyze failed");
    return respond({ error: "internal_error" }, 500);
  }
}
