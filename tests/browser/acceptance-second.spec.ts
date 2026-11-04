import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page, id = 'smol') => {
  await page.goto('/#' + id);
  await expect(page.locator(`[data-test="${id}"]`)).toHaveAttribute('aria-selected', 'true');
};
const answer = (page: Page, n: number, a: string) => page.locator(`#q-${n} button[data-a="${a}"]`);

for (const [id, count] of [['smol', 71], ['smil', 566], ['mmil', 377]] as const) {
  test(`${id}: последняя граница, замена и снятие ответа`, async ({ page }) => {
    await open(page, id);
    await answer(page, count, 'Y').click();
    await expect(page.locator('#progressText')).toHaveText(`Ответили 1 из ${count}`);
    await answer(page, count, 'N').click();
    await expect(answer(page, count, 'Y')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#progressText')).toHaveText(`Ответили 1 из ${count}`);
    await answer(page, count, 'N').click();
    await expect(page.locator('#progressText')).toHaveText(`Ответили 0 из ${count}`);
    await page.reload();
    await expect(answer(page, count, 'N')).toHaveAttribute('aria-pressed', 'false');
  });
}

test('изоляция ответов трёх опросников при циклических переходах', async ({ page }) => {
  await open(page);
  for (const id of ['smol', 'smil', 'mmil']) {
    await page.locator(`[data-test="${id}"]`).click();
    await answer(page, 7, id === 'smil' ? '?' : id === 'smol' ? 'Y' : 'N').click();
  }
  for (const [id, a, total] of [['smol', 'Y', 71], ['smil', '?', 566], ['mmil', 'N', 377]]) {
    await page.locator(`[data-test="${id}"]`).click();
    await expect(answer(page, 7, String(a))).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#progressText')).toHaveText(`Ответили 1 из ${total}`);
  }
});

test('отмена сброса и импорта не меняет ответы', async ({ page }) => {
  await open(page);
  await answer(page, 9, 'Y').click();
  page.on('dialog', dialog => dialog.dismiss());
  await page.locator('#resetBtn').click();
  await expect(answer(page, 9, 'Y')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#importProgress').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({format:'trainer-progress',version:1,entries:{'smol-trainer-v1':null}})) });
  await page.reload();
  await expect(answer(page, 9, 'Y')).toHaveAttribute('aria-pressed', 'true');
});

test('перенос двух опросников в новый независимый браузерный контекст', async ({ page, browser }, info) => {
  await open(page);
  await answer(page, 71, '?').click();
  await page.locator('[data-test="mmil"]').click();
  await answer(page, 377, 'N').click();
  await page.locator('.progress-transfer summary').click();
  const event = page.waitForEvent('download');
  await page.locator('#exportProgress').click();
  const path = info.outputPath('two-tests.json');
  await (await event).saveAs(path);
  const other = await browser.newContext();
  try {
    const fresh = await other.newPage();
    await fresh.goto('http://127.0.0.1:9188/#smol');
    fresh.on('dialog', d => d.accept());
    await fresh.locator('#importProgress').setInputFiles(path);
    await expect(answer(fresh, 71, '?')).toHaveAttribute('aria-pressed', 'true');
    await fresh.locator('[data-test="mmil"]').click();
    await expect(answer(fresh, 377, 'N')).toHaveAttribute('aria-pressed', 'true');
    await fresh.locator('[data-test="smil"]').click();
    await expect(fresh.locator('#progressText')).toHaveText('Ответили 0 из 566');
  } finally { await other.close(); }
});

test('Люшер: отмена восстанавливает конкретную карточку и переживает перезагрузку', async ({ page }) => {
  await open(page, 'luscher8');
  const value = await page.locator('.lu-card').first().getAttribute('data-v');
  await page.locator('.lu-card').first().click();
  await expect(page.locator('.lu-chosen .lu-chip')).toHaveCount(1);
  await page.locator('#undoBtn').click();
  await expect(page.locator(`.lu-card[data-v="${value}"]`)).toBeVisible();
  await expect(page.locator('#undoBtn')).toBeDisabled();
  await page.reload();
  await expect(page.locator(`.lu-card[data-v="${value}"]`)).toBeVisible();
  await expect(page.locator('.lu-card')).toHaveCount(8);
});

test('быстрый переход во время задержанного подсчёта не загрязняет другой тест', async ({ page }) => {
  await open(page);
  await page.route('**/api/questionnaire/smol/score', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue().catch(() => {});
  });
  await answer(page, 1, 'N').click();
  await page.locator('[data-test="luscher8"]').click();
  await expect(page.locator('.lu-card')).toHaveCount(8);
  await page.waitForTimeout(1000);
  await expect(page.locator('#progressText')).toHaveCount(0);
  await expect(page.locator('.lu-card')).toHaveCount(8);
  await page.locator('[data-test="smol"]').click();
  await expect(answer(page, 1, 'N')).toHaveAttribute('aria-pressed', 'true');
});

for (const failure of ['http500', 'invalid-json']) {
  test(`ошибка сервера ${failure}: ответы доступны и расчёт восстанавливается`, async ({ page }) => {
    await open(page);
    await expect(page.locator('#scoreState')).toBeHidden();
    await page.route('**/api/questionnaire/smol/score', route => route.fulfill({status:failure === 'http500' ? 500 : 200, contentType:'application/json', body:failure === 'http500' ? '{"error":"failure"}' : '{broken'}));
    await answer(page, 15, 'Y').click();
    await expect(page.locator('#impact')).toContainText('Соединение с сервером отсутствует');
    await expect(answer(page, 15, 'Y')).toHaveAttribute('aria-pressed', 'true');
    await page.unroute('**/api/questionnaire/smol/score');
    await answer(page, 16, 'N').click();
    await expect(page.locator('#scoreState')).toBeHidden();
    await expect(page.locator('#progressText')).toHaveText('Ответили 2 из 71');
  });
}

test('файл с валидной и невалидной записью отклоняется целиком', async ({ page }) => {
  await open(page);
  await answer(page, 4, 'Y').click();
  let dialogs = 0;
  page.on('dialog', async d => { dialogs++; await d.dismiss(); });
  await page.locator('#importProgress').setInputFiles({name:'mixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'trainer-progress',version:1,entries:{'smol-trainer-v1':null,'smil-trainer-v1':{answers:[]}}}))});
  await expect(page.locator('#transferStatus')).toContainText('неподходящие данные');
  expect(dialogs).toBe(0);
  await page.reload();
  await expect(answer(page, 4, 'Y')).toHaveAttribute('aria-pressed', 'true');
});

test('поворот телефона с открытыми шкалами сохраняет ответ и возможность закрыть панель', async ({ page }) => {
  await page.setViewportSize({width:360,height:740});
  await open(page, 'smil');
  await answer(page, 14, '?').click();
  await page.locator('#toggleProfile').click();
  await page.setViewportSize({width:740,height:360});
  await expect(page.locator('#side')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).toBeHidden();
  await expect(answer(page, 14, '?')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({width:360,height:740});
  await expect(page.locator('#toggleProfile')).toBeVisible();
});

for (const id of ['luscher8', 'luscher']) {
  test(`${id}: полное прохождение с отменой финального выбора и повторным завершением`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({width:390,height:844});
    await open(page, id);
    let picks = 0;
    while (!(await page.locator('.lu-done').count()) && picks < 200) {
      await page.locator('#luStage button[data-v], #luStage button[data-go]').last().click();
      picks++;
    }
    expect(picks).toBeLessThan(200);
    await expect(page.locator('.lu-done')).toBeVisible();
    await expect(page.locator('#luResults')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#undoBtn').click();
    await expect(page.locator('.lu-done')).toHaveCount(0);
    await page.locator('#luStage button[data-v], #luStage button[data-go]').last().click();
    await expect(page.locator('.lu-done')).toBeVisible();
    await page.reload();
    await expect(page.locator('.lu-done')).toBeVisible();
    await expect(page.locator('#luResults')).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const [id, count] of [['smol',71],['smil',566],['mmil',377]] as const) {
  test(`API ${id}: детерминизм, независимость и тождественная дельта на новой комбинации`, async ({ request }) => {
    // Детерминированная последовательность с длинными блоками и пропусками вместо прежних эталонов.
    const answers = Array.from({length:count}, (_, i) => i % 11 === 0 ? '.' : Math.floor(i / 7) % 2 ? 'N' : 'Y').join('');
    const url = `/api/questionnaire/${id}/score`;
    const first = await request.post(url, {data:{answers}});
    expect(first.status()).toBe(200);
    const baseline = (await first.json()).profile;
    const same = await request.post(url, {data:{answers,beforeAnswers:answers}});
    const pair = await same.json();
    expect(pair.profile).toEqual(baseline);
    expect(pair.beforeProfile).toEqual(baseline);
    await request.post(url, {data:{answers:'N'.repeat(count)}});
    const again = await request.post(url, {data:{answers}});
    expect((await again.json()).profile).toEqual(baseline);
    expect(first.headers()['cache-control']).toBe('no-store');
  });
}

test('тайм-аут зависшего запроса запускает расчёт последних ответов', async ({ page }) => {
  await open(page);
  await expect(page.locator('#scoreState')).toBeHidden();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/questionnaire/smol/score', async route => {
    requests++;
    if (requests === 1) await gate;
    await route.continue().catch(() => {});
  });
  try {
    await answer(page, 21, 'N').click();
    await expect.poll(() => requests).toBe(1);
    await answer(page, 22, 'Y').click();
    await expect(page.locator('#impact')).toContainText('Соединение с сервером отсутствует', {timeout:15000});
    await expect.poll(() => requests, {timeout:5000}).toBeGreaterThan(1);
    await expect(page.locator('#scoreState')).toBeHidden();
    await expect(page.locator('#progressText')).toHaveText('Ответили 2 из 71');
    await page.reload();
    await expect(page.locator('#progressText')).toHaveText('Ответили 2 из 71');
  } finally { release(); }
});

for (const id of ['smol', 'luscher8']) {
  test(`${id}: зависший первоначальный расчёт не мешает восстановлению`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    const endpoint = id === 'smol' ? '**/api/questionnaire/smol/score' : '**/api/luscher/short/score';
    await page.route(endpoint, async route => {
      requests++;
      if (requests === 1) await gate;
      await route.continue().catch(() => {});
    });
    try {
      await open(page, id);
      if (id === 'smol') await answer(page, 2, 'Y').click();
      else await page.locator('#luStage button[data-v]').first().click();
      await expect.poll(() => requests, {timeout:18000}).toBeGreaterThan(1);
      await expect(page.locator(id === 'smol' ? '#panel' : '#luResults')).toHaveAttribute('aria-busy','false');
      if (id === 'smol') await expect(page.locator('#progressText')).toHaveText('Ответили 1 из 71');
      else await expect(page.locator('.lu-chosen .lu-chip')).toHaveCount(1);
    } finally { release(); }
  });
}
