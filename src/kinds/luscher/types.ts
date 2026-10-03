import type { Pick, Variant } from "./flow";

/** Описание теста Люшера: какой вариант и где хранить прохождение. */
export interface LuscherDef {
  id: string;
  /** Название в текстах: «Восьмицветовой тест Люшера». */
  title: string;
  /** Ключ в localStorage. Не менять: иначе у людей пропадёт сохранённое прохождение. */
  storageKey: string;
  variant: Variant;
}

// ---------- обмен с сервером (server/api.ts) ----------

/** POST api/luscher/<variant>/score — журнал выборов; сервер сам проверяет, что он ложится на шаги. */
export interface LuscherScoreRequest {
  log: Pick[];
}

/** Восьмицветовой ряд и его разметка. */
export interface OrderScore {
  /** Цвета в порядке предпочтения, например "70615243". */
  order: string;
  /** Восклицательные знаки тревожности по местам (0–3). */
  marks: number[];
  anxiety: number;
}

export interface LuscherResult {
  first: OrderScore | null;
  second: OrderScore | null;
  /** Итог по второму выбору (как у psytests), пока его нет — по первому. */
  main: null | {
    n: 1 | 2;
    anxiety: number;
    /** Совокупное отклонение от аутогенной нормы, 0–32. */
    deviation: number;
    /** Вегетативный коэффициент так, как его пишет psytests («0.3»). */
    vk: string;
    vkLabel: string;
  };
}
