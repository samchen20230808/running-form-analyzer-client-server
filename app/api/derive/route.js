import { handleDeriveHttp } from "../../../lib/server/http-handler.js";

// 若日後啟用 Cache Components（cacheComponents），須移除此 runtime export。
export const runtime = "nodejs";
// 執行上限（秒）：純 CPU 解算，正常 < 1 s；上限防止異常輸入長時間佔用。部署平台讀取，本地 next start 不強制。
export const maxDuration = 10;

// HTTP 流程在 lib/server/http-handler.js；存取控制接入點在 lib/server/access-control.js。
export async function POST(request) {
  return handleDeriveHttp(request);
}
