/*
 * Опросник: вопросы с ответами «Да / Нет / Не знаю», шкалы по ключу, поправки, Т-баллы и достоверность.
 * Так устроены СМОЛ, СМИЛ и другие тесты семейства MMPI. Конкретный тест описывает себя объектом
 * QuestionnaireDef, а подсчёт (engine.ts) и экран (view.ts) общие.
 */

/** Ответ: «Да / верно», «Нет / неверно», «Не знаю». */
export type Answer = "Y" | "N" | "?";
/** Ответ или его отсутствие. */
export type MaybeAnswer = Answer | null;

/** Свой список «правильных» ответов для подсветки: номер вопроса (с 1) → ответ. */
export type Hints = Record<number, Answer>;

export interface ScaleInfo {
  /** Код на полоске и в таблице: «L», «1». */
  code: string;
  /** В родительном падеже: «шкала Лжи». */
  name: string;
  /** Подпись на полосах профиля: «Ложь». */
  title: string;
  /** Контрольная (L, F, K) или клиническая. */
  group: "control" | "clinical";
}

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

export interface ValidityCheck {
  scale: string;
  value: number;
  /** «Т», если сравниваются Т-баллы; пусто, если сырые. */
  unit: string;
  limit: number;
  exceeded: boolean;
  reason: string | null;
}

export interface Validity {
  valid: boolean;
  checks: ValidityCheck[];
}

export type Level = "high" | "low" | "norm";

export interface Profile {
  raw: Record<string, number>;
  /** Сколько прибавлено к шкалам поправкой K. */
  kAdd: Record<string, number>;
  corrected: Record<string, number>;
  t: Record<string, number>;
  extrapolated: Record<string, boolean>;
  level: Record<string, Level>;
  dontKnow: number;
  answered: number;
  /** Контрольные пункты, отмеченные «Не знаю» (0, если у теста их нет). */
  controlCorrect: number;
  controlTotal: number;
  validity: Validity;
}

/** Что нужно правилу достоверности: сырые и Т-баллы. */
export interface ScoresForValidity {
  raw: Record<string, number>;
  t: Record<string, number>;
}

/** Описание опросника. Всё, чем тесты отличаются друг от друга, — здесь. */
export interface QuestionnaireDef {
  id: string;
  /** Название в текстах: «По методике СМИЛ…». */
  title: string;
  /** Ключ в localStorage для ответов. Не менять: иначе у людей пропадут сохранённые ответы. */
  storageKey: string;

  questions: string[];
  scaleOrder: string[];
  scaleInfo: Record<string, ScaleInfo>;
  key: Record<string, ScaleKey>;

  /** Шкалы, к которым прибавляется поправка K. */
  kCorrected: string[];
  /** Сколько прибавить к шкалам при сыром K = k. */
  kCorrection(k: number): Record<string, number>;
  /** Перевод балла (с поправкой K) в Т. */
  tScore(scale: string, x: number): TScore;
  /** Знаков после запятой у Т. */
  tDigits: number;
  /** Т ≥ high — высокое значение, Т ≤ low — низкое. */
  thresholds: { high: number; low: number };

  validity(scores: ScoresForValidity): Validity;
  /** Правило достоверности одной фразой — для пояснения у плашки. */
  validityRule: string;

  /** Контрольные пункты («Номер данного пункта следует обвести кружочком»): правильно отвечать «Не знаю». */
  controlItems?: number[];

  /** false — выбор обязательный, только «Да» или «Нет» (как в ММИЛ). По умолчанию «Не знаю» есть. */
  allowDontKnow?: boolean;

  ui: QuestionnaireUi;
}

/** Настройки экрана опросника. */
export interface QuestionnaireUi {
  /** Шкалы, на которых делаем упор: влияние ответа, ключ и подсветка только по ним, остальные приглушены. */
  focus: string[];
  /** Свой список «правильных» ответов. */
  hints: Hints;
  /** Подсвечивать ответы по ключу, пока список hints пуст. */
  keyHighlight: boolean;
  /** Диапазон Т на полосах профиля. */
  bars: { min: number; max: number };
  /** Коридор нормы на графике. */
  band: [number, number];
}
