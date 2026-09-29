/*
 * Какой тест показан. Адрес #smil открывает СМИЛ (ссылкой можно поделиться), без адреса — последний выбранный.
 * Переход между тестами идёт без перезагрузки: старый тест убирает себя (Unmount), новый рисуется на его месте.
 */
import { readString, writeString } from "./storage";
import type { AppContext, TestEntry, Unmount } from "./types";

const LAST_TEST_KEY = "trainer-test";

export function startRouter(root: HTMLElement, tests: readonly TestEntry[]): void {
  const byId = (id: string | null | undefined) => tests.find((t) => t.id === id);
  let current: TestEntry | null = null;
  let unmount: Unmount | null = null;
  let loading = 0;
  let first = true;

  function pick(): TestEntry {
    return byId(location.hash.slice(1)) ?? byId(readString(LAST_TEST_KEY)) ?? tests[0];
  }

  async function show(entry: TestEntry) {
    if (current === entry) return;
    const ticket = ++loading;
    current = entry;
    writeString(LAST_TEST_KEY, entry.id);
    if (location.hash.slice(1) !== entry.id) history.replaceState(null, "", "#" + entry.id);
    const module = await entry.load();
    if (ticket !== loading) return; // пока грузился, выбрали другой тест
    unmount?.();
    const ctx: AppContext = { tests, currentId: entry.id, switchTo: (id) => { const t = byId(id); if (t) void show(t); } };
    unmount = module.mount(root, ctx);
    performance.mark("mounted:" + entry.id); // для замеров быстродействия (tools/e2e/perf.mjs)
    // При первом показе браузер сам вернёт прокрутку после перезагрузки; при смене теста — наверх.
    if (!first) window.scrollTo({ top: 0 });
    first = false;
  }

  // Смена #smol / #smil в адресе или переход по такой ссылке на открытой странице.
  window.addEventListener("hashchange", () => {
    const t = byId(location.hash.slice(1));
    if (t) void show(t);
  });

  void show(pick());
}
