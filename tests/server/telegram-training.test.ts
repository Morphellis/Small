import { describe, expect, test } from 'vitest';
import { trainingHome, trainingView } from '../../server/telegramTraining';
import { QUESTIONNAIRES } from '../../server/registry';

describe('изучение шкал в Telegram', () => {
  test('главное меню содержит три опросника и ссылку на приложение', () => {
    const home = trainingHome();
    expect(home.reply_markup.inline_keyboard.flat().filter(b => b.callback_data).map(b => b.callback_data)).toEqual(['t1:test:smol','t1:test:smil','t1:test:mmil']);
    expect(home.reply_markup.inline_keyboard[0][0].web_app?.url).toMatch(/^https:/);
  });
  for (const def of Object.values(QUESTIONNAIRES)) {
    test(`${def.id}: все вопросы каждой шкалы соответствуют серверному ключу`, () => {
      const menu = trainingView(`t1:test:${def.id}`)!;
      expect(menu).not.toBeNull();
      for (const s of def.scaleOrder) {
        const key = def.key[s];
        const numbers = [...new Set([...key.yes,...key.no])].sort((a,b) => a-b);
        expect(menu.reply_markup.inline_keyboard.flat().some(b => b.callback_data === `t1:card:${def.id}:${s}:0:l`)).toBe(numbers.length > 0);
        for (const [index,n] of numbers.entries()) {
          const card = trainingView(`t1:card:${def.id}:${s}:${index}:l`)!;
          expect(card.text).toContain(def.questions[n-1]);
          expect(card.text).toContain(`Пункт № ${n}`);
          expect(card.text).toContain(`Вопрос ${index+1} из ${numbers.length}`);
          if (key.yes.includes(n)) expect(card.text).toContain('«Да»');
          if (key.no.includes(n)) expect(card.text).toContain('«Нет»');
          expect(card.text.length).toBeLessThan(4096);
          for (const b of card.reply_markup.inline_keyboard.flat()) if (b.callback_data) {
            expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
            expect(trainingView(b.callback_data)).not.toBeNull();
          }
          const quiz = trainingView(`t1:card:${def.id}:${s}:${index}:q`)!;
          expect(quiz.text).not.toContain('Ответ по ключу:');
          for (const a of ['Y','N']) {
            const result = trainingView(`t1:answer:${def.id}:${s}:${index}:q:${a}`)!;
            const correct = a === 'Y' ? key.yes.includes(n) : key.no.includes(n);
            expect(result.text).toContain(correct ? 'Совпадает с ключом.' : 'Не совпадает с ключом.');
            expect(result.text).toContain('Ответ по ключу:');
          }
        }
        expect(trainingView(`t1:card:${def.id}:${s}:${numbers.length}:l`)).toBeNull();
      }
    });
  }
  test('неизвестные и повреждённые кнопки отклоняются', () => {
    for (const data of ['t1:test:__proto__','t1:test:constructor','t1:card:smol:unknown:0:l','t1:card:smol:L:-1:l','t1:card:smol:L:1.5:l','t1:card:smol:L:9999:l','t1:card:smol:L:0:x','t1:answer:smol:L:0:l:Y','t1:answer:smol:L:0:q:?','t1:home:extra','t1:test:smol:extra']) expect(trainingView(data),data).toBeNull();
  });
});
