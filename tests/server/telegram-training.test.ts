import { describe, expect, test } from 'vitest';
import { deflateSync } from 'node:zlib';
import { trainingHome, trainingView, trainingWidgetHtml } from '../../server/telegramTraining';
import { QUESTIONNAIRES } from '../../server/registry';
import { studyQuestions, studyScales } from '../../server/study';
import { parseStudyLink } from '../../src/app/studyRoute';

describe('карточка шкал и переходы в приложение', () => {
  test('карточка укладывается в ограничения Telegram и содержит только ссылки на шкалы', () => {
    const html = trainingWidgetHtml();
    expect(Buffer.byteLength(html)).toBeLessThanOrEqual(32768);
    expect(deflateSync(html,{level:9}).length).toBeLessThanOrEqual(4096);
    expect(html).toContain('TelegramWidget.openTelegramLink');
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|Ответ по ключу/);
    for (const def of Object.values(QUESTIONNAIRES)) for (const s of studyScales(def)) {
      expect(html).toContain(`startapp=study_${def.id}_${s.id}_${s.first}`);
    }
  });
  test('кнопки запасного меню открывают соответствующую шкалу', () => {
    const home = trainingHome();
    for (const row of home.reply_markup.inline_keyboard.slice(1)) {
      const menu = trainingView(row[0].callback_data!)!;
      expect(menu.text).toContain('Выберите шкалу');
      for (const scaleRow of menu.reply_markup.inline_keyboard) {
        const url = new URL(scaleRow[0].url!);
        const route = parseStudyLink('', '?tgWebAppStartParam='+url.searchParams.get('startapp'))!;
        expect(route).not.toBeNull();
        expect(studyQuestions(QUESTIONNAIRES[route.test],route.scale)?.questions[0].number).toBe(route.question);
      }
    }
  });
  for (const def of Object.values(QUESTIONNAIRES)) test(`${def.id}: каждая подборка точно соответствует ключу`, () => {
    for (const s of studyScales(def)) {
      const data = studyQuestions(def,s.id)!;
      const key = def.key[s.id];
      const numbers = [...new Set([...key.yes,...key.no])].sort((a,b) => a-b);
      expect(data.questions.map(q => q.number)).toEqual(numbers);
      for (const q of data.questions) {
        expect(q.text).toBe(def.questions[q.number-1]);
        expect(q.answers.includes('Y')).toBe(key.yes.includes(q.number));
        expect(q.answers.includes('N')).toBe(key.no.includes(q.number));
      }
      const legacy = trainingView(`t1:card:${def.id}:${s.id}:0:l`)!;
      expect(legacy.text).not.toContain('Ответ по ключу:');
      expect(legacy.reply_markup.inline_keyboard[0][0].url).toBe(`https://t.me/odinochnayaPalata_bot/study?startapp=study_${def.id}_${s.id}_${s.first}`);
    }
  });
  test('некорректные ссылки и неизвестные шкалы отклоняются', () => {
    expect(parseStudyLink('','?tgWebAppStartParam=study_smil_L_5')).toEqual({test:'smil',scale:'L',question:5});
    expect(parseStudyLink('#smil','?tgWebAppStartParam=study_smol_L_5')).toBeNull();
    for (const hash of ['#study/unknown/L/1','#study/smol/L/0','#study/smil/L/-1','#study/smil/<script>/5','#study/smil/L/1/extra']) expect(parseStudyLink(hash)).toBeNull();
    expect(studyQuestions(QUESTIONNAIRES.smol,'__proto__')).toBeNull();
    for (const data of ['t1:test:__proto__','t1:card:smol:L:9999:l','t1:home:extra']) expect(trainingView(data)).toBeNull();
  });
});

test('параметры запуска Telegram в hash не перекрывают ссылку на вопрос', () => {
  expect(parseStudyLink('#tgWebAppData=user%3Dignored&tgWebAppVersion=10.4','?study=study_smol_F_2')).toEqual({test:'smol',scale:'F',question:2});
  expect(parseStudyLink('#tgWebAppData=user%3Dignored&tgWebAppVersion=10.4','?tgWebAppStartParam=study_smil_L_15')).toEqual({test:'smil',scale:'L',question:15});
  expect(parseStudyLink('#tgWebAppStartParam=study_smol_L_11')).toEqual({test:'smol',scale:'L',question:11});
  expect(parseStudyLink('#tgWebAppData=start_param%3Dstudy_mmil_L_50')).toEqual({test:'mmil',scale:'L',question:50});
});
