import { expect, test } from "@playwright/test";

async function open(page: import("@playwright/test").Page, id = "smol") {
  await page.goto("/#" + id);
  await expect(page.locator(`.test-switch [data-test="${id}"]`)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test("телефон: явный предварительный статус и компактная обратная связь", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await open(page, "smil");
  await expect(page.locator("#validitySum .vt")).toBeVisible();
  await expect(page.locator("#validitySum")).toContainText("Тест не завершён");
  await expect(page.locator("#q-14 .q-text")).toContainText("(Ответить «Я не знаю»)");
  await page.locator('#q-1 button[data-a="N"]').click();
  await expect(page.locator("#panel")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#impact .imp-q")).toBeHidden();
  await expect(page.locator("#q-1 .q-impact")).toBeVisible();
  await expect(page.locator("#validitySum")).toContainText("Тест не завершён");
  const initialHeight = await page.locator("#panel").evaluate((e) => e.getBoundingClientRect().height);
  await page.locator('#q-2 button[data-a="N"]').click();
  await expect(page.locator("#impact .imp-chip").first()).toBeVisible();
  const changedHeight = await page.locator("#panel").evaluate((e) => e.getBoundingClientRect().height);
  expect(changedHeight - initialHeight).toBeLessThan(50);
});

test("фокус, отключение клавиш, прогресс и продолжение после перезагрузки", async ({ page }) => {
  await open(page);
  await expect(page.locator("#validitySum")).not.toContainText("Достоверен");
  await page.locator('#q-10 button[data-a="Y"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('#q-11 button[data-a="Y"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('#q-10 button[data-a="Y"]')).toBeFocused();
  await page.keyboard.press("1");
  await expect(page.locator('#q-10 button[data-a="Y"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#q-1 button.on")).toHaveCount(0);
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
  await page.locator("#shortcutsBtn").click();
  await page.locator('#q-11 button[data-a="Y"]').focus();
  await page.keyboard.press("1");
  await expect(page.locator("#q-11 button.on")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
  await expect(page.locator("#q-11")).toHaveClass(/cur/);
  await expect(page.locator("#shortcutsBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#nextUnanswered").click();
  await expect(page.locator(".q.cur")).toHaveAttribute("id", "q-1");
});

test("медленная сеть: точная дельта последнего ответа и сброс без старого результата", async ({ page }) => {
  await open(page);
  await page.route("**/api/questionnaire/smol/score", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.evaluate(() => {
    for (const n of [1, 2, 3]) document.querySelector<HTMLButtonElement>(`#q-${n} button[data-a="N"]`)!.click();
  });
  await expect(page.locator("#panel")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#impact")).toContainText("Вопрос 3");
  await expect(page.locator("#impact")).not.toContainText("+2 сырых");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator('#q-4 button[data-a="Y"]').click();
  await page.locator("#resetBtn").click();
  await expect(page.locator("#panel")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#progressText")).toHaveText("Ответили 0 из 71");
  await expect(page.locator("#impact")).not.toContainText("Вопрос 4");
});

test("сетевая ошибка перехода сохраняет экран и предлагает рабочий повтор", async ({ page }) => {
  await open(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/assets/smil-*.js", (route) => route.abort());
  await page.locator('[data-test="smil"]').click();
  await expect(page.locator(".router-notice")).toBeVisible();
  await expect(page.locator('[data-test="smol"]')).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/#smol$/);
  await page.unroute("**/assets/smil-*.js");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator('[data-test="smil"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".router-notice")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Люшер сохраняет фокус при выборе, смене шага и завершении", async ({ page }) => {
  await open(page, "luscher8");
  await page.locator(".lu-card").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".lu-chosen .lu-chip")).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement?.closest("#luStage") !== null)).toBe(true);
  for (let n = 0; n < 6; n++) await page.keyboard.press("Enter");
  await expect(page.locator("[data-go]")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".lu-card").first()).toBeFocused();
  for (let n = 0; n < 7; n++) await page.keyboard.press("Enter");
  await expect(page.locator(".lu-done")).toBeVisible();
  await expect(page.locator("#luStage")).toBeFocused();
});

for (const [width, height] of [[320, 640], [390, 844], [844, 390], [768, 1024], [1440, 900]]) {
  test(`адаптивность и доступность шкал ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("#toggleProfile").click();
    // На широком экране профиль изначально открыт, на узком — закрыт.
    if (width > 1000) await page.locator("#toggleProfile").click();
    await expect(page.locator("#side")).toBeVisible();
    if (width <= 1000) {
      await expect(page.locator('[data-view="table"]')).toBeFocused();
      const available = await page.evaluate(() => document.querySelector("#side")!.getBoundingClientRect().top - Math.max(0, document.querySelector("#panel")!.getBoundingClientRect().bottom));
      expect(available).toBeGreaterThan(70);
      await page.keyboard.press("Escape");
      await expect(page.locator("#toggleProfile")).toBeFocused();
    }
    await page.locator('[data-test="luscher8"]').click();
    await expect(page.locator(".lu-card")).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}


test("перенос прогресса файлом и отказ от посторонних данных", async ({ page }, testInfo) => {
  await open(page);
  await page.locator('#q-20 button[data-a="N"]').click();
  await page.locator(".progress-transfer summary").click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#exportProgress").click();
  const download = await downloadEvent;
  const file = testInfo.outputPath("progress.json");
  await download.saveAs(file);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#progressText")).toHaveText("Ответили 0 из 71");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#importProgress").setInputFiles(file);
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
  await expect(page.locator('#q-20 button[data-a="N"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator("#importProgress").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"format":"trainer-progress","version":1,"entries":{"other":{}}}') });
  await expect(page.locator("#transferStatus")).toContainText("неподходящие данные");
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
});

test("отключение горячих клавиш работает и при заблокированном хранилище", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("disabled"); } }));
  await open(page);
  await page.locator("#shortcutsBtn").click();
  await page.locator('#q-1 button[data-a="Y"]').focus();
  await page.keyboard.press("1");
  await expect(page.locator("#q-1 button.on")).toHaveCount(0);
});

test("вкладки управляются стрелками, а выбранные ответы имеют достаточный контраст", async ({ page }) => {
  await open(page);
  await page.locator('[data-view="table"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-view="bars"]')).toBeFocused();
  await expect(page.locator('[data-view="bars"]')).toHaveAttribute("aria-selected", "true");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
    for (const answer of ["Y", "N", "?"]) {
      await page.locator(`#q-1 button[data-a="${answer}"]`).click();
      const ratio = await page.locator("#q-1 button.on").evaluate((element) => {
        const luminance = (rgb: string) => {
          const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
          return r * 0.2126 + g * 0.7152 + b * 0.0722;
        };
        const style = getComputedStyle(element);
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  }
});


test.describe("сенсорный экран", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("кнопки ответа и ячейки листа имеют размер под палец", async ({ page }) => {
    await open(page);
    for (const selector of ['#q-1 button[data-a="Y"]', '#sheetGrid .cell']) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator("#toggleProfile").click();
    await expect(page.locator("#side")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#toggleProfile")).toBeFocused();
  });
});
