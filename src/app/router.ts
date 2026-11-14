/*
 * Какой тест показан. Адрес #smil открывает СМИЛ (ссылкой можно поделиться), без адреса — последний выбранный.
 * Переход между тестами идёт без перезагрузки: старый тест убирает себя (Unmount), новый рисуется на его месте.
 */
import { readString, writeString } from "./storage";
import type { AppContext, TestEntry, Unmount } from "./types";
import { mountStudy } from './study';
import { parseStudyLink, studyHash, type StudyRoute } from './studyRoute';

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

  let notice: HTMLElement | null = null;
  let pending: TestEntry | null = null;

  function showStudy(route:StudyRoute) {
    loading++;
    pending = null;
    notice?.remove(); notice = null;
    unmount?.();
    current = null;
    history.replaceState(null,'',studyHash(route));
    unmount = mountStudy(root,route);
    window.scrollTo({top:0});
    first = false;
  }

  async function show(entry: TestEntry, retryLoad = false) {
    const ticket = ++loading;
    pending = entry;
    notice?.remove();
    notice = null;
    if (current === entry) {
      pending = null;
      history.replaceState(null, "", "#" + entry.id);
      return;
    }
    try {
      const module = await entry.load(retryLoad);
      if (ticket !== loading) return;
      unmount?.();
      const ctx: AppContext = { tests, currentId: entry.id, switchTo: (id) => { const t = byId(id); if (t) void show(t); } };
      unmount = module.mount(root, ctx);
      current = entry;
      pending = null;
      writeString(LAST_TEST_KEY, entry.id);
      history.replaceState(null, "", "#" + entry.id);
      performance.mark("mounted:" + entry.id);
      if (!first) {
        window.scrollTo({ top: 0 });
        root.querySelector<HTMLElement>(".test-switch .on")?.focus({ preventScroll: true });
      }
      first = false;
    } catch {
      if (ticket !== loading) return;
      pending = null;
      if (current) history.replaceState(null, "", "#" + current.id);
      notice = document.createElement("section");
      notice.className = "router-notice";
      notice.setAttribute("role", "alert");
      const message = document.createElement("p");
      message.textContent = `Не удалось открыть ${entry.title}. Проверьте соединение и попробуйте ещё раз.`;
      const retry = document.createElement("button");
      retry.className = "btn";
      retry.textContent = "Повторить";
      retry.addEventListener("click", () => void show(entry, true));
      const reload = document.createElement("button");
      reload.className = "btn";
      reload.textContent = "Обновить страницу";
      reload.addEventListener("click", () => { location.hash = entry.id; location.reload(); });
      notice.append(message, retry, reload);
      document.body.append(notice);
      retry.focus({ preventScroll: true });
    }
  }

  window.addEventListener("online", () => {
    if (notice && !pending) notice.querySelector<HTMLButtonElement>("button")?.click();
  });

  // Смена #smol / #smil в адресе или переход по такой ссылке на открытой странице.
  window.addEventListener("hashchange", () => {
    const study = parseStudyLink(location.hash);
    if (study) { showStudy(study); return; }
    const t = byId(location.hash.slice(1));
    if (t) void show(t);
  });

  const study = parseStudyLink(location.hash,location.search);
  if (study) showStudy(study);
  else void show(pick());
}
