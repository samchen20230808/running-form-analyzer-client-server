import { APP_CONFIG } from "../lib/config.js";

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>{APP_CONFIG.systemName}</h1>
      <p>
        {APP_CONFIG.version}（Next.js 單一部署版，建置中）
      </p>
    </main>
  );
}
