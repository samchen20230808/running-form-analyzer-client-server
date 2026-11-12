// Feature 4.1：Vercel 設定、smoke 腳本與部署文件的一致性。不需啟動 server，永遠執行。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ArgError, parseArgs, runChecks } from "../scripts/smoke-test.mjs";
import { maxDuration as analyzeMax } from "../app/api/analyze/route.js";
import { maxDuration as deriveMax } from "../app/api/derive/route.js";
import nextConfig from "../next.config.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

describe("V1 vercel.json", () => {
  const cfg = JSON.parse(read("vercel.json"));
  it("只含 $schema 與 regions，區域為 hnd1", () => {
    expect(Object.keys(cfg).sort()).toEqual(["$schema", "regions"]);
    expect(cfg.regions).toEqual(["hnd1"]);
  });
  it("不含 functions／headers／redirects／rewrites／env／build", () => {
    for (const k of ["functions", "headers", "redirects", "rewrites", "env", "build", "buildCommand"]) {
      expect(cfg).not.toHaveProperty(k);
    }
  });
  it("Node 版本由 engines 決定", () => {
    expect(pkg.engines.node).toBe("24.x");
  });
});

describe("V2 部署文件", () => {
  const doc = read("docs/deployment.md");
  it("兩個 route 的 maxDuration 相同，且文件寫出該值與關鍵設定", () => {
    expect(analyzeMax).toBe(deriveMax);
    expect(doc).toContain("hnd1");
    expect(doc).toContain("24.x");
    expect(doc).toContain(`maxDuration ${analyzeMax} 秒`);
    expect(doc).toContain("4.5");
    expect(doc).toContain("npm run smoke");
    expect(doc).toContain("不需要任何環境變數");
  });
  it("不含 secret 樣式字串", () => {
    for (const bad of ["VERCEL_TOKEN", "sk_live", "sk_test", "Bearer ", "x-vercel-protection-bypass:"]) {
      expect(doc).not.toContain(bad);
    }
  });
});

describe("V3 smoke 腳本靜態檢查", () => {
  const src = read("scripts/smoke-test.mjs");
  it("不讀 env、不寫檔、不引入 lib/server", () => {
    expect(src).not.toContain("process.env");
    expect(src).not.toMatch(/writeFile|node:fs|appendFile/);
    expect(src).not.toContain("lib/server");
    const libImports = [...src.matchAll(/from "(\.\.\/lib\/[^"]+)"/g)].map((m) => m[1]);
    expect(libImports).toEqual(["../lib/profiles/sim-capture.js"]);
  });
  it("npm script 與依賴清單", () => {
    expect(pkg.scripts.smoke).toBe("node scripts/smoke-test.mjs");
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["next", "react", "react-dom"]);
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(["eslint", "eslint-config-next", "vitest"]);
  });
});

// ---- V4：以假 fetch 驗證 runChecks 判斷邏輯 ----
const SEC = Object.fromEntries(
  (await nextConfig.headers()).find((h) => h.source === "/api/:path*").headers.map((h) => [h.key, h.value]),
);
const kf = { frames: new Array(101).fill({}) };
const gct = { gctMs: 200 };
const jsonRes = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...SEC, ...headers } });
const okAnalyze = (headers = {}) =>
  jsonRes(200, { schemaVersion: "1.1.0", source: "server", cycleKeyframes: kf, metrics: { gct } }, headers);

/** 預期全過的假 server；overrides(path, init, ctx) 回傳非 undefined 時取代預設回應 */
function fakeFetch(overrides = () => undefined) {
  return async (url, init = {}) => {
    const path = new URL(url).pathname;
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers ?? {});
    const body = typeof init.body === "string" ? init.body : "";
    const o = overrides(path, init, { method, headers, body });
    if (o !== undefined) return o;
    if (path === "/") return new Response(null, { status: 307, headers: { Location: "/index.html" } });
    if (path === "/index.html") {
      return new Response("<html><title>x</title></html>", { headers: { "Content-Type": "text/html" } });
    }
    if (path.startsWith("/legacy/")) return new Response("", { status: 404 });
    if (path.endsWith(".js")) return new Response("", { headers: { "Content-Type": "application/javascript" } });
    if (path.endsWith(".css")) return new Response("", { headers: { "Content-Type": "text/css" } });
    if (path.startsWith("/api/")) {
      if (method === "GET") return new Response(null, { status: 405, headers: SEC });
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: { ...SEC, Allow: "OPTIONS, POST" } });
      if (headers.get("sec-fetch-site") === "cross-site" || headers.get("origin") === "https://example.invalid") {
        return jsonRes(403, { error: "forbidden" });
      }
      if (headers.get("content-type") === "text/plain") return jsonRes(415, { error: "invalid_request" });
      if (body.length > 4 * 1024 * 1024) return jsonRes(413, { error: "payload_too_large" });
      if (body === "{" || body.includes("unknownField")) return jsonRes(400, { error: "invalid_request" });
      return okAnalyze();
    }
    return new Response("", { status: 404 });
  };
}

const run = (fetchImpl, options = {}, baseUrl = "http://localhost:3000") => runChecks({ baseUrl, fetchImpl, options });
const status = (results, id) => results.filter((r) => r.id === id).map((r) => r.status);
const isA3 = (p, c) =>
  p === "/api/analyze" && c.method === "POST" && c.body.length > 1000 && c.body.length < 4e6 &&
  !c.headers.get("origin") && !c.headers.get("sec-fetch-site");

describe("V4 smoke runner", () => {
  it("全部符合預期 → 無 FAIL", async () => {
    const results = await run(fakeFetch());
    expect(results.filter((r) => r.status === "FAIL")).toEqual([]);
    const passIds = results.filter((r) => r.status === "PASS").map((r) => r.id);
    expect(passIds).toEqual(["P1", "P2", "P3", "P4", "P5", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"]);
    expect(status(results, "G1")).toEqual(["INFO"]);
  });
  it("A6 回 200 → FAIL", async () => {
    const r = await run(
      fakeFetch((p, init, c) => (c.headers.get("sec-fetch-site") === "cross-site" ? jsonRes(200, {}) : undefined)),
    );
    expect(status(r, "A6")).toEqual(["FAIL"]);
  });
  it("A12 回非 JSON 413 → FAIL；A13 回非 JSON 413 → PASS 並標示平台拒絕", async () => {
    const platform413 = (p, init, c) =>
      c.body.length > 4 * 1024 * 1024 ? new Response("Request Entity Too Large", { status: 413 }) : undefined;
    const r = await run(fakeFetch(platform413));
    expect(status(r, "A12")).toEqual(["FAIL"]);
    expect(status(r, "A13")).toEqual(["PASS"]);
    expect(r.find((x) => x.id === "A13").msg).toContain("平台拒絕");
  });
  it("A1 少一個安全標頭 → FAIL；A2 帶 CORS 標頭 → FAIL", async () => {
    const noCsp = (p, init, c) => {
      if (p !== "/api/analyze" || c.method !== "GET") return undefined;
      const rest = { ...SEC };
      delete rest["Content-Security-Policy"];
      return new Response(null, { status: 405, headers: rest });
    };
    expect(status(await run(fakeFetch(noCsp)), "A1")).toEqual(["FAIL"]);
    const cors = (p, init, c) =>
      c.method === "OPTIONS"
        ? new Response(null, { status: 204, headers: { ...SEC, Allow: "POST", "Access-Control-Allow-Origin": "*" } })
        : undefined;
    expect(status(await run(fakeFetch(cors)), "A2")).toEqual(["FAIL"]);
  });
  it("A3 遇到 429 → FAIL 並提示重跑", async () => {
    const limited = (p, init, c) =>
      isA3(p, c) ? jsonRes(429, { error: "rate_limited" }, { "Retry-After": "30" }) : undefined;
    const r = await run(fakeFetch(limited));
    expect(status(r, "A3")).toEqual(["FAIL"]);
    expect(r.find((x) => x.id === "A3").msg).toContain("Retry-After 30");
  });
  it("G1：--expect-region 比對 x-vercel-id", async () => {
    const withId = (id) => (p, init, c) => (isA3(p, c) ? okAnalyze({ "x-vercel-id": id }) : undefined);
    const base = "https://app.example.com";
    const g1 = async (id, opt) => status(await run(fakeFetch(withId(id)), opt, base), "G1");
    // 格式 <邊緣 PoP>::<Function 區域>::<id>：只比 Function 區域
    expect(await g1("hkg1::hnd1::abc-123", { expectRegion: "hnd1" })).toEqual(["PASS"]);
    expect(await g1("hnd1::iad1::abc-123", { expectRegion: "hnd1" })).toEqual(["FAIL"]);
    expect(await g1("hnd1::abc-123", { expectRegion: "hnd1" })).toEqual(["INFO"]);
    expect(await g1("hkg1::hnd1::abc-123", {})).toEqual(["INFO"]);
  });
  it("--rate-limit：429 後偽造 XFF 仍 200 → 本地 INFO、部署 FAIL", async () => {
    const make = () => {
      let n = 0;
      return (p, init, c) => {
        if (p !== "/api/derive" || c.method !== "POST" || !c.body.includes('"cadence":180}')) return undefined;
        if (c.headers.get("x-forwarded-for")) return jsonRes(200, {});
        n++;
        return n > 5 ? jsonRes(429, { error: "rate_limited" }, { "Retry-After": "30" }) : jsonRes(200, {});
      };
    };
    const local = await run(fakeFetch(make()), { rateLimit: true });
    expect(status(local, "R1")).toContain("PASS");
    expect(status(local, "R2")).toEqual(["INFO"]);
    const remote = await run(fakeFetch(make()), { rateLimit: true }, "https://app.example.com");
    expect(status(remote, "R2")).toEqual(["FAIL"]);
  });
  it("A13：fetch 丟網路錯誤 → INFO（非 FAIL）；逾時與非 413 仍 FAIL", async () => {
    const big = (p, init, c) => c.body.length > 4.5 * 1024 * 1024;
    const thrown = (err) => (p, init, c) => {
      if (big(p, init, c)) throw err;
      return undefined;
    };
    const reset = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
    const r1 = await run(fakeFetch(thrown(reset)));
    expect(status(r1, "A13")).toEqual(["PASS"]);
    expect(r1.find((x) => x.id === "A13").msg).toContain("ECONNRESET");
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    expect(status(await run(fakeFetch(thrown(timeout))), "A13")).toEqual(["FAIL"]);
    const ok200 = (p, init, c) => (big(p, init, c) ? jsonRes(200, {}) : undefined);
    expect(status(await run(fakeFetch(ok200)), "A13")).toEqual(["FAIL"]);
  });
  it("R1／R2 其餘分支", async () => {
    const derivePost = (p, c) => p === "/api/derive" && c.method === "POST" && c.body.includes('"cadence":180}');
    const never = (p, init, c) => (derivePost(p, c) ? jsonRes(200, {}) : undefined);
    expect(status(await run(fakeFetch(never), { rateLimit: true }), "R1")).toEqual(["FAIL"]); // 本地未觸發
    expect(status(await run(fakeFetch(never), { rateLimit: true }, "https://app.example.com"), "R1")).toEqual(["INFO"]);
    const badRa = (p, init, c) => (derivePost(p, c) ? jsonRes(429, {}, { "Retry-After": "abc" }) : undefined);
    expect(status(await run(fakeFetch(badRa), { rateLimit: true }), "R1")).toEqual(["FAIL"]);
    const forbidden = (p, init, c) => (derivePost(p, c) ? jsonRes(403, {}) : undefined);
    expect(status(await run(fakeFetch(forbidden), { rateLimit: true }, "https://app.example.com"), "R1")).toEqual(["FAIL"]);
    // 部署環境：429 之後，帶 XFF 的請求仍 429 → PASS；帶 XFF 回 200 但對照組也 200 → INFO（不誤報）；對照組 429 → FAIL
    const make = (xffStatus, ctlStatus) => {
      let n = 0;
      let afterXff = false;
      return (p, init, c) => {
        if (!derivePost(p, c)) return undefined;
        if (c.headers.get("x-forwarded-for")) {
          afterXff = true;
          return jsonRes(xffStatus, {}, { "Retry-After": "30" });
        }
        if (afterXff) return jsonRes(ctlStatus, {}, { "Retry-After": "30" });
        n++;
        return n > 3 ? jsonRes(429, {}, { "Retry-After": "30" }) : jsonRes(200, {});
      };
    };
    const base = "https://app.example.com";
    expect(status(await run(fakeFetch(make(429, 429)), { rateLimit: true }, base), "R2")).toEqual(["PASS"]);
    expect(status(await run(fakeFetch(make(200, 200)), { rateLimit: true }, base), "R2")).toEqual(["INFO"]);
    expect(status(await run(fakeFetch(make(200, 429)), { rateLimit: true }, base), "R2")).toEqual(["FAIL"]);
  });
  it("--timeout、--expect-region 參數驗證", () => {
    expect(() => parseArgs(["--timeout", "0"])).toThrow(ArgError);
    expect(() => parseArgs(["--timeout", "abc"])).toThrow(ArgError);
    expect(() => parseArgs(["--expect-region", ""])).toThrow(ArgError);
    expect(() => parseArgs(["--expect-region"])).toThrow(ArgError);
    expect(parseArgs(["--timeout", "500", "--expect-region", "hnd1"])).toMatchObject({ timeout: 500, expectRegion: "hnd1" });
  });
  it("--base-url 只接受 http(s)、不帶路徑", () => {
    expect(() => parseArgs(["--base-url", "ftp://x"])).toThrow(ArgError);
    expect(() => parseArgs(["--base-url", "https://x.com/foo"])).toThrow(ArgError);
    expect(() => parseArgs(["--base-url", "https://x.com/?a=1"])).toThrow(ArgError);
    expect(() => parseArgs(["--unknown"])).toThrow(ArgError);
    expect(parseArgs(["--base-url", "https://x.com/"]).baseUrl).toBe("https://x.com");
  });
});
