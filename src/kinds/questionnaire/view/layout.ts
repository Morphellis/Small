/*
 * Разметка экрана опросника. Id элементов — точки, за которые берутся остальные части экрана и проверки
 * в браузере (tools/e2e), поэтому их не переименовывать без нужды.
 */
import { buttonHtml, headerHtml, keyButton } from "../../../app/header";
import type { AppContext } from "../../../app/types";

export function layoutHtml(ctx: AppContext, dk: boolean): string {
  const header = headerHtml(ctx, {
    id: "panel",
    label: "Баллы",
    afterSwitch: `<details class="validity" id="validity"><summary id="validitySum"></summary><div class="validity-body" id="validityBody"></div></details>`,
    actions: [
      `<span class="toast" id="toast" role="status" aria-live="polite"></span>`,
      buttonHtml(keyButton()),
      buttonHtml({ id: "toggleProfile", label: "Шкалы", cls: "btn-ghost", pressed: true })
    ],
    // Что изменил последний ответ и все шкалы одной полоской — всегда перед глазами.
    below: `<div class="impact" id="impact" aria-live="polite"></div>\n      <div class="strip" id="strip" tabindex="0" aria-label="Шкалы, прокручиваются горизонтально"></div>`
  });

  return `${header}

  <div class="wrap layout" id="layout">
    <main class="main" id="testContent" role="tabpanel" aria-labelledby="test-tab-${ctx.currentId}">
      <div class="question-progress" aria-label="Прогресс опросника">
        <span id="progressText" role="status"></span>
        <button type="button" class="btn" id="nextUnanswered">К пропущенному</button>
        <progress id="questionProgress" value="0" max="1" aria-label="Количество ответов"></progress>
      </div>
      <p class="keys-hint">Клавиши: <kbd>1</kbd> Да · <kbd>2</kbd> Нет · ${dk ? "<kbd>3</kbd> Не знаю · " : ""}<kbd>0</kbd> снять ответ · <kbd>↑</kbd><kbd>↓</kbd> другой вопрос</p>
      <ol class="questions" id="questions"></ol>

      <section class="sheet" aria-labelledby="sheetTitle">
        <h2 id="sheetTitle">Регистрационный лист</h2>
        <div class="sheet-scroll"><div class="sheet-grid" id="sheetGrid"></div></div>
        <ul class="legend">
          <li><span class="cell st-empty"></span>нет ответа</li>
          <li><span class="cell st-first a-Y">Д</span><span class="cell st-first a-N">Н</span>«Да» или «Нет» с первого раза</li>
          <li><span class="cell st-changed a-N">Н</span>ответ менялся (Да ↔ Нет${dk ? " или после «Не знаю»" : ""})</li>${dk ? `
          <li><span class="cell st-dk a-dk">?</span>«Не знаю»</li>
          <li><span class="cell st-dkAfter a-dk">?</span>сначала «Да»/«Нет», затем «Не знаю»</li>` : ""}
        </ul>
      </section>
    </main>

    <!-- Подробный профиль: колонка справа на широком экране, выезжающая снизу шторка на телефоне и планшете -->
    <aside class="side" id="side" aria-label="Шкалы">
      <div class="side-top">
        <div class="side-head"><b>Шкалы</b><button type="button" class="side-close" id="sideClose" aria-label="Закрыть шкалы">✕</button></div>
        <div class="view-switch" role="tablist" aria-label="Вид шкал">
          <button type="button" role="tab" id="view-table" aria-controls="tableWrap" data-view="table">Таблица</button>
          <button type="button" role="tab" id="view-bars" aria-controls="chartWrap" data-view="bars">Шкалы</button>
          <button type="button" role="tab" id="view-chart" aria-controls="chartWrap" data-view="chart">График</button>
        </div>
      </div>
      <div class="chart-wrap" id="chartWrap" role="tabpanel" aria-labelledby="view-chart">
        <div class="bars" id="bars"></div>
        <svg id="chart" viewBox="0 0 600 290" role="img" aria-label="Профиль Т-баллов"></svg>
      </div>
      <div class="table-wrap" id="tableWrap" role="tabpanel" aria-labelledby="view-table">
        <table class="scores" id="scoreTable">
          <thead>
            <tr><th class="num">Т-баллы</th><th class="num">Сырые</th><th>Шкалы</th><th class="num" title="Изменение Т после последнего ответа">Δ Т</th></tr>
          </thead>
          <tbody id="scoreBody"></tbody>
        </table>
      </div>
    </aside>
  </div>

  <button type="button" class="side-open" id="sideOpen" aria-controls="side">▲ Нажмите для открытия шкал</button>`;
}
