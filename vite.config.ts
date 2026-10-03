import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/*
 * npm run dev: API подсчёта (server/api.ts) работает прямо внутри dev-сервера Vite — отдельный сервер не нужен,
 * правки в server/ подхватываются сами. В продакшене то же API отдаёт server/main.ts.
 */
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith("/api/")) return next();
        server.ssrLoadModule("/server/api.ts")
          .then((m) => (m as typeof import("./server/api")).handleApi(req, res, path))
          .catch(next);
      });
    }
  };
}

// base "./": сайт работает и в корне домена, и в подпапке (morphellis.github.io/Small/).
export default defineConfig({
  base: "./",
  plugins: [devApi()],
  // Не выбрасывать при сжатии комментарии «/*! … */» — так в собранных файлах остаётся знак авторского права.
  esbuild: { legalComments: "inline" },
  build: {
    outDir: "dist",
    target: "es2022",
    rollupOptions: {
      output: {
        // Знак авторского права в начале каждого собранного файла («/*!» переживает сжатие).
        banner: "/*! © 2026 «Одиночная палата». All rights reserved. Copying is prohibited — see LICENSE. */",
        // Понятные имена файлов: тест — assets/smil-….js, вид теста — assets/kind-questionnaire-….js,
        // общий код оболочки — assets/shared-….js (а не безликие index-….js).
        chunkFileNames: (chunk) => {
          const f = chunk.facadeModuleId ?? "";
          const test = f.match(/[\/]tests[\/]([^\/]+)[\/]index\.ts$/);
          if (test) return `assets/${test[1]}-[hash].js`;
          const kinds = new Set(chunk.moduleIds.map((id) => id.match(/[\/]kinds[\/]([^\/]+)[\/]/)?.[1]).filter(Boolean));
          if (kinds.size === 1) return `assets/kind-${[...kinds][0]}-[hash].js`;
          if (chunk.moduleIds.every((id) => /[\/]src[\/]app[\/]/.test(id))) return "assets/shared-[hash].js";
          return "assets/[name]-[hash].js";
        }
      }
    }
  },
  test: { include: ["tests/**/*.test.ts"] }
});
