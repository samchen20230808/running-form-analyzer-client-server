import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    ".temp/**",
    "coverage/**",
    // 舊全域 script（3.2 原樣搬入，3.9 移到 public/ 根目錄）與同步副本；React 化時移除忽略
    "public/js/**",
    "public/modules/**",
  ]),
]);
