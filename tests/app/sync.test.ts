import { afterEach, expect, test, vi } from "vitest";
import { createSync } from "../../src/app/api";
import { createScope } from "../../src/app/scope";

afterEach(() => vi.unstubAllGlobals());

test("устаревшие ответы не показываются; после быстрых изменений отправляется последнее состояние", async () => {
  vi.stubGlobal("window", new EventTarget());
  const scope = createScope();
  const pending: ((value: number) => void)[] = [];
  const onResult = vi.fn();
  const sync = createSync(scope, { send: () => new Promise<number>((resolve) => pending.push(resolve)), onResult });
  sync.request();
  sync.request();
  sync.request();
  expect(pending).toHaveLength(1);
  pending[0](1);
  await Promise.resolve();
  expect(onResult).not.toHaveBeenCalled();
  expect(pending).toHaveLength(2);
  pending[1](3);
  await Promise.resolve();
  expect(onResult).toHaveBeenCalledExactlyOnceWith(3);
  scope.dispose();
});

test("ответ после ухода с экрана не вызывает отрисовку", async () => {
  vi.stubGlobal("window", new EventTarget());
  const scope = createScope();
  let resolve!: (n: number) => void;
  const onResult = vi.fn();
  const sync = createSync(scope, { send: () => new Promise<number>((r) => { resolve = r; }), onResult });
  sync.request();
  scope.dispose();
  resolve(7);
  await Promise.resolve();
  expect(onResult).not.toHaveBeenCalled();
});
