/*
 * Тема. Начальную (сохранённый выбор или как в системе) ставит маленький скрипт в index.html ещё до отрисовки,
 * чтобы страница не мигала. Здесь — кнопка переключения, её можно поставить в шапку любого теста.
 */
import { writeString } from "./storage";

export const THEME_KEY = "trainer-theme";

const isLight = () => document.documentElement.getAttribute("data-theme") === "light";

/** Кнопка показывает, на какую тему переключит: в тёмной — солнце, в светлой — луна. */
export function renderThemeButton(btn: HTMLElement): void {
  const light = isLight();
  btn.textContent = light ? "☾" : "☀";
  btn.title = light ? "Включить тёмную тему" : "Включить светлую тему";
}

export function bindThemeButton(btn: HTMLElement, signal: AbortSignal): void {
  renderThemeButton(btn);
  btn.addEventListener(
    "click",
    () => {
      const next = isLight() ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      writeString(THEME_KEY, next);
      renderThemeButton(btn);
    },
    { signal }
  );
}
