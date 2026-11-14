import { expect, test } from '@playwright/test';
import { trainingWidgetHtml } from '../../server/telegramTraining';
import type { StudyResponse } from '../../src/app/studyRoute';

for (const id of ['smol','smil','mmil']) test(`${id}: открытие конкретного пункта и вопросы только выбранной шкалы`, async ({page,request}) => {
  const response = await request.get(`/api/questionnaire/${id}/study/L`);
  expect(response.status()).toBe(200);
  const data = await response.json() as StudyResponse;
  const q = data.questions.at(-1)!;
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/?tgWebAppStartParam=study_${id}_L_${q.number}`);
  await expect(page.locator('.study-card h2')).toHaveText(`Пункт № ${q.number}`);
  await expect(page.locator('.study-question-text')).toHaveText(q.text);
  await expect(page.locator('.study-key')).toContainText(q.answers[0] === 'Y' ? '«Да»' : '«Нет»');
  await expect(page.locator('#studyNext')).toBeDisabled();
  await page.locator('#studyPrev').click();
  await expect(page.locator('.study-card h2')).toHaveText(`Пункт № ${data.questions.at(-2)!.number}`);
  await page.reload();
  await expect(page.locator('.study-card h2')).toHaveText(`Пункт № ${data.questions.at(-2)!.number}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('самопроверка и изучение не изменяют сохранённые ответы полного теста', async ({page,request}) => {
  await page.goto('/#smol');
  await page.locator('#q-1 button[data-a="Y"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('smol-trainer-v1')!).answers[0])).toBe('Y');
  const saved = await page.evaluate(() => localStorage.getItem('smol-trainer-v1'));
  const data = await (await request.get('/api/questionnaire/smol/study/L')).json() as StudyResponse;
  await page.goto(`/#study/smol/L/${data.questions[0].number}`);
  await page.locator('#studyQuiz').click();
  await expect(page.locator('.study-key')).toHaveCount(0);
  const correct = data.questions[0].answers[0];
  await page.locator(`[data-study-answer="${correct === 'Y' ? 'N' : 'Y'}"]`).click();
  await expect(page.locator('.study-feedback')).toHaveText('Не совпадает с ключом.');
  await page.locator(`[data-study-answer="${correct}"]`).click();
  await expect(page.locator('.study-feedback')).toHaveText('Совпадает с ключом.');
  await page.locator('#studyNext').click();
  await expect(page.locator('.study-key')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('smol-trainer-v1'))).toBe(saved);
  await page.locator('#studyExit').click();
  await expect(page.locator('#q-1 button[data-a="Y"]')).toHaveAttribute('aria-pressed','true');
});

test('смена шкалы и неизвестный пункт обрабатываются без выхода из приложения', async ({page,request}) => {
  await page.goto('/#study/smil/L/999');
  await expect(page.getByRole('alert')).toContainText('не входит');
  await page.locator('#studyFirst').click();
  const data = await (await request.get('/api/questionnaire/smil/study/F')).json() as StudyResponse;
  await page.locator('#studyScale').selectOption('F');
  await expect(page.locator('.study-card h2')).toHaveText(`Пункт № ${data.questions[0].number}`);
  await expect(page.locator('#studyPrev')).toBeDisabled();
  await page.locator('#studyQuestion').selectOption(String(data.questions.at(-1)!.number));
  await expect(page.locator('#studyNext')).toBeDisabled();
});

test('ошибка загрузки и повтор, запрет неизвестных шкал в API', async ({page,request}) => {
  expect((await request.get('/api/questionnaire/smol/study/unknown')).status()).toBe(404);
  expect((await request.get('/api/questionnaire/unknown/study/L')).status()).toBe(404);
  expect((await request.post('/api/questionnaire/smol/study/L',{data:{}})).status()).toBe(405);
  await page.route('**/api/questionnaire/smol/study/L',route => route.abort());
  await page.goto('/#study/smol/L/5');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
  await page.unroute('**/api/questionnaire/smol/study/L');
  await page.locator('#studyRetry').click();
  await expect(page.locator('.study-card')).toBeVisible();
});

test('HTML-карточка переключает тесты и открывает правильный startapp', async ({page}) => {
  await page.addInitScript(() => {});
  await page.setContent(`<script>window.TelegramWidget={ready:function(){},openTelegramLink:function(url){document.body.setAttribute('data-opened',url)}};</script>${trainingWidgetHtml()}`);
  await page.locator('[data-test="smil"]').click();
  await expect(page.locator('#smol')).toBeHidden();
  await expect(page.locator('#smil')).toBeVisible();
  await page.locator('#smil [data-scale="L"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-opened',/https:\/\/t.me\/odinochnayaPalata_bot\/study\?startapp=study_smil_L_\d+/);
  await page.locator('[data-test="mmil"]').click();
  await expect(page.locator('#smil')).toBeHidden();
  await expect(page.locator('#mmil')).toBeVisible();
});

test('служебный hash Telegram сохраняет открытие выбранного пункта', async ({page}) => {
  await page.goto('/?tgWebAppStartParam=study_smol_L_11#tgWebAppData=user%3Dtest&tgWebAppVersion=10.4');
  await expect(page.locator('.study-card h2')).toHaveText('Пункт № 11');
});
