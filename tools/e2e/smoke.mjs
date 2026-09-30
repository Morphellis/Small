/*
 * Критические сценарии в настоящем браузере на разных экранах — настоящими кликами и клавишами:
 * пройти каждый тест, ключ, профиль, лист, сброс, тема, сохранение; ничего не перекрыто и не вылезает за экран.
 *
 *   npm run e2e                         собрать сайт и проверить на всех экранах
 *   E2E_ONLY=320,1440 npm run e2e       только экраны, чьё название начинается с «320» или «1440»
 *   E2E_URL=http://127.0.0.1:5173 …     проверить уже запущенный dev-сервер
 *   E2E_SHOTS=папка …                   сохранить снимки экранов
 */
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./cdp.mjs";
import { startSite } from "./server.mjs";

const VIEWPORTS = [
  ["320x640 телефон", 320, 640, true],
  ["360x780 телефон", 360, 780, true],
  ["390x844 телефон", 390, 844, true],
  ["844x390 телефон лёжа", 844, 390, true],
  ["768x1024 планшет", 768, 1024, true],
  ["1024x768 ноутбук", 1024, 768, false],
  ["1280x800", 1280, 800, false],
  ["1440x900", 1440, 900, false],
  ["1920x1080", 1920, 1080, false]
].filter(([name]) => !process.env.E2E_ONLY || process.env.E2E_ONLY.split(",").some((p) => name.startsWith(p.trim())));

const site = await startSite();
const b = await launch();
const SHOTS = process.env.E2E_SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let VP = "";
const issues = [];
let passed = 0;
const check = (cond, msg) => { if (cond) passed++; else { issues.push(`[${VP}] ${msg}`); console.log("  ✗", msg); } return cond; };
async function click(target, label) {
  const err = await b.click(target);
  return check(err === null, `${label}${err ? ": " + err : ""}`);
}
async function open(hash, theme = "dark") {
  await b.goto(site.url + "#" + hash, ".panel-head");
  await b.js(`localStorage.clear(); localStorage.setItem("trainer-theme", "${theme}");`);
  await b.goto(site.url + "?r=" + Math.random() + "#" + hash, "#keyBtn");
}
const count = (sel) => b.js(`return document.querySelectorAll(${JSON.stringify(sel)}).length;`);

/** Нет горизонтальной прокрутки, кнопки шапки не налезают друг на друга и не уходят за край. */
async function layoutChecks(where) {
  const r = await b.js(`
    const w = innerWidth;
    const items = [...document.querySelectorAll(".panel-head > *")].filter(e => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().width > 0);
    const over = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].getBoundingClientRect(), c = items[j].getBoundingClientRect();
      if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) over.push((items[i].id || items[i].className) + " × " + (items[j].id || items[j].className));
    }
    const off = items.filter(e => e.getBoundingClientRect().right > w + 1 && !e.classList.contains("test-switch")).map(e => e.id || e.className);
    return { sw: document.documentElement.scrollWidth, w, over, off };`);
  check(r.sw <= r.w, `${where}: нет горизонтальной прокрутки (${r.sw} ≤ ${r.w})`);
  check(r.over.length === 0, `${where}: элементы шапки не перекрываются ${r.over.join("; ")}`);
  check(r.off.length === 0, `${where}: кнопки шапки в пределах экрана ${r.off.join(", ")}`);
}

async function switching() {
  await open("smol");
  for (const t of ["smil", "mmil", "luscher8", "luscher", "smol"]) {
    await click(`.test-switch button[data-test="${t}"]`, `переключатель: ${t}`);
    for (let i = 0; i < 30 && !(await b.js(`return location.hash === "#${t}" && !!document.querySelector("#keyBtn");`)); i++) await sleep(100);
    check(await b.js(`return document.querySelector(".test-switch button.on")?.dataset.test === "${t}";`), `переключатель открывает ${t}`);
  }
}

/** Переключение туда-обратно не копит обработчики на document и window (тест за собой всё убирает). */
async function noLeaks() {
  const count = async () => {
    const r = await b.send("Runtime.evaluate", {
      expression: `[document, window].reduce((n, t) => n + Object.values(getEventListeners(t)).reduce((m, l) => m + l.length, 0), 0)`,
      includeCommandLineAPI: true, returnByValue: true
    });
    return r.result.value;
  };
  await open("smol");
  const order = ["smil", "mmil", "luscher8", "luscher", "smol"];
  const at = [];
  for (let round = 0; round < 4; round++) {
    for (const t of order) {
      await b.js(`document.querySelector('.test-switch button[data-test="${t}"]').click();`);
      for (let i = 0; i < 30 && !(await b.js(`return location.hash === "#${t}" && document.querySelector(".test-switch button.on")?.dataset.test === "${t}";`)); i++) await sleep(50);
    }
    at.push(await count());
  }
  check(at.every((n) => n === at[0]), `после 20 переключений обработчиков столько же (${at.join(" → ")})`);
  check(!(await b.js(`return document.body.classList.contains("keymode");`)), "класс режима ключа не остаётся после ухода с опросника");
}

async function questionnaire(id, total, { dk = true } = {}) {
  await open(id);
  await layoutChecks(`${id} старт`);
  check((await count('#questions button[data-a="?"]')) > 0 === dk, `${id}: кнопка «Не знаю» ${dk ? "есть" : "отсутствует"}`);
  await click("#keyBtn", `${id}: «Показать ключ»`);
  check(await b.js(`return document.getElementById("keyBtn").getAttribute("aria-pressed") === "true" && !document.querySelector("#q-1 .q-key").hidden;`), `${id}: ключ показывается`);

  // Первые 8 ответов — мышью по подсвеченной кнопке, дальше клавишами (ответ + переход к следующему).
  for (let i = 0; i < total; i++) {
    const a = await b.js(`const li = document.getElementById("q-${i + 1}"); return (li.querySelector("button.scores-key") || li.querySelector('button[data-a="N"]')).dataset.a;`);
    if (i < 8) {
      if (!(await click(`#q-${i + 1} button[data-a="${a}"]`, `${id}: ответ на вопрос ${i + 1}`))) return;
    } else {
      if (i === 8) await b.js(`document.querySelector("#q-9 .q-text").click();`);
      await b.key(a === "Y" ? "1" : a === "N" ? "2" : "3");
    }
    if (i === 8 || i === total - 1) {
      await b.settle();
      const vis = await b.js(`
        const cur = document.querySelector("#questions .q.cur"), p = document.getElementById("panel");
        const r = cur.getBoundingClientRect(), sticky = getComputedStyle(p).position === "sticky" && !p.classList.contains("unstick");
        return { top: r.top, panel: sticky ? p.getBoundingClientRect().bottom : 0, h: innerHeight };`);
      check(vis.top >= vis.panel - 2 && vis.top < vis.h, `${id}: текущий вопрос виден, не под шапкой (верх ${Math.round(vis.top)}, шапка до ${Math.round(vis.panel)})`);
    }
  }
  check((await count("#sheetGrid .cell:not(.st-empty)")) === total, `${id}: засчитано ${total} ответов`);
  check(await b.js(`return document.getElementById("impact").classList.contains("hit") || document.getElementById("impact").classList.contains("miss");`), `${id}: строка «что изменил ответ» заполнена`);
  await layoutChecks(`${id} после ответов`);

  const wide = await b.js(`return matchMedia("(min-width: 1001px)").matches;`);
  const stripShown = () => b.js(`return document.getElementById("strip").offsetParent !== null;`);
  if (wide) {
    // Строка шкал дублирует профиль справа — видна, только когда профиль закрыт.
    check(!(await stripShown()), `${id}: строка шкал скрыта, пока профиль открыт справа`);
    await b.js(`window.scrollTo(0, 0);`);
    await click("#toggleProfile", `${id}: закрыть профиль справа`);
    check(await stripShown(), `${id}: без профиля строка шкал видна`);
  } else {
    check(await stripShown(), `${id}: на узком экране строка шкал видна`);
  }

  if ((await count("#strip [data-more]")) > 0) {
    const before = await count("#strip .sc");
    await click("#strip [data-more]", `${id}: «ещё N шкал»`);
    check((await count("#strip .sc")) > before, `${id}: «ещё N шкал» показывает все шкалы`);
    await layoutChecks(`${id} полоска развёрнута`);
    await click("#strip [data-more]", `${id}: свернуть полоску`);
  }

  if (wide) {
    await b.js(`window.scrollTo(0, 0);`);
    await click("#toggleProfile", `${id}: открыть профиль справа`);
  }
  if (!wide) {
    await b.js(`window.scrollTo(0, 400);`);
    const bottomBtn = await b.js(`return document.getElementById("sideOpen").offsetParent !== null;`);
    if (bottomBtn) await click("#sideOpen", `${id}: «▲ Профиль» внизу`);
    else { await b.js(`window.scrollTo(0, 0);`); await click("#toggleProfile", `${id}: «Профиль» в шапке`); }
    await sleep(350);
    const side = await b.js(`const r = document.getElementById("side").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, vis: getComputedStyle(document.getElementById("side")).visibility };`);
    check(side.vis === "visible" && side.top < side.h && side.bottom <= side.h + 1, `${id}: шторка профиля в пределах экрана (${Math.round(side.top)}–${Math.round(side.bottom)} из ${side.h})`);
  } else {
    check(await b.js(`const s = document.getElementById("side"); return s.offsetParent !== null && s.getBoundingClientRect().width > 250;`), `${id}: профиль виден справа`);
  }
  for (const view of ["bars", "chart", "table"]) {
    await click(`.view-switch button[data-view="${view}"]`, `${id}: вкладка «${view}»`);
    check(await b.js(`
      if ("${view}" === "table") return document.querySelectorAll("#scoreBody tr").length > 5;
      if ("${view}" === "bars") return document.getElementById("bars").children.length > 3;
      return document.getElementById("chart").children.length > 5;`), `${id}: вкладка «${view}» нарисована`);
  }
  if (!wide) {
    await click("#sideClose", `${id}: закрыть шторку`);
    await sleep(350);
    check(await b.js(`return getComputedStyle(document.getElementById("side")).visibility === "hidden";`), `${id}: шторка закрывается`);
  }

  await click(`#sheetGrid .cell[data-i="4"]`, `${id}: ячейка 5 регистрационного листа`);
  await b.settle();
  check(await b.js(`const li = document.getElementById("q-5"); const r = li.getBoundingClientRect(); return li.classList.contains("cur") && r.top >= 0 && r.bottom <= innerHeight + 1;`), `${id}: лист переводит к вопросу 5`);
  await b.key("0");
  check(!(await b.js(`return !!document.querySelector("#q-5 button.on");`)), `${id}: клавиша 0 снимает ответ`);

  await b.js(`window.scrollTo(0, 0);`);
  await click("#validitySum", `${id}: плашка достоверности`);
  await sleep(150);
  const vb = await b.js(`const r = document.getElementById("validityBody").getBoundingClientRect(); return { open: document.getElementById("validity").open, l: r.left, r: r.right, w: innerWidth };`);
  check(vb.open && vb.l >= -1 && vb.r <= vb.w + 1, `${id}: пояснение достоверности в пределах экрана`);
  await b.key("Escape");

  const t0 = await b.js(`return document.documentElement.dataset.theme;`);
  await click("#themeBtn", `${id}: кнопка темы`);
  const t1 = await b.js(`return document.documentElement.dataset.theme;`);
  check(t0 !== t1, `${id}: тема переключается`);
  await layoutChecks(`${id} ${t1}`);
  if (SHOTS) await b.screenshot(path.join(SHOTS, `${VP}-${id}.png`.replace(/[^\w.-]+/g, "_")));
  await click("#themeBtn", `${id}: тема обратно`);

  const saved = await count("#sheetGrid .cell:not(.st-empty)");
  await b.goto(site.url + "?r=" + Math.random() + "#" + id, "#sheetGrid .cell");
  check((await count("#sheetGrid .cell:not(.st-empty)")) === saved, `${id}: ответы сохраняются после перезагрузки`);
  await click("#resetBtn", `${id}: «Сбросить»`);
  await sleep(200);
  check((await count("#sheetGrid .cell:not(.st-empty)")) === 0, `${id}: «Сбросить» очищает ответы`);
}

async function luscher(id) {
  await open(id);
  await layoutChecks(`${id} старт`);
  check(await b.js(`return document.getElementById("luGuide").open === false;`), `${id}: блок логики свёрнут по умолчанию`);
  await click("#luGuide > summary", `${id}: раскрыть блок логики`);
  check(await b.js(`return document.getElementById("luGuide").open;`), `${id}: блок логики раскрывается`);
  await layoutChecks(`${id} с логикой`);
  await click("#luGuide > summary", `${id}: свернуть блок логики`);
  await click("#keyBtn", `${id}: «Показать ключ»`);

  // Цифра выбирает карточку по месту в ряду.
  const before = await count(".lu-stage [data-v]");
  await b.key("1");
  check((await count(".lu-stage [data-v]")) === before - 1 || (await count(".lu-row2")) > 0, `${id}: клавиша 1 выбирает карточку`);
  await b.key("Backspace");
  check((await count(".lu-stage [data-v]")) === before, `${id}: Backspace отменяет выбор`);

  let n = 0;
  for (; n < 120; n++) {
    const kind = await b.js(`
      if (document.querySelector(".lu-card.hint")) return ".lu-card.hint";
      for (const s of [".lu-stage [data-go]", ".lu-row2 [data-v]", ".lu-figs [data-v]", ".lu-stage [data-v]"]) if (document.querySelector(s)) return s;
      return null;`);
    if (!kind) break;
    if (!(await click(kind, `${id}: выбор ${n + 1}`))) break;
    if (n % 9 === 0) await layoutChecks(`${id} шаг ${n + 1}`);
  }
  const res = await b.js(`return { done: !!document.querySelector(".lu-done"), a: document.querySelector(".lu-score-head b")?.textContent };`);
  check(res.done, `${id}: тест проходится до конца (${n} выборов)`);
  check(res.a === "12", `${id}: по ключу тревожность 12 (${res.a})`);
  await layoutChecks(`${id} результат`);
  if (SHOTS) await b.screenshot(path.join(SHOTS, `${VP}-${id}.png`.replace(/[^\w.-]+/g, "_")));

  await b.goto(site.url + "?r=" + Math.random() + "#" + id, ".lu-done");
  check(await b.js(`return !!document.querySelector(".lu-done");`), `${id}: прохождение сохраняется после перезагрузки`);
  await b.js(`window.scrollTo(0, 0);`);
  await click("#undoBtn", `${id}: «← Назад»`);
  check(await b.js(`return !document.querySelector(".lu-done") && !!document.querySelector(".lu-stage [data-v], .lu-stage [data-go]");`), `${id}: «Назад» отменяет последний выбор`);
  await click("#resetBtn", `${id}: «Сбросить»`);
  await sleep(200);
  check(await b.js(`return !document.querySelector(".lu-score-head") && /Шаг 1 из/.test(document.querySelector(".lu-stage").innerText);`), `${id}: «Сбросить» начинает заново`);
}

for (const [name, w, h, mobile] of VIEWPORTS) {
  VP = name;
  console.log("==", name);
  await b.viewport(w, h, mobile);
  try {
    await switching();
    if (name === VIEWPORTS[0][0]) await noLeaks();
    await questionnaire("smol", 71);
    await questionnaire("smil", 40);
    await questionnaire("mmil", 40, { dk: false });
    await luscher("luscher8");
    await luscher("luscher");
  } catch (e) {
    check(false, "сбой прогона: " + e.message);
  }
}

console.log(`\nПроверок: ${passed + issues.length}, пройдено: ${passed}, проблем: ${issues.length}, ошибок JS на странице: ${b.pageErrors.length}`);
for (const i of issues) console.log("✗", i);
for (const e of new Set(b.pageErrors)) console.log("JS:", e.split("\n")[0]);
b.close();
await site.close();
process.exit(issues.length || b.pageErrors.length ? 1 : 0);
