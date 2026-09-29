/*
 * Минимальный клиент Chrome DevTools Protocol для проверок в настоящем браузере — без Playwright и других
 * зависимостей. Подходит любой Chromium: Chrome, Edge, Brave (путь можно задать переменной BROWSER).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Не нашёл Chrome/Edge/Brave. Укажите путь: BROWSER=/путь/к/chrome npm run e2e");
  return found;
}

/** Запустить безголовый браузер и подключиться к его вкладке. */
export async function launch({ port = 9300 + Math.floor(Math.random() * 400) } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "trainer-e2e-"));
  const proc = spawn(findBrowser(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    // В CI (GitHub Actions) песочница Chrome упирается в ограничения ядра — там она не нужна.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "about:blank"
  ], { stdio: "ignore" });

  let ws;
  for (let t = 0; t < 100 && !ws; t++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      }
    } catch { /* браузер ещё запускается */ }
    if (!ws) await sleep(150);
  }
  if (!ws) throw new Error("Браузер не ответил по CDP");

  let id = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Page.javascriptDialogOpening") { send("Page.handleJavaScriptDialog", { accept: true }); return; }
    if (d.method === "Runtime.exceptionThrown") { pageErrors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); return; }
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
    }
  };
  function send(method, params = {}) {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((res, rej) => pending.set(i, { res, rej }));
  }
  await send("Page.enable");
  await send("Runtime.enable");

  /** Выполнить async-тело в странице и вернуть результат. */
  async function js(body) {
    const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("JS: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }

  async function viewport(width, height, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  }

  /** Перейти по адресу и дождаться, пока появится selector. */
  async function goto(url, selector) {
    await send("Page.navigate", { url });
    for (let t = 0; t < 60; t++) {
      await sleep(150);
      try {
        if (await js(`return document.readyState === "complete" && !!document.querySelector(${JSON.stringify(selector)});`)) break;
      } catch { /* страница ещё грузится */ }
    }
    await sleep(150);
  }

  /** Дождаться конца плавной прокрутки. */
  async function settle() {
    let last = -1, same = 0;
    for (let t = 0; t < 40 && same < 3; t++) {
      const y = await js("return scrollY;");
      same = y === last ? same + 1 : 0;
      last = y;
      await sleep(90);
    }
  }

  /**
   * Настоящий клик мышью: прокрутить элемент в видимую часть и убедиться, что в его центре на экране
   * именно он, а не перекрывающий его блок. Возвращает текст ошибки или null.
   */
  async function click(selectorOrExpr) {
    const find = selectorOrExpr.startsWith("@") ? selectorOrExpr.slice(1) : `document.querySelector(${JSON.stringify(selectorOrExpr)})`;
    const info = await js(`
      const el = ${find};
      if (!el) return { err: "нет элемента" };
      el.scrollIntoView({ block: "center", inline: "center" });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { err: "элемент не виден (0×0)" };
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { err: "центр за пределами экрана" };
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top))) {
        const d = top ? (top.id ? "#" + top.id : top.tagName.toLowerCase() + "." + [...top.classList].join(".")) : "ничто";
        return { err: "перекрыт элементом " + d };
      }
      return { x, y };`);
    if (info.err) return info.err;
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: info.x, y: info.y, button: "left", clickCount: 1 });
    }
    await sleep(40);
    return null;
  }

  const KEYS = { "0": 48, "1": 49, "2": 50, "3": 51, Escape: 27, Backspace: 8, Enter: 13, ArrowDown: 40, ArrowUp: 38 };
  async function key(name) {
    const code = /^\d$/.test(name) ? "Digit" + name : name;
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, code, key: name, windowsVirtualKeyCode: KEYS[name] });
    }
    await sleep(20);
  }

  async function screenshot(file) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  }

  function close() {
    try { ws.close(); } catch { /* уже закрыт */ }
    proc.kill();
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }), 800).unref?.();
  }

  return { send, js, viewport, goto, settle, click, key, screenshot, close, pageErrors };
}
