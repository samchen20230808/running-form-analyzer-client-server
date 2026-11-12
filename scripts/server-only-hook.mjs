// 只給 scripts 使用：讓純 node 能 import lib/core（其檔頭有 import "server-only"）。
// 用法：node --import ./scripts/server-only-hook.mjs scripts/bake-profiles.mjs
// 正式 build 由 Next 處理 server-only，不受影響。依賴 Node 24 的 module.registerHooks。
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
