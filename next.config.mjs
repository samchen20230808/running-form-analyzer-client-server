import { existsSync } from "node:fs";

// 部署防線（3.2–3.7 過渡期）：public/legacy/temp-core/ 含舊核心的公開副本，3.7 移除前不得部署。
// 3.7 刪除該目錄時，連同這段一併移除。
if (process.env.VERCEL && existsSync(new URL("./public/legacy/temp-core", import.meta.url))) {
  throw new Error("public/legacy/temp-core 仍存在：3.7 移除暫時核心前不得部署");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // 3.2 過渡期：/ 導向原樣搬入的舊 Client。React 化後移除。
  async redirects() {
    return [{ source: "/", destination: "/legacy/index.html", permanent: false }];
  },
  // /api 全部回應（含 Next 自動回的 405／OPTIONS）都帶這些標頭。
  // 值與順序須與 lib/server/http-handler.js 的 RESPONSE_HEADERS 一致，由 tests/api-analyze-route.test.js 比對。
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
