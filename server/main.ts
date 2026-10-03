/*
 * Сервер сайта: отдаёт собранную страницу (dist) и считает баллы (api/…). Без сторонних библиотек.
 *
 *   PORT         порт (8080)
 *   STATIC_DIR   папка собранного сайта (dist)
 *   TRUST_PROXY  1 — сервер стоит за Caddy: адрес посетителя брать из X-Forwarded-For
 *   RATE_BURST, RATE_PER_SEC   ограничение частоты запросов к api с одного адреса (60 подряд, 10 в секунду)
 */
import http from "node:http";
import { handleApi, sendJson } from "./api";
import { createRateLimiter } from "./rateLimit";
import { createStatic, SECURITY_HEADERS } from "./static";

const PORT = Number(process.env.PORT ?? 8080);
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const limiter = createRateLimiter(Number(process.env.RATE_BURST ?? 60), Number(process.env.RATE_PER_SEC ?? 10));
const serveStatic = createStatic(process.env.STATIC_DIR ?? "dist");

/** Адрес посетителя. За Caddy — последний адрес в X-Forwarded-For: его дописал сам Caddy, подделать нельзя. */
function clientIp(req: http.IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (TRUST_PROXY && typeof fwd === "string" && fwd) return fwd.split(",").pop()!.trim();
  return req.socket.remoteAddress ?? "?";
}

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  let path: string;
  try {
    path = new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path === "/api" || path.startsWith("/api/")) {
    if (path !== "/api/health" && !limiter.take(clientIp(req))) {
      res.setHeader("Retry-After", "1");
      sendJson(res, 429, { error: "слишком часто" });
      return;
    }
    void handleApi(req, res, path);
    return;
  }
  serveStatic(req, res, path);
});

// Медленные и зависшие соединения не держат сервер.
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;

server.listen(PORT, () => console.log(`Сайт: http://localhost:${PORT}/`));

// docker stop: дописать начатые ответы и выйти.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
