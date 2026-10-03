/*
 * Раздача собранного сайта (папка dist): только то, что в ней лежит, — код сервера туда не попадает.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

/**
 * Политика безопасности страницы: скрипты только свои (и встроенный в index.html — по его хешу),
 * запросы только к своему серверу, встраивать сайт в чужие страницы (frame) нельзя.
 */
function contentSecurityPolicy(indexHtml: string): string {
  const hashes = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    // style="--c: …" у карточек и полос — встроенные стили нужны.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

export function createStatic(root: string) {
  const dir = path.resolve(root);
  const index = path.join(dir, "index.html");
  if (!fs.existsSync(index)) throw new Error(`нет ${index}: сначала npm run build`);
  const csp = contentSecurityPolicy(fs.readFileSync(index, "utf8"));

  return function serve(req: IncomingMessage, res: ServerResponse, urlPath: string): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(dir, path.normalize(rel));
    // Никаких выходов за пределы папки сайта (../../server и т. п.).
    if (!file.startsWith(dir + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Не найдено");
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const headers: Record<string, string | number> = {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Content-Length": st.size,
        // Файлы в assets/ с хешем в имени не меняются никогда; всё остальное — каждый раз сверять.
        "Cache-Control": rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        "Last-Modified": st.mtime.toUTCString()
      };
      if (ext === ".html") headers["Content-Security-Policy"] = csp;
      res.writeHead(200, headers);
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    });
  };
}
