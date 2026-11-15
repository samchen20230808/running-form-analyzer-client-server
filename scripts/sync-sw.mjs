// 5.2 PWA：改寫 public/sw.js 的 SHELL_HASH（殼層檔案內容改了就要跑：npm run sync:sw）。
// PRECACHE 陣列與 index.html 不一致時只報差異並以非 0 結束，不自動改陣列。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, computeShellHash, expectedPrecache } from "./sw-shell-lib.mjs";

const swPath = join(ROOT, "public", "sw.js");
const src = readFileSync(swPath, "utf8");

const m = src.match(/const PRECACHE = (\[[\s\S]*?\]);/);
if (!m) {
  console.error("找不到 public/sw.js 的 PRECACHE 陣列");
  process.exit(1);
}
const actual = JSON.parse(m[1]);
const expected = expectedPrecache();
const missing = expected.filter((u) => !actual.includes(u));
const extra = actual.filter((u) => !expected.includes(u));
if (missing.length || extra.length) {
  console.error("PRECACHE 與 index.html／public/modules 不一致：");
  for (const u of missing) console.error(`  缺少 ${u}`);
  for (const u of extra) console.error(`  多餘 ${u}`);
  process.exit(1);
}

const hash = computeShellHash(actual);
const next = src.replace(/const SHELL_HASH = "[^"]*";/, `const SHELL_HASH = "${hash}";`);
if (next === src) console.log(`SHELL_HASH 未變：${hash}`);
else {
  writeFileSync(swPath, next);
  console.log(`SHELL_HASH 更新為 ${hash}`);
}
