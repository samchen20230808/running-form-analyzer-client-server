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
    // 舊全域 script（3.2 原樣搬入）；3.3／React 化時移除忽略
    "public/legacy/**",
  ]),
]);
