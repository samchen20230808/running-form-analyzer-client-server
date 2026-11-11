import "server-only";
// 存取控制單一接入點。Epic 2（2.1）在此實作 Origin／Sec-Fetch-Site 檢查與每 IP 限流；
// 其他檔案不得自行做存取判斷。1.3 為放行 stub。只可讀標頭，不得讀 body。
/**
 * @param {Request} _request
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, headers?: Record<string, string> }>}
 */
export async function checkAccess(_request) {
  return { ok: true };
}
