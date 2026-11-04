import { expect, test } from '@playwright/test';

test('смена теста при зависшем запросе не выводит сетевую ошибку на новом экране', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/questionnaire/smil/score', async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/#smil');
    await page.locator('#q-14 button[data-a="?"]').click();
    await page.locator('[data-test="luscher8"]').click();
    await page.locator('#luStage button[data-v]').first().click();
    await expect(page.locator('#luResults')).toHaveAttribute('aria-busy','false');
    await page.waitForTimeout(11000);
    await expect(page.locator('.lu-chosen .lu-chip')).toHaveCount(1);
    await expect(page.locator('.lu-offline')).toHaveCount(0);
    await expect(page.locator('[data-test="luscher8"]')).toHaveAttribute('aria-selected','true');
    expect(errors).toEqual([]);
  } finally {release();}
  await page.unroute('**/api/questionnaire/smil/score');
  await page.locator('[data-test="smil"]').click();
  await expect(page.locator('#q-14 button[data-a="?"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#scoreState')).toBeHidden();
});

test('два зависших запроса подряд: восстановление без перезагрузки и потери ответов', async ({page}) => {
  test.setTimeout(45000);
  await page.goto('/#smol');
  await expect(page.locator('#scoreState')).toBeHidden();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {release = resolve;});
  const bodies: string[] = [];
  await page.route('**/api/questionnaire/smol/score', async route => {
    bodies.push(route.request().postData()!);
    if (bodies.length <= 2) await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.locator('#q-1 button[data-a="Y"]').click();
    await expect.poll(() => bodies.length).toBe(1);
    await page.locator('#q-2 button[data-a="N"]').click();
    await expect.poll(() => bodies.length,{timeout:15000}).toBe(2);
    await page.locator('#q-3 button[data-a="?"]').click();
    await expect.poll(() => bodies.length,{timeout:16000}).toBeGreaterThan(2);
    await expect(page.locator('#scoreState')).toBeHidden();
    const latest = JSON.parse(bodies.at(-1)!);
    expect(latest.answers.slice(0,3)).toBe('YN?');
    await expect(page.locator('#progressText')).toHaveText('Ответили 3 из 71');
    await page.reload();
    await expect(page.locator('#progressText')).toHaveText('Ответили 3 из 71');
  } finally {release();}
});
