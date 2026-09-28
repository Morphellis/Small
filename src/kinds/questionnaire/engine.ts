/*
 * Общий подсчёт опросника: ответы → сырые баллы по ключу → поправка K → Т-баллы → уровни → достоверность.
 * Без обращения к DOM, поэтому проверяется тестами в Node. Всё, чем тесты отличаются, берётся из QuestionnaireDef.
 */
import type { Answer, Level, MaybeAnswer, Profile, QuestionnaireDef } from "./types";

export interface QuestionKey {
  scale: string;
  answer: Answer;
}

const keysCache = new WeakMap<QuestionnaireDef, QuestionKey[][]>();

/** Для каждого вопроса (индекс с 0): в какие шкалы и каким ответом он засчитывается, в порядке шкал теста. */
export function questionKeys(def: QuestionnaireDef): QuestionKey[][] {
  let keys = keysCache.get(def);
  if (keys) return keys;
  keys = def.questions.map(() => []);
  for (const scale of def.scaleOrder) {
    for (const n of def.key[scale].yes) keys[n - 1].push({ scale, answer: "Y" });
    for (const n of def.key[scale].no) keys[n - 1].push({ scale, answer: "N" });
  }
  const order = def.scaleOrder;
  for (const list of keys) list.sort((a, b) => order.indexOf(a.scale) - order.indexOf(b.scale));
  keysCache.set(def, keys);
  return keys;
}

const isAnswer = (v: unknown): v is Answer => v === "Y" || v === "N" || v === "?";

/** Ответы ровно по числу вопросов; всё непонятное (из старого сохранения) — «нет ответа». */
export function normalizeAnswers(def: QuestionnaireDef, answers: readonly unknown[] | null | undefined): MaybeAnswer[] {
  return def.questions.map((_, i) => {
    const a = answers ? answers[i] : null;
    return isAnswer(a) ? a : null;
  });
}

export function levelOf(def: QuestionnaireDef, t: number): Level {
  if (t >= def.thresholds.high) return "high";
  if (t <= def.thresholds.low) return "low";
  return "norm";
}

/** Полный расчёт профиля. */
export function computeProfile(def: QuestionnaireDef, answers: readonly unknown[] | null | undefined): Profile {
  const a = normalizeAnswers(def, answers);
  const raw: Record<string, number> = {};
  for (const scale of def.scaleOrder) {
    let n = 0;
    for (const q of def.key[scale].yes) if (a[q - 1] === "Y") n++;
    for (const q of def.key[scale].no) if (a[q - 1] === "N") n++;
    raw[scale] = n;
  }
  const dontKnow = a.filter((v) => v === "?").length;
  const answered = a.filter((v) => v !== null).length;
  const control = def.controlItems ?? [];
  const controlCorrect = control.filter((q) => a[q - 1] === "?").length;

  const kAdd = def.kCorrection(raw.K ?? 0);
  const corrected: Record<string, number> = {};
  const t: Record<string, number> = {};
  const extrapolated: Record<string, boolean> = {};
  const level: Record<string, Level> = {};
  for (const s of def.scaleOrder) {
    corrected[s] = raw[s] + (kAdd[s] || 0);
    const r = def.tScore(s, corrected[s]);
    t[s] = r.t;
    extrapolated[s] = r.extrapolated;
    level[s] = levelOf(def, r.t);
  }
  return {
    raw, kAdd, corrected, t, extrapolated, level, dontKnow, answered,
    controlCorrect, controlTotal: control.length, validity: def.validity({ raw, t })
  };
}

/** Какие шкалы изменились между двумя расчётами (сырой, с поправкой или Т-балл). */
export function changedScales(def: QuestionnaireDef, before: Profile, after: Profile): string[] {
  return def.scaleOrder.filter((s) => {
    const tChanged = Math.abs(before.t[s] - after.t[s]) > 1e-9;
    return before.raw[s] !== after.raw[s] || before.corrected[s] !== after.corrected[s] || tChanged;
  });
}

export type CellState = "empty" | "first" | "changed" | "dk" | "dkAfter";

/*
 * Состояние клетки регистрационного листа по истории кликов (history — значения после каждого клика).
 * empty — нет ответа; first — Да/Нет с первого раза; changed — ответ менялся;
 * dk — «Не знаю»; dkAfter — сначала Да/Нет, затем «Не знаю».
 */
export function cellState(history: readonly MaybeAnswer[] | undefined, current: MaybeAnswer | undefined): CellState {
  const given = (history || []).filter((v) => v !== null);
  if (current === null || current === undefined) return "empty";
  if (current === "?") return given.some((v) => v === "Y" || v === "N") ? "dkAfter" : "dk";
  return given.some((v) => v !== current) ? "changed" : "first";
}

// ---------- кирпичики для описаний тестов ----------

/**
 * Поправка K как доля сырого K с округлением «половина вверх» и точечными исключениями
 * (overrides: сырой K → { шкала: прибавка }).
 */
export function kCorrectionByFactors(
  factors: Record<string, number>,
  overrides: Record<string, Record<string, number>> = {}
): (k: number) => Record<string, number> {
  return (k) => {
    const over = overrides[String(k)] || {};
    const add: Record<string, number> = {};
    for (const s of Object.keys(factors)) add[s] = s in over ? over[s] : Math.floor(factors[s] * k + 0.5 + 1e-9);
    return add;
  };
}

/** T = 50 + 10 · (X − M) / SD без округления. */
export const tFormula = (x: number, m: number, sd: number): number => 50 + (10 * (x - m)) / sd;

/**
 * Правило достоверности «значение шкалы больше предела — недостоверно».
 * by: что сравнивать — сырые баллы или Т.
 */
export function validityByLimits(
  limits: Record<string, number>,
  reasons: Record<string, string>,
  by: "raw" | "t"
): QuestionnaireDef["validity"] {
  const unit = by === "t" ? "Т" : "";
  return (scores) => {
    const values = scores[by];
    const checks = Object.keys(limits).map((scale) => {
      const value = values[scale];
      const exceeded = value > limits[scale];
      return { scale, value, unit, limit: limits[scale], exceeded, reason: exceeded ? reasons[scale] : null };
    });
    return { valid: checks.every((c) => !c.exceeded), checks };
  };
}
