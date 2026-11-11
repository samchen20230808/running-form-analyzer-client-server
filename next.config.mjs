/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
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
