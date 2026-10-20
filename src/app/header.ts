/*
 * Шапка любого теста: переключатель тестов, свои кнопки теста, тема и «Сбросить». Одинаковая разметка
 * и одинаковые id кнопок (keyBtn, themeBtn, resetBtn) у всех видов тестов — новый тест получает шапку одной строкой.
 *
 * На телефоне (COMPACT) шапка в одну строку: кнопка с названием теста открывает список тестов, «⋯» — меню
 * с кнопками теста, темой и сбросом. Это те же элементы, что на широком экране: на узком им ставится
 * атрибут popover, и браузер сам показывает их поверх страницы, закрывает по Esc и по нажатию мимо.
 */
import { escapeHtml } from "./html";
import { ICON } from "./icons";
import type { Scope } from "./scope";
import { bindTestSwitch, testSwitchHtml } from "./testSwitch";
import { bindThemeButton } from "./theme";
import type { AppContext } from "./types";

/** Ширина, до которой шапка складывается в одну строку с меню. */
export const COMPACT_QUERY = "(max-width: 760px)";

export interface ButtonSpec {
  id: string;
  /** Подпись на широком экране. */
  label: string;
  /** Подпись на телефоне (по умолчанию та же; пустая — только значок). */
  short?: string;
  /** Доп. классы: btn-key, btn-ghost, btn-reset. */
  cls?: string;
  title?: string;
  /** Кнопка-переключатель: начальное aria-pressed. */
  pressed?: boolean;
  /** Значок перед подписью (из ICON). */
  icon?: string;
}

export function buttonHtml(b: ButtonSpec): string {
  const pressed = b.pressed === undefined ? "" : ` aria-pressed="${b.pressed}"`;
  const title = b.title ? ` title="${escapeHtml(b.title)}" aria-label="${escapeHtml(b.title)}"` : "";
  const short = b.short ?? b.label;
  return `<button type="button" class="btn ${b.cls ?? ""}${b.icon ? " has-ico" : ""}" id="${b.id}"${pressed}${title}>${b.icon ?? ""}` +
    `<span class="long">${escapeHtml(b.label)}</span>${short ? `<span class="short">${escapeHtml(short)}</span>` : ""}</button>`;
}

/** Кнопка «Эталонные ответы» (режим ключа) — есть у всех тренажёров. Выглядит как переключатель. */
export const keyButton = (pressed = false): ButtonSpec => ({ id: "keyBtn", label: "Эталонные ответы", short: "Эталонные ответы", cls: "btn-key", pressed });

export interface HeaderOptions {
  id?: string;
  /** Подпись панели для чтения с экрана. */
  label?: string;
  cls?: string;
  /** Первым в меню действий (например, плашка достоверности). */
  afterSwitch?: string;
  /** Кнопки теста перед темой и «Сбросить»; на телефоне уходят в меню «⋯». */
  actions?: string[];
  /** Кнопки, которые и на телефоне остаются в строке (например, «Назад» у Люшера). */
  bar?: string[];
  /** Строки под шапкой внутри липкой панели. */
  below?: string;
  resetTitle?: string;
}

export function headerHtml(ctx: AppContext, o: HeaderOptions = {}): string {
  const cur = ctx.tests.find((t) => t.id === ctx.currentId);
  return `
  <header class="panel ${o.cls ?? ""}"${o.id ? ` id="${o.id}"` : ""}${o.label ? ` aria-label="${escapeHtml(o.label)}"` : ""}>
    <div class="wrap">
      ${cur ? `<h1 class="sr-only">${escapeHtml(`${cur.title}: ${cur.hint}`)}</h1>` : ""}
      <div class="panel-head">
        <button type="button" class="test-pick" id="testPick" popovertarget="testList" aria-label="Выбрать тест"><span class="tp">${escapeHtml(cur?.title ?? "")}</span>${ICON.chevron}</button>
        ${testSwitchHtml(ctx)}
        <span class="spacer"></span>
        ${(o.bar ?? []).join("\n        ")}
        <div class="head-actions" id="headActions">
          ${o.afterSwitch ?? ""}
          ${(o.actions ?? []).join("\n          ")}
          <button type="button" class="btn btn-theme" id="themeBtn"></button>
          ${buttonHtml({ id: "resetBtn", label: "Сбросить", short: "Сбросить", cls: "btn-reset", title: o.resetTitle ?? "Сбросить ответы" })}
        </div>
        <button type="button" class="btn-more" id="moreBtn" popovertarget="headActions" aria-label="Ещё действия">${ICON.more}</button>
      </div>
      ${o.below ?? ""}
    </div>
  </header>`;
}

/** Оживить общую часть шапки: переключатель тестов, кнопку темы и меню телефона. */
export function bindHeader(root: ParentNode, ctx: AppContext, scope: Scope): void {
  bindTestSwitch(root, ctx, scope.signal);
  bindThemeButton(root.querySelector<HTMLElement>("#themeBtn")!, scope.signal);

  const list = root.querySelector<HTMLElement>("#testList")!;
  const actions = root.querySelector<HTMLElement>("#headActions")!;
  const compact = window.matchMedia(COMPACT_QUERY);
  // Меню — только на узком экране; на широком те же элементы стоят в строке.
  const apply = () => {
    for (const el of [list, actions]) {
      if (compact.matches) el.setAttribute("popover", "auto");
      else {
        if (el.matches(":popover-open")) el.hidePopover();
        el.removeAttribute("popover");
      }
    }
  };
  apply();
  scope.on(compact, "change", apply);
  // Выбрали тест — список закрывается сам (страница перерисуется).
  scope.on(list, "click", (e) => { if ((e.target as Element).closest("button") && list.matches(":popover-open")) list.hidePopover(); });
}

/** Показать состояние кнопки-переключателя. */
export function setPressed(btn: HTMLElement, on: boolean, labels?: { on: string; off: string }): void {
  btn.setAttribute("aria-pressed", String(on));
  if (labels) btn.querySelector(".long")!.textContent = on ? labels.on : labels.off;
}

/**
 * На планшете строка с переключателем тестов и кнопками уезжает вверх вместе со страницей,
 * а под ней остаётся то, что нужно во время ответов. Возвращает, на сколько шапка уходит за верх экрана.
 * На телефоне шапка и так в одну строку и прилипает целиком.
 */
export function pinPanel(panel: HTMLElement, narrow: boolean): number {
  const off = narrow && !window.matchMedia(COMPACT_QUERY).matches ? panel.querySelector<HTMLElement>(".panel-head")!.offsetHeight : 0;
  panel.style.top = off ? `-${off}px` : "";
  return off;
}
