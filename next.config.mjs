/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // /api 全部回應不得被快取（含 Next 自動回的 405／OPTIONS）；值須與 lib/server/http-handler.js 的 RESPONSE_HEADERS 一致。
  // 其餘安全標頭在 Epic 2（2.1）加入。
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
