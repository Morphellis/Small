/*
 * Проверка после сборки: в файлы для браузера (dist) не попало ничего из того, что должно жить только
 * на сервере. Нашлось — сборка падает.
 *
 *   vite-node tools/check-leaks.ts [папка]      (по умолчанию dist; запускается из npm run build)
 */
import fs from "node:fs";
import path from "node:path";
import { findLeaks, fingerprints } from "./leaks";

function readDir(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) readDir(p, out);
    else if (/\.(js|css|html|json|svg|txt)$/.test(e.name)) out.set(p, fs.readFileSync(p, "utf8"));
  }
  return out;
}

const dir = process.argv[2] ?? "dist";
const files = readDir(dir);
const leaks = findLeaks(files);
if (leaks.length) {
  console.error(`В ${dir} попали серверные данные (${leaks.length}):\n  ` + leaks.slice(0, 20).join("\n  "));
  process.exit(1);
}
console.log(`check-leaks: ${files.size} файлов в ${dir}, ${fingerprints().size} отпечатков серверных данных — утечек нет.`);
