import { afterEach, expect, test, vi } from 'vitest';
import { configureTelegramWebhook, telegramWebhook } from '../../server/telegram';
const secret = 'test-secret';
const token = 'test-token';
const request = (body:unknown,key = secret) => new Request('https://example.test/api/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':key},body:JSON.stringify(body)});
const callback = (data = 't1:card:smol:L:0:l') => ({callback_query:{id:'callback-1',from:{id:123},data,message:{message_id:10,chat:{id:123,type:'private'}}}});
afterEach(() => vi.unstubAllGlobals());

test('нажатие обновляет одно сообщение и подтверждается через ответ вебхука', async () => {
  const send = vi.fn(async () => Response.json({ok:true}));
  vi.stubGlobal('fetch',send);
  const result = await (await telegramWebhook(request(callback()),secret,token)).json();
  expect(result).toEqual({method:'answerCallbackQuery',callback_query_id:'callback-1'});
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]).toBeDefined();
  const [url,options] = (send.mock.calls as unknown[][])[0];
  expect(url).toBe('https://api.telegram.org/bottest-token/editMessageText');
  const sent = JSON.parse((options as RequestInit).body as string);
  expect(sent.chat_id).toBe(123);
  expect(sent.message_id).toBe(10);
  expect(sent.text).toContain('Ответ по ключу:');
});

test('нет токена: пользователь получает сообщение, без исходящего запроса', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch',send);
  const result = await (await telegramWebhook(request(callback()),secret)).json();
  expect(result.show_alert).toBe(true);
  expect(result.text).toContain('не настроен');
  expect(send).not.toHaveBeenCalled();
});

test('чужой пользователь, группа и неверная кнопка не редактируют сообщения', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch',send);
  const foreign = callback(); foreign.callback_query.from.id = 456;
  const group = callback(); group.callback_query.message.chat.type = 'group';
  for (const body of [foreign,group,callback('t1:card:smol:L:9999:l')]) {
    const result = await (await telegramWebhook(request(body),secret,token)).json();
    expect(result.method).toBe('answerCallbackQuery');
  }
  expect(send).not.toHaveBeenCalled();
});

test('повторное нажатие не показывает ошибку Telegram message is not modified', async () => {
  vi.stubGlobal('fetch',vi.fn(async () => Response.json({ok:false,description:'Bad Request: message is not modified'},{status:400})));
  expect((await (await telegramWebhook(request(callback()),secret,token)).json()).show_alert).toBeUndefined();
});

test('сетевые и API-ошибки не раскрывают токен', async () => {
  for (const send of [vi.fn(async () => {throw new Error('private URL and token');}),vi.fn(async () => Response.json({ok:false,description:'private error'},{status:500}))]) {
    vi.stubGlobal('fetch',send);
    const result = await (await telegramWebhook(request(callback()),secret,token)).json();
    expect(result.show_alert).toBe(true);
    expect(result.text).toContain('Нажмите кнопку ещё раз');
    expect(JSON.stringify(result)).not.toContain(token);
  }
});

test('настройка подписывает Telegram на сообщения и callback с сохранением секрета', async () => {
  const send = vi.fn(async () => Response.json({ok:true})); vi.stubGlobal('fetch',send);
  expect((await configureTelegramWebhook(request({}),secret,token)).status).toBe(200);
  const [,options] = (send.mock.calls as unknown[][])[0];
  expect(JSON.parse((options as RequestInit).body as string)).toEqual({url:'https://example.test/api/telegram/webhook',secret_token:secret,allowed_updates:['message','callback_query']});
});

test('настройка требует POST, секрет и токен', async () => {
  const send = vi.fn(); vi.stubGlobal('fetch',send);
  expect((await configureTelegramWebhook(new Request('https://example.test'),secret,token)).status).toBe(405);
  expect((await configureTelegramWebhook(request({}),secret,undefined)).status).toBe(503);
  expect((await configureTelegramWebhook(request({},'wrong'),secret,token)).status).toBe(403);
  expect(send).not.toHaveBeenCalled();
});

test('владелец может настроить webhook по токену без чтения серверного секрета', async () => {
  vi.stubGlobal('fetch',vi.fn(async () => Response.json({ok:true})));
  const owner = new Request('https://example.test/api/telegram/setup',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
  expect((await configureTelegramWebhook(owner,secret,token)).status).toBe(200);
});
