/*
 * Замер быстродействия в настоящем браузере (собранная версия):
 *   открытие теста, задержка ответа (обработчик + пересчёт стилей и раскладки), число DOM-узлов, память.
 *
 *   npm run perf                    (PERF_OUT=файл.json — сохранить результат для сравнения)
 */
import fs from "node:fs";
import { launch } from "./cdp.mjs";
import { startSite } from "./server.mjs";

const site = await startSite();
const b = await launch();
await b.viewport(1440, 900);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(2); };
const result = {};

// Сколько занимает синхронная реакция на клик вместе с пересчётом стилей и раскладки.
const timeClicks = (selectorExpr, n) => b.js(`
  const times = [];
  for (let i = 0; i < ${n}; i++) {
    const el = ${selectorExpr};
    if (!el) break;
    const t = performance.now();
    el.click();
    document.body.getBoundingClientRect(); // заставить браузер пересчитать раскладку
    times.push(performance.now() - t);
    await new Promise(r => setTimeout(r, 0));
  }
  return times;`);

for (const id of ["smol", "smil", "mmil"]) {
  await b.goto(site.url + "#smol", "#questions");
  await b.js(`localStorage.clear();`);
  await b.goto(site.url + "?" + Math.random() + "#smol", "#questions li");
  // Переход на тест без перезагрузки (как по кнопке переключателя): от клика до готового экрана.
  const open = id === "smol" ? null : await b.js(`
    const t = performance.now();
    document.querySelector('.test-switch button[data-test="${id}"]').click();
    while (!(document.querySelectorAll("#questions li").length && location.hash === "#${id}" && document.querySelector('.test-switch button.on')?.dataset.test === "${id}")) await new Promise(r => setTimeout(r, 1));
    document.body.getBoundingClientRect();
    return performance.now() - t;`);
  await b.goto(site.url + "?" + Math.random() + "#" + id, "#questions li");
  const nav = await b.js(`const n = performance.getEntriesByType("navigation")[0]; return { domReady: n.domContentLoadedEventEnd, load: n.loadEventEnd };`);
  // Метка ставится роутером сразу после показа теста (src/app/router.ts).
  const firstPaintOfTest = await b.js(`return performance.getEntriesByName("mounted:${id}")[0]?.startTime ?? NaN;`);
  const answers = await timeClicks(`document.querySelector("#questions li:not(:has(button.on)) button[data-a='Y']")`, 60);
  const keys = await b.js(`
    const times = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2", key: "2", bubbles: true }));
      document.body.getBoundingClientRect();
      times.push(performance.now() - t);
      await new Promise(r => setTimeout(r, 0));
    }
    return times;`);
  const dom = await b.js(`return { nodes: document.getElementsByTagName("*").length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };`);
  result[id] = {
    switchMs: open === null ? null : +open.toFixed(1),
    mountedAfterLoadMs: +firstPaintOfTest.toFixed(0),
    domContentLoadedMs: +nav.domReady.toFixed(0),
    answerClickMs: { median: median(answers), max: +Math.max(...answers).toFixed(2), n: answers.length },
    answerKeyMs: { median: median(keys), max: +Math.max(...keys).toFixed(2), n: keys.length },
    ...dom
  };
}

for (const id of ["luscher8", "luscher"]) {
  await b.goto(site.url + "#" + id, "#keyBtn");
  await b.js(`localStorage.clear();`);
  await b.goto(site.url + "?" + Math.random() + "#" + id, "#keyBtn");
  await b.js(`document.getElementById("keyBtn").click();`);
  const picks = await timeClicks(`document.querySelector(".lu-card.hint") || document.querySelector(".lu-stage [data-go], .lu-stage [data-v]")`, 70);
  const dom = await b.js(`return { nodes: document.getElementsByTagName("*").length };`);
  result[id] = { pickMs: { median: median(picks), max: +Math.max(...picks).toFixed(2), n: picks.length }, ...dom };
}

// Размер собранных файлов.
const assets = fs.existsSync("dist/assets") ? fs.readdirSync("dist/assets") : [];
result.bundleKB = Object.fromEntries(assets.map((f) => [f, +(fs.statSync("dist/assets/" + f).size / 1024).toFixed(1)]));

console.log(JSON.stringify(result, null, 1));
if (process.env.PERF_OUT) fs.writeFileSync(process.env.PERF_OUT, JSON.stringify(result, null, 1));
b.close();
await site.close();
process.exit(0);
