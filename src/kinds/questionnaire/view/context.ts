/*
 * Всё неизменное, что нужно частям экрана опросника: описание теста, ключи вопросов, отслеживаемые шкалы,
 * подсказки и форматирование. Собирается один раз при показе теста.
 */
import { questionKeys, type QuestionKey } from "../engine";
import type { Answer, Hints, QuestionnaireDef } from "../types";

export interface ViewCtx {
  def: QuestionnaireDef;
  n: number;
  order: string[];
  /** Шкалы, на которых делаем упор. */
  focus: ReadonlySet<string>;
  keys: QuestionKey[][];
  hints: Hints;
  /** Есть свой список «правильных» ответов — подсвечивается только он. */
  useHints: boolean;
  /** Подсвечивать ответы по ключу (когда своего списка нет). */
  keyHighlight: boolean;
  /** Есть ли ответ «Не знаю» (в ММИЛ выбор обязательный). */
  dk: boolean;
  scaleLabel(s: string): string;
  /** Т-балл для показа: «≈» за краем таблицы, «−» вместо дефиса. */
  fmtT(t: number | null, extrapolated?: boolean): string;
}

export const WORD: Record<Answer, string> = { Y: "Да", N: "Нет", "?": "Не знаю" };
export const LETTER: Record<Answer, string> = { Y: "Д", N: "Н", "?": "?" };
export const LEVEL_WORD: Record<string, string> = { high: "высокое", low: "низкое" };

/** Разность со знаком: «+2», «−1», «±0». */
export function signed(v: number, digits: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
}

export function createViewCtx(def: QuestionnaireDef): ViewCtx {
  const useHints = Object.keys(def.ui.hints).length > 0;
  return {
    def,
    n: def.questions.length,
    order: def.scaleOrder,
    focus: new Set(def.ui.focus),
    keys: questionKeys(def),
    hints: def.ui.hints,
    useHints,
    keyHighlight: !useHints && def.ui.keyHighlight,
    dk: def.allowDontKnow !== false,
    scaleLabel: (s) => `${def.scaleInfo[s].code}: ${def.scaleInfo[s].name}`,
    fmtT: (t, extrapolated) => (t === null ? "—" : (extrapolated ? "≈" : "") + t.toFixed(def.tDigits).replace("-", "−"))
  };
}
