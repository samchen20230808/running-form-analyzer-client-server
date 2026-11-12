// POST /api/derive Route Handler 測試：不需要樣本，永遠執行。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../app/api/derive/route.js";
import * as routeModule from "../app/api/derive/route.js";
import { POST as ANALYZE_POST } from "../app/api/analyze/route.js";
import { DERIVE_ERROR_STATUS, RESPONSE_HEADERS, handleDeriveHttp } from "../lib/server/http-handler.js";
import { resetAccessControlState } from "../lib/server/access-control.js";
import { DERIVE_ERRORS, deriveRequest } from "../lib/server/derive.js";
import { DERIVE_LIMITS } from "../lib/server/validate-derive-request.js";

beforeEach(() => resetAccessControlState());
afterEach(() => vi.restoreAllMocks());

const URL_ = "http://localhost/api/derive";
const JSON_H = { "Content-Type": "application/json" };
const SAME = { ...JSON_H, "Sec-Fetch-Site": "same-origin" };
const valid = () => ({ summary: { trunkAngle: 9.8, avgElbow: 125, hipRomDeg: 62 }, cadence: 103 });
const post = (body, headers = JSON_H) =>
  POST(
    new Request(URL_, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("H1 route 模組", () => {
  it("runtime 為 nodejs，export 只有 POST 與 runtime", () => {
    expect(runtime).toBe("nodejs");
    expect(Object.keys(routeModule).sort()).toEqual(["POST", "runtime"]);
  });
});

describe("H2 200", () => {
  it("同源合法請求", async () => {
    const res = await post(valid(), SAME);
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual(JSON.parse(JSON.stringify(deriveRequest(valid()).result)));
    for (const [k, v] of Object.entries(RESPONSE_HEADERS)) expect(res.headers.get(k)).toBe(v);
    expect([...res.headers.keys()].some((k) => k.startsWith("access-control-"))).toBe(false);
  });
});

describe("H3 Content-Type", () => {
  it.each([[{}], [{ "Content-Type": "text/plain" }], [{ "Content-Type": "text/plain; x=application/json" }]])(
    "%o → 415",
    async (h) => {
      expect((await post("{}", h)).status).toBe(415);
    },
  );
  it("charset 不是 415", async () => {
    const res = await post(valid(), { "Content-Type": "application/json; charset=utf-8" });
    expect(res.status).toBe(200);
  });
});

describe("H4 400", () => {
  it.each([["{bad"], [""], ["﻿{}"], ["null"], ["[]"], ['"x"'], ["{}"], [JSON.stringify({ cadence: 180 })]])(
    "%s → 400",
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("invalid_request");
      expect(Array.isArray(json.details)).toBe(true);
    },
  );
});

describe("H5 413", () => {
  it("Content-Length 超過上限", async () => {
    const res = await post("{}", { ...JSON_H, "Content-Length": String(DERIVE_LIMITS.maxBodyBytes + 1) });
    expect(res.status).toBe(413);
    expect(await res.json()).toStrictEqual({ error: "payload_too_large" });
  });
  it("實際內容超過 16 KB", async () => {
    const res = await post(" ".repeat(DERIVE_LIMITS.maxBodyBytes + 1));
    expect(res.status).toBe(413);
  });
  it("恰好 16 KB 不是 413", async () => {
    const body = JSON.stringify(valid());
    const res = await post(body + " ".repeat(DERIVE_LIMITS.maxBodyBytes - body.length));
    expect(res.status).toBe(200);
  });
});

describe("H6 403", () => {
  it("跨源不呼叫 derive", async () => {
    const derive = vi.fn();
    const res = await handleDeriveHttp(
      new Request(URL_, {
        method: "POST",
        headers: { ...JSON_H, "Sec-Fetch-Site": "cross-site" },
        body: JSON.stringify(valid()),
      }),
      { derive },
    );
    expect(res.status).toBe(403);
    expect(derive).not.toHaveBeenCalled();
  });
});

describe("H7 429 與共用計數", () => {
  it("analyze 與 derive 合計 30 次，第 31 次 429", async () => {
    const h = { ...SAME, "x-forwarded-for": "9.9.9.9" };
    for (let i = 0; i < 15; i++) {
      const a = await ANALYZE_POST(new Request("http://localhost/api/analyze", { method: "POST", headers: h, body: "{}" }));
      expect(a.status).not.toBe(429);
      expect((await post(valid(), h)).status).toBe(200);
    }
    const res = await post(valid(), h);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});

describe("H8 500", () => {
  it("例外 → 500，只 log 固定字串", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleDeriveHttp(
      new Request(URL_, { method: "POST", headers: JSON_H, body: JSON.stringify(valid()) }),
      {
        derive: () => {
          throw new Error("secret stack");
        },
      },
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toStrictEqual({ error: "internal_error" });
    expect(text).not.toMatch(/secret|stack/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("derive failed");
  });
  it("未知錯誤類型 → 500", async () => {
    const res = await handleDeriveHttp(
      new Request(URL_, { method: "POST", headers: JSON_H, body: JSON.stringify(valid()) }),
      { derive: () => ({ ok: false, error: "weird" }) },
    );
    expect(res.status).toBe(500);
  });
});

describe("H9 錯誤對應表", () => {
  it("key 與 DERIVE_ERRORS 一致", () => {
    expect(Object.keys(DERIVE_ERROR_STATUS).sort()).toEqual([...DERIVE_ERRORS].sort());
  });
});
