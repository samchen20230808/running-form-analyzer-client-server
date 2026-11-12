// 3.5：烘焙內建 profile 關鍵幀與模擬擷取 landmarks。npm run bake:profiles（含同步到 public/modules/）。
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBakedModules } from "./bake-profiles-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const [rel, text] of Object.entries(renderBakedModules())) {
  writeFileSync(join(ROOT, rel), text, "utf8");
  console.log(`bake:profiles 寫入 ${rel}（${Buffer.byteLength(text)} bytes）`);
}
