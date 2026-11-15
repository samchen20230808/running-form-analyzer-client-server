/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // 過渡期：/ 導向舊 Client（3.9 起檔案在 public/ 根目錄）。React 化後移除。
  async redirects() {
    return [{ source: "/", destination: "/index.html", permanent: false }];
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
      // 5.2 PWA：sw.js 每次更新檢查都回源；不加 CSP（會擋掉 SW 對 CDN 的 fetch）。
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
