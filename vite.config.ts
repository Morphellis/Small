import { defineConfig } from "vitest/config";

// base "./": сайт работает и в корне домена, и в подпапке (morphellis.github.io/Small/).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    rollupOptions: {
      output: {
        // Файл теста называется по его папке: assets/smil-….js, а не assets/index-….js.
        chunkFileNames: (chunk) => {
          const m = chunk.facadeModuleId?.match(/[\/]tests[\/]([^\/]+)[\/]index\.ts$/);
          return `assets/${m ? m[1] : "[name]"}-[hash].js`;
        }
      }
    }
  },
  test: { include: ["tests/**/*.test.ts"] }
});
