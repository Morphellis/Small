import type { Variant } from "./flow";

/** Описание теста Люшера: какой вариант и где хранить прохождение. */
export interface LuscherDef {
  id: string;
  /** Название в текстах: «Восьмицветовой тест Люшера». */
  title: string;
  /** Ключ в localStorage. Не менять: иначе у людей пропадёт сохранённое прохождение. */
  storageKey: string;
  variant: Variant;
}
