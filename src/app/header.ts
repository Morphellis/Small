/*
 * Шапка любого теста: переключатель тестов, свои кнопки теста, тема и «Сбросить». Одинаковая разметка
 * и одинаковые id кнопок (keyBtn, themeBtn, resetBtn) у всех видов тестов — новый тест получает шапку одной строкой.
 */
import { escapeHtml } from "./html";
import type { Scope } from "./scope";
import { bindTestSwitch, testSwitchHtml } from "./testSwitch";
import { bindThemeButton } from "./theme";
import type { AppContext } from "./types";

export interface ButtonSpec {
  id: string;
  /** Подпись на широком экране. */
  label: string;
  /** Подпись на телефоне (по умолчанию та же). */
  short?: string;
  /** Доп. классы: btn-key, btn-ghost, btn-reset. */
  cls?: string;
  title?: string;
  /** Кнопка-переключатель: начальное aria-pressed. */
  pressed?: boolean;
}

export function buttonHtml(b: ButtonSpec): string {
  const pressed = b.pressed === undefined ? "" : ` aria-pressed="${b.pressed}"`;
  const title = b.title ? ` title="${escapeHtml(b.title)}" aria-label="${escapeHtml(b.title)}"` : "";
  return `<button type="button" class="btn ${b.cls ?? ""}" id="${b.id}"${pressed}${title}>` +
    `<span class="long">${escapeHtml(b.label)}</span><span class="short">${escapeHtml(b.short ?? b.label)}</span></button>`;
}

/** Кнопка «Эталонные ответы» (режим ключа) — есть у всех тренажёров. Включена — кнопка залита зелёным. */
export const keyButton = (pressed = false): ButtonSpec => ({ id: "keyBtn", label: "Эталонные ответы", cls: "btn-key", pressed });

export interface HeaderOptions {
  id?: string;
  /** Подпись панели для чтения с экрана. */
  label?: string;
  cls?: string;
  /** Сразу за переключателем тестов (например, плашка достоверности). */
  afterSwitch?: string;
  /** Кнопки теста перед темой и «Сбросить». */
  actions?: string[];
  /** Строки под шапкой внутри липкой панели. */
  below?: string;
  resetTitle?: string;
}

export function headerHtml(ctx: AppContext, o: HeaderOptions = {}): string {
  return `
  <header class="panel ${o.cls ?? ""}"${o.id ? ` id="${o.id}"` : ""}${o.label ? ` aria-label="${escapeHtml(o.label)}"` : ""}>
    <div class="wrap">
      <div class="panel-head">
        ${testSwitchHtml(ctx)}
        ${o.afterSwitch ?? ""}
        <span class="spacer"></span>
        ${(o.actions ?? []).join("\n        ")}
        <button type="button" class="btn btn-theme" id="themeBtn" aria-label="Переключить тему"></button>
        ${buttonHtml({ id: "resetBtn", label: "Сбросить", short: "↺", cls: "btn-reset", title: o.resetTitle ?? "Сбросить результаты" })}
      </div>
      ${o.below ?? ""}
    </div>
  </header>`;
}

/** Оживить общую часть шапки: переключатель тестов и кнопку темы. */
export function bindHeader(root: ParentNode, ctx: AppContext, scope: Scope): void {
  bindTestSwitch(root, ctx, scope.signal);
  bindThemeButton(root.querySelector<HTMLElement>("#themeBtn")!, scope.signal);
}

/** Показать состояние кнопки-переключателя. */
export function setPressed(btn: HTMLElement, on: boolean, labels?: { on: string; off: string }): void {
  btn.setAttribute("aria-pressed", String(on));
  if (labels) btn.querySelector(".long")!.textContent = on ? labels.on : labels.off;
}
