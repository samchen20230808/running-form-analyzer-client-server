import { handleAnalyzeHttp } from "../../../lib/server/http-handler.js";

// 若日後啟用 Cache Components（cacheComponents），須移除此 runtime export。
export const runtime = "nodejs";

// HTTP 流程在 lib/server/http-handler.js；存取控制接入點在 lib/server/access-control.js。
// 不記錄請求內容，錯誤不回傳 stack。
export async function POST(request) {
  return handleAnalyzeHttp(request);
}
