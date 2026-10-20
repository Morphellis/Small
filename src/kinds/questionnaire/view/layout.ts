/*
 * Разметка экрана опросника. Id элементов — точки, за которые берутся остальные части экрана и проверки
 * в браузере (tools/e2e), поэтому их не переименовывать без нужды.
 */
import { buttonHtml, headerHtml, keyButton } from "../../../app/header";
import { ICON } from "../../../app/icons";
import type { AppContext } from "../../../app/types";

export function layoutHtml(ctx: AppContext, dk: boolean, n: number): string {
  const header = headerHtml(ctx, {
    id: "panel",
    label: "Баллы",
    afterSwitch: `<details class="validity" id="validity"><summary id="validitySum"></summary><div class="validity-body" id="validityBody"></div></details>`,
    actions: [
      buttonHtml(keyButton()),
      buttonHtml({ id: "toggleProfile", label: "Шкалы", cls: "btn-ghost", pressed: true })
    ],
    // Эта часть шапки остаётся на экране и на телефоне: сколько отвечено, что изменил последний ответ, все шкалы.
    below:
      `<div class="status">` +
      // Сколько отвечено и полоса прогресса; нажатие ведёт к первому вопросу без ответа.
      `<button type="button" class="btn-next" id="nextBtn"><span class="cnt"><b id="doneCount">0</b> из ${n}<span class="hint"> · к пропущенному</span></span>` +
      `<span class="track" aria-hidden="true"><i id="progressFill"></i></span></button>` +
      `<div class="impact" id="impact" aria-live="polite"></div>` +
      `<div class="strip" id="strip"></div></div>`
  });

  return `${header}

  <div class="wrap layout" id="layout">
    <main class="main">
      <p class="keys-hint">Клавиши: <kbd>1</kbd> Да · <kbd>2</kbd> Нет · ${dk ? "<kbd>3</kbd> Не знаю · " : ""}<kbd>0</kbd> снять ответ · <kbd>↑</kbd><kbd>↓</kbd> другой вопрос</p>
      <ol class="questions" id="questions"></ol>

      <section class="finish" id="finish" hidden>
        <p><b>Готово:</b> отвечены все ${n}.</p>
        <button type="button" class="btn" id="finishBtn">Открыть профиль</button>
      </section>

      <section class="sheet" aria-labelledby="sheetTitle">
        <h2 id="sheetTitle">Регистрационный лист</h2>
        <div class="sheet-scroll"><div class="sheet-grid" id="sheetGrid"></div></div>
        <ul class="legend">
          <li><span class="cell st-empty"></span>нет ответа</li>
          <li><span class="cell st-first a-Y">Д</span><span class="cell st-first a-N">Н</span>ответ с первого раза</li>
          <li><span class="cell st-changed a-N">Н</span>ответ менялся</li>${dk ? `
          <li><span class="cell st-dk a-dk">?</span>«Не знаю»</li>
          <li><span class="cell st-dkAfter a-dk">?</span>«Не знаю» после «Да» или «Нет»</li>` : ""}
        </ul>
      </section>
    </main>

    <!-- Подробный профиль: колонка справа на широком экране, выезжающая снизу шторка на телефоне и планшете -->
    <aside class="side" id="side" aria-labelledby="sideTitle" tabindex="-1">
      <div class="side-top">
        <h2 id="sideTitle">Профиль</h2>
        <div class="view-switch" role="group" aria-label="Вид профиля">
          <button type="button" data-view="table" aria-pressed="false">Таблица</button>
          <button type="button" data-view="bars" aria-pressed="false">Шкалы</button>
          <button type="button" data-view="chart" aria-pressed="false">График</button>
        </div>
        <button type="button" class="side-close" id="sideClose" aria-label="Закрыть профиль">${ICON.close}</button>
      </div>
      <p class="side-empty">Профиль появится после первого ответа.</p>
      <div class="chart-wrap" id="chartWrap">
        <div class="bars" id="bars"></div>
        <svg id="chart" viewBox="0 0 600 290" role="img" aria-label="Профиль Т-баллов"></svg>
      </div>
      <div class="table-wrap" id="tableWrap">
        <table class="scores" id="scoreTable">
          <thead>
            <tr><th class="num">Т</th><th class="num">Сырые</th><th>Шкала</th><th class="num" title="Сдвиг Т после последнего ответа">Δ Т</th></tr>
          </thead>
          <tbody id="scoreBody"></tbody>
        </table>
      </div>
      <p class="side-note">Это тренажёр. Профиль здесь не заключение психолога и не диагноз.</p>
    </aside>
  </div>

  <button type="button" class="side-open" id="sideOpen" aria-controls="side">Профиль и шкалы${ICON.chevronUp}</button>`;
}
