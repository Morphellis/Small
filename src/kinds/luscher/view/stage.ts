/*
 * Текущий шаг теста Люшера: вопрос, карточки (или фигуры, или пара цветов), подсказка ключа, уже выбранное.
 */
import { escapeHtml } from "../../../app/html";
import { ACHROMATIC, ACHROMATIC_LAYOUT, COLOR, FIGURE_GRID, PAIR_LINES, PAIR_TABLES, hintFor, isDislikePhase, type Step } from "../flow";
import type { Derived } from "../model";
import type { LuscherDef } from "../types";
import { figureSvg, stepTitle, swatch } from "./common";

interface Card {
  value: number;
  color: number;
  gone: boolean;
  hint: boolean;
}

function cardsHtml(cards: Card[], cls: string): string {
  return `<div class="lu-cards ${cls}">${cards.map((c) =>
    c.gone
      ? `<span class="lu-card gone"></span>`
      : `<button type="button" class="lu-card${COLOR[c.color].dark ? " lt" : ""}${c.hint ? " hint" : ""}" data-v="${c.value}" style="--c:${COLOR[c.color].hex}" aria-label="${escapeHtml(COLOR[c.color].name)}"></button>`
  ).join("")}</div>`;
}

function questionHtml(def: LuscherDef, step: Step, k: number): string {
  const dislike = isDislikePhase(def.variant, step, k);
  const word = dislike ? `<b class="w-dis">неприятен</b>` : `<b class="w-like">симпатичен</b>`;
  const pill = dislike
    ? ` <span class="lu-pill dis">выбираете, какой не нравится</span>`
    : ` <span class="lu-pill like">выбираете, какой нравится</span>`;
  switch (step.kind) {
    case "achromatic":
      return (k === 0 ? `Какой из этих пяти цветов вам наиболее ${word}?` : `Какой из оставшихся цветов вам наиболее ${word}?`) + pill;
    case "rank":
      return (k === 0 ? `Какой из этих восьми цветов вам наиболее ${word}?` : `Какой из оставшихся цветов вам наиболее ${word}?`) + pill;
    case "pairs":
      return `Какой из этих двух цветов вам более <b>симпатичен</b>? <span class="lu-count">Пара ${k + 1} из 6</span>`;
    case "figures":
      return (dislike
        ? `Выберите две <b class="w-dis">несимпатичные</b> вам фигуры (${k - 1} из 2).`
        : `Выберите две <b class="w-like">симпатичные</b> вам фигуры (${k + 1} из 2).`) + pill;
    case "pause":
      return "";
  }
}

function bodyHtml(step: Step, picks: number[], k: number, hint: number | null, layout: number[] | null): string {
  switch (step.kind) {
    case "pause":
      return `
        <div class="lu-pause">
          <p>Методика предполагает два подхода с небольшим перерывом.</p>
          <p>Подождите пару минут и нажмите «Продолжить». Не старайтесь ни повторить первый порядок, ни специально его изменить — выбирайте так, будто видите цвета впервые.</p>
          <button type="button" class="btn lu-go" data-go>Продолжить тест</button>
        </div>`;
    case "rank":
      return cardsHtml(layout!.map((c) => ({ value: c, color: c, gone: picks.includes(c), hint: c === hint })), "lu-row8");
    case "achromatic":
      return cardsHtml(ACHROMATIC_LAYOUT.map((id) => ({ value: id, color: ACHROMATIC[id], gone: picks.includes(id), hint: false })), "lu-row5");
    case "pairs": {
      const t = PAIR_TABLES.find((x) => x.table === step.table)!;
      return cardsHtml(PAIR_LINES[k].map((n) => ({ value: n, color: t.colors[n - 1], gone: false, hint: false })), "lu-row2");
    }
    case "figures":
      return `<div class="lu-figs">${FIGURE_GRID.flat().map((f) =>
        f === null ? `<span></span>` : picks.includes(f) ? `<span class="lu-fig gone"></span>` :
          `<button type="button" class="lu-fig" data-v="${f}" aria-label="Фигура ${f + 1}">${figureSvg(f)}</button>`
      ).join("")}</div>`;
  }
}

/** layout — раскладка восьми цветов, если текущий шаг — восьмицветовой выбор. */
export function stageHtml(def: LuscherDef, d: Derived, keyMode: boolean, layout: number[] | null): string {
  const { step, k } = d;
  if (!step) return `<div class="lu-done"><b>Тест пройден.</b> Итог — в блоке «Результат». Чтобы пройти ещё раз, нажмите «Сбросить».</div>`;
  const picks = d.picks[step.id] ?? [];
  const hint = keyMode ? hintFor(def.variant, step, k) : null;
  const note = !keyMode || step.kind === "pause" ? ""
    : hint !== null
      ? `<p class="lu-note key">Эталонный ответ: выберите отмеченный цвет — <b>${escapeHtml(COLOR[hint].name)}</b>.</p>`
      : `<p class="lu-note">На тревожность этот шаг не влияет — выбирайте как угодно.</p>`;
  const chosen = step.kind === "rank" || step.kind === "achromatic"
    ? `<div class="lu-chosen">${picks.map((c, i) => `<span class="lu-chip${isDislikePhase(def.variant, step, i) ? " dis" : ""}">${
        swatch(step.kind === "achromatic" ? ACHROMATIC[c] : c)}</span>`).join("")}</div>`
    : "";
  return `
      <div class="lu-step-head"><span class="lu-step-no">Шаг ${d.stepNo} из ${d.steps.length}</span><h2>${escapeHtml(stepTitle(def, step))}</h2></div>
      ${step.kind === "pause" ? "" : `<p class="lu-ask${isDislikePhase(def.variant, step, k) ? " dis" : ""}">${questionHtml(def, step, k)}</p>`}
      ${note}
      ${bodyHtml(step, picks, k, hint, layout)}
      ${chosen}
      <p class="keys-hint">Клавиши: <kbd>1</kbd>, <kbd>2</kbd>… — карточка по порядку · <kbd>Backspace</kbd> отменить выбор${step.kind === "pause" ? " · <kbd>Enter</kbd> продолжить" : ""}</p>`;
}
