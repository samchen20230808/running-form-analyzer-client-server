import { APP_CONFIG } from "../lib/config.js";

// 5.2 PWA manifest（build 時靜態化為 /manifest.webmanifest）。
// 頁面在 /index.html（/ 為 307 導向），所以 start_url／id 直接指向它。
export default function manifest() {
  return {
    id: "/index.html",
    name: APP_CONFIG.systemName,
    short_name: "跑姿分析",
    description: APP_CONFIG.subtitle,
    lang: "zh-TW",
    start_url: "/index.html",
    scope: "/",
    display: "standalone",
    background_color: "#0B0F19",
    theme_color: "#0B0F19",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
