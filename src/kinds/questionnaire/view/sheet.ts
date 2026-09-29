/*
 * Регистрационный лист: клетка на каждый вопрос с ответом и отметкой, менялся ли он.
 */
import { cellState } from "../engine";
import type { MaybeAnswer } from "../types";
import { LETTER } from "./context";

export function buildSheet(grid: HTMLElement, n: number): void {
  grid.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" class="cell st-empty" data-i="${i}"><i>${i + 1}</i><span></span></button>`).join("");
}

export function renderSheetCell(cell: HTMLElement, i: number, a: MaybeAnswer, history: readonly MaybeAnswer[], isLast: boolean): void {
  const st = cellState(history, a);
  cell.className = "cell st-" + st + (a === "Y" ? " a-Y" : a === "N" ? " a-N" : a === "?" ? " a-dk" : "") + (isLast ? " last" : "");
  cell.querySelector("span")!.textContent = a ? LETTER[a] : "";
  const hist = history.map((h) => (h === null ? "снят" : LETTER[h])).join(" → ");
  cell.title = `Вопрос ${i + 1}` + (hist ? `: ${hist}` : ": без ответа");
}
