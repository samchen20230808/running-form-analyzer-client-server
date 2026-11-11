// POST /api/analyze Route Handler 測試：不需要樣本，永遠執行。
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../app/api/analyze/route.js";
import * as routeModule from "../app/api/analyze/route.js";
import { ERROR_STATUS, handleAnalyzeHttp } from "../lib/server/http-handler.js";
import { checkAccess } from "../lib/server/access-control.js";
import { ANALYZE_ERRORS, analyzeRequest } from "../lib/server/analyze.js";
import { LIMITS } from "../lib/server/validate-request.js";

const URL_ = "http://localhost/api/analyze";
const JSON_H = { "Content-Type": "application/json" };
const lm33 = () => Array.from({ length: 33 }, () => [0.5, 0.5, 1]);
const frame = (t = 0) => ({ t, lm: lm33() });
const base = (over = {}) => ({
  frameWidth: 640,
  frameHeight: 480,
  frames: [frame(0), frame(0.03)],
  ...over,
});
const post = (body, headers = JSON_H) =>
  POST(
    new Request(URL_, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const streamReq = (stream, headers = JSON_H) =>
  new Request(URL_, { method: "POST", headers, body: stream, duplex: "half" });
const chunkStream = (chunkSize, totalBytes, stats = {}) => {
  let sent = 0;
  stats.pulls = 0;
  stats.cancelled = false;
  return new ReadableStream({
    pull(c) {
      stats.pulls++;
      const n = Math.min(chunkSize, totalBytes - sent);
      if (n <= 0) return c.close();
      sent += n;
      c.enqueue(new Uint8Array(n).fill(32));
    },
    cancel() {
      stats.cancelled = true;
    },
  });
};
const noLeak = (text) => {
  expect(text).not.toMatch(/stack|node_modules|lib[\\/]|\n\s+at /);
};
// 「不讀 body」的驗證：pull 在建構時就可能被呼叫，無法用計數；改以「讀了就丟錯 → 變 500」間接證明。
const throwingStream = () =>
  new ReadableStream({
    pull() {
      throw new Error("不應讀取");
    },
  });

afterEach(() => vi.restoreAllMocks());

describe("route 模組", () => {
  it("runtime 為 nodejs，export 只有 POST 與 runtime", () => {
    expect(runtime).toBe("nodejs");
    expect(Object.keys(routeModule).sort()).toEqual(["POST", "runtime"]);
  });
});

describe("Content-Type", () => {
  it.each([[{}], [{ "Content-Type": "text/plain" }], [{ "Content-Type": "text/plain; x=application/json" }]])(
    "%o → 415",
    async (h) => {
      const res = await post("{}", h);
      expect(res.status).toBe(415);
      expect(await res.json()).toStrictEqual({
        error: "invalid_request",
        details: ["Content-Type 須為 application/json"],
      });
    },
  );
  it.each(["application/json; charset=utf-8", "Application/JSON"])("%s 不是 415", async (ct) => {
    const res = await post("{}", { "Content-Type": ct });
    expect(res.status).toBe(400);
  });
});

describe("錯誤對應", () => {
  it.each([["{"], [""], ["﻿" + JSON.stringify(base())]])("非法 JSON %# → 400", async (b) => {
    const res = await post(b);
    expect(res.status).toBe(400);
    expect(await res.json()).toStrictEqual({ error: "invalid_request", details: ["body 不是合法 JSON"] });
  });

  it.each([["null"], ["[]"], ['"x"'], ["{}"]])("body %s → 400 invalid_request", async (b) => {
    const res = await post(b);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.details.length).toBeGreaterThan(0);
    expect(j.details.every((d) => typeof d === "string")).toBe(true);
    if (b === "null") expect(j.details).toContain("body 必須是 JSON 物件");
  });

  it.each([
    ["座標字串", base({ frames: [{ t: 0, lm: Array.from({ length: 33 }, () => ["a", 0.5, 1]) }] })],
    ["1e300", base({ frames: [{ t: 0, lm: Array.from({ length: 33 }, () => [1e300, 0.5, 1]) }] })],
    ["visibility 2", base({ frames: [{ t: 0, lm: Array.from({ length: 33 }, () => [0.5, 0.5, 2]) }] })],
    ["cameraMode", base({ cameraMode: "x" })],
  ])("%s → 400，details 與 analyzeRequest 相同", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.details).toStrictEqual(analyzeRequest(body).details);
  });

  it("3001 幀 → 413，沒有 details", async () => {
    const res = await post(base({ frames: Array.from({ length: 3001 }, () => frame()) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toStrictEqual({ error: "payload_too_large" });
  });

  it("5 幀 → 422 insufficient_frames", async () => {
    const body = base({ frames: Array.from({ length: 5 }, (_, i) => frame(i / 30)) });
    const res = await post(body);
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(Object.keys(j).sort()).toEqual(["acceptedFrames", "error"]);
    expect(j.error).toBe("insufficient_frames");
    expect(j.acceptedFrames).toBe(analyzeRequest(body).acceptedFrames);
    expect(j.acceptedFrames).toBeLessThan(8);
  });
});

describe("body 上限", () => {
  it("Content-Length 超過上限 → 413，且不讀 body", async () => {
    const res = await handleAnalyzeHttp({
      headers: new Headers({ ...JSON_H, "Content-Length": String(LIMITS.maxBodyBytes + 1) }),
      body: throwingStream(),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toStrictEqual({ error: "payload_too_large" });
  });

  it("無 Content-Length 的串流超過上限 → 413，讀到上限後停止並 cancel", async () => {
    const stats = {};
    const chunk = 64 * 1024;
    const res = await handleAnalyzeHttp(streamReq(chunkStream(chunk, LIMITS.maxBodyBytes * 4, stats)));
    expect(res.status).toBe(413);
    expect(stats.cancelled).toBe(true);
    // 上限加兩塊：ReadableStream 預設 highWaterMark 會多預讀一塊；總量是上限 4 倍，仍能分辨「有停止」
    expect(stats.pulls * chunk).toBeLessThanOrEqual(LIMITS.maxBodyBytes + 2 * chunk);
  });

  it("宣告 Content-Length 很小但實際超過上限 → 413", async () => {
    const stats = {};
    const res = await handleAnalyzeHttp({
      headers: new Headers({ ...JSON_H, "Content-Length": "10" }),
      body: chunkStream(64 * 1024, LIMITS.maxBodyBytes * 4, stats),
    });
    expect(res.status).toBe(413);
    expect(stats.cancelled).toBe(true);
  });

  it("恰好 maxBodyBytes 不是 413", async () => {
    const json = "{}";
    const body = json + " ".repeat(LIMITS.maxBodyBytes - json.length);
    expect(Buffer.byteLength(body)).toBe(LIMITS.maxBodyBytes);
    const res = await post(body);
    expect(res.status).not.toBe(413);
  });
});

describe("例外與資訊外洩", () => {
  const req = () => new Request(URL_, { method: "POST", headers: JSON_H, body: JSON.stringify(base()) });

  it("analyze 丟例外 → 500，不外洩，只 log 固定字串", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleAnalyzeHttp(req(), {
      analyze: () => {
        throw new Error("boom-secret");
      },
    });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toStrictEqual({ error: "internal_error" });
    expect(text).not.toMatch(/boom-secret|Error/);
    noLeak(text);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(["analyze failed"]);
  });

  it("未知錯誤類型 → 500", async () => {
    const res = await handleAnalyzeHttp(req(), { analyze: () => ({ ok: false, error: "weird" }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toStrictEqual({ error: "internal_error" });
  });

  it("串流中途出錯 → 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let first = true;
    const stream = new ReadableStream({
      pull(c) {
        if (first) {
          first = false;
          c.enqueue(new Uint8Array([32]));
        } else {
          c.error(new Error("x"));
        }
      },
    });
    const res = await handleAnalyzeHttp(streamReq(stream));
    expect(res.status).toBe(500);
    expect(await res.json()).toStrictEqual({ error: "internal_error" });
  });
});

describe("存取控制接入點", () => {
  it("拒絕結果的 status 不合法 → 500，不以 200 回錯誤", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleAnalyzeHttp(new Request(URL_, { method: "POST", headers: JSON_H, body: "{}" }), {
      checkAccess: async () => ({ ok: false, error: "x" }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toStrictEqual({ error: "internal_error" });
  });

  it("預設放行", async () => {
    expect(await checkAccess(new Request(URL_))).toStrictEqual({ ok: true });
  });

  it("被拒 → 帶標頭、不讀 body、不呼叫 analyze，且先於 Content-Type 檢查", async () => {
    const analyze = vi.fn();
    const res = await handleAnalyzeHttp(
      { headers: new Headers({ "Content-Type": "text/plain" }), body: throwingStream() },
      {
        analyze,
        checkAccess: async () => ({ ok: false, status: 403, error: "forbidden", headers: { "X-Test": "1" } }),
      },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toStrictEqual({ error: "forbidden" });
    expect(res.headers.get("X-Test")).toBe("1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe("回應標頭與對應表", () => {
  it("各狀態碼皆 no-store、JSON、無 CORS", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = Array.from({ length: 30 }, (_, i) => frame(i / 30));
    const responses = [
      await post(base({ frames: ok })),
      await post("{"),
      await post("{}", {}),
      await post(base({ frames: Array.from({ length: 3001 }, () => frame()) })),
      await post(base()),
      await handleAnalyzeHttp(new Request(URL_, { method: "POST", headers: JSON_H, body: "{}" }), {
        analyze: () => {
          throw new Error("x");
        },
      }),
    ];
    responses.push(
      await handleAnalyzeHttp(new Request(URL_, { method: "POST", headers: JSON_H, body: "{}" }), {
        checkAccess: async () => ({ ok: false, status: 403, error: "forbidden" }),
      }),
    );
    for (const r of responses) {
      noLeak(await r.clone().text());
      expect(r.headers.get("Cache-Control")).toBe("no-store");
      expect(r.headers.get("Content-Type")).toMatch(/^application\/json/);
      expect([...r.headers.keys()].some((k) => k.startsWith("access-control-"))).toBe(false);
    }
  });

  it("ERROR_STATUS 與 ANALYZE_ERRORS 一致", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ANALYZE_ERRORS].sort());
  });
});
