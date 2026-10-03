/*
 * Как считается опросник — только на сервере. Открытая часть описания (тексты, шкалы, экран) —
 * QuestionnaireSpec в src/kinds/questionnaire/types.ts; полное описание добавляет к ней ключи, нормы и правила.
 */
import type { Hints, QuestionnaireSpec, Validity } from "../../src/kinds/questionnaire/types";

/** Ключ шкалы: номера вопросов (с 1), которые засчитываются ответом «Да» и ответом «Нет». */
export interface ScaleKey {
  yes: number[];
  no: number[];
}

export interface TScore {
  t: number;
  /** Т получен продлением таблицы за её край (показывается с «≈»). */
  extrapolated: boolean;
}

/** Что нужно правилу достоверности: сырые и Т-баллы. */
export interface ScoresForValidity {
  raw: Record<string, number>;
  t: Record<string, number>;
}

/** Полное описание опросника. Всё, чем тесты отличаются друг от друга, — здесь. */
export interface QuestionnaireDef extends QuestionnaireSpec {
  key: Record<string, ScaleKey>;
  /** Сколько прибавить к шкалам при сыром K = k. */
  kCorrection(k: number): Record<string, number>;
  /** Перевод балла (с поправкой K) в Т. */
  tScore(scale: string, x: number): TScore;
  validity(scores: ScoresForValidity): Validity;
  /** Контрольные пункты («Номер данного пункта следует обвести кружочком»): правильно отвечать «Не знаю». */
  controlItems?: number[];
  /** Свой список «правильных» ответов для «Показать ключ». Пустой — подсвечиваются ответы по ключу. */
  hints: Hints;
}
