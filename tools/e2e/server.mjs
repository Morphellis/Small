/*
 * Сайт для проверок в браузере — как у посетителей: собранная страница (dist) и собранный сервер
 * (dist-server/main.mjs), который её отдаёт и считает баллы.
 * E2E_URL=http://… — проверить уже запущенный сайт (например, npm run dev) без сборки.
 */
import { spawn } from "node:child_process";
import { build } from "vite";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startSite() {
  if (process.env.E2E_URL) return { url: process.env.E2E_URL.replace(/\/?$/, "/"), close: async () => {} };
  await build({ logLevel: "warn" });
  await build({ configFile: "vite.server.config.ts", logLevel: "warn" });
  const port = 9100 + Math.floor(Math.random() * 400);
  const proc = spawn(process.execPath, ["dist-server/main.mjs"], {
    // Проверки шлют запросы быстрее человека — ограничение частоты им не мешает.
    env: { ...process.env, PORT: String(port), STATIC_DIR: "dist", RATE_BURST: "100000", RATE_PER_SEC: "100000" },
    stdio: ["ignore", "ignore", "inherit"]
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + "api/health")).ok) break;
    } catch { /* сервер ещё запускается */ }
    await sleep(100);
  }
  return { url, close: async () => { proc.kill(); } };
}
