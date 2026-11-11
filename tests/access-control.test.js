// 存取控制單元測試（假時鐘）：不需要樣本，永遠執行。
import { describe, expect, it } from "vitest";
import {
  ACCESS_LIMITS,
  checkAccess,
  checkOrigin,
  createAccessControl,
  getClientIp,
  resetAccessControlState,
} from "../lib/server/access-control.js";

const URL_ = "http://localhost/api/analyze";
const req = (headers = {}, url = URL_) => new Request(url, { method: "POST", headers });
const ipReq = (ip) => req(ip ? { "x-forwarded-for": ip } : {});

describe("checkOrigin", () => {
  it.each([
    [{}, URL_, true],
    [{ "Sec-Fetch-Site": "same-origin" }, URL_, true],
    [{ "Sec-Fetch-Site": " SAME-ORIGIN " }, URL_, true],
    [{ "Sec-Fetch-Site": "none" }, URL_, true],
    [{ "Sec-Fetch-Site": "same-site" }, URL_, false],
    [{ "Sec-Fetch-Site": "cross-site" }, URL_, false],
    [{ "Sec-Fetch-Site": "" }, URL_, false],
    [{ "Sec-Fetch-Site": "weird" }, URL_, false],
    [{ "Sec-Fetch-Site": "same-origin", Origin: "https://evil.example" }, URL_, true],
    [{ "Sec-Fetch-Site": "cross-site", Origin: "http://localhost" }, URL_, false],
    [{ Origin: "http://localhost" }, URL_, true],
    [{ Origin: "http://LOCALHOST" }, URL_, true],
    [{ Origin: "http://localhost:3000" }, "http://localhost:3000/api/analyze", true],
    [{ Origin: "http://localhost:3001" }, "http://localhost:3000/api/analyze", false],
    [{ Origin: "https://localhost" }, URL_, true],
    [{ Origin: "https://evil.example" }, URL_, false],
    [{ Origin: "null" }, URL_, false],
    [{ Origin: "not a url" }, URL_, false],
    [{ Origin: "ftp://localhost" }, URL_, false],
    [{ Host: "app.example.com", Origin: "https://app.example.com" }, URL_, true],
    [{ Host: "app.example.com", Origin: "http://localhost" }, URL_, false],
  ])("%j (%s) → %s", (headers, url, expected) => {
    // undici 的 Request 若過濾受限標頭則改傳自訂物件
    const r = { headers: new Headers(headers), url };
    expect(checkOrigin(r)).toBe(expected);
  });
});

describe("getClientIp", () => {
  const h = (headers) => ({ headers: new Headers(headers) });
  it("XFF 第一段", () => {
    expect(getClientIp(h({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
    expect(getClientIp(h({ "x-forwarded-for": " 203.0.113.5 , 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("x-real-ip 後備，兩者皆有取 XFF", () => {
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(h({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.5" }))).toBe(
      "203.0.113.5",
    );
  });
  it("空值、無標頭 → unknown", () => {
    expect(getClientIp(h({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(getClientIp(h({ "x-forwarded-for": " , 10.0.0.1" }))).toBe("unknown");
    expect(getClientIp(h({}))).toBe("unknown");
  });
  it("長度上限 45", () => {
    expect(getClientIp(h({ "x-forwarded-for": "a".repeat(46) }))).toBe("unknown");
    const v6 = "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255";
    expect(v6.length).toBe(45);
    expect(getClientIp(h({ "x-forwarded-for": v6 }))).toBe(v6);
  });
});

describe("限流", () => {
  const make = (opts) => {
    const clock = { t: 1_000_000 };
    return { clock, ac: createAccessControl({ now: () => clock.t, ...opts }) };
  };

  it("第 31 次起 429，Retry-After 與視窗重置", async () => {
    const { clock, ac } = make();
    for (let i = 0; i < 30; i++) expect(await ac.checkAccess(ipReq("1.1.1.1"))).toStrictEqual({ ok: true });
    expect(await ac.checkAccess(ipReq("1.1.1.1"))).toStrictEqual({
      ok: false,
      status: 429,
      error: "rate_limited",
      headers: { "Retry-After": "60" },
    });
    clock.t += 59_001;
    const late = await ac.checkAccess(ipReq("1.1.1.1"));
    expect(late.status).toBe(429);
    expect(late.headers["Retry-After"]).toBe("1");
    clock.t += 999; // 距開窗恰好 60_000
    expect(await ac.checkAccess(ipReq("1.1.1.1"))).toStrictEqual({ ok: true });
  });

  it("Retry-After 取 ceil，永遠為 1–60 的整數", async () => {
    const { clock, ac } = make();
    for (let i = 0; i < 30; i++) await ac.checkAccess(ipReq("1.1.1.1"));
    clock.t += 500;
    const r = await ac.checkAccess(ipReq("1.1.1.1"));
    expect(r.headers["Retry-After"]).toBe("60");
    expect(r.headers["Retry-After"]).toMatch(/^[1-9]\d*$/);
    expect(Number(r.headers["Retry-After"])).toBeLessThanOrEqual(60);
  });

  it("不同 IP 互不影響；無 IP 標頭共用 unknown 桶", async () => {
    const { ac } = make();
    for (let i = 0; i < 31; i++) await ac.checkAccess(ipReq("1.1.1.1"));
    expect((await ac.checkAccess(ipReq("2.2.2.2"))).ok).toBe(true);
    for (let i = 0; i < 30; i++) expect((await ac.checkAccess(ipReq())).ok).toBe(true);
    expect((await ac.checkAccess(ipReq())).status).toBe(429);
  });

  it("跨站請求不計數，且先於限流判斷", async () => {
    const { ac } = make();
    const cross = () => req({ "Sec-Fetch-Site": "cross-site", "x-forwarded-for": "1.1.1.1" });
    for (let i = 0; i < 100; i++)
      expect(await ac.checkAccess(cross())).toStrictEqual({ ok: false, status: 403, error: "forbidden" });
    for (let i = 0; i < 30; i++) expect((await ac.checkAccess(ipReq("1.1.1.1"))).ok).toBe(true);
    expect((await ac.checkAccess(ipReq("1.1.1.1"))).status).toBe(429);
    expect((await ac.checkAccess(cross())).status).toBe(403);
  });

  it("可覆寫參數，未給的欄位用 ACCESS_LIMITS", async () => {
    const { ac } = make({ maxRequests: 2, windowMs: 1000 });
    expect((await ac.checkAccess(ipReq("1.1.1.1"))).ok).toBe(true);
    expect((await ac.checkAccess(ipReq("1.1.1.1"))).ok).toBe(true);
    expect((await ac.checkAccess(ipReq("1.1.1.1"))).status).toBe(429);
  });
});

describe("記憶體清理", () => {
  const make = (opts) => {
    const clock = { t: 1_000_000 };
    return { clock, ac: createAccessControl({ now: () => clock.t, maxTrackedIps: 3, ...opts }) };
  };

  it("不超過 maxTrackedIps", async () => {
    const { ac } = make();
    for (const ip of ["a", "b", "c"]) await ac.checkAccess(ipReq(ip));
    expect((await ac.checkAccess(ipReq("d"))).ok).toBe(true);
    expect(ac.trackedCount()).toBeLessThanOrEqual(3);
  });

  it("先清過期筆", async () => {
    const { clock, ac } = make();
    for (const ip of ["a", "b", "c"]) await ac.checkAccess(ipReq(ip));
    clock.t += ACCESS_LIMITS.windowMs;
    await ac.checkAccess(ipReq("d"));
    expect(ac.trackedCount()).toBe(1);
  });

  it("未到期且滿時擠掉最早開窗者，其他計數保留", async () => {
    const { clock, ac } = make({ maxRequests: 1 });
    await ac.checkAccess(ipReq("a"));
    clock.t += 1;
    await ac.checkAccess(ipReq("b"));
    expect((await ac.checkAccess(ipReq("b"))).status).toBe(429);
    clock.t += 1;
    await ac.checkAccess(ipReq("c"));
    await ac.checkAccess(ipReq("d")); // 滿 → 擠掉 a（最早開窗）
    expect(ac.trackedCount()).toBe(3);
    expect((await ac.checkAccess(ipReq("a"))).ok).toBe(true); // a 從 1 重新計數（擠掉 b）
    expect((await ac.checkAccess(ipReq("c"))).status).toBe(429); // c 的計數保留
    expect((await ac.checkAccess(ipReq("d"))).status).toBe(429); // d 的計數保留
  });

  it("重開窗者的插入順序移到最後", async () => {
    const { clock, ac } = make({ maxRequests: 1 });
    const t0 = clock.t;
    await ac.checkAccess(ipReq("a"));
    clock.t = t0 + 10;
    await ac.checkAccess(ipReq("b"));
    clock.t = t0 + 20;
    await ac.checkAccess(ipReq("c"));
    clock.t = t0 + ACCESS_LIMITS.windowMs + 5; // a 到期；b、c 未到期
    expect((await ac.checkAccess(ipReq("a"))).ok).toBe(true); // a 重開窗，移到最後
    await ac.checkAccess(ipReq("d")); // 滿 → 擠掉 b，不是 a
    expect((await ac.checkAccess(ipReq("a"))).status).toBe(429); // a 的計數保留
    expect((await ac.checkAccess(ipReq("b"))).ok).toBe(true); // b 被擠掉，重新計數
  });

  it("reset 清空並恢復被限的 IP", async () => {
    const { ac } = make({ maxRequests: 1 });
    await ac.checkAccess(ipReq("a"));
    expect((await ac.checkAccess(ipReq("a"))).status).toBe(429);
    ac.reset();
    expect(ac.trackedCount()).toBe(0);
    expect((await ac.checkAccess(ipReq("a"))).ok).toBe(true);
  });
});

describe("介面", () => {
  it("ACCESS_LIMITS 凍結且值正確", () => {
    expect(Object.isFrozen(ACCESS_LIMITS)).toBe(true);
    expect(ACCESS_LIMITS).toStrictEqual({
      windowMs: 60000,
      maxRequests: 30,
      maxTrackedIps: 10000,
      maxIpLength: 45,
    });
  });

  it("預設 checkAccess 對無標頭請求放行；resetAccessControlState 是函式", async () => {
    resetAccessControlState();
    expect(await checkAccess(new Request(URL_))).toStrictEqual({ ok: true });
    expect(resetAccessControlState).toBeTypeOf("function");
    resetAccessControlState();
  });

  it("不讀 body：放行、403、429 都不丟錯", async () => {
    const ac = createAccessControl({ maxRequests: 1 });
    const mk = (headers) =>
      new Request(URL_, {
        method: "POST",
        headers,
        duplex: "half",
        body: new ReadableStream({
          pull() {
            throw new Error("body 被讀取");
          },
        }),
      });
    expect((await ac.checkAccess(mk({ "x-forwarded-for": "1.1.1.1" }))).ok).toBe(true);
    expect((await ac.checkAccess(mk({ "x-forwarded-for": "1.1.1.1" }))).status).toBe(429);
    expect((await ac.checkAccess(mk({ "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
  });

  it("拒絕結果只有 403／429，headers 只在 429 且只含 Retry-After", async () => {
    const ac = createAccessControl({ maxRequests: 1 });
    await ac.checkAccess(ipReq("1.1.1.1"));
    const limited = await ac.checkAccess(ipReq("1.1.1.1"));
    const forbidden = await ac.checkAccess(req({ "Sec-Fetch-Site": "cross-site" }));
    expect(Object.keys(limited.headers)).toEqual(["Retry-After"]);
    expect(forbidden).not.toHaveProperty("headers");
    expect([limited.status, forbidden.status]).toEqual([429, 403]);
  });
});
