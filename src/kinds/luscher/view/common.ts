/*
 * Мелкие кирпичики экрана Люшера: образцы цвета, фигуры, подписи шагов.
 */
import { escapeHtml } from "../../../app/html";
import { COLOR, PAIR_TABLES, type Step } from "../flow";
import type { LuscherDef } from "../types";

/** Квадратик цвета. extra — доп. классы (" sm", " plus", " minus"). */
export const swatch = (c: number, extra = "") =>
  `<span class="lu-sw${COLOR[c].dark ? " lt" : ""}${extra}" style="--c:${COLOR[c].hex}" title="${escapeHtml(COLOR[c].name)}"></span>`;

/** Несколько маленьких образцов в одну неразрывную строку. */
export const swatches = (list: number[]) => `<span class="lu-sws">${list.map((c) => swatch(c, " sm")).join("")}</span>`;

/** Фигуры 0–6: простые формы в оттенках серого. */
const FIGURES: Record<number, string> = {
  0: `<circle cx="50" cy="50" r="38"/>`,
  1: `<rect x="14" y="14" width="72" height="72"/>`,
  2: `<polygon points="50,10 90,84 10,84"/>`,
  3: `<polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38"/>`,
  4: `<polygon points="50,8 88,50 50,92 12,50"/>`,
  5: `<polygon points="36,10 64,10 64,36 90,36 90,64 64,64 64,90 36,90 36,64 10,64 10,36 36,36"/>`,
  6: `<polygon points="27,12 73,12 94,50 73,88 27,88 6,50"/>`
};

export const figureSvg = (n: number) => `<svg viewBox="0 0 100 100" aria-hidden="true">${FIGURES[n]}</svg>`;

export function stepTitle(def: LuscherDef, step: Step): string {
  switch (step.kind) {
    case "achromatic": return "Ахроматические цвета";
    case "rank": return def.variant === "short" ? `Выбор ${step.n}` : `Восьмицветовой ряд, выбор ${step.n}`;
    case "pause": return "Перерыв";
    case "pairs": {
      const t = PAIR_TABLES.find((x) => x.table === step.table)!;
      return `Таблица ${step.table}: ${t.title}${step.round === 2 ? " (повтор)" : ""}`;
    }
    case "figures": return "Фигуры";
  }
}

/** Короткая подпись шага в строке прогресса. */
export function stepShort(step: Step): string {
  switch (step.kind) {
    case "rank": return `Выбор ${step.n}`;
    case "pairs": return `Т${step.table}${step.round === 2 ? "′" : ""}`;
    case "achromatic": return "Ахром.";
    case "figures": return "Фигуры";
    case "pause": return "Пауза";
  }
}
