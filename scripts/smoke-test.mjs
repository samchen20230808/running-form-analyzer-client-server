// HTTP smoke test：對本地 `next start` 或已部署的網址跑同一套檢查（Feature 4.1）。
// 用法：node scripts/smoke-test.mjs [--base-url <URL>] [--rate-limit] [--expect-region <code>] [--timeout <ms>]
// 只用 Node 內建 fetch；不讀環境變數、不寫檔、不印 response body 全文。
// 預設檢查最多送 9 次會計入限流的 POST（上限 30 次／60 秒）；--rate-limit 會再用掉本機 IP 約 60 秒的額度。
import { pathToFileURL } from "node:url";
import { SIM_CAPTURE_REQUEST } from "../lib/profiles/sim-capture.js";
import nextConfig from "../next.config.mjs";

const SECURITY_HEADERS = (await nextConfig.headers())
  .find((h) => h.source === "/api/:path*")
  .headers.map((h) => [h.key, h.value]);

export class ArgError extends Error {}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { baseUrl: "http://localhost:3000", rateLimit: false, expectRegion: null, timeout: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new ArgError(`${a} 需要參數值`);
      return argv[++i];
    };
    if (a === "--base-url") opts.baseUrl = next();
    else if (a === "--rate-limit") opts.rateLimit = true;
    else if (a === "--expect-region") {
      opts.expectRegion = next();
      if (!opts.expectRegion) throw new ArgError("--expect-region 不可為空");
    }
    else if (a === "--timeout") {
      opts.timeout = Number(next());
      if (!Number.isInteger(opts.timeout) || opts.timeout < 1) throw new ArgError("--timeout 須為正整數（毫秒）");
    } else throw new ArgError(`未知參數：${a}`);
  }
  let url;
  try {
    url = new URL(opts.baseUrl);
  } catch {
    throw new ArgError(`--base-url 不是合法網址：${opts.baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ArgError("--base-url 只接受 http: 或 https:");
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new ArgError("--base-url 不可帶路徑、query 或 hash");
  }
  opts.baseUrl = url.origin;
  return opts;
}

const isLocalUrl = (baseUrl) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname);

const JSON_H = { "Content-Type": "application/json" };

function paddedBody(bytes) {
  return `{"pad":"${"x".repeat(bytes)}"}`;
}

/**
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch, options?: object, log?: (line: string) => void }} p
 * @returns {Promise<{ id: string, status: "PASS" | "FAIL" | "INFO", msg: string }[]>}
 */
export async function runChecks({ baseUrl, fetchImpl = fetch, options = {}, log = () => {} }) {
  const { rateLimit = false, expectRegion = null, timeout = 30000 } = options;
  const local = isLocalUrl(baseUrl);
  const results = [];
  const push = (id, status, msg) => {
    results.push({ id, status, msg });
    log(`${status.padEnd(4)} ${id.padEnd(4)} ${msg}`);
  };
  const call = (path, init = {}) =>
    fetchImpl(baseUrl + path, { redirect: "manual", signal: AbortSignal.timeout(timeout), ...init });
  const post = (path, body, headers = JSON_H) =>
    call(path, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const json = async (res) => {
    try {
      return JSON.parse(await res.text());
    } catch {
      return null;
    }
  };
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const expectStatus = (res, status) => expect(res.status === status, `狀態 ${res.status}，預期 ${status}`);
  const expectSecurityHeaders = (res) => {
    for (const [k, v] of SECURITY_HEADERS) {
      expect(res.headers.get(k) === v, `標頭 ${k} 為 ${JSON.stringify(res.headers.get(k))}，預期 ${JSON.stringify(v)}`);
    }
  };
  const expectNoCors = (res) => {
    for (const k of res.headers.keys()) expect(!k.toLowerCase().startsWith("access-control-"), `不應有 ${k} 標頭`);
  };
  const expect429Hint = (res) => {
    if (res.status === 429) {
      throw new Error(`429（Retry-After ${res.headers.get("retry-after")}）：額度剛被用完，等待後重跑`);
    }
  };

  let counted = 0; // 本次已送出、會計入限流的 POST 數（403 不計）
  const check = async (id, desc, fn) => {
    try {
      const note = await fn();
      push(id, "PASS", note ? `${desc}（${note}）` : desc);
    } catch (e) {
      push(id, "FAIL", `${desc}：${e?.name === "TimeoutError" ? "逾時" : (e?.message ?? e)}`);
    }
  };
  const info = (id, msg) => push(id, "INFO", msg);

  const analyzeBody = JSON.stringify(SIM_CAPTURE_REQUEST);
  let analyzeRes = null; // A3 的 response header，供 G1 使用
  let vercelId = null;

  await check("P1", "GET / → 307 /index.html", async () => {
    const res = await call("/");
    expectStatus(res, 307);
    const loc = res.headers.get("location") ?? "";
    expect(loc === "/index.html" || loc === `${baseUrl}/index.html`, `Location 為 ${loc}`);
  });
  await check("P2", "GET /index.html → 200 text/html、有 <title>、無 X-Powered-By", async () => {
    const res = await call("/index.html");
    expectStatus(res, 200);
    expect((res.headers.get("content-type") ?? "").includes("text/html"), "Content-Type 不是 text/html");
    expect(/<title>/i.test(await res.text()), "頁面沒有 <title>");
    expect(res.headers.get("x-powered-by") === null, "不應有 X-Powered-By");
  });
  await check("P3", "核心 script 200 且為 JavaScript", async () => {
    for (const p of ["/js/analyzer.js", "/js/derive.js", "/js/report.js", "/modules/bridge.js", "/modules/player/index.js"]) {
      const res = await call(p);
      expect(res.status === 200, `${p} 狀態 ${res.status}`);
      expect((res.headers.get("content-type") ?? "").includes("javascript"), `${p} Content-Type 為 ${res.headers.get("content-type")}`);
      await res.arrayBuffer();
    }
  });
  await check("P4", "GET /styles/main.css → 200 text/css", async () => {
    const res = await call("/styles/main.css");
    expectStatus(res, 200);
    expect((res.headers.get("content-type") ?? "").includes("text/css"), `Content-Type 為 ${res.headers.get("content-type")}`);
    await res.arrayBuffer();
  });
  await check("P5", "舊路徑 /legacy/index.html、/legacy/temp-core/biomechanics.js → 404", async () => {
    for (const p of ["/legacy/index.html", "/legacy/temp-core/biomechanics.js"]) {
      const res = await call(p);
      expect(res.status === 404, `${p} 狀態 ${res.status}`);
      await res.arrayBuffer();
    }
  });

  await check("A1", "GET /api/analyze、/api/derive → 405 且帶安全標頭", async () => {
    for (const p of ["/api/analyze", "/api/derive"]) {
      const res = await call(p);
      expect(res.status === 405, `${p} 狀態 ${res.status}`);
      expectSecurityHeaders(res);
      await res.arrayBuffer();
    }
  });
  await check("A2", "OPTIONS /api/analyze → 204、有 Allow、無 Access-Control-*", async () => {
    const res = await call("/api/analyze", { method: "OPTIONS" });
    expectStatus(res, 204);
    expect(res.headers.get("allow") !== null, "缺 Allow 標頭");
    expectNoCors(res);
  });

  await check("A3", "POST /api/analyze（合成 landmarks）→ 200 契約 1.1.0", async () => {
    counted++;
    const t = performance.now();
    const res = await post("/api/analyze", analyzeBody);
    const ms = Math.round(performance.now() - t);
    expect429Hint(res);
    expectStatus(res, 200);
    expectSecurityHeaders(res);
    expectNoCors(res);
    const b = await json(res);
    expect(b?.schemaVersion === "1.1.0", `schemaVersion 為 ${b?.schemaVersion}`);
    expect(b?.source === "server", `source 為 ${b?.source}`);
    expect(Array.isArray(b?.cycleKeyframes?.frames) && b.cycleKeyframes.frames.length === 101, "cycleKeyframes.frames 不是 101 幀");
    expect(b?.metrics?.gct && typeof b.metrics.gct === "object", "缺 metrics.gct");
    analyzeRes = res;
    vercelId = res.headers.get("x-vercel-id");
    return `${ms} ms`;
  });
  await check("A4", "同 A3 帶同源 Origin → 200", async () => {
    counted++;
    const res = await post("/api/analyze", analyzeBody, { ...JSON_H, Origin: baseUrl });
    expect429Hint(res);
    expectStatus(res, 200);
    await res.arrayBuffer();
  });
  await check("A5", "同 A3 帶 Sec-Fetch-Site: same-origin → 200", async () => {
    counted++;
    const res = await post("/api/analyze", analyzeBody, { ...JSON_H, "Sec-Fetch-Site": "same-origin" });
    expect429Hint(res);
    expectStatus(res, 200);
    await res.arrayBuffer();
  });
  await check("A6", "Sec-Fetch-Site: cross-site → 403 forbidden", async () => {
    const res = await post("/api/analyze", analyzeBody, { ...JSON_H, "Sec-Fetch-Site": "cross-site" });
    expectStatus(res, 403);
    expect((await json(res))?.error === "forbidden", "body 不是 { error: forbidden }");
  });
  await check("A7", "Origin: https://example.invalid → 403", async () => {
    const res = await post("/api/analyze", analyzeBody, { ...JSON_H, Origin: "https://example.invalid" });
    expectStatus(res, 403);
    await res.arrayBuffer();
  });
  await check("A8", "Content-Type: text/plain → 415", async () => {
    counted++;
    const res = await post("/api/analyze", "{}", { "Content-Type": "text/plain" });
    expect429Hint(res);
    expectStatus(res, 415);
    await res.arrayBuffer();
  });
  await check("A9", "body 不是合法 JSON → 400 invalid_request", async () => {
    counted++;
    const res = await post("/api/analyze", "{");
    expect429Hint(res);
    expectStatus(res, 400);
    expect((await json(res))?.error === "invalid_request", "body 不是 invalid_request");
  });
  await check("A10", "POST /api/derive（includeKeyframes）→ 200、101 幀、有 gct", async () => {
    counted++;
    const res = await post("/api/derive", { summary: {}, cadence: 180, includeKeyframes: true });
    expect429Hint(res);
    expectStatus(res, 200);
    const b = await json(res);
    expect(Array.isArray(b?.cycleKeyframes?.frames) && b.cycleKeyframes.frames.length === 101, "cycleKeyframes.frames 不是 101 幀");
    expect(b?.metrics?.gct && typeof b.metrics.gct === "object", "缺 metrics.gct");
  });
  await check("A11", "POST /api/derive 帶未知欄位 → 400", async () => {
    counted++;
    const res = await post("/api/derive", { summary: {}, cadence: 180, unknownField: 1 });
    expect429Hint(res);
    expectStatus(res, 400);
    await res.arrayBuffer();
  });
  await check("A12", "約 4.2 MB body → 本 API 回 413 payload_too_large", async () => {
    counted++;
    const res = await post("/api/analyze", paddedBody(4.2 * 1024 * 1024));
    expect429Hint(res);
    expectStatus(res, 413);
    expect((await json(res))?.error === "payload_too_large", "413 不是本 API 的 JSON（4.2 MB 在平台 4.5 MB 之內，應由本 API 回應）");
    expectSecurityHeaders(res);
  });
  await check("A13", "約 5 MB body → 413（本 API 或平台）", async () => {
    counted++;
    let res;
    try {
      res = await post("/api/analyze", paddedBody(5 * 1024 * 1024));
    } catch (e) {
      // 平台讀完 header 就回 413 並關閉連線時，fetch 可能在上傳中途丟網路錯誤，而不是回傳 response
      if (e?.name === "TimeoutError") throw e;
      return `連線在上傳中被中斷（${e?.cause?.code ?? e?.message}），推測為平台拒絕超大 body，請以瀏覽器或 curl 確認`;
    }
    expectStatus(res, 413);
    const b = await json(res);
    return b?.error === "payload_too_large" ? "本 API 拒絕（本地預期）" : "平台拒絕（Vercel 預期）";
  });

  // G1：區域
  if (analyzeRes === null) {
    info("G1", "A3 未成功，區域未檢查");
  } else if (vercelId === null) {
    info("G1", local ? "本地沒有 x-vercel-id，略過區域檢查" : "回應沒有 x-vercel-id，無法確認區域");
  } else if (expectRegion) {
    // 格式：<邊緣 PoP>::<Function 區域>::<id>；只比對中間的 Function 區域，避免邊緣 PoP 同名造成假 PASS
    const parts = vercelId.split("::");
    if (parts.length < 3) {
      info("G1", `x-vercel-id 為 ${vercelId}，格式不含 Function 區域，無法確認`);
    } else if (parts[parts.length - 2] === expectRegion) {
      push("G1", "PASS", `Function 區域為 ${expectRegion}（${vercelId}）`);
    } else {
      push("G1", "FAIL", `Function 區域為 ${parts[parts.length - 2]}，預期 ${expectRegion}（${vercelId}）`);
    }
  } else {
    info("G1", `x-vercel-id：${vercelId}（未指定 --expect-region）`);
  }

  if (rateLimit) {
    let triggered = 0;
    let retryAfter = null;
    for (let i = 1; i <= 40; i++) {
      let res;
      try {
        res = await post("/api/derive", { summary: {}, cadence: 180 });
      } catch (e) {
        push("R1", "FAIL", `連線失敗：${e?.message ?? e}`);
        return results;
      }
      counted++;
      await res.arrayBuffer();
      if (res.status !== 200 && res.status !== 429) {
        push("R1", "FAIL", `第 ${i} 次請求狀態 ${res.status}，預期 200 或 429`);
        return results;
      }
      if (res.status === 429) {
        triggered = i;
        retryAfter = res.headers.get("retry-after");
        break;
      }
    }
    if (triggered) {
      const ra = Number(retryAfter);
      if (Number.isInteger(ra) && ra >= 1 && ra <= 60) {
        info("R1", `第 ${triggered} 次 R1 請求觸發 429，Retry-After ${ra}（本次累計約 ${counted} 次；同 instance 理想值為累計 31）`);
        push("R1", "PASS", "429 並帶合理 Retry-After");
      } else {
        push("R1", "FAIL", `429 的 Retry-After 為 ${JSON.stringify(retryAfter)}，預期 1–60 的整數`);
      }
      const xff = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;
      try {
        const res = await post("/api/derive", { summary: {}, cadence: 180 }, { ...JSON_H, "X-Forwarded-For": xff });
        await res.arrayBuffer();
        if (local) {
          info("R2", `本地 X-Forwarded-For 可偽造（狀態 ${res.status}），符合文件`);
        } else if (res.status === 429) {
          push("R2", "PASS", "偽造 X-Forwarded-For 仍被限流（平台覆寫 XFF）");
        } else {
          // 對照組：不帶 XFF 再送一次。仍 429 → 偽造確實繞過了限流；也是 200 → 多半是換了 instance 或視窗剛重置
          const ctl = await post("/api/derive", { summary: {}, cadence: 180 });
          await ctl.arrayBuffer();
          if (ctl.status === 429) {
            push("R2", "FAIL", `偽造 X-Forwarded-For 後狀態 ${res.status}、不帶 XFF 的對照仍 429：IP 可偽造，限流可被繞過，須回報`);
          } else {
            info("R2", `偽造 XFF 回 ${res.status}，但對照組也是 ${ctl.status}：可能換了 instance 或視窗已重置，無法判斷，請重跑確認`);
          }
        }
      } catch (e) {
        push("R2", "FAIL", `連線失敗：${e?.message ?? e}`);
      }
    } else if (local) {
      push("R1", "FAIL", "本地連續 40 次都沒有 429");
    } else {
      info("R1", "部署環境連續 40 次未觸發 429（可能分散在多個 instance，限流僅盡力而為）");
    }
  }
  return results;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`參數錯誤：${e.message}`);
    console.error("用法：node scripts/smoke-test.mjs [--base-url <URL>] [--rate-limit] [--expect-region <code>] [--timeout <ms>]");
    process.exit(2);
  }
  console.log(`Smoke test：${opts.baseUrl}${isLocalUrl(opts.baseUrl) ? "（本地）" : ""}`);
  if (opts.rateLimit) console.log("警告：--rate-limit 會用掉本機 IP 約 60 秒的 API 額度。");
  const results = await runChecks({ baseUrl: opts.baseUrl, options: opts, log: console.log });
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n結果：PASS ${n("PASS")}、FAIL ${n("FAIL")}、INFO ${n("INFO")}`);
  process.exit(n("FAIL") > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
