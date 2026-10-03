/*
 * Ответы опросника и сравнение профилей — общее для браузера и сервера, без секретов и без DOM.
 */
import type { Answer, MaybeAnswer, Profile, QuestionnaireSpec } from "./types";

export const isAnswer = (v: unknown): v is Answer => v === "Y" || v === "N" || v === "?";

/** Ответы ровно по числу вопросов; всё непонятное (из старого сохранения) — «нет ответа». */
export function normalizeAnswers(spec: Pick<QuestionnaireSpec, "questions">, answers: readonly unknown[] | null | undefined): MaybeAnswer[] {
  return spec.questions.map((_, i) => {
    const a = answers ? answers[i] : null;
    return isAnswer(a) ? a : null;
  });
}

/** Ответы одной строкой для запроса к серверу: Y, N, ? или «.» (нет ответа). */
export const encodeAnswers = (answers: readonly MaybeAnswer[]): string => answers.map((a) => a ?? ".").join("");

/** Строка ответов обратно в массив; null — строка не подходит к опроснику. */
export function decodeAnswers(spec: Pick<QuestionnaireSpec, "questions" | "allowDontKnow">, s: unknown): MaybeAnswer[] | null {
  if (typeof s !== "string" || s.length !== spec.questions.length) return null;
  const allowed = spec.allowDontKnow === false ? /^[YN.]*$/ : /^[YN?.]*$/;
  if (!allowed.test(s)) return null;
  return [...s].map((c) => (c === "." ? null : (c as Answer)));
}

/** Какие шкалы изменились между двумя расчётами (сырой, с поправкой или Т-балл). */
export function changedScales(spec: Pick<QuestionnaireSpec, "scaleOrder">, before: Profile, after: Profile): string[] {
  return spec.scaleOrder.filter((s) => {
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
