/*
 * Модель прохождения теста Люшера — без DOM (проверяется в tests/luscher.test.ts): журнал выборов,
 * запомненные раскладки карточек, загрузка сохранённого и всё, что из журнала выводится для экрана.
 */
import { currentStep, picksByStep, rankOrder, shuffledColors, steps, type Pick, type Step, type Variant } from "./flow";

export interface Session {
  log: Pick[];
  /** Раскладка восьми цветов на шагах выбора (случайная, запоминается, чтобы не прыгала при перезагрузке). */
  layouts: Record<string, number[]>;
  keyMode: boolean;
}

/** Что лежит в localStorage. */
export interface Saved {
  log?: unknown;
  layouts?: unknown;
  keyMode?: unknown;
}

export const emptySession = (keyMode = false): Session => ({ log: [], layouts: {}, keyMode });

/** Оставить из журнала только то, что ложится на шаги по порядку (журнал старой версии мог не подойти). */
export function replayValid(variant: Variant, log: readonly Pick[]): Pick[] {
  const ok: Pick[] = [];
  for (const p of log) {
    const s = currentStep(variant, ok);
    if (!s || s.id !== p.step) break;
    ok.push(p);
  }
  return ok;
}

const isPick = (p: unknown): p is Pick =>
  !!p && typeof p === "object" && typeof (p as Pick).step === "string" && Number.isInteger((p as Pick).value);

const isLayout = (a: unknown): a is number[] =>
  Array.isArray(a) && a.length === 8 && [...a].sort().join("") === "01234567";

export function loadSaved(variant: Variant, saved: Saved | null): Session {
  if (!saved || typeof saved !== "object") return emptySession();
  const layouts: Record<string, number[]> = {};
  if (saved.layouts && typeof saved.layouts === "object") {
    for (const [k, v] of Object.entries(saved.layouts)) if (isLayout(v)) layouts[k] = v;
  }
  return {
    log: replayValid(variant, Array.isArray(saved.log) ? saved.log.filter(isPick) : []),
    layouts,
    keyMode: saved.keyMode === true
  };
}

export const toSaved = (s: Session): Saved => ({ log: s.log, layouts: s.layouts, keyMode: s.keyMode });

/** Раскладка карточек шага: запомненная или новая случайная. */
export function layoutFor(s: Session, step: Step, random?: () => number): number[] {
  return (s.layouts[step.id] ??= shuffledColors(random));
}

/** Всё, что экран показывает, одним расчётом из журнала. */
export interface Derived {
  steps: Step[];
  /** Текущий шаг; null — тест пройден. */
  step: Step | null;
  /** Номер текущего шага (с 1). */
  stepNo: number;
  picks: Record<string, number[]>;
  /** Сколько выборов уже сделано на текущем шаге. */
  k: number;
  first: string | null;
  second: string | null;
  /** Раскладка для итога: второй выбор (как у psytests), пока его нет — первый. */
  main: { order: string; n: 1 | 2 } | null;
}

export function derive(variant: Variant, log: readonly Pick[]): Derived {
  const list = steps(variant, log);
  const picks = picksByStep(log);
  const step = currentStep(variant, log);
  const first = rankOrder(variant, picks.rank1 ?? []);
  const second = rankOrder(variant, picks.rank2 ?? []);
  return {
    steps: list,
    step,
    stepNo: step ? list.findIndex((s) => s.id === step.id) + 1 : list.length,
    picks,
    k: step ? (picks[step.id]?.length ?? 0) : 0,
    first,
    second,
    main: second ? { order: second, n: 2 } : first ? { order: first, n: 1 } : null
  };
}
