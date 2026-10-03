/*
 * Всё, что нужно частям экрана опросника: описание теста, ключи вопросов, отслеживаемые шкалы,
 * подсказки и форматирование. Собирается при показе теста; ключ и подсказки приходят с сервера чуть позже (setKeys).
 */
import type { Answer, Hints, KeysResponse, QuestionKey, QuestionnaireSpec } from "../types";

export interface ViewCtx {
  def: QuestionnaireSpec;
  n: number;
  order: string[];
  /** Шкалы, на которых делаем упор. */
  focus: ReadonlySet<string>;
  /** Ключ по отслеживаемым шкалам; пока не пришёл с сервера — пустой, а keysReady = false. */
  keys: QuestionKey[][];
  keysReady: boolean;
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

export function createViewCtx(def: QuestionnaireSpec): ViewCtx {
  return {
    def,
    n: def.questions.length,
    order: def.scaleOrder,
    focus: new Set(def.ui.focus),
    keys: def.questions.map(() => []),
    keysReady: false,
    hints: {},
    useHints: false,
    keyHighlight: false,
    dk: def.allowDontKnow !== false,
    scaleLabel: (s) => `${def.scaleInfo[s].code}: ${def.scaleInfo[s].name}`,
    fmtT: (t, extrapolated) => (t === null ? "—" : (extrapolated ? "≈" : "") + t.toFixed(def.tDigits).replace("-", "−"))
  };
}

/** Ключ и свой список ответов пришли с сервера. */
export function setKeys(v: ViewCtx, r: KeysResponse): void {
  v.keys = r.keys;
  v.hints = r.hints;
  v.useHints = Object.keys(r.hints).length > 0;
  v.keyHighlight = !v.useHints && v.def.ui.keyHighlight;
  v.keysReady = true;
}
