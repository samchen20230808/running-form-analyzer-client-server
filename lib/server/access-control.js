import "server-only";
// 存取控制單一接入點（方案 A）：Origin／Sec-Fetch-Site 檢查 → 每 IP 固定視窗限流。
// 其他檔案不得自行做存取判斷。只讀標頭，不讀 body；不記錄 IP 與標頭。
// 限流狀態只在本 instance 記憶體中，serverless 下僅盡力而為（見 docs/server-api.md）。

export const ACCESS_LIMITS = Object.freeze({
  windowMs: 60_000, // 限流視窗
  maxRequests: 30, // 每 IP 每視窗上限
  maxTrackedIps: 10_000, // 記憶體中最多追蹤的 IP 數
  maxIpLength: 45, // IPv6 文字表示最長 45 字元；超過視為無法辨識
});

const UNKNOWN_IP = "unknown";

/**
 * IP 取得：x-forwarded-for 第一段 → x-real-ip → "unknown"（共用桶）。
 * 只有 Vercel 為最外層時可信（Vercel 覆寫這兩個標頭）；本地 next start 的 XFF 可偽造。
 * @param {Request} request
 * @param {number} [maxIpLength]
 */
export function getClientIp(request, maxIpLength = ACCESS_LIMITS.maxIpLength) {
  const xff = request.headers.get("x-forwarded-for");
  let ip = xff === null ? "" : xff.split(",")[0].trim();
  if (!ip) ip = (request.headers.get("x-real-ip") ?? "").trim();
  if (!ip || ip.length > maxIpLength) return UNKNOWN_IP;
  return ip;
}

/**
 * Origin／Sec-Fetch-Site 檢查：true 放行、false 拒絕（403）。
 * 擋瀏覽器端跨站濫用；非瀏覽器 client（無這兩個標頭）放行，交給限流。
 * @param {Request} request
 */
export function checkOrigin(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    const v = site.trim().toLowerCase();
    return v === "same-origin" || v === "none";
  }
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  let expected = request.headers.get("host");
  if (!expected) {
    try {
      expected = new URL(request.url).host;
    } catch {
      return false;
    }
  }
  return parsed.host === expected.trim().toLowerCase();
}

/**
 * @param {{ now?: () => number, windowMs?: number, maxRequests?: number, maxTrackedIps?: number, maxIpLength?: number }} [options]
 */
export function createAccessControl({ now = Date.now, ...overrides } = {}) {
  const { windowMs, maxRequests, maxTrackedIps, maxIpLength } = { ...ACCESS_LIMITS, ...overrides };
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  const evict = (t) => {
    for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k);
    // 仍滿：依插入順序（= 視窗開始順序）刪最舊的
    for (const k of hits.keys()) {
      if (hits.size < maxTrackedIps) break;
      hits.delete(k);
    }
  };

  const hit = (ip, t) => {
    let entry = hits.get(ip);
    if (!entry || t >= entry.resetAt) {
      hits.delete(ip); // 先 delete 再 set，讓插入順序等於視窗開始順序
      if (hits.size >= maxTrackedIps) evict(t);
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    return entry;
  };

  return {
    /**
     * @param {Request} request
     * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, headers?: Record<string, string> }>}
     */
    async checkAccess(request) {
      // 先檢查 Origin、再計數：被拒的跨站請求不耗用受害者 IP 的額度
      if (!checkOrigin(request)) return { ok: false, status: 403, error: "forbidden" };
      const t = now();
      const entry = hit(getClientIp(request, maxIpLength), t);
      if (entry.count > maxRequests) {
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
        return {
          ok: false,
          status: 429,
          error: "rate_limited",
          headers: { "Retry-After": String(retryAfter) },
        };
      }
      return { ok: true };
    },
    trackedCount: () => hits.size,
    reset: () => hits.clear(),
  };
}

const defaultInstance = createAccessControl();
export const checkAccess = defaultInstance.checkAccess;
/** 只供測試：同一測試檔共用預設實例，POST 超過 30 次前須重置，否則會出現看似無關的 429 */
export const resetAccessControlState = defaultInstance.reset;
