// 5.2 PWA：service worker 殼層清單與雜湊（純函式，CLI 與 tests/pwa.test.js 共用）。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

const normalize = (u) => (u.startsWith("/") ? u : `/${u}`);

// 殼層清單：index.html 引用的同源資源（含 query）＋ /index.html ＋ public/modules/**/*.js，排序。
export function expectedPrecache() {
  const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(?:[a-z]+:)?\/\//i.test(u) && !u.startsWith("#") && !u.startsWith("data:"))
    .filter((u) => u !== "/manifest.webmanifest" && !u.startsWith("/icons/"))
    .map(normalize);
  const modules = listFiles(join(ROOT, "public", "modules"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => "/" + relative(join(ROOT, "public"), f).split(sep).join("/"));
  return [...new Set(["/index.html", ...refs, ...modules])].sort();
}

// 去掉 query 後對應到原始檔案：/icon.svg 來自 app/icon.svg，其餘在 public/。
export function shellFile(url) {
  const path = url.split("?")[0];
  return path === "/icon.svg" ? join(ROOT, "app", "icon.svg") : join(ROOT, "public", ...path.split("/").filter(Boolean));
}

// 前 12 個 hex 的 sha256；只作版本識別，不作完整性驗證。
export function computeShellHash(list) {
  const h = createHash("sha256");
  for (const url of list) {
    h.update(`${url.split("?")[0]}\n`);
    h.update(readFileSync(shellFile(url), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 12);
}
