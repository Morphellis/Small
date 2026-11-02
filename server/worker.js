/* Cloudflare adapter: uses the same API and scoring engine as the Node server. */
import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { handleApi, sendJson } from "./api";
import { createRateLimiter } from "./rateLimit";
import { telegramWebhook } from "./telegram";

// Per-isolate backstop; this does not constitute a global quota across Cloudflare.
const limiter = createRateLimiter(60, 10);
const server = createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const path = new URL(req.url ?? "/", "https://worker.invalid").pathname;
  if (path !== "/api" && !path.startsWith("/api/")) {
    sendJson(res, 404, { error: "нет такого адреса" });
    return;
  }
  const ip = req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "?";
  if (path !== "/api/health" && !limiter.take(String(ip))) {
    res.setHeader("Retry-After", "1");
    sendJson(res, 429, { error: "слишком часто" });
    return;
  }
  void handleApi(req, res, path);
});
server.listen(8080);
const api = httpServerHandler({ port: 8080 });
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/api/telegram/webhook") {
      return telegramWebhook(request, env.TELEGRAM_WEBHOOK_SECRET);
    }
    return api.fetch(request, env, ctx);
  }
};
