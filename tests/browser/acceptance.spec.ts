import { expect, test } from "@playwright/test";

const key = "smol-trainer-v1";
const start = async (page: import("@playwright/test").Page) => {
  await page.goto("/#smol");
  await expect(page.locator("#validitySum")).toContainText("Тест не завершён");
};

test("вторая вкладка не перезаписывает ответы первой, собственные ответы доступны в файле", async ({ page, context }) => {
  await start(page);
  const other = await context.newPage();
  await start(other);
  await page.locator('#q-1 button[data-a="N"]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.answers[0], key)).toBe("N");
  await expect(other.locator(".storage-notice")).toContainText("другой вкладке");
  await other.locator('#q-2 button[data-a="Y"]').click();
  await other.locator('[data-test="smil"]').click(); // dispose тоже не должен затереть чужую запись
  await expect(other.locator('[data-test="smil"]')).toHaveAttribute("aria-selected", "true");
  await other.locator('[data-test="smol"]').click();
  await expect(other.locator('#q-2 button[data-a="Y"]')).toHaveAttribute("aria-pressed", "true");
  const downloaded = other.waitForEvent("download");
  await other.locator(".storage-notice button").filter({ hasText: "Скачать прогресс" }).click();
  const file = await (await downloaded).path();
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile(file!, "utf8"));
  expect(exported.entries[key].answers[1]).toBe("Y");
  await page.reload();
  await expect(page.locator('#q-1 button[data-a="N"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#q-2 button[data-a="Y"]')).toHaveAttribute("aria-pressed", "false");
});

test("одновременные сохранения сериализованы между вкладками", async ({ page, context }) => {
  await start(page);
  const other = await context.newPage();
  await start(other);
  await Promise.all([page.locator('#q-1 button[data-a="N"]').click(), other.locator('#q-2 button[data-a="Y"]').click()]);
  // Немедленно запрашиваем запись в обеих вкладках, не полагаясь на задержку idle callback.
  await Promise.all([page.evaluate(() => window.dispatchEvent(new Event("trainer:save"))), other.evaluate(() => window.dispatchEvent(new Event("trainer:save")))]);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.answers.filter((a: unknown) => a !== null).length ?? 0, key)).toBe(1);
  await expect.poll(async () => Number(await page.locator(".storage-notice").isVisible()) + Number(await other.locator(".storage-notice").isVisible())).toBe(1);
});

test("отказ хранилища виден, экспорт сохраняет ответы из памяти", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("disabled"); } }));
  await start(page);
  await page.locator('#q-1 button[data-a="N"]').click();
  await expect(page.locator(".storage-notice")).toContainText("не удалось сохранить");
  const downloaded = page.waitForEvent("download");
  await page.locator(".storage-notice button").filter({ hasText: "Скачать прогресс" }).click();
  const file = await (await downloaded).path();
  const { readFile } = await import("node:fs/promises");
  expect(JSON.parse(await readFile(file!, "utf8")).entries[key].answers[0]).toBe("N");
});

test("переполнение хранилища и последующее восстановление записи", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); };
    window.addEventListener("audit:restore-storage", () => { Storage.prototype.setItem = original; });
  });
  await start(page);
  await page.locator('#q-1 button[data-a="N"]').click();
  await expect(page.locator(".storage-notice")).toContainText("не удалось сохранить");
  await page.evaluate(() => window.dispatchEvent(new Event("audit:restore-storage")));
  await page.locator('#q-2 button[data-a="Y"]').click();
  await expect(page.locator(".storage-notice")).toBeHidden();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.answers.slice(0, 2), key)).toEqual(["N", "Y"]);
});

test("немедленная перезагрузка после ответа сохраняет последний ответ", async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#q-1 button[data-a="N"]')!.click();
    location.reload();
  });
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
});

test("ошибка сети помечает профиль устаревшим, восстановление снимает предупреждение", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ answers: Array(71).fill("N") })), key);
  await page.goto("/#smol");
  await expect(page.locator("#validitySum")).not.toContainText("Ожидание");
  await page.route("**/api/questionnaire/smol/score", (route) => route.abort());
  await page.locator('#q-71 button[data-a="N"]').click();
  await expect(page.locator("#progressText")).toHaveText("Ответили 70 из 71");
  await expect(page.locator("#impact")).toContainText("Соединение с сервером отсутствует");
  await expect(page.locator("#validitySum")).toContainText("Тест не завершён");
  await expect(page.locator("#validitySum")).not.toContainText(/Недостоверен|Достоверен/);
  await expect(page.locator("#scoreState")).toContainText("устарел");
  await page.unroute("**/api/questionnaire/smol/score");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#scoreState")).toBeHidden();
  await expect(page.locator("#validitySum")).not.toContainText("Ожидание");
});

test("повреждённый импорт отклоняется до подтверждения и записи", async ({ page }) => {
  await start(page);
  await page.locator('#q-1 button[data-a="N"]').click();
  await page.locator("#importProgress").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "trainer-progress", version: 1, entries: { [key]: {} } })) });
  await expect(page.locator("#transferStatus")).toContainText("неподходящие данные");
  await expect(page.locator("#progressText")).toHaveText("Ответили 1 из 71");
});

test("CSP разрешает собственный фрейм и Telegram, запрещает произвольные сайты", async ({ page, baseURL }) => {
  const response = await page.request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self' https://web.telegram.org https://*.web.telegram.org");
  expect(response.headers()["x-frame-options"]).toBeUndefined();
  await page.route("**/acceptance-frame", (route) => route.fulfill({ contentType: "text/html", body: `<iframe title="trainer" src="${baseURL}/#smol"></iframe>` }));
  await page.goto("/acceptance-frame");
  await expect(page.frameLocator('iframe').locator("#progressText")).toHaveText("Ответили 0 из 71");
  // Другой origin не входит в frame-ancestors.
  await page.goto(baseURL!.replace("127.0.0.1", "localhost") + "/acceptance-frame");
  await expect(page.frameLocator('iframe').locator("#progressText")).toHaveCount(0);
});
