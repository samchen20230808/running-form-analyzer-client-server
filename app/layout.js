import { APP_CONFIG } from "../lib/config.js";

export const metadata = {
  title: `${APP_CONFIG.systemName} ${APP_CONFIG.version}`,
  description: APP_CONFIG.subtitle,
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
