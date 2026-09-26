/*
 * Поднимает метку ?v=N у всех стилей и скриптов в index.html, чтобы браузеры не брали старые файлы из кэша.
 * Запуск перед выкладкой: npm run bump
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");
const current = Math.max(0, ...[...html.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1])));
const next = current + 1;
fs.writeFileSync(file, html.replace(/\?v=\d+/g, "?v=" + next));
console.log(`index.html: ?v=${current} → ?v=${next}`);
