// 3.4 橋接：把 lib/ 的瀏覽器共用模組複製到 public/modules/（保留相同目錄結構）。
// 手動執行：npm run sync:legacy。不掛在 build 上，漂移由 tests/browser-modules.test.js 偵測。
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "lib");
const DEST = join(ROOT, "public", "modules");
const MANAGED = ["player", "landmarks", "profiles"]; // 相對於 lib/

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

const errors = [];
const files = MANAGED.flatMap((d) => listFiles(join(LIB, d)));
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(LIB, file);
  if (/server-only|node:/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) {
    errors.push(`${rel}: 含 server-only 或 node: 相依`);
  }
  if (/\bimport\s*\(|(^|\n)\s*import\s*["']/.test(src)) errors.push(`${rel}: 不允許動態或 side-effect import`);
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g)) {
    const target = resolve(dirname(file), m[1]);
    const ok =
      m[1].startsWith(".") &&
      MANAGED.some((d) => target.startsWith(join(LIB, d) + sep)) &&
      existsSync(target);
    if (!ok) errors.push(`${rel}: 不允許的 import "${m[1]}"`);
  }
}
if (errors.length) {
  console.error("sync:legacy 中止：\n" + errors.join("\n"));
  process.exit(1);
}

for (const d of MANAGED) {
  rmSync(join(DEST, d), { recursive: true, force: true });
}
mkdirSync(DEST, { recursive: true });
for (const d of MANAGED) {
  cpSync(join(LIB, d), join(DEST, d), { recursive: true });
}
console.log(`sync:legacy 完成：${files.length} 個檔案 → public/modules/`);
