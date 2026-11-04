import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../../src/app/api';

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('document', { baseURI: 'https://example.test/' });
}
function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), {once:true});
  });
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test('зависший запрос отменяется через 10 секунд', async () => {
  setup();
  vi.stubGlobal('fetch', vi.fn((_url, options) => waitForAbort(options.signal)));
  const result = api('api/health').catch(error => error);
  await vi.advanceTimersByTimeAsync(9999);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({name:'TimeoutError'});
  expect(vi.getTimerCount()).toBe(0);
});

test('тайм-аут охватывает чтение тела ответа после заголовков', async () => {
  setup();
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ok:true, json:() => waitForAbort(options.signal)})));
  const result = api('api/health').catch(error => error);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toMatchObject({name:'TimeoutError'});
});

test('уход с экрана отменяет запрос и удаляет таймер', async () => {
  setup();
  const parent = new AbortController();
  vi.stubGlobal('fetch', vi.fn((_url, options) => waitForAbort(options.signal)));
  const result = api('api/health', {signal:parent.signal}).catch(error => error);
  parent.abort();
  expect(await result).toMatchObject({name:'AbortError'});
  expect(vi.getTimerCount()).toBe(0);
});

test('успешный запрос удаляет таймер и обработчик отмены', async () => {
  setup();
  const parent = new AbortController();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  vi.stubGlobal('fetch', vi.fn(async () => ({ok:true,json:async () => ({ok:true})})));
  expect(await api('api/health',{signal:parent.signal})).toEqual({ok:true});
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

// Проверки повторов используют настоящий api() и createSync(), время управляется тестом.
test('два тайм-аута подряд: повтор отправляет последнее состояние и сбрасывает задержку', async () => {
  setup();
  vi.stubGlobal('window', new EventTarget());
  const { createSync } = await import('../../src/app/api');
  const { createScope } = await import('../../src/app/scope');
  const scope = createScope();
  const sent: unknown[] = [];
  let value = 1;
  const onError = vi.fn();
  const onResult = vi.fn();
  vi.stubGlobal('fetch', vi.fn((_url, options) => {
    sent.push(JSON.parse(options.body));
    return sent.length <= 2 ? waitForAbort(options.signal) : Promise.resolve({ok:true,json:async () => ({value})});
  }));
  const sync = createSync(scope, {send:signal => api('api/score',{body:{value},signal}),onError,onResult});
  sync.request();
  value = 2;
  sync.request();
  await vi.advanceTimersByTimeAsync(10000);
  expect(onError).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toEqual([{value:1},{value:2}]);
  value = 3;
  sync.request();
  await vi.advanceTimersByTimeAsync(10000);
  expect(onError).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(sent).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(sent).toEqual([{value:1},{value:2},{value:3}]);
  expect(onResult).toHaveBeenCalledExactlyOnceWith({value:3});
  scope.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

test('online во время задержки повтора отправляет запрос сразу', async () => {
  setup();
  vi.stubGlobal('window', new EventTarget());
  const { createSync } = await import('../../src/app/api');
  const { createScope } = await import('../../src/app/scope');
  const scope = createScope();
  const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(7);
  const onResult = vi.fn();
  createSync(scope,{send,onResult}).request();
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(onResult).toHaveBeenCalledExactlyOnceWith(7);
  scope.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

test('уход во время задержки повтора не оставляет запросов и таймеров', async () => {
  setup();
  vi.stubGlobal('window', new EventTarget());
  const { createSync } = await import('../../src/app/api');
  const { createScope } = await import('../../src/app/scope');
  const scope = createScope();
  const send = vi.fn().mockRejectedValue(new Error('offline'));
  const onResult = vi.fn();
  createSync(scope,{send,onResult}).request();
  await vi.advanceTimersByTimeAsync(0);
  scope.dispose();
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(onResult).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
