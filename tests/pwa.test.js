// Feature 5.2：PWA（manifest、圖示、service worker、註冊腳本、標頭、文件）。不需啟動 server，永遠執行。
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { APP_CONFIG } from "../lib/config.js";
import manifest from "../app/manifest.js";
import nextConfig from "../next.config.mjs";
import { computeShellHash, expectedPrecache } from "../scripts/sw-shell-lib.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const swSrc = read("public/sw.js");
const swConst = (name) => swSrc.match(new RegExp(`const ${name} = "([^"]*)";`))?.[1];
const PRECACHE = JSON.parse(swSrc.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);

describe("Q1 版號", () => {
  it("APP_VERSION 等於 APP_CONFIG.version，快取名稱含版號", () => {
    expect(swConst("APP_VERSION")).toBe(APP_CONFIG.version);
    expect(swSrc).toContain("`rfa-shell-${APP_VERSION}-${SHELL_HASH}`");
    expect(swSrc).toContain("`rfa-cdn-${APP_VERSION}`");
  });
});

describe("Q1b sw.js 的 fetch 只轉發傳入的 request", () => {
  it("每個 fetch( 呼叫的參數都是 request，且不含任何網址字串", () => {
    const calls = [...swSrc.matchAll(/\bfetch\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) expect(arg).toBe("request");
  });
});

describe("Q2 預快取清單", () => {
  it("與 index.html／public/modules 一致，檔案存在，不含 /api/", () => {
    expect(PRECACHE).toEqual(expectedPrecache());
    for (const u of PRECACHE) {
      expect(u.includes("/api/")).toBe(false);
      const p = u.split("?")[0];
      const file = p === "/icon.svg" ? "app/icon.svg" : `public${p}`;
      expect(existsSync(new URL(`../${file}`, import.meta.url))).toBe(true);
    }
  });
});

describe("Q3 殼層雜湊", () => {
  it("SHELL_HASH 等於依檔案內容重算的值", () => {
    expect(swConst("SHELL_HASH"), "殼層檔案已變更，請執行 npm run sync:sw").toBe(computeShellHash(PRECACHE));
  });
});

// 以 new Function 執行 sw.js（不用 node:vm），注入假的 self／caches／fetch／Request。
function loadSw() {
  const listeners = {};
  const store = new Map(); // cacheName -> Map(key -> response)
  const puts = [];
  const keyOf = (r) => (typeof r === "string" ? r : r.url);
  const open = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return Promise.resolve({
      match: (r) => {
        const k = keyOf(r);
        const hit = m.get(k) ?? m.get(new URL(k, "https://app.test").href);
        return Promise.resolve(hit);
      },
      put: (r, res) => {
        puts.push(keyOf(r));
        m.set(keyOf(r), res);
        return Promise.resolve();
      },
      addAll: (reqs) => {
        for (const r of reqs) {
          const u = new URL(r.url);
          m.set(u.pathname + u.search, { shell: r.url });
        }
        return Promise.resolve();
      },
    });
  };
  const caches = {
    open,
    keys: () => Promise.resolve([...store.keys()]),
    delete: (n) => Promise.resolve(store.delete(n)),
  };
  const claim = vi.fn(() => Promise.resolve());
  const skipWaiting = vi.fn();
  const self = {
    location: { origin: "https://app.test" },
    clients: { claim },
    skipWaiting,
    addEventListener: (t, fn) => (listeners[t] = fn),
  };
  const netFetch = vi.fn((req) =>
    Promise.resolve({
      ok: true,
      type: "basic",
      url: req.url,
      clone() {
        return this;
      },
    }),
  );
  const MockRequest = class {
    constructor(u, init) {
      this.url = new URL(u, "https://app.test").href;
      this.init = init;
    }
  };
  new Function("self", "caches", "fetch", "Request", swSrc)(self, caches, netFetch, MockRequest);
  const dispatch = (url, { method = "GET", mode = "cors", headers = {} } = {}) => {
    const request = { url, method, mode, headers: { get: (k) => headers[k] ?? null } };
    let result = null;
    const waits = [];
    listeners.fetch({ request, respondWith: (p) => (result = p), waitUntil: (p) => waits.push(p) });
    return { handled: result !== null, result, waits };
  };
  const run = async (type) => {
    const waits = [];
    listeners[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { listeners, store, puts, caches, claim, skipWaiting, netFetch, dispatch, run };
}

describe("Q4 fetch 行為", () => {
  it("/api 與非 GET 與其他來源不攔截", () => {
    const sw = loadSw();
    expect(sw.dispatch("https://app.test/api/analyze", { method: "POST" }).handled).toBe(false);
    expect(sw.dispatch("https://app.test/api/derive").handled).toBe(false);
    expect(sw.dispatch("https://app.test/index.html", { method: "POST" }).handled).toBe(false);
    expect(sw.dispatch("https://app.test/other/path").handled).toBe(false);
    expect(sw.dispatch("https://cdn.example.com/x.js").handled).toBe(false);
  });

  it("導覽回殼層 /index.html；殼層資源 cache-first", async () => {
    const sw = loadSw();
    await sw.run("install");
    const shellName = [...sw.store.keys()].find((n) => n.startsWith("rfa-shell-"));
    expect(shellName).toBe(`rfa-shell-${APP_CONFIG.version}-${swConst("SHELL_HASH")}`);
    for (const url of ["https://app.test/", "https://app.test/index.html?sw=1"]) {
      const r = sw.dispatch(url, { mode: "navigate" });
      expect(r.handled).toBe(true);
      expect((await r.result).shell).toBe("https://app.test/index.html");
    }
    const js = sw.dispatch("https://app.test/js/ui.js");
    expect(js.handled).toBe(true);
    expect((await js.result).shell).toBe("https://app.test/js/ui.js");
    expect(sw.netFetch).not.toHaveBeenCalled();
  });

  it("MediaPipe CDN 走 stale-while-revalidate 並寫入 CDN 快取，任何 put 都不含 /api/", async () => {
    const sw = loadSw();
    const url = "https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js";
    const first = sw.dispatch(url);
    expect(first.handled).toBe(true);
    await first.result;
    expect(sw.store.has(`rfa-cdn-${APP_CONFIG.version}`)).toBe(true);
    expect(sw.puts).toContain(url);
    const second = sw.dispatch(url); // 有快取先回，並背景更新
    await second.result;
    await Promise.all(second.waits);
    expect(second.waits.length).toBeGreaterThanOrEqual(1);
    expect(sw.netFetch).toHaveBeenCalledTimes(2);
    expect(sw.puts.every((u) => !u.includes("/api/"))).toBe(true);
  });
});

describe("Q5 更新與生命週期", () => {
  it("install 不 skipWaiting；SKIP_WAITING 訊息才呼叫", async () => {
    const sw = loadSw();
    await sw.run("install");
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    sw.listeners.message({ data: { type: "OTHER" } });
    sw.listeners.message({ data: null });
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    sw.listeners.message({ data: { type: "SKIP_WAITING" } });
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("activate 刪除舊 rfa- 快取、保留非 rfa- 與目前快取、呼叫 clients.claim", async () => {
    const sw = loadSw();
    const shell = `rfa-shell-${APP_CONFIG.version}-${swConst("SHELL_HASH")}`;
    const cdn = `rfa-cdn-${APP_CONFIG.version}`;
    for (const n of ["rfa-shell-V0.1-abc", "rfa-cdn-V0.1", "other-cache", shell, cdn]) await sw.caches.open(n);
    await sw.run("activate");
    expect((await sw.caches.keys()).sort()).toEqual([cdn, "other-cache", shell].sort());
    expect(sw.claim).toHaveBeenCalledTimes(1);
  });
});

describe("Q6 manifest 與圖示", () => {
  const m = manifest();
  it("基本欄位", () => {
    expect(m.start_url).toBe("/index.html");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.name).toBe(APP_CONFIG.systemName);
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
  const png = (p) => {
    const b = readFileSync(new URL(`../public${p}`, import.meta.url));
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  };
  it("圖示檔存在且尺寸相符", () => {
    for (const i of m.icons) expect(png(i.src)).toBe(i.sizes);
    expect(png("/icons/apple-touch-icon.png")).toBe("180x180");
  });
});

describe("Q7 標頭", () => {
  it("/sw.js 回 no-cache，且只多這一條規則", async () => {
    const rules = await nextConfig.headers();
    expect(rules.map((r) => r.source)).toEqual(["/api/:path*", "/sw.js"]);
    const sw = rules.find((r) => r.source === "/sw.js");
    expect(sw.headers.find((h) => h.key === "Cache-Control").value).toBe("no-cache");
  });
});

describe("Q8 頁面掛鉤", () => {
  const html = read("public/index.html");
  const count = (re) => (html.match(re) || []).length;
  it("head 標籤、toast 與腳本順序", () => {
    expect(count(/rel="manifest" href="\/manifest\.webmanifest"/g)).toBe(1);
    expect(count(/name="theme-color"/g)).toBe(1);
    expect(count(/rel="apple-touch-icon"/g)).toBe(1);
    expect(count(/js\/pwa\.js\?v=5\.2/g)).toBe(1);
    expect(html.indexOf("js/pwa.js?v=5.2")).toBeGreaterThan(html.indexOf("js/mobile-shell.js"));
    expect(count(/id="swUpdateToast"/g)).toBe(1);
    expect(html.match(/id="swUpdateToast"\s+class="([^"]*)"/)[1].split(/\s+/)).toContain("hidden");
  });
  it("pwa.js 只有 SW 能 skipWaiting", () => {
    const js = read("public/js/pwa.js");
    for (const s of ["updateViaCache", "SKIP_WAITING", "controllerchange"]) expect(js).toContain(s);
    expect(js).not.toContain("skipWaiting(");
  });
});

describe("Q9 隱私文件", () => {
  it("說明 Cache Storage 與 /api 回應不快取", () => {
    const doc = read("docs/privacy.md");
    expect(doc).toContain("Cache Storage");
    expect(doc).toContain("`/api` 回應不快取");
  });
});
