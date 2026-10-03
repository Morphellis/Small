/*
 * Результат теста Люшера по журналу выборов — то, что сервер отдаёт браузеру.
 */
import { picksByStep, rankOrder, type Pick, type Variant } from "../../src/kinds/luscher/flow";
import { replayValid } from "../../src/kinds/luscher/model";
import type { LuscherResult, OrderScore } from "../../src/kinds/luscher/types";
import { anxiety, anxietyMarks, deviation, vegetative, vegetativeBand, vegetativeText } from "./scoring";

const orderScore = (order: string | null): OrderScore | null =>
  order ? { order, marks: anxietyMarks(order), anxiety: anxiety(order) } : null;

/**
 * Посчитать результат. Журнал проверяется: лишнее и не ложащееся на шаги по порядку отбрасывается,
 * поэтому подделанный запрос не сломает подсчёт.
 */
export function scoreLuscher(variant: Variant, log: readonly Pick[]): LuscherResult {
  const picks = picksByStep(replayValid(variant, log));
  const first = orderScore(rankOrder(variant, picks.rank1 ?? []));
  const second = orderScore(rankOrder(variant, picks.rank2 ?? []));
  const main = second ?? first;
  return {
    first,
    second,
    main: main && {
      n: second ? 2 : 1,
      anxiety: main.anxiety,
      deviation: deviation(main.order),
      vk: vegetativeText(main.order),
      vkLabel: vegetativeBand(vegetative(main.order)).label
    }
  };
}
