/*
 * Модель прохождения опросника — без DOM, поэтому проверяется тестами (tests/questionnaire/model.test.ts):
 * ответы и история кликов, что изменил последний ответ, настройки экрана, сохранение и загрузка.
 * Экран (view/) только показывает то, что здесь посчитано.
 */
import { changedScales, computeProfile, normalizeAnswers, type QuestionKey } from "./engine";
import type { Answer, MaybeAnswer, Profile, QuestionnaireDef } from "./types";

/** Ответы и история: history[i] — значения после каждого клика по вопросу i (для регистрационного листа). */
export interface Session {
  answers: MaybeAnswer[];
  history: MaybeAnswer[][];
}

/** Что сделал последний ответ. */
export interface LastAnswer {
  q: number;
  /** Изменившиеся шкалы из focus. */
  changed: string[];
  /** Все изменившиеся шкалы. */
  changedAll: string[];
  before: Profile;
  after: Profile;
}

export type ProfileView = "table" | "bars" | "chart";

/** Настройки экрана, которые запоминаются. */
export interface Prefs {
  keyMode: boolean;
  /** Боковая колонка (на узком экране — шторка снизу). */
  showProfile: boolean;
  profileView: ProfileView;
  /** Полоска шкал целиком; иначе — отслеживаемые шкалы и только что изменившиеся. */
  stripAll: boolean;
}

/** Что лежит в localStorage. Формат прежний: иначе у людей пропадут сохранённые ответы. */
export interface Saved {
  answers?: unknown[];
  history?: unknown[];
  keyMode?: boolean;
  showProfile?: boolean;
  /** На каком экране (широком или узком) выбрано showProfile. */
  showProfileWide?: boolean;
  profileView?: string;
  viewV?: number;
  stripAll?: boolean;
}

export const isAnswer = (v: unknown): v is Answer => v === "Y" || v === "N" || v === "?";

export function emptySession(def: QuestionnaireDef): Session {
  const n = def.questions.length;
  return { answers: new Array<MaybeAnswer>(n).fill(null), history: Array.from({ length: n }, () => []) };
}

/** Настройки по умолчанию: на широком экране профиль рядом с вопросами, на узком свёрнут. */
export const defaultPrefs = (wide: boolean): Prefs => ({ keyMode: false, showProfile: wide, profileView: "table", stripAll: false });

/** Загрузка сохранённого: всё непонятное (старые версии, ручные правки) отбрасывается. */
export function loadSaved(def: QuestionnaireDef, saved: Saved | null, wide: boolean): { session: Session; prefs: Prefs } {
  const session = emptySession(def);
  const prefs = defaultPrefs(wide);
  if (!saved || typeof saved !== "object") return { session, prefs };
  session.answers = normalizeAnswers(def, Array.isArray(saved.answers) ? saved.answers : null);
  session.history = session.answers.map((a, i) => {
    const raw = Array.isArray(saved.history) && Array.isArray(saved.history[i]) ? (saved.history[i] as unknown[]) : [];
    const h = raw.filter((v): v is MaybeAnswer => v === null || isAnswer(v));
    // История без текущего ответа (например, из старого сохранения) — дополнить.
    if (a !== null && h[h.length - 1] !== a) h.push(a);
    return h;
  });
  if (typeof saved.keyMode === "boolean") prefs.keyMode = saved.keyMode;
  if (typeof saved.stripAll === "boolean") prefs.stripAll = saved.stripAll;
  // Выбор «показывать профиль» относится к экрану той же ширины, на котором его сделали.
  if (typeof saved.showProfile === "boolean" && wide === (saved.showProfileWide !== false)) prefs.showProfile = saved.showProfile;
  if (saved.viewV === 2 && (saved.profileView === "bars" || saved.profileView === "chart" || saved.profileView === "table")) {
    prefs.profileView = saved.profileView;
  }
  return { session, prefs };
}

export function toSaved(session: Session, prefs: Prefs, wide: boolean): Saved {
  return {
    answers: session.answers, history: session.history,
    keyMode: prefs.keyMode, showProfile: prefs.showProfile, showProfileWide: wide, profileView: prefs.profileView, viewV: 2,
    stripAll: prefs.stripAll
  };
}

/**
 * Ответить на вопрос i. Повторный клик по тому же ответу снимает его. Меняет session на месте и возвращает,
 * что изменилось (before — профиль до ответа: он уже есть у экрана, пересчитывать не нужно).
 */
export function applyAnswer(
  def: QuestionnaireDef, session: Session, before: Profile, i: number, value: Answer, focus: ReadonlySet<string>
): LastAnswer {
  const next = session.answers[i] === value ? null : value;
  session.answers[i] = next;
  session.history[i].push(next);
  const after = computeProfile(def, session.answers);
  const changedAll = changedScales(def, before, after);
  return { q: i, changed: changedAll.filter((s) => focus.has(s)), changedAll, before, after };
}

/** Куда засчитывается ответ a на вопрос (только шкалы из focus) и какой ответ дал бы баллы вместо него. */
export function answerEffect(keys: readonly QuestionKey[], focus: ReadonlySet<string>, a: Answer) {
  const tracked = keys.filter((k) => focus.has(k.scale));
  return {
    mine: tracked.filter((k) => k.answer === a).map((k) => k.scale),
    other: tracked.filter((k) => k.answer !== a).map((k) => k.scale),
    alt: (a === "Y" ? "N" : "Y") as Answer
  };
}
