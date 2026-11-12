// 隱私文件與程式的一致性（Feature 2.2）：改了程式卻忘了文件時會失敗。
// 斷言刻意粗糙（字串包含），不驗證文案。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../lib/config.js";
import { ACCESS_LIMITS } from "../lib/server/access-control.js";
import { RESPONSE_HEADERS } from "../lib/server/http-handler.js";
import { analyzeRequest } from "../lib/server/analyze.js";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const stripComments = (src) =>
  src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

function listJs(dir) {
  const out = [];
  for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...listJs(`${p}/`));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const sources = [...listJs("app/"), ...listJs("lib/")].map((p) => [p, stripComments(read(p))]);

describe("程式側", () => {
  it("console. 只出現一次：http-handler 的 console.error(\"analyze failed\")", () => {
    const hits = sources.filter(([, code]) => code.includes("console."));
    expect(hits.map(([p]) => p)).toEqual(["lib/server/http-handler.js"]);
    const code = hits[0][1];
    expect(code.match(/console\./g)).toHaveLength(1);
    expect(code).toContain("console.error(FAIL_LOG[kind])");
    expect(code).toContain('"analyze failed"');
    expect(code).toContain('"derive failed"');
  });

  it("public/ 不含 /api/derive（3.6 Client 不呼叫；3.7 移除此斷言）", () => {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
        const p = `${dir}${e.name}`;
        if (e.isDirectory()) walk(`${p}/`);
        else if (/\.(js|mjs|html|css|json)$/.test(e.name)) files.push(p);
      }
    };
    walk("public/");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(read(f), f).not.toContain("/api/derive");
  });

  it("不讀 env、不寫檔、不對外連線、不用 cookie 或瀏覽器儲存", () => {
    const banned = [
      /process\.env/,
      /node:(fs|http|https|net)/,
      /from\s+["'](fs|http|https|net)(\/|["'])/,
      /require\s*\(/,
      /writeFile|appendFile|createWriteStream/,
      /\bfetch\s*\(/,
      /cookie/i,
      /localStorage|sessionStorage|indexedDB/,
      /process\.std(out|err)/,
    ];
    for (const [p, code] of sources) {
      for (const b of banned) expect(b.test(code), `${p} 含 ${b}`).toBe(false);
    }
  });

  const SAMPLE = new URL(".temp/json/landmarks-woman03.json", ROOT);
  const required = process.env.REQUIRE_BASELINE === "1";
  it.skipIf(!existsSync(SAMPLE) && !required)("回應不含原始 landmarks", () => {
    expect(existsSync(SAMPLE)).toBe(true);
    const res = analyzeRequest(JSON.parse(readFileSync(SAMPLE, "utf8")));
    expect(res.ok).toBe(true);
    const keys = Object.keys(res.result);
    expect(keys).not.toContain("frames");
    expect(keys).not.toContain("lm");
    expect(JSON.stringify(res.result)).not.toContain('"lm":');
  });
});

describe("文件側", () => {
  const privacy = read("docs/privacy.md");
  const api = read("docs/server-api.md");

  it("文件含 ACCESS_LIMITS 數值", () => {
    const needles = [
      `${ACCESS_LIMITS.windowMs / 1000} 秒`,
      `${ACCESS_LIMITS.maxRequests} 次`,
      ACCESS_LIMITS.maxTrackedIps.toLocaleString("en-US"),
    ];
    for (const n of needles) {
      expect(privacy, `privacy.md 缺 ${n}`).toContain(n);
      expect(api, `server-api.md 缺 ${n}`).toContain(n);
    }
  });

  it("server-api.md 含每個 RESPONSE_HEADERS", () => {
    for (const [k, v] of Object.entries(RESPONSE_HEADERS)) {
      expect(api).toContain(`\`${k}: ${v}\``);
    }
  });

  it("不含錯誤描述「即丟棄」", () => {
    expect(privacy).not.toContain("即丟棄");
    expect(api).not.toContain("即丟棄");
  });

  it("privacy.md 記載 analyze failed／derive failed／/api/derive", () => {
    expect(privacy).toContain("analyze failed");
    expect(privacy).toContain("derive failed");
    expect(privacy).toContain("/api/derive");
    expect(api).toContain("/api/derive");
    expect(api).toContain("16 KB");
  });

  it("README 版本與連結", () => {
    const readme = read("README.md");
    expect(readme).toContain(APP_CONFIG.version);
    expect(readme).toContain("](docs/privacy.md");
    expect(readme).toContain("](docs/server-api.md");
  });

  it("server-api.md 連到 privacy.md", () => {
    expect(api).toContain("](privacy.md");
  });
});
