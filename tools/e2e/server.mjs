/*
 * Сайт для проверок в браузере: собранная версия (vite build → preview), как у посетителей.
 * E2E_URL=http://… — проверить уже запущенный сайт (например, dev-сервер) без сборки.
 */
import { build, preview } from "vite";

export async function startSite() {
  if (process.env.E2E_URL) return { url: process.env.E2E_URL.replace(/\/?$/, "/"), close: async () => {} };
  await build({ logLevel: "warn" });
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 }, logLevel: "warn" });
  const url = server.resolvedUrls.local[0];
  return { url, close: () => new Promise((r) => server.httpServer.close(r)) };
}
