/*
 * Опросник: вопросы с ответами «Да / Нет / Не знаю», шкалы, Т-баллы и достоверность.
 * Так устроены СМОЛ, СМИЛ и другие тесты семейства MMPI.
 *
 * Здесь — только то, что видит браузер: тексты, названия шкал, настройки экрана и форма ответов сервера.
 * Как считать (ключи, нормы, поправка K, правила достоверности, свои списки ответов) знает только сервер:
 * server/questionnaire/types.ts.
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

/** В какую шкалу и каким ответом засчитывается вопрос. */
export interface QuestionKey {
  scale: string;
  answer: Answer;
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

/** Профиль — то, что сервер возвращает на набор ответов. */
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

/** Открытая часть описания опросника: всё, что нужно экрану. */
export interface QuestionnaireSpec {
  id: string;
  /** Название в текстах: «По методике СМИЛ…». */
  title: string;
  /** Ключ в localStorage для ответов. Не менять: иначе у людей пропадут сохранённые ответы. */
  storageKey: string;

  questions: string[];
  scaleOrder: string[];
  scaleInfo: Record<string, ScaleInfo>;

  /** Шкалы, к которым прибавляется поправка K (в таблице у них сырой балл с поправкой в скобках). */
  kCorrected: string[];
  /** Знаков после запятой у Т. */
  tDigits: number;
  /** Т ≥ high — высокое значение, Т ≤ low — низкое (подписи оси на полосах профиля). */
  thresholds: { high: number; low: number };
  /** Правило достоверности одной фразой — для пояснения у плашки. */
  validityRule: string;

  /** false — выбор обязательный, только «Да» или «Нет» (как в ММИЛ). По умолчанию «Не знаю» есть. */
  allowDontKnow?: boolean;

  ui: QuestionnaireUi;
}

/** Настройки экрана опросника. */
export interface QuestionnaireUi {
  /** Шкалы, на которых делаем упор: влияние ответа, ключ и подсветка только по ним, остальные приглушены. */
  focus: string[];
  /** Подсвечивать ответы по ключу, пока своего списка «правильных» ответов нет. */
  keyHighlight: boolean;
  /** Диапазон Т на полосах профиля. */
  bars: { min: number; max: number };
  /** Коридор нормы на графике. */
  band: [number, number];
}

// ---------- обмен с сервером (server/api.ts) ----------

/** GET api/questionnaire/<id>/keys — ключ по отслеживаемым шкалам и свой список ответов (для «Показать ключ»). */
export interface KeysResponse {
  /** Для каждого вопроса (с 0): в какие отслеживаемые шкалы (ui.focus) и каким ответом он засчитывается. */
  keys: QuestionKey[][];
  hints: Hints;
}

/** POST api/questionnaire/<id>/score. answers — по символу на вопрос: Y, N, ? или «.» (нет ответа). */
export interface ScoreRequest {
  answers: string;
}

export interface ScoreResponse {
  profile: Profile;
}
