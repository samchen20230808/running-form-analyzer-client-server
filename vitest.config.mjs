import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Vitest 不經過 Next 的 bundler，server-only 無法 resolve，改指向空模組
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
