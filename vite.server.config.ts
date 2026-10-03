/*
 * Сборка сервера (server/main.ts) в один файл dist-server/main.mjs для Node. Сторонних библиотек у сервера нет,
 * поэтому файл самодостаточный: в Docker-образ кладутся только он и собранный сайт (dist).
 */
import { defineConfig } from "vite";

export default defineConfig({
  // Картинки из public/ нужны только сайту (dist), не серверу.
  publicDir: false,
  build: {
    ssr: "server/main.ts",
    outDir: "dist-server",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: { output: { entryFileNames: "main.mjs" } }
  },
  ssr: { noExternal: true }
});
